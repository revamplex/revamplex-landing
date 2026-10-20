import Stripe from 'stripe';
import { getStripeWebhookSecret } from '../lib/billing-config.js';

export const config = { api: { bodyParser: false } };
const supported = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'customer.subscription.updated', 'customer.subscription.deleted']);
const objectId = value => typeof value === 'string' ? value : value?.id;

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 1024 * 1024) throw new Error('payload_too_large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function createWebhookHandler({ env = process.env, fetcher = (...args) => fetch(...args), makeStripe = key => new Stripe(key, { timeout: 10000, maxNetworkRetries: 1 }) } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    const key = env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY_;
    const secret = getStripeWebhookSecret(env);
    if (!key || !secret) return res.status(503).json({ error: 'Billing webhook is not configured.' });
    const stripe = makeStripe(key);
    let event;
    try {
      event = stripe.webhooks.constructEvent(await rawBody(req), req.headers['stripe-signature'], secret);
    } catch {
      return res.status(400).json({ error: 'Invalid webhook signature or payload.' });
    }
    if (!supported.has(event.type)) return res.status(200).json({ received: true });

    try {
      const checkout = event.type.startsWith('checkout.session.');
      const source = event.data.object;
      if (checkout && (source.mode !== 'subscription' || !['paid', 'no_payment_required'].includes(source.payment_status))) {
        return res.status(200).json({ received: true });
      }
      const subscriptionId = checkout ? objectId(source.subscription) : source.id;
      const customerId = objectId(source.customer);
      if (!subscriptionId || !customerId) throw new Error('missing_subscription_identity');
      // Re-read Stripe state so delayed deliveries cannot restore an old status.
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (subscription.id !== subscriptionId || objectId(subscription.customer) !== customerId) throw new Error('subscription_identity_mismatch');
      const cancelled = ['canceled', 'incomplete_expired'].includes(subscription.status);
      const priceId = objectId(subscription.items?.data?.[0]?.price);
      const prices = {
        basic: env.STRIPE_PRICE_BASIC,
        pro: env.STRIPE_PRICE_PRO || env.STRIPE_PRICE_PRO_,
        elite: env.STRIPE_PRICE_ELITE || env.STRIPE_PRICE_ELITE_
      };
      const plan = cancelled ? 'none' : Object.keys(prices).find(name => prices[name] && prices[name] === priceId);
      if (!plan || !subscription.status) throw new Error('unknown_subscription_plan');
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('missing_database_configuration');
      const base = new URL('/rest/v1/profiles', env.SUPABASE_URL);
      const headers = {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json', 'Accept-Profile': 'public', 'Content-Profile': 'public'
      };
      const query = new URLSearchParams({ select: 'id,stripe_subscription_id', limit: '2' });
      if (checkout) {
        const email = source.customer_details?.email;
        if (typeof email !== 'string' || !email.trim()) throw new Error('missing_checkout_email');
        query.set('email', `eq.${email.trim()}`);
      } else query.set('stripe_customer_id', `eq.${customerId}`);
      const found = await fetcher(`${base}?${query}`, { headers, signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!found.ok) throw new Error('profile_lookup_failed');
      const profiles = await found.json();
      if (!Array.isArray(profiles) || profiles.length !== 1) throw new Error('profile_match_failed');
      const profile = profiles[0];
      if (profile.stripe_subscription_id && profile.stripe_subscription_id !== subscriptionId) {
        // A canceled/replaced subscription cannot change a newer paid account.
        if (!checkout) return res.status(200).json({ received: true });
        const existing = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
        if (!(subscription.created > existing.created)) return res.status(200).json({ received: true });
      }
      const updateQuery = new URLSearchParams({
        id: `eq.${profile.id}`,
        stripe_subscription_id: profile.stripe_subscription_id ? `eq.${profile.stripe_subscription_id}` : 'is.null',
        select: 'id'
      });
      const updated = await fetcher(`${base}?${updateQuery}`, {
        method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ subscription_status: cancelled ? 'cancelled' : subscription.status, plan,
          stripe_customer_id: customerId, stripe_subscription_id: subscriptionId }),
        signal: AbortSignal.timeout(10000), redirect: 'error'
      });
      if (!updated.ok) throw new Error('profile_update_failed');
      const rows = await updated.json();
      if (!Array.isArray(rows) || rows.length !== 1) throw new Error('profile_update_conflict');
      return res.status(200).json({ received: true });
    } catch {
      console.error('Billing webhook processing failed', { eventId: event.id, type: event.type });
      return res.status(500).json({ error: 'Subscription update could not be saved. Please retry this event.' });
    }
  };
}

export default createWebhookHandler();

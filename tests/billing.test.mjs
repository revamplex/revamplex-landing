import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import Stripe from 'stripe';
import webhook, { createWebhookHandler } from '../api/stripe-webhook.js';
import '../assets/service-config.js';

const env = { STRIPE_SECRET_KEY_: 'sk_test_local_fixture', STRIPE_WEBHOOK_SECRET_: 'whsec_local_fixture_only_1234',
  STRIPE_PRICE_BASIC: 'price_basic', STRIPE_PRICE_PRO_: 'price_pro', STRIPE_PRICE_ELITE_: 'price_elite',
  SUPABASE_URL: 'https://billing-fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'local-fixture-only' };
const verifier = new Stripe(env.STRIPE_SECRET_KEY_);
const subscription = { id: 'sub_fixture', customer: 'cus_fixture', created: 100, status: 'active', items: { data: [{ price: { id: 'price_elite' } }] } };
const checkout = { mode: 'subscription', payment_status: 'paid', subscription: 'sub_fixture', customer: 'cus_fixture', customer_details: { email: 'fixture@example.invalid' }, metadata: { plan: 'basic' } };
const event = (type, object = checkout) => ({ id: 'evt_local_fixture', type, data: { object } });
function response() { return { code: 200, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
async function call(input, options = {}) {
  const payload = JSON.stringify(input);
  const request = Readable.from([Buffer.from(options.tamper ? payload + ' ' : payload)]);
  request.method = options.method || 'POST';
  request.headers = { 'stripe-signature': verifier.webhooks.generateTestHeaderString({ payload, secret: options.signingSecret || env.STRIPE_WEBHOOK_SECRET_ }) };
  const calls = [], reads = [];
  const handler = createWebhookHandler({ env: options.env || env,
    makeStripe: key => { assert.equal(key, env.STRIPE_SECRET_KEY_); return { webhooks: verifier.webhooks, subscriptions: { retrieve: async id => {
      reads.push(id); return id === 'sub_newer' ? { ...subscription, id, created: 200 } : { ...subscription, ...options.subscription };
    } } }; },
    fetcher: async (url, config) => {
      calls.push({ url: new URL(url), ...config });
      assert.equal(new URL(url).origin, env.SUPABASE_URL);
      assert.equal(config.headers.Authorization, 'Bearer local-fixture-only');
      const patch = config.method === 'PATCH';
      return { ok: patch ? !options.writeFailure : !options.lookupFailure, json: async () => patch ? (options.conflict ? [] : [{ id: 'profile_fixture' }]) : (options.profiles || [{ id: 'profile_fixture', stripe_subscription_id: options.linkedSubscription ?? null }]) };
    }
  });
  const res = response(), log = console.error;
  console.error = () => {};
  try { await handler(request, res); } finally { console.error = log; }
  return { ...res, calls, reads };
}
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }

await check('Billing webhook loads without credentials and rejects unsupported methods', async () => {
  const res = response(); await webhook({ method: 'GET' }, res); assert.equal(res.code, 405); assert.equal(res.headers.Allow, 'POST');
});
await check('Existing checkout and billing portal routes load with the pinned Stripe SDK', async () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY_;
  try {
    for (const path of ['../api/create-checkout-session.js', '../api/create-billing-portal-session.js']) {
      const { default: handler } = await import(path);
      const res = response(); await handler({ method: 'GET' }, res); assert.equal(res.code, 405);
    }
  } finally { if (saved === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = saved; }
});
await check('Missing webhook configuration cannot process events', async () => {
  const result = await call(event('checkout.session.completed'), { env: {} }); assert.equal(result.code, 503); assert.equal(result.calls.length, 0);
});
await check('A malformed primary setting uses the valid trimmed legacy signing secret', async () => {
  const result = await call(event('customer.created'), { env: { ...env, STRIPE_WEBHOOK_SECRET: 'invalid-setting', STRIPE_WEBHOOK_SECRET_: `  ${env.STRIPE_WEBHOOK_SECRET_}\n` } });
  assert.equal(result.code, 200); assert.equal(result.calls.length, 0);
});
await check('A valid primary signing secret takes precedence over the legacy setting', async () => {
  const primary = 'whsec_primary_fixture_only_5678';
  const config = { ...env, STRIPE_WEBHOOK_SECRET: ` ${primary} ` };
  const accepted = await call(event('customer.created'), { env: config, signingSecret: primary });
  const rejected = await call(event('customer.created'), { env: config });
  assert.equal(accepted.code, 200); assert.equal(rejected.code, 400);
  assert.equal(rejected.reads.length, 0); assert.equal(rejected.calls.length, 0);
});
await check('Two malformed signing settings cannot process events', async () => {
  const result = await call(event('checkout.session.completed'), { env: { ...env, STRIPE_WEBHOOK_SECRET: 'invalid-primary', STRIPE_WEBHOOK_SECRET_: 'whsec_short' } });
  assert.equal(result.code, 503); assert.equal(result.reads.length, 0); assert.equal(result.calls.length, 0);
});
await check('The deployment gate accepts the same valid fallback and rejects malformed secrets', async () => {
  const config = { ...env, STRIPE_SECRET_KEY_: 'sk_test_local_fixture_only_1234', STRIPE_WEBHOOK_SECRET: 'invalid-primary',
    SUPABASE_URL: globalThis.REVAMP_CONFIG.url, OPENAI_API_KEY: 'local-fixture-only',
    ZAPIER_NOTIFICATION_WEBHOOK: 'https://hooks.zapier.com/hooks/catch/local-fixture/never-called/' };
  for (const valid of [true, false]) {
    const result = spawnSync(process.execPath, [new URL('../scripts/verify-deployment-config.mjs', import.meta.url).pathname], {
      env: { ...config, STRIPE_WEBHOOK_SECRET_: valid ? ` ${env.STRIPE_WEBHOOK_SECRET_} ` : 'invalid-legacy' }, encoding: 'utf8'
    });
    assert.equal(result.status, valid ? 0 : 1);
    assert.ok(result.stdout.includes(`"billingSigningSecretFormat":${valid}`));
    assert.ok(!result.stdout.includes(env.STRIPE_WEBHOOK_SECRET_));
  }
});
await check('Modified signed bodies cannot update billing data', async () => {
  const result = await call(event('checkout.session.completed'), { tamper: true }); assert.equal(result.code, 400); assert.equal(result.reads.length, 0); assert.equal(result.calls.length, 0);
});
await check('Unrelated events and pending payments do not activate subscriptions', async () => {
  for (const input of [event('customer.created'), event('checkout.session.completed', { ...checkout, payment_status: 'unpaid' })]) {
    const result = await call(input); assert.equal(result.code, 200); assert.equal(result.calls.length, 0); assert.equal(result.reads.length, 0);
  }
});
await check('Paid checkout uses the actual Stripe price and existing underscore settings', async () => {
  const result = await call(event('checkout.session.completed')); assert.equal(result.code, 200); assert.equal(result.calls.length, 2);
  assert.equal(result.calls[0].url.searchParams.get('email'), 'eq.fixture@example.invalid');
  const write = result.calls[1]; assert.equal(write.url.searchParams.get('id'), 'eq.profile_fixture');
  assert.equal(write.url.searchParams.get('stripe_subscription_id'), 'is.null');
  assert.deepEqual(JSON.parse(write.body), { subscription_status: 'active', plan: 'elite', stripe_customer_id: 'cus_fixture', stripe_subscription_id: 'sub_fixture' });
});
await check('Delayed successful payments can activate the paid subscription', async () => {
  const result = await call(event('checkout.session.async_payment_succeeded')); assert.equal(result.code, 200); assert.equal(result.calls.length, 2);
});
await check('Subscription updates use current Stripe status instead of a stale event', async () => {
  const result = await call(event('customer.subscription.updated', subscription), { linkedSubscription: 'sub_fixture', subscription: { status: 'past_due', items: { data: [{ price: { id: 'price_pro' } }] } } });
  assert.equal(result.code, 200); assert.equal(result.calls[0].url.searchParams.get('stripe_customer_id'), 'eq.cus_fixture');
  assert.equal(JSON.parse(result.calls[1].body).subscription_status, 'past_due'); assert.equal(JSON.parse(result.calls[1].body).plan, 'pro');
});
await check('Cancellation clears the matching subscription without touching a replacement', async () => {
  const result = await call(event('customer.subscription.deleted', subscription), { linkedSubscription: 'sub_fixture', subscription: { status: 'canceled' } });
  assert.equal(result.code, 200); assert.equal(JSON.parse(result.calls[1].body).plan, 'none');
  const replaced = await call(event('customer.subscription.deleted', subscription), { linkedSubscription: 'sub_newer', subscription: { status: 'canceled' } });
  assert.equal(replaced.code, 200); assert.equal(replaced.calls.length, 1);
});
await check('An older checkout replay cannot overwrite a newer subscription', async () => {
  const result = await call(event('checkout.session.completed'), { linkedSubscription: 'sub_newer' }); assert.equal(result.code, 200); assert.equal(result.calls.length, 1);
});
await check('Mismatched customers and unknown prices cannot activate an account', async () => {
  for (const current of [{ customer: 'cus_other' }, { items: { data: [{ price: { id: 'price_unknown' } }] } }]) {
    const result = await call(event('checkout.session.completed'), { subscription: current }); assert.equal(result.code, 500); assert.equal(result.calls.length, 0);
  }
});
await check('Missing or ambiguous profiles and failed writes remain retryable failures', async () => {
  for (const options of [{ profiles: [] }, { profiles: [{ id: 'one' }, { id: 'two' }] }, { writeFailure: true }, { conflict: true }, { lookupFailure: true }]) {
    const result = await call(event('checkout.session.completed'), options); assert.equal(result.code, 500); assert.equal(result.body.received, undefined);
  }
});
await check('Duplicate deliveries keep the same saved subscription state', async () => {
  const first = await call(event('checkout.session.completed'), { linkedSubscription: 'sub_fixture' });
  const second = await call(event('checkout.session.completed'), { linkedSubscription: 'sub_fixture' });
  assert.equal(first.code, 200); assert.equal(second.code, 200); assert.equal(first.calls[1].body, second.calls[1].body);
});
console.log(passed + ' billing checks passed; no Stripe API calls, charges, or live profile changes.');

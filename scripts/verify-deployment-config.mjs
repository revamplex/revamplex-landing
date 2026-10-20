// Validate required configuration without printing any credential or calling a webhook.
import '../assets/service-config.js';
const env = process.env;
let notificationWebhookFormat = false;
try {
  const hook = new URL(env.ZAPIER_NOTIFICATION_WEBHOOK || '');
  notificationWebhookFormat = hook.protocol === 'https:' && hook.hostname === 'hooks.zapier.com'
    && /^\/hooks\/catch\/[^/]+\/[^/]+\/?$/.test(hook.pathname)
    && !hook.username && !hook.password && !hook.search && !hook.hash && !hook.port;
} catch { /* Report the failed check below without exposing its value. */ }
const signingSecret = env.STRIPE_WEBHOOK_SECRET || env.STRIPE_WEBHOOK_SECRET_ || '';
const billingKey = env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY_ || '';
const checks = {
  notificationWebhookFormat,
  billingSigningSecretFormat: /^whsec_\S{16,}$/.test(signingSecret.trim()),
  billingApiKeyFormat: /^(?:sk|rk)_(?:live|test)_\S{16,}$/.test(billingKey.trim()),
  supabaseUrlMatchesSite: (env.SUPABASE_URL || '').replace(/\/+$/, '') === globalThis.REVAMP_CONFIG.url,
  supabaseServerKeyPresent: !!env.SUPABASE_SERVICE_ROLE_KEY,
  aiKeyPresent: !!env.OPENAI_API_KEY
};
console.log('REVAMPLEX_CONFIGURATION_CHECK', JSON.stringify(checks));
if (Object.values(checks).some(passed => !passed)) {
  console.error('Required site configuration failed validation. No secrets were printed and no notifications were sent.');
  process.exitCode = 1;
}

// Keep deployment validation and webhook verification on the same credential.
export function getStripeWebhookSecret(env) {
  for (const value of [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_WEBHOOK_SECRET_]) {
    const secret = typeof value === 'string' ? value.trim() : '';
    if (/^whsec_\S{16,}$/.test(secret)) return secret;
  }
  return '';
}

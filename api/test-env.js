export default function handler(req, res) {
  return res.status(200).json({
    hasStripeSecretKey: !!process.env.STRIPE_SECRET_KEY,
    hasStripeSecretKeyUnderscore: !!process.env.STRIPE_SECRET_KEY_,
    stripeSecretKeyStartsWith: process.env.STRIPE_SECRET_KEY
      ? process.env.STRIPE_SECRET_KEY.slice(0, 7)
      : null
  });
}

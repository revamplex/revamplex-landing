import Stripe from "stripe";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const stripeSecretKey =
      process.env.STRIPE_SECRET_KEY ||
      process.env.STRIPE_SECRET_KEY_;

    if (!stripeSecretKey) {
      return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY in Vercel" });
    }

    const stripe = new Stripe(stripeSecretKey);

    const { plan } = req.body || {};

    const priceIds = {
      basic: process.env.STRIPE_PRICE_BASIC,
      pro: process.env.STRIPE_PRICE_PRO || process.env.STRIPE_PRICE_PRO_,
      elite: process.env.STRIPE_PRICE_ELITE || process.env.STRIPE_PRICE_ELITE_
    };

    const priceId = priceIds[plan];

    if (!priceId) {
      return res.status(400).json({
        error: "Missing Stripe price ID for plan: " + plan
      });
    }

    const origin = req.headers.origin || "https://revamplex.com";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: `${origin}/dashboard.html?checkout=success&plan=${encodeURIComponent(plan)}`,
      cancel_url: `${origin}/dashboard.html?checkout=cancelled`,
      metadata: {
        plan
      }
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error("CHECKOUT SESSION ERROR:", err);
    return res.status(500).json({
      error: err.message || "Checkout function crashed"
    });
  }
}

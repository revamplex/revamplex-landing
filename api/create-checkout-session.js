import Stripe from "stripe";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY in Vercel" });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const { plan, lookup_key } = req.body || {};

    if (!lookup_key) {
      return res.status(400).json({ error: "Missing lookup_key" });
    }

    const prices = await stripe.prices.list({
      lookup_keys: [lookup_key],
      expand: ["data.product"]
    });

    const price = prices.data[0];

    if (!price) {
      return res.status(404).json({
        error: "Stripe price not found: " + lookup_key
      });
    }

    const origin = req.headers.origin || "https://revamplex.com";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: price.id, quantity: 1 }],
      success_url: `${origin}/dashboard.html?checkout=success&plan=${encodeURIComponent(plan)}`,
      cancel_url: `${origin}/dashboard.html?checkout=cancelled`,
      metadata: {
        plan,
        lookup_key
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

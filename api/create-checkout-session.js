import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const { plan, lookup_key } = req.body || {};

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing login token" });
    }

    if (!lookup_key) {
      return res.status(400).json({ error: "Missing Stripe lookup key" });
    }

    const prices = await stripe.prices.list({
      lookup_keys: [lookup_key],
      expand: ["data.product"]
    });

    const price = prices.data[0];

    if (!price) {
      return res.status(404).json({
        error: "Stripe price not found for lookup key: " + lookup_key
      });
    }

    const origin = req.headers.origin || "https://revamplex.com";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: price.id,
          quantity: 1
        }
      ],
      success_url: `${origin}/dashboard.html?checkout=success&plan=${encodeURIComponent(plan)}`,
      cancel_url: `${origin}/dashboard.html?checkout=cancelled`,
      metadata: {
        plan: plan || "",
        lookup_key
      }
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error("STRIPE CHECKOUT ERROR:", err);
    return res.status(500).json({
      error: err.message || "Stripe checkout failed"
    });
  }
}

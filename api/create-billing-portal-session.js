import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: "Missing Stripe customer ID" });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: "https://revamplex.com/dashboard.html",
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Billing portal error:", err);
    return res.status(500).json({ error: err.message });
  }
}

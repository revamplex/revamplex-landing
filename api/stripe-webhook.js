import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_);

export default async function handler(req, res) {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET_
    );
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {

      const session = event.data.object;

      const plan = session.metadata.plan;
      const customerEmail = session.customer_details?.email;

      // 🔥 Update Supabase
      await fetch(process.env.SUPABASE_URL + "/rest/v1/profiles?email=eq." + customerEmail, {
        method: "PATCH",
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          subscription_status: "active",
          plan: plan
        })
      });
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.status(500).json({ error: err.message });
  }
}

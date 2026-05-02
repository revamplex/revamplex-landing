import Stripe from "stripe";

export const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_);

async function getRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const sig = req.headers["stripe-signature"];
  const rawBody = await getRawBody(req);

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      (process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET_ || "").trim()
    );
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const plan = session.metadata?.plan || "basic";
      const customerEmail = session.customer_details?.email;

      if (!customerEmail) {
        return res.status(400).json({ error: "No customer email found" });
      }

      const updateRes = await fetch(
        process.env.SUPABASE_URL + "/rest/v1/profiles?email=eq." + encodeURIComponent(customerEmail),
        {
          method: "PATCH",
          headers: {
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
  "Content-Type": "application/json",
  "Accept-Profile": "public",
  "Content-Profile": "public",
  Prefer: "return=representation"
},
          body: JSON.stringify({
            subscription_status: "active",
            subscription: plan,
            plan: plan,
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription
          })
        }
      );

      if (!updateRes.ok) {
        const text = await updateRes.text();
        console.error("Supabase update failed:", text);
        return res.status(500).json({ error: "Supabase update failed", details: text });
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.status(500).json({ error: err.message });
  }
}

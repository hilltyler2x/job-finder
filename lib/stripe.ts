import { createHmac, timingSafeEqual } from "node:crypto";

// A few Stripe API calls made with fetch, so the app needs no extra package.

async function stripe<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Payment setup failed.");
  return data as T;
}

const site = () => process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export function checkoutUrl(userId: string, email: string | null, customer: string | null) {
  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": process.env.STRIPE_PRICE_ID!,
    "line_items[0][quantity]": "1",
    client_reference_id: userId,
    "subscription_data[metadata][user_id]": userId,
    allow_promotion_codes: "true",
    success_url: `${site()}/dashboard?upgraded=1`,
    cancel_url: `${site()}/dashboard`,
  };
  if (customer) params.customer = customer;
  else if (email) params.customer_email = email;
  return stripe<{ url: string }>("checkout/sessions", params).then((s) => s.url);
}

export function portalUrl(customer: string) {
  return stripe<{ url: string }>("billing_portal/sessions", { customer, return_url: `${site()}/dashboard` }).then((s) => s.url);
}

// Checks the Stripe-Signature header so only Stripe can change someone's plan.
export function verifyWebhook(body: string, header: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return header
    .split(",")
    .filter((kv) => kv.startsWith("v1="))
    .some((kv) => {
      const sig = Buffer.from(kv.slice(3), "hex");
      return sig.length === 32 && timingSafeEqual(sig, Buffer.from(expected, "hex"));
    });
}

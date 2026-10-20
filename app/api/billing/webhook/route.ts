import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase";
import { verifyWebhook } from "@/lib/stripe";

type Sub = { id: string; customer: string; status: string; metadata?: { user_id?: string } };
type Session = { client_reference_id: string | null; customer: string; subscription: string };

// Stripe calls this when someone pays, renews, or cancels. It sets their plan.
export async function POST(req: Request) {
  const body = await req.text();
  if (!verifyWebhook(body, req.headers.get("stripe-signature"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }
  const event = JSON.parse(body) as { type: string; data: { object: unknown } };
  const db = adminClient();

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Session;
    if (s.client_reference_id) {
      await db
        .from("profiles")
        .update({ plan: "pro", stripe_customer_id: s.customer, stripe_subscription_id: s.subscription })
        .eq("id", s.client_reference_id);
    }
  } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Sub;
    const active = event.type === "customer.subscription.updated" && ["active", "trialing", "past_due"].includes(sub.status);
    const update = { plan: active ? "pro" : "free", stripe_customer_id: sub.customer, stripe_subscription_id: sub.id };
    if (sub.metadata?.user_id) await db.from("profiles").update(update).eq("id", sub.metadata.user_id);
    else await db.from("profiles").update(update).eq("stripe_customer_id", sub.customer);
  }
  return NextResponse.json({ received: true });
}

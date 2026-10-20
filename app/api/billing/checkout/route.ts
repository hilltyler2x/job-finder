import { route } from "@/lib/api";
import { billingOn } from "@/lib/plan";
import { checkoutUrl } from "@/lib/stripe";
import { getProfile } from "@/lib/work";

// Starts Stripe Checkout for the Pro plan and returns the page to send the user to.
export const POST = route(async (userId) => {
  if (!billingOn()) throw new Error("Payments aren't set up yet.");
  const p = await getProfile(userId);
  if (p.plan === "pro") throw new Error("You're already on Pro.");
  return { url: await checkoutUrl(userId, p.email, p.stripe_customer_id) };
});

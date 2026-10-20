import { route } from "@/lib/api";
import { portalUrl } from "@/lib/stripe";
import { getProfile } from "@/lib/work";

// Opens Stripe's page where people can update their card or cancel.
export const POST = route(async (userId) => {
  const p = await getProfile(userId);
  if (!p.stripe_customer_id) throw new Error("No billing account yet.");
  return { url: await portalUrl(p.stripe_customer_id) };
});

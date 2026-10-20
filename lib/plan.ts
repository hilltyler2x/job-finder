import type { Profile } from "./types";

// Free and Pro plans. Billing is off until the Stripe keys are set, and then everyone gets Pro
// features, so the app works before payments are set up.

export const billingOn = () => !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);

export const LIMITS = {
  free: { searchesPerDay: 1, docsPerMonth: 3, autoReply: false, dailyAutoSearch: false },
  pro: { searchesPerDay: 5, docsPerMonth: Infinity, autoReply: true, dailyAutoSearch: true },
};

export function limitsFor(p: Pick<Profile, "plan">) {
  return !billingOn() || p.plan === "pro" ? LIMITS.pro : LIMITS.free;
}

// Free accounts get the automatic search once a week, on Mondays (UTC), to keep AI costs down.
export function autoSearchToday(p: Pick<Profile, "plan">, now = new Date()) {
  return limitsFor(p).dailyAutoSearch || now.getUTCDay() === 1;
}

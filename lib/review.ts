"use client";

// Asks for an App Store / Google Play rating in the iPhone and Android apps, right
// after something good happens (documents saved, a job applied to, a reply sent,
// new matches found). Never at launch: the person has to have been in the app for a
// couple of minutes and had a few good moments first. On the website it does nothing.
//
// Apple and Google decide whether their rating box actually shows (Apple shows it at
// most 3 times a year), so asking more often than the caps below does nothing.

export type ReviewMoment = "docs-saved" | "applied" | "reply-sent" | "matches-found";

const KEY = "jf-review";
const DAY = 24 * 60 * 60 * 1000;
const MIN_WINS = 2; // good moments before the first ask
const MIN_DAYS_INSTALLED = 1; // days since the app was first opened
const MIN_SESSION_MS = 2 * 60 * 1000; // never in the first 2 minutes of a visit
const GAP_DAYS = 10; // days between asks
const MAX_ASKS = 6; // asks per year

type State = { firstOpen: number; wins: number; asks: number[]; rated: boolean };

const sessionStart = Date.now();

function read(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && typeof s.firstOpen === "number") return s;
  } catch {
    // Storage blocked or bad data: start fresh.
  }
  return { firstOpen: Date.now(), wins: 0, asks: [], rated: false };
}

function write(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not fatal: we just may ask again sooner.
  }
}

async function platform() {
  if (typeof window === "undefined") return "web";
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.getPlatform();
}

// Call once when the app starts, so "days since install" has a start date.
export async function noteAppOpen() {
  if ((await platform()) === "web") return;
  write(read());
}

// Call right after a good moment. Shows the store's rating box when the rules allow.
export async function reviewMoment(_moment: ReviewMoment) {
  if ((await platform()) === "web") return;
  const s = read();
  s.wins += 1;
  const now = Date.now();
  s.asks = s.asks.filter((t) => now - t < 365 * DAY);
  const ready =
    !s.rated &&
    s.wins >= MIN_WINS &&
    now - s.firstOpen >= MIN_DAYS_INSTALLED * DAY &&
    now - sessionStart >= MIN_SESSION_MS &&
    s.asks.length < MAX_ASKS &&
    (!s.asks.length || now - s.asks[s.asks.length - 1] >= GAP_DAYS * DAY);
  if (ready) s.asks.push(now);
  write(s);
  if (!ready) return;
  // Let the success message show first.
  await new Promise((r) => setTimeout(r, 1500));
  try {
    const { InAppReview } = await import("@capacitor-community/in-app-review");
    await InAppReview.requestReview();
  } catch {
    // The store said no this time; nothing to do.
  }
}

// The store page where people write a review. iPhone needs the App Store ID, which
// Apple gives once the app is created in App Store Connect.
export async function storeReviewUrl() {
  const p = await platform();
  if (p === "android") return "https://play.google.com/store/apps/details?id=com.hilltyler.jobfinder&showAllReviews=true";
  const id = process.env.NEXT_PUBLIC_APP_STORE_ID?.trim();
  if (p === "ios" && id) return `https://apps.apple.com/app/id${id}?action=write-review`;
  return "";
}

// Someone tapped "Rate Job Finder" themselves: stop the automatic asks.
export function markRated() {
  const s = read();
  s.rated = true;
  write(s);
}

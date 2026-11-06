"use client";

// Encouraging notifications in the iPhone and Android apps. They're scheduled on the
// phone itself (no push server): a kind word the morning after someone logs a
// rejection, and a few gentle nudges that only fire if the person stops opening the
// app. Every app open pushes the nudges further out, so active users rarely see them.
// We never ask for notification permission at launch, only after the person marks a
// job applied or not selected. On the website this does nothing.

import type { Job } from "./types";

const OFF_KEY = "jf-encourage-off";
const REJECTION_ID = 200;
const NUDGE_IDS = [101, 102, 103];
const NUDGE_DAYS = [2, 5, 9]; // days without opening the app

export type Counts = { applied: number; rejected: number; waiting: number };

export function countJobs(jobs: Job[]): Counts {
  return {
    applied: jobs.filter((j) => j.status === "applied" || j.status === "rejected").length,
    rejected: jobs.filter((j) => j.status === "rejected").length,
    waiting: jobs.filter((j) => j.status === "new").length,
  };
}

export function encouragementOn() {
  try {
    return localStorage.getItem(OFF_KEY) !== "1";
  } catch {
    return true;
  }
}

async function plugin() {
  if (typeof window === "undefined") return null;
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  return LocalNotifications;
}

// Asks once, right after a meaningful moment. Returns whether we may notify.
async function allowed(ask: boolean) {
  const ln = await plugin();
  if (!ln || !encouragementOn()) return false;
  let { display } = await ln.checkPermissions();
  if (display === "prompt" && ask) ({ display } = await ln.requestPermissions());
  return display === "granted";
}

function at(daysFromNow: number, hour: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function nudges(c: Counts) {
  const matches = c.waiting
    ? `You have ${plural(c.waiting, "new match")} waiting. One good fit is all it takes.`
    : "Fresh matches come in every day. One good fit is all it takes.";
  return [
    {
      title: "Keep going",
      body: c.applied
        ? `You've applied to ${plural(c.applied, "job")} so far. That takes real effort, and it adds up.`
        : matches,
    },
    {
      title: "Your next yes is out there",
      body: c.rejected
        ? "A no is part of every job search, not a verdict on you. Each application makes the next one stronger."
        : matches,
    },
    {
      title: "Small steps count",
      body: "Pick one match and tailor your resume to it today. Ten focused minutes is a real step forward.",
    },
  ];
}

// Call on every app open and whenever jobs change: reschedules the nudges so they
// only fire after days of not opening the app.
export async function refreshNudges(c: Counts) {
  const ln = await plugin();
  if (!ln) return;
  await ln.cancel({ notifications: NUDGE_IDS.map((id) => ({ id })) }).catch(() => {});
  if (!(await allowed(false))) return;
  const texts = nudges(c);
  await ln.schedule({
    notifications: NUDGE_IDS.map((id, i) => ({
      id,
      title: texts[i].title,
      body: texts[i].body,
      schedule: { at: at(NUDGE_DAYS[i], 18), allowWhileIdle: true },
    })),
  }).catch(() => {});
}

// Right after the person marks a job applied: ask for permission (once) and set up nudges.
export async function afterApplied(c: Counts) {
  if (await allowed(true)) await refreshNudges(c);
}

// The words shown in the app the moment someone logs a rejection.
export function rejectionMessage(company: string, c: Counts) {
  const from = company ? ` from ${company}` : "";
  const next = c.waiting ? ` You have ${plural(c.waiting, "new match")} ready when you are.` : "";
  return `That's a tough one, and it's okay to feel it. A no${from} doesn't decide your next yes.${next}`;
}

// After a rejection: a kind note the next morning at 10.
export async function afterRejected(company: string, c: Counts) {
  if (!(await allowed(true))) return;
  const ln = await plugin();
  if (!ln) return;
  await ln.schedule({
    notifications: [{
      id: REJECTION_ID,
      title: "New day, new chances",
      body: c.waiting
        ? `${company ? `${company} wasn't the one. ` : ""}${plural(c.waiting, "match")} ${c.waiting === 1 ? "is" : "are"} waiting for you, and every application you send makes the next one better.`
        : "Yesterday's no doesn't decide today. Your next match could come in any time, and you'll be ready for it.",
      schedule: { at: at(1, 10), allowWhileIdle: true },
    }],
  }).catch(() => {});
  await refreshNudges(c);
}

export async function setEncouragement(on: boolean, c: Counts) {
  try {
    if (on) localStorage.removeItem(OFF_KEY);
    else localStorage.setItem(OFF_KEY, "1");
  } catch {
    // Storage blocked: keep the current setting.
  }
  const ln = await plugin();
  if (!ln) return;
  if (on) await afterApplied(c);
  else await ln.cancel({ notifications: [...NUDGE_IDS, REJECTION_ID].map((id) => ({ id })) }).catch(() => {});
}

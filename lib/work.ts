import { adminClient } from "./supabase";
import { GmailNotConnected, getThread, searchThreadIds, sendEmail, sendReply, threadLink, type MailMessage } from "./google";
import { jobsFromAlertEmails, jobsFromWebSearch, readMessage, type FoundJob } from "./ai";
import type { Message, Profile } from "./types";
import { billingOn, limitsFor } from "./plan";

// The work behind each button, and the daily run. Every function takes the user's id and
// uses the admin client, so it also works from the daily cron job where no one is signed in.

const ALERT_SENDERS = [
  "jobalerts-noreply@linkedin.com",
  "jobs-noreply@linkedin.com",
  "alert@indeed.com",
  "donotreply@match.indeed.com",
  "noreply@glassdoor.com",
  "ziprecruiter.com",
];
const SITE_SENDERS = ["linkedin.com", "joinhandshake.com", "indeed.com"];
const MAX_AUTO_SENDS = 5;

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await adminClient().from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data as Profile;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function saveJobs(userId: string, jobs: FoundJob[], minScore: number) {
  const keep = jobs.filter((j) => j.url && j.score >= minScore);
  if (!keep.length) return 0;
  const rows = keep.map((j) => ({ ...j, user_id: userId, status: "new", checked_at: new Date().toISOString() }));
  const { data, error } = await adminClient()
    .from("jobs")
    .upsert(rows, { onConflict: "user_id,url", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

// Finds new jobs from job-alert emails and from the web. Returns how many were added.
export async function runSearch(userId: string, opts: { manual: boolean }) {
  const p = await getProfile(userId);
  const db = adminClient();
  const sameDay = p.search_day === today();
  const max = limitsFor(p).searchesPerDay;
  if (opts.manual && sameDay && p.searches_today >= max) {
    const more = billingOn() && p.plan !== "pro" ? " Upgrade to Pro for 5 searches a day." : "";
    throw new Error(`You've reached ${max} search${max > 1 ? "es" : ""} today. Try again tomorrow.${more}`);
  }

  const { data: existing } = await db.from("jobs").select("url").eq("user_id", userId);
  const skip = (existing ?? []).map((j) => j.url as string);

  let found: FoundJob[] = [];
  if (p.gmail_connected) try {
    const ids = await searchThreadIds(
      userId,
      `newer_than:3d (${ALERT_SENDERS.map((s) => `from:${s}`).join(" OR ")} OR from:joinhandshake.com subject:job)`,
      15,
    );
    const emails: MailMessage[] = [];
    for (const id of ids) emails.push(...(await getThread(userId, id)).slice(-1));
    found = await jobsFromAlertEmails(p, emails);
  } catch (e) {
    console.error("alert emails skipped", e);
  }
  found = found.concat(await jobsFromWebSearch(p, skip));
  const added = await saveJobs(userId, found, p.min_score);

  await db
    .from("profiles")
    .update({
      search_day: today(),
      searches_today: (sameDay ? p.searches_today : 0) + 1,
      last_search_at: new Date().toISOString(),
    })
    .eq("id", userId);
  return added;
}

const DEAD = /no longer (accepting|available)|job (has )?expired|posting (has )?(closed|expired)|position (has been )?filled|this job (was|has been) removed|job not found|page not found|closed to new applications/i;

// Removes saved jobs whose postings are gone. Pages that block checking are kept.
export async function recheckLinks(userId: string) {
  const db = adminClient();
  const { data } = await db.from("jobs").select("id,url").eq("user_id", userId).eq("status", "new");
  let removed = 0;
  for (const job of data ?? []) {
    try {
      const res = await fetch(job.url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 JobFinder link check" } });
      const gone = res.status === 404 || res.status === 410 || (res.ok && DEAD.test((await res.text()).slice(0, 400_000)));
      if (gone) {
        await db.from("jobs").delete().eq("id", job.id);
        removed++;
      } else {
        await db.from("jobs").update({ checked_at: new Date().toISOString() }).eq("id", job.id);
      }
    } catch {
      // Network error or blocked page: keep the job and try again tomorrow.
    }
  }
  return removed;
}

function siteOf(addr: string) {
  if (addr.includes("linkedin.com")) return "LinkedIn";
  if (addr.includes("joinhandshake.com")) return "Handshake";
  if (addr.includes("indeed.com")) return "Indeed";
  return "Email";
}

function canEmailBack(addr: string) {
  return !!addr && !/no-?reply|notifications?@|mailer-daemon/i.test(addr) && !SITE_SENDERS.some((s) => addr.endsWith(s));
}

// Pulls new recruiter and job-site messages from Gmail, drafts replies, and auto-sends
// them only if the user turned on auto-reply. Returns counts.
export async function checkMessages(userId: string) {
  const p = await getProfile(userId);
  if (!p.gmail_connected) throw new GmailNotConnected();
  const db = adminClient();
  const q =
    `newer_than:14d -in:sent -category:promotions ` +
    ALERT_SENDERS.map((s) => `-from:${s}`).join(" ") +
    ` (from:linkedin.com OR from:joinhandshake.com OR from:indeed.com OR recruiter OR interview OR "your application" OR "your background")`;
  const ids = await searchThreadIds(userId, q, 25);
  const { data: known } = await db.from("messages").select("thread_id,last_message_id").eq("user_id", userId);
  const seen = new Map((known ?? []).map((m) => [m.thread_id as string, m.last_message_id as string]));

  let added = 0;
  let sent = 0;
  for (const id of ids) {
    const thread = await getThread(userId, id);
    const last = thread[thread.length - 1];
    if (!last || last.sentByMe || seen.get(id) === last.id) continue;
    const read = await readMessage(p, thread);
    if (read.kind === "other") continue;

    const replyTo = canEmailBack(last.replyTo) ? last.replyTo : "";
    const row: Partial<Message> & { user_id: string } = {
      user_id: userId,
      thread_id: id,
      last_message_id: last.id,
      kind: read.kind,
      person: read.person,
      company: read.company,
      site: read.site || siteOf(last.fromAddr),
      subject: last.subject,
      from_addr: last.fromAddr,
      reply_to: replyTo,
      summary: read.summary,
      reply: read.reply,
      status: read.kind === "application_update" ? "info" : "needs-reply",
      link: threadLink(id),
      received_at: last.date,
      sent_by: "",
      sent_at: null,
    };

    if (p.auto_reply && limitsFor(p).autoReply && replyTo && read.reply && read.kind !== "application_update" && sent < MAX_AUTO_SENDS) {
      await sendReply(userId, last, replyTo, read.reply);
      row.status = "sent";
      row.sent_by = "AI";
      row.sent_at = new Date().toISOString();
      sent++;
    }
    await db.from("messages").upsert(row, { onConflict: "user_id,thread_id" });
    added++;
  }
  return { added, sent };
}

// Adds a message the user pasted in (from LinkedIn, Handshake, a text, ...) and drafts a reply.
// Works without Gmail; the user copies the reply and sends it themselves.
export async function addPastedMessage(userId: string, text: string, site: string) {
  const p = await getProfile(userId);
  const now = new Date().toISOString();
  const mail: MailMessage = {
    id: `paste-${Date.now()}`, threadId: "", from: site, fromAddr: "", replyTo: "", to: "",
    subject: "", date: now, messageIdHeader: "", references: "", body: text.slice(0, 12000), sentByMe: false,
  };
  const read = await readMessage(p, [mail]);
  const row = {
    user_id: userId,
    thread_id: mail.id,
    last_message_id: mail.id,
    kind: read.kind === "other" ? "recruiter" : read.kind,
    person: read.person,
    company: read.company,
    site: site || read.site || "Other",
    summary: read.summary,
    reply: read.reply,
    status: read.kind === "application_update" ? "info" : "needs-reply",
    received_at: now,
  };
  const { error } = await adminClient().from("messages").insert(row);
  if (error) throw error;
}

// Sends one stored message's reply from the user's Gmail.
export async function sendStoredReply(userId: string, messageId: string, text: string, by: "user" | "AI") {
  const db = adminClient();
  const { data: m } = await db.from("messages").select("*").eq("id", messageId).eq("user_id", userId).single();
  if (!m) throw new Error("Message not found.");
  if (!m.reply_to) throw new Error(`Reply to this one on ${m.site}. Copy the reply and paste it there.`);
  const thread = await getThread(userId, m.thread_id);
  await sendReply(userId, thread[thread.length - 1], m.reply_to, text);
  await db
    .from("messages")
    .update({ reply: text, status: "sent", sent_by: by, sent_at: new Date().toISOString() })
    .eq("id", messageId);
}

// Emails the user a reminder when messages are waiting on them.
export async function sendReminder(userId: string) {
  const p = await getProfile(userId);
  if (!p.remind_email || !p.email || !p.gmail_connected) return false;
  const db = adminClient();
  const { data: waiting } = await db
    .from("messages")
    .select("person,company,site,summary")
    .eq("user_id", userId)
    .in("status", ["needs-reply", "drafted"]);
  if (!waiting?.length) return false;
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: aiSent } = await db
    .from("messages")
    .select("person,company")
    .eq("user_id", userId)
    .eq("sent_by", "AI")
    .gte("sent_at", since);

  const site = process.env.NEXT_PUBLIC_SITE_URL || "";
  const lines = waiting.map((m) => `- ${m.person || "Someone"}, ${m.company || "unknown company"} (${m.site}): ${m.summary}`);
  let body = `Hi${p.full_name ? " " + p.full_name.split(" ")[0] : ""},\n\n${waiting.length} message${waiting.length > 1 ? "s are" : " is"} waiting for your reply:\n\n${lines.join("\n")}\n\nA reply is already written for each one. Open Job Finder to send it, edit it, or write your own:\n${site}/dashboard\n`;
  if (aiSent?.length) {
    body += `\nThe AI replied for you to: ${aiSent.map((m) => `${m.person} (${m.company})`).join(", ")}.\n`;
  }
  body += "\nYou can turn these reminders off in Job Finder under Messages.";
  await sendEmail(userId, p.email, `Job Finder: ${waiting.length} message${waiting.length > 1 ? "s" : ""} waiting for a reply`, body);
  return true;
}

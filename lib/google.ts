import { adminClient } from "./supabase";

// Gmail access for one user, using the Google tokens saved at sign-in.

export class GmailNotConnected extends Error {
  constructor() {
    super("Connect Gmail first (Messages tab), or paste the message instead.");
  }
}

async function accessToken(userId: string): Promise<string> {
  const db = adminClient();
  const { data } = await db.from("google_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (!data?.access_token && !data?.refresh_token) throw new GmailNotConnected();
  const fresh = data.expires_at && new Date(data.expires_at).getTime() > Date.now() + 60_000;
  if (data.access_token && fresh) return data.access_token;
  if (!data.refresh_token) throw new GmailNotConnected();

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new GmailNotConnected();
  const tok = (await res.json()) as { access_token: string; expires_in: number };
  await db
    .from("google_tokens")
    .update({
      access_token: tok.access_token,
      expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    })
    .eq("user_id", userId);
  return tok.access_token;
}

async function gmail<T>(userId: string, path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken(userId);
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
  });
  if (res.status === 401 || res.status === 403) {
    await adminClient().from("profiles").update({ gmail_connected: false }).eq("id", userId);
    throw new GmailNotConnected();
  }
  if (!res.ok) throw new Error(`Gmail error ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[]; headers?: { name: string; value: string }[] };
type RawMessage = { id: string; threadId: string; labelIds?: string[]; internalDate: string; payload: Part };

export type MailMessage = {
  id: string;
  threadId: string;
  from: string;
  fromAddr: string;
  replyTo: string;
  to: string;
  subject: string;
  date: string;
  messageIdHeader: string;
  references: string;
  body: string;
  sentByMe: boolean;
};

function decode(data?: string) {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function findBody(part: Part, type: string): string {
  if (part.mimeType === type && part.body?.data) return decode(part.body.data);
  for (const p of part.parts ?? []) {
    const found = findBody(p, type);
    if (found) return found;
  }
  return "";
}

function htmlToText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

function addr(header: string) {
  const m = header.match(/<([^>]+)>/);
  return (m ? m[1] : header).trim().toLowerCase();
}

function toMail(m: RawMessage): MailMessage {
  const h = (name: string) =>
    m.payload.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  const body = findBody(m.payload, "text/plain") || htmlToText(findBody(m.payload, "text/html"));
  const from = h("From");
  return {
    id: m.id,
    threadId: m.threadId,
    from,
    fromAddr: addr(from),
    replyTo: addr(h("Reply-To") || from),
    to: h("To"),
    subject: h("Subject"),
    date: new Date(Number(m.internalDate)).toISOString(),
    messageIdHeader: h("Message-ID"),
    references: h("References"),
    body: body.slice(0, 12000),
    sentByMe: m.labelIds?.includes("SENT") ?? false,
  };
}

export async function searchThreadIds(userId: string, q: string, max = 25): Promise<string[]> {
  const r = await gmail<{ threads?: { id: string }[] }>(
    userId,
    `threads?maxResults=${max}&q=${encodeURIComponent(q)}`,
  );
  return (r.threads ?? []).map((t) => t.id);
}

export async function getThread(userId: string, id: string): Promise<MailMessage[]> {
  const r = await gmail<{ messages: RawMessage[] }>(userId, `threads/${id}?format=full`);
  return r.messages.map(toMail);
}

export function threadLink(threadId: string) {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

function encodeHeader(s: string) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`;
}

function mime(opts: { to: string; subject: string; body: string; inReplyTo?: string; references?: string }) {
  const lines = [
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  if (opts.inReplyTo) {
    lines.push(`In-Reply-To: ${opts.inReplyTo}`);
    lines.push(`References: ${[opts.references, opts.inReplyTo].filter(Boolean).join(" ")}`);
  }
  const raw = lines.join("\r\n") + "\r\n\r\n" + opts.body;
  return Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function replySubject(subject: string) {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

// Sends a reply inside the original thread.
export async function sendReply(userId: string, last: MailMessage, to: string, body: string) {
  const raw = mime({
    to,
    subject: replySubject(last.subject),
    body,
    inReplyTo: last.messageIdHeader,
    references: last.references,
  });
  return gmail<{ id: string }>(userId, "messages/send", {
    method: "POST",
    body: JSON.stringify({ raw, threadId: last.threadId }),
  });
}

// Saves a reply as a Gmail draft in the original thread.
export async function createReplyDraft(userId: string, last: MailMessage, to: string, body: string) {
  const raw = mime({
    to,
    subject: replySubject(last.subject),
    body,
    inReplyTo: last.messageIdHeader,
    references: last.references,
  });
  return gmail<{ id: string }>(userId, "drafts", {
    method: "POST",
    body: JSON.stringify({ message: { raw, threadId: last.threadId } }),
  });
}

// Sends a new email (used for the reminder the user gets about waiting messages).
export async function sendEmail(userId: string, to: string, subject: string, body: string) {
  const raw = mime({ to, subject, body });
  return gmail<{ id: string }>(userId, "messages/send", { method: "POST", body: JSON.stringify({ raw }) });
}

import Anthropic from "@anthropic-ai/sdk";
import type { Job, Profile } from "./types";
import type { MailMessage } from "./google";
import { checkFacts, fitResume, pageCount } from "./doc-export";
import { recordUsage } from "./usage";

const client = new Anthropic();
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

type Effort = "low" | "medium" | "high";
type Schema = Record<string, unknown>;

// Turn on Anthropic's server-side fallback, so a request the main model declines is
// retried on a suitable model instead of failing.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

async function call(params: Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, "model" | "betas">) {
  const body = { ...params, model: MODEL, betas: [FALLBACK_BETA], fallbacks: "default" };
  const msg = await client.beta.messages.create(body as Anthropic.Beta.MessageCreateParamsNonStreaming);
  await recordUsage(params.tools ? "job_search" : "writing", msg);
  if (msg.stop_reason === "refusal") throw new Error("The AI declined this request.");
  return msg;
}

function textOf(msg: Anthropic.Beta.BetaMessage) {
  return msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

// One request whose answer must match `schema`.
async function askJson<T>(system: string, user: Anthropic.Beta.BetaMessageParam["content"], schema: Schema, effort: Effort = "medium"): Promise<T> {
  const msg = await call({
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort, format: { type: "json_schema", schema } },
  });
  return JSON.parse(textOf(msg)) as T;
}

async function askText(system: string, user: string, effort: Effort = "medium") {
  const msg = await call({ max_tokens: 16000, system, messages: [{ role: "user", content: user }], output_config: { effort } });
  return textOf(msg).trim();
}

function candidate(p: Profile) {
  const list = (x?: string[]) => (x?.length ? x.join(", ") : "not given");
  return `RESUME:\n${p.resume || "(no resume yet)"}\n\nTARGET ROLES: ${p.roles}\nLOCATIONS: ${p.locations}\nLEVEL: ${p.level}
WORK SETUP WANTED: ${list(p.work_setup)}${p.work_setup?.includes("Open to relocating") ? `\nWILLING TO RELOCATE TO: ${p.relocate_to || "anywhere"}` : ""}
JOB TYPES: ${list(p.job_types)}\nMINIMUM PAY: ${p.min_pay || "not given"}\nCAN START: ${p.start_date || "not given"}
INDUSTRIES OF INTEREST: ${p.industries || "not given"}\nAVOID: ${p.avoid || "nothing listed"}\nNOTES: ${p.notes}
Only suggest jobs whose location fits the work setup wanted (remote jobs only if Remote is chosen; on-site or hybrid jobs only near their locations unless they are open to relocating). Treat job type, minimum pay and the avoid list as dealbreakers.`;
}

const SCORING_RULES = `Score each job 0-100 for how likely THIS candidate is to get an interview, not how nice the job is.
Be strict: a stretch is below 60. Required years of experience the candidate lacks, senior titles, niche skills they lack, or locations outside their area (unless remote) all push the score down hard.
Skip commission-only or direct-sales "marketing" firms that recruit with vague ads.
Never invent facts about a job or the candidate.`;

const JOB_FIELDS = {
  title: { type: "string" },
  company: { type: "string" },
  location: { type: "string" },
  salary: { type: "string", description: "As listed, or 'Not listed'" },
  url: { type: "string" },
  source: { type: "string" },
  summary: { type: "string", description: "One sentence on what the job is" },
  description: { type: "string", description: "Requirements and duties, plus the posted date text if seen" },
  score: { type: "integer" },
  strengths: { type: "array", items: { type: "string" } },
  gaps: { type: "array", items: { type: "string" } },
};
const JOB_LIST_SCHEMA: Schema = {
  type: "object",
  additionalProperties: false,
  required: ["jobs"],
  properties: {
    jobs: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: Object.keys(JOB_FIELDS), properties: JOB_FIELDS },
    },
  },
};

export type FoundJob = Pick<Job, "title" | "company" | "location" | "salary" | "url" | "source" | "summary" | "description" | "score" | "strengths" | "gaps">;

// Reads job-alert emails (LinkedIn, Indeed, Handshake, ...) and scores every job in them.
export async function jobsFromAlertEmails(p: Profile, emails: MailMessage[]): Promise<FoundJob[]> {
  if (!emails.length) return [];
  const mail = emails
    .map((e, i) => `--- EMAIL ${i + 1} from ${e.from} (${e.date})\nSUBJECT: ${e.subject}\n${e.body.slice(0, 6000)}`)
    .join("\n\n");
  const r = await askJson<{ jobs: FoundJob[] }>(
    `You find jobs inside job-alert emails and score them for a candidate.\n${SCORING_RULES}\nUse the job's own link from the email as url. source is the site name (LinkedIn, Indeed, Handshake, ...).`,
    `${candidate(p)}\n\nJOB ALERT EMAILS:\n${mail}`,
    JOB_LIST_SCHEMA,
  );
  return r.jobs;
}

// Searches the web for current openings and checks each posting is still live.
export async function jobsFromWebSearch(p: Profile, skipUrls: string[]): Promise<FoundJob[]> {
  const tools = [
    { type: "web_search_20260209", name: "web_search", max_uses: 12 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 20 },
  ] as unknown as Anthropic.Beta.BetaToolUnion[];
  const system = `You are a job researcher. Find real, currently open job postings for the candidate.
Search job boards (ZipRecruiter, Built In, company career pages, Greenhouse, Lever, Workday, teamworkonline for sports teams). Indeed detail pages often block fetching; use them only to find employer names.
Fetch every posting you keep. Drop it if the page says it is closed, expired, filled, removed, or not found, or if it was posted more than about 30 days ago.
${SCORING_RULES}
Never make up a URL: only report URLs you fetched.
Finish with a list of the jobs you kept: title, company, location, salary, url, source, a one-line summary, requirements and duties with the posted date, score, strengths and gaps.`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `${candidate(p)}\n\nAlready saved (skip these): ${skipUrls.slice(0, 80).join(", ") || "none"}\n\nFind up to 8 strong matches.`,
    },
  ];
  // A long search can pause; send the paused turn back and the server picks up where it stopped.
  const done: Anthropic.Beta.BetaContentBlock[] = [];
  let msg = await call({ max_tokens: 32000, system, messages, tools, output_config: { effort: "medium" } });
  done.push(...msg.content);
  for (let i = 0; i < 5 && msg.stop_reason === "pause_turn"; i++) {
    const resume = [...messages, { role: "assistant" as const, content: done as Anthropic.Beta.BetaContentBlockParam[] }];
    msg = await call({ max_tokens: 32000, system, messages: resume, tools, output_config: { effort: "medium" } });
    done.push(...msg.content);
  }
  const findings = done
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  if (!findings.trim()) return [];
  const r = await askJson<{ jobs: FoundJob[] }>(
    "Copy the job list from this research report into JSON. Keep only jobs with a real URL. Do not add jobs or change scores.",
    findings,
    JOB_LIST_SCHEMA,
    "low",
  );
  return r.jobs;
}

// Scores one job the user added themselves.
export async function scoreJob(p: Profile, job: { title: string; company: string; description: string; url: string }) {
  const r = await askJson<{ jobs: FoundJob[] }>(
    `Score this one job for the candidate.\n${SCORING_RULES}`,
    `${candidate(p)}\n\nJOB:\nTitle: ${job.title}\nCompany: ${job.company}\nURL: ${job.url}\n${job.description}`,
    JOB_LIST_SCHEMA,
  );
  return r.jobs[0];
}

export type ReadMessage = {
  kind: "recruiter" | "interview" | "application_update" | "other";
  person: string;
  company: string;
  site: string;
  summary: string;
  reply: string;
};

const MESSAGE_SCHEMA: Schema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "person", "company", "site", "summary", "reply"],
  properties: {
    kind: { type: "string", enum: ["recruiter", "interview", "application_update", "other"] },
    person: { type: "string" },
    company: { type: "string" },
    site: { type: "string", description: "LinkedIn, Indeed, Handshake, or Email" },
    summary: { type: "string", description: "One or two plain sentences on what they want" },
    reply: { type: "string", description: "Reply in the candidate's voice, or empty for application_update/other" },
  },
};

const REPLY_RULES = `Write replies in the candidate's own voice: 60-140 words, warm and professional.
Thank them, show interest if it fits, and offer to share availability. Sign with the candidate's first name.
Never accept or decline an offer, never name a salary, never invent facts about the candidate.`;

// Reads a recruiter or job-site message and drafts a reply.
export async function readMessage(p: Profile, thread: MailMessage[]): Promise<ReadMessage> {
  const text = thread
    .slice(-4)
    .map((m) => `FROM: ${m.from}\nDATE: ${m.date}\nSUBJECT: ${m.subject}\n${m.body.slice(0, 5000)}`)
    .join("\n\n---\n\n");
  return askJson<ReadMessage>(
    `You sort a job seeker's email. kind: "recruiter" if a person reaches out about a role, "interview" if it is about scheduling or an interview, "application_update" for status updates or rejections, "other" for anything else (newsletters, job alerts, marketing).\n${REPLY_RULES}`,
    `CANDIDATE NAME: ${p.full_name || "the candidate"}\n${candidate(p)}\n\nEMAIL THREAD:\n${text}`,
    MESSAGE_SCHEMA,
    "low",
  );
}

export async function rewriteReply(p: Profile, summary: string, current: string, instructions: string) {
  return askText(
    `You write replies to recruiters for a job seeker.\n${REPLY_RULES}\nReturn only the reply text.`,
    `CANDIDATE NAME: ${p.full_name || "the candidate"}\n${candidate(p)}\n\nTHEIR MESSAGE: ${summary}\n\nCURRENT DRAFT:\n${current}\n\nCHANGES WANTED: ${instructions || "Make it better."}`,
    "low",
  );
}

export const RESUME_RULES = `You tailor resumes for a specific job. Use ONLY facts from the candidate's resume. Every job title, employer, city, date, school, degree, GPA, honor, number and accomplishment must match the resume exactly, and each bullet must stay under the job it came from. Never invent, guess or mix up details.
Make it look professional and fit on ONE page at 12pt Times New Roman with normal margins (about 40 lines in total). Get there with fewer, sharper bullets, never by cramming:
- SUMMARY: 2-3 lines aimed at this role
- SKILLS: one line of 6-8 skills from the resume that match the job, separated by " • "
- EXPERIENCE: jobs in reverse date order (current jobs first); 3 bullets for the most relevant jobs and 1-2 for the others; leave out jobs that don't help; 8-11 bullets in total
- each bullet fits on one line (under 90 characters), starts with a strong verb, and mirrors the job's wording only where it is true
- EDUCATION last, with degrees, GPAs and honors exactly as written
- use only the headings SUMMARY, SKILLS, EXPERIENCE and EDUCATION
Format exactly like this (the app turns it into Word and PDF files that application forms can read):
FULL NAME
City, ST | email | phone | LinkedIn
SUMMARY
...
EXPERIENCE
Job Title | Employer name only
City, ST | Month YYYY – Month YYYY (write "– Present" for a current job)
• Bullet
EDUCATION
Degree | School
City, ST | Month YYYY | GPA: X.X
Return only the resume, with no commentary before or after.`;

export const LETTER_RULES = `You write cover letters. Every fact about the candidate (employers, titles, dates, schools, GPA, accomplishments) must come from their resume exactly as written; facts about the company come only from the job posting. Never invent or mix up details, and use no placeholders like [Company].
Make it professional and fit on one page at 12pt Times New Roman (250-320 words in the body), in standard business-letter format:
- first line the candidate's name, second line their city, email and phone or LinkedIn, then a blank line, today's date, a blank line
- "Dear Hiring Manager," (or the hiring manager's name if the posting gives it)
- an opening paragraph naming the role and why this company; one or two paragraphs tying 2-3 real experiences to the job's needs; a closing paragraph asking for an interview
- "Sincerely," then the candidate's name
Separate paragraphs with one blank line. Return only the letter.`;

// Rewrites a draft whose details don't match the resume, then checks again.
async function fixFacts(rules: string, ask: string, draft: string, base: string, extra: string, letter: boolean) {
  for (let i = 0; i < 2; i++) {
    const issues = checkFacts(draft, base, extra, letter);
    if (!issues.length) break;
    draft = await askText(
      rules,
      `${ask}\n\nYOUR LAST DRAFT HAS DETAILS THAT DON'T MATCH THE RESUME:\n${issues.map((x) => "- " + x).join("\n")}\nFix them using only what the resume says (or leave them out). Keep everything else and the format.\n\n${draft}`,
    );
  }
  return draft;
}

export async function tailorResume(p: Profile, job: Job) {
  const ask = `${candidate(p)}\n\nJOB: ${job.title} at ${job.company}\n${job.description}`;
  let resume = await askText(RESUME_RULES, ask);
  // Keep shortening until it fits on one page.
  for (let i = 0; i < 3 && pageCount(resume) > 1; i++) {
    resume = await askText(
      RESUME_RULES,
      `${ask}\n\nYOUR LAST DRAFT RUNS ONTO A SECOND PAGE. Shorten it to fit one page: keep the most relevant jobs, cut the weakest bullets, keep each bullet to one line, and shorten the summary. Keep the format and normal spacing.\n\n${resume}`,
    );
  }
  resume = await fixFacts(RESUME_RULES, ask, resume, p.resume || "", job.description || "", false);
  // Hard stop: whatever is saved must fit on one page.
  return fitResume(resume).text;
}

export async function coverLetter(p: Profile, job: Job) {
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const ask = `TODAY: ${today}\nCANDIDATE NAME: ${p.full_name || ""}\n${candidate(p)}\n\nJOB: ${job.title} at ${job.company} (${job.location})\n${job.description}`;
  const letter = await askText(LETTER_RULES, ask);
  return fixFacts(LETTER_RULES, ask, letter, p.resume || "", `${today} ${job.title} ${job.company} ${job.location} ${job.description}`, true);
}

// Pulls plain text out of an uploaded PDF resume.
export async function resumeFromPdf(base64: string) {
  const msg = await call({
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: "Copy this resume as plain text. Keep every section, date and bullet. Return only the resume." },
        ],
      },
    ],
    output_config: { effort: "low" },
  });
  return textOf(msg).trim();
}

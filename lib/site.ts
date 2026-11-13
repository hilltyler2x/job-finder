// One place for the public name, address and description, so a rename is a one-line change.
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "Job Finder";

// Public address used in the sitemap, share previews and structured data.
// Set NEXT_PUBLIC_SITE_URL once the app has its own domain; Vercel's production address is the fallback.
// A leftover localhost value from .env.example is ignored on Vercel.
const configured = process.env.NEXT_PUBLIC_SITE_URL;
const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
export const SITE_URL = (
  (configured && !(vercel && configured.includes("localhost")) ? configured : "") ||
  (vercel ? `https://${vercel}` : "http://localhost:3000")
).replace(/\/$/, "");

export const SITE_TAGLINE = "The AI job finder that only picks jobs you can get";

export const SITE_DESCRIPTION =
  "An AI job search assistant that searches for jobs every day, scores how likely you are to get each one, " +
  "tailors your resume and cover letter using only what's true on your resume, and drafts replies to recruiters. " +
  "It never applies or sends anything without you. Free to sign up with Google.";

// Questions answered on the home page, also published as FAQ structured data.
export const FAQ: { q: string; a: string }[] = [
  {
    q: `How is ${SITE_NAME} different from auto-apply bots?`,
    a: "Auto-apply bots send as many applications as possible. This app does the opposite: it scores every job for how likely you are to get it, shows the best matches first, and never applies for you. You choose which jobs to apply to.",
  },
  {
    q: "Does it make things up on my resume?",
    a: "No. Each tailored resume and cover letter is written only from the facts on the resume you upload. It checks every document against your resume (titles, employers, dates, numbers) and warns you if anything doesn't match.",
  },
  {
    q: "Can it answer recruiter messages from LinkedIn, Indeed and Handshake?",
    a: "It drafts replies for you. If you connect Gmail, it finds recruiter emails and job-site notifications; otherwise you paste the message in. Nothing is sent until you click Send, unless you turn on auto-reply yourself.",
  },
  {
    q: "What file types does it make?",
    a: "Resumes and cover letters download as Word or PDF, in a simple layout that applicant tracking systems (ATS) can read.",
  },
  {
    q: "Do I have to connect Gmail?",
    a: "No. Signing in with Google only shares your name and email. Connecting Gmail is optional and is used only to find job alerts and recruiter messages.",
  },
];

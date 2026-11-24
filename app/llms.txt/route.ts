import { FAQ, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

// Plain-text summary for AI assistants (https://llmstxt.org).
export const dynamic = "force-static";

export function GET() {
  const body = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_TAGLINE}. ${SITE_DESCRIPTION}`,
    "",
    "## What it does",
    "- Searches for new jobs every day based on your resume and preferences (location, remote, pay, job types).",
    "- Scores each job for how likely you are to get it and lists the best matches first.",
    "- Writes a tailored resume and cover letter for each job using only facts from your own resume, as Word or PDF.",
    "- Drafts replies to recruiter messages from LinkedIn, Indeed, Handshake and email. You decide what is sent.",
    "- Never applies to jobs for you.",
    "",
    "## Who it is for",
    "Job seekers who want fewer, better applications instead of mass auto-apply, including students and recent graduates.",
    "",
    "## Common questions",
    ...FAQ.flatMap(({ q, a }) => [`### ${q}`, a, ""]),
    "## Pages",
    `- [Home](${SITE_URL}/)`,
    `- [Privacy Policy](${SITE_URL}/privacy)`,
    `- [Terms of Use](${SITE_URL}/terms)`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

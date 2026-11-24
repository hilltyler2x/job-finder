import { route } from "@/lib/api";
import { adminClient } from "@/lib/supabase";
import { readJobFromLink, scoreJob } from "@/lib/ai";
import { getProfile } from "@/lib/work";

// Adds a job the user found themselves and scores it. Only a link is needed: without a
// pasted description, the AI reads the posting itself.
export const POST = route(async (userId, req) => {
  const body = (await req.json()) as { title?: string; company?: string; url?: string; description?: string };
  const url = (body.url || "").trim();
  let title = (body.title || "").trim();
  let company = (body.company || "").trim();
  let description = (body.description || "").trim();
  const hasLink = /^https?:\/\/\S+$/i.test(url);
  if (!hasLink && description.length < 80) throw new Error("Paste a link to the job. Pasting the description is optional.");

  if (description.length < 80) {
    const read = await readJobFromLink(url, { title, company });
    if (!read.found || !read.description) {
      throw new Error("That site wouldn't let the AI read the posting. Open the job, copy the description, paste it here, and try again.");
    }
    if (read.closed) throw new Error("That posting says it's closed or no longer taking applications.");
    title ||= read.title;
    company ||= read.company;
    description = [read.location && `Location: ${read.location}`, read.salary && `Pay: ${read.salary}`, read.description].filter(Boolean).join("\n");
  }

  const scored = await scoreJob(await getProfile(userId), { title, company, description, url });
  const row = {
    ...scored,
    title: title || scored.title,
    company: company || scored.company,
    url: hasLink ? url : `manual:${Date.now()}`,
    description,
    source: "Added by you",
    user_id: userId,
  };
  const { error } = await adminClient().from("jobs").insert(row);
  if (error) throw error;
  return { score: scored.score };
});

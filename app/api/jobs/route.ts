import { route } from "@/lib/api";
import { adminClient } from "@/lib/supabase";
import { scoreJob } from "@/lib/ai";
import { getProfile } from "@/lib/work";

// Adds a job the user found themselves and scores it.
export const POST = route(async (userId, req) => {
  const body = (await req.json()) as { title: string; company: string; url: string; description: string };
  if (!body.title || !body.company) throw new Error("Add at least a title and a company.");
  const scored = await scoreJob(await getProfile(userId), body);
  const row = {
    ...scored,
    title: body.title,
    company: body.company,
    url: body.url || `manual:${Date.now()}`,
    description: body.description || scored.description,
    source: "Added by you",
    user_id: userId,
  };
  const { error } = await adminClient().from("jobs").insert(row);
  if (error) throw error;
  return { score: scored.score };
});

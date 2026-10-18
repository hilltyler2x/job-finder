import { route, type IdCtx } from "@/lib/api";
import { adminClient } from "@/lib/supabase";
import { coverLetter, tailorResume } from "@/lib/ai";
import { getProfile } from "@/lib/work";
import type { Job } from "@/lib/types";

export const maxDuration = 120;

// Writes the tailored resume and cover letter for one job.
export const POST = route<IdCtx>(async (userId, _req, { params }) => {
  const id = (await params).id;
  const db = adminClient();
  const { data: job } = await db.from("jobs").select("*").eq("id", id).eq("user_id", userId).single();
  if (!job) throw new Error("Job not found.");
  const p = await getProfile(userId);
  if (!p.resume) throw new Error("Add your resume in Profile first.");
  const [resume_doc, cover_letter] = await Promise.all([tailorResume(p, job as Job), coverLetter(p, job as Job)]);
  await db.from("jobs").update({ resume_doc, cover_letter }).eq("id", id);
  return { resume_doc, cover_letter };
});

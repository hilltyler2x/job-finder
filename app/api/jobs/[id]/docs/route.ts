import { route, type IdCtx } from "@/lib/api";
import { adminClient } from "@/lib/supabase";
import { coverLetter, tailorResume } from "@/lib/ai";
import { getProfile } from "@/lib/work";
import type { Job } from "@/lib/types";
import { limitsFor } from "@/lib/plan";

export const maxDuration = 120;

// Writes the tailored resume and cover letter for one job.
export const POST = route<IdCtx>(async (userId, _req, { params }) => {
  const id = (await params).id;
  const db = adminClient();
  const { data: job } = await db.from("jobs").select("*").eq("id", id).eq("user_id", userId).single();
  if (!job) throw new Error("Job not found.");
  const p = await getProfile(userId);
  if (!p.resume) throw new Error("Add your resume in Profile first.");
  const month = new Date().toISOString().slice(0, 7);
  const used = p.docs_month === month ? p.docs_used : 0;
  const max = limitsFor(p).docsPerMonth;
  if (used >= max) {
    throw new Error(`The Free plan includes ${max} tailored resumes and cover letters a month. Upgrade to Pro for unlimited.`);
  }
  const [resume_doc, cover_letter] = await Promise.all([tailorResume(p, job as Job), coverLetter(p, job as Job)]);
  await db.from("jobs").update({ resume_doc, cover_letter }).eq("id", id);
  await db.from("profiles").update({ docs_month: month, docs_used: used + 1 }).eq("id", userId);
  return { resume_doc, cover_letter };
});

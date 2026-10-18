import { route } from "@/lib/api";
import { adminClient } from "@/lib/supabase";

// Permanently deletes the signed-in user and everything saved for them.
export const POST = route(async (userId) => {
  const db = adminClient();
  const { data: tok } = await db.from("google_tokens").select("refresh_token,access_token").eq("user_id", userId).maybeSingle();
  const token = tok?.refresh_token || tok?.access_token;
  if (token) {
    // Remove Job Finder's Gmail access at Google too; a failure here shouldn't block deletion.
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
  }
  // Profiles, jobs, messages and tokens are deleted with the user (on delete cascade).
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw error;
});

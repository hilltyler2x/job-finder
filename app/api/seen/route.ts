import { route } from "@/lib/api";
import { adminClient } from "@/lib/supabase";

// The dashboard calls this when it opens, so the owner stats page can count active users.
export const POST = route(async (userId) => {
  await adminClient().from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", userId);
});

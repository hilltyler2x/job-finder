import { route, type IdCtx } from "@/lib/api";
import { adminClient } from "@/lib/supabase";
import { createReplyDraft, getThread } from "@/lib/google";

// Saves the reply as a Gmail draft so the user can finish and send it from Gmail.
export const POST = route<IdCtx>(async (userId, req, { params }) => {
  const { text } = (await req.json()) as { text: string };
  const id = (await params).id;
  const db = adminClient();
  const { data: m } = await db.from("messages").select("*").eq("id", id).eq("user_id", userId).single();
  if (!m) throw new Error("Message not found.");
  if (!m.reply_to) throw new Error(`Reply to this one on ${m.site}. Copy the reply and paste it there.`);
  const thread = await getThread(userId, m.thread_id);
  await createReplyDraft(userId, thread[thread.length - 1], m.reply_to, text);
  await db.from("messages").update({ reply: text, status: "drafted" }).eq("id", id);
});

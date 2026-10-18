import { route, type IdCtx } from "@/lib/api";
import { adminClient } from "@/lib/supabase";
import { rewriteReply } from "@/lib/ai";
import { getProfile } from "@/lib/work";

export const POST = route<IdCtx>(async (userId, req, { params }) => {
  const { instructions } = (await req.json()) as { instructions?: string };
  const id = (await params).id;
  const db = adminClient();
  const { data: m } = await db.from("messages").select("*").eq("id", id).eq("user_id", userId).single();
  if (!m) throw new Error("Message not found.");
  const reply = await rewriteReply(await getProfile(userId), m.summary, m.reply, instructions ?? "");
  await db.from("messages").update({ reply }).eq("id", id);
  return { reply };
});

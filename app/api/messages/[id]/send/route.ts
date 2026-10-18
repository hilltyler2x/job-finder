import { route, type IdCtx } from "@/lib/api";
import { sendStoredReply } from "@/lib/work";

export const POST = route<IdCtx>(async (userId, req, { params }) => {
  const { text } = (await req.json()) as { text: string };
  if (!text?.trim()) throw new Error("The reply is empty.");
  await sendStoredReply(userId, (await params).id, text.trim(), "user");
});

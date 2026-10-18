import { route } from "@/lib/api";
import { addPastedMessage } from "@/lib/work";

export const POST = route(async (userId, req) => {
  const { text, site } = (await req.json()) as { text: string; site: string };
  if (!text?.trim()) throw new Error("Paste the message first.");
  await addPastedMessage(userId, text.trim(), site);
});

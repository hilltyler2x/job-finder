import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase";
import { checkMessages, recheckLinks, runSearch, sendReminder } from "@/lib/work";

export const maxDuration = 300;

// Vercel runs this once a day (see vercel.json). For each user: drop dead job links,
// search for new jobs, check messages, then email a reminder if replies are waiting.
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const { data: users } = await adminClient().from("profiles").select("id,gmail_connected").neq("resume", "");
  const report: Record<string, string> = {};
  for (const { id, gmail_connected } of users ?? []) {
    const steps: string[] = [];
    const work: [string, () => Promise<unknown>][] = [
      ["links", () => recheckLinks(id)],
      ["search", () => runSearch(id, { manual: false })],
    ];
    // Messages and reminder emails need Gmail; everyone else still gets the job search.
    if (gmail_connected) work.push(["messages", () => checkMessages(id)], ["reminder", () => sendReminder(id)]);
    for (const [name, step] of work) {
      try {
        steps.push(`${name}: ${JSON.stringify(await step())}`);
      } catch (e) {
        steps.push(`${name} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    report[id] = steps.join("; ");
  }
  return NextResponse.json(report);
}

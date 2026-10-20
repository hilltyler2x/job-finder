import { notFound } from "next/navigation";
import { adminClient, userClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Owner-only numbers for running and selling the business: sign-ups, active users,
// retention, paying users and AI cost. Only emails listed in ADMIN_EMAILS can open it.

const DAY = 24 * 3600_000;

// Supabase returns at most 1,000 rows per request, so read in pages.
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

const money = (n: number) => `$${n.toFixed(n < 10 ? 2 : 0)}`;
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "n/a");

export default async function Admin() {
  const { data } = await (await userClient()).auth.getUser();
  const admins = (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  if (!data.user?.email || !admins.includes(data.user.email.toLowerCase())) notFound();

  const db = adminClient();
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY).toISOString();
  type P = { id: string; created_at: string; last_seen_at: string | null; plan: string | null };
  type U = { user_id: string | null; kind: string; cost_usd: number };
  const [people, usage, withResume, jobs, docs, msgs] = await Promise.all([
    all<P>((a, b) => db.from("profiles").select("id,created_at,last_seen_at,plan").order("created_at").range(a, b)),
    all<U>((a, b) => db.from("usage_events").select("user_id,kind,cost_usd").gte("created_at", since30).order("id").range(a, b)),
    db.from("profiles").select("id", { count: "exact", head: true }).neq("resume", ""),
    db.from("jobs").select("id", { count: "exact", head: true }),
    db.from("jobs").select("id", { count: "exact", head: true }).neq("resume_doc", ""),
    db.from("messages").select("id", { count: "exact", head: true }),
  ]);

  const age = (t: string | null) => (t ? now - new Date(t).getTime() : Infinity);
  const weekly = people.filter((p) => age(p.last_seen_at) <= 7 * DAY).length;
  const monthly = people.filter((p) => age(p.last_seen_at) <= 30 * DAY).length;
  const old = people.filter((p) => age(p.created_at) >= 28 * DAY);
  const retained = old.filter((p) => age(p.last_seen_at) <= 7 * DAY).length;
  const pro = people.filter((p) => p.plan === "pro").length;
  const price = Number(process.env.NEXT_PUBLIC_PRO_PRICE_USD || 0);
  const cost = usage.reduce((s, u) => s + Number(u.cost_usd), 0);
  const costBy = (kind: string) => usage.filter((u) => u.kind === kind).reduce((s, u) => s + Number(u.cost_usd), 0);

  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = now - i * 7 * DAY;
    const start = end - 7 * DAY;
    const n = people.filter((p) => {
      const t = new Date(p.created_at).getTime();
      return t > start && t <= end;
    }).length;
    return { label: new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" }), n };
  }).reverse();

  const stats: [string, string, string][] = [
    ["Sign-ups", String(people.length), `${people.filter((p) => age(p.created_at) <= 7 * DAY).length} this week`],
    ["Added a resume", String(withResume.count ?? 0), `${pct(withResume.count ?? 0, people.length)} of sign-ups`],
    ["Weekly active users", String(weekly), `${monthly} active in the last 30 days`],
    ["4-week retention", pct(retained, old.length), `${retained} of ${old.length} people who joined 4+ weeks ago used it this week`],
    ["Pro users", String(pro), pct(pro, people.length) + " of sign-ups"],
    ["Monthly revenue", price ? money(pro * price) : "Set NEXT_PUBLIC_PRO_PRICE_USD", "Pro users times the Pro price"],
    ["AI cost, last 30 days", money(cost), `Job search ${money(costBy("job_search"))}, writing ${money(costBy("writing"))}`],
    ["AI cost per active user", monthly ? money(cost / monthly) : "n/a", "Last 30 days, per person active in that time"],
    ["Jobs found", String(jobs.count ?? 0), `${docs.count ?? 0} with a tailored resume and cover letter`],
    ["Recruiter messages handled", String(msgs.count ?? 0), ""],
  ];

  return (
    <main className="wrap">
      <h1>Business stats</h1>
      <p className="muted small">Only you can see this page. Numbers update every time you open it.</p>
      <div className="steps">
        {stats.map(([name, value, note]) => (
          <div className="card" key={name}>
            <div className="muted small">{name}</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
            {note && <div className="muted small">{note}</div>}
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Sign-ups by week</h3>
        <table className="small" style={{ width: "100%", marginTop: 8 }}>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.label}>
                <td style={{ width: 90 }}>Week of {w.label}</td>
                <td>{w.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small"><a href="/dashboard">Back to Job Finder</a></p>
    </main>
  );
}

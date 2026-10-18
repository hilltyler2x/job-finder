import type { Profile } from "./types";

// Job listings from Adzuna's free API (US jobs, remote included), used when ADZUNA_APP_ID and
// ADZUNA_APP_KEY are set. Its terms ask sites to show "Jobs by Adzuna" next to its listings.
// The AI scores the listings afterwards.

export type Listing = {
  title: string;
  company: string;
  location: string;
  salary: string;
  url: string;
  source: string;
  description: string;
  posted: string;
};

function plain(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// The first few target roles, e.g. "Marketing Coordinator, Social Media Coordinator".
function roleList(p: Profile) {
  return p.roles
    .split(/[,;\n]/)
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 3);
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "JobFinder/1.0" } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

type AdzunaJob = {
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  redirect_url: string;
  description: string;
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string | number;
  created: string;
};

async function adzuna(p: Profile, remoteOnly: boolean): Promise<Listing[]> {
  const id = process.env.ADZUNA_APP_ID, key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) return [];
  const where = remoteOnly ? "" : p.locations.split(/[,;\n]/).map((s) => s.trim()).find((s) => s && !/remote/i.test(s)) ?? "";
  const out: Listing[] = [];
  for (const role of roleList(p)) {
    const q = new URLSearchParams({
      app_id: id,
      app_key: key,
      what: remoteOnly ? `${role} remote` : role,
      results_per_page: "20",
      max_days_old: "21",
      "content-type": "application/json",
    });
    if (where) q.set("where", where);
    const r = await getJson<{ results?: AdzunaJob[] }>(`https://api.adzuna.com/v1/api/jobs/us/search/1?${q}`);
    for (const j of r?.results ?? []) {
      const real = j.salary_min && String(j.salary_is_predicted) !== "1";
      out.push({
        title: plain(j.title),
        company: j.company?.display_name ?? "",
        location: j.location?.display_name ?? "",
        salary: real ? `$${Math.round(j.salary_min!).toLocaleString("en-US")}${j.salary_max && j.salary_max !== j.salary_min ? ` - $${Math.round(j.salary_max).toLocaleString("en-US")}` : ""}` : "Not listed",
        url: j.redirect_url,
        source: "Jobs by Adzuna",
        description: plain(j.description).slice(0, 1500),
        posted: j.created?.slice(0, 10) ?? "",
      });
    }
  }
  return out;
}

// Listings that fit the person's work setup, minus ones already saved.
export async function findListings(p: Profile, skipUrls: string[]): Promise<Listing[]> {
  const setup = p.work_setup ?? [];
  const remoteOnly = setup.length > 0 && setup.every((s) => s === "Remote");
  const listings = await adzuna(p, remoteOnly);
  const skip = new Set(skipUrls);
  const seen = new Set<string>();
  return listings.filter((l) => {
    const k = `${l.title}|${l.company}`.toLowerCase();
    if (!l.url || skip.has(l.url) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

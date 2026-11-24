import { route } from "@/lib/api";
import { recheckLinks, runSearch } from "@/lib/work";

export const maxDuration = 300;

// "Search again": first hide saved jobs whose postings closed, then look for new ones.
export const POST = route(async (userId) => {
  const expired = await recheckLinks(userId).catch(() => 0);
  return { added: await runSearch(userId, { manual: true }), expired };
});

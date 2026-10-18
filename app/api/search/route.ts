import { route } from "@/lib/api";
import { runSearch } from "@/lib/work";

export const maxDuration = 300;

export const POST = route(async (userId) => ({ added: await runSearch(userId, { manual: true }) }));

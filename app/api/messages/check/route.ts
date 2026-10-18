import { route } from "@/lib/api";
import { checkMessages } from "@/lib/work";

export const maxDuration = 300;

export const POST = route(async (userId) => checkMessages(userId));

import { AsyncLocalStorage } from "node:async_hooks";
import type Anthropic from "@anthropic-ai/sdk";
import { adminClient } from "./supabase";

// Records what each Claude request costs, per user, so the owner stats page can show
// AI cost per active user. Work done inside forUser() is billed to that user.

const current = new AsyncLocalStorage<string>();

export function forUser<T>(userId: string, fn: () => Promise<T>) {
  return current.run(userId, fn);
}

// Dollars per million tokens: [input, output]. Cache writes cost 1.25x input, reads 0.1x.
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};
const WEB_SEARCH_EACH = 0.01;

export function costOf(model: string, u: Anthropic.Beta.BetaUsage) {
  const key = Object.keys(PRICES).find((m) => model.startsWith(m));
  const [inp, out] = PRICES[key ?? "claude-opus-5-5"];
  const tokens =
    (u.input_tokens * inp +
      (u.cache_creation_input_tokens ?? 0) * inp * 1.25 +
      (u.cache_read_input_tokens ?? 0) * inp * 0.1 +
      u.output_tokens * out) /
    1_000_000;
  return tokens + (u.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_EACH;
}

export async function recordUsage(kind: string, msg: Anthropic.Beta.BetaMessage) {
  try {
    await adminClient().from("usage_events").insert({
      user_id: current.getStore() ?? null,
      kind,
      model: msg.model,
      input_tokens: msg.usage.input_tokens + (msg.usage.cache_creation_input_tokens ?? 0) + (msg.usage.cache_read_input_tokens ?? 0),
      output_tokens: msg.usage.output_tokens,
      web_searches: msg.usage.server_tool_use?.web_search_requests ?? 0,
      cost_usd: costOf(msg.model, msg.usage),
    });
  } catch (e) {
    // Tracking must never break the feature the user asked for.
    console.error("usage not recorded", e);
  }
}

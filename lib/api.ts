import { NextResponse } from "next/server";
import { currentUserId } from "./supabase";
import { GmailNotConnected } from "./google";
import { forUser } from "./usage";

// Wraps an API route: requires sign-in and turns errors into a JSON { error } reply.
export function route<C>(handler: (userId: string, req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    try {
      return NextResponse.json((await forUser(userId, () => handler(userId, req, ctx))) ?? { ok: true });
    } catch (e) {
      console.error(e);
      const status = e instanceof GmailNotConnected ? 409 : 500;
      return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status });
    }
  };
}

export type IdCtx = { params: Promise<{ id: string }> };

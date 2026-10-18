import { NextResponse } from "next/server";
import { adminClient, userClient } from "@/lib/supabase";

// Google sends people here after sign-in. After "Connect Gmail" it also saves the Gmail
// tokens for the server to use.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/?error=signin", url));

  const sb = await userClient();
  const { data, error } = await sb.auth.exchangeCodeForSession(code);
  if (error || !data.session) return NextResponse.redirect(new URL("/?error=signin", url));

  const { provider_token, provider_refresh_token, user } = data.session;
  // Only the "Connect Gmail" button asks for Gmail access; plain sign-in stores nothing.
  if (url.searchParams.get("gmail") && provider_token) {
    const row: Record<string, string> = {
      user_id: user.id,
      access_token: provider_token,
      expires_at: new Date(Date.now() + 55 * 60_000).toISOString(),
    };
    // Google only sends a refresh token on first consent; keep the old one otherwise.
    if (provider_refresh_token) row.refresh_token = provider_refresh_token;
    const db = adminClient();
    await db.from("google_tokens").upsert(row, { onConflict: "user_id" });
    await db.from("profiles").update({ gmail_connected: true }).eq("id", user.id);
  }
  return NextResponse.redirect(new URL("/dashboard", url));
}

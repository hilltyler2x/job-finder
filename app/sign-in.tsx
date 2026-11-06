"use client";
import { useState } from "react";
import { browserClient } from "@/lib/supabase-browser";
import { APP_AUTH_CALLBACK, isNativeApp, openInSystemBrowser } from "@/lib/native";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
].join(" ");

type GoogleOptions = {
  scopes?: string;
  queryParams?: Record<string, string>;
};

// Starts Google sign-in. `query` is added to the /auth/callback address ("" or "?gmail=1").
// On the website this is a normal redirect. In the iPhone and Android apps Google
// won't sign in inside the app, so the sign-in page opens in the system browser and
// comes back to the app (see app/native-bridge.tsx).
async function signInWithGoogle(query: string, options: GoogleOptions = {}) {
  const sb = browserClient();
  if (await isNativeApp()) {
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { ...options, redirectTo: `${APP_AUTH_CALLBACK}${query}`, skipBrowserRedirect: true },
    });
    if (error || !data.url) throw error ?? new Error("No sign-in address");
    await openInSystemBrowser(data.url);
    return;
  }
  await sb.auth.signInWithOAuth({
    provider: "google",
    options: { ...options, redirectTo: `${window.location.origin}/auth/callback${query}` },
  });
}

// Plain Google sign-in: name and email only, open to anyone.
export default function SignIn() {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      await signInWithGoogle("");
    } catch {
      setBusy(false);
      return;
    }
    // In the apps the page stays open behind the browser; let the button work again.
    if (await isNativeApp()) setBusy(false);
  }
  return (
    <button className="primary" onClick={go} disabled={busy}>
      {busy ? "Opening Google..." : "Sign in with Google"}
    </button>
  );
}

// Optional: lets Job Finder read job alerts and recruiter messages and send replies.
export function ConnectGmail({ label = "Connect Gmail" }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      await signInWithGoogle("?gmail=1", {
        scopes: GMAIL_SCOPES,
        // A refresh token lets the daily check run while you're away.
        queryParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
      });
    } catch {
      setBusy(false);
      return;
    }
    if (await isNativeApp()) setBusy(false);
  }
  return (
    <button className="primary" onClick={go} disabled={busy}>
      {busy ? "Opening Google..." : label}
    </button>
  );
}

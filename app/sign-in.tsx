"use client";
import { useState } from "react";
import { browserClient } from "@/lib/supabase-browser";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
].join(" ");

// Plain Google sign-in: name and email only, open to anyone.
export default function SignIn() {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    await browserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
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
    await browserClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?gmail=1`,
        scopes: GMAIL_SCOPES,
        // A refresh token lets the daily check run while you're away.
        queryParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
      },
    });
  }
  return (
    <button className="primary" onClick={go} disabled={busy}>
      {busy ? "Opening Google..." : label}
    </button>
  );
}

"use client";

// Helpers for the iPhone and Android apps (Capacitor). Plugins are loaded on demand
// inside the browser only, so nothing here runs on the server.

// Google sends app sign-ins back to this address, which opens the app.
export const APP_AUTH_CALLBACK = "com.hilltyler.jobfinder://auth/callback";

export async function isNativeApp() {
  if (typeof window === "undefined") return false;
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.isNativePlatform();
}

// Google blocks sign-in inside app web views, so the apps open it in the system
// browser (Safari view / Chrome custom tab) instead.
export async function openInSystemBrowser(url: string) {
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url });
}

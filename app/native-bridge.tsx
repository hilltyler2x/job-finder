"use client";
import { useEffect } from "react";
import { APP_AUTH_CALLBACK } from "@/lib/native";

// In the iPhone and Android apps, Google sign-in finishes in the system browser and
// comes back as com.hilltyler.jobfinder://auth/callback?code=... This sends that code to
// the normal /auth/callback route inside the app, where the sign-in cookie lives.
// On the website it does nothing.
export default function NativeBridge() {
  useEffect(() => {
    let cancelled = false;
    let remove: (() => void) | undefined;
    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const [{ App }, { Browser }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/browser"),
      ]);
      const handle = await App.addListener("appUrlOpen", async ({ url }) => {
        if (!url.startsWith(APP_AUTH_CALLBACK)) return;
        const rest = url.slice(APP_AUTH_CALLBACK.length);
        if (rest && !rest.startsWith("?") && !rest.startsWith("#")) return;
        const query = rest.startsWith("?") ? rest.split("#")[0] : "";
        try {
          await Browser.close();
        } catch {
          // Already closed (Android closes it by itself).
        }
        window.location.href = `/auth/callback${query}`;
      });
      if (cancelled) handle.remove();
      else remove = () => handle.remove();
    })();
    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);
  return null;
}

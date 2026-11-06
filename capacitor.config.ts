import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CapacitorConfig } from "@capacitor/cli";

// The apps load the live Job Finder site. Set CAP_SERVER_URL (for example
// https://your-site.vercel.app) when running `npx cap sync`. Without it the apps
// open the bundled "couldn't connect" page.
const serverUrl = process.env.CAP_SERVER_URL?.trim() || undefined;

// Lets the "Try again" button on the offline page know where to go.
try {
  writeFileSync(
    join(__dirname, "mobile", "www", "app-url.js"),
    `window.APP_URL = ${JSON.stringify(serverUrl ?? "")};\n`,
  );
} catch {
  // Not fatal: the page falls back to reloading.
}

const config: CapacitorConfig = {
  appId: "com.hilltyler.jobfinder",
  appName: "Job Finder",
  webDir: "mobile/www",
  server: {
    ...(serverUrl ? { url: serverUrl } : {}),
    errorPath: "index.html",
  },
};

export default config;

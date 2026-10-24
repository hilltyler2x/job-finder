import "./globals.css";
import type { Metadata, Viewport } from "next";
import NativeBridge from "./native-bridge";

export const metadata: Metadata = {
  title: "Job Finder",
  description: "Finds jobs you can get, tailors your resume, and helps you answer recruiters.",
  appleWebApp: { capable: true, title: "Job Finder", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#2456d6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NativeBridge />
        {children}
      </body>
    </html>
  );
}

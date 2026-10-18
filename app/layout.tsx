import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Job Finder",
  description: "Finds jobs you can get, tailors your resume, and helps you answer recruiters.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

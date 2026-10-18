import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/supabase";
import SignIn from "./sign-in";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUserId()) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <main className="wrap">
      <section className="hero">
        <h1>Job Finder</h1>
        <p className="muted">
          Sign in with Google and it searches for jobs every day, keeps the ones you have the best
          chance at, tailors your resume and cover letter for each, and helps you answer recruiters.
        </p>
        <SignIn />
        {error && <p className="error">Sign-in didn&apos;t finish. Please try again.</p>}
      </section>
      <div className="steps">
        <div className="card">
          <h3>Best matches first</h3>
          <p className="muted small">Every job gets a score for how likely you are to get it, and the highest scores show first.</p>
        </div>
        <div className="card">
          <h3>Resume and cover letter</h3>
          <p className="muted small">One click writes a resume and cover letter for the job, using only what&apos;s true on your resume.</p>
        </div>
        <div className="card">
          <h3>Recruiter messages</h3>
          <p className="muted small">Messages from LinkedIn, Indeed, Handshake and recruiters get a reply written for you. You decide what gets sent.</p>
        </div>
      </div>
      <p className="muted small" style={{ textAlign: "center" }}>
        Anyone can sign up free with a Google account. Connecting Gmail is optional: if you do, Job Finder
        reads it only to find job alerts and recruiter messages, and sends email only when you click Send
        or turn on auto-reply. It never applies to jobs for you.
      </p>
      <p className="muted small" style={{ textAlign: "center" }}>
        <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Use</a>
      </p>
    </main>
  );
}

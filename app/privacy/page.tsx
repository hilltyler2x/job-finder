import Link from "next/link";

export const metadata = { title: "Privacy Policy | Job Finder" };

export default function Privacy() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <main className="wrap">
      <div className="card">
        <h1>Privacy Policy</h1>
        <p className="muted small">Last updated October 18, 2026</p>
        <h3>What Job Finder collects</h3>
        <p>When you sign in with Google, Job Finder receives your name and email address. You can add your resume and job preferences on the Profile tab. Job Finder saves the jobs it finds for you, the resumes and cover letters it writes, and the recruiter messages you paste in or that it reads from Gmail.</p>
        <h3>Gmail (optional)</h3>
        <p>If you click Connect Gmail, Job Finder can read your email and create drafts or send email. It reads only job-alert emails and messages about jobs (from recruiters, LinkedIn, Indeed, Handshake and similar senders). It sends email only when you click Send, when you turn on auto-reply, or for the reminder email you can switch off. It never applies to jobs for you.</p>
        <p>Job Finder&apos;s use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. Gmail data is used only to provide these features to you. It is not sold, not used for advertising, and not used to train AI models.</p>
        <h3>How it is used and shared</h3>
        <p>Your data is stored in Job Finder&apos;s database (Supabase) and is visible only to you. To write resumes, cover letters and replies and to score jobs, the relevant text is sent to Google&apos;s Gemini API, which processes it to return a result. Job Finder uses Gemini&apos;s free tier, under which Google may use that text to improve its products, so don&apos;t put anything in your resume or messages that you wouldn&apos;t want Google to see. Job Finder does not sell your data or share it with anyone else.</p>
        <h3>Deleting your account</h3>
        <p>On the Profile tab, click <strong>Delete my account</strong>. This permanently deletes your profile, jobs, documents, messages and saved Google access. You can also remove Job Finder&apos;s Gmail access at any time at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a>.</p>
        {contact && (
          <>
            <h3>Contact</h3>
            <p>Questions about privacy: <a href={`mailto:${contact}`}>{contact}</a></p>
          </>
        )}
        <p><Link href="/">Back to Job Finder</Link></p>
      </div>
    </main>
  );
}

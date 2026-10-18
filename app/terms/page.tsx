import Link from "next/link";

export const metadata = { title: "Terms of Use | Job Finder" };

export default function Terms() {
  return (
    <main className="wrap">
      <div className="card">
        <h1>Terms of Use</h1>
        <p className="muted small">Last updated October 18, 2026</p>
        <p>Job Finder is a free tool that helps you find jobs, write resumes and cover letters, and answer recruiters. By signing in you agree to these terms.</p>
        <ul>
          <li>Job matches, scores and documents are written by AI and can be wrong. Read every resume, cover letter and reply before you use or send it.</li>
          <li>You are responsible for what you send and for the information on your resume. Job Finder never applies to jobs for you.</li>
          <li>Job listings come from other websites. Job Finder doesn&apos;t control them and can&apos;t promise a job is still open.</li>
          <li>Don&apos;t misuse the service, for example by trying to reach other people&apos;s data or overload it.</li>
          <li>The service is provided as is and may change or stop. You can delete your account at any time from the Profile tab.</li>
        </ul>
        <p>See the <Link href="/privacy">Privacy Policy</Link> for how your data is handled.</p>
        <p><Link href="/">Back to Job Finder</Link></p>
      </div>
    </main>
  );
}

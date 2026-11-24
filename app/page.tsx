import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/supabase";
import { FAQ, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import SignIn from "./sign-in";

// Structured data that search engines and AI assistants read directly.
const STRUCTURED_DATA = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "AI job search assistant",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free to sign up" },
    featureList: [
      "Daily AI job search",
      "Chance-of-getting-the-job score with best matches first",
      "Resume tailored to each job using only facts from your resume",
      "Cover letter for each job",
      "Word and PDF downloads that applicant tracking systems can read",
      "Drafted replies to recruiter messages from LinkedIn, Indeed, Handshake and email",
      "Never applies or sends without you",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

// Signed-in visitors go to their dashboard. If the sign-in check fails, still show the public page,
// so search engines and AI crawlers never see an error.
async function signedIn() {
  try {
    return Boolean(await currentUserId());
  } catch {
    return false;
  }
}

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await signedIn()) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <main className="wrap">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA).replace(/</g, "\\u003c") }}
      />
      <section className="hero">
        <h1>{SITE_NAME}</h1>
        <p><strong>{SITE_TAGLINE}.</strong></p>
        <p className="muted">
          Sign in with Google and it searches for jobs every day, keeps the ones you have the best
          chance at, tailors your resume and cover letter for each, and helps you answer recruiters.
        </p>
        <SignIn />
        {error && <p className="error">Sign-in didn&apos;t finish. Please try again.</p>}
      </section>
      <div className="steps">
        <div className="card">
          <h2 className="h3">Best matches first</h2>
          <p className="muted small">Every job gets a score for how likely you are to get it, and the highest scores show first.</p>
        </div>
        <div className="card">
          <h2 className="h3">Resume and cover letter</h2>
          <p className="muted small">One click writes a resume and cover letter for the job, using only what&apos;s true on your resume.</p>
        </div>
        <div className="card">
          <h2 className="h3">Recruiter messages</h2>
          <p className="muted small">Messages from LinkedIn, Indeed, Handshake and recruiters get a reply written for you. You decide what gets sent.</p>
        </div>
      </div>
      <section className="card faq">
        <h2>Common questions</h2>
        {FAQ.map(({ q, a }) => (
          <div key={q}>
            <h3>{q}</h3>
            <p className="muted small">{a}</p>
          </div>
        ))}
      </section>
      <p className="muted small" style={{ textAlign: "center" }}>
        Anyone can sign up free with a Google account. Connecting Gmail is optional: if you do, {SITE_NAME}
        {" "}reads it only to find job alerts and recruiter messages, and sends email only when you click Send
        or turn on auto-reply. It never applies to jobs for you.
      </p>
      <p className="muted small" style={{ textAlign: "center" }}>
        <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Use</a>
      </p>
    </main>
  );
}

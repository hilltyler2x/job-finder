"use client";
import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase-browser";
import type { Job, Message, Profile } from "@/lib/types";
import { checkFacts, makeDocx, makePdf } from "@/lib/doc-export";
import { ConnectGmail } from "../sign-in";

const sb = browserClient();

async function api<T = { ok: true }>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data as T;
}

// Saves a resume or cover letter as a Word or PDF file.
function download(name: string, text: string, ext: "pdf" | "docx", letter: boolean) {
  const bytes = ext === "pdf" ? makePdf(text, letter) : makeDocx(text, letter);
  const type = ext === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

type Tab = "matches" | "messages" | "profile";

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("matches");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    const [p, j, m] = await Promise.all([
      sb.from("profiles").select("*").eq("id", u.user.id).single(),
      // Highest chance of getting the job first.
      sb.from("jobs").select("*").order("score", { ascending: false }).order("found_at", { ascending: false }),
      sb.from("messages").select("*").order("received_at", { ascending: false }),
    ]);
    if (p.data) setProfile(p.data as Profile);
    setJobs((j.data ?? []) as Job[]);
    setMsgs((m.data ?? []) as Message[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (profile && (!profile.resume || !profile.work_setup?.length)) setTab("profile");
  }, [profile]);

  async function signOut() {
    await sb.auth.signOut();
    window.location.href = "/";
  }

  const waiting = msgs.filter((m) => m.status === "needs-reply" || m.status === "drafted").length;

  return (
    <main className="wrap">
      <div className="row between">
        <div>
          <h1>Job Finder</h1>
          <div className="muted small">{profile?.email}</div>
        </div>
        <button onClick={signOut}>Sign out</button>
      </div>
      {notice && <div className="notice">{notice}</div>}
      <div className="tabs">
        <button className={tab === "matches" ? "on" : ""} onClick={() => setTab("matches")}>
          Matches ({jobs.filter((j) => j.status !== "dismissed").length})
        </button>
        <button className={tab === "messages" ? "on" : ""} onClick={() => setTab("messages")}>
          Messages{waiting ? ` (${waiting} waiting)` : ""}
        </button>
        <button className={tab === "profile" ? "on" : ""} onClick={() => setTab("profile")}>
          Profile
        </button>
      </div>
      {profile && tab === "matches" && <Matches profile={profile} jobs={jobs} reload={load} setNotice={setNotice} />}
      {profile && tab === "messages" && <Messages profile={profile} msgs={msgs} reload={load} setNotice={setNotice} />}
      {profile && tab === "profile" && <ProfileForm profile={profile} reload={load} setNotice={setNotice} />}
    </main>
  );
}

type Shared = { reload: () => Promise<void>; setNotice: (s: string) => void };

function Matches({ profile, jobs, reload, setNotice }: Shared & { profile: Profile; jobs: Job[] }) {
  const [busy, setBusy] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [adding, setAdding] = useState(false);

  async function search() {
    setBusy(true);
    setNotice("Searching job sites and your job-alert emails. This can take a few minutes.");
    try {
      const { added } = await api<{ added: number }>("/api/search");
      setNotice(added ? `Found ${added} new match${added > 1 ? "es" : ""}.` : "No new matches above your minimum score this time.");
      await reload();
    } catch (e) {
      setNotice((e as Error).message);
    }
    setBusy(false);
  }

  const shown = jobs.filter((j) => (showDismissed ? j.status === "dismissed" : j.status !== "dismissed"));
  const last = profile.last_search_at ? new Date(profile.last_search_at).toLocaleString() : "never";

  return (
    <>
      <div className="row between">
        <div className="muted small">
          Searches run every morning. Last search: {last}. Showing jobs scoring {profile.min_score}+, best chance first.
        </div>
        <div className="row">
          <button onClick={() => setAdding(!adding)}>Add a job</button>
          <button className="primary" onClick={search} disabled={busy || !profile.resume}>
            {busy ? "Searching..." : "Search again"}
          </button>
        </div>
      </div>
      {adding && <AddJob reload={reload} setNotice={setNotice} done={() => setAdding(false)} />}
      {!shown.length && (
        <div className="card muted">
          {profile.resume ? "No matches yet. Tap Search again, or wait for tomorrow's search." : "Add your resume in Profile to start."}
        </div>
      )}
      {shown.map((j) => (
        <JobCard key={j.id} job={j} resume={profile.resume} reload={reload} setNotice={setNotice} />
      ))}
      <button className="small" onClick={() => setShowDismissed(!showDismissed)}>
        {showDismissed ? "Back to matches" : "Show dismissed jobs"}
      </button>
    </>
  );
}

function AddJob({ reload, setNotice, done }: Shared & { done: () => void }) {
  const [f, setF] = useState({ title: "", company: "", url: "", description: "" });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const { score } = await api<{ score: number }>("/api/jobs", f);
      setNotice(`Added. Your chance score for this job is ${score}.`);
      await reload();
      done();
    } catch (e) {
      setNotice((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <div className="card">
      <h3>Add a job you found</h3>
      <label>Job title</label>
      <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <label>Company</label>
      <input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
      <label>Link</label>
      <input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
      <label>Job description (paste it)</label>
      <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" onClick={save} disabled={busy}>
          {busy ? "Scoring..." : "Add and score"}
        </button>
        <button onClick={done}>Cancel</button>
      </div>
    </div>
  );
}

function JobCard({ job, resume, reload, setNotice }: Shared & { job: Job; resume: string }) {
  const [open, setOpen] = useState(false);
  // Details in the documents that don't match the user's own resume.
  const extra = `${job.title} ${job.company} ${job.location} ${job.description} ${new Date().getFullYear()}`;
  const resumeIssues = job.resume_doc ? checkFacts(job.resume_doc, resume, job.description) : [];
  const letterIssues = job.cover_letter ? checkFacts(job.cover_letter, resume, extra, true) : [];
  const save = (name: string, text: string, ext: "pdf" | "docx", letter: boolean, issues: string[]) => {
    if (issues.length && !confirm(`These details don't match your resume:\n\n${issues.join("\n")}\n\nDownload anyway?`)) return;
    download(name, text, ext, letter);
  };
  const [busy, setBusy] = useState(false);
  const cls = job.score >= 80 ? "hi" : job.score >= 70 ? "mid" : "";

  async function setStatus(status: Job["status"]) {
    await sb.from("jobs").update({ status }).eq("id", job.id);
    await reload();
  }
  async function writeDocs() {
    setBusy(true);
    try {
      await api(`/api/jobs/${job.id}/docs`);
      await reload();
      setOpen(true);
    } catch (e) {
      setNotice((e as Error).message);
    }
    setBusy(false);
  }
  const base = job.title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Job";

  return (
    <div className="card">
      <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
        <div className={`score ${cls}`} title="Chance of getting this job">{job.score}</div>
        <div style={{ flex: 1 }}>
          <h2>{job.title}</h2>
          <div className="muted">
            {job.company} · {job.location}
            {job.salary && job.salary !== "Not listed" ? ` · ${job.salary}` : ""}
          </div>
          <p style={{ margin: "6px 0" }}>{job.summary}</p>
          <div className="row small">
            <span className="tag">{job.source}</span>
            {job.status === "applied" && <span className="tag">Applied</span>}
          </div>
          {open && (
            <>
              <strong className="small">Why you fit</strong>
              <ul className="small">{job.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
              {job.gaps.length > 0 && (
                <>
                  <strong className="small">Watch out for</strong>
                  <ul className="small">{job.gaps.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </>
              )}
              {job.resume_doc && (
                <>
                  <div className="row between"><strong>Tailored resume</strong>
                    <span className="row">
                      <button className="small" onClick={() => navigator.clipboard.writeText(job.resume_doc)}>Copy</button>
                      <button className="small" onClick={() => save(`${base} - Resume`, job.resume_doc, "pdf", false, resumeIssues)}>PDF</button>
                      <button className="small" onClick={() => save(`${base} - Resume`, job.resume_doc, "docx", false, resumeIssues)}>Word</button>
                    </span>
                  </div>
                  {resumeIssues.length > 0 && <div className="notice">Check before sending, these don&apos;t match your resume: {resumeIssues.join(" ")}</div>}
                  <pre className="doc">{job.resume_doc}</pre>
                </>
              )}
              {job.cover_letter && (
                <>
                  <div className="row between"><strong>Cover letter</strong>
                    <span className="row">
                      <button className="small" onClick={() => navigator.clipboard.writeText(job.cover_letter)}>Copy</button>
                      <button className="small" onClick={() => save(`${base} - Cover Letter`, job.cover_letter, "pdf", true, letterIssues)}>PDF</button>
                      <button className="small" onClick={() => save(`${base} - Cover Letter`, job.cover_letter, "docx", true, letterIssues)}>Word</button>
                    </span>
                  </div>
                  {letterIssues.length > 0 && <div className="notice">Check before sending, these don&apos;t match your resume: {letterIssues.join(" ")}</div>}
                  <pre className="doc">{job.cover_letter}</pre>
                </>
              )}
            </>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            {job.url && !job.url.startsWith("manual:") && (
              <a className="btn primary" href={job.url} target="_blank" rel="noreferrer">Open and apply</a>
            )}
            <button onClick={writeDocs} disabled={busy}>
              {busy ? "Writing..." : job.resume_doc ? "Rewrite resume and cover letter" : "Write resume and cover letter"}
            </button>
            <button onClick={() => setOpen(!open)}>{open ? "Less" : "More"}</button>
            {job.status !== "applied" && <button onClick={() => setStatus("applied")}>I applied</button>}
            {job.status !== "dismissed" ? (
              <button onClick={() => setStatus("dismissed")}>Dismiss</button>
            ) : (
              <button onClick={() => setStatus("new")}>Restore</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Messages({ profile, msgs, reload, setNotice }: Shared & { profile: Profile; msgs: Message[] }) {
  const [busy, setBusy] = useState(false);
  const [confirmAuto, setConfirmAuto] = useState(false);

  async function check() {
    setBusy(true);
    try {
      const r = await api<{ added: number; sent: number }>("/api/messages/check");
      setNotice(
        r.added
          ? `Found ${r.added} new message${r.added > 1 ? "s" : ""}${r.sent ? `, and the AI replied to ${r.sent}` : ""}.`
          : "No new messages.",
      );
      await reload();
    } catch (e) {
      setNotice((e as Error).message);
    }
    setBusy(false);
  }
  async function setSetting(field: "auto_reply" | "remind_email", value: boolean) {
    await sb.from("profiles").update({ [field]: value }).eq("id", profile.id);
    setConfirmAuto(false);
    await reload();
  }

  const order: Record<string, number> = { "needs-reply": 0, drafted: 1, info: 2, sent: 3 };
  const list = msgs.filter((m) => m.status !== "done").sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));

  return (
    <>
      {!profile.gmail_connected && (
        <div className="card">
          <h3>Connect Gmail (optional)</h3>
          <p className="muted small">
            Connect Gmail and Job Finder finds recruiter messages and LinkedIn, Indeed and Handshake
            notifications for you, writes replies, and can send them from your email. Without it, paste
            any message below and you still get a reply written for you.
          </p>
          <ConnectGmail />
        </div>
      )}
      <PasteMessage reload={reload} setNotice={setNotice} />
      {profile.gmail_connected && <div className="card">
        <div className="row between">
          <h3>Reply settings</h3>
          <button className="primary" onClick={check} disabled={busy}>{busy ? "Checking..." : "Check messages now"}</button>
        </div>
        <label className="row" style={{ fontWeight: 400 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={profile.remind_email}
            onChange={(e) => setSetting("remind_email", e.target.checked)} />
          Email me each morning when messages are waiting for a reply
        </label>
        <label className="row" style={{ fontWeight: 400 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={profile.auto_reply}
            onChange={(e) => (e.target.checked ? setConfirmAuto(true) : setSetting("auto_reply", false))} />
          Let the AI reply for me every time
        </label>
        {confirmAuto && (
          <div className="notice">
            The AI will send replies from your Gmail right away, without asking you first. It only replies to
            recruiters who emailed you directly, never accepts or declines offers, and never names a salary.
            Messages from LinkedIn, Indeed and Handshake still need you to paste the reply on that site.
            <div className="row" style={{ marginTop: 8 }}>
              <button className="primary" onClick={() => setSetting("auto_reply", true)}>Yes, turn it on</button>
              <button onClick={() => setConfirmAuto(false)}>Cancel</button>
            </div>
          </div>
        )}
        <p className="muted small">
          LinkedIn, Indeed and Handshake connect through the notification emails they send to your Gmail.
        </p>
      </div>}
      {!list.length && <div className="card muted">No messages waiting.</div>}
      {list.map((m) => (
        <MessageCard key={m.id} m={m} reload={reload} setNotice={setNotice} />
      ))}
    </>
  );
}

function PasteMessage({ reload, setNotice }: Shared) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [site, setSite] = useState("LinkedIn");
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    try {
      await api("/api/messages/paste", { text, site });
      setNotice("Added, with a reply written for you.");
      setText("");
      setOpen(false);
      await reload();
    } catch (e) {
      setNotice((e as Error).message);
    }
    setBusy(false);
  }
  if (!open) return <button onClick={() => setOpen(true)}>Paste a message from a recruiter</button>;
  return (
    <div className="card">
      <h3>Paste a message</h3>
      <label>Where did it come from?</label>
      <select value={site} onChange={(e) => setSite(e.target.value)}>
        <option>LinkedIn</option>
        <option>Handshake</option>
        <option>Indeed</option>
        <option>Email</option>
        <option>Text message</option>
        <option>Other</option>
      </select>
      <label>Message</label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the whole message here" />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" onClick={add} disabled={busy}>{busy ? "Writing a reply..." : "Write a reply"}</button>
        <button onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function MessageCard({ m, reload, setNotice }: Shared & { m: Message }) {
  const [text, setText] = useState(m.reply);
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState(false);
  const canEmail = !!m.reply_to;

  async function run(label: string, fn: () => Promise<unknown>, okText: string) {
    setBusy(label);
    try {
      await fn();
      setNotice(okText);
      await reload();
    } catch (e) {
      setNotice((e as Error).message);
    }
    setBusy("");
    setConfirm(false);
  }
  const setStatus = (status: Message["status"]) =>
    run("status", async () => { await sb.from("messages").update({ status, reply: text }).eq("id", m.id); }, "Saved.");

  return (
    <div className="card">
      <div className="row between">
        <h3>{m.person || "Someone"}{m.company ? `, ${m.company}` : ""}</h3>
        <div className="row small">
          <span className="tag">{m.site}</span>
          <span className="tag">{m.kind.replace("_", " ")}</span>
          <span className="tag">{m.status === "sent" ? `Sent${m.sent_by === "AI" ? " by AI" : ""}` : m.status.replace("-", " ")}</span>
        </div>
      </div>
      <p>{m.summary}</p>
      {m.status !== "info" && (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={m.status === "sent"} />
          {m.status !== "sent" && (
            <div className="row" style={{ marginTop: 8 }}>
              {canEmail ? (
                confirm ? (
                  <>
                    <span>Send this reply to {m.reply_to}?</span>
                    <button className="primary" disabled={!!busy}
                      onClick={() => run("send", () => api(`/api/messages/${m.id}/send`, { text }), "Reply sent.")}>Yes, send</button>
                    <button onClick={() => setConfirm(false)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="primary" onClick={() => setConfirm(true)}>Send reply</button>
                    <button disabled={!!busy}
                      onClick={() => run("draft", () => api(`/api/messages/${m.id}/draft`, { text }), "Saved as a draft in your Gmail.")}>
                      Save as Gmail draft
                    </button>
                  </>
                )
              ) : (
                <>
                  <button className="primary" onClick={() => { navigator.clipboard.writeText(text); setNotice(`Copied. Paste it into ${m.site}.`); }}>
                    Copy reply
                  </button>
                  <button onClick={() => setStatus("sent")}>I sent it</button>
                </>
              )}
              <button disabled={!!busy}
                onClick={() => run("rewrite", async () => {
                  const r = await api<{ reply: string }>(`/api/messages/${m.id}/rewrite`, { instructions: "" });
                  setText(r.reply);
                }, "Rewrote the reply.")}>
                {busy === "rewrite" ? "Writing..." : "Rewrite with AI"}
              </button>
              <button onClick={() => setText("")}>Write my own</button>
              <button onClick={() => setStatus(m.status)}>Save edits</button>
            </div>
          )}
        </>
      )}
      <div className="row small" style={{ marginTop: 8 }}>
        {m.link && <a href={m.link} target="_blank" rel="noreferrer">Open in Gmail</a>}
        <button className="small" onClick={() => setStatus("done")}>Clear</button>
      </div>
    </div>
  );
}

function ProfileForm({ profile, reload, setNotice }: Shared & { profile: Profile }) {
  const [f, setF] = useState(profile);
  const [busy, setBusy] = useState("");

  const toggle = (key: "work_setup" | "job_types", v: string) => {
    const cur = f[key] ?? [];
    setF({ ...f, [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  async function save() {
    if (!f.work_setup?.length) return setNotice("Pick at least one work setup: remote, on-site or hybrid near you, or open to relocating.");
    setBusy("save");
    const { error } = await sb
      .from("profiles")
      .update({
        full_name: f.full_name, resume: f.resume, roles: f.roles, locations: f.locations,
        level: f.level, min_score: f.min_score, notes: f.notes,
        work_setup: f.work_setup, relocate_to: f.relocate_to, job_types: f.job_types, min_pay: f.min_pay,
        start_date: f.start_date, industries: f.industries, avoid: f.avoid,
      })
      .eq("id", profile.id);
    setNotice(error ? error.message : "Profile saved.");
    await reload();
    setBusy("");
  }
  async function deleteAccount() {
    if (!confirm("Delete your account? This permanently removes your profile, jobs, documents and messages, and disconnects Gmail.")) return;
    setBusy("delete");
    try {
      await api("/api/account/delete");
      await sb.auth.signOut();
      window.location.href = "/";
    } catch (e) {
      setNotice((e as Error).message);
      setBusy("");
    }
  }
  async function upload(file: File) {
    setBusy("upload");
    try {
      const form = new FormData();
      form.append("file", file);
      const { text } = await api<{ text: string }>("/api/profile/resume", form);
      setF({ ...f, resume: text });
      setNotice("Resume read. Check it, then tap Save.");
    } catch (e) {
      setNotice((e as Error).message);
    }
    setBusy("");
  }

  return (
    <div className="card">
      <label>Your name</label>
      <input value={f.full_name ?? ""} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
      <label>Resume</label>
      <div className="row small" style={{ marginBottom: 6 }}>
        <span className="muted">Paste it below, or upload a PDF:</span>
        <input type="file" accept="application/pdf" style={{ width: "auto" }} disabled={!!busy}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        {busy === "upload" && <span>Reading...</span>}
      </div>
      <textarea style={{ minHeight: 260 }} value={f.resume} onChange={(e) => setF({ ...f, resume: e.target.value })} />
      <label>Jobs you want</label>
      <input placeholder="Marketing Coordinator, Social Media Coordinator" value={f.roles} onChange={(e) => setF({ ...f, roles: e.target.value })} />
      <label>Where</label>
      <input placeholder="Atlanta GA, Remote US" value={f.locations} onChange={(e) => setF({ ...f, locations: e.target.value })} />
      <label>Level</label>
      <select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>
        <option>Internship</option>
        <option>Entry level</option>
        <option>1-3 years</option>
        <option>3-5 years</option>
        <option>5+ years</option>
      </select>
      <h3 style={{ marginTop: 20 }}>What you&apos;re looking for</h3>
      {!profile.work_setup?.length && (
        <div className="notice">Tell us how you want to work so we only show jobs that fit.</div>
      )}
      <label>Work setup (pick all that fit)</label>
      <div className="row small">
        {["Remote", "On-site or hybrid near me", "Open to relocating"].map((v) => (
          <label key={v} className="row" style={{ margin: 0, gap: 6 }}>
            <input type="checkbox" style={{ width: "auto" }} checked={f.work_setup?.includes(v) ?? false} onChange={() => toggle("work_setup", v)} />
            {v}
          </label>
        ))}
      </div>
      {f.work_setup?.includes("Open to relocating") && (
        <>
          <label>Where would you move?</label>
          <input placeholder="Anywhere in the US, or Charlotte, Dallas" value={f.relocate_to ?? ""} onChange={(e) => setF({ ...f, relocate_to: e.target.value })} />
        </>
      )}
      <label>Job type</label>
      <div className="row small">
        {["Full-time", "Part-time", "Internship", "Contract or temporary"].map((v) => (
          <label key={v} className="row" style={{ margin: 0, gap: 6 }}>
            <input type="checkbox" style={{ width: "auto" }} checked={f.job_types?.includes(v) ?? false} onChange={() => toggle("job_types", v)} />
            {v}
          </label>
        ))}
      </div>
      <label>Lowest pay you&apos;d accept</label>
      <input placeholder="$50,000 a year or $22 an hour" value={f.min_pay ?? ""} onChange={(e) => setF({ ...f, min_pay: e.target.value })} />
      <label>When can you start?</label>
      <input placeholder="Right away, or after May 2026" value={f.start_date ?? ""} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
      <label>Industries you&apos;d like</label>
      <input placeholder="Sports, consumer brands, tech" value={f.industries ?? ""} onChange={(e) => setF({ ...f, industries: e.target.value })} />
      <label>Anything to avoid</label>
      <input placeholder="Commission-only, call centers, night shifts" value={f.avoid ?? ""} onChange={(e) => setF({ ...f, avoid: e.target.value })} />
      <label>Only show jobs scoring at least {f.min_score}</label>
      <input type="range" min={40} max={90} step={5} value={f.min_score} onChange={(e) => setF({ ...f, min_score: Number(e.target.value) })} />
      <label>Anything else</label>
      <textarea style={{ minHeight: 80 }} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" onClick={save} disabled={!!busy}>{busy === "save" ? "Saving..." : "Save"}</button>
      </div>
      <div className="row small" style={{ marginTop: 24 }}>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <button className="small" disabled={!!busy} onClick={deleteAccount}>Delete my account</button>
      </div>
    </div>
  );
}

# Job Finder

A web app where anyone signs up with a Google account and gets:

- a daily job search (job-alert emails from LinkedIn, Indeed and Handshake, plus a web search),
  with every job scored for how likely they are to get it, best chances first
- a tailored resume and cover letter for any job, downloadable as PDF or Word
- replies written for recruiter messages they paste in, or, if they connect Gmail, pulled in
  automatically, with send, Gmail draft, or auto-reply options
- a morning reminder email when messages are waiting (Gmail users)

It never applies to jobs for anyone.

Built with Next.js, Supabase (sign-in and database), the Gmail API and the Claude API.
See **SETUP.md** to put it online.

## Code map

- `app/page.tsx`, `app/sign-in.tsx`: home page and Google sign-in
- `app/auth/callback/route.ts`: finishes sign-in and stores Gmail tokens
- `app/dashboard/dashboard.tsx`: Matches, Messages and Profile tabs
- `app/api/*`: buttons (search, check messages, send, draft, rewrite, write docs, add job, resume upload)
- `app/api/cron/daily/route.ts`: the daily run for every user
- `lib/work.ts`: search, link checks, messages, reminders
- `lib/ai.ts`: every Claude prompt
- `lib/google.ts`: Gmail reading, sending and drafts
- `lib/doc-export.ts`: PDF and Word files without extra libraries
- `supabase/schema.sql`: tables and privacy rules

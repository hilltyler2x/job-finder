# Putting Job Finder online

This gets the app running at its own web address, where anyone can sign up with their Google account.
It takes about an hour the first time, and everything below is free.

You'll create five accounts. Keep a note open: several steps give you a value to paste later.
The names in CAPITALS are the ones from `.env.example`.

## 1. GitHub: hold the code

1. Sign up at github.com, then click **New repository**. Name it `job-finder` and make it **Private**.
2. Upload every file in this folder (drag and drop works on the repository page), or ask Claude
   in the project to push the code there for you.

## 2. Supabase: sign-in and database

1. Sign up at supabase.com and create a project (any name; save the database password somewhere safe).
2. Open **SQL Editor > New query**, paste all of `supabase/schema.sql`, and click **Run**.
3. Open **Project Settings > API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep this one secret)
4. Open **Authentication > URL Configuration**. You'll fill this in at step 5 once you have your web address.

## 3. Google Cloud: "Sign in with Google" and optional Gmail

1. Go to console.cloud.google.com and create a project called Job Finder.
2. **APIs & Services > Library**: search **Gmail API** and click **Enable**.
3. **APIs & Services > OAuth consent screen** (Google Auth Platform):
   - User type **External**. App name Job Finder, your email as support and developer contact,
     your website address as the home page, and a privacy policy page (see below).
   - Scopes: add `.../auth/gmail.readonly` and `.../auth/gmail.compose`.
   - Click **Publish app** so it's **In production**. No test-user list is needed.
4. **APIs & Services > Credentials > Create credentials > OAuth client ID**:
   - Type **Web application**.
   - Authorized redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
     (your Supabase Project URL plus `/auth/v1/callback`).
   - Copy the Client ID → `GOOGLE_CLIENT_ID` and Client secret → `GOOGLE_CLIENT_SECRET`.
5. Back in Supabase, **Authentication > Sign In / Providers > Google**: turn it on and paste the
   same Client ID and secret. Save.

**How open sign-up works.** Signing in only asks Google for a name and email, so anyone with a
Google account can sign up and use job search, scoring, resumes and cover letters, and pasted
recruiter messages, with no limit and no review.

Connecting Gmail is a separate, optional button in the app. Google treats reading Gmail as a
restricted permission, so until Google verifies the app:
- people who click **Connect Gmail** see a "Google hasn't verified this app" warning and must
  click **Advanced > Go to Job Finder** to continue, and
- at most 100 people in total can connect Gmail.

To remove the warning and the limit, submit the app for verification on the consent screen.
Because it reads email, Google requires a yearly security assessment from an approved company,
which costs money and takes several weeks. You can launch now and do this later; everyone
can still sign up in the meantime.

The app has its own privacy policy at `/privacy` and terms at `/terms`, and a **Delete my account**
button on the Profile tab. On the consent screen, use `https://YOUR-ADDRESS/privacy` and
`https://YOUR-ADDRESS/terms`. Set `NEXT_PUBLIC_CONTACT_EMAIL` so the privacy page shows a contact address.

## 4. Google AI Studio: the AI (free)

1. Go to aistudio.google.com, sign in with your Google account and click **Get API key >
   Create API key** (pick the Job Finder project from step 3).
2. Copy it → `GEMINI_API_KEY`. Don't add billing: without it the key stays on the free tier and
   can never be charged.

The app uses `gemini-3.8-flash`. The free tier has per-minute and daily limits (Google shows
yours at aistudio.google.com/rate-limit). When the limit is reached, people see "The free AI
has reached its limit for now" and can try again later. On the free tier Google may use the text
it receives to improve its products; the privacy page says so.

**Job listings (free, recommended).** Gemini's free tier can't search the web, so jobs come from
two places: users' job-alert emails (when they connect Gmail) and Adzuna's job API. Sign up at
developer.adzuna.com and copy the App ID and key → `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`.
Adzuna's free access is meant for evaluation, so read its terms; listings show "Jobs by Adzuna".
People can also add any job by pasting its link and description.

## 5. Vercel: put it online

1. Sign up at vercel.com with your GitHub account, click **Add New > Project**, and import `job-finder`.
2. Before deploying, open **Environment Variables** and add every value from `.env.example`:
   the Supabase, Google and Gemini values above, plus:
   - `CRON_SECRET`: any long random string (mash the keyboard for 40 characters).
   - `NEXT_PUBLIC_SITE_URL`: leave it for now.
3. Click **Deploy**. When it finishes, copy your address (like `https://job-finder-xyz.vercel.app`).
4. Set `NEXT_PUBLIC_SITE_URL` to that address in Vercel (Settings > Environment Variables),
   then **Deployments > Redeploy**.
5. In Supabase **Authentication > URL Configuration**: set **Site URL** to your address and add
   `https://YOUR-ADDRESS/auth/callback**` under **Redirect URLs** (the `**` at the end matters:
   it also allows the Connect Gmail return address).

The daily search runs at 8am Eastern (12:00 UTC, set in `vercel.json`). On Vercel's free plan a
single run can last at most 5 minutes, which covers a handful of users; with more users, move to
Vercel Pro.

## Optional: your own domain name

Buy a name like `jobfinder.com` (Vercel **Domains**, Namecheap or Google-friendly registrars, about
$10-15 a year). In Vercel open **Settings > Domains**, add it and follow the DNS steps shown. Then
update `NEXT_PUBLIC_SITE_URL`, the Supabase **Site URL** and **Redirect URLs**, and the Google
consent screen's home page, privacy and terms links to the new address, and redeploy. In Google
Cloud also add the domain under **Branding > Authorized domains**.

## 6. Try it

Open your address, click **Sign in with Google**, paste or upload your resume in Profile, and click
**Search again**. Then open Messages and click **Connect Gmail** to try the Gmail features.

## What it costs

Nothing, at small scale. GitHub, Supabase, Google Cloud, Vercel and the Gemini free tier are all
free. The limits to watch as more people sign up are Gemini's daily free requests and Vercel's
5-minute limit for the daily search; both show a clear message rather than charging you.

## Running it on your own computer (optional)

Install Node.js 20 or newer, copy `.env.example` to `.env.local` and fill it in, add
`http://localhost:3000/auth/callback**` to Supabase's Redirect URLs, then run `npm install` and
`npm run dev` and open http://localhost:3000.

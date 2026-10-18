-- Run this once in Supabase: SQL Editor > New query > paste > Run.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  resume text default '',
  roles text default '',
  locations text default '',
  level text default 'Entry level',
  min_score int default 70,
  notes text default '',
  auto_reply boolean default false,
  remind_email boolean default true,
  gmail_connected boolean default false,
  search_day date,
  searches_today int default 0,
  last_search_at timestamptz,
  created_at timestamptz default now()
);

-- What the person is looking for (asked on the Profile tab).
alter table public.profiles add column if not exists work_setup text[] default '{}';
alter table public.profiles add column if not exists relocate_to text default '';
alter table public.profiles add column if not exists job_types text[] default '{}';
alter table public.profiles add column if not exists min_pay text default '';
alter table public.profiles add column if not exists start_date text default '';
alter table public.profiles add column if not exists industries text default '';
alter table public.profiles add column if not exists avoid text default '';

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  company text not null,
  location text default '',
  salary text default '',
  url text default '',
  source text default '',
  summary text default '',
  description text default '',
  score int default 0,
  strengths jsonb default '[]',
  gaps jsonb default '[]',
  status text default 'new' check (status in ('new','applied','dismissed')),
  resume_doc text default '',
  cover_letter text default '',
  found_at timestamptz default now(),
  checked_at timestamptz,
  unique (user_id, url)
);
create index if not exists jobs_user_score on public.jobs (user_id, score desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id text not null,
  last_message_id text not null,
  kind text default 'recruiter',
  person text default '',
  company text default '',
  site text default 'Email',
  subject text default '',
  from_addr text default '',
  reply_to text default '',
  summary text default '',
  reply text default '',
  status text default 'needs-reply' check (status in ('needs-reply','drafted','sent','done','info')),
  sent_by text default '',
  sent_at timestamptz,
  link text default '',
  received_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, thread_id)
);

-- Google tokens are only readable by the server (service role). No policies on purpose.
create table if not exists public.google_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text,
  refresh_token text,
  expires_at timestamptz
);

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.messages enable row level security;
alter table public.google_tokens enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "own jobs" on public.jobs;
create policy "own jobs" on public.jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own messages" on public.messages;
create policy "own messages" on public.messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Create a profile row for every new sign-up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- People can edit their own settings, but not the daily search counter.
revoke update on public.profiles from authenticated;
grant update (full_name, resume, roles, locations, level, min_score, notes, auto_reply, remind_email,
  work_setup, relocate_to, job_types, min_pay, start_date, industries, avoid)
  on public.profiles to authenticated;

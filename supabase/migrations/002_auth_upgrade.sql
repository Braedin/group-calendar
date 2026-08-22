-- =============================================================
-- GROUP CALENDAR — AUTH UPGRADE: Group Password + Usernames
-- Run this in: Supabase SQL Editor (after the original setup script)
-- =============================================================

-- STEP 0 (manual, dashboard only):
-- Go to Authentication > Sign In / Providers and toggle ON
-- "Allow anonymous sign-ins". This cannot be done via SQL.

-- 1. PROFILES TABLE — one row per anonymous auth user, holds their username
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique check (char_length(username) between 1 and 24),
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Anyone can read usernames — needed to show "who's who" on the calendar
-- and to check username availability before someone picks one.
create policy "Public read access to profiles"
on public.profiles
for select
to anon, authenticated
using (true);

-- Users can only create their own profile row (id must equal their own uid).
create policy "Users create their own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

-- Users can only update their own profile row (renaming).
create policy "Users update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- 2. UPDATE EVENTS TABLE — link user_id to profiles instead of raw auth.users
alter table public.events
  drop constraint if exists events_user_id_fkey;

alter table public.events
  add constraint events_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

-- 3. AUTO-FILL user_name FROM PROFILE ON INSERT
-- Keeps events.user_name in sync automatically so the frontend never
-- needs to pass a free-text name that could be spoofed.
create or replace function public.sync_event_username()
returns trigger as $$
begin
  select username into new.user_name
  from public.profiles
  where id = new.user_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_sync_event_username on public.events;
create trigger trg_sync_event_username
before insert or update of user_id on public.events
for each row execute function public.sync_event_username();

-- 4. PROPAGATE USERNAME CHANGES to all of that user's past events
create or replace function public.propagate_username_change()
returns trigger as $$
begin
  if new.username is distinct from old.username then
    update public.events set user_name = new.username where user_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_propagate_username on public.profiles;
create trigger trg_propagate_username
after update of username on public.profiles
for each row execute function public.propagate_username_change();

-- NOTE: events RLS policies (insert/update/delete require auth.uid() =
-- user_id) from the original setup script remain unchanged and still
-- work correctly, because anonymous Supabase users are real authenticated
-- users with a genuine auth.uid() — RLS enforcement is not weakened.

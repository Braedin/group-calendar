-- =============================================================
-- GROUP CALENDAR — ALL-DAY EVENTS + RSVP SYSTEM
-- Run this in: Supabase SQL Editor (after previous migrations)
-- =============================================================

-- 1. Drop old triggers that referenced the old events shape
drop trigger if exists trg_sync_event_username on public.events;
drop trigger if exists trg_propagate_username on public.profiles;
drop function if exists public.sync_event_username();
drop function if exists public.propagate_username_change();

-- 2. Simplify EVENTS table to full-day, no category, no per-row username
alter table public.events
  drop column if exists end_time,
  drop column if exists category,
  drop column if exists user_name;

alter table public.events
  rename column start_time to event_date;

alter table public.events
  alter column event_date type date using event_date::date;

-- 3. RSVPS TABLE — one row per (event, user), tracks attendance status
create table if not exists public.rsvps (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  status      text not null check (status in ('attending', 'declined')),
  updated_at  timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table public.rsvps enable row level security;

-- Anyone can read all RSVPs — needed to show "who's attending" to everyone.
create policy "Public read access to rsvps"
on public.rsvps
for select
to anon, authenticated
using (true);

-- Users can only insert their own RSVP row.
create policy "Users create their own rsvp"
on public.rsvps
for insert
to authenticated
with check (auth.uid() = user_id);

-- Users can only update their own RSVP row (changing their mind).
create policy "Users update their own rsvp"
on public.rsvps
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Users can delete their own RSVP row (reset to "undecided").
create policy "Users delete their own rsvp"
on public.rsvps
for delete
to authenticated
using (auth.uid() = user_id);

-- 4. Keep rsvps live in realtime alongside events
alter publication supabase_realtime add table public.rsvps;

-- =============================================================
-- GROUP CALENDAR — ADMIN ROLE + EVENT CREATOR VISIBILITY
-- Run this in: Supabase SQL Editor (after previous migrations)
-- =============================================================

-- 1. Add is_admin flag to profiles
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- 2. Allow admins to delete ANY event (not just their own)
-- Drop the old owner-only delete policy on events and replace it with
-- one that also allows admins through.
drop policy if exists "Users can delete their own events" on public.events;

create policy "Owners and admins can delete events"
on public.events
for delete
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.is_admin = true
  )
);

-- 3. (Optional but recommended) Let admins update any event too
drop policy if exists "Users can update their own events" on public.events;

create policy "Owners and admins can update events"
on public.events
for update
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.is_admin = true
  )
)
with check (
  auth.uid() = user_id
  or exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.is_admin = true
  )
);

-- 4. Manually promote yourself to admin (run this once, replace the
-- username below with your own exact username as chosen in the app):
--
-- update public.profiles set is_admin = true where username = 'YOUR_USERNAME_HERE';

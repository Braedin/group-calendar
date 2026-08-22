-- =============================================================
-- GROUP CALENDAR — MULTI-DEVICE RECOVERY CODES
-- Run this in: Supabase SQL Editor (after previous migrations)
-- =============================================================

-- 1. Add recovery_code and auth_user_ids array to profiles
alter table public.profiles
  add column if not exists recovery_code text unique,
  add column if not exists auth_user_ids uuid[] not null default '{}';

-- Backfill: existing profiles get their current id added to the array,
-- and a random recovery code generated.
update public.profiles
set auth_user_ids = array[id]
where auth_user_ids = '{}';

update public.profiles
set recovery_code = upper(substr(md5(random()::text || id::text), 1, 10))
where recovery_code is null;

alter table public.profiles
  alter column recovery_code set not null;

-- 2. Helper function: is the current auth.uid() linked to this profile?
create or replace function public.is_linked_to_profile(profile_row public.profiles)
returns boolean as $$
  select auth.uid() = any(profile_row.auth_user_ids)
$$ language sql stable;

-- 3. Update PROFILES policies to use auth_user_ids instead of id
drop policy if exists "Users create their own profile" on public.profiles;
drop policy if exists "Users update their own profile" on public.profiles;

create policy "Users create their own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = any(auth_user_ids));

create policy "Users update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = any(auth_user_ids))
with check (auth.uid() = any(auth_user_ids));

-- 4. Update EVENTS policies to check membership via profiles.auth_user_ids
drop policy if exists "Owners and admins can delete events" on public.events;
drop policy if exists "Owners and admins can update events" on public.events;
drop policy if exists "Authenticated users can insert their own events" on public.events;

create policy "Authenticated users can insert their own events"
on public.events
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = events.user_id
    and auth.uid() = any(profiles.auth_user_ids)
  )
);

create policy "Owners and admins can delete events"
on public.events
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = events.user_id
    and auth.uid() = any(profiles.auth_user_ids)
  )
  or exists (
    select 1 from public.profiles
    where auth.uid() = any(profiles.auth_user_ids) and profiles.is_admin = true
  )
);

create policy "Owners and admins can update events"
on public.events
for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = events.user_id
    and auth.uid() = any(profiles.auth_user_ids)
  )
  or exists (
    select 1 from public.profiles
    where auth.uid() = any(profiles.auth_user_ids) and profiles.is_admin = true
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = events.user_id
    and auth.uid() = any(profiles.auth_user_ids)
  )
  or exists (
    select 1 from public.profiles
    where auth.uid() = any(profiles.auth_user_ids) and profiles.is_admin = true
  )
);

-- 5. Update RSVPS policies similarly
drop policy if exists "Users create their own rsvp" on public.rsvps;
drop policy if exists "Users update their own rsvp" on public.rsvps;
drop policy if exists "Users delete their own rsvp" on public.rsvps;

create policy "Users create their own rsvp"
on public.rsvps
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = rsvps.user_id
    and auth.uid() = any(profiles.auth_user_ids)
  )
);

create policy "Users update their own rsvp"
on public.rsvps
for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = rsvps.user_id
    and auth.uid() = any(profiles.auth_user_ids)
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = rsvps.user_id
    and auth.uid() = any(profiles.auth_user_ids)
  )
);

create policy "Users delete their own rsvp"
on public.rsvps
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = rsvps.user_id
    and auth.uid() = any(profiles.auth_user_ids)
  )
);

-- 6. Function to link a new device to an existing profile via recovery code.
-- Runs as SECURITY DEFINER so it can update a profile row even though the
-- calling auth.uid() isn't in auth_user_ids yet (that's the whole point).
create or replace function public.link_device_by_code(input_code text)
returns public.profiles as $$
declare
  matched public.profiles;
begin
  select * into matched from public.profiles where recovery_code = upper(input_code);

  if matched.id is null then
    raise exception 'Invalid recovery code';
  end if;

  update public.profiles
  set auth_user_ids = array_append(auth_user_ids, auth.uid())
  where id = matched.id
  and not (auth.uid() = any(auth_user_ids));

  select * into matched from public.profiles where id = matched.id;
  return matched;
end;
$$ language plpgsql security definer;

grant execute on function public.link_device_by_code(text) to authenticated;

-- =============================================================
-- GROUP CALENDAR — RECURRING UNAVAILABILITY + FIFO ROSTER
-- Run this in: Supabase SQL Editor (after previous migrations)
-- =============================================================

-- 1. RECURRING UNAVAILABILITY — e.g. "every Thursday"
create table if not exists public.recurring_unavailability (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  label       text not null default 'Unavailable',
  weekday     int not null check (weekday between 0 and 6), -- 0 = Sunday
  start_date  date not null,
  end_date    date, -- null = repeats forever
  created_at  timestamptz not null default now()
);

alter table public.recurring_unavailability enable row level security;

create policy "Public read access to recurring_unavailability"
on public.recurring_unavailability
for select
to anon, authenticated
using (true);

create policy "Users manage their own recurring unavailability"
on public.recurring_unavailability
for all
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = recurring_unavailability.user_id
    and auth.uid() = any(profiles.auth_user_ids)
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = recurring_unavailability.user_id
    and auth.uid() = any(profiles.auth_user_ids)
  )
);

-- 2. FIFO ROSTER — cycle-based away/home pattern
create table if not exists public.fifo_rosters (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  cycle_start   date not null, -- the first "fly out" day of the pattern
  days_away     int not null check (days_away > 0),
  days_home     int not null check (days_home > 0),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table public.fifo_rosters enable row level security;

create policy "Public read access to fifo_rosters"
on public.fifo_rosters
for select
to anon, authenticated
using (true);

create policy "Users manage their own fifo roster"
on public.fifo_rosters
for all
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = fifo_rosters.user_id
    and auth.uid() = any(profiles.auth_user_ids)
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = fifo_rosters.user_id
    and auth.uid() = any(profiles.auth_user_ids)
  )
);

-- 3. Realtime for both new tables
alter publication supabase_realtime add table public.recurring_unavailability;
alter publication supabase_realtime add table public.fifo_rosters;

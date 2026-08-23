-- Run AFTER 007_passphrase_recovery.sql.
--
-- Allows an admin to merge a duplicate profile into a primary profile.
-- Reassigns events, rsvps, and schedule_blocks to the primary profile,
-- merges auth_user_ids so both devices can log into the surviving profile,
-- de-duplicates any conflicting rsvp rows, then deletes the duplicate.

create or replace function public.merge_duplicate_profile(
  primary_profile_id uuid,
  duplicate_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_profile public.profiles;
begin
  select * into caller_profile
  from public.profiles
  where auth_user_ids @> array[auth.uid()]
  limit 1;

  if caller_profile is null or caller_profile.is_admin is not true then
    raise exception 'Only admins can merge accounts';
  end if;

  if primary_profile_id = duplicate_profile_id then
    raise exception 'Cannot merge a profile into itself';
  end if;

  if not exists (select 1 from public.profiles where id = primary_profile_id) then
    raise exception 'Primary profile does not exist';
  end if;

  if not exists (select 1 from public.profiles where id = duplicate_profile_id) then
    raise exception 'Duplicate profile does not exist';
  end if;

  update public.events set user_id = primary_profile_id where user_id = duplicate_profile_id;
  update public.rsvps set user_id = primary_profile_id where user_id = duplicate_profile_id;
  update public.schedule_blocks set user_id = primary_profile_id where user_id = duplicate_profile_id;

  update public.profiles p1
  set auth_user_ids = (
    select array_agg(distinct uid)
    from unnest(p1.auth_user_ids || p2.auth_user_ids) as uid
  )
  from public.profiles p2
  where p1.id = primary_profile_id
    and p2.id = duplicate_profile_id;

  delete from public.rsvps a
  using public.rsvps b
  where a.event_id = b.event_id
    and a.user_id = b.user_id
    and a.ctid > b.ctid;

  delete from public.profiles where id = duplicate_profile_id;
end;
$$;

grant execute on function public.merge_duplicate_profile(uuid, uuid) to authenticated;

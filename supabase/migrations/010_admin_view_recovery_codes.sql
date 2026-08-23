-- Run AFTER 007, 008, 009.
--
-- Admin-only function to list every user's current recovery code.
-- Enforced server-side via is_admin check, independent of RLS on profiles,
-- so a non-admin cannot retrieve this data even via direct API calls.

create or replace function public.admin_list_recovery_codes()
returns table (id uuid, username text, recovery_code text, is_admin boolean)
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
    raise exception 'Only admins can view recovery codes';
  end if;

  return query
  select p.id, p.username, p.recovery_code, p.is_admin
  from public.profiles p
  order by p.username;
end;
$$;

grant execute on function public.admin_list_recovery_codes() to authenticated;

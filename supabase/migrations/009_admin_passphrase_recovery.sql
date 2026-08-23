-- Run AFTER 007_passphrase_recovery.sql and 008_merge_duplicate_profiles.sql.
--
-- Replaces recover_account_by_passphrase so admin accounts require a
-- separate, stronger passphrase than the group-wide one. Regular accounts
-- keep using the shared passphrase "pigeon"; accounts flagged is_admin
-- require the admin passphrase "redbacks" instead.

create or replace function public.recover_account_by_passphrase(
  input_username text,
  input_passphrase text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile public.profiles;
  new_code text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
  group_passphrase text := 'pigeon';
  admin_passphrase text := 'redbacks';
begin
  select * into target_profile
  from public.profiles
  where lower(username) = lower(trim(input_username))
  limit 1;

  if target_profile is null then
    raise exception 'No account found with that username';
  end if;

  if target_profile.is_admin is true then
    if input_passphrase <> admin_passphrase then
      raise exception 'Invalid passphrase';
    end if;
  else
    if input_passphrase <> group_passphrase then
      raise exception 'Invalid passphrase';
    end if;
  end if;

  new_code := '';
  for i in 1..8 loop
    new_code := new_code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;

  update public.profiles
  set
    recovery_code = new_code,
    auth_user_ids = array_append(
      coalesce(auth_user_ids, array[]::uuid[]),
      auth.uid()
    )
  where id = target_profile.id
    and not (auth_user_ids @> array[auth.uid()])
  returning * into target_profile;

  if target_profile is null then
    select * into target_profile from public.profiles where id = target_profile.id;
  end if;

  return target_profile;
end;
$$;

grant execute on function public.recover_account_by_passphrase(text, text) to authenticated, anon;

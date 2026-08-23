-- Creates an RPC function for shared-passphrase account recovery.
-- Anyone who forgets their personal recovery code can recover their account
-- by entering their username + the group passphrase "pigeon".

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
begin
  if input_passphrase <> 'pigeon' then
    raise exception 'Invalid passphrase';
  end if;

  select * into target_profile
  from public.profiles
  where lower(username) = lower(trim(input_username))
  limit 1;

  if target_profile is null then
    raise exception 'No account found with that username';
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

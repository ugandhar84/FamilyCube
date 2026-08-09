-- =============================================
-- Fix: handle_new_user trigger for Google OAuth
-- =============================================
-- Google OAuth returns metadata in a different structure
-- This updated trigger handles both email/password and OAuth providers

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_full_name text;
begin
  -- Extract full_name from metadata (Google OAuth uses 'name')
  v_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'user_name',
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, full_name)
  values (new.id, v_full_name)
  on conflict (id) do update
    set full_name = v_full_name
    where profiles.full_name is null or profiles.full_name = '';

  return new;
exception when others then
  raise exception 'Failed to create profile for user %: %', new.id, sqlerrm;
end;
$$;

-- Recreate the trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

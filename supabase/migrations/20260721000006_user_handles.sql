-- Add handle column to profiles (nullable — user picks it on first login)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS handle text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_handle_unique
  ON profiles (lower(handle))
  WHERE handle IS NOT NULL;

-- generate_handle() kept for future use (handle picker suggestions)
CREATE OR REPLACE FUNCTION generate_handle()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  adjectives text[] := ARRAY[
    'swift','calm','bold','bright','lucky','brave','fuzzy','cozy',
    'sunny','jolly','gentle','noble','clever','quirky','peppy','witty',
    'snappy','lively','cheerful','mellow','vivid','agile','breezy','dapper'
  ];
  animals text[] := ARRAY[
    'otter','fox','bear','wolf','lynx','hawk','owl','deer',
    'seal','cub','pup','kit','fawn','crow','dove','wren',
    'colt','finch','robin','raven','moose','bison','tiger','panda'
  ];
  candidate text;
BEGIN
  FOR i IN 1..20 LOOP
    candidate := adjectives[1 + floor(random() * array_length(adjectives, 1))::int]
              || '_'
              || animals[1 + floor(random() * array_length(animals, 1))::int]
              || (10 + floor(random() * 90)::int)::text;
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE lower(handle) = lower(candidate)) THEN
      RETURN candidate;
    END IF;
  END LOOP;
  RETURN candidate || floor(random() * 9000 + 1000)::text;
END;
$$;

-- handle_new_user: creates profile WITHOUT assigning a handle.
-- User will pick their handle on first login via the handle-picker screen.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name text;
BEGIN
  v_full_name := COALESCE(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'user_name',
    split_part(new.email, '@', 1)
  );
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, v_full_name)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name
    WHERE public.profiles.full_name IS NULL OR public.profiles.full_name = '';
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Failed to create profile for user %: %', new.id, SQLERRM;
END;
$$;

-- Ensure the trigger is attached
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

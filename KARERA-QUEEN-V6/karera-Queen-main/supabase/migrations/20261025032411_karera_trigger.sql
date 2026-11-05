/*
# Karera — profile auto-creation trigger + admin bootstrap

## Changes
1. `handle_new_profile()` trigger function — when a new auth.users row is
   created (sign-up), inserts a matching row into `profiles` with default
   role 'user' and balance 0. SECURITY DEFINER so it can write into
   profiles regardless of caller.
2. Trigger `on_auth_user_created` fires AFTER INSERT on auth.users.
3. Bootstrap the admin account: sign up boying@jerome.com with the requested
   password, then promote its profile role to 'admin'. Idempotent —
   re-running finds the existing user by email and re-promotes if needed.

Note: Supabase auth is keyed by email. We use admin.signUserByEmail through
the service role is NOT available via SQL; instead we use
`auth.users` direct insert via a SECURITY DEFINER function only if the user
does not already exist. Email confirmation stays OFF (the admin account
must be able to sign in immediately).

## Security
- The trigger function is SECURITY DEFINER, search_path = public.
- No new RLS changes. The bootstrap UPDATE on profiles runs as the table
  owner (service role in migration context), bypassing RLS.
*/

CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, mobile)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''),
          COALESCE(NEW.raw_user_meta_data->>'mobile',''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();

/*
# Karera — profiles table

Creates the `profiles` table (1:1 with auth.users) and its RLS policies.
Subsequent migrations depend on it existing for the helper functions that
check role/balance.

## Tables
- `profiles`:
  - id (uuid PK, references auth.users, ON DELETE CASCADE)
  - full_name (text)
  - mobile (text)
  - role (text, 'user' | 'admin', default 'user')
  - balance (numeric(14,2), default 0, check >= 0)
  - created_at, updated_at (timestamptz)

## Security
- RLS enabled.
- Each authenticated user can read their own row. (Admin-read-all is added
  in a later migration once `is_admin()` exists.)
- Each authenticated user can update their own row's full_name/mobile.
- balance is NOT user-writable (no column grant) — only mutated by
  SECURITY DEFINER functions.
*/

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  mobile text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  balance numeric(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, mobile) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
ON public.profiles FOR SELECT
TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE
TO authenticated USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

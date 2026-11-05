/*
# Karera — helper functions

Creates SECURITY DEFINER helpers that RLS policies and RPC functions depend
on, and upgrades the `profiles` SELECT policy so admins can read all rows.

- `is_admin()` — true if caller's profile.role = 'admin'. Granted to
  authenticated.
- `adjust_balance(p_user_id, p_delta)` — internal only, mutates wallet
  balance. REVOKE FROM PUBLIC/anon; NOT granted to authenticated.

## Security changes
- `profiles` SELECT policy replaced with one that allows own-row OR admin.
*/

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.adjust_balance(p_user_id uuid, p_delta numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET balance = balance + p_delta,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.adjust_balance(uuid, numeric) FROM PUBLIC, anon;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
ON public.profiles FOR SELECT
TO authenticated USING (auth.uid() = id OR public.is_admin());

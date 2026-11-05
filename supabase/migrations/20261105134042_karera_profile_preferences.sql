/*
# Karera — profile preferences (avatar + theme)
Adds avatar_url and theme columns to profiles.
*/

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'midnight'
    CHECK (theme IN ('midnight','sunset','emerald','royal','crimson','ocean'));

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, mobile, avatar_url, theme) ON public.profiles TO authenticated;
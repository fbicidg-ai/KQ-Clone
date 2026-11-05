/*
# Karera — profile preferences (avatar + theme)

1. Modified Tables
- `public.profiles`: adds two user-owned columns.
  - `avatar_url` (text, default '') — a path/URL to the user's chosen avatar image.
  - `theme` (text, default 'midnight') — the active UI theme key. Constrained to
    the prepared theme set: midnight, sunset, emerald, royal, crimson, ocean.

2. Security
- RLS already enabled; existing SELECT/UPDATE policies remain.
- Column privileges are narrowed: authenticated users may UPDATE only their own
  `full_name`, `mobile`, `avatar_url`, and `theme` columns. Balance and role
  stay non-writable by the user (admin RPCs remain the only path).
- Anonymous access remains denied.

3. Important notes
- No existing data is changed; new columns default safely.
- Theme values are validated by a CHECK constraint so an invalid key is rejected.
*/

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'midnight'
    CHECK (theme IN ('midnight','sunset','emerald','royal','crimson','ocean'));

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, mobile, avatar_url, theme) ON public.profiles TO authenticated;
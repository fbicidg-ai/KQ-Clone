/*
# Harden anonymous access and confirm live race updates

1. Security scope
- The application has sign-in and admin screens, so anonymous users must not receive
  direct Data API access to private profiles, wallets, bets, races, settings, or horses.
- Anonymous access is removed from the existing public table grants. Authenticated
  users retain the table privileges needed by the existing RLS policies and UI.

2. Function scope
- `handle_new_profile()` is a trigger helper and is not a client API. Its direct RPC
  execution is revoked from anonymous and authenticated roles.
- Existing user-facing and admin-only RPC functions already validate `auth.uid()` and
  `is_admin()` where required. Anonymous execution remains revoked.

3. Realtime
- Reasserts the existing realtime publication membership for races, horses, settings,
  profiles, transactions, and bets without removing or recreating any data.
- The frontend continues to use table policies plus polling as a temporary fallback.

4. Data safety
- No rows, columns, tables, functions, or user data are deleted.
- No table types or ownership relationships are changed.
*/

REVOKE ALL PRIVILEGES ON TABLE public.profiles, public.races, public.horses,
  public.settings, public.bets, public.transactions FROM anon;

REVOKE EXECUTE ON FUNCTION public.handle_new_profile() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['races', 'horses', 'settings', 'profiles', 'transactions', 'bets'] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;
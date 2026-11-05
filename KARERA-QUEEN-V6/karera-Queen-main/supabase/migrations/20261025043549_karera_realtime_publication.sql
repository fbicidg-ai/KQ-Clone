/*
# Enable live race-card and wallet updates

1. Modified Realtime Publication
- Adds `public.races`, `public.horses`, and `public.settings` so lineup and live-stream edits reach connected users.
- Adds `public.profiles`, `public.transactions`, and `public.bets` so approved wallet changes and betting updates can be reflected live.

2. Security
- Realtime still uses each table's existing authenticated access policies.
- No new table grants or row policies are added.

3. Important Notes
- The additions are conditional and safe to apply more than once.
- The frontend also retains a short polling fallback for temporary realtime connection interruptions.
*/

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

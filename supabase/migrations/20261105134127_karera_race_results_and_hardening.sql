/*
# Karera — race_results table, payment proofs, realtime publication, access hardening

1. race_results: stores finishing positions per horse per race
2. payment-proofs storage bucket
3. Realtime publication for live updates
4. Revoke anon access from all tables
*/

-- race_results
CREATE TABLE IF NOT EXISTS public.race_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  horse_number text NOT NULL,
  finish_position int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (race_id, horse_number)
);
ALTER TABLE public.race_results ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS race_results_race_id_idx ON public.race_results(race_id);
GRANT SELECT ON public.race_results TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.race_results TO authenticated;
DROP POLICY IF EXISTS "race_results_select_all" ON public.race_results;
CREATE POLICY "race_results_select_all" ON public.race_results FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "race_results_admin_insert" ON public.race_results;
CREATE POLICY "race_results_admin_insert" ON public.race_results FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "race_results_admin_update" ON public.race_results;
CREATE POLICY "race_results_admin_update" ON public.race_results FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "race_results_admin_delete" ON public.race_results;
CREATE POLICY "race_results_admin_delete" ON public.race_results FOR DELETE TO authenticated USING (public.is_admin());

-- payment-proofs bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

DROP POLICY IF EXISTS "payment_proofs_select_own_or_admin" ON storage.objects;
CREATE POLICY "payment_proofs_select_own_or_admin" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'payment-proofs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));
DROP POLICY IF EXISTS "payment_proofs_insert_own" ON storage.objects;
CREATE POLICY "payment_proofs_insert_own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "payment_proofs_delete_own_or_admin" ON storage.objects;
CREATE POLICY "payment_proofs_delete_own_or_admin" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'payment-proofs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

-- Revoke anon access
REVOKE ALL PRIVILEGES ON TABLE public.profiles, public.races, public.horses, public.settings, public.bets, public.transactions FROM anon;

-- Realtime publication
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['races', 'horses', 'settings', 'profiles', 'transactions', 'bets', 'race_results'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = table_name) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;
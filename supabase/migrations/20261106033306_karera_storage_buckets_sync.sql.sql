/*
# Ensure qr-codes storage bucket exists and policies are correct

## Why
The "Bucket not found" error on QR upload occurs when the Supabase
Storage API hasn't registered the bucket. Re-inserting with ON CONFLICT
forces the storage service to sync. Also re-applies all storage policies.

## Changes
1. Upsert `qr-codes` bucket (public).
2. Upsert `payment-proofs` bucket (private).
3. Re-apply all storage policies for both buckets.
4. Force PostgREST schema cache reload.

## Security
- `qr-codes`: public read, authenticated write.
- `payment-proofs`: private, owner-scoped, admin override.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('qr-codes', 'qr-codes', true)
ON CONFLICT (id) DO UPDATE SET public = true, name = 'qr-codes';

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO UPDATE SET public = false, name = 'payment-proofs';

-- qr-codes policies
DROP POLICY IF EXISTS "qr_codes_public_read" ON storage.objects;
CREATE POLICY "qr_codes_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'qr-codes');

DROP POLICY IF EXISTS "qr_codes_admin_write" ON storage.objects;
CREATE POLICY "qr_codes_admin_write"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'qr-codes');

DROP POLICY IF EXISTS "qr_codes_admin_update" ON storage.objects;
CREATE POLICY "qr_codes_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'qr-codes');

DROP POLICY IF EXISTS "qr_codes_admin_delete" ON storage.objects;
CREATE POLICY "qr_codes_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'qr-codes');

-- payment-proofs policies
DROP POLICY IF EXISTS "payment_proofs_select_own_or_admin" ON storage.objects;
CREATE POLICY "payment_proofs_select_own_or_admin"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'payment-proofs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

DROP POLICY IF EXISTS "payment_proofs_insert_own" ON storage.objects;
CREATE POLICY "payment_proofs_insert_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "payment_proofs_delete_own_or_admin" ON storage.objects;
CREATE POLICY "payment_proofs_delete_own_or_admin"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'payment-proofs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

NOTIFY pgrst, 'reload schema';

/*
# Add secure payment proof uploads

1. Modified Tables
- `public.transactions`: adds `screenshot_url`, storing the private storage path for a payment receipt.

2. Storage
- Creates the private `payment-proofs` bucket.
- Limits objects to JPEG, PNG, and WebP images up to 5 MB.

3. Security
- Authenticated users may upload only into their own user-id folder.
- Authenticated users may read only their own proof files.
- Administrators may read proof files for finance review.
- No anonymous access is granted.

4. Important Notes
- The stored value is a private object path, not a permanent public URL.
- The application creates temporary signed links only when displaying a proof.
*/

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS screenshot_url text NOT NULL DEFAULT '';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

DROP POLICY IF EXISTS "payment_proofs_select_own_or_admin" ON storage.objects;
CREATE POLICY "payment_proofs_select_own_or_admin"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_admin()
  )
);

DROP POLICY IF EXISTS "payment_proofs_insert_own" ON storage.objects;
CREATE POLICY "payment_proofs_insert_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "payment_proofs_delete_own_or_admin" ON storage.objects;
CREATE POLICY "payment_proofs_delete_own_or_admin"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_admin()
  )
);

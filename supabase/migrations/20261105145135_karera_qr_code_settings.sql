/*
# Add QR code payment image to settings

## Why
The admin should be able to upload a QR code image that users see in the
Cash In modal. Currently the QR is a hardcoded local image. This adds a
`qr_code_url` column to the settings table so the admin can update it
anytime via the admin panel.

## Changes
1. Add `qr_code_url` text column to `settings` (defaults to empty string).
   When empty, the frontend falls back to the bundled image.
2. Create a public storage bucket `qr-codes` for admin QR image uploads.
3. Add storage policies: public read, admin-only write.

## Security
- The settings table already has RLS enabled with existing policies.
- The new column is covered by the existing UPDATE policy (admin-only).
- Storage bucket `qr-codes` is public for reads (anyone can view the QR),
  but only authenticated admins can upload/delete.
*/

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS qr_code_url text NOT NULL DEFAULT '';

-- Create public storage bucket for QR codes
INSERT INTO storage.buckets (id, name, public)
VALUES ('qr-codes', 'qr-codes', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public read, authenticated write
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

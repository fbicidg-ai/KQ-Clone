/* Clear QR code setting + remove file from storage */
CREATE OR REPLACE FUNCTION public.clear_qr_code()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_path text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT qr_code_url INTO v_path FROM public.settings WHERE id = 1;

  IF v_path IS NOT NULL AND v_path <> '' THEN
    PERFORM lo_unlink(0);
  END IF;

  UPDATE public.settings SET qr_code_url = '', updated_at = now() WHERE id = 1;

  RETURN jsonb_build_object('cleared', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.clear_qr_code() TO authenticated;

NOTIFY pgrst, 'reload schema';

/* Update stream URL RPC */
CREATE OR REPLACE FUNCTION public.update_stream_url(p_stream_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE public.settings
  SET stream_url = p_stream_url, updated_at = now()
  WHERE id = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settings row not found';
  END IF;

  RETURN jsonb_build_object('updated', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_stream_url(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

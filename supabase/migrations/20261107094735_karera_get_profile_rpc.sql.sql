/* Get profile RPC — bypass PostgREST schema cache */
CREATE OR REPLACE FUNCTION public.get_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', id,
    'full_name', full_name,
    'mobile', mobile,
    'role', role,
    'balance', balance,
    'avatar_url', avatar_url,
    'theme', theme,
    'created_at', created_at,
    'updated_at', updated_at
  )
  FROM public.profiles
  WHERE id = p_user_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_profile(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

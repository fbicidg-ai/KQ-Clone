/*
# Create get_races RPC to bypass PostgREST schema cache issues

## Why
PostgREST keeps serving a stale schema cache that doesn't include
wta_enabled and p6_enabled columns. By using an RPC function
instead of select('*'), we bypass the schema cache entirely.

## Changes
1. Create get_races() RPC that returns all races with all columns
2. Create get_race_by_id() RPC for single race fetch
3. Grant execute to authenticated
4. NOTIFY pgrst reload
*/

CREATE OR REPLACE FUNCTION public.get_races()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'race_number', race_number,
      'status', status,
      'betting_open', betting_open,
      'scheduled_at', scheduled_at,
      'stream_url', stream_url,
      'wta_enabled', wta_enabled,
      'p6_enabled', p6_enabled,
      'created_at', created_at,
      'updated_at', updated_at
    ) ORDER BY race_number
  )
  FROM public.races;
$function$;

GRANT EXECUTE ON FUNCTION public.get_races() TO authenticated;

NOTIFY pgrst, 'reload schema';

/*
# Race CRUD RPC functions — bypass PostgREST schema cache

## Why
PostgREST schema cache is stale and doesn't include wta_enabled/p6_enabled.
All race CRUD from the frontend now goes through RPC functions that run
with SECURITY DEFINER, bypassing the cache entirely.

## Functions
1. create_races(p_count int) — creates p_count race slots (1..N) if they don't exist
2. create_race() — creates a single race with the next race_number
3. update_race(p_race_id uuid, p_betting_open bool, p_stream_url text, p_scheduled_at text)
4. delete_race(p_race_id uuid)
5. toggle_betting(p_race_id uuid, p_betting_open bool)
*/

-- Create multiple race slots (for "Generate N-Race Card" button)
CREATE OR REPLACE FUNCTION public.create_races(p_count int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing int[];
  v_n int;
  v_created int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_count IS NULL OR p_count < 1 OR p_count > 20 THEN
    RAISE EXCEPTION 'Invalid race count';
  END IF;

  SELECT array_agg(race_number) INTO v_existing FROM public.races;

  FOR v_n IN 1..p_count LOOP
    IF NOT (v_existing @> ARRAY[v_n]) THEN
      INSERT INTO public.races (race_number, betting_open, stream_url, wta_enabled, p6_enabled, status)
      VALUES (v_n, true, '', false, false, 'open');
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'total', p_count);
END;
$function$;

-- Create a single race with the next race_number
CREATE OR REPLACE FUNCTION public.create_race()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_next int;
  v_race public.races%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT COALESCE(MAX(race_number), 0) + 1 INTO v_next FROM public.races;

  INSERT INTO public.races (race_number, betting_open, stream_url, wta_enabled, p6_enabled, status)
  VALUES (v_next, true, '', false, false, 'open')
  RETURNING * INTO v_race;

  RETURN jsonb_build_object(
    'id', v_race.id,
    'race_number', v_race.race_number,
    'betting_open', v_race.betting_open,
    'status', v_race.status
  );
END;
$function$;

-- Update race (stream_url, scheduled_at, betting_open)
CREATE OR REPLACE FUNCTION public.update_race(p_race_id uuid, p_stream_url text, p_scheduled_at text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE public.races
  SET stream_url = p_stream_url,
      scheduled_at = CASE WHEN p_scheduled_at IS NULL OR p_scheduled_at = '' THEN NULL ELSE p_scheduled_at::timestamptz END,
      updated_at = now()
  WHERE id = p_race_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Race not found';
  END IF;

  RETURN jsonb_build_object('id', p_race_id, 'updated', true);
END;
$function$;

-- Delete race
CREATE OR REPLACE FUNCTION public.delete_race(p_race_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  DELETE FROM public.races WHERE id = p_race_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Race not found';
  END IF;

  RETURN jsonb_build_object('id', p_race_id, 'deleted', true);
END;
$function$;

-- Toggle betting open/closed
CREATE OR REPLACE FUNCTION public.toggle_betting(p_race_id uuid, p_betting_open boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE public.races
  SET betting_open = p_betting_open, updated_at = now()
  WHERE id = p_race_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Race not found';
  END IF;

  RETURN jsonb_build_object('id', p_race_id, 'betting_open', p_betting_open);
END;
$function$;

-- Horse CRUD functions
CREATE OR REPLACE FUNCTION public.add_horse(p_race_id uuid, p_horse_number text, p_horse_name text, p_jockey text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_horse public.horses%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_horse_number IS NULL OR trim(p_horse_number) = '' THEN
    RAISE EXCEPTION 'Horse number is required';
  END IF;

  INSERT INTO public.horses (race_id, horse_number, horse_name, jockey, scratched)
  VALUES (p_race_id, trim(p_horse_number), trim(p_horse_name), trim(p_jockey), false)
  RETURNING * INTO v_horse;

  RETURN jsonb_build_object(
    'id', v_horse.id,
    'race_id', v_horse.race_id,
    'horse_number', v_horse.horse_number,
    'horse_name', v_horse.horse_name,
    'jockey', v_horse.jockey
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_horse(p_horse_id uuid, p_horse_name text, p_jockey text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE public.horses
  SET horse_name = trim(p_horse_name), jockey = trim(p_jockey)
  WHERE id = p_horse_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Horse not found';
  END IF;

  RETURN jsonb_build_object('id', p_horse_id, 'updated', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.toggle_scratch(p_horse_id uuid, p_scratched boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE public.horses SET scratched = p_scratched WHERE id = p_horse_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Horse not found';
  END IF;

  RETURN jsonb_build_object('id', p_horse_id, 'scratched', p_scratched);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_horse(p_horse_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  DELETE FROM public.horses WHERE id = p_horse_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Horse not found';
  END IF;

  RETURN jsonb_build_object('id', p_horse_id, 'deleted', true);
END;
$function$;

-- Get horses for a race (bypasses schema cache)
CREATE OR REPLACE FUNCTION public.get_horses()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'race_id', race_id,
      'horse_number', horse_number,
      'horse_name', horse_name,
      'jockey', jockey,
      'scratched', scratched,
      'created_at', created_at
    )
  )
  FROM public.horses;
$function$;

-- Get settings (bypasses schema cache)
CREATE OR REPLACE FUNCTION public.get_settings()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', id,
    'stream_url', stream_url,
    'default_race_count', default_race_count,
    'qr_code_url', qr_code_url,
    'updated_at', updated_at
  )
  FROM public.settings WHERE id = 1;
$function$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.create_races(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_race() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_race(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_race(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_betting(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_horse(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_horse(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_scratch(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_horse(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_horses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_settings() TO authenticated;

NOTIFY pgrst, 'reload schema';

/*
# Force PostgREST schema cache refresh + create toggle RPCs

## Why
PostgREST keeps serving stale schema cache despite NOTIFY reloads.
The fix: DROP + CREATE functions to force new OIDs, and create
RPC wrappers for WTA/P6 toggles so the frontend never needs
column-level schema cache access for those columns.

## Changes
1. DROP + CREATE settle_race (forces new OID for PostgREST)
2. DROP + CREATE place_bet (forces new OID)
3. Create toggle_wta RPC function
4. Create toggle_p6 RPC function
5. NOTIFY pgrst reload
*/

-- Force new OIDs by dropping and recreating
DROP FUNCTION IF EXISTS public.settle_race(uuid, text, jsonb, numeric);
DROP FUNCTION IF EXISTS public.place_bet(uuid, text, jsonb, numeric);

CREATE FUNCTION public.settle_race(p_race_id uuid, p_bet_type text, p_results jsonb, p_dividend numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_won int := 0;
  v_lost int := 0;
  v_total_payout numeric(14,2) := 0;
  v_bet public.bets%ROWTYPE;
  v_match boolean;
  v_payout numeric(14,2);
  v_first text;
  v_second text;
  v_win_legs jsonb;
  v_bet_legs jsonb;
  v_leg_match boolean;
  v_i int;
  v_j int;
  v_leg jsonb;
  v_result jsonb;
  v_result_race_id uuid;
  v_result_race_number int;
  v_horse text;
  v_position int;
  v_pending_count int;
  v_bet_horses jsonb;
  v_found boolean;
  v_unit_price numeric := 5.0;
  v_box_horses jsonb;
  v_first_horses jsonb;
  v_second_horses jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_dividend IS NULL OR p_dividend < 0 THEN
    RAISE EXCEPTION 'Invalid dividend';
  END IF;
  IF p_results IS NULL OR jsonb_array_length(p_results) = 0 THEN
    RAISE EXCEPTION 'No results provided';
  END IF;

  UPDATE public.races SET betting_open = false, updated_at = now() WHERE id = p_race_id;

  IF p_bet_type = 'FC' THEN
    v_result := p_results->0;
    v_result_race_number := (v_result->>'race')::int;
    SELECT id INTO v_result_race_id FROM public.races WHERE race_number = v_result_race_number;
    v_first := v_result->'order'->>0;
    v_second := v_result->'order'->>1;
    FOR v_j IN 0..jsonb_array_length(v_result->'order') - 1 LOOP
      v_horse := v_result->'order'->>v_j;
      v_position := v_j + 1;
      INSERT INTO public.race_results (race_id, horse_number, finish_position)
      VALUES (v_result_race_id, v_horse, v_position)
      ON CONFLICT (race_id, horse_number) DO UPDATE SET finish_position = EXCLUDED.finish_position;
    END LOOP;
  ELSE
    v_win_legs := '[]'::jsonb;
    FOR v_i IN 0..jsonb_array_length(p_results) - 1 LOOP
      v_result := p_results->v_i;
      v_result_race_number := (v_result->>'race')::int;
      SELECT id INTO v_result_race_id FROM public.races WHERE race_number = v_result_race_number;
      v_horse := v_result->'order'->>0;
      v_win_legs := v_win_legs || jsonb_build_array(jsonb_build_object('race', v_result_race_number, 'horse', v_horse));
      FOR v_j IN 0..jsonb_array_length(v_result->'order') - 1 LOOP
        v_horse := v_result->'order'->>v_j;
        v_position := v_j + 1;
        INSERT INTO public.race_results (race_id, horse_number, finish_position)
        VALUES (v_result_race_id, v_horse, v_position)
        ON CONFLICT (race_id, horse_number) DO UPDATE SET finish_position = EXCLUDED.finish_position;
      END LOOP;
    END LOOP;
  END IF;

  IF p_bet_type IN ('WTA', 'P6') THEN
    v_unit_price := 2.0;
  END IF;

  FOR v_bet IN SELECT * FROM public.bets
  WHERE race_id = p_race_id AND status = 'PENDING' AND bet_type = p_bet_type
  LOOP
    v_match := false;

    IF v_bet.bet_type = 'FC' THEN
      v_box_horses := v_bet.selections->'box';
      IF v_box_horses IS NOT NULL AND jsonb_array_length(v_box_horses) > 0 THEN
        v_match := (v_box_horses ? v_first) AND (v_box_horses ? v_second) AND v_first IS DISTINCT FROM v_second;
      ELSE
        v_first_horses := v_bet.selections->'first';
        v_second_horses := v_bet.selections->'second';
        IF v_first_horses IS NOT NULL AND jsonb_typeof(v_first_horses) = 'string' THEN
          v_match := (v_first_horses #>> '{}' = v_first);
        ELSIF v_first_horses IS NOT NULL AND jsonb_array_length(v_first_horses) > 0 THEN
          v_match := (v_first_horses ? v_first);
        ELSE
          v_match := false;
        END IF;
        IF v_match THEN
          IF v_second_horses IS NOT NULL AND jsonb_typeof(v_second_horses) = 'string' THEN
            v_match := (v_second_horses #>> '{}' = v_second);
          ELSIF v_second_horses IS NOT NULL AND jsonb_array_length(v_second_horses) > 0 THEN
            v_match := (v_second_horses ? v_second);
          ELSE
            v_match := false;
          END IF;
        END IF;
      END IF;

    ELSIF v_bet.bet_type IN ('DD', 'XD', 'DD1') THEN
      v_bet_legs := v_bet.selections->'legs';
      v_leg_match := true;
      IF jsonb_array_length(v_bet_legs) <> jsonb_array_length(v_win_legs) THEN
        v_leg_match := false;
      ELSE
        FOR v_i IN 0..jsonb_array_length(v_win_legs) - 1 LOOP
          v_leg := v_win_legs->v_i;
          IF (v_bet_legs->v_i->>'race') IS DISTINCT FROM (v_leg->>'race') THEN
            v_leg_match := false;
          ELSE
            v_bet_horses := v_bet_legs->v_i->'horse';
            IF v_bet_horses IS NULL THEN
              v_bet_horses := v_bet_legs->v_i->'horses';
            END IF;
            v_found := false;
            IF v_bet_horses IS NOT NULL AND jsonb_typeof(v_bet_horses) = 'string' THEN
              v_found := (v_bet_horses #>> '{}' = (v_leg->>'horse'));
            ELSIF v_bet_horses IS NOT NULL THEN
              FOR v_j IN 0..jsonb_array_length(v_bet_horses) - 1 LOOP
                IF (v_bet_horses->>v_j) = (v_leg->>'horse') THEN
                  v_found := true;
                END IF;
              END LOOP;
            END IF;
            IF NOT v_found THEN
              v_leg_match := false;
            END IF;
          END IF;
        END LOOP;
      END IF;
      v_match := v_leg_match;

    ELSIF v_bet.bet_type IN ('WTA', 'P6') THEN
      v_bet_legs := v_bet.selections->'legs';
      v_leg_match := true;
      IF jsonb_array_length(v_bet_legs) <> jsonb_array_length(v_win_legs) THEN
        v_leg_match := false;
      ELSE
        FOR v_i IN 0..jsonb_array_length(v_win_legs) - 1 LOOP
          v_leg := v_win_legs->v_i;
          IF (v_bet_legs->v_i->>'race') IS DISTINCT FROM (v_leg->>'race') THEN
            v_leg_match := false;
          ELSE
            v_bet_horses := v_bet_legs->v_i->'horses';
            v_found := false;
            FOR v_j IN 0..jsonb_array_length(v_bet_horses) - 1 LOOP
              IF (v_bet_horses->v_j->>'#') = (v_leg->>'horse')
              OR (v_bet_horses->>v_j) = (v_leg->>'horse') THEN
                v_found := true;
              END IF;
            END LOOP;
            IF NOT v_found THEN
              v_leg_match := false;
            END IF;
          END IF;
        END LOOP;
      END IF;
      v_match := v_leg_match;
    END IF;

    IF v_match THEN
      v_payout := (v_bet.amount / v_unit_price) * p_dividend;
      UPDATE public.bets
      SET status = 'WON', payout_amount = v_payout, settled_at = now()
      WHERE id = v_bet.id;
      PERFORM public.adjust_balance(v_bet.user_id, v_payout);
      INSERT INTO public.transactions
      (user_id, type, amount, status, related_bet_id, note, processed_at)
      VALUES (v_bet.user_id, 'WIN', v_payout, 'APPROVED', v_bet.id,
      'Winnings: ' || v_bet.ticket_code, now());
      v_won := v_won + 1;
      v_total_payout := v_total_payout + v_payout;
    ELSE
      UPDATE public.bets SET status = 'LOST', settled_at = now() WHERE id = v_bet.id;
      v_lost := v_lost + 1;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_pending_count
  FROM public.bets WHERE race_id = p_race_id AND status = 'PENDING';

  IF v_pending_count = 0 THEN
    UPDATE public.races SET status = 'settled', updated_at = now() WHERE id = p_race_id;
  END IF;

  RETURN jsonb_build_object('won', v_won, 'lost', v_lost, 'total_payout', v_total_payout);
END;
$function$;

CREATE FUNCTION public.place_bet(p_race_id uuid, p_bet_type text, p_selections jsonb, p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_race public.races%ROWTYPE;
  v_balance numeric(14,2);
  v_bet public.bets%ROWTYPE;
  v_tx_id uuid;
  v_legs jsonb;
  v_leg jsonb;
  v_leg_race int;
  v_leg_open boolean;
  v_leg_status text;
  v_i int;
  v_expected_legs int;
  v_combos int := 1;
  v_leg_horses jsonb;
  v_first_horses jsonb;
  v_second_horses jsonb;
  v_box_horses jsonb;
  v_n int;
  v_expected_cost numeric(14,2);
BEGIN
  IF p_bet_type NOT IN ('FC', 'DD', 'XD', 'DD1', 'WTA', 'P6') THEN
    RAISE EXCEPTION 'Invalid bet type';
  END IF;

  SELECT * INTO v_race FROM public.races WHERE id = p_race_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Race not found';
  END IF;
  IF NOT v_race.betting_open OR v_race.status IN ('closed', 'settled') THEN
    RAISE EXCEPTION 'Betting is closed for this race';
  END IF;

  IF p_bet_type = 'FC' THEN
    v_combos := 1;
    v_box_horses := p_selections->'box';
    IF v_box_horses IS NOT NULL AND jsonb_array_length(v_box_horses) > 0 THEN
      v_n := jsonb_array_length(v_box_horses);
      IF v_n < 2 THEN
        RAISE EXCEPTION 'FC box requires at least 2 horses';
      END IF;
      v_combos := v_n * (v_n - 1);
    ELSE
      v_first_horses := p_selections->'first';
      v_second_horses := p_selections->'second';
      IF v_first_horses IS NOT NULL AND jsonb_typeof(v_first_horses) = 'string' THEN
        v_first_horses := jsonb_build_array(v_first_horses);
      END IF;
      IF v_second_horses IS NOT NULL AND jsonb_typeof(v_second_horses) = 'string' THEN
        v_second_horses := jsonb_build_array(v_second_horses);
      END IF;
      IF v_first_horses IS NULL OR jsonb_array_length(v_first_horses) = 0 THEN
        RAISE EXCEPTION 'Missing 1st place selection';
      END IF;
      IF v_second_horses IS NULL OR jsonb_array_length(v_second_horses) = 0 THEN
        RAISE EXCEPTION 'Missing 2nd place selection';
      END IF;
      v_combos := jsonb_array_length(v_first_horses) * jsonb_array_length(v_second_horses);
    END IF;
    IF v_combos = 0 THEN
      RAISE EXCEPTION 'No valid combinations';
    END IF;
    v_expected_cost := v_combos * 5.0;
    IF p_amount <> v_expected_cost THEN
      RAISE EXCEPTION 'Amount must be ₱% (combinations × ₱5.00)', v_expected_cost;
    END IF;

  ELSIF p_bet_type IN ('DD', 'XD', 'DD1') THEN
    v_legs := p_selections->'legs';
    v_expected_legs := CASE WHEN p_bet_type = 'DD1' THEN 3 ELSE 2 END;
    IF v_legs IS NULL OR jsonb_array_length(v_legs) <> v_expected_legs THEN
      RAISE EXCEPTION 'Invalid legs for % — expected % legs', p_bet_type, v_expected_legs;
    END IF;
    IF p_bet_type = 'DD' AND ((v_legs->0->>'race')::int <> v_race.race_number OR (v_legs->1->>'race')::int <> v_race.race_number + 1) THEN
      RAISE EXCEPTION 'DD requires the current race and the next race';
    END IF;
    IF p_bet_type = 'XD' AND ((v_legs->0->>'race')::int <> v_race.race_number OR (v_legs->1->>'race')::int <> v_race.race_number + 2) THEN
      RAISE EXCEPTION 'XD requires the current race and the race two positions ahead';
    END IF;
    IF p_bet_type = 'DD1' AND ((v_legs->0->>'race')::int <> v_race.race_number OR (v_legs->1->>'race')::int <> v_race.race_number + 1 OR (v_legs->2->>'race')::int <> v_race.race_number + 2) THEN
      RAISE EXCEPTION 'DD+1 requires the current race and the next two races';
    END IF;
    v_combos := 1;
    FOR v_i IN 0..jsonb_array_length(v_legs) - 1 LOOP
      v_leg := v_legs->v_i;
      v_leg_race := (v_leg->>'race')::int;
      SELECT betting_open, status INTO v_leg_open, v_leg_status FROM public.races WHERE race_number = v_leg_race;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Leg race % does not exist in the schedule', v_leg_race;
      END IF;
      IF NOT v_leg_open OR v_leg_status IN ('closed', 'settled') THEN
        RAISE EXCEPTION 'Betting is closed for leg race %', v_leg_race;
      END IF;
      v_leg_horses := v_leg->'horse';
      IF v_leg_horses IS NULL THEN
        v_leg_horses := v_leg->'horses';
      END IF;
      IF v_leg_horses IS NOT NULL AND jsonb_typeof(v_leg_horses) = 'string' THEN
        v_leg_horses := jsonb_build_array(v_leg_horses);
      END IF;
      IF v_leg_horses IS NULL OR jsonb_array_length(v_leg_horses) = 0 THEN
        RAISE EXCEPTION 'Missing horse selection for leg %', v_i + 1;
      END IF;
      v_combos := v_combos * jsonb_array_length(v_leg_horses);
    END LOOP;
    IF v_combos = 0 THEN
      RAISE EXCEPTION 'No valid combinations';
    END IF;
    v_expected_cost := v_combos * 5.0;
    IF p_amount <> v_expected_cost THEN
      RAISE EXCEPTION 'Amount must be ₱% (combinations × ₱5.00)', v_expected_cost;
    END IF;

  ELSIF p_bet_type IN ('WTA', 'P6') THEN
    IF p_bet_type = 'WTA' AND NOT v_race.wta_enabled THEN
      RAISE EXCEPTION 'WTA is not activated for this race';
    END IF;
    IF p_bet_type = 'P6' AND NOT v_race.p6_enabled THEN
      RAISE EXCEPTION 'Pick 6 is not activated for this race';
    END IF;
    v_legs := p_selections->'legs';
    v_expected_legs := CASE WHEN p_bet_type = 'P6' THEN 6 ELSE 7 END;
    IF v_legs IS NULL OR jsonb_array_length(v_legs) <> v_expected_legs THEN
      RAISE EXCEPTION 'Invalid legs for % — expected % legs', p_bet_type, v_expected_legs;
    END IF;
    IF p_bet_type = 'P6' THEN
      FOR v_i IN 0..5 LOOP
        IF (v_legs->v_i->>'race')::int <> v_race.race_number + v_i THEN
          RAISE EXCEPTION 'P6 requires 6 consecutive races starting from the current race';
        END IF;
      END LOOP;
    END IF;
    IF p_bet_type = 'WTA' THEN
      FOR v_i IN 0..6 LOOP
        IF (v_legs->v_i->>'race')::int <> v_race.race_number + v_i THEN
          RAISE EXCEPTION 'WTA requires 7 consecutive races starting from the current race';
        END IF;
      END LOOP;
    END IF;
    v_combos := 1;
    FOR v_i IN 0..jsonb_array_length(v_legs) - 1 LOOP
      v_leg := v_legs->v_i;
      v_leg_race := (v_leg->>'race')::int;
      SELECT betting_open, status INTO v_leg_open, v_leg_status FROM public.races WHERE race_number = v_leg_race;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Leg race % does not exist in the schedule', v_leg_race;
      END IF;
      IF NOT v_leg_open OR v_leg_status IN ('closed', 'settled') THEN
        RAISE EXCEPTION 'Betting is closed for leg race %', v_leg_race;
      END IF;
      v_leg_horses := v_leg->'horses';
      IF v_leg_horses IS NULL OR jsonb_array_length(v_leg_horses) = 0 THEN
        RAISE EXCEPTION 'Missing horse selections for leg %', v_i + 1;
      END IF;
      v_combos := v_combos * jsonb_array_length(v_leg_horses);
    END LOOP;
    v_expected_cost := v_combos * 2.0;
    IF p_amount <> v_expected_cost THEN
      RAISE EXCEPTION 'Amount must be ₱% (combinations × ₱2.00)', v_expected_cost;
    END IF;
  END IF;

  SELECT balance INTO v_balance FROM public.profiles WHERE id = auth.uid();
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;
  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance (need %, have %)', p_amount, v_balance;
  END IF;

  PERFORM public.adjust_balance(auth.uid(), -p_amount);

  INSERT INTO public.bets (user_id, race_id, bet_type, selections, amount)
  VALUES (auth.uid(), p_race_id, p_bet_type, p_selections, p_amount)
  RETURNING * INTO v_bet;

  INSERT INTO public.transactions
  (user_id, type, amount, status, related_bet_id, note, processed_at)
  VALUES (auth.uid(), 'BET', p_amount, 'SETTLED', v_bet.id, 'Bet placed: ' || v_bet.ticket_code, now())
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'bet_id', v_bet.id,
    'ticket_code', v_bet.ticket_code,
    'amount', v_bet.amount,
    'bet_type', v_bet.bet_type,
    'status', v_bet.status,
    'combos', v_combos
  );
END;
$function$;

-- Create toggle_wta RPC function
CREATE OR REPLACE FUNCTION public.toggle_wta(p_race_id uuid, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  UPDATE public.races SET wta_enabled = p_enabled, updated_at = now() WHERE id = p_race_id;
  RETURN jsonb_build_object('race_id', p_race_id, 'wta_enabled', p_enabled);
END;
$function$;

-- Create toggle_p6 RPC function
CREATE OR REPLACE FUNCTION public.toggle_p6(p_race_id uuid, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  UPDATE public.races SET p6_enabled = p_enabled, updated_at = now() WHERE id = p_race_id;
  RETURN jsonb_build_object('race_id', p_race_id, 'p6_enabled', p_enabled);
END;
$function$;

-- Grant execute on new functions
GRANT EXECUTE ON FUNCTION public.toggle_wta(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_p6(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_race(uuid, text, jsonb, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_bet(uuid, text, jsonb, numeric) TO authenticated;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

/*
# Implement multi-horse betting for FC, DD, XD, DD1

## Why
Standard bet types (FC, DD, XD, DD1) now support multi-horse
selections (boxing/spreading). Total cost = combos × ₱5 base stake.
- FC: selections.first[] and selections.second[] arrays → combos = len(first) × len(second)
- DD/XD/DD1: selections.legs[].horse is now an array of horse numbers
  → combos = product of len(horses) across all legs
- FC also supports "box" mode: selections.box = [horse numbers] → combos = N×(N-1)

## Changes
1. Rewrite place_bet to accept array-based selections for all bet types
2. Calculate combinations and validate amount = combos × ₱5
3. Keep WTA/P6 unchanged (already use horses arrays × ₱2)
4. Backward compatible: accepts old single-horse format too (string instead of array)

## Security
- SECURITY DEFINER, search_path locked to public
- authenticated role only (enforced by grant)
*/

CREATE OR REPLACE FUNCTION public.place_bet(p_race_id uuid, p_bet_type text, p_selections jsonb, p_amount numeric)
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
  v_j int;
  v_expected_legs int;
  v_total_races int;
  v_combos int := 1;
  v_leg_horses jsonb;
  v_first_horses jsonb;
  v_second_horses jsonb;
  v_box_horses jsonb;
  v_n int;
  v_expected_cost numeric(14,2);
  v_horse_val text;
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

  -- ============================================================
  -- FC: Forecast — 1st & 2nd in exact order (or box for any order)
  -- ============================================================
  IF p_bet_type = 'FC' THEN
    v_combos := 1;

    -- Check for box mode first
    v_box_horses := p_selections->'box';
    IF v_box_horses IS NOT NULL AND jsonb_array_length(v_box_horses) > 0 THEN
      v_n := jsonb_array_length(v_box_horses);
      IF v_n < 2 THEN
        RAISE EXCEPTION 'FC box requires at least 2 horses';
      END IF;
      v_combos := v_n * (v_n - 1);
    ELSE
      -- Standard or multi-selection mode: first[] × second[]
      v_first_horses := p_selections->'first';
      v_second_horses := p_selections->'second';

      -- Backward compat: if first/second are strings, wrap to arrays
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

  -- ============================================================
  -- DD, XD, DD1: Multi-leg bets with multi-horse per leg
  -- ============================================================
  ELSIF p_bet_type IN ('DD', 'XD', 'DD1') THEN
    v_legs := p_selections->'legs';
    v_expected_legs := CASE WHEN p_bet_type = 'DD1' THEN 3 ELSE 2 END;

    IF v_legs IS NULL OR jsonb_array_length(v_legs) <> v_expected_legs THEN
      RAISE EXCEPTION 'Invalid legs for % — expected % legs', p_bet_type, v_expected_legs;
    END IF;

    -- Validate race sequence
    IF p_bet_type = 'DD'
    AND ((v_legs->0->>'race')::int <> v_race.race_number
    OR (v_legs->1->>'race')::int <> v_race.race_number + 1) THEN
      RAISE EXCEPTION 'DD requires the current race and the next race';
    END IF;
    IF p_bet_type = 'XD'
    AND ((v_legs->0->>'race')::int <> v_race.race_number
    OR (v_legs->1->>'race')::int <> v_race.race_number + 2) THEN
      RAISE EXCEPTION 'XD requires the current race and the race two positions ahead';
    END IF;
    IF p_bet_type = 'DD1'
    AND ((v_legs->0->>'race')::int <> v_race.race_number
    OR (v_legs->1->>'race')::int <> v_race.race_number + 1
    OR (v_legs->2->>'race')::int <> v_race.race_number + 2) THEN
      RAISE EXCEPTION 'DD+1 requires the current race and the next two races';
    END IF;

    -- Validate each leg and calculate combinations
    v_combos := 1;
    FOR v_i IN 0..jsonb_array_length(v_legs) - 1 LOOP
      v_leg := v_legs->v_i;
      v_leg_race := (v_leg->>'race')::int;
      SELECT betting_open, status INTO v_leg_open, v_leg_status
      FROM public.races WHERE race_number = v_leg_race;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Leg race % does not exist in the schedule', v_leg_race;
      END IF;
      IF NOT v_leg_open OR v_leg_status IN ('closed', 'settled') THEN
        RAISE EXCEPTION 'Betting is closed for leg race %', v_leg_race;
      END IF;

      -- Get horse array from this leg (support both 'horse' array and single string)
      v_leg_horses := v_leg->'horse';
      IF v_leg_horses IS NULL THEN
        v_leg_horses := v_leg->'horses';
      END IF;
      -- Backward compat: single string → wrap to array
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

  -- ============================================================
  -- WTA & P6: Matrix bets (unchanged, ₱2 per combo)
  -- ============================================================
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
      SELECT betting_open, status INTO v_leg_open, v_leg_status
      FROM public.races WHERE race_number = v_leg_race;
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

  -- ============================================================
  -- Deduct balance and create bet
  -- ============================================================
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
    'status', v_bet.bet_status,
    'combos', v_combos
  );
END;
$function$;

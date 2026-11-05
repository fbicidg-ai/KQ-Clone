/*
# Admin-controlled WTA / Pick 6 toggles per race

## Why
The admin should be able to manually activate WTA and/or Pick 6 on a specific
race, rather than having them appear automatically based on the schedule.
The consecutive-races constraint still applies (WTA needs 7 consecutive races
from the starting race; P6 needs 6), but now the admin must also enable the
bet type on that starting race.

## Changes
- Add `wta_enabled` boolean column to `races` (default false).
- Add `p6_enabled` boolean column to `races` (default false).
- Update `place_bet` to reject WTA/P6 bets when the starting race does not
  have the corresponding toggle enabled.
- Existing RLS policies already cover the new columns (row-level SELECT is
  open to all authenticated; UPDATE/INSERT/DELETE are admin-only).
*/

ALTER TABLE public.races
  ADD COLUMN IF NOT EXISTS wta_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS p6_enabled boolean NOT NULL DEFAULT false;

-- Recreate place_bet with the toggle check added for WTA/P6
CREATE OR REPLACE FUNCTION public.place_bet(
  p_race_id uuid,
  p_bet_type text,
  p_selections jsonb,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_race public.races%ROWTYPE;
  v_balance numeric(14,2);
  v_bet public.bets%ROWTYPE;
  v_tx_id uuid;
  v_legs jsonb;
  v_leg_race int;
  v_leg_open boolean;
  v_leg_status text;
  v_i int;
  v_expected_legs int;
  v_total_races int;
  v_combos int := 1;
  v_leg_horses jsonb;
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
    IF p_amount < 5 THEN
      RAISE EXCEPTION 'Minimum bet is 5.00';
    END IF;
    IF mod(p_amount, 5) <> 0 THEN
      RAISE EXCEPTION 'Bet must be in increments of 5.00';
    END IF;
  ELSIF p_bet_type IN ('DD', 'XD', 'DD1') THEN
    IF p_amount < 5 THEN
      RAISE EXCEPTION 'Minimum bet is 5.00';
    END IF;
    IF mod(p_amount, 5) <> 0 THEN
      RAISE EXCEPTION 'Bet must be in increments of 5.00';
    END IF;

    v_legs := p_selections->'legs';
    v_expected_legs := CASE WHEN p_bet_type = 'DD1' THEN 3 ELSE 2 END;
    IF v_legs IS NULL OR jsonb_array_length(v_legs) <> v_expected_legs THEN
      RAISE EXCEPTION 'Invalid legs for %', p_bet_type;
    END IF;

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

    FOR v_i IN 0..jsonb_array_length(v_legs) - 1 LOOP
      v_leg_race := (v_legs->v_i->>'race')::int;
      SELECT betting_open, status INTO v_leg_open, v_leg_status
        FROM public.races WHERE race_number = v_leg_race;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Leg race % does not exist in the schedule', v_leg_race;
      END IF;
      IF NOT v_leg_open OR v_leg_status IN ('closed', 'settled') THEN
        RAISE EXCEPTION 'Betting is closed for leg race %', v_leg_race;
      END IF;
      IF (v_legs->v_i->>'horse') IS NULL THEN
        RAISE EXCEPTION 'Missing horse selection for leg %', v_i + 1;
      END IF;
    END LOOP;

  ELSIF p_bet_type IN ('WTA', 'P6') THEN
    -- Admin must have enabled this bet type on the starting race
    IF p_bet_type = 'WTA' AND NOT v_race.wta_enabled THEN
      RAISE EXCEPTION 'WTA is not activated for this race';
    END IF;
    IF p_bet_type = 'P6' AND NOT v_race.p6_enabled THEN
      RAISE EXCEPTION 'Pick 6 is not activated for this race';
    END IF;

    SELECT count(*) INTO v_total_races FROM public.races;
    v_legs := p_selections->'legs';
    v_expected_legs := CASE WHEN p_bet_type = 'P6' THEN 6 ELSE 7 END;

    IF v_legs IS NULL OR jsonb_array_length(v_legs) <> v_expected_legs THEN
      RAISE EXCEPTION 'Invalid legs for % — expected % legs', p_bet_type, v_expected_legs;
    END IF;

    -- P6: 6 consecutive races starting from the current race
    IF p_bet_type = 'P6' THEN
      FOR v_i IN 0..5 LOOP
        IF (v_legs->v_i->>'race')::int <> v_race.race_number + v_i THEN
          RAISE EXCEPTION 'P6 requires 6 consecutive races starting from the current race';
        END IF;
      END LOOP;
    END IF;

    -- WTA: 7 consecutive races starting from the current race
    IF p_bet_type = 'WTA' THEN
      FOR v_i IN 0..6 LOOP
        IF (v_legs->v_i->>'race')::int <> v_race.race_number + v_i THEN
          RAISE EXCEPTION 'WTA requires 7 consecutive races starting from the current race';
        END IF;
      END LOOP;
    END IF;

    v_combos := 1;
    FOR v_i IN 0..jsonb_array_length(v_legs) - 1 LOOP
      v_leg_race := (v_legs->v_i->>'race')::int;
      SELECT betting_open, status INTO v_leg_open, v_leg_status
        FROM public.races WHERE race_number = v_leg_race;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Leg race % does not exist in the schedule', v_leg_race;
      END IF;
      IF NOT v_leg_open OR v_leg_status IN ('closed', 'settled') THEN
        RAISE EXCEPTION 'Betting is closed for leg race %', v_leg_race;
      END IF;

      v_leg_horses := v_legs->v_i->'horses';
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
$$;

REVOKE EXECUTE ON FUNCTION public.place_bet(uuid, text, jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_bet(uuid, text, jsonb, numeric) TO authenticated;

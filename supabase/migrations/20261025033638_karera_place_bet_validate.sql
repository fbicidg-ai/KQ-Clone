/*
# Strengthen place_bet: validate leg races exist + betting open on them

## Why
The Dynamic Bet Availability Engine is enforced in the frontend, but a user
could bypass it and call `place_bet` directly with selections that reference
race numbers which don't exist in the schedule (e.g. XD on Race 7 referencing
a non-existent Race 9). The server must reject those bets.

## Changes to `place_bet`
- For combination bet types (DD, XD, DD1), validate that every leg's race
  number exists in the races table AND that all those races are still open
  for betting (betting_open = true, status <> 'settled'). This mirrors the
  frontend availability rules:
    - DD: current + next race must exist and be open.
    - XD: current + the race two slots ahead must exist and be open.
    - DD1: current + next + one more must exist and be open.
- For FC: only the current race's betting state is checked (already done).
- Throws a clear error if any leg race is missing or closed.

No schema or RLS changes. Idempotent (CREATE OR REPLACE FUNCTION).
*/

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
  v_leg_exists boolean;
  v_leg_open boolean;
  v_leg_race_id uuid;
  v_i int;
  v_total_races int;
BEGIN
  IF p_amount < 5 THEN
    RAISE EXCEPTION 'Minimum bet is 5.00';
  END IF;
  IF mod(p_amount, 5) <> 0 THEN
    RAISE EXCEPTION 'Bet must be in increments of 5.00';
  END IF;
  IF p_bet_type NOT IN ('FC','DD','XD','DD1') THEN
    RAISE EXCEPTION 'Invalid bet type';
  END IF;

  SELECT * INTO v_race FROM public.races WHERE id = p_race_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Race not found';
  END IF;
  IF NOT v_race.betting_open OR v_race.status = 'closed' OR v_race.status = 'settled' THEN
    RAISE EXCEPTION 'Betting is closed for this race';
  END IF;

  -- Combination bets: validate each leg race exists and is open.
  IF p_bet_type <> 'FC' THEN
    v_legs := p_selections->'legs';
    IF v_legs IS NULL OR jsonb_array_length(v_legs) = 0 THEN
      RAISE EXCEPTION 'Missing bet legs';
    END IF;

    -- Total race count in the schedule (for availability checks).
    SELECT count(*) INTO v_total_races FROM public.races;

    FOR i IN 0..jsonb_array_length(v_legs) - 1 LOOP
      v_leg_race := (v_legs->i->>'race')::int;
      -- Leg race number must exist in the schedule.
      SELECT id, betting_open, status INTO v_leg_race_id, v_leg_open, v_leg_exists
        FROM public.races WHERE race_number = v_leg_race;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Leg race % does not exist in the schedule', v_leg_race;
      END IF;
      IF NOT v_leg_open OR v_leg_exists = 'settled' OR v_leg_exists = 'closed' THEN
        RAISE EXCEPTION 'Betting is closed for leg race %', v_leg_race;
      END IF;
    END LOOP;

    -- Availability check: the bet type must have enough races after the
    -- current race. current_race + needed_legs_after <= total_races.
    DECLARE
      v_needed int;
    BEGIN
      v_needed := CASE p_bet_type WHEN 'DD' THEN 1 WHEN 'XD' THEN 2 WHEN 'DD1' THEN 2 ELSE 0 END;
      IF v_race.race_number + v_needed > v_total_races THEN
        RAISE EXCEPTION '% is not available for race % (% races in schedule)',
          p_bet_type, v_race.race_number, v_total_races;
      END IF;
    END;
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
    'status', v_bet.status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.place_bet(uuid, text, jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_bet(uuid, text, jsonb, numeric) TO authenticated;

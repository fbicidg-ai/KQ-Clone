/*
# Fix place_bet leg validation typing

## Why
The previous migration selected three columns (id, betting_open, status) into
mismatched variables: v_leg_race_id (uuid), v_leg_open (boolean),
v_leg_exists (boolean). The status column is text, not boolean, causing
"invalid input syntax for type boolean" when the race is found.

## Fix
Use properly typed variables: v_leg_race_id uuid, v_leg_open boolean,
v_leg_status text. Reject the leg when the race is missing, betting_open is
false, OR status is 'settled'/'closed'. Idempotent CREATE OR REPLACE.
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
  v_leg_race_id uuid;
  v_leg_open boolean;
  v_leg_status text;
  v_i int;
  v_total_races int;
  v_needed int;
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

    SELECT count(*) INTO v_total_races FROM public.races;

    FOR i IN 0..jsonb_array_length(v_legs) - 1 LOOP
      v_leg_race := (v_legs->i->>'race')::int;
      SELECT id, betting_open, status
        INTO v_leg_race_id, v_leg_open, v_leg_status
        FROM public.races WHERE race_number = v_leg_race;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Leg race % does not exist in the schedule', v_leg_race;
      END IF;
      IF NOT v_leg_open OR v_leg_status = 'settled' OR v_leg_status = 'closed' THEN
        RAISE EXCEPTION 'Betting is closed for leg race %', v_leg_race;
      END IF;
    END LOOP;

    v_needed := CASE p_bet_type WHEN 'DD' THEN 1 WHEN 'XD' THEN 2 WHEN 'DD1' THEN 2 ELSE 0 END;
    IF v_race.race_number + v_needed > v_total_races THEN
      RAISE EXCEPTION '% is not available for race % (% races in schedule)',
        p_bet_type, v_race.race_number, v_total_races;
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
    'status', v_bet.status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.place_bet(uuid, text, jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_bet(uuid, text, jsonb, numeric) TO authenticated;

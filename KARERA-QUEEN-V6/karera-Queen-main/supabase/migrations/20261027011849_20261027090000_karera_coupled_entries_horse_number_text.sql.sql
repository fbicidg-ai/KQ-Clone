/*
# Coupled entries: allow letters in horse numbers (1A, 2A, 3A, etc.)

## Why
Race lineups sometimes have coupled entries — two horses running as a single
betting unit (e.g. #1 and #1A). The horse_number column was `int`, which cannot
store "1A". This migration converts it to `text` so admins can enter numbers
like 1, 1A, 2, 2A, 3, 3A, etc.

## Changes
1. `public.horses.horse_number`: changed from `int NOT NULL` to `text NOT NULL`.
   Existing integer values are cast to text (1 -> '1'), so no data is lost.
2. Unique constraint `horses_race_id_horse_number_key` is rebuilt on the text
   column.
3. `place_bet` and `settle_race` RPCs: updated to cast selections to `text`
   instead of `int`, so bets and settlements work with letter-suffixed numbers.
   The comparison logic is otherwise unchanged.

## Security
- No RLS or grant changes. Column privileges are unaffected by the type change.
- The RPCs remain SECURITY DEFINER, authenticated-only execution.

## Important notes
- This is a data-preserving change: integer values become text strings.
- The frontend will treat horse_number as a string everywhere.
*/

-- 1. Change horse_number to text
ALTER TABLE public.horses
  ALTER COLUMN horse_number TYPE text USING horse_number::text;

-- Rebuild the unique constraint (the original was on int, recreate on text)
ALTER TABLE public.horses
  DROP CONSTRAINT IF EXISTS horses_race_id_horse_number_key;
ALTER TABLE public.horses
  ADD CONSTRAINT horses_race_id_horse_number_key UNIQUE (race_id, horse_number);

-- 2. Update place_bet to cast selections as text instead of int
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
BEGIN
  IF p_amount < 5 THEN
    RAISE EXCEPTION 'Minimum bet is 5.00';
  END IF;
  IF mod(p_amount, 5) <> 0 THEN
    RAISE EXCEPTION 'Bet must be in increments of 5.00';
  END IF;
  IF p_bet_type NOT IN ('FC', 'DD', 'XD', 'DD1') THEN
    RAISE EXCEPTION 'Invalid bet type';
  END IF;

  SELECT * INTO v_race FROM public.races WHERE id = p_race_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Race not found';
  END IF;
  IF NOT v_race.betting_open OR v_race.status IN ('closed', 'settled') THEN
    RAISE EXCEPTION 'Betting is closed for this race';
  END IF;

  IF p_bet_type <> 'FC' THEN
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
      FROM public.races
      WHERE race_number = v_leg_race;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Leg race % does not exist in the schedule', v_leg_race;
      END IF;
      IF NOT v_leg_open OR v_leg_status IN ('closed', 'settled') THEN
        RAISE EXCEPTION 'Betting is closed for leg race %', v_leg_race;
      END IF;
    END LOOP;
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

-- 3. Update settle_race to compare horse numbers as text
CREATE OR REPLACE FUNCTION public.settle_race(
  p_race_id uuid,
  p_winners jsonb,
  p_dividend numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_leg jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_dividend IS NULL OR p_dividend < 0 THEN
    RAISE EXCEPTION 'Invalid dividend';
  END IF;

  v_first := p_winners->>'first';
  v_second := p_winners->>'second';
  v_win_legs := p_winners->'legs';

  FOR v_bet IN SELECT * FROM public.bets
               WHERE race_id = p_race_id AND status = 'PENDING'
  LOOP
    v_match := false;

    IF v_bet.bet_type = 'FC' THEN
      v_match := (v_bet.selections->>'first' = v_first
                  AND v_bet.selections->>'second' = v_second);
    ELSE
      v_bet_legs := v_bet.selections->'legs';
      v_leg_match := true;
      IF jsonb_array_length(v_bet_legs) <> jsonb_array_length(v_win_legs) THEN
        v_leg_match := false;
      ELSE
        FOR i IN 0..jsonb_array_length(v_win_legs) - 1 LOOP
          v_leg := v_win_legs->i;
          IF (v_bet_legs->i->>'race') IS DISTINCT FROM (v_leg->>'race')
             OR (v_bet_legs->i->>'horse') IS DISTINCT FROM (v_leg->>'horse') THEN
            v_leg_match := false;
          END IF;
        END LOOP;
      END IF;
      v_match := v_leg_match;
    END IF;

    IF v_match THEN
      v_payout := (v_bet.amount / 5.0) * p_dividend;
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

  UPDATE public.races
    SET status = 'settled', betting_open = false, updated_at = now()
    WHERE id = p_race_id;

  RETURN jsonb_build_object(
    'won', v_won,
    'lost', v_lost,
    'total_payout', v_total_payout
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_race(uuid, jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_race(uuid, jsonb, numeric) TO authenticated;
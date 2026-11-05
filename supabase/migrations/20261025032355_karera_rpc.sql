/*
# Karera — business logic RPC functions

All SECURITY DEFINER, EXECUTE granted to `authenticated` only (revoked from
PUBLIC/anon). Each checks `is_admin()` where appropriate before mutating.

## place_bet(p_race_id, p_bet_type, p_selections, p_amount)
User-facing. Atomically:
  1. Validates the race exists and betting_open = true.
  2. Validates amount >= 5 and amount is a multiple of 5.
  3. Validates the user's balance >= amount; throws if not.
  4. Deducts amount via adjust_balance.
  5. Inserts a SETTLED BET transaction (debit) referencing the new bet.
  6. Inserts the bet row (PENDING) and returns it.
Rolls back on any error.

## settle_race(p_race_id, p_winners, p_dividend)
Admin-only. `p_winners` is a jsonb map describing the winning combination(s):
  - For FC: {"first": N, "second": M}
  - For DD/XD/DD1: {"legs": [[raceNum, horseNum], [raceNum, horseNum], ...]}
  - p_dividend: numeric payout multiplier per 5 base bet for the matching type.
For each PENDING bet on this race that matches the winners, computes payout
= (amount/5) * p_dividend, credits the user balance, inserts a WIN transaction
(SETTLED, APPROVED), marks the bet WON + payout_amount + settled_at.
Non-matching PENDING bets on this race are marked LOST.
Marks the race status = 'settled'. Returns a summary {won, lost, total_payout}.

## admin_adjust_balance(p_user_id, p_delta, p_note)
Admin-only. Adjusts a user's balance and records an ADMIN_ADJUST transaction
(APPROVED).

## approve_transaction(p_transaction_id)
Admin-only. For a PENDING transaction:
  - DEPOSIT: credit user balance, status APPROVED.
  - WITHDRAWAL: deduct user balance, status APPROVED.
  - other types: reject.
Sets admin_id + processed_at. Idempotent: a non-PENDING transaction is a no-op.

## reject_transaction(p_transaction_id)
Admin-only. For a PENDING transaction:
  - DEPOSIT: status REJECTED, no balance change.
  - WITHDRAWAL: status REJECTED, no balance change (withdrawal amounts were
    only deducted on approval, never on request).
  - other: reject.
Sets admin_id + processed_at. Idempotent.
*/

-- place_bet ------------------------------------------------
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

  SELECT balance INTO v_balance FROM public.profiles WHERE id = auth.uid();
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

-- settle_race ---------------------------------------------
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
  v_first int;
  v_second int;
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

  v_first := (p_winners->>'first')::int;
  v_second := (p_winners->>'second')::int;
  v_win_legs := p_winners->'legs';

  FOR v_bet IN SELECT * FROM public.bets
               WHERE race_id = p_race_id AND status = 'PENDING'
  LOOP
    v_match := false;

    IF v_bet.bet_type = 'FC' THEN
      v_match := ((v_bet.selections->>'first')::int = v_first
                  AND (v_bet.selections->>'second')::int = v_second);
    ELSE
      -- DD / XD / DD1: selections.legs must equal winners.legs elementwise
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

-- admin_adjust_balance ------------------------------------
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(
  p_user_id uuid,
  p_delta numeric,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  PERFORM public.adjust_balance(p_user_id, p_delta);
  INSERT INTO public.transactions
    (user_id, type, amount, status, note, admin_id, processed_at)
  VALUES (p_user_id, 'ADMIN_ADJUST', p_delta, 'APPROVED', p_note, auth.uid(), now());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_adjust_balance(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_balance(uuid, numeric, text) TO authenticated;

-- approve_transaction -------------------------------------
CREATE OR REPLACE FUNCTION public.approve_transaction(p_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_tx.status <> 'PENDING' THEN RETURN; END IF;

  IF v_tx.type = 'DEPOSIT' THEN
    PERFORM public.adjust_balance(v_tx.user_id, v_tx.amount);
  ELSIF v_tx.type = 'WITHDRAWAL' THEN
    PERFORM public.adjust_balance(v_tx.user_id, -v_tx.amount);
  ELSE
    RAISE EXCEPTION 'Only DEPOSIT/WITHDRAWAL transactions can be approved';
  END IF;

  UPDATE public.transactions
    SET status = 'APPROVED', admin_id = auth.uid(), processed_at = now()
    WHERE id = p_transaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_transaction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_transaction(uuid) TO authenticated;

-- reject_transaction --------------------------------------
CREATE OR REPLACE FUNCTION public.reject_transaction(p_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_tx.status <> 'PENDING' THEN RETURN; END IF;

  UPDATE public.transactions
    SET status = 'REJECTED', admin_id = auth.uid(), processed_at = now()
    WHERE id = p_transaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_transaction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_transaction(uuid) TO authenticated;

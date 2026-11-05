/*
# Karera — RPC functions and trigger
- place_bet, settle_race, admin_adjust_balance, approve/reject_transaction
- handle_new_profile trigger
*/

CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, mobile)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''),
          COALESCE(NEW.raw_user_meta_data->>'mobile',''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();

REVOKE EXECUTE ON FUNCTION public.handle_new_profile() FROM PUBLIC, anon, authenticated;

-- place_bet
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
BEGIN
  IF p_amount < 5 THEN
    RAISE EXCEPTION 'Minimum bet is 5.00';
  END IF;
  IF mod(p_amount, 5) <> 0 THEN
    RAISE EXCEPTION 'Bet must be in increments of 5.00';
  END IF;
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

  IF p_bet_type <> 'FC' THEN
    v_legs := p_selections->'legs';
    SELECT count(*) INTO v_total_races FROM public.races;

    v_expected_legs := CASE
      WHEN p_bet_type = 'DD1' THEN 3
      WHEN p_bet_type = 'P6' THEN 6
      WHEN p_bet_type = 'WTA' THEN v_total_races
      ELSE 2
    END;

    IF v_legs IS NULL OR jsonb_array_length(v_legs) <> v_expected_legs THEN
      RAISE EXCEPTION 'Invalid legs for % — expected % legs', p_bet_type, v_expected_legs;
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
    IF p_bet_type = 'P6' THEN
      FOR v_i IN 0..5 LOOP
        IF (v_legs->v_i->>'race')::int <> v_race.race_number + v_i THEN
          RAISE EXCEPTION 'P6 requires 6 consecutive races starting from the current race';
        END IF;
      END LOOP;
    END IF;
    IF p_bet_type = 'WTA' THEN
      FOR v_i IN 0..v_expected_legs - 1 LOOP
        IF (v_legs->v_i->>'race')::int <> v_i + 1 THEN
          RAISE EXCEPTION 'WTA requires all races from 1 through %', v_total_races;
        END IF;
      END LOOP;
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

-- settle_race (redesigned: accepts finishing order, scopes by bet type)
CREATE OR REPLACE FUNCTION public.settle_race(
  p_race_id uuid,
  p_bet_type text,
  p_results jsonb,
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
  v_j int;
  v_leg jsonb;
  v_result jsonb;
  v_result_race_id uuid;
  v_result_race_number int;
  v_horse text;
  v_position int;
  v_pending_count int;
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

  UPDATE public.races
    SET betting_open = false, updated_at = now()
    WHERE id = p_race_id;

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

  FOR v_bet IN SELECT * FROM public.bets
               WHERE race_id = p_race_id AND status = 'PENDING' AND bet_type = p_bet_type
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
        FOR v_i IN 0..jsonb_array_length(v_win_legs) - 1 LOOP
          v_leg := v_win_legs->v_i;
          IF (v_bet_legs->v_i->>'race') IS DISTINCT FROM (v_leg->>'race')
             OR (v_bet_legs->v_i->>'horse') IS DISTINCT FROM (v_leg->>'horse') THEN
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

  SELECT count(*) INTO v_pending_count
  FROM public.bets
  WHERE race_id = p_race_id AND status = 'PENDING';

  IF v_pending_count = 0 THEN
    UPDATE public.races
      SET status = 'settled', updated_at = now()
      WHERE id = p_race_id;
  END IF;

  RETURN jsonb_build_object(
    'won', v_won,
    'lost', v_lost,
    'total_payout', v_total_payout
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_race(uuid, text, jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_race(uuid, text, jsonb, numeric) TO authenticated;

-- admin_adjust_balance
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(p_user_id uuid, p_delta numeric, p_note text)
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

-- approve_transaction
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

-- reject_transaction
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

-- clear_finance_history
CREATE OR REPLACE FUNCTION public.clear_finance_history()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  archived_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.transactions
  SET archived = true
  WHERE status <> 'PENDING' AND archived = false;
  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_finance_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_finance_history() TO authenticated;

-- Lock down adjust_balance
REVOKE EXECUTE ON FUNCTION public.adjust_balance(uuid, numeric) FROM PUBLIC, anon, authenticated;
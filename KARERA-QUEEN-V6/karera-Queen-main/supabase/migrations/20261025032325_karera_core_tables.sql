/*
# Karera — races, horses, bets, transactions, settings

## Tables
1. `races` — race_number, status (open/closed/settled), betting_open,
   scheduled_at, stream_url (per-race override).
2. `horses` — horse_number, horse_name, jockey, scratched; unique per race.
3. `bets` — one row per bet ticket: user_id, race_id, bet_type
   (FC/DD/XD/DD1), selections (jsonb), amount (>=5), ticket_code,
   status (PENDING/WON/LOST), payout_amount, settled_at.
4. `transactions` — wallet ledger: type (DEPOSIT/WITHDRAWAL/BET/WIN/ADMIN_ADJUST),
   status (PENDING/APPROVED/REJECTED/SETTLED), channel, reference,
   account_details, admin_id, related_bet_id.
5. `settings` — single-row global config: stream_url, default_race_count.
   Seeded with defaults.

## Security
- `races`, `horses`, `settings`: SELECT to all authenticated (shared schedule
  data). Only admins mutate (is_admin()).
- `bets`: user reads/inserts/updates only own rows (auth.uid() = user_id).
  INSERT allowed at RLS layer, but the actual atomic balance deduction is
  enforced by the `place_bet` SECURITY DEFINER function (added in the next
  migration). Direct inserts would NOT debit balance, so the UI only calls
  `place_bet`.
- `transactions`: user reads own OR admin reads all. User inserts only own
  (deposit/withdrawal requests). Admin updates status.
*/

-- =========================================================
-- RACES
-- =========================================================
CREATE TABLE IF NOT EXISTS public.races (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_number int NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','settled')),
  betting_open boolean NOT NULL DEFAULT true,
  scheduled_at timestamptz,
  stream_url text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.races ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.races TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.races TO authenticated;

DROP POLICY IF EXISTS "races_select_all" ON public.races;
CREATE POLICY "races_select_all"
ON public.races FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "races_admin_insert" ON public.races;
CREATE POLICY "races_admin_insert"
ON public.races FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "races_admin_update" ON public.races;
CREATE POLICY "races_admin_update"
ON public.races FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "races_admin_delete" ON public.races;
CREATE POLICY "races_admin_delete"
ON public.races FOR DELETE TO authenticated USING (public.is_admin());

-- =========================================================
-- HORSES
-- =========================================================
CREATE TABLE IF NOT EXISTS public.horses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  horse_number int NOT NULL,
  horse_name text NOT NULL DEFAULT '',
  jockey text NOT NULL DEFAULT '',
  scratched boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (race_id, horse_number)
);
ALTER TABLE public.horses ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS horses_race_id_idx ON public.horses(race_id);

GRANT SELECT ON public.horses TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.horses TO authenticated;

DROP POLICY IF EXISTS "horses_select_all" ON public.horses;
CREATE POLICY "horses_select_all"
ON public.horses FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "horses_admin_insert" ON public.horses;
CREATE POLICY "horses_admin_insert"
ON public.horses FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "horses_admin_update" ON public.horses;
CREATE POLICY "horses_admin_update"
ON public.horses FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "horses_admin_delete" ON public.horses;
CREATE POLICY "horses_admin_delete"
ON public.horses FOR DELETE TO authenticated USING (public.is_admin());

-- =========================================================
-- BETS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  race_id uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  bet_type text NOT NULL CHECK (bet_type IN ('FC','DD','XD','DD1')),
  selections jsonb NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 5),
  ticket_code text NOT NULL DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','WON','LOST')),
  payout_amount numeric(14,2) NOT NULL DEFAULT 0,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS bets_user_id_idx ON public.bets(user_id);
CREATE INDEX IF NOT EXISTS bets_race_id_idx ON public.bets(race_id);
CREATE INDEX IF NOT EXISTS bets_status_idx ON public.bets(status);

GRANT SELECT, INSERT, UPDATE ON public.bets TO authenticated;

DROP POLICY IF EXISTS "bets_select_own" ON public.bets;
CREATE POLICY "bets_select_own"
ON public.bets FOR SELECT
TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "bets_insert_own" ON public.bets;
CREATE POLICY "bets_insert_own"
ON public.bets FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "bets_update_own" ON public.bets;
CREATE POLICY "bets_update_own"
ON public.bets FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================================================
-- TRANSACTIONS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('DEPOSIT','WITHDRAWAL','BET','WIN','ADMIN_ADJUST')),
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','SETTLED')),
  channel text DEFAULT '',
  reference text DEFAULT '',
  account_details text DEFAULT '',
  note text DEFAULT '',
  admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  related_bet_id uuid REFERENCES public.bets(id) ON DELETE SET NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS transactions_status_idx ON public.transactions(status);
CREATE INDEX IF NOT EXISTS transactions_type_idx ON public.transactions(type);

GRANT SELECT, INSERT, UPDATE ON public.transactions TO authenticated;

DROP POLICY IF EXISTS "tx_select_own_or_admin" ON public.transactions;
CREATE POLICY "tx_select_own_or_admin"
ON public.transactions FOR SELECT
TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "tx_insert_own" ON public.transactions;
CREATE POLICY "tx_insert_own"
ON public.transactions FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "tx_update_admin" ON public.transactions;
CREATE POLICY "tx_update_admin"
ON public.transactions FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- =========================================================
-- SETTINGS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  stream_url text NOT NULL DEFAULT '',
  default_race_count int NOT NULL DEFAULT 8,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.settings TO authenticated;
GRANT UPDATE ON public.settings TO authenticated;

INSERT INTO public.settings (id, stream_url, default_race_count)
VALUES (1, '', 8)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "settings_select_all" ON public.settings;
CREATE POLICY "settings_select_all"
ON public.settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "settings_admin_update" ON public.settings;
CREATE POLICY "settings_admin_update"
ON public.settings FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

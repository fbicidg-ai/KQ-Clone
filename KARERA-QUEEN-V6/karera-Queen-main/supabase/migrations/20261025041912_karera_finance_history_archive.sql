/*
# Archive processed finance history safely

1. Modified Tables
- `public.transactions`: adds `archived`, which hides processed records from the admin finance history view without deleting wallet, bet, or payout records.

2. Functions
- Adds `clear_finance_history()`, an admin-only function that archives every non-pending transaction.

3. Security
- The archive function derives authorization from `auth.uid()` through `public.is_admin()`.
- Anonymous callers cannot execute the function.
- Authenticated callers may execute it, but non-admin callers receive an authorization error.

4. Important Notes
- Pending deposits and withdrawals remain visible for approval.
- Existing records remain in the database for accurate balances, user wallets, and auditability.
- The operation is reversible by an administrator through the database if needed.
*/

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

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

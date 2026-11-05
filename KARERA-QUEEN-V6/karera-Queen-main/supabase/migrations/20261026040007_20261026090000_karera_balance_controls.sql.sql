/*
# Secure admin balance controls

1. Purpose
- Keeps balance changes behind the existing admin-only `admin_adjust_balance` RPC.
- Prevents signed-in users from changing financial and settlement fields directly through the Data API.

2. Modified permissions
- `profiles`: authenticated users retain read access but cannot directly insert, update, or delete profile rows.
- `bets`: authenticated users retain read access but cannot directly insert or update tickets; ticket creation and settlement remain through validated RPC functions.
- `transactions`: authenticated users may create only their own deposit or withdrawal request fields. Direct updates and deletes are removed; approvals and balance effects remain server-side.

3. Security
- The existing RPC checks the calling session with `is_admin()` before adjusting another user's balance.
- Anonymous access remains denied.
- No rows or columns are deleted, and no existing user balances are changed.

4. Important notes
- The finance screen continues to use `admin_adjust_balance` and remains the supported balance-edit flow.
- Wallet deposits and withdrawals continue to submit through the allowed transaction columns.
*/

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.bets FROM authenticated;
GRANT SELECT ON public.bets TO authenticated;

REVOKE UPDATE, DELETE ON public.transactions FROM authenticated;
REVOKE INSERT ON public.transactions FROM authenticated;
GRANT INSERT (
  user_id, type, amount, channel, reference, account_details, screenshot_url
) ON public.transactions TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_adjust_balance(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_balance(uuid, numeric, text) TO authenticated;
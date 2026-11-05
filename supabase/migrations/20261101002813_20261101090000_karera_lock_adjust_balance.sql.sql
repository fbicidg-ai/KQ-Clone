/*
# Lock down direct balance adjustment

1. Problem
- `adjust_balance` is a SECURITY DEFINER function that changes any user's wallet balance.
- It had no admin check and was executable by every signed-in user, so any player could credit their own wallet.

2. Change
- Revoke EXECUTE on `adjust_balance` from PUBLIC, anon and authenticated.
- Admin adjustments continue to work: `admin_adjust_balance` checks `is_admin()` and calls `adjust_balance` with owner rights.

3. Notes
- No data is changed.
- No table or policy is modified.
*/

REVOKE EXECUTE ON FUNCTION public.adjust_balance(uuid, numeric) FROM PUBLIC, anon, authenticated;

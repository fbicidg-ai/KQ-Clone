/*
# Relax bets amount check for WTA / P6 matrix bets

## Why
The `bets_amount_check` constraint requires `amount >= 5`. This was correct for
FC/DD/XD/DD1 (minimum ₱5 stake). But WTA and P6 are matrix/combination bets
priced at ₱2.00 per combination. A singles ticket (1 horse per leg) = 1 combo
= ₱2.00, which the old constraint rejected. The `place_bet` RPC already
enforces the correct per-bet-type minimums, so the table-level check just needs
to allow amounts >= 2.

## Changes
1. Drop the existing `bets_amount_check` constraint.
2. Re-add it as `amount >= 2` so WTA/P6 singles (₱2) are allowed while still
   blocking zero/negative amounts.

## Security
- No RLS or policy changes.
- No grant changes.
- `place_bet` still validates amount >= 5 and multiples of 5 for FC/DD/XD/DD1,
  and enforces exact `combos × ₱2.00` for WTA/P6.
*/

ALTER TABLE public.bets DROP CONSTRAINT IF EXISTS bets_amount_check;
ALTER TABLE public.bets ADD CONSTRAINT bets_amount_check CHECK (amount >= 2);

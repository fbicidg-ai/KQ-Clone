import type { BetType, Race, Horse } from '@/lib/supabase';

/**
 * Coupled-entry helpers.
 * In Philippine horse racing, a coupled entry is two horses running as one
 * betting unit (e.g. #1 and #1A). When a user selects one, the partner is
 * auto-selected. The convention is: "1" pairs with "1A", "2" with "2A", etc.
 * A horse with a letter suffix (e.g. "1A") pairs with its base number ("1").
 */

/** Extracts the base number (e.g. "1A" → "1", "3" → "3"). */
export function horseBaseNumber(horseNumber: string): string {
  const match = String(horseNumber).trim().match(/^(\d+)/);
  return match ? match[1] : String(horseNumber).trim();
}

/** True if this horse has a letter suffix (e.g. "1A"). */
export function isCoupledEntry(horseNumber: string): boolean {
  return /[A-Za-z]/.test(String(horseNumber).trim());
}

/**
 * Given a horse number and the full horse list for a race, returns the
 * partner number for a coupled entry (e.g. "1" → "1A" if "1A" exists in the
 * race). Returns null if there is no coupled partner.
 */
export function getCoupledPartner(
  horseNumber: string,
  horses: Horse[],
): string | null {
  const num = String(horseNumber).trim();
  if (isCoupledEntry(num)) {
    // This IS the letter-suffixed horse — partner is the base number.
    const base = horseBaseNumber(num);
    return horses.some((h) => String(h.horse_number).trim() === base) ? base : null;
  }
  // This is a plain number — partner is "<base>A" if that exists.
  const partner = `${num}A`;
  return horses.some((h) => String(h.horse_number).trim() === partner) ? partner : null;
}

/**
 * Dynamic Bet Availability Engine
 * 
 * Determines which bet types are available for a given race based on the
 * total number of races in the schedule. The platform supports 4 bet types
 * that span multiple races:
 * 
 *   FC   — Forecast: 1st & 2nd in a single race. Always available on any race
 *          that still has betting open. (Single-race, no dependency.)
 *   DD   — Daily Double: winner of 2 consecutive designated races.
 *          Available when the current race has a next race.
 *   XD   — Extra Double: winner of 2 specific non-consecutive designated races.
 *          Available when the current race is at least 2 races from the end
 *          (i.e. a race beyond the next exists).
 *   DD+1 — Daily Double + 1: winner of 2 consecutive races PLUS 1 extra
 *          designated race. Requires the current race + next + one more
 *          (so the current race must have at least 2 more races after it).
 * 
 * Rules from the spec, restated for clarity:
 *   - Race 1-6 (out of 8): FC, DD, XD, DD+1 all available.
 *   - Race 7 of 8: only DD and FC (XD and DD+1 locked — no Race 9).
 *   - Race 8 of 8: only FC (final race; all combination bets locked).
 * 
 * Generalised: a bet is available when the races it needs all exist in the
 * schedule (count = total races today).
 */

export interface BetTypeInfo {
  type: BetType;
  code: string;
  label: string;
  short: string;
  description: string;
}

export const BET_TYPES: BetTypeInfo[] = [
  {
    type: 'FC',
    code: 'FC',
    label: 'Forecast',
    short: 'FC',
    description: 'Pick the 1st and 2nd place horses in exact order for a single race.',
  },
  {
    type: 'DD',
    code: 'DD',
    label: 'Daily Double',
    short: 'DD',
    description: 'Pick the winner of 2 consecutive designated races.',
  },
  {
    type: 'XD',
    code: 'XD',
    label: 'Extra Double',
    short: 'XD',
    description: 'Pick the winner of 2 specific non-consecutive designated races.',
  },
  {
    type: 'DD1',
    code: 'DD+1',
    label: 'Daily Double + 1',
    short: 'DD+1',
    description: 'Pick the winner of 2 consecutive races PLUS 1 extra designated race.',
  },
];

/** Races needed beyond the current race for each bet type. */
const LEGS_AFTER: Record<BetType, number> = {
  FC: 0,   // single race
  DD: 1,   // current + next
  XD: 2,   // current + the race two slots ahead
  DD1: 2,  // current + next + one extra
};

export function availableBetTypes(raceNumber: number, races: Race[]): BetType[] {
  const numbers = new Set(races.map((race) => race.race_number));
  return (['FC', 'DD', 'XD', 'DD1'] as BetType[]).filter((type) => {
    const needed = LEGS_AFTER[type];
    return Array.from({ length: needed + 1 }, (_, index) => numbers.has(raceNumber + index)).every(Boolean);
  });
}

export function isBetTypeAvailable(type: BetType, raceNumber: number, races: Race[]): boolean {
  return availableBetTypes(raceNumber, races).includes(type);
}

/**
 * For combination bet types (DD, XD, DD1), returns the leg races the user
 * must pick winners for. For FC, returns just the current race (twice — for
 * 1st and 2nd place picks in that same race).
 */
export function getBetLegs(
  type: BetType,
  currentRace: Race,
  allRaces: Race[],
): Race[] {
  if (type === 'FC') {
    return [currentRace, currentRace];
  }
  const sorted = [...allRaces].sort((a, b) => a.race_number - b.race_number);
  const idx = sorted.findIndex((r) => r.id === currentRace.id);
  if (idx === -1) return [];

  const required = type === 'DD'
    ? [0, 1]
    : type === 'XD'
      ? [0, 2]
      : [0, 1, 2];
  for (const offset of required) {
    const race = sorted[idx + offset];
    if (!race || race.race_number !== currentRace.race_number + offset) return [];
  }
  return required.map((offset) => sorted[idx + offset]) as Race[];
}

export function betTypeLabel(type: BetType): string {
  return BET_TYPES.find((b) => b.type === type)?.label ?? type;
}

export function betTypeCode(type: BetType): string {
  return BET_TYPES.find((b) => b.type === type)?.code ?? type;
}

/** Builds a human-readable summary of a bet's selections. */
export function describeSelections(betType: BetType, selections: any): string {
  if (!selections) return '';
  if (betType === 'FC') {
    return `1st: #${selections.first} / 2nd: #${selections.second}`;
  }
  const legs: any[] = selections.legs ?? [];
  return legs.map((l, i) => `R${l.race} → #${l.horse}`).join('  ·  ');
}

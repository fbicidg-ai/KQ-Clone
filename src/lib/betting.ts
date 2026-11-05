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
    const base = horseBaseNumber(num);
    return horses.some((h) => String(h.horse_number).trim() === base) ? base : null;
  }
  const partner = `${num}A`;
  return horses.some((h) => String(h.horse_number).trim() === partner) ? partner : null;
}

/**
 * Dynamic Bet Availability Engine
 *
 * Determines which bet types are available for a given race based on the
 * total number of races in the schedule. The platform supports 6 bet types:
 *
 *   FC   — Forecast: 1st & 2nd in a single race. Always available on any race
 *          that still has betting open. (Single-race, no dependency.)
 *   DD   — Daily Double: winner of 2 consecutive designated races.
 *          Available when the current race has a next race.
 *   XD   — Extra Double: winner of 2 specific non-consecutive designated races.
 *          Available when the current race is at least 2 races from the end.
 *   DD+1 — Daily Double + 1: winner of 2 consecutive races PLUS 1 extra
 *          designated race. Requires current + next + one more.
 *   P6   — Pick 6: winner of 6 consecutive races starting from the current.
 *          Available when at least 6 races remain (current + 5 more).
 *   WTA  — Winner Take All: winner of ALL races on the card.
 *          Available only from Race 1 (all races must exist and be open).
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
  {
    type: 'P6',
    code: 'P6',
    label: 'Pick 6',
    short: 'P6',
    description: 'Pick the winner of 6 consecutive races. ₱2.00 per combination.',
  },
  {
    type: 'WTA',
    code: 'WTA',
    label: 'Winner Take All',
    short: 'WTA',
    description: 'Pick the winner of every race on the card. ₱2.00 per combination.',
  },
];

/** Unit price per combination for WTA and P6 matrix bets. */
export const MATRIX_UNIT_PRICE = 2.0;

/** Races needed beyond the current race for each bet type. */
const LEGS_AFTER: Record<BetType, number> = {
  FC: 0,
  DD: 1,
  XD: 2,
  DD1: 2,
  P6: 5,
  WTA: 0,
};

export function availableBetTypes(raceNumber: number, races: Race[]): BetType[] {
  const numbers = new Set(races.map((race) => race.race_number));
  const totalRaces = races.length;
  const allTypes: BetType[] = ['FC', 'DD', 'XD', 'DD1', 'P6', 'WTA'];
  return allTypes.filter((type) => {
    if (type === 'WTA') {
      return raceNumber === 1 && totalRaces >= 2;
    }
    if (type === 'P6') {
      return Array.from({ length: 6 }, (_, index) => numbers.has(raceNumber + index)).every(Boolean);
    }
    const needed = LEGS_AFTER[type];
    return Array.from({ length: needed + 1 }, (_, index) => numbers.has(raceNumber + index)).every(Boolean);
  });
}

export function isBetTypeAvailable(type: BetType, raceNumber: number, races: Race[]): boolean {
  return availableBetTypes(raceNumber, races).includes(type);
}

/**
 * For combination bet types (DD, XD, DD1, P6, WTA), returns the leg races the
 * user must pick winners for. For FC, returns just the current race (twice —
 * for 1st and 2nd place picks in that same race).
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

  if (type === 'WTA') {
    return sorted;
  }
  if (type === 'P6') {
    return sorted.slice(idx, idx + 6);
  }

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

/** True for multi-horse-per-leg matrix bet types (WTA, P6). */
export function isMatrixBet(type: BetType): boolean {
  return type === 'WTA' || type === 'P6';
}

/**
 * Calculates the total number of combinations and bet cost for a matrix bet
 * (WTA or P6). Each leg can have multiple horses selected; combinations =
 * product of the number of horses across all legs. Cost = combos × ₱2.00.
 *
 * legs = array of arrays of horse-number strings (one array per leg).
 */
export function matrixCombos(legs: string[][]): number {
  if (legs.length === 0) return 0;
  return legs.reduce((product, horses) => product * Math.max(horses.length, 0), 1);
}

export function matrixCost(legs: string[][]): number {
  const combos = matrixCombos(legs);
  if (combos <= 0) return 0;
  return combos * MATRIX_UNIT_PRICE;
}

/** Builds a human-readable summary of a bet's selections. */
export function describeSelections(betType: BetType, selections: any): string {
  if (!selections) return '';
  if (betType === 'FC') {
    return `1st: #${selections.first} / 2nd: #${selections.second}`;
  }
  if (isMatrixBet(betType)) {
    const legs: any[] = selections.legs ?? [];
    return legs.map((l) => {
      const horses: string[] = Array.isArray(l.horses) ? l.horses : [];
      return `R${l.race} → ${horses.map((h) => `#${h}`).join(', ')}`;
    }).join('  ·  ');
  }
  const legs: any[] = selections.legs ?? [];
  return legs.map((l) => `R${l.race} → #${l.horse}`).join('  ·  ');
}

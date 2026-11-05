import { useEffect, useMemo, useRef, useState } from 'react';
import { useRaces } from '@/lib/useRaces';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useRouter } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import {
  availableBetTypes,
  BET_TYPES,
  betTypeCode,
  betTypeLabel,
  getBetLegs,
  describeSelections,
  getCoupledPartner,
  isMatrixBet,
  matrixCombos,
  matrixCost,
  MATRIX_UNIT_PRICE,
} from '@/lib/betting';
import type { BetType, Race, Horse } from '@/lib/supabase';
import { Money, Spinner, StatusBadge } from '@/components/ui';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Flag,
  Wallet,
  Ticket,
  AlertTriangle,
  Sparkles,
  Layers,
} from 'lucide-react';

type Leg = { race: number; horse: string | null };
type MatrixLeg = { race: number; horses: string[] };
type FcSelection = { first: string | null; second: string | null };

const STEPS = ['Bet Type', 'Race', 'Selections', 'Review', 'Confirm'] as const;

export function BettingSlip({ preselectRaceId }: { preselectRaceId?: string }) {
  const { races, horsesByRace, loading } = useRaces();
  const { profile, refreshProfile } = useAuth();
  const { notify } = useToast();
  const { navigate } = useRouter();

  const [step, setStep] = useState(0);
  const [betType, setBetType] = useState<BetType | null>(null);
  const [raceId, setRaceId] = useState<string | null>(preselectRaceId ?? null);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [matrixLegs, setMatrixLegs] = useState<MatrixLeg[]>([]);
  const [fc, setFc] = useState<FcSelection>({ first: null, second: null });
  const [ticket, setTicket] = useState<{ code: string; payout: string; combos: number } | null>(null);

  const sorted = useMemo(() => [...races].sort((a, b) => a.race_number - b.race_number), [races]);
  const currentRace = useMemo(() => races.find((r) => r.id === raceId) ?? null, [races, raceId]);

  useEffect(() => {
    if (preselectRaceId && races.length && !raceId) {
      setRaceId(preselectRaceId);
    }
  }, [preselectRaceId, races, raceId]);

  const lastBuiltKey = useRef<string>('');
  useEffect(() => {
    if (!betType || !currentRace) return;
    const key = `${betType}:${currentRace.id}`;
    if (lastBuiltKey.current === key) return;
    lastBuiltKey.current = key;
    if (betType === 'FC') {
      setFc({ first: null, second: null });
    } else if (isMatrixBet(betType)) {
      const legRaces = getBetLegs(betType, currentRace, sorted);
      setMatrixLegs(legRaces.map((r) => ({ race: r.race_number, horses: [] })));
    } else {
      const legRaces = getBetLegs(betType, currentRace, sorted);
      setLegs(legRaces.map((r) => ({ race: r.race_number, horse: null })));
    }
  }, [betType, currentRace?.id, sorted]);

  function reset() {
    setStep(0);
    setBetType(null);
    setRaceId(null);
    setLegs([]);
    setMatrixLegs([]);
    setFc({ first: null, second: null });
    setTicket(null);
  }

  const combos = useMemo(() => {
    if (!betType || !isMatrixBet(betType)) return 0;
    return matrixCombos(matrixLegs.map((l) => l.horses));
  }, [betType, matrixLegs]);

  const betCost = useMemo(() => {
    if (!betType || !isMatrixBet(betType)) return 0;
    return matrixCost(matrixLegs.map((l) => l.horses));
  }, [betType, matrixLegs]);

  const canNext = useMemo(() => {
    if (step === 0) return !!betType;
    if (step === 1) return !!raceId;
    if (step === 2) {
      if (betType === 'FC') return fc.first !== null && fc.second !== null && fc.first !== fc.second;
      if (betType && isMatrixBet(betType)) {
        return matrixLegs.length > 0 && matrixLegs.every((l) => l.horses.length >= 1);
      }
      return legs.length > 0 && legs.every((l) => l.horse !== null);
    }
    if (step === 3) {
      if (betType && isMatrixBet(betType)) {
        return combos >= 1 && (profile?.balance ?? 0) >= betCost;
      }
      return true;
    }
    return true;
  }, [step, betType, raceId, legs, matrixLegs, fc, combos, betCost, profile]);

  function next() { if (canNext) setStep((s) => Math.min(s + 1, STEPS.length - 1)); }
  function back() { setStep((s) => Math.max(s - 1, 0)); }

  const availForRace = (r: Race) => availableBetTypes(r.race_number, races);

  async function placeBet() {
    if (!currentRace || !betType) return;
    if (!availableBetTypes(currentRace.race_number, races).includes(betType)) {
      notify(`${betTypeCode(betType)} is no longer available for Race ${currentRace.race_number}.`, 'error');
      return;
    }
    setStep(STEPS.length - 1);
    try {
      let selections: any;
      let amount: number;
      if (betType === 'FC') {
        selections = { first: fc.first, second: fc.second };
        amount = 5;
      } else if (isMatrixBet(betType)) {
        selections = { legs: matrixLegs.map((l) => ({ race: l.race, horses: l.horses })) };
        amount = betCost;
      } else {
        selections = { legs: legs.map((l) => ({ race: l.race, horse: l.horse })) };
        amount = 5;
      }
      const { data, error } = await supabase.rpc('place_bet', {
        p_race_id: currentRace.id,
        p_bet_type: betType,
        p_selections: selections,
        p_amount: amount,
      });
      if (error) throw error;
      const result = (data as any) ?? {};
      await refreshProfile();
      setTicket({ code: result.ticket_code ?? '—', payout: result.amount ?? amount, combos: result.combos ?? combos });
      notify('Bet placed successfully', 'success');
    } catch (err) {
      notify((err as Error).message ?? 'Failed to place bet', 'error');
      setStep(3);
    }
  }

  if (loading) {
    return <div className="p-6 flex justify-center"><Spinner className="text-brand-500" /></div>;
  }

  if (ticket) {
    return (
      <div className="p-4 sm:p-6 max-w-md mx-auto">
        <div className="card p-8 text-center animate-scale-in">
          <div className="w-16 h-16 rounded-2xl bg-success-100 text-success-700 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-extrabold text-white">Bet Confirmed</h2>
          <p className="text-sm text-ink-500 mt-1">Your ticket has been recorded.</p>
          <div className="my-6 rounded-xl bg-ink-950 border border-ink-800 p-5">
            <p className="text-xs text-ink-500 uppercase tracking-wide">Ticket Code</p>
            <p className="text-2xl font-mono font-extrabold text-brand-300 tracking-wider mt-1">{ticket.code}</p>
            <div className="border-t border-ink-800 my-4" />
            <div className="flex justify-between text-sm">
              <span className="text-ink-400">Stake</span>
              <Money value={Number(ticket.payout)} className="text-white font-semibold" />
            </div>
            {ticket.combos > 0 && (
              <div className="flex justify-between text-sm mt-1">
                <span className="text-ink-400">Combinations</span>
                <span className="text-white font-semibold">{ticket.combos} × ₱{MATRIX_UNIT_PRICE.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm mt-1">
              <span className="text-ink-400">Bet Type</span>
              <span className="text-white font-semibold">{betType ? betTypeLabel(betType) : '—'}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate('/app/bets')} className="btn-secondary flex-1">
              <Ticket className="w-4 h-4" /> View Tickets
            </button>
            <button onClick={() => { reset(); navigate('/app'); }} className="btn-primary flex-1">
              Place Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      {/* Stepper */}
      <div className="flex items-center justify-between mb-5">
        {STEPS.map((label, i) => (
          <div key={label} className="flex-1 flex flex-col items-center relative">
            {i > 0 && <div className={`absolute -left-1/2 top-3 w-full h-0.5 ${i <= step ? 'bg-brand-500' : 'bg-ink-800'}`} />}
            <div className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              i < step ? 'bg-brand-500 text-white' :
              i === step ? 'bg-brand-500 text-white ring-4 ring-brand-500/20 animate-pulse-glow' :
              'bg-ink-800 text-ink-500'
            }`}>
              {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className={`text-[10px] mt-1.5 font-semibold uppercase tracking-wide ${i === step ? 'text-brand-300' : 'text-ink-600'}`}>
              {label}
            </span>
          </div>
        ))}
      </div>

      <div className="card p-5 min-h-[280px] flex flex-col">
        {/* STEP 1: Bet type */}
        {step === 0 && (
          <div className="space-y-3 animate-fade-in">
            <h2 className="text-lg font-bold text-white">Choose a bet type</h2>
            <p className="text-sm text-ink-500">Pick one of the supported bet types for today's card.</p>
            <div className="grid grid-cols-2 gap-3">
              {BET_TYPES.map((t) => {
                const selected = betType === t.type;
                return (
                  <button
                    key={t.type}
                    onClick={() => { setBetType(t.type); setRaceId(null); }}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      selected ? 'bg-brand-500/10 border-brand-500/60 ring-2 ring-brand-500/30' : 'bg-ink-900 border-ink-800 hover:border-ink-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-brand-300">{betTypeCode(t.type)}</span>
                      {selected && <Check className="w-4 h-4 text-brand-400" />}
                    </div>
                    <p className="font-bold text-white text-sm mt-1">{t.label}</p>
                    <p className="text-[11px] text-ink-500 mt-1 leading-snug">{t.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2: Race */}
        {step === 1 && (
          <div className="space-y-3 animate-fade-in">
            <h2 className="text-lg font-bold text-white">Select a race</h2>
            <p className="text-sm text-ink-500">
              {betType ? `For ${betTypeLabel(betType)}, pick the starting race.` : 'Pick a race.'} Locked bet types per race are hidden automatically.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {sorted.map((race) => {
                const avail = availForRace(race);
                const supported = betType ? avail.includes(betType) : true;
                const canBet = supported && race.betting_open && race.status !== 'settled';
                const selected = raceId === race.id;
                return (
                  <button
                    key={race.id}
                    disabled={!canBet}
                    onClick={() => setRaceId(race.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selected ? 'bg-brand-500/10 border-brand-500/60 ring-2 ring-brand-500/30' :
                      canBet ? 'bg-ink-900 border-ink-800 hover:border-ink-600' :
                      'bg-ink-900 border-ink-800 opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase text-ink-500 font-bold">Race</span>
                      <span className="text-xl font-extrabold text-white">{race.race_number}</span>
                    </div>
                    <StatusBadge status={race.betting_open ? 'open' : race.status} />
                    {betType && !supported && (
                      <p className="text-[10px] text-danger-500 mt-1.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {betTypeCode(betType)} not available
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 3: Selections */}
        {step === 2 && currentRace && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="text-lg font-bold text-white">
              {betType === 'FC' ? 'Pick 1st & 2nd (exact order)' :
                isMatrixBet(betType!) ? 'Select horses for each leg (multi-selection allowed)' :
                'Pick winners for each leg'}
            </h2>
            {isMatrixBet(betType!) && (
              <div className="flex items-center gap-2 rounded-xl bg-brand-500/10 border border-brand-500/20 px-3 py-2">
                <Layers className="w-4 h-4 text-brand-300 shrink-0" />
                <p className="text-xs text-brand-200">
                  Total cost = (horses in each leg multiplied) × ₱{MATRIX_UNIT_PRICE.toFixed(2)}.
                  Currently: <span className="font-bold">{combos}</span> combos = <span className="font-bold">₱{betCost.toFixed(2)}</span>
                </p>
              </div>
            )}
            {betType === 'FC' && (
              <p className="text-xs text-ink-500 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-warning-500" /> Coupled entries (e.g. 1 & 1A) run as one unit — selecting one blocks its partner.
              </p>
            )}
            {betType === 'FC' ? (
              <FcPicker race={currentRace} horses={horsesByRace[currentRace.id] ?? []} value={fc} onChange={setFc} />
            ) : isMatrixBet(betType!) ? (
              <MatrixLegsPicker
                legs={matrixLegs}
                races={sorted}
                horsesByRace={horsesByRace}
                combos={combos}
                cost={betCost}
                onChange={setMatrixLegs}
              />
            ) : (
              <LegsPicker
                legs={legs}
                races={sorted}
                horsesByRace={horsesByRace}
                onChange={setLegs}
              />
            )}
          </div>
        )}

        {/* STEP 4: Review */}
        {step === 3 && currentRace && betType && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-400" /> Review your bet
            </h2>
            <div className="rounded-xl bg-ink-950 border border-ink-800 divide-y divide-ink-800">
              <Row label="Bet Type" value={`${betTypeLabel(betType)} (${betTypeCode(betType)})`} />
              <Row label="Race" value={betType === 'FC' ? `Race ${currentRace.race_number}` : isMatrixBet(betType) ? matrixLegs.map((l) => `R${l.race}`).join(' → ') : legs.map((l) => `R${l.race}`).join(' → ')} />
              <Row label="Selections" value={betType === 'FC' ? describeSelections('FC', fc) : isMatrixBet(betType) ? describeSelections(betType, { legs: matrixLegs.map((l) => ({ race: l.race, horses: l.horses })) }) : describeSelections(betType, { legs })} />
              {isMatrixBet(betType) && (
                <>
                  <Row label="Combinations" value={`${combos}`} />
                  <Row label="Unit Price" value={`₱${MATRIX_UNIT_PRICE.toFixed(2)}`} />
                </>
              )}
              <Row label="Stake" value={`₱${(isMatrixBet(betType) ? betCost : 5).toFixed(2)}`} />
              <Row label="Potential" value="Settled by admin on race result" muted />
            </div>
            <div className="flex items-center justify-between bg-warning-100/10 border border-warning-500/20 rounded-xl px-4 py-3">
              <span className="text-xs text-warning-600 font-medium">Wallet after bet</span>
              <Money value={Math.max(0, (profile?.balance ?? 0) - (isMatrixBet(betType) ? betCost : 5))} className="text-warning-600 font-bold" />
            </div>
          </div>
        )}

        {/* STEP 5: Placing / done */}
        {step === 4 && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Spinner className="w-7 h-7 text-brand-500" />
            <p className="text-sm text-ink-400">Placing your bet…</p>
          </div>
        )}

        {/* Footer nav */}
        {step < 4 && (
          <div className="flex items-center gap-2 mt-auto pt-5">
            {step > 0 && (
              <button onClick={back} className="btn-secondary">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            )}
            {step < 3 && (
              <button onClick={next} disabled={!canNext} className="btn-primary flex-1">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === 3 && (
              <button onClick={placeBet} disabled={!canNext} className="btn-accent flex-1">
                <Flag className="w-4 h-4" />
                Confirm & Place Bet
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-xs text-ink-500 uppercase tracking-wide">{label}</span>
      <span className={`text-sm font-semibold text-right ${muted ? 'text-ink-500' : 'text-white'}`}>{value}</span>
    </div>
  );
}

function HorseGrid({
  race,
  horses,
  selected,
  onSelect,
  exclude,
  label,
}: {
  race: Race;
  horses: Horse[];
  selected: string | null;
  onSelect: (n: string | null) => void;
  exclude?: string | null;
  label: string;
}) {
  const live = horses.filter((h) => !h.scratched);
  return (
    <div>
      <p className="label">{label}</p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {live.map((h) => {
          const hNum = String(h.horse_number);
          const excludedSet = new Set<string>();
          if (exclude) excludedSet.add(exclude);
          const exclPartner = exclude ? getCoupledPartner(exclude, horses) : null;
          if (exclPartner) excludedSet.add(exclPartner);
          const disabled = excludedSet.has(hNum);
          const active = selected === hNum;
          const partner = getCoupledPartner(hNum, horses);
          return (
            <div key={h.id} className="relative">
              <button
                disabled={disabled}
                onClick={() => onSelect(active ? null : hNum)}
                className={`w-full p-2.5 rounded-xl border text-center transition-all ${
                  active ? 'bg-brand-500/15 border-brand-500 ring-2 ring-brand-500/30' :
                  disabled ? 'bg-ink-900 border-ink-800 opacity-30 cursor-not-allowed' :
                  'bg-ink-900 border-ink-800 hover:border-ink-600'
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  <span className="font-mono font-extrabold text-brand-300">#{hNum}</span>
                </div>
                <p className="text-[10px] text-ink-400 truncate mt-0.5">{h.horse_name || `Horse ${hNum}`}</p>
              </button>
              {partner && (
                <p className="text-[8px] text-accent-400 text-center mt-0.5 font-semibold animate-fade-in">+ #{partner}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FcPicker({
  race,
  horses,
  value,
  onChange,
}: {
  race: Race;
  horses: Horse[];
  value: FcSelection;
  onChange: (v: FcSelection) => void;
}) {
  return (
    <div className="space-y-4">
      <HorseGrid
        race={race}
        horses={horses}
        label={`1st Place — Race ${race.race_number}`}
        selected={value.first}
        exclude={value.second}
        onSelect={(n) => onChange({ ...value, first: n })}
      />
      <HorseGrid
        race={race}
        horses={horses}
        label={`2nd Place — Race ${race.race_number}`}
        selected={value.second}
        exclude={value.first}
        onSelect={(n) => onChange({ ...value, second: n })}
      />
    </div>
  );
}

function LegsPicker({
  legs,
  races,
  horsesByRace,
  onChange,
}: {
  legs: Leg[];
  races: Race[];
  horsesByRace: Record<string, Horse[]>;
  onChange: (l: Leg[]) => void;
}) {
  function update(i: number, horse: string | null) {
    const next = legs.map((l, idx) => (idx === i ? { ...l, horse } : l));
    onChange(next);
  }
  return (
    <div className="space-y-4">
      {legs.map((leg, i) => {
        const race = races.find((r) => r.race_number === leg.race);
        if (!race) return null;
        const horses = horsesByRace[race.id] ?? [];
        return (
          <HorseGrid
            key={i}
            race={race}
            horses={horses}
            label={`Leg ${i + 1} · Race ${leg.race}`}
            selected={leg.horse}
            onSelect={(n) => update(i, n)}
          />
        );
      })}
    </div>
  );
}

function MatrixLegsPicker({
  legs,
  races,
  horsesByRace,
  combos,
  cost,
  onChange,
}: {
  legs: MatrixLeg[];
  races: Race[];
  horsesByRace: Record<string, Horse[]>;
  combos: number;
  cost: number;
  onChange: (l: MatrixLeg[]) => void;
}) {
  function toggleHorse(i: number, horseNum: string) {
    const leg = legs[i];
    const has = leg.horses.includes(horseNum);
    const updated = has
      ? leg.horses.filter((h) => h !== horseNum)
      : [...leg.horses, horseNum];
    onChange(legs.map((l, idx) => (idx === i ? { ...l, horses: updated } : l)));
  }

  return (
    <div className="space-y-4">
      {legs.map((leg, i) => {
        const race = races.find((r) => r.race_number === leg.race);
        if (!race) return null;
        const horses = (horsesByRace[race.id] ?? []).filter((h) => !h.scratched);
        return (
          <div key={i}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="label mb-0">{`Leg ${i + 1} · Race ${leg.race}`}</p>
              <span className={`chip text-[10px] px-2 py-0.5 ${leg.horses.length > 0 ? 'bg-brand-500/15 text-brand-300' : 'bg-ink-800 text-ink-500'}`}>
                {leg.horses.length} selected
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {horses.map((h) => {
                const hNum = String(h.horse_number);
                const active = leg.horses.includes(hNum);
                const partner = getCoupledPartner(hNum, horses);
                return (
                  <div key={h.id} className="relative">
                    <button
                      onClick={() => toggleHorse(i, hNum)}
                      className={`w-full p-2.5 rounded-xl border text-center transition-all ${
                        active ? 'bg-brand-500/15 border-brand-500 ring-2 ring-brand-500/30' :
                        'bg-ink-900 border-ink-800 hover:border-ink-600'
                      }`}
                    >
                      <span className="font-mono font-extrabold text-brand-300">#{hNum}</span>
                      <p className="text-[10px] text-ink-400 truncate mt-0.5">{h.horse_name || `Horse ${hNum}`}</p>
                    </button>
                    {partner && (
                      <p className="text-[8px] text-accent-400 text-center mt-0.5 font-semibold animate-fade-in">+ #{partner}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {/* Cost summary */}
      <div className="rounded-xl bg-brand-500/10 border border-brand-500/30 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-brand-300" />
          <div>
            <p className="text-xs text-ink-400 uppercase tracking-wide font-semibold">Combinations</p>
            <p className="text-lg font-extrabold text-white">{combos}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-400 uppercase tracking-wide font-semibold">Total Cost</p>
          <p className="text-lg font-extrabold text-brand-300">₱{cost.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}

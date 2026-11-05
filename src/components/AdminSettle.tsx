import { useEffect, useMemo, useRef, useState } from 'react';
import { useRaces } from '@/lib/useRaces';
import { supabase, type Race, type Horse, type Bet } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { Spinner, StatusBadge, EmptyState, Money } from '@/components/ui';
import {
  availableBetTypes,
  BET_TYPES,
  betTypeCode,
  betTypeLabel,
  describeSelections,
  getCoupledPartner,
  isMatrixBet,
  getBetLegs,
  MATRIX_UNIT_PRICE,
} from '@/lib/betting';
import type { BetType } from '@/lib/supabase';
import { Flag, Check, AlertTriangle, Sparkles, Wallet, Loader2 } from 'lucide-react';

export function AdminSettle() {
  const { races, horsesByRace, loading, refetch } = useRaces();
  const { notify } = useToast();
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null);
  const [mode, setMode] = useState<BetType>('FC');
  const [dividend, setDividend] = useState(50);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [betsForRace, setBetsForRace] = useState<Bet[]>([]);

  const sorted = useMemo(() => [...races].sort((a, b) => a.race_number - b.race_number), [races]);
  const selectedRace = useMemo(() => races.find((r) => r.id === selectedRaceId) ?? null, [races, selectedRaceId]);

  // FC winners
  const [fcFirst, setFcFirst] = useState<string | null>(null);
  const [fcSecond, setFcSecond] = useState<string | null>(null);
  // Combo winners (legs) — single horse per leg
  const [comboLegs, setComboLegs] = useState<{ race: number; horse: string | null }[]>([]);

  useEffect(() => {
    if (!selectedRace) return;
    const avail = availableBetTypes(selectedRace.race_number, races);
    if (!avail.includes(mode)) setMode(avail[0] ?? 'FC');
    fetchBets(selectedRace.id);
  }, [selectedRaceId, selectedRace?.id]);

  const lastBuiltKey = useRef<string>('');
  useEffect(() => {
    if (!selectedRace) return;
    const key = `${selectedRace.id}:${mode}`;
    if (lastBuiltKey.current === key) return;
    lastBuiltKey.current = key;
    setFcFirst(null); setFcSecond(null); setResult(null);
    const legRaces = getBetLegs(mode, selectedRace, sorted);
    setComboLegs(legRaces.map((r) => ({ race: r.race_number, horse: null })));
  }, [selectedRace?.id, mode, sorted]);

  async function fetchBets(raceId: string) {
    const { data } = await supabase.from('bets').select('*').eq('race_id', raceId).order('created_at', { ascending: false });
    setBetsForRace((data as Bet[]) ?? []);
  }

  const isUnitDividend = isMatrixBet(mode);
  const dividendLabel = isUnitDividend ? 'Dividend Payout (per ₱2 combo)' : 'Dividend Payout (per ₱5 base bet)';
  const dividendHint = isUnitDividend
    ? `A 1-combo (₱2) winner gets ₱${dividend.toFixed(2)}; a 4-combo (₱8) winner gets ₱${dividend.toFixed(2)} × (8/2) = ₱${(dividend * 4).toFixed(2)}.`
    : `A ₱5 winner gets ₱${dividend.toFixed(2)}; a ₱10 winner gets ₱${(dividend * 2).toFixed(2)}.`;

  async function settle() {
    if (!selectedRace) return;
    if (mode === 'FC' && (fcFirst == null || fcSecond == null)) { notify('Pick 1st and 2nd for Forecast', 'error'); return; }
    if (mode !== 'FC' && comboLegs.some((l) => l.horse == null)) { notify('Pick the winning horse for every race', 'error'); return; }
    if (dividend <= 0) { notify('Enter a dividend amount', 'error'); return; }

    let p_results: any[];
    if (mode === 'FC') {
      p_results = [{ race: selectedRace.race_number, order: [fcFirst, fcSecond] }];
    } else {
      p_results = comboLegs.map((l) => ({ race: l.race, order: [l.horse] }));
    }

    setBusy(true);
    const { data, error } = await supabase.rpc('settle_race', {
      p_race_id: selectedRace.id,
      p_bet_type: mode,
      p_results: p_results,
      p_dividend: dividend,
    });
    setBusy(false);
    if (error) { notify(error.message, 'error'); return; }
    setResult(data);
    notify(`Settled: ${(data as any)?.won ?? 0} won, ${(data as any)?.lost ?? 0} lost`, 'success');
    await refetch();
    await fetchBets(selectedRace.id);
  }

  if (loading) return <div className="p-6 flex justify-center"><Spinner className="text-accent-500" /></div>;

  const availForRace = selectedRace ? availableBetTypes(selectedRace.race_number, races) : [];

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
          <Flag className="w-5 h-5 text-accent-500" /> Settlement Engine
        </h1>
        <p className="text-sm text-ink-500 mt-1">Declare winners, set the dividend, and pay out all matching bets instantly.</p>
      </div>

      {/* Race picker */}
      <section>
        <h2 className="text-sm font-bold text-ink-300 uppercase tracking-wide mb-2 px-1">Select a race</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {sorted.map((race) => {
            const isSel = selectedRaceId === race.id;
            return (
              <button
                key={race.id}
                onClick={() => setSelectedRaceId(race.id)}
                className={`p-3 rounded-xl border text-center transition-all ${isSel ? 'bg-accent-500/10 border-accent-500/60 ring-2 ring-accent-500/30' : 'bg-ink-900 border-ink-800'}`}
              >
                <p className="text-[10px] uppercase text-ink-500 font-bold">Race</p>
                <p className="text-2xl font-extrabold text-white">{race.race_number}</p>
                <StatusBadge status={race.status} />
              </button>
            );
          })}
        </div>
      </section>

      {!selectedRace ? (
        <div className="card"><EmptyState icon={Flag} title="Pick a race to settle" hint="Choose a race above to declare results and pay winners." /></div>
      ) : selectedRace.status === 'settled' && !result ? (
        <div className="card p-5 text-center">
          <Check className="w-10 h-10 text-success-600 mx-auto mb-2" />
          <p className="font-bold text-white">Race {selectedRace.race_number} is already settled</p>
          <p className="text-xs text-ink-500 mt-1">You can re-settle if you need to overwrite results.</p>
        </div>
      ) : (
        <>
          {/* Bet type tabs */}
          <section>
            <h2 className="text-sm font-bold text-ink-300 uppercase tracking-wide mb-2 px-1">Bet Type to Settle</h2>
            <div className="flex flex-wrap gap-2">
              {availForRace.map((t) => {
                const info = BET_TYPES.find((b) => b.type === t)!;
                return (
                  <button
                    key={t}
                    onClick={() => setMode(t)}
                    className={`chip px-3 py-2 text-sm ${mode === t ? 'tab-active' : 'bg-ink-800 text-ink-300'}`}
                  >
                    <span className="font-mono">{betTypeCode(t)}</span> {info.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Winners */}
          <section className="card p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">
              {mode === 'FC' ? 'Declare 1st & 2nd (exact order)' :
                isMatrixBet(mode) ? `Declare the winner of each race — ${betTypeLabel(mode)}` :
                `Declare winners for each leg — ${betTypeLabel(mode)}`}
            </h3>
            {isMatrixBet(mode) && (
              <p className="text-xs text-brand-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-brand-400" />
                Pick only ONE winning horse per race. A bet wins if the horse it selected for that race matches your declared winner.
              </p>
            )}

            {mode === 'FC' ? (
              <div className="space-y-4">
                <HorseSelect
                  race={selectedRace}
                  horses={horsesByRace[selectedRace.id] ?? []}
                  label="1st Place"
                  value={fcFirst}
                  exclude={fcSecond}
                  onChange={setFcFirst}
                />
                <HorseSelect
                  race={selectedRace}
                  horses={horsesByRace[selectedRace.id] ?? []}
                  label="2nd Place"
                  value={fcSecond}
                  exclude={fcFirst}
                  onChange={setFcSecond}
                />
              </div>
            ) : (
              <div className="space-y-4">
                {comboLegs.map((leg, i) => {
                  const legRace = sorted.find((r) => r.race_number === leg.race);
                  if (!legRace) return null;
                  return (
                    <HorseSelect
                      key={i}
                      race={legRace}
                      horses={horsesByRace[legRace.id] ?? []}
                      label={isMatrixBet(mode) ? `Race ${leg.race} — Winner` : `Leg ${i + 1} · Race ${leg.race}`}
                      value={leg.horse}
                      onChange={(n) => setComboLegs((prev) => prev.map((l, idx) => idx === i ? { ...l, horse: n } : l))}
                    />
                  );
                })}
              </div>
            )}

            <div>
              <label className="label">{dividendLabel}</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-500 font-mono">₱</span>
                <input type="number" min={0} step={1} value={dividend} onChange={(e) => setDividend(Number(e.target.value) || 0)} className="input pl-8" />
              </div>
              <p className="text-xs text-ink-500 mt-1.5">{dividendHint}</p>
            </div>

            <div className="rounded-xl bg-ink-950 border border-ink-800 p-3 text-xs text-ink-400">
              <p className="font-semibold text-ink-200 mb-1 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-warning-600" /> Note</p>
              Settling marks all PENDING {betTypeCode(mode)} bets on this race as WON or LOST and credits winners' wallets immediately. This action overwrites prior results if re-run.
            </div>

            <button onClick={settle} disabled={busy} className="btn-accent w-full">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {busy ? 'Settling…' : 'Settle & Pay Winnings'}
            </button>

            {result && (
              <div className="rounded-xl bg-success-100/10 border border-success-500/30 p-3 text-sm animate-scale-in">
                <p className="font-bold text-success-700 flex items-center gap-1.5"><Check className="w-4 h-4" /> Settlement complete</p>
                <p className="text-xs text-success-600 mt-1">
                  Won: {(result as any).won} · Lost: {(result as any).lost} · Total paid out: ₱{Number((result as any).total_payout ?? 0).toFixed(2)}
                </p>
              </div>
            )}
          </section>

          {/* Bets on this race */}
          <section>
            <h3 className="text-sm font-bold text-ink-300 uppercase tracking-wide mb-2 px-1">Bets on this race ({betsForRace.length})</h3>
            <div className="card divide-y divide-ink-800">
              {betsForRace.length === 0 ? (
                <EmptyState icon={Wallet} title="No bets placed yet" hint="Bets will appear here once users start placing them." />
              ) : (
                betsForRace.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="chip bg-ink-800 text-ink-300 font-mono text-[10px]">{betTypeCode(b.bet_type)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-white truncate">{describeSelections(b.bet_type, b.selections)}</p>
                      <p className="text-[10px] text-ink-500 font-mono">{b.ticket_code}</p>
                    </div>
                    <Money value={Number(b.amount)} className="text-xs text-ink-300" />
                    <StatusBadge status={b.status} />
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function HorseSelect({
  race, horses, label, value, exclude, onChange,
}: {
  race: Race; horses: Horse[]; label: string; value: string | null;
  exclude?: string | null; onChange: (n: string | null) => void;
}) {
  const live = horses.filter((h) => !h.scratched);
  return (
    <div>
      <p className="label">{label}</p>
      {live.length === 0 ? (
        <p className="text-xs text-ink-500 py-2">No horses in Race {race.race_number} yet.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {live.map((h) => {
            const hNum = String(h.horse_number);
            const disabled = exclude != null && hNum === exclude;
            const active = value === hNum;
            const partner = getCoupledPartner(hNum, horses);
            return (
              <div key={h.id} className="relative">
                <button
                  disabled={disabled}
                  onClick={() => onChange(active ? null : hNum)}
                  className={`w-full p-2 rounded-lg border text-center transition-all ${active ? 'bg-accent-500/15 border-accent-500 ring-2 ring-accent-500/30' : disabled ? 'bg-ink-900 border-ink-800 opacity-30' : 'bg-ink-900 border-ink-800 hover:border-ink-600'}`}
                >
                  <p className="font-mono font-bold text-accent-400 text-sm">#{hNum}</p>
                  <p className="text-[10px] text-ink-400 truncate">{h.horse_name || `Horse ${hNum}`}</p>
                </button>
                {partner && (
                  <p className="text-[8px] text-accent-400 text-center mt-0.5 font-semibold animate-fade-in">+ #{partner}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

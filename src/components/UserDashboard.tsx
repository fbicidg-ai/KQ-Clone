import { useEffect, useMemo, useState } from 'react';
import { useRaces } from '@/lib/useRaces';
import { availableBetTypes, BET_TYPES, betTypeCode } from '@/lib/betting';
import { useRouter } from '@/lib/router';
import { StreamPlayer } from '@/components/StreamPlayer';
import { StatusBadge, EmptyState, Spinner } from '@/components/ui';
import { useToast } from '@/lib/toast';
import { Radio, ChevronRight, Flag, Users, Calendar } from 'lucide-react';
import type { Race } from '@/lib/supabase';

const BANNER_SRC = '/images/Gemini_Generated_Image_ltxnvlltxnvlltxn copy 2.jpg';

export function UserDashboard() {
  const { races, settings, horsesByRace, loading } = useRaces();
  const { navigate } = useRouter();
  const { notify } = useToast();
  const [activeRace, setActiveRace] = useState<Race | null>(null);

  useEffect(() => {
    if (!activeRace && races.length) {
      // pick the first open race, else the last
      const firstOpen = races.find((r) => r.status === 'open' && r.betting_open);
      setActiveRace(firstOpen ?? races[races.length - 1] ?? null);
    }
  }, [races, activeRace]);

  const streamUrl = activeRace?.stream_url || settings?.stream_url || '';

  useEffect(() => {
    if (streamUrl) notify('KARERA QUEEN', 'info');
  }, [streamUrl, notify]);

  const sorted = useMemo(() => [...races].sort((a, b) => a.race_number - b.race_number), [races]);

  if (loading) return <div className="p-6"><FullScreenLoading /></div>;

  return (
    <div className="px-4 sm:px-0 space-y-5 pt-4 sm:pt-6">
      <section className="relative overflow-hidden rounded-2xl border border-brand-500/25 shadow-2xl shadow-brand-950/30">
        <img src={BANNER_SRC} alt="Karera Queen live racing" className="h-44 sm:h-56 lg:h-64 w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950/85 via-ink-950/25 to-transparent" />
        <div className="absolute inset-y-0 left-0 flex flex-col justify-center p-5 sm:p-7">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-brand-300">Karera Queen</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display mt-1">Watch live. Bet Smart.</h1>
          <p className="text-xs sm:text-sm text-ink-200 mt-2 max-w-xs">Four bet types, one live race card.</p>
        </div>
      </section>

      {/* Hero stream */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-rose-500" />
            Live Racing
          </h1>
          <span className="text-xs text-ink-500 font-mono">
            {races.filter((r) => r.status === 'settled').length}/{races.length} settled
          </span>
        </div>

        <StreamPlayer url={streamUrl} title={activeRace ? `Race ${activeRace.race_number}` : 'Karera Live'} />

        <LiveTicker />
      </section>

      {/* Race selector */}
      <section>
        <h2 className="text-sm font-bold text-ink-300 uppercase tracking-wide mb-3 px-1">Today’s Races</h2>
        {races.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Calendar}
              title="No races scheduled"
              hint="The admin hasn’t published today’s race card yet. Check back soon."
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {sorted.map((race) => {
              const isActive = activeRace?.id === race.id;
              const avail = availableBetTypes(race.race_number, races);
              return (
                <button
                  key={race.id}
                  onClick={() => setActiveRace(race)}
                  style={{ animationDelay: `${sorted.indexOf(race) * 60}ms` }}
                  className={`card p-4 text-left animate-slide-up transition-all hover:border-brand-500/50 ${
                    isActive ? 'ring-2 ring-brand-500/60 border-brand-500/50 shadow-brand-500/20' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-ink-500">Race</span>
                    <span className="text-2xl font-extrabold text-white font-display">{race.race_number}</span>
                  </div>
                  <StatusBadge status={race.betting_open ? 'open' : race.status} />
                  <div className="flex flex-wrap gap-1 mt-3">
                    {BET_TYPES.map((t) => {
                      const on = avail.includes(t.type);
                      return (
                        <span
                          key={t.type}
                          className={`chip text-[10px] px-2 py-0.5 ${
                            on ? 'bg-brand-500/15 text-brand-300' : 'bg-ink-800 text-ink-600 line-through'
                          }`}
                        >
                          {betTypeCode(t.type)}
                        </span>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Active race detail */}
      {activeRace && (
        <RaceDetailCard
          race={activeRace}
          horses={horsesByRace[activeRace.id] ?? []}
          schedule={races}
          onBet={() => navigate(`/app/bet?race=${activeRace.id}`)}
        />
      )}
    </div>
  );
}

function LiveTicker() {
  const items = [
    'KARERA QUEEN ONLINE — BETTING ON THE PHILIPPINES',
    'Daily Double · Extra Double · DD+1 · Forecast',
    'Place your tickets before the gates close',
    'Instant payouts to your wallet after settlement',
  ];
  const loop = [...items, ...items];
  return (
    <div className="relative overflow-hidden rounded-xl border border-brand-500/25 bg-gradient-to-r from-ink-950 via-brand-950/40 to-ink-950 py-2">
      <div className="flex gap-8 whitespace-nowrap animate-ticker">
        {loop.map((text, i) => (
          <span key={i} className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-brand-200">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse-glow" />
            {text}
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-ink-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-ink-950 to-transparent" />
    </div>
  );
}

function RaceDetailCard({
  race,
  horses,
  schedule,
  onBet,
}: {
  race: Race;
  horses: any[];
  schedule: Race[];
  onBet: () => void;
}) {
  const avail = availableBetTypes(race.race_number, schedule);
  const canBet = race.betting_open && race.status !== 'settled' && avail.length > 0;
  return (
    <section className="card overflow-hidden animate-fade-in">
      <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800">
        <div>
          <h3 className="text-lg font-bold text-white">Race {race.race_number}</h3>
          <p className="text-xs text-ink-500">
            {horses.length} horses · {avail.length} bet types open
          </p>
        </div>
        <StatusBadge status={race.betting_open ? 'open' : race.status} />
      </div>

      <div className="divide-y divide-ink-800">
        {horses.length === 0 ? (
          <EmptyState icon={Users} title="No lineup published" hint="Horses will appear once the admin sets the field." />
        ) : (
          horses.map((h) => (
            <div key={h.id} className="flex items-center gap-3 px-5 py-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-extrabold text-sm shrink-0 ${
                h.scratched ? 'bg-ink-800 text-ink-600 line-through' : 'bg-brand-500/15 text-brand-300'
              }`}>
                {h.horse_number}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`font-semibold truncate ${h.scratched ? 'text-ink-600 line-through' : 'text-white'}`}>
                  {h.horse_name || `Horse ${h.horse_number}`}
                </p>
                <p className="text-xs text-ink-500 truncate">{h.jockey || 'Jockey TBD'}</p>
              </div>
              {h.scratched && <span className="chip bg-ink-800 text-ink-500 text-[10px]">SCRATCHED</span>}
            </div>
          ))
        )}
      </div>

      <div className="p-4">
        <button onClick={onBet} disabled={!canBet} className="btn-primary w-full">
          <Flag className="w-4 h-4" />
          {race.status === 'settled' ? 'Race Settled' : !race.betting_open ? 'Betting Closed' : 'Place a Bet'}
          <ChevronRight className="w-4 h-4" />
        </button>
        {!canBet && race.betting_open && avail.length === 0 && (
          <p className="text-xs text-ink-500 text-center mt-2">No combination bets available for the final race.</p>
        )}
      </div>
    </section>
  );
}

function FullScreenLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-ink-400">
      <Spinner className="w-7 h-7 text-brand-500" />
      <p className="text-sm">Loading race card…</p>
    </div>
  );
}

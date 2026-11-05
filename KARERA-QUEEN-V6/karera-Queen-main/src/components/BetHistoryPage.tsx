import { useEffect, useState, useMemo } from 'react';
import { supabase, type Bet, type Race } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { Money, Spinner, StatusBadge, EmptyState } from '@/components/ui';
import { describeSelections, betTypeCode, betTypeLabel } from '@/lib/betting';
import { Ticket, Clock, Check, X, ChevronRight } from 'lucide-react';

type Filter = 'ALL' | 'PENDING' | 'WON' | 'LOST';

export function BetHistoryPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [bets, setBets] = useState<Bet[]>([]);
  const [races, setRaces] = useState<Record<string, Race>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('ALL');

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('bets').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('races').select('*'),
    ]).then(([bRes, rRes]) => {
      if (bRes.error) { notify(bRes.error.message, 'error'); return; }
      if (rRes.error) { notify(rRes.error.message, 'error'); return; }
      setBets((bRes.data as Bet[]) ?? []);
      const map: Record<string, Race> = {};
      for (const r of (rRes.data as Race[]) ?? []) map[r.id] = r;
      setRaces(map);
    }).finally(() => setLoading(false));
  }, [user, notify]);

  const filtered = useMemo(() => {
    if (filter === 'ALL') return bets;
    return bets.filter((b) => b.status === filter);
  }, [bets, filter]);

  const stats = useMemo(() => ({
    total: bets.length,
    won: bets.filter((b) => b.status === 'WON').length,
    pending: bets.filter((b) => b.status === 'PENDING').length,
    payout: bets.filter((b) => b.status === 'WON').reduce((s, b) => s + Number(b.payout_amount), 0),
  }), [bets]);

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
      {/* Summary */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Tickets" value={String(stats.total)} icon={Ticket} tone="text-brand-400" />
        <StatBox label="Pending" value={String(stats.pending)} icon={Clock} tone="text-warning-600" />
        <StatBox label="Won" value={String(stats.won)} icon={Check} tone="text-success-600" />
        <StatBox label="Winnings" value={`₱${stats.payout.toFixed(2)}`} icon={ChevronRight} tone="text-accent-500" />
      </section>

      {/* Filters */}
      <div className="flex gap-1.5">
        {(['ALL', 'PENDING', 'WON', 'LOST'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`chip px-3 py-1.5 ${filter === f ? 'tab-active' : 'bg-ink-800 text-ink-300'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      <section className="space-y-3">
        {loading ? (
          <div className="card p-6 flex justify-center"><Spinner className="text-brand-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Ticket}
              title="No tickets yet"
              hint="Place your first bet from the Races tab — your tickets and results will appear here."
            />
          </div>
        ) : (
          filtered.map((bet) => {
            const race = races[bet.race_id];
            return (
              <div key={bet.id} className="card overflow-hidden animate-fade-in border-brand-500/15">
                <div className="flex items-center justify-between px-4 py-2.5 bg-brand-500/5 border-b border-ink-800">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-bold text-brand-300"><Ticket className="w-3.5 h-3.5" /> Race Ticket</div>
                  <span className="text-[10px] text-ink-500">KARERA QUEEN</span>
                </div>
                <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="chip bg-brand-500/15 text-brand-300 font-mono">{betTypeCode(bet.bet_type)}</span>
                      <span className="text-xs text-ink-500">{betTypeLabel(bet.bet_type)}</span>
                    </div>
                    <p className="font-mono text-xs text-ink-400 mt-1.5">{bet.ticket_code}</p>
                    <p className="text-sm text-white mt-1">{describeSelections(bet.bet_type, bet.selections)}</p>
                    {race && (
                      <p className="text-xs text-ink-500 mt-0.5">Race {race.race_number} · {new Date(bet.created_at).toLocaleString()}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] uppercase text-ink-500 font-semibold">Stake</p>
                    <Money value={Number(bet.amount)} className="text-white font-bold" />
                    <div className="mt-1.5"><StatusBadge status={bet.status} /></div>
                  </div>
                </div>
                {bet.status === 'WON' && (
                  <div className="mt-3 pt-3 border-t border-ink-800 flex items-center justify-between">
                    <span className="text-xs text-success-700 font-semibold flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" /> Won
                    </span>
                    <Money value={Number(bet.payout_amount)} className="text-success-600 font-bold text-lg" />
                  </div>
                )}
                {bet.status === 'LOST' && (
                  <div className="mt-3 pt-3 border-t border-ink-800 flex items-center justify-between">
                    <span className="text-xs text-danger-700 font-semibold flex items-center gap-1.5">
                      <X className="w-3.5 h-3.5" /> Did not win
                    </span>
                    <span className="text-xs text-ink-500">No payout</span>
                  </div>
                )}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

function StatBox({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: string }) {
  return (
    <div className="card p-3">
      <Icon className={`w-4 h-4 ${tone}`} />
      <p className="text-[10px] text-ink-500 uppercase tracking-wide font-semibold mt-2">{label}</p>
      <p className={`text-base font-bold ${tone}`}>{value}</p>
    </div>
  );
}

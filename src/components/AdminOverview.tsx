import { useEffect, useState } from 'react';
import { useRaces } from '@/lib/useRaces';
import { supabase, type Transaction, type Profile } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useRouter } from '@/lib/router';
import { Money, Spinner, StatusBadge, EmptyState } from '@/components/ui';
import { Radio, Flag, Wallet, Users, TrendingUp, AlertCircle, ArrowRight, Settings2 } from 'lucide-react';

export function AdminOverview() {
  const { races, horsesByRace, settings, loading } = useRaces();
  const { notify } = useToast();
  const { navigate } = useRouter();
  const [pendingDeps, setPendingDeps] = useState(0);
  const [pendingWds, setPendingWds] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [totalWagered, setTotalWagered] = useState(0);
  const [totalPaidOut, setTotalPaidOut] = useState(0);
  const [streamDraft, setStreamDraft] = useState('');

  useEffect(() => {
    supabase.from('transactions').select('type,status,amount')
      .then(({ data }: { data: any[] | null }) => {
        if (!data) return;
        setPendingDeps(data.filter((t) => t.type === 'DEPOSIT' && t.status === 'PENDING').length);
        setPendingWds(data.filter((t) => t.type === 'WITHDRAWAL' && t.status === 'PENDING').length);
      });
    supabase.from('profiles').select('id', { count: 'exact', head: true })
      .then(({ count }: { count: number | null }) => setUserCount(count ?? 0));
    supabase.from('transactions').select('type,amount,status')
      .then(({ data }: { data: any[] | null }) => {
        if (!data) return;
        const wagered = data.filter((t) => t.type === 'BET').reduce((s, t) => s + Number(t.amount), 0);
        const paid = data.filter((t) => t.type === 'WIN' && t.status === 'APPROVED').reduce((s, t) => s + Number(t.amount), 0);
        setTotalWagered(wagered);
        setTotalPaidOut(paid);
      });
  }, []);

  useEffect(() => { setStreamDraft(settings?.stream_url ?? ''); }, [settings?.stream_url]);

  async function saveStream() {
    const value = streamDraft.trim();
    if (value && !/^https?:\/\//i.test(value)) {
      notify('Paste a full link that starts with https://', 'error');
      return;
    }
    const { data, error } = await supabase
      .from('settings')
      .update({ stream_url: value, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select('id');
    if (error) { notify(error.message, 'error'); return; }
    if (!data?.length) {
      notify('The stream could not be saved. Sign out, sign back in as an administrator, and try again.', 'error');
      return;
    }
    setStreamDraft(value);
    notify('Live stream updated. Users will see it instantly.', 'success');
  }

  if (loading) return <div className="p-6 flex justify-center"><Spinner className="text-accent-500" /></div>;

  const openRaces = races.filter((r) => r.status === 'open');
  const settledRaces = races.filter((r) => r.status === 'settled');

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white">Race Control Center</h1>
        <p className="text-sm text-ink-500 mt-1">Today’s card overview and live-stream control.</p>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi icon={Radio} label="Active Races" value={String(openRaces.length)} tone="text-brand-400" />
        <Kpi icon={Flag} label="Settled" value={String(settledRaces.length)} tone="text-success-600" />
        <Kpi icon={Users} label="Users" value={String(userCount)} tone="text-accent-500" />
        <Kpi icon={AlertCircle} label="Pending Approvals" value={String(pendingDeps + pendingWds)} tone="text-warning-600" />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Kpi icon={TrendingUp} label="Total Wagered" value={`₱${totalWagered.toFixed(2)}`} tone="text-brand-300" />
        <Kpi icon={Wallet} label="Total Paid Out" value={`₱${totalPaidOut.toFixed(2)}`} tone="text-success-600" />
      </section>

      {/* Stream control */}
      <section className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Settings2 className="w-4 h-4 text-accent-500" />
          <h2 className="text-sm font-bold text-white">Live Stream Broadcast URL</h2>
        </div>
        <p className="text-xs text-ink-500 mb-3">Paste a YouTube or Facebook video or live link. Facebook videos must be set to Public to play inside the page.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={streamDraft}
            onChange={(e) => setStreamDraft(e.target.value)}
            placeholder="https://youtube.com/live/… or https://facebook.com/…/videos/…"
            className="input flex-1"
          />
          <button onClick={saveStream} className="btn-accent">
            <Radio className="w-4 h-4" /> Update Stream
          </button>
        </div>
      </section>

      {/* Race list snapshot */}
      <section>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm font-bold text-ink-300 uppercase tracking-wide">Race Card</h2>
          <button onClick={() => navigate('/admin/races')} className="text-xs text-accent-500 font-semibold flex items-center gap-1">
            Manage all <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        <div className="card divide-y divide-ink-800">
          {races.length === 0 ? (
            <EmptyState icon={Radio} title="No races yet" hint="Create races from the Races tab." />
          ) : (
            [...races].sort((a, b) => a.race_number - b.race_number).map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-lg bg-ink-800 flex items-center justify-center font-extrabold text-white">{r.race_number}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">Race {r.race_number}</p>
                  <p className="text-xs text-ink-500">{horsesByRace[r.id]?.length ?? 0} horses · {r.betting_open ? 'Betting open' : 'Betting closed'}</p>
                </div>
                <StatusBadge status={r.betting_open ? 'open' : r.status} />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: string }) {
  return (
    <div className="card p-4">
      <Icon className={`w-5 h-5 ${tone}`} />
      <p className="text-[10px] text-ink-500 uppercase tracking-wide font-semibold mt-2">{label}</p>
      <p className={`text-lg font-bold ${tone}`}>{value}</p>
    </div>
  );
}

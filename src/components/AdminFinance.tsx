import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase, type Transaction, type Profile } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { Modal } from '@/components/Modal';
import { Money, Spinner, StatusBadge, EmptyState } from '@/components/ui';
import {
  Wallet, ArrowDownToLine, ArrowUpFromLine, Check, X, Loader2, Search, Users, SlidersHorizontal,
} from 'lucide-react';

type Tab = 'PENDING' | 'HISTORY' | 'USERS';

export function AdminFinance() {
  const { notify } = useToast();
  const [tab, setTab] = useState<Tab>('PENDING');
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Profile | null>(null);
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({});
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [txRes, pRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('archived', false).order('created_at', { ascending: false }).limit(200),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    ]);
    if (txRes.error) { notify('Could not load finance requests.', 'error'); }
    if (pRes.error) { notify('Could not load user balances.', 'error'); }
    const nextTxs = (txRes.data as Transaction[]) ?? [];
    const signedProofs = await Promise.all(nextTxs.filter((tx) => tx.screenshot_url).map(async (tx) => {
      const { data } = await supabase.storage.from('payment-proofs').createSignedUrl(tx.screenshot_url, 600);
      return data?.signedUrl ? [tx.id, data.signedUrl] as const : null;
    }));
    setProofUrls(Object.fromEntries(signedProofs.filter((entry): entry is readonly [string, string] => entry !== null)));
    setTxs(nextTxs);
    setProfiles((pRes.data as Profile[]) ?? []);
    setLoading(false);
  }, [notify]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('admin-finance-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  async function clearHistory() {
    setClearing(true);
    const { error } = await supabase.rpc('clear_finance_history');
    setClearing(false);
    if (error) { notify('Could not clear finance history.', 'error'); return; }
    notify('Processed finance history was cleared from this view.', 'success');
    await load();
  }

  async function approve(tx: Transaction) {
    setBusy(tx.id);
    const { error } = await supabase.rpc('approve_transaction', { p_transaction_id: tx.id });
    setBusy(null);
    if (error) { notify(error.message, 'error'); return; }
    notify(`${tx.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'} approved. Wallet updated.`, 'success');
    await load();
  }

  async function reject(tx: Transaction) {
    setBusy(tx.id);
    const { error } = await supabase.rpc('reject_transaction', { p_transaction_id: tx.id });
    setBusy(null);
    if (error) { notify(error.message, 'error'); return; }
    notify('Request rejected', 'success');
    await load();
  }

  const pending = useMemo(() => txs.filter((t) => t.status === 'PENDING'), [txs]);
  const history = useMemo(() => txs.filter((t) => t.status !== 'PENDING'), [txs]);

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white">Finance Management</h1>
        <p className="text-sm text-ink-500 mt-1">Approve deposits and withdrawals, manage user balances.</p>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="flex gap-1.5 flex-1">
          {(['PENDING', 'HISTORY', 'USERS'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`chip px-3 py-1.5 ${tab === t ? 'tab-active' : 'bg-ink-800 text-ink-300'}`}>{t}</button>
          ))}
        </div>
        {tab === 'HISTORY' && <button onClick={clearHistory} disabled={clearing} className="btn-ghost py-1.5 px-2 text-xs text-danger-400">{clearing ? 'Clearing…' : 'Clear history'}</button>}
      </div>

      {loading ? (
        <div className="card p-6 flex justify-center"><Spinner className="text-accent-500" /></div>
      ) : tab === 'PENDING' ? (
        <div className="space-y-3">
          {pending.length === 0 ? (
            <div className="card"><EmptyState icon={Check} title="No pending requests" hint="All deposits and withdrawals have been handled." /></div>
          ) : (
            pending.map((tx) => {
              const profile = profiles.find((p) => p.id === tx.user_id);
              return (
                <div key={tx.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tx.type === 'DEPOSIT' ? 'bg-success-500/15 text-success-600' : 'bg-accent-500/15 text-accent-500'}`}>
                        {tx.type === 'DEPOSIT' ? <ArrowDownToLine className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">{tx.type} · {tx.channel}</p>
                        <p className="text-xs text-ink-500 truncate">{profile?.full_name || profile?.mobile || 'Unknown user'}</p>
                      </div>
                    </div>
                    <Money value={Number(tx.amount)} className="text-white font-bold" />
                  </div>
                  <div className="mt-2 text-xs text-ink-400 space-y-0.5">
                    {tx.reference && <p>Ref: <span className="font-mono text-ink-200">{tx.reference}</span></p>}
                    {tx.account_details && <p className="truncate">Account: <span className="text-ink-200">{tx.account_details}</span></p>}
                    {proofUrls[tx.id] && <a href={proofUrls[tx.id]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300">View payment proof</a>}
                    <p>Submitted: {new Date(tx.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => approve(tx)} disabled={busy === tx.id} className="btn-primary flex-1 py-2 text-xs">
                      {busy === tx.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      {tx.type === 'DEPOSIT' ? 'Approve & Credit' : 'Approve & Pay'}
                    </button>
                    <button onClick={() => reject(tx)} disabled={busy === tx.id} className="btn-secondary py-2 text-xs text-danger-500">
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : tab === 'HISTORY' ? (
        <div className="card divide-y divide-ink-800">
          {history.length === 0 ? (
            <EmptyState icon={Wallet} title="No history yet" />
          ) : (
            history.map((tx) => {
              const profile = profiles.find((p) => p.id === tx.user_id);
              const isCredit = tx.type === 'DEPOSIT' || tx.type === 'WIN' || (tx.type === 'ADMIN_ADJUST' && tx.amount > 0);
              const sign = isCredit ? '+' : '−';
              const tone = isCredit ? 'text-success-600' : tx.type === 'BET' || tx.type === 'WITHDRAWAL' ? 'text-accent-500' : 'text-ink-300';
              return (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{tx.type}</p>
                    <p className="text-xs text-ink-500 truncate">{profile?.full_name || '—'} · {new Date(tx.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-sm font-bold font-mono ${tone}`}>{sign}<Money value={Math.abs(Number(tx.amount))} /></span>
                  <StatusBadge status={tx.status} />
                </div>
              );
            })
          )}
        </div>
      ) : (
        <UsersTab profiles={profiles} onAdjust={setAdjustTarget} />
      )}

      {adjustTarget && (
        <AdjustModal profile={adjustTarget} onClose={() => setAdjustTarget(null)} onDone={load} />
      )}
    </div>
  );
}

function UsersTab({ profiles, onAdjust }: { profiles: Profile[]; onAdjust: (p: Profile) => void }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return profiles;
    return profiles.filter((p) => p.full_name.toLowerCase().includes(t) || p.mobile.includes(t) || p.id.includes(t));
  }, [profiles, q]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 text-ink-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-10" placeholder="Search users by name, mobile, or ID" />
      </div>
      <div className="card divide-y divide-ink-800">
        {filtered.length === 0 ? (
          <EmptyState icon={Users} title="No users found" />
        ) : (
          filtered.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">
                  {p.full_name || '(no name)'}
                  {p.role === 'admin' && <span className="chip bg-accent-500/15 text-accent-500 ml-2 text-[9px]">ADMIN</span>}
                </p>
                <p className="text-xs text-ink-500 truncate">{p.mobile || '—'} · {p.id.slice(0, 8)}</p>
              </div>
              <Money value={Number(p.balance)} className="text-brand-300 font-bold" />
              <button onClick={() => onAdjust(p)} className="btn-ghost py-1.5 px-2 text-xs">
                <SlidersHorizontal className="w-3.5 h-3.5" /> Adjust
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AdjustModal({ profile, onClose, onDone }: { profile: Profile; onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [delta, setDelta] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (delta === 0) { notify('Enter a non-zero amount', 'error'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('admin_adjust_balance', {
      p_user_id: profile.id, p_delta: delta, p_note: note || `Manual adjustment of ${delta > 0 ? '+' : ''}${delta}`,
    });
    setBusy(false);
    if (error) { notify(error.message, 'error'); return; }
    notify(`Balance adjusted by ${delta > 0 ? '+' : ''}₱${delta.toFixed(2)}`, 'success');
    onDone(); onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Adjust balance · ${profile.full_name || 'User'}`}>
      <div className="space-y-4">
        <div className="flex justify-between text-sm bg-ink-950 border border-ink-800 rounded-xl px-4 py-3">
          <span className="text-ink-400">Current Balance</span>
          <Money value={Number(profile.balance)} className="text-white font-bold" />
        </div>
        <div>
          <label className="label">Adjustment Amount (+ to credit, − to debit)</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-500 font-mono">₱</span>
            <input type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value) || 0)} className="input pl-8" />
          </div>
        </div>
        <div>
          <label className="label">Note (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="Reason for adjustment" />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={submit} disabled={busy} className="btn-accent flex-1">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Apply
          </button>
        </div>
      </div>
    </Modal>
  );
}

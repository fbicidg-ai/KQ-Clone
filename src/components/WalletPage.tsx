import { useEffect, useState, useCallback } from 'react';
import { supabase, type Transaction, type TxType, type TxStatus } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useRaces } from '@/lib/useRaces';
import { Modal } from '@/components/Modal';
import { Money, Spinner, StatusBadge, EmptyState } from '@/components/ui';
import { describeSelections, betTypeCode, betTypeLabel } from '@/lib/betting';
import {
  Wallet, ArrowDownToLine, ArrowUpFromLine, History, Plus, Minus, Receipt,
  TrendingUp, Banknote, Smartphone, Building2, Upload, X,
} from 'lucide-react';

const CHANNELS = [
  { id: 'GCash', icon: Smartphone, color: 'text-sky-400' },
  { id: 'Maya', icon: Smartphone, color: 'text-emerald-400' },
  { id: 'Bank Transfer', icon: Building2, color: 'bg-amber-400' },
];

export function WalletPage() {
  const { profile, refreshProfile } = useAuth();
  const { notify } = useToast();
  const { races } = useRaces();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const fetchTxs = useCallback(async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) { notify(error.message, 'error'); return; }
    setTxs((data as Transaction[]) ?? []);
  }, [notify]);

  useEffect(() => {
    fetchTxs().finally(() => setLoading(false));
  }, [fetchTxs]);

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
      <section className="rounded-2xl border border-brand-500/20 bg-gradient-to-r from-brand-500/15 via-ink-900 to-ink-950 px-5 py-4">
        <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-brand-300">KARERA QUEEN ONLINE</p>
        <h1 className="text-lg font-extrabold text-white mt-1">Your betting wallet</h1>
        <p className="text-xs text-ink-400 mt-1">Secure deposits, clear records, and ready race tickets.</p>
      </section>

      {/* Balance card */}
      <section className="card overflow-hidden">
        <div className="p-5 bg-gradient-to-br from-brand-600/20 via-ink-900 to-ink-900">
          <div className="flex items-center gap-2 text-ink-400 text-xs uppercase tracking-wide font-semibold">
            <Wallet className="w-3.5 h-3.5" /> Main Wallet
          </div>
          <Money value={profile?.balance ?? 0} className="text-4xl font-extrabold text-white mt-1.5 block" />
          <p className="text-xs text-ink-500 mt-1">Available for betting</p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-ink-800 border-t border-ink-800">
          <button onClick={() => setDepositOpen(true)} className="btn-ghost rounded-none py-4">
            <ArrowDownToLine className="w-4 h-4 text-success-600" /> Cash In
          </button>
          <button onClick={() => setWithdrawOpen(true)} className="btn-ghost rounded-none py-4">
            <ArrowUpFromLine className="w-4 h-4 text-accent-500" /> Cash Out
          </button>
        </div>
      </section>

      {/* Quick stats */}
      <section className="grid grid-cols-3 gap-3">
        <Stat icon={ArrowDownToLine} label="Deposits" value={sumTxs(txs, 'DEPOSIT', ['APPROVED'])} tone="success" />
        <Stat icon={ArrowUpFromLine} label="Withdrawn" value={sumTxs(txs, 'WITHDRAWAL', ['APPROVED'])} tone="accent" />
        <Stat icon={TrendingUp} label="Winnings" value={sumTxs(txs, 'WIN', ['APPROVED'])} tone="brand" />
      </section>

      {/* Transactions */}
      <section>
        <h2 className="text-sm font-bold text-ink-300 uppercase tracking-wide mb-3 px-1 flex items-center gap-2">
          <History className="w-4 h-4" /> Transaction History
        </h2>
        <div className="card divide-y divide-ink-800">
          {loading ? (
            <div className="p-6 flex justify-center"><Spinner className="text-brand-500" /></div>
          ) : txs.length === 0 ? (
            <EmptyState icon={Receipt} title="No transactions yet" hint="Your deposit, withdrawal, bet and winnings history will show here." />
          ) : (
            txs.map((tx) => <TxRow key={tx.id} tx={tx} />)
          )}
        </div>
      </section>

      <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} onDone={() => { fetchTxs(); refreshProfile(); }} />
      <WithdrawModal open={withdrawOpen} onClose={() => setWithdrawOpen(false)} onDone={() => { fetchTxs(); refreshProfile(); }} balance={profile?.balance ?? 0} />
    </div>
  );
}

function sumTxs(txs: Transaction[], type: TxType, statuses: TxStatus[]) {
  return txs.filter((t) => t.type === type && statuses.includes(t.status)).reduce((s, t) => s + Number(t.amount), 0);
}

function Stat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: 'success' | 'accent' | 'brand' }) {
  const color = tone === 'success' ? 'text-success-600' : tone === 'accent' ? 'text-accent-500' : 'text-brand-400';
  return (
    <div className="card p-3">
      <Icon className={`w-4 h-4 ${color}`} />
      <p className="text-[10px] text-ink-500 uppercase tracking-wide font-semibold mt-2">{label}</p>
      <Money value={value} className={`text-sm font-bold ${color}`} />
    </div>
  );
}

function TxRow({ tx }: { tx: Transaction }) {
  const isCredit = tx.type === 'DEPOSIT' || tx.type === 'WIN' || (tx.type === 'ADMIN_ADJUST' && tx.amount > 0);
  const isDebit = tx.type === 'WITHDRAWAL' || tx.type === 'BET' || (tx.type === 'ADMIN_ADJUST' && tx.amount < 0);
  const sign = isCredit ? '+' : isDebit ? '−' : '';
  const tone = isCredit ? 'text-success-600' : isDebit ? 'text-accent-500' : 'text-ink-300';
  const icon = tx.type === 'DEPOSIT' ? ArrowDownToLine :
    tx.type === 'WITHDRAWAL' ? ArrowUpFromLine :
    tx.type === 'WIN' ? TrendingUp :
    tx.type === 'BET' ? Minus : Receipt;
  const Icon = icon;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-9 h-9 rounded-lg bg-ink-800 flex items-center justify-center shrink-0">
        <Icon className={`w-4 h-4 ${tone}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white truncate">
          {tx.type === 'BET' ? 'Bet placed' : tx.type === 'WIN' ? 'Winnings credited' : tx.type === 'ADMIN_ADJUST' ? 'Balance adjustment' : tx.type}
        </p>
        <p className="text-xs text-ink-500 truncate">
          {tx.note || tx.channel || tx.reference || new Date(tx.created_at).toLocaleString()}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold font-mono ${tone}`}>{sign}<Money value={Math.abs(Number(tx.amount))} /></p>
        <StatusBadge status={tx.status} />
      </div>
    </div>
  );
}

function DepositModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const { notify } = useToast();
  const [amount, setAmount] = useState(100);
  const [channel, setChannel] = useState('GCash');
  const [reference, setReference] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!user) return;
    if (amount < 50) { notify('Minimum deposit is ₱50', 'error'); return; }
    if (!reference.trim()) { notify('Please enter the transaction/reference ID', 'error'); return; }
    if (proofFile && (!['image/jpeg', 'image/png', 'image/webp'].includes(proofFile.type) || proofFile.size > 5 * 1024 * 1024)) {
      notify('Upload a JPG, PNG, or WebP image up to 5 MB.', 'error');
      return;
    }
    setBusy(true);
    let proofPath = '';
    if (proofFile) {
      const extension = proofFile.type === 'image/jpeg' ? 'jpg' : proofFile.type.split('/')[1];
      proofPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('payment-proofs').upload(proofPath, proofFile, { contentType: proofFile.type, upsert: false });
      if (uploadError) {
        setBusy(false);
        notify('Could not upload the payment proof. Please try again.', 'error');
        return;
      }
    }
    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'DEPOSIT',
      amount,
      channel,
      reference: reference.trim(),
      screenshot_url: proofPath,
    });
    setBusy(false);
    if (error) {
      if (proofPath) await supabase.storage.from('payment-proofs').remove([proofPath]);
      notify('Could not submit the deposit request. Please try again.', 'error');
      return;
    }
    notify('Deposit request submitted. Awaiting admin approval.', 'success');
    setAmount(100); setChannel('GCash'); setReference(''); setProofFile(null);
    onDone(); onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Cash In">
      <div className="space-y-4">
        <div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-bold text-white">Scan to pay</p>
              <p className="text-xs text-ink-400 mt-0.5">Use the QR code, then upload your receipt below. </p>
            </div>
            <img src="/images/bank-payment_(2)_copy_2_copy.jpg" alt="Payment QR code" className="w-24 h-24 rounded-xl bg-white object-contain p-1" />
          </div>
          <p className="text-xs text-ink-500">Send the amount to your chosen channel. Your wallet updates after admin approval.</p>
        </div>
        <div>
          <label className="label">Amount (₱)</label>
          <input type="number" min={50} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="input" />
        </div>
        <div>
          <label className="label">Payment Channel</label>
          <div className="grid grid-cols-3 gap-2">
            {CHANNELS.map((c) => (
              <button key={c.id} onClick={() => setChannel(c.id)} className={`p-3 rounded-xl border text-center ${channel === c.id ? 'border-brand-500 bg-brand-500/10' : 'border-ink-800 bg-ink-900'}`}>
                <c.icon className={`w-5 h-5 mx-auto mb-1 ${typeof c.color === 'string' && c.color.startsWith('text-') ? c.color : ''}`} />
                <span className="text-xs font-semibold text-white">{c.id}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Reference / Transaction ID</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} className="input" placeholder="e.g. 1234567890" />
        </div>
        <div>
          <label className="label">Payment Proof Image (optional)</label>
          <label className="flex items-center gap-3 rounded-xl border border-dashed border-ink-700 bg-ink-900 px-4 py-3 cursor-pointer hover:border-brand-500/60 transition-colors">
            <Upload className="w-4 h-4 text-brand-400" />
            <span className="min-w-0 flex-1 text-sm text-ink-300 truncate">{proofFile?.name || 'Choose receipt photo'}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setProofFile(e.target.files?.[0] ?? null)} />
          </label>
          <p className="text-[11px] text-ink-600 mt-1">JPG, PNG, or WebP · maximum 5 MB</p>
        </div>
        <button onClick={submit} disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          Submit Deposit Request
        </button>
      </div>
    </Modal>
  );
}

function WithdrawModal({ open, onClose, onDone, balance }: { open: boolean; onClose: () => void; onDone: () => void; balance: number }) {
  const { user } = useAuth();
  const { notify } = useToast();
  const [amount, setAmount] = useState(100);
  const [channel, setChannel] = useState('GCash');
  const [account, setAccount] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!user) return;
    if (amount < 50) { notify('Minimum withdrawal is ₱50', 'error'); return; }
    if (amount > balance) { notify('Amount exceeds your balance', 'error'); return; }
    if (!account.trim()) { notify('Please enter your account details', 'error'); return; }
    setBusy(true);
    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'WITHDRAWAL',
      amount,
      channel,
      account_details: account.trim(),
    });
    setBusy(false);
    if (error) { notify(error.message, 'error'); return; }
    notify('Withdrawal request submitted. Awaiting admin approval.', 'success');
    setAmount(100); setChannel('GCash'); setAccount('');
    onDone(); onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Cash Out">
      <div className="space-y-4">
        <div className="flex justify-between text-sm bg-ink-950 border border-ink-800 rounded-xl px-4 py-3">
          <span className="text-ink-400">Available</span>
          <Money value={balance} className="text-white font-bold" />
        </div>
        <div>
          <label className="label">Amount (₱)</label>
          <input type="number" min={50} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="input" />
        </div>
        <div>
          <label className="label">Payout Method</label>
          <div className="grid grid-cols-3 gap-2">
            {CHANNELS.map((c) => (
              <button key={c.id} onClick={() => setChannel(c.id)} className={`p-3 rounded-xl border text-center ${channel === c.id ? 'border-brand-500 bg-brand-500/10' : 'border-ink-800 bg-ink-900'}`}>
                <c.icon className="w-5 h-5 mx-auto mb-1 text-ink-400" />
                <span className="text-xs font-semibold text-white">{c.id}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Account Details</label>
          <textarea value={account} onChange={(e) => setAccount(e.target.value)} rows={3} className="input resize-none" placeholder="Account name, number, bank/e-wallet details" />
        </div>
        <button onClick={submit} disabled={busy} className="btn-accent w-full">
          {busy ? <Spinner className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />}
          Submit Withdrawal
        </button>
      </div>
    </Modal>
  );
}

import { Shield, Ticket, Wallet, Trophy, CircleCheck, Download, Apple } from 'lucide-react';

const CHARGE_ROWS = [
  { bet: 5, actual: 5.75 },
  { bet: 10, actual: 11.5 },
  { bet: 100, actual: 115 },
  { bet: 500, actual: 575 },
];

const MAX_WAGERS = [
  { code: 'FC', label: 'Forecast (FC)', max: '₱10,000', scope: 'per race' },
  { code: 'DD', label: 'Daily Double (DD)', max: '₱20,000', scope: 'per race event' },
  { code: 'XD', label: 'Extra Double (XD)', max: '₱20,000', scope: 'per race event' },
  { code: 'DD1', label: 'Daily Double Plus 1 (DD+1)', max: '₱10,000', scope: 'per race event' },
];

const BET_EXPLANATIONS = [
  { code: 'FC', label: 'Forecast (FC)', text: 'Pick the 1st and 2nd place horses in exact order for a single race.' },
  { code: 'DD', label: 'Daily Double (DD)', text: 'Pick the winner of 2 consecutive designated races.' },
  { code: 'XD', label: 'Extra Double (XD)', text: 'Pick the winner of 2 specific non-consecutive designated races.' },
  { code: 'DD1', label: 'Daily Double Plus 1 (DD+1)', text: 'Pick the winner of 2 consecutive races plus 1 extra designated race.' },
];

export function RulesPage({ admin }: { admin?: boolean }) {
  return (
    <div className={admin ? 'p-4 sm:p-6 max-w-3xl mx-auto space-y-5' : 'p-4 sm:p-6 max-w-3xl mx-auto space-y-5'}>
      <section className="relative overflow-hidden rounded-2xl border border-brand-500/25 bg-gradient-to-br from-brand-500/15 via-ink-900 to-ink-950 p-5 sm:p-7 shadow-xl shadow-brand-950/20">
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-accent-400/10 blur-2xl" />
        <div className="relative flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-400/15 text-brand-300 flex items-center justify-center shrink-0"><Shield className="w-5 h-5" /></div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-brand-300">Karera Queen Online</p>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white mt-1">Race Ticket & Wallet Rules</h1>
            <p className="text-sm text-ink-300 mt-2 leading-relaxed">KARERA QUEEN ONLINE BETTING ON THE PHILIPPINES</p>
          </div>
        </div>
      </section>
      <div className="grid grid-cols-3 gap-2">
        {[['Ticket', Ticket, 'Pick & confirm'], ['Wallet', Wallet, 'Safe deposits'], ['Results', Trophy, 'Fast payouts']].map(([label, Icon, text]) => (
          <div key={label as string} className="card p-3 text-center">
            <Icon className="w-4 h-4 text-brand-400 mx-auto" />
            <p className="text-[10px] font-bold text-white mt-2">{label as string}</p>
            <p className="text-[9px] text-ink-500 mt-0.5">{text as string}</p>
          </div>
        ))}
      </div>

      {/* 15% charge */}
      <section className="card p-5 space-y-3">
        <h2 className="text-base font-bold text-white">Halaga ng Taya vs. Aktwal na Bayad </h2>
        <p className="text-sm text-ink-400">
          Kapag ikaw ay tumaya, ito ang eksaktong halaga sa takilya o platform kasama ang dagdag na sentimo/piso:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-500 border-b border-ink-800">
                <th className="py-2 pr-4 font-semibold">Taya (Bet)</th>
                <th className="py-2 font-semibold">Aktwal na Halaga (Actual)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {CHARGE_ROWS.map((row) => (
                <tr key={row.bet}>
                  <td className="py-2.5 pr-4 text-white font-mono">₱{row.bet.toFixed(2)}</td>
                  <td className="py-2.5 text-brand-300 font-mono font-bold">₱{row.actual.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-500">
          Thanks and good luck..
        </p>
      </section>

      {/* Maximum wagers */}
      <section className="card p-5 space-y-3">
        <h2 className="text-base font-bold text-white">Maximum Wagers</h2>
        <div className="space-y-2">
          {MAX_WAGERS.map((w) => (
            <div key={w.code} className="flex items-center justify-between rounded-xl bg-ink-900 border border-ink-800 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">{w.label}</p>
                <p className="text-[11px] text-ink-500">{w.scope}</p>
              </div>
              <span className="text-sm font-mono font-bold text-brand-300">{w.max}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Bet types */}
      <section className="card p-5 space-y-3">
        <h2 className="text-base font-bold text-white">Bet Types</h2>
        <div className="space-y-2.5">
          {BET_EXPLANATIONS.map((b) => (
            <div key={b.code} className="rounded-xl bg-ink-900 border border-ink-800 px-4 py-3">
              <p className="text-sm font-semibold text-white">{b.label}</p>
              <p className="text-xs text-ink-400 mt-1">{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* General rules */}
      <section className="card p-5 space-y-2">
        <h2 className="text-base font-bold text-white">General Rules</h2>
        <ul className="text-sm text-ink-400 space-y-2 list-disc pl-5">
          <li>Betting is only available on races with betting open and not yet settled.</li>
          <li className="flex gap-2"><CircleCheck className="w-4 h-4 text-success-600 shrink-0" />Minimum bet is ₱5.00, in increments of ₱5.75¢</li>
          <li>Combination bets (FC, DD, XD, DD+1) require all legs to exist in the day's schedule and remain open.</li>
          <li className="flex gap-2"><CircleCheck className="w-4 h-4 text-success-600 shrink-0" />Winnings are credited to your wallet instantly once the admin settles the race.</li>
          <li>Scratched horses are voided and cannot be selected.</li>
        </ul>
      </section>

      {/* App download */}
      <section className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-brand-400" />
          <h2 className="text-base font-bold text-white">Download Our App</h2>
        </div>
        <p className="text-sm text-ink-400">Take Karera Queen with you. Bet on the go, watch live streams, and get instant payout notifications.</p>
        <div className="flex gap-3">
          <a
            href="https://video.kareraqueen.online/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center gap-3 rounded-xl bg-ink-900 border border-ink-700 hover:border-brand-500/50 px-4 py-3 transition-all group"
          >
            <Apple className="w-7 h-7 text-white group-hover:scale-110 transition-transform" />
            <div className="text-left min-w-0">
              <p className="text-[10px] text-ink-500 leading-none">Play Now</p>
              <p className="text-sm font-bold text-white leading-tight mt-0.5">Video Karera</p>
            </div>
          </a>
          <a
            href="https://www.mediafire.com/file/0gsax22io7t0zza/KareraQueen_release_v1.0.3.aab/file"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center gap-3 rounded-xl bg-ink-900 border border-ink-700 hover:border-brand-500/50 px-4 py-3 transition-all group"
          >
            <Download className="w-7 h-7 text-white group-hover:scale-110 transition-transform" />
            <div className="text-left min-w-0">
              <p className="text-[10px] text-ink-500 leading-none">Download for</p>
              <p className="text-sm font-bold text-white leading-tight mt-0.5">Android</p>
            </div>
          </a>
        </div>
      </section>
    </div>
  );
}

import { type ReactNode, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from '@/lib/router';
import { Wallet, Radio, Ticket, LogOut, Menu, X, Shield, Settings } from 'lucide-react';
import { Money } from '@/components/ui';

const LOGO_SRC = '/images/Gemini_Generated_Image_fqkynafqkynafqky-removebg-preview.png';

const TABS = [
  { path: '/app', label: 'Races', icon: Radio },
  { path: '/app/bets', label: 'Tickets', icon: Ticket },
  { path: '/app/wallet', label: 'Wallet', icon: Wallet },
  { path: '/app/settings', label: 'Settings', icon: Settings },
  { path: '/app/rules', label: 'Rules', icon: Shield },
];

export function UserShell({
  active,
  children,
}: {
  active: string;
  children: ReactNode;
}) {
  const { profile, signOut } = useAuth();
  const { navigate } = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-ink-950 gradient-mesh pb-20 sm:pb-0">
      {/* Desktop header */}
      <header className="hidden sm:flex sticky top-0 z-30 h-16 glass border-b border-ink-800 items-center px-6 gap-4">
        <button onClick={() => navigate('/app')} className="flex items-center gap-2.5 group">
          <span className="relative">
            <img src={LOGO_SRC} alt="Karera Queen" className="w-10 h-10 rounded-xl object-cover transition-transform group-hover:scale-105" />
            <span className="absolute -inset-0.5 rounded-xl bg-brand-500/30 blur-md -z-10 animate-pulse-glow" />
          </span>
          <span className="font-display font-extrabold text-white text-lg tracking-tight">Karera Queen</span>
        </button>
        <nav className="flex items-center gap-1 ml-6">
          {TABS.map((t) => (
            <button
              key={t.path}
              onClick={() => navigate(t.path)}
              className={`btn-ghost px-3 py-2 ${active === t.path ? 'text-white bg-ink-800' : ''}`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-ink-500 leading-tight">Balance</p>
            <Money value={profile?.balance ?? 0} className="text-base font-bold text-brand-300" />
          </div>
          <button onClick={signOut} className="btn-ghost" aria-label="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Mobile header */}
      <header className="sm:hidden sticky top-0 z-30 h-14 glass border-b border-ink-800 flex items-center px-4">
        <button onClick={() => navigate('/app')} className="flex items-center gap-2">
          <img src={LOGO_SRC} alt="Karera Queen" className="w-8 h-8 rounded-lg object-cover" />
          <span className="font-display font-extrabold text-white">Karera Queen</span>
        </button>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] text-ink-500 leading-none">Balance</p>
            <Money value={profile?.balance ?? 0} className="text-sm font-bold text-brand-300" />
          </div>
          <button onClick={() => setMenuOpen((v) => !v)} className="text-ink-300 p-1" aria-label="Menu">
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="sm:hidden fixed inset-x-0 top-14 z-20 glass border-b border-ink-800 p-4 space-y-1 animate-fade-in">
          {TABS.map((t) => (
            <button
              key={t.path}
              onClick={() => { navigate(t.path); setMenuOpen(false); }}
              className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${active === t.path ? 'bg-ink-800 text-white' : 'text-ink-300'}`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
          <button
            onClick={() => { signOut(); }}
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-danger-400"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      )}

      <main className="sm:max-w-5xl sm:mx-auto sm:py-6 animate-fade-in">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 glass border-t border-ink-800 grid grid-cols-5">
        {TABS.map((t) => {
          const isActive = active === t.path;
          return (
            <button
              key={t.path}
              onClick={() => navigate(t.path)}
              className={`flex flex-col items-center justify-center py-2.5 gap-1 transition-colors ${isActive ? 'text-brand-400' : 'text-ink-500'}`}
            >
              <t.icon className={`w-5 h-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
              <span className="text-[10px] font-semibold uppercase tracking-wide">{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

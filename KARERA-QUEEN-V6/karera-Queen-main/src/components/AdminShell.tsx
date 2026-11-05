import { type ReactNode, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from '@/lib/router';
import {
  LayoutDashboard, Radio, Flag, Wallet, LogOut, Menu, X, Shield,
} from 'lucide-react';

const LOGO_SRC = '/images/Gemini_Generated_Image_fqkynafqkynafqky-removebg-preview.png';

const TABS = [
  { path: '/admin', label: 'Overview', icon: LayoutDashboard },
  { path: '/admin/races', label: 'Races', icon: Radio },
  { path: '/admin/settle', label: 'Settle', icon: Flag },
  { path: '/admin/finance', label: 'Finance', icon: Wallet },
  { path: '/admin/rules', label: 'Rules', icon: Shield },
];

export function AdminShell({ active, children }: { active: string; children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const { navigate } = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-ink-950 gradient-mesh pb-20 sm:pb-0">
      <header className="hidden sm:flex sticky top-0 z-30 h-16 glass border-b border-ink-800 items-center px-6 gap-4">
        <button onClick={() => navigate('/admin')} className="flex items-center gap-2.5">
          <img src={LOGO_SRC} alt="Karera Queen" className="w-9 h-9 rounded-xl object-cover" />
          <div>
            <p className="font-display font-extrabold text-white text-sm leading-none">Karera Admin</p>
            <p className="text-[10px] text-ink-500 leading-none mt-0.5">Race control</p>
          </div>
        </button>
        <nav className="flex items-center gap-1 ml-6">
          {TABS.map((t) => (
            <button
              key={t.path}
              onClick={() => navigate(t.path)}
              className={`btn-ghost px-3 py-2 ${active === t.path ? 'text-white bg-ink-800' : ''}`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-ink-500 leading-tight">{profile?.full_name || 'Administrator'}</p>
            <p className="text-[10px] text-accent-500 font-semibold">ADMIN</p>
          </div>
          <button onClick={signOut} className="btn-ghost" aria-label="Sign out"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>

      <header className="sm:hidden sticky top-0 z-30 h-14 glass border-b border-ink-800 flex items-center px-4">
        <img src={LOGO_SRC} alt="Karera Queen" className="w-8 h-8 rounded-lg object-cover" />
        <span className="font-display font-extrabold text-white ml-2">Admin</span>
        <button onClick={() => setOpen((v) => !v)} className="ml-auto text-ink-300 p-1">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {open && (
        <div className="sm:hidden fixed inset-x-0 top-14 z-20 glass border-b border-ink-800 p-4 space-y-1 animate-fade-in">
          {TABS.map((t) => (
            <button
              key={t.path}
              onClick={() => { navigate(t.path); setOpen(false); }}
              className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${active === t.path ? 'bg-ink-800 text-white' : 'text-ink-300'}`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
          <button onClick={signOut} className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-danger-500">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      )}

      <main className="sm:max-w-5xl sm:mx-auto sm:py-6">{children}</main>

      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 glass border-t border-ink-800 grid grid-cols-5">
        {TABS.map((t) => {
          const isActive = active === t.path;
          return (
            <button
              key={t.path}
              onClick={() => navigate(t.path)}
              className={`flex flex-col items-center justify-center py-2.5 gap-1 ${isActive ? 'text-accent-500' : 'text-ink-500'}`}
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

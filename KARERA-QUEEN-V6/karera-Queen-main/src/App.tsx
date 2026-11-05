import { useAuth } from '@/lib/auth';
import { useRouter } from '@/lib/router';
import { AuthPage } from '@/components/AuthPage';
import { UserShell } from '@/components/UserShell';
import { UserDashboard } from '@/components/UserDashboard';
import { BettingSlip } from '@/components/BettingSlip';
import { WalletPage } from '@/components/WalletPage';
import { BetHistoryPage } from '@/components/BetHistoryPage';
import { AdminShell } from '@/components/AdminShell';
import { AdminOverview } from '@/components/AdminOverview';
import { AdminRaces } from '@/components/AdminRaces';
import { AdminSettle } from '@/components/AdminSettle';
import { AdminFinance } from '@/components/AdminFinance';
import { RulesPage } from '@/components/RulesPage';
import { ProfileSettingsPage } from '@/components/ProfileSettingsPage';
import { FullScreenSpinner } from '@/components/ui';
import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';

const LOGO_SRC = '/images/Gemini_Generated_Image_fqkynafqkynafqky-removebg-preview.png';
const BANNER_SRC = '/images/Gemini_Generated_Image_ltxnvlltxnvlltxn copy 2.jpg';

export default function App() {
  const { route, navigate } = useRouter();
  const { user, profile, loading, isAdmin } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSplashDone(true), 2600);
    return () => window.clearTimeout(timer);
  }, []);

  // Redirect after login: route "/" sends users/admins to their dashboards.
  useEffect(() => {
    if (loading) return;
    if (route.path === '/' && user) {
      navigate(isAdmin ? '/admin' : '/app');
    }
  }, [loading, route.path, user, isAdmin, navigate]);

  if (!splashDone) return <SplashScreen />;
  if (loading) return <FullScreenSpinner label="Loading Karera…" />;

  const path = route.path;

  // Auth routes (no session required)
  if (path === '/login') return <AuthPage mode="login" />;
  if (path === '/register') return <AuthPage mode="register" />;
  if (path === '/admin/login') return <AuthPage mode="admin" />;

  // Landing splash for visitors not signed in.
  if (!user) return <Landing onPick={navigate} />;

  // Admin routes — require admin role.
  if (path.startsWith('/admin')) {
    if (!profile) return <FullScreenSpinner label="Loading Karera…" />;
    if (!isAdmin) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="card p-8 text-center max-w-sm">
            <h1 className="text-lg font-bold text-white">Not an admin account</h1>
            <p className="text-sm text-ink-500 mt-2">Sign in with an administrator account to access this area.</p>
            <button onClick={() => navigate('/app')} className="btn-primary mt-4">Go to User Dashboard</button>
          </div>
        </div>
      );
    }
    const active = path === '/admin' ? '/admin' : path;
    return (
      <AdminShell active={active}>
        {path === '/admin' ? <AdminOverview /> :
         path === '/admin/races' ? <AdminRaces /> :
         path === '/admin/settle' ? <AdminSettle /> :
         path === '/admin/finance' ? <AdminFinance /> :
         path === '/admin/rules' ? <RulesPage admin /> :
         <AdminOverview />}
      </AdminShell>
    );
  }

  // User routes (default)
  const active = path === '/app' ? '/app' : path.startsWith('/app') ? path : '/app';
  return (
    <UserShell active={active}>
      {path === '/app' ? <UserDashboard /> :
       path === '/app/bet' ? <BettingSlip preselectRaceId={route.query.race} /> :
       path === '/app/wallet' ? <WalletPage /> :
       path === '/app/bets' ? <BetHistoryPage /> :
       path === '/app/settings' ? <ProfileSettingsPage /> :
       path === '/app/rules' ? <RulesPage /> :
       <UserDashboard />}
    </UserShell>
  );
}

function SplashScreen() {
  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center overflow-hidden relative">
      <img src={BANNER_SRC} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25 scale-105 animate-splash-zoom" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink-950/50 via-ink-950/80 to-ink-950" />
      <div className="absolute inset-0 gradient-mesh opacity-40" />
      <div className="relative z-10 flex flex-col items-center text-center px-6 animate-scale-in">
        <div className="relative">
          <div className="absolute inset-0 rounded-[2rem] bg-brand-500/20 blur-2xl animate-pulse-glow" />
          <img src={LOGO_SRC} alt="Karera Queen" className="relative w-32 h-32 sm:w-40 sm:h-40 object-cover rounded-[2rem] shadow-2xl shadow-brand-500/40 animate-float" />
        </div>
        <p className="mt-6 text-[10px] sm:text-xs font-bold uppercase tracking-[0.35em] text-brand-300 animate-shimmer-text">
          Thrilling horse racing in the Philippines
        </p>
        <div className="mt-7 w-40 h-1 rounded-full bg-ink-800 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-accent-400 animate-splash-progress" />
        </div>
      </div>
    </div>
  );
}

function Landing({ onPick }: { onPick: (to: string) => void }) {
  return (
    <div className="min-h-screen bg-ink-950 gradient-mesh flex flex-col">
      <div className="relative isolate overflow-hidden border-b border-ink-800">
        <img src={BANNER_SRC} alt="Karera Queen horse racing" className="h-64 sm:h-80 lg:h-[27rem] w-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950/60 via-transparent to-transparent" />
        <img src={LOGO_SRC} alt="Karera Queen logo" className="absolute left-5 top-5 w-20 sm:w-28 drop-shadow-2xl animate-float" />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-brand-400/60" style={{ animation: `pulseGlow 2s ease-in-out ${i * 0.3}s infinite` }} />
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500/30 to-accent-500/20 flex items-center justify-center text-brand-400 mb-5 animate-float shadow-lg shadow-brand-500/20">
          <Trophy className="w-8 h-8" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white font-display tracking-tight text-balance">
          Karera Queen <span className="animate-shimmer-text">Online</span>
        </h1>
        <p className="text-ink-400 mt-3 max-w-md text-balance">
          Philippine horse racing betting — Daily Double, Extra Double, DD+1, and Forecast. Live stream, instant payouts, mobile-first.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mt-7 w-full max-w-xs">
          <button onClick={() => onPick('/login')} className="btn-primary flex-1">Sign in</button>
          <button onClick={() => onPick('/register')} className="btn-secondary flex-1">Create account</button>
        </div>
        <button onClick={() => onPick('/admin/login')} className="text-xs text-ink-600 mt-6 hover:text-ink-400 transition-colors">
          Admin sign in
        </button>
      </div>
    </div>
  );
}


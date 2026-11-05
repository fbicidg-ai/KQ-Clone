import { useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useRouter } from '@/lib/router';
import { Spinner } from '@/components/ui';
import { Mail, Lock, User, Phone, Trophy, ShieldCheck, Download, Apple } from 'lucide-react';

type Mode = 'login' | 'register' | 'admin';

export function AuthPage({ mode }: { mode: Mode }) {
  const { signIn, signUp, signOut } = useAuth();
  const { notify } = useToast();
  const { navigate } = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [busy, setBusy] = useState(false);

  const isAdmin = mode === 'admin';
  const isRegister = mode === 'register';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (isRegister) {
        if (!email || !password || !fullName) throw new Error('All fields are required');
        await signUp(email, password, fullName, mobile);
        notify('Account created. Welcome to Karera!', 'success');
      } else {
        const { role } = await signIn(email, password);
        if (isAdmin && role !== 'admin') {
          await signOut();
          throw new Error('This account does not have administrator access.');
        }
        notify('Signed in successfully', 'success');
      }
      navigate(isAdmin ? '/admin' : '/app');
    } catch (err) {
      const msg = (err as Error).message ?? 'Something went wrong';
      notify(msg, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-ink-950 gradient-mesh relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-1/4 left-1/3 w-72 h-72 bg-brand-500/15 rounded-full blur-3xl animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-accent-500/10 rounded-full blur-3xl" style={{ animation: 'float 8s ease-in-out infinite' }} />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10 relative z-10">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8 animate-fade-in">
            <div className={`relative w-16 h-16 rounded-2xl flex items-center justify-center mb-3 ${isAdmin ? 'bg-gradient-to-br from-accent-500/25 to-accent-400/15 text-accent-400' : 'bg-gradient-to-br from-brand-500/25 to-brand-400/15 text-brand-400'} animate-float shadow-lg shadow-brand-500/20`}>
              {isAdmin ? <ShieldCheck className="w-8 h-8" /> : <Trophy className="w-8 h-8" />}
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              {isAdmin ? 'Admin Console' : <span className="animate-shimmer-text">Karera Online</span>}
            </h1>
            <p className="text-sm text-ink-500 mt-1">
              {isAdmin ? 'Race control & settlement' : 'Philippine Horse Racing Betting'}
            </p>
          </div>

          <div className="card-glow p-6 animate-scale-in">
            <h2 className="text-lg font-bold text-white mb-1">
              {isRegister ? 'Create your account' : isAdmin ? 'Admin sign in' : 'Sign in to bet'}
            </h2>
            <p className="text-sm text-ink-500 mb-5">
              {isRegister
                ? 'Register with your email and mobile number.'
                : isAdmin
                ? 'Restricted access — administrators only.'
                : 'Welcome back. Enter your credentials below.'}
            </p>

            <form onSubmit={onSubmit} className="space-y-4">
              {isRegister && (
                <>
                  <div>
                    <label className="label" htmlFor="fn">Full Name</label>
                    <div className="relative">
                      <User className="w-4 h-4 text-ink-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="fn"
                        className="input pl-10"
                        placeholder="Juan Dela Cruz"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        autoComplete="name"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor="mb">Mobile Number</label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-ink-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="mb"
                        className="input pl-10"
                        placeholder="0917 123 4567"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        inputMode="tel"
                      />
                    </div>
                  </div>
                </>
              )}
              <div>
                <label className="label" htmlFor="em">Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-ink-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="em"
                    type="email"
                    className="input pl-10"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="pw">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-ink-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="pw"
                    type="password"
                    className="input pl-10"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    required
                  />
                </div>
              </div>

              <button type="submit" disabled={busy} className={isAdmin ? 'btn-accent w-full' : 'btn-primary w-full'}>
                {busy && <Spinner className="w-4 h-4" />}
                {isRegister ? 'Create account' : 'Sign in'}
              </button>
            </form>

            {!isAdmin && (
              <div className="mt-5 pt-4 border-t border-ink-800 text-center text-sm text-ink-400">
                {isRegister ? (
                  <>
                    Already have an account?{' '}
                    <button onClick={() => navigate('/login')} className="text-brand-400 font-semibold hover:text-brand-300">
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    New here?{' '}
                    <button onClick={() => navigate('/register')} className="text-brand-400 font-semibold hover:text-brand-300">
                      Create account
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {!isAdmin && (
            <p className="text-center text-xs text-ink-600 mt-4">
              Admin?{' '}
              <button onClick={() => navigate('/admin/login')} className="text-ink-400 hover:text-white underline">
                Sign in here
              </button>
            </p>
          )}

          {/* App download */}
          <div className="mt-6 pt-5 border-t border-ink-800">
            <p className="text-center text-xs font-semibold text-ink-400 uppercase tracking-wide mb-3">Download Our App</p>
            <div className="flex gap-2">
              <a
                href="https://video.kareraqueen.online/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center gap-2.5 rounded-xl bg-ink-900 border border-ink-700 hover:border-brand-500/50 px-3 py-2.5 transition-all group"
              >
                <Apple className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
                <div className="text-left min-w-0">
                  <p className="text-[9px] text-ink-500 leading-none">Play Now</p>
                  <p className="text-xs font-bold text-white leading-tight mt-0.5">Video Karera</p>
                </div>
              </a>
              <a
                href="https://www.mediafire.com/file/0gsax22io7t0zza/KareraQueen_release_v1.0.3.aab/file"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center gap-2.5 rounded-xl bg-ink-900 border border-ink-700 hover:border-brand-500/50 px-3 py-2.5 transition-all group"
              >
                <Download className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
                <div className="text-left min-w-0">
                  <p className="text-[9px] text-ink-500 leading-none">Download for</p>
                  <p className="text-xs font-bold text-white leading-tight mt-0.5">Android</p>
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

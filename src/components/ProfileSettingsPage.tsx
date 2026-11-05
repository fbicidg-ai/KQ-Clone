import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useTheme, type ThemeKey } from '@/lib/themes';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import {
  Loader2, Check, User, Palette, Sparkles, Trophy, Crown, Zap, Shield, Flame,
  Star, Award, Rocket, Gem,
} from 'lucide-react';

interface AvatarOption {
  id: string;
  label: string;
  src: string;
  ring: string;
  glow: string;
}

const PHOTO_AVATARS: AvatarOption[] = [
  { id: 'racer-jockey', label: 'Jockey', src: '/images/images.jpg', ring: 'from-amber-400 to-orange-500', glow: 'shadow-amber-500/30' },
];

interface IconAvatar {
  id: string;
  label: string;
  icon: typeof Trophy;
  ring: string;
  glow: string;
  anim: string;
}

const ICON_AVATARS: IconAvatar[] = [
  { id: 'icon-trophy', label: 'Champion', icon: Trophy, ring: 'from-amber-400 to-orange-500', glow: 'shadow-amber-500/40', anim: 'animate-float' },
  { id: 'icon-flame', label: 'Racer', icon: Flame, ring: 'from-brand-400 to-emerald-400', glow: 'shadow-brand-500/40', anim: 'animate-float' },
  { id: 'icon-crown', label: 'Royalty', icon: Crown, ring: 'from-purple-400 to-rose-500', glow: 'shadow-purple-500/40', anim: 'animate-float' },
  { id: 'icon-zap', label: 'Bolt', icon: Zap, ring: 'from-yellow-400 to-amber-500', glow: 'shadow-yellow-500/40', anim: 'animate-float' },
  { id: 'icon-star', label: 'Star', icon: Star, ring: 'from-cyan-400 to-brand-500', glow: 'shadow-cyan-500/40', anim: 'animate-float' },
  { id: 'icon-shield', label: 'Guardian', icon: Shield, ring: 'from-brand-400 to-ink-500', glow: 'shadow-brand-500/40', anim: 'animate-float' },
  { id: 'icon-award', label: 'Medalist', icon: Award, ring: 'from-rose-400 to-orange-500', glow: 'shadow-rose-500/40', anim: 'animate-float' },
  { id: 'icon-rocket', label: 'Rocket', icon: Rocket, ring: 'from-red-400 to-yellow-500', glow: 'shadow-red-500/40', anim: 'animate-float' },
  { id: 'icon-gem', label: 'Diamond', icon: Gem, ring: 'from-emerald-400 to-cyan-500', glow: 'shadow-emerald-500/40', anim: 'animate-float' },
  { id: 'icon-user', label: 'Classic', icon: User, ring: 'from-stone-400 to-ink-500', glow: 'shadow-stone-500/40', anim: 'animate-float' },
];

export function ProfileSettingsPage() {
  const { profile, refreshProfile, user } = useAuth();
  const { theme, setTheme, available } = useTheme();
  const { notify } = useToast();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [mobile, setMobile] = useState(profile?.mobile ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setMobile(profile?.mobile ?? '');
    setAvatarUrl(profile?.avatar_url ?? '');
  }, [profile]);

  async function saveProfile() {
    setSavingProfile(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, mobile, avatar_url: avatarUrl })
      .eq('id', profile!.id);
    setSavingProfile(false);
    if (error) { notify('Could not save your details.', 'error'); return; }
    await refreshProfile();
    notify('Profile updated', 'success');
  }

  async function applyTheme(key: ThemeKey) {
    setTheme(key);
    setSavingTheme(true);
    const { error } = await supabase
      .from('profiles')
      .update({ theme: key })
      .eq('id', profile!.id);
    setSavingTheme(false);
    if (error) { notify('Theme changed here, but could not save to your account.', 'error'); return; }
    notify(`Theme set to ${available.find((t) => t.key === key)?.name}`, 'success');
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-base)] p-5 sm:p-7 animate-slide-up">
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-[var(--brand-500)]/10 blur-3xl animate-pulse-glow" />
        <div className="absolute -left-6 -bottom-6 w-32 h-32 rounded-full bg-[var(--accent-500)]/10 blur-3xl" style={{ animation: 'float 8s ease-in-out infinite' }} />
        <div className="relative flex items-center gap-4">
          <AvatarDisplay url={avatarUrl} />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--brand-300)]">Karera Queen Online</p>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] mt-1">Your Settings</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1 truncate">Personalize your avatar, theme, and details.</p>
          </div>
        </div>
      </section>

      {/* Profile details */}
      <section className="card p-5 space-y-4 animate-slide-up">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <User className="w-4 h-4 text-[var(--brand-400)]" /> Account Details
        </div>
        <div>
          <label className="label">Full name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" placeholder="Your name" />
        </div>
        <div>
          <label className="label">Mobile number</label>
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} className="input" placeholder="0912 345 6789" />
        </div>
        <div>
          <label className="label">Email</label>
          <input value={user?.email ?? ''} disabled className="input opacity-60" />
        </div>
        <button onClick={saveProfile} disabled={savingProfile} className="btn-primary w-full">
          {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save Details
        </button>
      </section>

      {/* Avatar picker — enhanced */}
      <section className="card p-5 space-y-4 animate-slide-up">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Sparkles className="w-4 h-4 text-[var(--accent-400)]" /> Choose Your Avatar
        </div>
        <p className="text-xs text-[var(--text-muted)]">Pick a racing photo or an animated emblem. Your avatar appears across the app with a glowing ring.</p>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Racing Photos</p>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
            {PHOTO_AVATARS.map((a) => {
              const selected = avatarUrl === a.src;
              return (
                <button key={a.id} onClick={() => setAvatarUrl(a.src)} className="group relative">
                  <div className={`relative aspect-square rounded-2xl overflow-hidden transition-all ${selected ? 'scale-105' : 'hover:scale-105'}`}>
                    <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${a.ring} p-[2px] ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'} transition-opacity`}>
                      <div className="w-full h-full rounded-2xl overflow-hidden bg-ink-950">
                        <img src={a.src} alt={a.label} className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    </div>
                    {!selected && (
                      <div className="absolute inset-[2px] rounded-2xl overflow-hidden border border-[var(--border-subtle)]">
                        <img src={a.src} alt={a.label} className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    )}
                    {selected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <span className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow-lg animate-pop">
                          <Check className="w-4 h-4 text-black" />
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-[9px] text-[var(--text-muted)] text-center mt-1 font-semibold">{a.label}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Animated Emblems</p>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
            {ICON_AVATARS.map((a) => {
              const selected = avatarUrl === a.id;
              const Icon = a.icon;
              return (
                <button key={a.id} onClick={() => setAvatarUrl(a.id)} className="group relative">
                  <div className={`relative aspect-square rounded-2xl transition-all ${selected ? 'scale-105' : 'hover:scale-105'}`}>
                    <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${a.ring} p-[2px] ${selected ? 'opacity-100' : 'opacity-40 group-hover:opacity-70'} transition-opacity`}>
                      <div className="w-full h-full rounded-2xl bg-ink-950 flex items-center justify-center">
                        <Icon className={`w-7 h-7 text-white ${a.anim} drop-shadow-lg`} />
                      </div>
                    </div>
                    <div className={`absolute inset-0 rounded-2xl ${selected ? `shadow-lg ${a.glow}` : ''}`} />
                    {selected && (
                      <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 flex items-center justify-center shadow-lg animate-pop">
                        <Check className="w-3 h-3 text-black" />
                      </div>
                    )}
                    <div className={`absolute inset-0 rounded-2xl ${selected ? '' : 'group-hover:ring-1 ring-white/10'}`} />
                  </div>
                  <p className="text-[9px] text-[var(--text-muted)] text-center mt-1 font-semibold">{a.label}</p>
                </button>
              );
            })}
          </div>
        </div>

        <button onClick={saveProfile} disabled={savingProfile} className="btn-primary w-full">
          {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save Avatar
        </button>
      </section>

      {/* Theme picker */}
      <section className="card p-5 space-y-4 animate-slide-up">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Palette className="w-4 h-4 text-[var(--brand-400)]" /> Choose Your Theme
        </div>
        <p className="text-xs text-[var(--text-muted)]">Switch the entire app's color scheme instantly. Your choice is saved to your account.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {available.map((t) => {
            const selected = theme === t.key;
            return (
              <button
                key={t.key}
                onClick={() => applyTheme(t.key)}
                disabled={savingTheme}
                className={`relative rounded-xl p-3 border-2 transition-all text-left overflow-hidden ${selected ? 'border-[var(--brand-400)] ring-2 ring-[var(--brand-400)]/30 scale-[1.02]' : 'border-[var(--border-subtle)] hover:border-[var(--brand-400)]/40'}`}
                style={{ background: t.swatch }}
              >
                <div className="absolute inset-0 bg-black/30" />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-extrabold text-white drop-shadow">{t.name}</p>
                    {selected && <span className="w-5 h-5 rounded-full bg-white/90 flex items-center justify-center shrink-0 animate-pop"><Check className="w-3.5 h-3.5 text-black" /></span>}
                  </div>
                  <p className="text-[10px] text-white/80 mt-0.5 drop-shadow">{t.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function AvatarDisplay({ url }: { url: string }) {
  const isIcon = url.startsWith('icon-');
  const iconDef = ICON_AVATARS.find((a) => a.id === url);
  const photoDef = PHOTO_AVATARS.find((a) => a.src === url);

  if (isIcon && iconDef) {
    const Icon = iconDef.icon;
    return (
      <div className="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0">
        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${iconDef.ring} p-[2px] shadow-lg ${iconDef.glow}`}>
          <div className="w-full h-full rounded-2xl bg-ink-950 flex items-center justify-center">
            <Icon className={`w-8 h-8 sm:w-10 sm:h-10 text-white ${iconDef.anim} drop-shadow-lg`} />
          </div>
        </div>
        <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[var(--brand-500)] flex items-center justify-center ring-2 ring-[var(--bg-base)]"><Check className="w-3 h-3 text-white" /></span>
      </div>
    );
  }
  if (url) {
    const ring = photoDef?.ring ?? 'from-brand-400 to-accent-400';
    return (
      <div className="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0">
        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${ring} p-[2px] shadow-lg`}>
          <div className="w-full h-full rounded-2xl overflow-hidden bg-ink-950">
            <img src={url} alt="avatar" className="w-full h-full object-cover animate-float" />
          </div>
        </div>
        <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[var(--brand-500)] flex items-center justify-center ring-2 ring-[var(--bg-base)]"><Check className="w-3 h-3 text-white" /></span>
      </div>
    );
  }
  return (
    <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center shrink-0 ring-1 ring-[var(--border-subtle)]">
      <User className="w-8 h-8 text-[var(--text-muted)]" />
    </div>
  );
}

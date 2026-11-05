import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeKey = 'midnight' | 'sunset' | 'emerald' | 'royal' | 'crimson' | 'ocean';

export interface ThemeDef {
  key: ThemeKey;
  name: string;
  description: string;
  swatch: string;
  vars: Record<string, string>;
}

const THEMES: Record<ThemeKey, ThemeDef> = {
  midnight: {
    key: 'midnight',
    name: 'Midnight',
    description: 'Deep navy with electric blue accents',
    swatch: 'linear-gradient(135deg, #020617, #0ea5e9)',
    vars: {
      '--bg-base': '#020617',
      '--bg-surface': 'rgba(15, 23, 42, 0.7)',
      '--bg-elevated': '#0f172a',
      '--brand-400': '#38bdf8',
      '--brand-500': '#0ea5e9',
      '--brand-600': '#0284c7',
      '--brand-300': '#7dd3fc',
      '--accent-400': '#fb923c',
      '--accent-500': '#f97316',
      '--border-subtle': 'rgba(14, 165, 233, 0.2)',
      '--text-primary': '#f8fafc',
      '--text-muted': '#64748b',
      '--gradient-mesh-1': 'rgba(14,165,233,0.18)',
      '--gradient-mesh-2': 'rgba(249,115,22,0.14)',
    },
  },
  sunset: {
    key: 'sunset',
    name: 'Sunset',
    description: 'Warm dusk tones with amber glow',
    swatch: 'linear-gradient(135deg, #1a0a0a, #f97316)',
    vars: {
      '--bg-base': '#160a06',
      '--bg-surface': 'rgba(30, 16, 10, 0.7)',
      '--bg-elevated': '#1f100a',
      '--brand-400': '#fb923c',
      '--brand-500': '#f97316',
      '--brand-600': '#ea580c',
      '--brand-300': '#fdba74',
      '--accent-400': '#f87171',
      '--accent-500': '#ef4444',
      '--border-subtle': 'rgba(249, 115, 22, 0.25)',
      '--text-primary': '#fff7ed',
      '--text-muted': '#9a7264',
      '--gradient-mesh-1': 'rgba(249,115,22,0.2)',
      '--gradient-mesh-2': 'rgba(239,68,68,0.14)',
    },
  },
  emerald: {
    key: 'emerald',
    name: 'Emerald',
    description: 'Rich green turf with gold accents',
    swatch: 'linear-gradient(135deg, #022c22, #10b981)',
    vars: {
      '--bg-base': '#021410',
      '--bg-surface': 'rgba(6, 26, 20, 0.7)',
      '--bg-elevated': '#06241a',
      '--brand-400': '#34d399',
      '--brand-500': '#10b981',
      '--brand-600': '#059669',
      '--brand-300': '#6ee7b7',
      '--accent-400': '#fbbf24',
      '--accent-500': '#f59e0b',
      '--border-subtle': 'rgba(16, 185, 129, 0.25)',
      '--text-primary': '#ecfdf5',
      '--text-muted': '#5a7a6c',
      '--gradient-mesh-1': 'rgba(16,185,129,0.18)',
      '--gradient-mesh-2': 'rgba(245,158,11,0.12)',
    },
  },
  royal: {
    key: 'royal',
    name: 'Royal',
    description: 'Regal plum with rose gold',
    swatch: 'linear-gradient(135deg, #1a0a2e, #db2777)',
    vars: {
      '--bg-base': '#0f0717',
      '--bg-surface': 'rgba(26, 12, 40, 0.7)',
      '--bg-elevated': '#1a0e26',
      '--brand-400': '#e879f9',
      '--brand-500': '#d946ef',
      '--brand-600': '#c026d3',
      '--brand-300': '#f0abfc',
      '--accent-400': '#fb7185',
      '--accent-500': '#f43f5e',
      '--border-subtle': 'rgba(217, 70, 239, 0.22)',
      '--text-primary': '#fdf4ff',
      '--text-muted': '#7a6480',
      '--gradient-mesh-1': 'rgba(217,70,239,0.18)',
      '--gradient-mesh-2': 'rgba(244,63,94,0.14)',
    },
  },
  crimson: {
    key: 'crimson',
    name: 'Crimson',
    description: 'Bold red on dark charcoal',
    swatch: 'linear-gradient(135deg, #1a0505, #dc2626)',
    vars: {
      '--bg-base': '#100505',
      '--bg-surface': 'rgba(26, 10, 10, 0.7)',
      '--bg-elevated': '#1a0808',
      '--brand-400': '#f87171',
      '--brand-500': '#ef4444',
      '--brand-600': '#dc2626',
      '--brand-300': '#fca5a5',
      '--accent-400': '#fb923c',
      '--accent-500': '#f97316',
      '--border-subtle': 'rgba(239, 68, 68, 0.25)',
      '--text-primary': '#fef2f2',
      '--text-muted': '#8a5a5a',
      '--gradient-mesh-1': 'rgba(239,68,68,0.18)',
      '--gradient-mesh-2': 'rgba(249,115,22,0.12)',
    },
  },
  ocean: {
    key: 'ocean',
    name: 'Ocean',
    description: 'Deep teal with cyan currents',
    swatch: 'linear-gradient(135deg, #031424, #06b6d4)',
    vars: {
      '--bg-base': '#03101c',
      '--bg-surface': 'rgba(8, 24, 38, 0.7)',
      '--bg-elevated': '#082030',
      '--brand-400': '#22d3ee',
      '--brand-500': '#06b6d4',
      '--brand-600': '#0891b2',
      '--brand-300': '#67e8f9',
      '--accent-400': '#a3e635',
      '--accent-500': '#84cc16',
      '--border-subtle': 'rgba(6, 182, 212, 0.25)',
      '--text-primary': '#ecfeff',
      '--text-muted': '#5a7a8a',
      '--gradient-mesh-1': 'rgba(6,182,212,0.18)',
      '--gradient-mesh-2': 'rgba(132,204,22,0.12)',
    },
  },
};

export const THEME_LIST = Object.values(THEMES);

export function isValidTheme(key: string): key is ThemeKey {
  return key in THEMES;
}

export function getTheme(key: string): ThemeDef {
  return isValidTheme(key) ? THEMES[key] : THEMES.midnight;
}

interface ThemeContextValue {
  theme: ThemeKey;
  setTheme: (key: ThemeKey) => void;
  available: ThemeDef[];
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'karera-theme';

export function ThemeProvider({ children, initialTheme }: { children: ReactNode; initialTheme?: string }) {
  const [theme, setThemeState] = useState<ThemeKey>(() => {
    if (initialTheme && isValidTheme(initialTheme)) return initialTheme;
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    return stored && isValidTheme(stored) ? stored : 'midnight';
  });

  // When the profile loads (or changes), adopt the account's saved theme.
  useEffect(() => {
    if (initialTheme && isValidTheme(initialTheme)) setThemeState(initialTheme);
  }, [initialTheme]);

  useEffect(() => {
    const def = getTheme(theme);
    const root = document.documentElement;
    Object.entries(def.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.setAttribute('data-theme', theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (key: ThemeKey) => setThemeState(key);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, available: THEME_LIST }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

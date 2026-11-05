import { useEffect, useState, useCallback } from 'react';

/**
 * Minimal hash-based router. The app uses hash routes so deep links work
 * without server config and refresh keeps you on the same page.
 *
 * Routes:
 *   #/              — splash / redirect to user or admin dashboard
 *   #/login         — user login
 *   #/register      — user register
 *   #/admin/login   — admin login
 *   #/app           — user dashboard (live + races)
 *   #/app/bet       — user betting slip (or #/app/bet?race=ID)
 *   #/app/wallet    — wallet + transactions
 *   #/app/bets      — bet history
 *   #/admin         — admin dashboard
 */

export type RouteState = {
  path: string;
  query: Record<string, string>;
};

function parse(): RouteState {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const query: Record<string, string> = {};
  if (qs) {
    new URLSearchParams(qs).forEach((v, k) => { query[k] = v; });
  }
  return { path: path || '/', query };
}

export function useRouter() {
  const [route, setRoute] = useState<RouteState>(parse);

  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to.startsWith('#')) to = to.slice(1);
    window.location.hash = to;
  }, []);

  return { route, navigate };
}

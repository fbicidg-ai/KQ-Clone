import { useEffect, useState, useCallback } from 'react';
import { supabase, type Race, type Horse, type Settings } from '@/lib/supabase';

const horseNumberCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Subscribes to races + settings + horses via Supabase realtime and exposes
 * a polling fallback. The user and admin dashboards both use this.
 *
 * All data is fetched via RPC functions to bypass PostgREST schema cache issues.
 */
export function useRaces() {
  const [races, setRaces] = useState<Race[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [horsesByRace, setHorsesByRace] = useState<Record<string, Horse[]>>({});
  const [loading, setLoading] = useState(true);

  const fetchRaces = useCallback(async () => {
    const { data } = await supabase.rpc('get_races');
    if (data) setRaces(data as unknown as Race[]);
  }, []);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase.rpc('get_settings');
    if (data) setSettings(data as unknown as Settings);
  }, []);

  const fetchHorses = useCallback(async () => {
    const { data } = await supabase.rpc('get_horses');
    if (!data) return;
    const list = data as unknown as Horse[];
    const map: Record<string, Horse[]> = {};
    for (const h of list) {
      (map[h.race_id] ??= []).push(h);
    }
    for (const entries of Object.values(map)) {
      entries.sort((a, b) => horseNumberCollator.compare(a.horse_number, b.horse_number));
    }
    setHorsesByRace(map);
  }, []);

  const refetch = useCallback(async () => {
    await Promise.all([fetchRaces(), fetchSettings(), fetchHorses()]);
  }, [fetchRaces, fetchSettings, fetchHorses]);

  useEffect(() => {
    refetch().finally(() => setLoading(false));

    const channel = supabase
      .channel('karera-live-race-card')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'races' }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'horses' }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, refetch)
      .subscribe();

    const fallback = window.setInterval(refetch, 5000);
    return () => {
      window.clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  return { races, settings, horsesByRace, loading, refetch };
}

import { useEffect, useMemo, useState } from 'react';
import { useRaces } from '@/lib/useRaces';
import { supabase, type Race, type Horse } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { Modal } from '@/components/Modal';
import { Spinner, StatusBadge, EmptyState, Money } from '@/components/ui';
import { availableBetTypes, BET_TYPES, betTypeCode, getCoupledPartner } from '@/lib/betting';
import {
  Plus, Radio, ToggleLeft, ToggleRight, Trash2, Pencil, X, Users, Calendar, Flag, Save, Loader2,
} from 'lucide-react';

export function AdminRaces() {
  const { races, horsesByRace, settings, loading, refetch } = useRaces();
  const { notify } = useToast();
  const [creating, setCreating] = useState(false);
  const [editingRace, setEditingRace] = useState<Race | null>(null);

  const totalRaces = settings?.default_race_count ?? 8;
  const sorted = useMemo(() => [...races].sort((a, b) => a.race_number - b.race_number), [races]);

  async function quickCreateDefault() {
    setCreating(true);
    const { data, error } = await supabase.rpc('create_races', { p_count: totalRaces });
    if (error) { notify(error.message, 'error'); setCreating(false); return; }
    const created = (data as any)?.created ?? 0;
    if (created > 0) {
      notify(`Created ${created} race slot(s).`, 'success');
    } else {
      notify('Race card is full.', 'info');
    }
    await refetch();
    setCreating(false);
  }

  async function toggleBetting(race: Race) {
    const next = !race.betting_open;
    const { error } = await supabase.rpc('toggle_betting', { p_race_id: race.id, p_betting_open: next });
    if (error) { notify(error.message, 'error'); return; }
    notify(`Betting ${next ? 'opened' : 'closed'} for Race ${race.race_number}`, 'success');
    await refetch();
  }

  async function toggleWta(race: Race) {
    const next = !race.wta_enabled;
    const { error } = await supabase.rpc('toggle_wta', { p_race_id: race.id, p_enabled: next });
    if (error) { notify(error.message, 'error'); return; }
    notify(`WTA ${next ? 'activated' : 'deactivated'} for Race ${race.race_number}`, 'success');
    await refetch();
  }

  async function toggleP6(race: Race) {
    const next = !race.p6_enabled;
    const { error } = await supabase.rpc('toggle_p6', { p_race_id: race.id, p_enabled: next });
    if (error) { notify(error.message, 'error'); return; }
    notify(`Pick 6 ${next ? 'activated' : 'deactivated'} for Race ${race.race_number}`, 'success');
    await refetch();
  }

  async function addRace() {
    const { data, error } = await supabase.rpc('create_race');
    if (error) { notify(error.message, 'error'); return; }
    const num = (data as any)?.race_number ?? '?';
    notify(`Race ${num} added`, 'success');
    await refetch();
  }

  async function deleteRace(race: Race) {
    if (!confirm(`Delete Race ${race.race_number}? This also removes its horses and bets.`)) return;
    const { error } = await supabase.rpc('delete_race', { p_race_id: race.id });
    if (error) { notify(error.message, 'error'); return; }
    notify('Race deleted', 'success');
    await refetch();
  }

  if (loading) return <div className="p-6 flex justify-center"><Spinner className="text-accent-500" /></div>;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white">Race & Lineup Management</h1>
          <p className="text-sm text-ink-500 mt-1">Create races, build lineups, and control betting.</p>
        </div>
        <button onClick={addRace} className="btn-accent">
          <Plus className="w-4 h-4" /> New Race
        </button>
      </div>

      {races.length === 0 && (
        <div className="card p-6 text-center">
          <EmptyState icon={Calendar} title="No race card yet" hint="Generate the default 8-race card or add races one by one." />
          <button onClick={quickCreateDefault} disabled={creating} className="btn-accent mt-2">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
            Generate {totalRaces}-Race Card
          </button>
        </div>
      )}

      <div className="space-y-3">
        {sorted.map((race) => (
          <RaceRow
            key={race.id}
            race={race}
            horses={horsesByRace[race.id] ?? []}
            schedule={races}
            onToggle={() => toggleBetting(race)}
            onToggleWta={() => toggleWta(race)}
            onToggleP6={() => toggleP6(race)}
            onEdit={() => setEditingRace(race)}
            onDelete={() => deleteRace(race)}
            onChanged={refetch}
          />
        ))}
      </div>

      {editingRace && (
        <RaceEditorModal race={editingRace} onClose={() => setEditingRace(null)} onSaved={async () => { await refetch(); setEditingRace(null); }} />
      )}
    </div>
  );
}

function RaceRow({
  race, horses, schedule, onToggle, onToggleWta, onToggleP6, onEdit, onDelete, onChanged,
}: {
  race: Race; horses: Horse[]; schedule: Race[];
  onToggle: () => void; onToggleWta: () => void; onToggleP6: () => void;
  onEdit: () => void; onDelete: () => void; onChanged: () => Promise<void>;
}) {
  const { notify } = useToast();
  const avail = availableBetTypes(race.race_number, schedule);
  const wtaFeasible = Array.from({ length: 7 }, (_, i) => schedule.some((r) => r.race_number === race.race_number + i)).every(Boolean);
  const p6Feasible = Array.from({ length: 6 }, (_, i) => schedule.some((r) => r.race_number === race.race_number + i)).every(Boolean);
  const [showHorses, setShowHorses] = useState(false);
  const [addingHorse, setAddingHorse] = useState(false);
  const [editingHorse, setEditingHorse] = useState<Horse | null>(null);

  async function toggleScratch(h: Horse) {
    const { error } = await supabase.rpc('toggle_scratch', { p_horse_id: h.id, p_scratched: !h.scratched });
    if (error) { notify(error.message, 'error'); return; }
    await onChanged();
  }

  async function deleteHorse(h: Horse) {
    const { error } = await supabase.rpc('delete_horse', { p_horse_id: h.id });
    if (error) { notify(error.message, 'error'); return; }
    await onChanged();
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-10 h-10 rounded-xl bg-ink-800 flex items-center justify-center font-extrabold text-white text-lg">{race.race_number}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">Race {race.race_number}</p>
          <p className="text-xs text-ink-500">{horses.length} horses · {avail.length} bet types</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {BET_TYPES.map((t) => (
            <span key={t.type} className={`chip text-[9px] px-1.5 py-0.5 ${avail.includes(t.type) ? 'bg-brand-500/15 text-brand-300' : 'bg-ink-800 text-ink-600 line-through'}`}>
              {betTypeCode(t.type)}
            </span>
          ))}
        </div>
        <button onClick={onToggle} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={race.betting_open ? { color: '#10b981' } : { color: '#64748b' }}>
          {race.betting_open ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
          {race.betting_open ? 'OPEN' : 'CLOSED'}
        </button>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-t border-ink-800 text-xs">
        <button onClick={() => setShowHorses((v) => !v)} className="btn-ghost py-1.5 px-2">
          <Users className="w-3.5 h-3.5" /> {showHorses ? 'Hide' : 'Show'} Lineup
        </button>
        <button onClick={onEdit} className="btn-ghost py-1.5 px-2">
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>
        <button onClick={onDelete} className="btn-ghost py-1.5 px-2 text-danger-500">
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
        <StatusBadge status={race.status} className="ml-auto" />
      </div>

      <div className="flex items-center gap-3 px-4 py-2 border-t border-ink-800 text-xs bg-ink-950/30 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-wide text-ink-500">Activate:</span>
        <button
          onClick={onToggleWta}
          disabled={!wtaFeasible && !race.wta_enabled}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition-all ${
            race.wta_enabled
              ? 'bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/40'
              : wtaFeasible
                ? 'bg-ink-800 text-ink-400 hover:bg-ink-700'
                : 'bg-ink-900 text-ink-600 cursor-not-allowed'
          }`}
        >
          {race.wta_enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
          WTA
          {!wtaFeasible && !race.wta_enabled && <span className="text-[9px] text-ink-600">(needs 7 races)</span>}
        </button>
        <button
          onClick={onToggleP6}
          disabled={!p6Feasible && !race.p6_enabled}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition-all ${
            race.p6_enabled
              ? 'bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/40'
              : p6Feasible
                ? 'bg-ink-800 text-ink-400 hover:bg-ink-700'
                : 'bg-ink-900 text-ink-600 cursor-not-allowed'
          }`}
        >
          {race.p6_enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
          Pick 6
          {!p6Feasible && !race.p6_enabled && <span className="text-[9px] text-ink-600">(needs 6 races)</span>}
        </button>
        {race.wta_enabled && !wtaFeasible && (
          <span className="text-[10px] text-warning-600">Not enough races ahead for WTA</span>
        )}
        {race.p6_enabled && !p6Feasible && (
          <span className="text-[10px] text-warning-600">Not enough races ahead for Pick 6</span>
        )}
      </div>

      {showHorses && (
        <div className="border-t border-ink-800 px-4 py-3 bg-ink-950/50 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-ink-400 uppercase">Lineup</p>
            <button onClick={() => setAddingHorse(true)} className="btn-ghost py-1 px-2 text-xs">
              <Plus className="w-3 h-3" /> Add Horse
            </button>
          </div>
          {horses.length === 0 ? (
            <p className="text-xs text-ink-500 py-4 text-center">No horses added yet.</p>
          ) : (
            <div className="space-y-1.5">
              {horses.map((h) => (
                <div key={h.id} className="flex items-center gap-2 text-sm">
                  <span className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold ${h.scratched ? 'bg-ink-800 text-ink-600 line-through' : 'bg-brand-500/15 text-brand-300'}`}>
                    {h.horse_number}
                  </span>
                  <span className={`flex-1 truncate ${h.scratched ? 'text-ink-600 line-through' : 'text-white'}`}>{h.horse_name || `Horse ${h.horse_number}`}</span>
                  <span className="text-xs text-ink-500 truncate">{h.jockey || 'Jockey TBD'}</span>
                  <button onClick={() => setEditingHorse(h)} className="text-ink-400 hover:text-white p-1" aria-label={`Edit ${h.horse_name || `horse ${h.horse_number}`}`}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => toggleScratch(h)} className="text-xs px-2 py-0.5 rounded text-warning-600 hover:bg-ink-800">
                    {h.scratched ? 'Restore' : 'Scratch'}
                  </button>
                  <button onClick={() => deleteHorse(h)} className="text-danger-500 p-1" aria-label="Delete horse"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          {addingHorse && (
            <AddHorseForm
              raceId={race.id}
              existing={horses}
              onClose={() => setAddingHorse(false)}
              onAdded={async () => { setAddingHorse(false); await onChanged(); }}
            />
          )}
          {editingHorse && (
            <EditHorseForm
              horse={editingHorse}
              onClose={() => setEditingHorse(null)}
              onSaved={async () => { setEditingHorse(null); await onChanged(); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function EditHorseForm({ horse, onClose, onSaved }: { horse: Horse; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const [name, setName] = useState(horse.horse_name);
  const [jockey, setJockey] = useState(horse.jockey);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim() || !jockey.trim()) { notify('Horse name and jockey are required.', 'error'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('update_horse', { p_horse_id: horse.id, p_horse_name: name.trim(), p_jockey: jockey.trim() });
    setBusy(false);
    if (error) { notify('Could not update the horse.', 'error'); return; }
    notify('Horse lineup updated.', 'success');
    onSaved();
  }

  return (
    <div className="mt-3 rounded-xl bg-ink-900 border border-brand-500/30 p-3 space-y-2 animate-scale-in">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Horse Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input py-2" placeholder="Thunder" />
        </div>
        <div>
          <label className="label">Jockey</label>
          <input value={jockey} onChange={(e) => setJockey(e.target.value)} className="input py-2" placeholder="J. Reyes" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="btn-secondary flex-1 py-2">Cancel</button>
        <button onClick={save} disabled={busy} className="btn-primary flex-1 py-2">{busy ? <Spinner className="w-4 h-4" /> : <Save className="w-4 h-4" />} Save</button>
      </div>
    </div>
  );
}

function AddHorseForm({ raceId, existing, onClose, onAdded }: { raceId: string; existing: Horse[]; onClose: () => void; onAdded: () => void }) {
  const { notify } = useToast();
  const [num, setNum] = useState(String(existing.length + 1));
  const [name, setName] = useState('');
  const [jockey, setJockey] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    const trimmed = num.trim();
    if (!trimmed) { notify('Horse number required', 'error'); return; }
    if (existing.some((h) => String(h.horse_number).trim() === trimmed)) {
      notify('Horse number already exists in this race', 'error'); return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('add_horse', { p_race_id: raceId, p_horse_number: trimmed, p_horse_name: name, p_jockey });
    setBusy(false);
    if (error) { notify(error.message, 'error'); return; }
    const partner = getCoupledPartner(trimmed, existing);
    notify(`Horse #${trimmed} added${partner ? ` (coupled with #${partner})` : ''}`, 'success');
    onAdded();
  }

  const partner = getCoupledPartner(num, existing);

  return (
    <div className="mt-3 rounded-xl bg-ink-900 border border-ink-800 p-3 space-y-2 animate-scale-in">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="label">Number</label>
          <input value={num} onChange={(e) => setNum(e.target.value)} className="input py-2" placeholder="1 or 1A" />
          {partner && (
            <p className="text-[10px] text-accent-400 mt-1">Coupled with #{partner}</p>
          )}
        </div>
        <div>
          <label className="label">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input py-2" placeholder="Thunder" />
        </div>
        <div>
          <label className="label">Jockey</label>
          <input value={jockey} onChange={(e) => setJockey(e.target.value)} className="input py-2" placeholder="J. Reyes" />
        </div>
      </div>
      <p className="text-[10px] text-ink-500">Use a letter suffix for coupled entries (e.g. 1A pairs with 1, 2A with 2).</p>
      <div className="flex gap-2">
        <button onClick={onClose} className="btn-secondary flex-1 py-2">Cancel</button>
        <button onClick={add} disabled={busy} className="btn-primary flex-1 py-2">{busy ? <Spinner className="w-4 h-4" /> : <Plus className="w-4 h-4" />} Add</button>
      </div>
    </div>
  );
}

function RaceEditorModal({ race, onClose, onSaved }: { race: Race; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const [streamUrl, setStreamUrl] = useState(race.stream_url ?? '');
  const [bettingOpen, setBettingOpen] = useState(race.betting_open);
  const [status, setStatus] = useState(race.status);
  const [busy, setBusy] = useState(false);

  async function save() {
    const value = streamUrl.trim();
    if (value && !/^https?:\/\//i.test(value)) {
      notify('Paste a full link that starts with https://', 'error');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('update_race', { p_race_id: race.id, p_stream_url: value, p_scheduled_at: null });
    setBusy(false);
    if (error) { notify(error.message, 'error'); return; }
    if (bettingOpen !== race.betting_open) {
      await supabase.rpc('toggle_betting', { p_race_id: race.id, p_betting_open: bettingOpen });
    }
    notify('Race updated', 'success');
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={`Edit Race ${race.race_number}`}>
      <div className="space-y-4">
        <div>
          <label className="label">Race Stream Link (overrides the global stream)</label>
          <input value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} className="input" placeholder="Facebook or YouTube link, or blank to use the global stream" />
          <p className="text-xs text-ink-500 mt-1">Use a Facebook live link when YouTube is not live.</p>
        </div>
        <div>
          <label className="label">Status</label>
          <div className="grid grid-cols-3 gap-2">
            {(['open', 'closed', 'settled'] as const).map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={`btn-secondary py-2 text-xs capitalize ${status === s ? 'ring-2 ring-accent-500/40' : ''}`}>{s}</button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-300 cursor-pointer">
          <input type="checkbox" checked={bettingOpen} onChange={(e) => setBettingOpen(e.target.checked)} className="w-4 h-4 accent-accent-500" />
          Betting open
        </label>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={save} disabled={busy} className="btn-accent flex-1">{busy ? <Spinner className="w-4 h-4" /> : <Save className="w-4 h-4" />} Save</button>
        </div>
      </div>
    </Modal>
  );
}

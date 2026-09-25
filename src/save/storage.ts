import { EVENTS } from '../content/events';
import { CHARMS, ITEMS } from '../core/registry';
import { progressOf, type RunState } from '../core/run';

const KEY = 'coil.run.v1';

export function saveRun(run: RunState | null) {
  try {
    if (!run || run.screen.t === 'victory' || run.screen.t === 'dead') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(run));
  } catch {
    /* storage full or unavailable: ignore */
  }
}

export function loadRun(): RunState | null {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    const run = JSON.parse(s) as RunState;
    if (run.version !== 1) return null;
    // Discard saves that reference content that no longer exists.
    const ok = run.genome.every((g) => ITEMS.has(g)) && (run.charms ?? []).every((c) => CHARMS.has(c)) &&
      (run.screen.t !== 'event' || EVENTS.some((e) => e.id === (run.screen as { id: string }).id));
    return ok ? run : null;
  } catch {
    return null;
  }
}

export interface Profile {
  runs: number;
  victories: number;
  /** Highest molt unlocked (0 = base game only). */
  moltUnlocked: number;
  bestMolt: number;
  dailies: Record<string, { won: boolean; act: number; rooms: number }>;
  /** Milestones: 'act1' (beat act 1), 'act2', 'victory'. */
  unlocks: string[];
  /** Furthest progress ever (see progressOf: 10 per act + row, 30 = victory). */
  best?: number;
  /** Species the player has already picked at least once (for the NEW ribbon). */
  seenSpecies?: string[];
  /** Build epithets earned so far. */
  epithets?: string[];
}

const PKEY = 'coil.profile.v1';

export function loadProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(PKEY) ?? 'null');
    if (p) return { runs: 0, victories: 0, moltUnlocked: 0, bestMolt: -1, dailies: {}, unlocks: [], ...p };
  } catch {
    /* ignore */
  }
  return { runs: 0, victories: 0, moltUnlocked: 0, bestMolt: -1, dailies: {}, unlocks: [] };
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(PKEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Record a finished run; returns the updated profile. */
export function recordRun(run: RunState): Profile {
  const p = loadProfile();
  const won = run.screen.t === 'victory';
  p.runs++;
  if (won) {
    p.victories++;
    p.bestMolt = Math.max(p.bestMolt, run.molt ?? 0);
    p.moltUnlocked = Math.max(p.moltUnlocked, (run.molt ?? 0) + 1);
  }
  const add = (u: string) => void (p.unlocks.includes(u) || p.unlocks.push(u));
  if (run.act >= 1) add('act1');
  if (run.act >= 2) add('act2');
  if (won) add('victory');
  if (run.daily && !p.dailies[run.daily]) p.dailies[run.daily] = { won, act: run.act, rooms: run.stats.rooms };
  p.best = Math.max(p.best ?? 0, progressOf(run));
  const ep = epithetOf(run);
  if (ep && !(p.epithets ?? []).includes(ep.name)) p.epithets = [...(p.epithets ?? []), ep.name];
  saveProfile(p);
  return p;
}

export function markSpeciesSeen(id: string) {
  const p = loadProfile();
  if ((p.seenSpecies ?? []).includes(id)) return;
  p.seenSpecies = [...(p.seenSpecies ?? []), id];
  saveProfile(p);
}

export const EPITHETS = ['a Constrictor', 'a Venomancer', 'an Armoured Coil', 'a Striker', 'a Hunter', 'a Generalist'];

/** What kind of snake was this run? First matching rule wins. */
export function epithetOf(run: RunState): { name: string; why: string } | null {
  const s = run.stats;
  if (s.kills < 5) return null;
  const pct = (n: number) => `${n} of ${s.kills} kills`;
  if (s.coilKills / s.kills >= 0.5) return { name: 'a Constrictor', why: `${pct(s.coilKills)} crushed in coils` };
  if ((s.poisonKills ?? 0) / s.kills >= 0.3) return { name: 'a Venomancer', why: `${pct(s.poisonKills ?? 0)} by poison` };
  if ((s.absorbed ?? 0) >= 6) return { name: 'an Armoured Coil', why: `${s.absorbed} hits shrugged off` };
  const top = Object.entries(s.played ?? {}).sort((a, b) => b[1] - a[1])[0];
  if (top && ['lunge', 'sprint', 'strike'].includes(top[0]) && top[1] >= 5) return { name: 'a Striker', why: `your favourite move: ${top[1]} dashes` };
  if ((s.biteKills ?? 0) / s.kills >= 0.6) return { name: 'a Hunter', why: `${pct(s.biteKills ?? 0)} bitten to death` };
  return { name: 'a Generalist', why: 'a little bit of everything' };
}

export const todayKey = () => new Date().toISOString().slice(0, 10);

/** Record a milestone unlock immediately (mid-run). */
export function unlock(u: string) {
  const p = loadProfile();
  if (!p.unlocks.includes(u)) {
    p.unlocks.push(u);
    saveProfile(p);
  }
}

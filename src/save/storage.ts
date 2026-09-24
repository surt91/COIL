import type { RunState } from '../core/run';

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
    return run.version === 1 ? run : null;
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
}

const PKEY = 'coil.profile.v1';

export function loadProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(PKEY) ?? 'null');
    if (p) return { runs: 0, victories: 0, moltUnlocked: 0, bestMolt: -1, dailies: {}, ...p };
  } catch {
    /* ignore */
  }
  return { runs: 0, victories: 0, moltUnlocked: 0, bestMolt: -1, dailies: {} };
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
  if (run.daily && !p.dailies[run.daily]) p.dailies[run.daily] = { won, act: run.act, rooms: run.stats.rooms };
  saveProfile(p);
  return p;
}

export const todayKey = () => new Date().toISOString().slice(0, 10);

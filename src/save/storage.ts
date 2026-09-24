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

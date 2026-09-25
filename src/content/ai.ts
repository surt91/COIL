/** Shared building blocks for enemy brains. */
import { DIRS, Dir, Pos, manhattan, step } from '../core/geom';
import { protectedSeg } from '../core/fight';
import * as ops from '../core/ops';
import type { Enemy, Fight, Intent } from '../core/types';

export type Part = { uid: number; bi: number };

/** Snake parts within `reach` (Manhattan) of p: uid (0 = head) and body index. Skips protected segments. */
export function adjacentParts(f: Fight, p: Pos, reach = 1): Part[] {
  const out: Part[] = [];
  f.snake.body.forEach((b, bi) => {
    const uid = bi === 0 ? 0 : f.snake.segs[bi - 1].uid;
    const d = manhattan(b, p);
    if (d > 0 && d <= reach && !protectedSeg(f, uid)) out.push({ uid, bi });
  });
  return out;
}

/** Prefer item segments, then flesh, then the head; ties to the segment nearest the head. */
export function juiciest(f: Fight, parts: Part[]): Part {
  const score = (x: Part) => (x.bi === 0 ? 0 : f.snake.segs[x.bi - 1].item ? 100 - x.bi : 50 - x.bi);
  return [...parts].sort((a, b) => score(b) - score(a))[0];
}

/** Lock the juiciest adjacent part, or null if nothing is adjacent. */
export function lockAdjacent(f: Fight, e: Enemy, dmg = 1): Intent | null {
  const adj = adjacentParts(f, e.pos);
  return adj.length ? { t: 'lock', seg: juiciest(f, adj).uid, dmg, windup: 1, reach: 1 } : null;
}

export function approach(f: Fight, e: Enemy, goals: Pos[], steps = 1, flies = false): Intent {
  const d = ops.pathStep(f, e.pos, goals, flies);
  return d === null ? { t: 'wait' } : { t: 'move', dir: d, steps, chase: steps > 1 };
}

export function retreat(f: Fight, e: Enemy, from: Pos, flies = false): Intent {
  let best: Dir | null = null, bestD = manhattan(e.pos, from);
  for (const d of DIRS) {
    const p = step(e.pos, d);
    if (ops.freeForEnemy(f, p, flies) && manhattan(p, from) > bestD) {
      best = d;
      bestD = manhattan(p, from);
    }
  }
  return best === null ? { t: 'wait' } : { t: 'move', dir: best, steps: 1 };
}

/** Tiles on the straight line from `from` in `d`, up to n, stopping at terrain. */
export function line(f: Fight, from: Pos, d: Dir, n: number): Pos[] {
  const out: Pos[] = [];
  let p = from;
  for (let i = 0; i < n; i++) {
    p = step(p, d);
    if (!ops.inBounds(f, p) || ops.isSolid(f, p)) break;
    out.push(p);
  }
  return out;
}

/** Where the head will probably be in two turns (straight ahead, else current). */
export function predictHead(f: Fight): Pos {
  const h = ops.head(f);
  const a = step(h, f.snake.dir, 2);
  return ops.inBounds(f, a) && !ops.isSolid(f, a) ? a : h;
}

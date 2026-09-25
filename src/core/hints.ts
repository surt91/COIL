import { coilDamage, coiledEnemies, computeCoils } from './coil';
import { legalMoves, step } from './fight';
import type { Pos } from './geom';
import type { Fight } from './types';

/** A coil within reach: after `moves` of your own moves, `enemy` would be coiled in `tiles`. */
export interface Pocket { tiles: Pos[]; enemy: number; dmg: number; moves: number }

/**
 * The closest coil the player could close with plain moves (breadth-first, at most
 * `depth` moves, never through a death; losses show up in the move preview). The move preview only
 * looks one move ahead, but a coil is a plan of several: this shows the goal, not
 * the route. Pure: it only calls `step`.
 */
export function coilWithin(f: Fight, depth = 4): Pocket | null {
  // States are immutable (step clones), so the search is cached per state: the view and the tips both ask.
  const memo = depth === 4 ? pocketMemo.get(f) : undefined;
  if (memo !== undefined) return memo;
  const p = searchPocket(f, depth);
  if (depth === 4) pocketMemo.set(f, p);
  return p;
}

const pocketMemo = new WeakMap<Fight, Pocket | null>();

function searchPocket(f: Fight, depth: number): Pocket | null {
  if (f.status !== 'play' || coiledEnemies(f).size > 0) return null;
  let frontier: Fight[] = [f];
  for (let d = 1; d <= depth; d++) {
    const next: Fight[] = [];
    let best: Pocket | null = null;
    for (const g of frontier) {
      for (const dir of legalMoves(g)) {
        const h = step(g, { t: 'move', dir });
        if (h.status !== 'play') continue;
        for (const [e, c] of coiledEnemies(h)) {
          const dmg = coilDamage(h, c);
          if (!best || dmg > best.dmg) best = { tiles: c.tiles, enemy: e.id, dmg, moves: d };
        }
        // The crush lands in the same turn the coil closes: a coil that kills at once
        // leaves no coiled enemy behind, only its crush.
        for (const ev of h.events) {
          if (ev.t !== 'enemyHurt' || ev.cause !== 'crush') continue;
          const c = computeCoils(h).find((cc) => cc.tiles.some((t) => t.x === ev.at.x && t.y === ev.at.y));
          if (c && (!best || ev.dmg > best.dmg)) best = { tiles: c.tiles, enemy: ev.enemy, dmg: ev.dmg, moves: d };
        }
        next.push(h);
      }
    }
    if (best) return best;
    frontier = next;
  }
  return null;
}

/**
 * Static evaluation of a fight state for the search-based bots.
 * Higher is better for the snake. Pure: never mutates the fight.
 */
import { coilDamage, computeCoils, touchCount } from '../core/coil';
import { BREATH, bossExposed, legalMoves, wrapMin } from '../core/fight';
import { Pos, chebyshev, key, manhattan, neighbors4 } from '../core/geom';
import * as ops from '../core/ops';
import { ENEMIES } from '../core/registry';
import type { Fight, Seg } from '../core/types';
import { Tile } from '../core/types';

export interface Weights {
  flesh: number;
  item: number;
  tempItem: number;
  enemyHp: number;
  enemyAlive: number;
  poison: number;
  held: number;
  crush: number;
  enemyDist: number;
  foodDist: number;
  exitDist: number;
  threat: number;
  trapped: number;
  cramped: number;
  /** Coil sense (0 in the baseline bots): reward shrinking an enemy's room to move, wrapping, exposing bosses. */
  confine?: number;
  wrap?: number;
  exposed?: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  flesh: 10,
  item: 18,
  tempItem: 13,
  enemyHp: 9,
  enemyAlive: 30,
  poison: 5,
  held: 8,
  crush: 6,
  enemyDist: 1.2,
  foodDist: 2.5,
  exitDist: 4,
  threat: 0.6,
  trapped: 60,
  cramped: 3,
};

export const WIN = 1e7;
export const DEATH = -1e9;

export const segValue = (s: Seg, w: Weights = DEFAULT_WEIGHTS) => (!s.item ? w.flesh : s.temp ? w.tempItem : w.item);

/** BFS distance from the head to the nearest goal (goals may be non-enterable; we stop next to them). */
export function bfsDist(f: Fight, goals: Pos[], passable: (p: Pos) => boolean, cap = 200): number {
  if (goals.length === 0) return Infinity;
  const goal = new Set(goals.map(key));
  const start = ops.head(f);
  if (goal.has(key(start))) return 0;
  const seen = new Set<number>([key(start)]);
  let frontier: Pos[] = [start];
  for (let d = 1; d <= cap && frontier.length; d++) {
    const nextF: Pos[] = [];
    for (const p of frontier) {
      for (const n of neighbors4(p)) {
        const k = key(n);
        if (seen.has(k)) continue;
        if (goal.has(k)) return d;
        seen.add(k);
        if (passable(n)) nextF.push(n);
      }
    }
    frontier = nextF;
  }
  return Infinity;
}

/**
 * Tiles reachable from the head, treating the body as blocked except for the
 * tail tiles that will have moved away by the time we get there (tail
 * index i frees after body.length - i moves, when nothing is pending).
 */
export function reachable(f: Fight, cap: number): number {
  const s = f.snake;
  const pend = ops.pending(f);
  const bodyIdx = new Map<number, number>();
  s.body.forEach((p, i) => bodyIdx.set(key(p), i));
  const start = s.body[0];
  const seen = new Set<number>([key(start)]);
  let frontier: Pos[] = [start];
  let count = 0;
  for (let d = 1; frontier.length && count < cap; d++) {
    const nextF: Pos[] = [];
    for (const p of frontier) {
      for (const n of neighbors4(p)) {
        const k = key(n);
        if (seen.has(k)) continue;
        seen.add(k);
        if (ops.isSolid(f, n) || !ops.inBounds(f, n)) continue;
        if (ops.enemyAt(f, n)) continue;
        const bi = bodyIdx.get(k);
        if (bi !== undefined && bi > 0) {
          const freesAfter = s.body.length - bi + pend;
          if (freesAfter > d) continue;
        }
        count++;
        nextF.push(n);
      }
    }
    frontier = nextF;
  }
  return count;
}

function lockThreat(f: Fight, w: Weights): number {
  const s = f.snake;
  let pen = 0;
  const uidIndex = new Map<number, number>();
  s.segs.forEach((sg, i) => uidIndex.set(sg.uid, i));
  const headLoss = () => s.segs.slice(0, 2).reduce((a, sg) => a + segValue(sg, w), 0);
  for (const e of f.enemies) {
    const it = e.intent;
    if (it.t === 'lock') {
      const p = ops.segPos(f, it.seg);
      if (!p || chebyshev(p, e.pos) > it.reach) continue;
      const urgency = it.windup <= 1 ? 1 : 0.5;
      if (it.seg === 0) pen += headLoss() * urgency;
      else {
        const k = uidIndex.get(it.seg);
        if (k === undefined) continue;
        if (it.sever) {
          // Everything behind becomes husks: count items heavily, flesh lightly (can be eaten back).
          for (let i = k; i < s.segs.length; i++) pen += segValue(s.segs[i], w) * 0.6 * urgency;
        } else pen += segValue(s.segs[k], w) * urgency;
      }
    } else if (it.t === 'strike') {
      const tiles = new Set(it.tiles.map(key));
      s.body.forEach((p, bi) => {
        if (!tiles.has(key(p))) return;
        if (bi === 0) pen += headLoss() * 0.5; // the head can usually dodge
        else if (s.segs[bi - 1]) pen += segValue(s.segs[bi - 1], w) * it.dmg;
      });
    }
  }
  return pen;
}

export function evaluate(f: Fight, w: Weights = DEFAULT_WEIGHTS): number {
  if (f.status === 'dead') return DEATH;
  const s = f.snake;
  let v = 0;
  for (const sg of s.segs) v += segValue(sg, w);
  // Spent breath never returns: each one is worth about a flesh.
  v += w.flesh * (f.breath ?? BREATH);
  if (f.status === 'won') return WIN + v;

  // Enemies: remaining HP, count, poison that will tick. Once cleared, leftover minions don't matter.
  for (const e of f.cleared ? [] : f.enemies) {
    v -= w.enemyAlive + w.enemyHp * e.hp;
    v += w.poison * Math.min(e.poison, e.hp);
  }

  // Coils: held enemies and future crush.
  if (f.enemies.length) {
    const coils = computeCoils(f);
    for (const c of coils) {
      const ks = new Set(c.tiles.map(key));
      for (const e of f.enemies) {
        if (!ks.has(key(e.pos))) continue;
        v += w.held;
        if (c.crush > 0) v += w.crush * Math.min(coilDamage(f, c), e.hp);
      }
    }
  }

  const h = ops.head(f);
  // Engage: be close to the nearest enemy.
  if (f.enemies.length && !f.cleared) {
    let dmin = Infinity;
    for (const e of f.enemies) dmin = Math.min(dmin, manhattan(e.pos, h));
    v -= w.enemyDist * dmin;
  }

  // Hunger: head for food; steeply once the next hunger tick is unavoidable at this distance.
  if (f.food.length) {
    let dmin = Infinity;
    for (const p of f.food) dmin = Math.min(dmin, manhattan(p, h));
    // A bare head's clock is its breath, not its hunger.
    const left = s.segs.length ? f.opts.hungerEvery - f.hunger : Math.min(f.opts.hungerEvery - f.hunger, f.breath ?? BREATH);
    const tail = s.segs.length ? segValue(s.segs[s.segs.length - 1], w) : w.flesh * 4;
    const risk = Math.min(1, Math.max(0, (dmin - left + 3) / 4));
    const scarce = s.segs.length < 5 ? 1.5 : 0.4;
    v -= w.foodDist * (scarce + f.hunger / f.opts.hungerEvery) * dmin * 0.5 + tail * risk;
  }

  // Cleared: race to an exit.
  if (f.cleared) {
    const exits: Pos[] = [];
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.tiles[y * f.w + x] === Tile.Exit) exits.push({ x, y });
    const bodySet = new Set(s.body.slice(1, -1).map(key));
    const d = bfsDist(f, exits, (p) => !ops.isSolid(f, p) && !bodySet.has(key(p)));
    v -= w.exitDist * (Number.isFinite(d) ? d : 60);
  }

  v -= w.threat * lockThreat(f, w);

  // Self-trapping.
  const lm = legalMoves(f);
  if (lm.length === 0 || lm.every((d) => moveKindIsBody(f, d))) v -= w.trapped * 2;
  const need = Math.min(s.body.length + 2, 24);
  const r = reachable(f, need);
  if (r < need) v -= w.cramped * (need - r);
  if ((w.confine || w.wrap || w.exposed) && !f.cleared) v += coilSense(f, w);
  return v;
}

/** Tiles an enemy could walk to within `n` steps, with your body, husks and webs as walls (a coil's barriers). */
function enemyRoom(f: Fight, from: Pos, n: number, body: Set<number>): number {
  const seen = new Set<number>([key(from)]);
  let frontier = [from];
  let count = 0;
  for (let d = 0; d < n && frontier.length; d++) {
    const next: Pos[] = [];
    for (const p of frontier)
      for (const q of neighbors4(p)) {
        const k = key(q);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!ops.inBounds(f, q) || ops.isSolid(f, q) || body.has(k) || ops.huskAt(f, q) >= 0 || ops.webAt(f, q) >= 0) continue;
        count++;
        next.push(q);
      }
    frontier = next;
  }
  return count;
}

/** Coil planning as a gradient: the less room an enemy has, the closer a coil is. */
function coilSense(f: Fight, w: Weights): number {
  const body = new Set(f.snake.body.map(key));
  const wm = wrapMin(f);
  let v = 0;
  for (const e of f.enemies) {
    if (e.under || e.minion) continue;
    const d = ENEMIES.get(e.kind);
    if (d?.flies) continue;
    // Open floor within 3 steps is 24 tiles; a pocket is a handful.
    if (w.confine) v += w.confine * (24 - Math.min(24, enemyRoom(f, e.pos, 3, body))) / 24 * Math.min(e.hp, 6);
    if (w.wrap) v += w.wrap * Math.min(touchCount(f, e), wm) / wm;
    if (w.exposed && d?.boss && bossExposed(f, e)) v += w.exposed;
  }
  return v;
}

function moveKindIsBody(f: Fight, d: 0 | 1 | 2 | 3): boolean {
  const t = neighbors4(ops.head(f))[d];
  const bi = ops.bodyIndexAt(f, t);
  return bi > 0 && !(bi === f.snake.body.length - 1 && ops.pending(f) === 0);
}

/** Kinds that fly over the body (they may legitimately share a tile with it). */
export const flyingKinds = () => new Set([...ENEMIES.values()].filter((d) => d.flies).map((d) => d.kind));

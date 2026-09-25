/**
 * Low-level board queries and mutations shared by the fight reducer and by
 * content (item actives, enemy AI). Everything mutates the Fight in place and
 * records GameEvents; callers clone before dispatching.
 */
import { DIRS, Dir, Pos, eq, key, neighbors4, step } from './geom';
import { CHARMS, ITEMS, charmSum, enemyDef, item } from './registry';
import type { Enemy, Fight, GameEvent, ItemId, Seg } from './types';
import { Tile } from './types';

export const emit = (f: Fight, e: GameEvent) => void f.events.push(e);

// ---------------------------------------------------------------- queries

export const inBounds = (f: Fight, p: Pos) => p.x >= 0 && p.y >= 0 && p.x < f.w && p.y < f.h;
export const tileAt = (f: Fight, p: Pos): Tile => (inBounds(f, p) ? f.tiles[p.y * f.w + p.x] : Tile.Wall);

/** Impassable terrain for the snake. Exits are walls until the room is cleared. */
export function isSolid(f: Fight, p: Pos): boolean {
  const t = tileAt(f, p);
  return t === Tile.Wall || (t === Tile.Exit && !f.cleared);
}

export const enemyAt = (f: Fight, p: Pos): Enemy | undefined =>
  f.enemies.find((e) => e.hp > 0 && !e.under && (eq(e.pos, p) || (e.body?.some((b) => eq(b, p)) ?? false)));
export const foodAt = (f: Fight, p: Pos): number => f.food.findIndex((q) => eq(q, p));
export const huskAt = (f: Fight, p: Pos): number => f.husks.findIndex((q) => eq(q.pos, p));
export const webAt = (f: Fight, p: Pos): number => f.webs.findIndex((q) => eq(q, p));

/** Index into snake.body (0 = head) or -1. */
export const bodyIndexAt = (f: Fight, p: Pos): number => f.snake.body.findIndex((q) => eq(q, p));

export const pending = (f: Fight) => f.snake.segs.length - (f.snake.body.length - 1);
export const head = (f: Fight) => f.snake.body[0];

/** Position of a segment by uid (0 = head), or null when it is pending / gone. */
export function segPos(f: Fight, uid: number): Pos | null {
  if (uid === 0) return f.snake.body[0];
  const i = f.snake.segs.findIndex((s) => s.uid === uid);
  if (i < 0 || i + 1 >= f.snake.body.length) return null;
  return f.snake.body[i + 1];
}

/** A tile a walking enemy may enter. */
export function freeForEnemy(f: Fight, p: Pos, flies = false): boolean {
  if (!inBounds(f, p)) return false;
  const t = tileAt(f, p);
  if (t === Tile.Wall || t === Tile.Exit) return false;
  if (enemyAt(f, p)) return false;
  if (!flies && (bodyIndexAt(f, p) >= 0 || huskAt(f, p) >= 0)) return false;
  if (flies && eq(p, f.snake.body[0])) return false;
  return true;
}

/** A tile where something new (food, spawn) can appear. */
export function isEmpty(f: Fight, p: Pos): boolean {
  return (
    inBounds(f, p) &&
    tileAt(f, p) === Tile.Floor &&
    !enemyAt(f, p) &&
    bodyIndexAt(f, p) < 0 &&
    huskAt(f, p) < 0 &&
    webAt(f, p) < 0 &&
    foodAt(f, p) < 0
  );
}

export function itemsOnBody(f: Fight): { id: ItemId; seg: number }[] {
  const out: { id: ItemId; seg: number }[] = [];
  const onBoard = f.snake.body.length - 1;
  f.snake.segs.forEach((s, i) => {
    if (s.item && i < onBoard) out.push({ id: s.item, seg: i });
  });
  return out;
}

/** Hand = indices (into segs) of the first three item segments. */
export function hand(f: Fight): number[] {
  const out: number[] = [];
  for (let i = 0; i < f.snake.segs.length && out.length < 3; i++) if (f.snake.segs[i].item) out.push(i);
  return out;
}

export function bodyBonus(f: Fight, field: 'biteBonus' | 'crushBonus' | 'coilAreaBonus' | 'wrapBonus'): number {
  let n = charmSum(f.charms, field);
  for (const { id } of itemsOnBody(f)) n += ITEMS.get(id)?.[field] ?? 0;
  return n;
}

// ---------------------------------------------------------------- snake mutation

export const newUid = (f: Fight) => f.nextId++;

/** Drop surplus tail positions so body.length <= segs.length + 1. */
export function trimBody(f: Fight) {
  const s = f.snake;
  while (s.body.length > s.segs.length + 1) s.body.pop();
}

export function moveHeadTo(f: Fight, to: Pos, dir: Dir) {
  const from = f.snake.body[0];
  f.snake.body.unshift({ ...to });
  f.snake.dir = dir;
  trimBody(f);
  emit(f, { t: 'move', from, to });
}

export function addSeg(f: Fight, itemId: ItemId | null, where: 'tail' | 'neck', temp = false) {
  const seg: Seg = { uid: newUid(f), item: itemId };
  if (temp) seg.temp = true;
  if (where === 'tail') f.snake.segs.push(seg);
  else f.snake.segs.unshift(seg);
}

/**
 * Remove segment k (index into segs). Items shift toward the head, the body
 * contracts from the tail — the geometry keeps its shape.
 */
export function removeSeg(f: Fight, k: number, cause: string) {
  const s = f.snake;
  if (k < 0 || k >= s.segs.length) return;
  const at = k + 1 < s.body.length ? s.body[k + 1] : s.body[s.body.length - 1];
  const [seg] = s.segs.splice(k, 1);
  trimBody(f);
  if (seg.item && cause !== 'cost') f.wasted = (f.wasted ?? 0) + 1;
  if (!seg.item && cause !== 'cost') f.fleshLost = (f.fleshLost ?? 0) + 1;
  emit(f, { t: 'segLost', at, item: seg.item, cause });
}

/** Everything from segment k backwards becomes husks. */
export function sever(f: Fight, k: number) {
  const s = f.snake;
  if (k < 0 || k >= s.segs.length) return;
  const at = s.body[Math.min(k + 1, s.body.length - 1)];
  const cut = s.segs.splice(k);
  f.wasted = (f.wasted ?? 0) + cut.filter((x, i) => x.item && k + i + 1 >= s.body.length).length;
  const positions = s.body.splice(k + 1);
  positions.forEach((pos, i) => f.husks.push({ pos, item: cut[i]?.item ?? null, ttl: 4 }));
  emit(f, { t: 'sever', at, n: cut.length });
}

/** The tail is the last segment, preferring on-board ones. */
export function removeTail(f: Fight, cause: string) {
  if (f.snake.segs.length === 0) return false;
  removeSeg(f, f.snake.segs.length - 1, cause);
  return true;
}

export function kill(f: Fight, cause: string) {
  if (f.status === 'dead') return;
  f.status = 'dead';
  emit(f, { t: 'death', cause });
}

/**
 * An attack hits the snake at body index `bi` (0 = head).
 * Head hits destroy the dmg+1 segments behind the head.
 */
export function hitSnake(f: Fight, bi: number, dmg: number, source: Enemy | null, opts: { sever?: boolean } = {}) {
  const s = f.snake;
  const cause = source ? enemyDef(source.kind).name : 'hunger';
  if (f.buffs.absorb > 0 || (f.shield ?? 0) > 0) {
    if (f.buffs.absorb > 0) f.buffs.absorb--;
    else f.shield!--;
    emit(f, { t: 'absorb', at: s.body[bi] ?? s.body[0] });
    return;
  }
  if (bi === 0) {
    if (s.segs.length === 0) return kill(f, cause);
    for (let n = 0; n < dmg + 1 && s.segs.length > 0; n++) hitSeg(f, 0, source, cause);
    return;
  }
  const k = bi - 1;
  if (k >= s.segs.length) return;
  if (opts.sever) {
    const it = s.segs[k].item;
    if (it && item(it).onHit?.(f, k, source)) return;
    return sever(f, k);
  }
  for (let n = 0; n < dmg && k < s.segs.length; n++) hitSeg(f, k, source, cause);
}

function hitSeg(f: Fight, k: number, source: Enemy | null, cause: string) {
  const seg = f.snake.segs[k];
  if (seg.item && item(seg.item).onHit?.(f, k, source)) return;
  // onHit may have grown segments in front (Clutch's Fang): remove the segment that was hit, not its index.
  removeSeg(f, f.snake.segs.indexOf(seg), cause);
}

// ---------------------------------------------------------------- enemies

export function damageEnemy(f: Fight, e: Enemy, dmg: number, cause: string): boolean {
  if (e.hp <= 0 || dmg <= 0) return false;
  e.hp -= dmg;
  emit(f, { t: 'enemyHurt', enemy: e.id, at: { ...e.pos }, dmg, cause });
  if (e.body) {
    // Lose length from the tail: first what is still in the burrow, then the body.
    let excess = e.body.length + (e.mem.pending ?? 0) - Math.max(0, e.hp - 1);
    const dp = Math.min(e.mem.pending ?? 0, Math.max(0, excess));
    e.mem.pending = (e.mem.pending ?? 0) - dp;
    excess -= dp;
    while (excess-- > 0 && e.body.length) e.body.pop();
  }
  if (e.hp <= 0) {
    emit(f, { t: 'enemyDie', enemy: e.id, at: { ...e.pos }, kind: e.kind });
    for (const c of f.charms ?? []) CHARMS.get(c)?.onKill?.(f, e, cause);
    for (const { id, seg } of itemsOnBody(f)) ITEMS.get(id)?.onEnemyDie?.(f, seg, e, cause);
    enemyDef(e.kind).onDie?.(f, e, cause);
    if (cause === 'crush') {
      // You swallow what you crush — the coil's kill feeds like a killing bite.
      if (!isMeagre(e)) addSeg(f, null, 'tail');
      f.hunger = 0;
      emit(f, { t: 'eat', at: { ...e.pos }, what: 'enemy' });
    }
    if (e.carry) {
      addSeg(f, e.carry, 'neck');
      emit(f, { t: 'msg', text: `${item(e.carry).name} recovered` });
      e.carry = undefined;
    }
    return true;
  }
  return false;
}

export function removeDead(f: Fight) {
  f.enemies = f.enemies.filter((e) => e.hp > 0);
}

export function spawnEnemy(f: Fight, kind: string, at: Pos): Enemy {
  const d = enemyDef(kind);
  const e: Enemy = { id: newUid(f), kind, pos: { ...at }, hp: d.hp, maxHp: d.hp, intent: { t: 'wait' }, poison: 0, held: false, mem: {} };
  if (d.snake) {
    // All body segments start stacked "in the burrow" at the head and uncoil as it moves.
    e.body = [];
    e.mem.pending = d.hp - 1;
  }
  f.enemies.push(e);
  return e;
}

/** Move an enemy one tile; snakes drag their body along. */
export function moveEnemy(f: Fight, e: Enemy, to: Pos) {
  const from = { ...e.pos };
  if (e.body) {
    e.body.unshift(from);
    const fi = foodAt(f, to);
    if (fi >= 0) {
      f.food.splice(fi, 1);
      e.hp++;
      e.maxHp = Math.max(e.maxHp, e.hp);
      emit(f, { t: 'eat', at: to, what: 'food' });
    } else if ((e.mem.pending ?? 0) > 0) e.mem.pending--;
    while (e.body.length > Math.max(0, e.hp - 1 - (e.mem.pending ?? 0))) e.body.pop();
  }
  e.pos = { ...to };
  emit(f, { t: 'enemyMove', enemy: e.id, from, to });
}

/** Bite into an enemy snake's body at index k: everything from k back falls off as husks. */
export const BOSS_SEVER_MAX = 5;

/** Tiles a walking enemy at `from` could reach within n steps (walls, bodies and others block). */
export function floodFrom(f: Fight, from: Pos, n: number): Pos[] {
  const seen = new Set<number>([key(from)]);
  let frontier = [from];
  const out: Pos[] = [];
  for (let d = 0; d < n; d++) {
    const next: Pos[] = [];
    for (const p of frontier)
      for (const q of neighbors4(p)) {
        if (seen.has(key(q)) || !freeForEnemy(f, q, false)) continue;
        seen.add(key(q));
        out.push(q);
        next.push(q);
      }
    frontier = next;
  }
  return out;
}

/** Too small to feed you: grublings, and brood summoned by bosses. */
export const isMeagre = (e: Enemy) => !!e.meagre || !!enemyDef(e.kind).meagre;

export function cutEnemy(f: Fight, e: Enemy, k: number, cause: string): boolean {
  if (!e.body || k < 0 || k >= e.body.length) return false;
  // A boss's ancient hide: one bite tears off at most BOSS_SEVER_MAX tail segments.
  const boss = enemyDef(e.kind).boss;
  if (boss) k = Math.max(k, e.body.length - BOSS_SEVER_MAX);
  const cut = e.body.splice(k);
  for (const pos of cut) f.husks.push({ pos, item: null, ttl: 4 });
  const n = cut.length + (boss ? 0 : e.mem.pending ?? 0);
  if (!boss) e.mem.pending = 0;
  return damageEnemy(f, e, n, cause);
}

/**
 * BFS from `from` toward the nearest goal tile; returns the first step
 * direction or null. Goals need not be enterable (we path to a neighbour).
 */
export function pathStep(f: Fight, from: Pos, goals: Pos[], flies = false): Dir | null {
  if (goals.length === 0) return null;
  const goalSet = new Set(goals.map(key));
  const seen = new Map<number, Dir>();
  const q: Pos[] = [];
  for (const d of DIRS) {
    const p = step(from, d);
    if (goalSet.has(key(p))) return null; // already adjacent
    if (!freeForEnemy(f, p, flies) || seen.has(key(p))) continue;
    seen.set(key(p), d);
    q.push(p);
  }
  for (let i = 0; i < q.length; i++) {
    const p = q[i];
    const first = seen.get(key(p))!;
    for (const n of neighbors4(p)) {
      if (goalSet.has(key(n))) return first;
      if (seen.has(key(n)) || !freeForEnemy(f, n, flies)) continue;
      seen.set(key(n), first);
      q.push(n);
    }
  }
  return null;
}

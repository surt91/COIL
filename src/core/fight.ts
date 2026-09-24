/**
 * The fight reducer: (Fight, Action) -> Fight (+ events in fight.events).
 * Pure with respect to its input: `step` clones before mutating.
 */
import { computeCoils, enemyCoilsHead } from './coil';
import { DIRS, Dir, Pos, chebyshev, eq, key, manhattan, step as stepPos } from './geom';
import * as ops from './ops';
import { CHARMS, ENEMIES, charmSum, enemyDef, item } from './registry';
import { Rng, int, makeRng, pick, shuffle } from './rng';
import type { Action, Enemy, Fight, FightOpts, Intent, ItemId } from './types';
import { Tile } from './types';

/** An enemy touching this many snake tiles (8-neighbourhood) is squeezed. */
export const WRAP_MIN = 4;
export const wrapMin = (f: Fight) => Math.max(2, WRAP_MIN - charmSum(f.charms, 'wrapBonus'));

export const DEFAULT_OPTS: FightOpts = {
  hungerEvery: 12,
  escalateFrom: 25,
  escalateEvery: 6,
  minFood: 1,
};

// ---------------------------------------------------------------- setup

export interface RoomSpec {
  rows: string[];
  genome: ItemId[];
  flesh: number;
  seed: number;
  opts?: Partial<FightOpts>;
  /** Optional explicit snake (tests): body positions head first, segment items. */
  snake?: { body: Pos[]; items?: (ItemId | null)[]; dir?: Dir };
  shuffleGenome?: boolean;
  /** Enemy kinds to place on random free tiles away from the start. */
  place?: string[];
  charms?: string[];
}

/**
 * Legend: `#` wall, `.` floor, `E` exit, `S` start burrow, `f` food,
 * `w` web, `x` escalation spawn point, enemy chars from their definitions.
 */
export function createFight(spec: RoomSpec): Fight {
  const h = spec.rows.length;
  const w = Math.max(...spec.rows.map((r) => r.length));
  const byChar = new Map([...ENEMIES.values()].map((d) => [d.char, d.kind]));
  const f: Fight = {
    w,
    h,
    tiles: new Array(w * h).fill(Tile.Floor),
    food: [],
    husks: [],
    webs: [],
    enemies: [],
    snake: { body: [], segs: [], dir: 0 },
    turn: 0,
    hunger: 0,
    cleared: false,
    status: 'play',
    tuckUsed: false,
    buffs: { bite: 0, absorb: 0 },
    nextId: 1,
    rng: makeRng(spec.seed),
    spawns: [],
    events: [],
    opts: { ...DEFAULT_OPTS, ...spec.opts },
  };
  let start: Pos | null = null;
  const enemies: [string, Pos][] = [];
  spec.rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const c = row[x] ?? '#';
      const p = { x, y };
      const i = y * w + x;
      if (c === '#') f.tiles[i] = Tile.Wall;
      else if (c === 'E') f.tiles[i] = Tile.Exit;
      else if (c === 'S') {
        f.tiles[i] = Tile.Burrow;
        start = p;
      } else if (c === 'f') f.food.push(p);
      else if (c === 'w') f.webs.push(p);
      else if (c === 'x') {
        f.spawns.push(p);
        f.tiles[i] = Tile.Burrow;
      }
      else if (byChar.has(c)) enemies.push([byChar.get(c)!, p]);
      else if (c !== '.') throw new Error(`unknown room char '${c}'`);
    }
  });

  const items = [...spec.genome];
  if (spec.shuffleGenome !== false) shuffle(f.rng, items);
  const segItems: (ItemId | null)[] = spec.snake?.items ?? [...items, ...new Array(spec.flesh).fill(null)];
  f.snake.segs = segItems.map((it) => ({ uid: f.nextId++, item: it }));
  if (spec.snake) {
    f.snake.body = spec.snake.body.map((p) => ({ ...p }));
    f.snake.dir = spec.snake.dir ?? 0;
    ops.trimBody(f);
  } else {
    if (!start) throw new Error('room without start');
    const s: Pos = start;
    f.entry = { ...s };
    f.snake.body = [{ ...s }];
    // Face away from walls: pick the direction with the longest free run.
    let best: Dir = 0, bestRun = -1;
    for (const d of DIRS) {
      let run = 0;
      let p = stepPos(s, d);
      while (!ops.isSolid(f, p) && run < 20) { run++; p = stepPos(p, d); }
      if (run > bestRun) { bestRun = run; best = d; }
    }
    f.snake.dir = best;
  }
  for (const [kind, p] of enemies) ops.spawnEnemy(f, kind, p);
  for (const kind of spec.place ?? []) {
    const s0 = f.snake.body[0];
    let placed = false;
    for (let tries = 0; tries < 400 && !placed; tries++) {
      const p = randomEmpty(f.rng, f);
      if (!p) break;
      const far = manhattan(p, s0) >= Math.max(5, 8 - tries / 50);
      const spaced = f.enemies.every((e) => manhattan(e.pos, p) >= 2);
      if (far && spaced && !f.spawns.some((q) => eq(q, p))) {
        ops.spawnEnemy(f, kind, p);
        placed = true;
      }
    }
    if (!placed) {
      // Fallback: the free tile farthest from the start.
      let best: Pos | null = null;
      for (let y = 0; y < f.h; y++)
        for (let x = 0; x < f.w; x++) {
          const p = { x, y };
          if (ops.isEmpty(f, p) && (!best || manhattan(p, s0) > manhattan(best, s0))) best = p;
        }
      if (best) ops.spawnEnemy(f, kind, best);
    }
  }
  f.charms = [...(spec.charms ?? [])];
  f.opts.hungerEvery += charmSum(f.charms, 'hungerBonus');
  for (const c of f.charms) CHARMS.get(c)?.fightStart?.(f);
  for (const e of f.enemies) e.intent = think(f, e);
  ensureFood(f);
  return f;
}

// ---------------------------------------------------------------- moves

export type MoveOutcome =
  | { k: 'illegal' }
  | { k: 'step' }
  | { k: 'food' }
  | { k: 'husk' }
  | { k: 'web' }
  | { k: 'exit' }
  | { k: 'bite'; enemy: number }
  | { k: 'body'; bi: number }
  | { k: 'neck' };

export function moveOutcome(f: Fight, dir: Dir): MoveOutcome {
  const s = f.snake;
  const t = stepPos(s.body[0], dir);
  if (!ops.inBounds(f, t)) return { k: 'illegal' };
  if (s.body.length > 1 && eq(t, s.body[1])) return { k: 'neck' };
  if (ops.tileAt(f, t) === Tile.Exit) return f.cleared ? { k: 'exit' } : { k: 'illegal' };
  if (ops.isSolid(f, t)) return { k: 'illegal' };
  const e = ops.enemyAt(f, t);
  if (e) return { k: 'bite', enemy: e.id };
  // Burrows (the entrance and spawn holes) are dead ends: the head can't go back in.
  if (ops.tileAt(f, t) === Tile.Burrow && ops.bodyIndexAt(f, t) < 0) return { k: 'illegal' };
  const bi = ops.bodyIndexAt(f, t);
  if (bi > 0) {
    // The tail tip moves away — unless we grow this move (a husk or food under it).
    const grows = ops.huskAt(f, t) >= 0 || ops.foodAt(f, t) >= 0;
    const tailTip = bi === s.body.length - 1 && ops.pending(f) === 0 && !grows;
    if (!tailTip) return { k: 'body', bi };
  }
  if (ops.huskAt(f, t) >= 0) return { k: 'husk' };
  if (ops.webAt(f, t) >= 0) return { k: 'web' };
  if (ops.foodAt(f, t) >= 0) return { k: 'food' };
  return { k: 'step' };
}

/** Legal move directions. When trapped, biting your own body becomes legal. */
export function legalMoves(f: Fight): Dir[] {
  const outs = DIRS.map((d) => [d, moveOutcome(f, d)] as const);
  const normal = outs.filter(([, o]) => o.k !== 'illegal' && o.k !== 'body' && o.k !== 'neck').map(([d]) => d);
  if (normal.length > 0) return normal;
  const self = outs.filter(([, o]) => o.k === 'body').map(([d]) => d);
  if (self.length > 0) return self;
  // Truly stuck in a dead end: bite your own neck as a last resort.
  return outs.filter(([, o]) => o.k === 'neck').map(([d]) => d);
}

export const isTrapped = (f: Fight) => {
  const l = legalMoves(f);
  return l.length > 0 && l.every((d) => ['body', 'neck'].includes(moveOutcome(f, d).k));
};

/**
 * Execute one step of movement in `dir`. Returns true if the head advanced.
 * Used by the basic move and by movement items (Lunge).
 */
export function doMove(f: Fight, dir: Dir, extraBite = 0): boolean {
  const o = moveOutcome(f, dir);
  const t = stepPos(f.snake.body[0], dir);
  switch (o.k) {
    case 'illegal':
      return false;
    case 'neck':
      ops.sever(f, 0);
      return doMove(f, dir, extraBite);
    case 'step':
      ops.moveHeadTo(f, t, dir);
      return true;
    case 'food': {
      f.food.splice(ops.foodAt(f, t), 1);
      ops.addSeg(f, null, 'tail');
      ops.moveHeadTo(f, t, dir);
      f.hunger = 0;
      ops.emit(f, { t: 'eat', at: t, what: 'food' });
      return true;
    }
    case 'husk': {
      const [hk] = f.husks.splice(ops.huskAt(f, t), 1);
      ops.addSeg(f, hk.item, hk.item ? 'neck' : 'tail');
      ops.moveHeadTo(f, t, dir);
      f.hunger = 0;
      for (const c of f.charms ?? []) CHARMS.get(c)?.onEatHusk?.(f);
      ops.emit(f, { t: 'eat', at: t, what: 'husk' });
      return true;
    }
    case 'web':
      f.webs.splice(ops.webAt(f, t), 1);
      f.snake.dir = dir;
      ops.emit(f, { t: 'webbed', at: t });
      return false;
    case 'exit':
      ops.moveHeadTo(f, t, dir);
      f.status = 'won';
      ops.emit(f, { t: 'exit' });
      return true;
    case 'body': {
      // Ouroboros: bite yourself; everything from here back becomes husk, then eat it.
      ops.sever(f, o.bi - 1);
      return doMove(f, dir, extraBite);
    }
    case 'bite':
      return bite(f, f.enemies.find((e) => e.id === o.enemy)!, dir, extraBite);
  }
}

function bite(f: Fight, e: Enemy, dir: Dir, extraBite: number): boolean {
  const d = enemyDef(e.kind);
  const target = stepPos(f.snake.body[0], dir);
  const k = e.body ? e.body.findIndex((b) => eq(b, target)) : -1;
  if (k >= 0) {
    // Biting an enemy snake's body severs it there.
    f.buffs.bite = 0;
    const killed = ops.cutEnemy(f, e, k, 'bite');
    ops.emit(f, { t: 'bite', enemy: e.id, at: target, dmg: 0, killed });
    f.snake.dir = dir;
    ops.removeDead(f);
    return false;
  }
  let dmg = Math.max(1, 1 + f.buffs.bite + ops.bodyBonus(f, 'biteBonus') + extraBite + (e.hp >= 3 ? charmSum(f.charms, 'toughBite') : 0));
  f.buffs.bite = 0;
  if (d.onBitten?.(f, e)) dmg = 0;
  if (d.biteCap !== undefined) dmg = Math.min(dmg, d.biteCap);
  const at = { ...e.pos };
  const killed = dmg > 0 && ops.damageEnemy(f, e, dmg, 'bite');
  if (!killed && dmg > 0) e.poison += charmSum(f.charms, 'bitePoison');
  ops.emit(f, { t: 'bite', enemy: e.id, at, dmg, killed });
  f.snake.dir = dir;
  if (d.spiky) {
    const s = f.snake;
    ops.hitSnake(f, s.segs.length > 0 ? 1 : 0, 1, e);
    if (f.status === 'dead') return false;
  }
  if (killed) {
    ops.removeDead(f);
    if (d.signature) ops.addSeg(f, d.signature, 'neck', true);
    else ops.addSeg(f, null, 'tail');
    const fi = ops.foodAt(f, at);
    if (fi >= 0) {
      f.food.splice(fi, 1);
      ops.addSeg(f, null, 'tail');
    }
    const wi = ops.webAt(f, at);
    if (wi >= 0) f.webs.splice(wi, 1);
    ops.moveHeadTo(f, at, dir);
    f.hunger = 0;
    ops.emit(f, { t: 'eat', at, what: 'enemy' });
    return true;
  }
  // Survived: knocked back one tile, which interrupts it. Pinned enemies (nowhere
  // to be knocked to), snakes and bosses keep their intent.
  const back = stepPos(e.pos, dir);
  const noInterrupt = (f.charms ?? []).some((c) => CHARMS.get(c)?.noInterrupt);
  if (!e.body && !d.boss && !noInterrupt && ops.freeForEnemy(f, back, d.flies)) {
    ops.emit(f, { t: 'knockback', enemy: e.id, from: { ...e.pos }, to: back });
    e.pos = back;
    e.intent = { t: 'wait' };
    e.mem.interrupted = 1;
  } else {
    ops.emit(f, { t: 'msg', text: d.boss ? 'unstoppable' : noInterrupt ? 'not interrupted' : 'pinned — not interrupted' });
  }
  d.afterBitten?.(f, e);
  return false;
}

// ---------------------------------------------------------------- actions

export function canPlay(f: Fight, slot: number, dir?: Dir): boolean {
  const k = ops.hand(f)[slot];
  if (k === undefined || f.status !== 'play') return false;
  const d = item(f.snake.segs[k].item!);
  if (!d.active) return false;
  if (d.active.target === 'dir' && dir === undefined) return false;
  const cost = d.active.extraCost ?? 0;
  if (f.snake.segs.length - 1 < cost) return false;
  return d.active.canPlay?.(f, { dir, seg: k }) ?? true;
}

/** Apply an action to a clone of `f` and return the clone. */
export function step(prev: Fight, a: Action): Fight {
  const f: Fight = structuredClone(prev);
  f.events = [];
  if (f.status !== 'play') return f;
  switch (a.t) {
    case 'move': {
      if (!legalMoves(f).includes(a.dir)) return f;
      doMove(f, a.dir);
      endTurn(f);
      break;
    }
    case 'play': {
      if (!canPlay(f, a.slot, a.dir)) return f;
      const k = ops.hand(f)[a.slot];
      const id = f.snake.segs[k].item!;
      const d = item(id);
      f.snake.segs.splice(k, 1);
      ops.trimBody(f);
      for (let i = 0; i < (d.active!.extraCost ?? 0); i++) ops.removeTail(f, 'cost');
      ops.emit(f, { t: 'play', item: id });
      d.active!.play(f, { dir: a.dir, seg: k });
      ops.removeDead(f);
      checkCleared(f);
      if (d.active!.move && f.status === 'play') endTurn(f);
      break;
    }
    case 'tuck': {
      const k = ops.hand(f)[0];
      if (f.tuckUsed || k === undefined) return f;
      const [seg] = f.snake.segs.splice(k, 1);
      f.snake.segs.push(seg);
      f.tucks = (f.tucks ?? 0) + 1;
      f.tuckUsed = f.tucks >= 1 + charmSum(f.charms, 'tuckBonus');
      break;
    }
  }
  ops.removeDead(f);
  return f;
}

// ---------------------------------------------------------------- turn phases

export function endTurn(f: Fight) {
  if (f.status !== 'play') return;
  bodyPhase(f);
  if (f.status !== 'play') return;
  constrictPhase(f);
  checkCleared(f);
  enemyPhase(f);
  if (f.status !== 'play') return;
  upkeep(f);
}

function bodyPhase(f: Fight) {
  for (const { id, seg } of ops.itemsOnBody(f)) item(id).bodyPhase?.(f, seg);
  for (const e of f.enemies) {
    if (e.poison > 0 && e.hp > 0) {
      ops.damageEnemy(f, e, 1, 'poison');
      e.poison--;
    }
  }
  ops.removeDead(f);
}

function constrictPhase(f: Fight) {
  const coils = computeCoils(f);
  const bonus = ops.bodyBonus(f, 'crushBonus') + (f.buffs.crush ?? 0);
  const where = new Map<number, (typeof coils)[number]>();
  for (const c of coils) for (const t of c.tiles) where.set(key(t), c);
  for (const e of f.enemies) {
    if (e.under) continue;
    let c = where.get(key(e.pos));
    const maxArea = enemyDef(e.kind).heldMaxArea;
    if (c && maxArea !== undefined && c.area > maxArea) c = undefined;
    e.held = !!c;
    if (c) {
      if (e.intent.t === 'move') e.intent = { t: 'wait' };
      const dmg = c.crush > 0 ? c.crush + bonus : 0;
      if (dmg > 0) ops.damageEnemy(f, e, dmg, 'crush');
    }
  }
  // Wrap: an enemy touching 4+ of your tiles (diagonals count) is squeezed even without a closed coil.
  for (const e of f.enemies) {
    if (e.held || e.under || e.hp <= 0 || e.body) continue;
    const touching = f.snake.body.filter((b) => chebyshev(b, e.pos) === 1).length;
    if (touching >= wrapMin(f)) ops.damageEnemy(f, e, 1 + bonus, 'crush');
  }
  const active = coils.filter((c) => c.tiles.some((t) => f.enemies.some((e) => eq(e.pos, t))));
  for (const c of active) ops.emit(f, { t: 'coil', tiles: c.tiles });
  ops.removeDead(f);
}

export function checkCleared(f: Fight) {
  if (!f.cleared && f.enemies.every((e) => e.minion)) {
    f.cleared = true;
    ops.emit(f, { t: 'cleared' });
  }
}

function enemyPhase(f: Fight) {
  const order = [...f.enemies].sort((a, b) => a.id - b.id);
  const keep = new Set<number>();
  for (const e of order) {
    if (e.hp <= 0) continue;
    if (resolveIntent(f, e)) keep.add(e.id);
    if (f.status !== 'play') return;
  }
  ops.removeDead(f);
  checkCleared(f);
  // Enemy snakes can coil you too: each turn inside their circle costs your tail.
  if (enemyCoilsHead(f)) {
    ops.emit(f, { t: 'msg', text: 'Constricted!' });
    ops.emit(f, { t: 'coil', tiles: [{ ...f.snake.body[0] }] });
    if (!ops.removeTail(f, 'constricted')) ops.kill(f, 'constriction');
    if (f.status !== 'play') return;
  }
  for (const e of f.enemies) {
    if (keep.has(e.id)) continue;
    e.intent = think(f, e);
    delete e.mem.interrupted;
    if (e.mem.escaped) ops.emit(f, { t: 'msg', text: `${enemyDef(e.kind).name} escaped!` });
  }
  ops.removeDead(f);
  checkCleared(f);
}

export function think(f: Fight, e: Enemy): Intent {
  const it = enemyDef(e.kind).think(f, e);
  if (e.held && it.t === 'move') return { t: 'wait' };
  if ((it.t === 'lock' || it.t === 'steal') && protectedSeg(f, it.seg)) return { t: 'wait' };
  return it;
}

/** While the snake is still emerging, segments at the burrow mouth can't be targeted. */
export function protectedSeg(f: Fight, uid: number): boolean {
  if (!f.entry || ops.pending(f) === 0 || uid === 0) return false;
  const p = ops.segPos(f, uid);
  return !!p && chebyshev(p, f.entry) <= 1;
}

/** Resolve an intent. Returns true if the intent should be kept (windup). */
function resolveIntent(f: Fight, e: Enemy): boolean {
  const d = enemyDef(e.kind);
  const it = e.intent;
  switch (it.t) {
    case 'wait':
      return false;
    case 'move': {
      if (e.held) return false;
      const trail: Pos[] = [];
      for (let i = 0; i < it.steps; i++) {
        let dir: Dir | null = it.dir;
        if (i > 0 && it.chase) dir = ops.pathStep(f, e.pos, f.snake.body, d.flies);
        if (dir === null) break;
        const to = stepPos(e.pos, dir);
        if (!ops.freeForEnemy(f, to, d.flies)) break;
        trail.push({ ...e.pos });
        ops.moveEnemy(f, e, to);
      }
      // Flyers pass over the body but never land on it.
      while (d.flies && ops.bodyIndexAt(f, e.pos) >= 0 && trail.length) e.pos = trail.pop()!;
      return false;
    }
    case 'strike': {
      ops.emit(f, { t: 'strike', enemy: e.id, tiles: it.tiles });
      const uids: number[] = [];
      for (const t of it.tiles) {
        const bi = ops.bodyIndexAt(f, t);
        if (bi === 0) uids.push(0);
        else if (bi > 0) uids.push(f.snake.segs[bi - 1].uid);
        const other = ops.enemyAt(f, t);
        if (other && other !== e) ops.damageEnemy(f, other, it.dmg, d.name);
      }
      for (const uid of uids) {
        const bi = uid === 0 ? 0 : f.snake.segs.findIndex((s) => s.uid === uid) + 1;
        if (bi < 0 || (uid !== 0 && bi === 0)) continue;
        if (bi > 0 && bi >= f.snake.body.length) continue;
        ops.hitSnake(f, bi, it.dmg, e);
        if (f.status !== 'play') break;
      }
      return false;
    }
    case 'lock': {
      if (it.windup > 1) {
        it.windup--;
        return true;
      }
      const p = ops.segPos(f, it.seg);
      if (!p || chebyshev(p, e.pos) > it.reach || protectedSeg(f, it.seg)) {
        ops.emit(f, { t: 'fizzle', enemy: e.id });
        return false;
      }
      ops.emit(f, { t: 'strike', enemy: e.id, tiles: [p] });
      const bi = it.seg === 0 ? 0 : f.snake.segs.findIndex((s) => s.uid === it.seg) + 1;
      ops.hitSnake(f, bi, it.dmg, e, { sever: it.sever });
      return false;
    }
    case 'web': {
      for (const t of it.tiles) if (ops.isEmpty(f, t)) f.webs.push({ ...t });
      return false;
    }
    case 'burrow':
      if (e.held) return false;
      e.under = true;
      ops.emit(f, { t: 'burrow', enemy: e.id, at: { ...e.pos } });
      return false;
    case 'emerge': {
      e.under = false;
      ops.emit(f, { t: 'strike', enemy: e.id, tiles: [it.at] });
      const bi = ops.bodyIndexAt(f, it.at);
      if (bi >= 0) ops.hitSnake(f, bi, it.dmg, e);
      const other = ops.enemyAt(f, it.at);
      if (other && other !== e) ops.damageEnemy(f, other, it.dmg, d.name);
      const spot = [it.at, ...neighborsRing(it.at)].find((p) => ops.freeForEnemy(f, p));
      if (spot) e.pos = { ...spot };
      else e.under = true; // nowhere to surface: stay buried and try again
      ops.emit(f, { t: 'emerge', enemy: e.id, at: { ...e.pos } });
      return false;
    }
    case 'steal': {
      const k = f.snake.segs.findIndex((s) => s.uid === it.seg);
      const p = ops.segPos(f, it.seg);
      const seg = f.snake.segs[k];
      if (!p || !seg?.item || chebyshev(p, e.pos) > it.reach) {
        ops.emit(f, { t: 'fizzle', enemy: e.id });
        return false;
      }
      e.carry = seg.item;
      ops.emit(f, { t: 'steal', enemy: e.id, at: p, item: seg.item });
      seg.item = null;
      return false;
    }
    case 'summon': {
      for (const t of it.tiles) {
        if (!ops.isEmpty(f, t)) continue;
        const n = ops.spawnEnemy(f, it.kind, t);
        n.minion = true;
        n.intent = think(f, n);
        ops.emit(f, { t: 'spawn', enemy: n.id, at: { ...t } });
      }
      return false;
    }
  }
}

function neighborsRing(p: Pos): Pos[] {
  const out: Pos[] = [];
  for (let r = 1; r <= 2; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) out.push({ x: p.x + dx, y: p.y + dy });
  return out;
}

function upkeep(f: Fight) {
  for (const hk of f.husks) hk.ttl--;
  f.husks = f.husks.filter((hk) => hk.ttl > 0);

  f.hunger++;
  if (f.hunger >= f.opts.hungerEvery) {
    f.hunger = 0;
    const s = f.snake;
    const at = s.body[s.body.length - 1];
    ops.emit(f, { t: 'hunger', at });
    if (!ops.removeTail(f, 'hunger')) ops.kill(f, 'starvation');
    if (f.status !== 'play') return;
  }

  f.turn++;
  const { escalateFrom: from, escalateEvery: every } = f.opts;
  if (!f.cleared && f.spawns.length && f.turn >= from && (f.turn - from) % every === 0) {
    const free = f.spawns.filter((p) => ops.isEmpty(f, p) || (ops.tileAt(f, p) === Tile.Burrow && !ops.enemyAt(f, p) && ops.bodyIndexAt(f, p) < 0));
    if (free.length) {
      const e = ops.spawnEnemy(f, 'beetle', pick(f.rng, free));
      e.minion = true;
      e.intent = think(f, e);
      ops.emit(f, { t: 'spawn', enemy: e.id, at: { ...e.pos } });
    }
  }
  ensureFood(f);
  f.tuckUsed = false;
  f.tucks = 0;
  f.buffs = { bite: 0, absorb: 0 };
}

export function ensureFood(f: Fight) {
  let guard = 0;
  while (f.food.length < f.opts.minFood && guard++ < 200) {
    const p = randomEmpty(f.rng, f);
    if (!p) return;
    if (manhattan(p, f.snake.body[0]) <= 1) continue;
    f.food.push(p);
  }
}

export function randomEmpty(r: Rng, f: Fight): Pos | null {
  for (let i = 0; i < 300; i++) {
    const p = { x: int(r, 0, f.w - 1), y: int(r, 0, f.h - 1) };
    if (ops.isEmpty(f, p)) return p;
  }
  return null;
}


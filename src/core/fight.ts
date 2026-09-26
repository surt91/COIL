/**
 * The fight reducer: (Fight, Action) -> Fight (+ events in fight.events).
 * Pure with respect to its input: `step` clones before mutating.
 */
import { coilDamage, coiledEnemies, computeCoils, enemyCoilsHead, isWrapped, touchCount } from './coil';
import { DIRS, Dir, Pos, chebyshev, eq, manhattan, step as stepPos } from './geom';
import * as ops from './ops';
import { CHARMS, ENEMIES, charmSum, enemyDef, item } from './registry';
import { Rng, int, makeRng, pick, shuffle } from './rng';
import type { Action, Enemy, Fight, FightOpts, Intent, ItemId } from './types';
import { Tile } from './types';

/** An enemy touching this many snake tiles (8-neighbourhood) is squeezed. */
export const WRAP_MIN = 4;
export const wrapMin = (f: Fight) => Math.max(2, WRAP_MIN - ops.bodyBonus(f, 'wrapBonus'));

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
    breath: BREATH,
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
      else if (c === 'k') f.husks.push({ pos: p, item: null, ttl: HUSK_PERMANENT });
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
    const exposedNow = bossExposed(f, e);
    const killed = ops.cutEnemy(f, e, k, 'bite');
    ops.emit(f, { t: 'bite', enemy: e.id, at: target, dmg: 0, killed });
    f.snake.dir = dir;
    ops.removeDead(f);
    // A spiky hide: cutting it costs a segment, unless you hold it (wrapped or coiled).
    if (d.spikyHide && !killed && f.snake.segs.length > 0 && !exposedNow) ops.hitSnake(f, 1, 1, e);
    return false;
  }
  let vs = 0;
  for (const { id, seg } of ops.itemsOnBody(f)) vs += item(id).biteBonusVs?.(f, seg, e) ?? 0;
  const exposed = d.boss && bossExposed(f, e);
  if (exposed) vs += 1;
  let dmg = Math.max(1, 1 + f.buffs.bite + ops.bodyBonus(f, 'biteBonus') + extraBite + vs + (e.hp >= 3 ? charmSum(f.charms, 'toughBite') : 0));
  f.buffs.bite = 0;
  const pierce = (f.buffs.pierce ?? 0) > 0;
  f.buffs.pierce = 0;
  if (!pierce && d.onBitten?.(f, e)) dmg = 0;
  if (!pierce && d.biteCap !== undefined) dmg = Math.min(dmg, d.biteCap);
  const at = { ...e.pos };
  const killed = dmg > 0 && ops.damageEnemy(f, e, dmg, 'bite');
  if (!killed && dmg > 0) e.poison += charmSum(f.charms, 'bitePoison') + (f.buffs.poison ?? 0);
  f.buffs.poison = 0;
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
    else if (!ops.isMeagre(e)) ops.addSeg(f, null, 'tail');
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
  if (!e.body && (!d.boss || exposed) && !noInterrupt && ops.freeForEnemy(f, back, d.flies)) {
    ops.emit(f, { t: 'knockback', enemy: e.id, from: { ...e.pos }, to: back });
    e.pos = back;
    e.intent = { t: 'wait' };
    e.mem.interrupted = 1;
  } else {
    ops.emit(f, { t: 'msg', text: d.boss && !exposed ? 'unstoppable' : noInterrupt ? 'not interrupted' : 'pinned — not interrupted' });
  }
  if (d.boss && !exposed && e.hp > 0) {
    // Riposte: the boss marks the tile your head bit from. Still there after your next move? It strikes.
    // (It arms at the end of this enemy phase — see riposte().)
    const h = f.snake.body[0];
    e.mem.nx = h.x;
    e.mem.ny = h.y;
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
      f.played = (f.played ?? 0) + 1;
      d.active!.play(f, { dir: a.dir, seg: k });
      ops.removeDead(f);
      checkCleared(f);
      ensureFood(f);
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
  for (const e of [...f.enemies]) {
    if (e.poison > 0 && e.hp > 0) {
      ops.damageEnemy(f, e, 1, 'poison');
      e.poison--;
    }
  }
  ops.removeDead(f);
}

function constrictPhase(f: Fight) {
  const coils = computeCoils(f);
  const held = coiledEnemies(f, coils);
  // Snapshots: enemies spawned by a death this phase (grublings) aren't squeezed on arrival.
  const present = [...f.enemies];
  for (const e of present) {
    const c = held.get(e);
    e.held = !!c;
    if (!c) continue;
    // Coiled enemies are helpless: no moving, no attacking out of the ring.
    e.intent = { t: 'wait' };
    const dmg = coilDamage(f, c);
    if (dmg > 0) ops.damageEnemy(f, e, dmg, 'crush');
  }
  // Wrap: an enemy touching enough of your tiles (diagonals count) is squeezed even without a closed coil.
  for (const e of present) {
    if (e.held || e.hp <= 0) continue;
    if (isWrapped(f, e, wrapMin(f))) ops.damageEnemy(f, e, 1, 'crush');
  }
  for (const c of new Set(held.values())) ops.emit(f, { t: 'coil', tiles: c.tiles });
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
    riposte(f, e);
    if (f.status !== 'play') return;
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
    // After a landed bite it spends a turn swallowing: no bite (a snake still has to move).
    if (e.mem.gulp) {
      delete e.mem.gulp;
      e.mem.swallowing = 1;
      if (e.intent.t === 'lock') e.intent = { t: 'wait' };
      else if (e.intent.t === 'strike' && e.intent.lunge) {
        const d = forcedStep(f, e);
        e.intent = { t: 'move', dir: d ?? 0, steps: 1 };
      }
    } else delete e.mem.swallowing;
    delete e.mem.interrupted;
    if (e.mem.escaped) ops.emit(f, { t: 'msg', text: `${enemyDef(e.kind).name} escaped!` });
  }
  ops.removeDead(f);
  checkCleared(f);
}

/**
 * Bosses are exposed while wrapped or inside any coil of yours, held or not:
 * they can be knocked back and interrupted, bites deal +1, and they can't riposte.
 */
export function bossExposed(f: Fight, e: Enemy): boolean {
  if (isWrapped(f, e, wrapMin(f))) return true;
  // A snake can't be wrapped whole, but its head can: pressed in by enough of you, it is exposed.
  if (e.body && touchCount(f, e) >= wrapMin(f)) return true;
  return computeCoils(f).some((c) => c.tiles.some((t) => eq(t, e.pos)));
}

/** The tile a boss marked after surviving a bite (if the riposte is still pending). */
export function riposteTile(e: Enemy): Pos | null {
  return e.mem.rt !== undefined && e.mem.rx !== undefined && e.mem.ry !== undefined ? { x: e.mem.rx, y: e.mem.ry } : null;
}

/** Resolve the armed riposte (from the previous turn's bite), then arm this turn's. */
function riposte(f: Fight, e: Enemy) {
  const p = riposteTile(e);
  delete e.mem.rx;
  delete e.mem.ry;
  delete e.mem.rt;
  if (e.mem.nx !== undefined && e.mem.ny !== undefined) {
    e.mem.rx = e.mem.nx;
    e.mem.ry = e.mem.ny;
    e.mem.rt = f.turn;
    delete e.mem.nx;
    delete e.mem.ny;
  }
  if (!p || e.held || bossExposed(f, e) || !eq(f.snake.body[0], p)) return;
  ops.emit(f, { t: 'strike', enemy: e.id, tiles: [p] });
  ops.emit(f, { t: 'msg', text: 'riposte!' });
  ops.hitSnake(f, 0, 1, e);
}

export function think(f: Fight, e: Enemy): Intent {
  const it = enemyDef(e.kind).think(f, e);
  if (e.held) return { t: 'wait' };
  if ((it.t === 'lock' || it.t === 'steal') && protectedSeg(f, it.seg)) return { t: 'wait' };
  return it;
}

/** While the snake is still emerging, segments at the burrow mouth can't be targeted. */
export function protectedSeg(f: Fight, uid: number): boolean {
  if (uid === 0) return false;
  if (f.entry && ops.pending(f) > 0) {
    const p = ops.segPos(f, uid);
    if (p && chebyshev(p, f.entry) <= 1) return true;
  }
  return scuteGuarded(f, uid);
}

/** A Scute on the board guards the segments right in front of and behind it. */
function scuteGuarded(f: Fight, uid: number): boolean {
  const segs = f.snake.segs;
  const k = segs.findIndex((x) => x.uid === uid);
  if (k < 0) return false;
  const onBoard = f.snake.body.length - 1;
  const guards = (i: number) => i >= 0 && i < onBoard && !!segs[i]?.item && !!item(segs[i].item!).guardsNeighbours;
  return guards(k - 1) || guards(k + 1);
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
        if (!ops.freeForEnemy(f, to, d.flies) && !gorges(f, e, to)) break;
        trail.push({ ...e.pos });
        ops.moveEnemy(f, e, to);
      }
      // Flyers pass over the body but never land on it.
      while (d.flies && ops.bodyIndexAt(f, e.pos) >= 0 && trail.length) e.pos = trail.pop()!;
      // Snakes never stand still: blocked, they turn.
      if (e.body && !trail.length) slither(f, e);
      return false;
    }
    case 'strike': {
      if (it.lunge) return lunge(f, e, it.tiles, it.dmg, !!it.sever);
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
      // A boss that bit a segment spends its next turn swallowing it: no grinding a body sliding past.
      if (d.boss && bi > 0) e.mem.gulp = 1;
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
      if (!p || !seg?.item || chebyshev(p, e.pos) > it.reach || protectedSeg(f, it.seg)) {
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
        // A long boss fight stops feeding you: late brood is too small to swallow.
        if (d.boss && f.turn > 40) n.meagre = true;
        n.intent = think(f, n);
        ops.emit(f, { t: 'spawn', enemy: n.id, at: { ...t } });
      }
      return false;
    }
  }
}

/**
 * An enemy snake's bite, symmetric to yours: whatever lies on the tile after your move is
 * bitten (the snake stays, and must pull back before biting again); an empty tile it slithers into.
 */
function lunge(f: Fight, e: Enemy, tiles: Pos[], dmg: number, sever: boolean): false {
  // Long lunges (the Ouroboros) cover a line: the first part of you on it is bitten.
  for (const at of tiles) {
    const bi = ops.bodyIndexAt(f, at);
    if (bi < 0) {
      if (ops.freeForEnemy(f, at)) continue;
      break;
    }
    ops.emit(f, { t: 'strike', enemy: e.id, tiles: [{ ...at }], lunge: true });
    ops.hitSnake(f, bi, dmg, e, { sever });
    e.mem.gulp = 1;
    return false;
  }
  if (ops.freeForEnemy(f, tiles[0]) || gorges(f, e, tiles[0])) ops.moveEnemy(f, e, tiles[0]);
  else slither(f, e);
  return false;
}

/** A husk-eater may slither onto a husk (ops.moveEnemy swallows it). */
export function gorges(f: Fight, e: Enemy, p: Pos): boolean {
  if (!enemyDef(e.kind).eatsHusks || ops.huskAt(f, p) < 0) return false;
  return !ops.enemyAt(f, p) && ops.bodyIndexAt(f, p) < 0 && !ops.isSolid(f, p) && ops.tileAt(f, p) !== Tile.Exit && !f.enemies.some((o) => o.under && eq(o.pos, p));
}

/** The free step with the most room behind it (then the one nearest your body); null when boxed in. */
export function forcedStep(f: Fight, e: Enemy): Dir | null {
  let best: Dir | null = null, bestScore = -Infinity;
  for (const d of DIRS) {
    const p = stepPos(e.pos, d);
    if (!ops.freeForEnemy(f, p) && !gorges(f, e, p)) continue;
    const near = Math.min(...f.snake.body.map((b) => manhattan(b, p)));
    // Enough room to get out again counts first; beyond that, stay on the prey.
    const score = Math.min(ops.floodFrom(f, p, 4).length, 6) * 10 - near;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/** A snake must move. Boxed in with nothing to bite, it gnaws its own tail (husks for you). */
function slither(f: Fight, e: Enemy) {
  if (e.held) return;
  const d = forcedStep(f, e);
  if (d !== null) return ops.moveEnemy(f, e, stepPos(e.pos, d));
  // A circle has no front: a boxed-in boss snake turns around, its tail becoming its head.
  if (enemyDef(e.kind).boss && e.body?.length) {
    const whole = [e.pos, ...e.body].reverse();
    e.pos = { ...whole[0] };
    e.body = whole.slice(1);
    ops.emit(f, { t: 'msg', text: `${enemyDef(e.kind).name} turns around!` });
    const d2 = forcedStep(f, e);
    if (d2 !== null) return ops.moveEnemy(f, e, stepPos(e.pos, d2));
  }
  ops.emit(f, { t: 'msg', text: `${enemyDef(e.kind).name} gnaws its own tail!` });
  if (e.body?.length) ops.cutEnemy(f, e, Math.max(0, e.body.length - 2), 'gnaw');
  else ops.damageEnemy(f, e, 1, 'gnaw');
}

function neighborsRing(p: Pos): Pos[] {
  const out: Pos[] = [];
  for (let r = 1; r <= 2; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) out.push({ x: p.x + dx, y: p.y + dy });
  return out;
}

/** Bare-head turns allowed per fight (see upkeep). */
export const BREATH = 6;

/** A husk with this ttl never decays (layout skins, e.g. the Nursery plug). A number, so saves stay JSON. */
export const HUSK_PERMANENT = 999;

/** The segment index hunger eats next: the last Fat Reserve if you carry one, else the tail (-1: nothing left). */
export function hungerTarget(f: Fight): number {
  const shield = f.snake.segs.findLastIndex((x) => x.item && item(x.item).hungerShield);
  return shield >= 0 ? shield : f.snake.segs.length - 1;
}

function upkeep(f: Fight) {
  for (const hk of f.husks) if (hk.ttl < HUSK_PERMANENT) hk.ttl--;
  f.husks = f.husks.filter((hk) => hk.ttl > 0);

  // A cleared room grows no food, so hunger stands still there: leave in peace.
  if (!f.cleared) f.hunger++;
  if (f.hunger >= f.opts.hungerEvery) {
    f.hunger = 0;
    const k = hungerTarget(f);
    // A bare head has nothing left to digest: its breath is already running out (below).
    if (k >= 0) {
      ops.emit(f, { t: 'hunger', at: f.snake.body[Math.min(k + 1, f.snake.body.length - 1)] });
      ops.removeSeg(f, k, 'hunger');
    }
  }
  // Last breaths: a bare head can dodge everything, so it may not linger. Eating ends
  // the gasp, but spent breath never comes back (at most BREATH bare turns per fight).
  if (f.snake.segs.length === 0 && !f.cleared) {
    f.breath = (f.breath ?? BREATH) - 1;
    ops.emit(f, { t: 'gasp', at: { ...f.snake.body[0] }, left: f.breath });
    if (f.breath <= 0) return ops.kill(f, 'suffocation');
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
  // Once the room is cleared nothing new grows: leave, don't farm.
  if (f.cleared) return;
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


/**
 * Run layer: map, node flow, rewards, shop, rest and events. Pure and
 * deterministic like the fight core — every function returns a new RunState.
 */
import { ENCOUNTERS, Pool } from '../content/encounters';
import { EVENTS } from '../content/events';
import { FIRST_COIL, LAYOUTS } from '../content/layouts';
import { SPECIES } from '../content/species';
import { createFight, randomEmpty, think } from './fight';
import { addSeg, spawnEnemy } from './ops';
import { manhattan } from './geom';
import { CHARMS, ITEMS, charmSum, enemyDef } from './registry';
import { Rng, chance, int, makeRng, pick, shuffle, weighted } from './rng';
import type { Fight, FightOpts, ItemId } from './types';

export type NodeKind = 'fight' | 'elite' | 'nest' | 'pool' | 'bask' | 'event' | 'boss';

export interface MapNode {
  id: number;
  row: number;
  col: number;
  kind: NodeKind;
  next: number[];
}

export interface ShopSlot { item: ItemId; price: number; sold: boolean }

export type Screen =
  | { t: 'map' }
  | { t: 'fight'; node: number; encounter: string; layout: string; fight: Fight; mods?: string[]; arcStart?: number }
  | { t: 'reward'; options: ItemId[]; skipFlesh: number; title: string; charms?: string[]; charmTaken?: boolean; itemTaken?: boolean; boss?: boolean }
  | { t: 'pool'; stock: ShopSlot[]; removePrice: number; removed: boolean; charm?: { id: string; price: number; sold: boolean }; moltPrice?: number; molted?: boolean }
  | { t: 'bask'; done: boolean }
  | { t: 'event'; id: string; result: string | null }
  | { t: 'victory' }
  | { t: 'dead'; cause: string; where: string };

export interface RunStats {
  rooms: number;
  kills: number;
  turns: number;
  eaten: number;
  coilKills: number;
  lostSegments: number;
  poisonKills?: number;
  biteKills?: number;
  absorbed?: number;
  /** Plays per item id (base id, molted counts as its base). */
  played?: Record<string, number>;
}

/** Ascension-style difficulty levels ("Depths"), cumulative. */
export const MOLTS = [
  'Base game',
  'Hungrier: you starve every 10 turns instead of 12.',
  'Tougher Garden: Act 1 enemies have +1 HP.',
  'Lean: you can carry 2 less flesh between rooms.',
  'Crowded: normal fights and elites bring an extra beetle.',
  'Thin skin: you start with 1 flesh.',
  'Apex: bosses have 30% more HP.',
];

export interface NextFight {
  extraEnemies?: string[];
  tempItems?: ItemId[];
  hungerEvery?: number;
  enemyPoison?: number;
  shield?: number;
  fleshDelta?: number;
}

export interface RunState {
  version: 1;
  seed: number;
  molt: number;
  daily?: string;
  rng: Rng;
  act: number;
  genome: ItemId[];
  flesh: number;
  map: MapNode[];
  at: number | null;
  screen: Screen;
  stats: RunStats;
  log: string[];
  /** Visited node ids this act. */
  path?: number[];
  species?: string;
  charms?: string[];
  /** Modifiers for the next fight, set by events. */
  nextFight?: NextFight;
  seenEvents?: string[];
  /** Extra HP for the next boss (events). */
  bossBonus?: number;
  /** Ledger of the last cleared room (shown on the reward screen). */
  lastRoom?: { played: number; wasted: number; regrown: number; kept: number; body: number; fleshLost?: number };
  /** A player's very first run: the first easy fight is the Nursery (it teaches the coil). */
  teach?: boolean;
  /** Profile snapshot when the run began (UI only: what did this run earn?). */
  meta?: { unlocksBefore: string[]; bestBefore?: number; moltUnlockedBefore: number };
}

export const MAP_ROWS = 10; // rows 0..8 regular, row 9 boss
export const MAP_COLS = 5;
export const STARTER: ItemId[] = ['lunge', 'fang', 'scale', 'scale', 'reverse', 'rattle'];
export const START_FLESH = 4;
/** Flesh regrown when descending to the next act. */
export const ACT_HEAL = 4;
/** Flesh beyond this is digested at room end: you can only carry so much. */
export const FLESH_CAP = [8, 10, 12];
const capFor = (act: number) => FLESH_CAP[Math.min(act, FLESH_CAP.length - 1)];
/** Room-end flesh regrowth from played items. */
export const PLAYED_REGROW_MAX = 2;
/** How many genome items grow on you per room. */
export const GENOME_DRAW = 8;
export const genomeDraw = (run: RunState) => GENOME_DRAW + charmSum(run.charms, 'drawBonus');

/**
 * Your genome is a ring: each room you emerge somewhere on it, and a
 * contiguous arc of it grows on you in order (the first three are your hand).
 */
export function drawArc(run: RunState): { items: ItemId[]; start: number } {
  const n = run.genome.length;
  if (n === 0) return { items: [], start: 0 };
  const d = Math.min(genomeDraw(run), n);
  const start = int(run.rng, 0, n - 1);
  return { items: Array.from({ length: d }, (_, i) => run.genome[(start + i) % n]), start };
}

/** Progress as one number: 10 per act plus the map row (30 = victory). */
export const progressOf = (run: RunState) =>
  run.screen.t === 'victory' ? 30 : run.act * MAP_ROWS + (run.at !== null ? run.map[run.at].row : 0);

/** Genome indices of the arc that grew on you this room (in body order). */
export const arcIndices = (run: RunState, start: number) =>
  Array.from({ length: Math.min(genomeDraw(run), run.genome.length) }, (_, i) => (start + i) % run.genome.length);

/** Reorder the genome ring (free, any time outside a fight). */
export function moveGenome(prev: RunState, from: number, to: number): RunState {
  const n = prev.genome.length;
  if (prev.screen.t === 'fight' || from === to || from < 0 || to < 0 || from >= n || to >= n) return prev;
  const run = clone(prev);
  const [it] = run.genome.splice(from, 1);
  run.genome.splice(to, 0, it);
  return run;
}
export const fleshCap = (run: RunState) => Math.max(2, capFor(run.act) - (run.molt >= 3 ? 2 : 0) + charmSum(run.charms, 'fleshCapBonus'));
export const ACT_NAMES = ['The Garden', 'The Roots', 'The Deep'];

const clone = <T>(x: T): T => structuredClone(x);

export function createRun(seed: number, molt = 0, daily?: string, speciesId = 'garden'): RunState {
  const rng = makeRng(seed);
  const sp = SPECIES.find((x) => x.id === speciesId) ?? SPECIES[0];
  const run: RunState = {
    version: 1,
    seed,
    molt,
    daily,
    rng,
    act: 0,
    genome: [...sp.genome],
    flesh: molt >= 5 ? 1 : sp.flesh,
    species: sp.id,
    charms: [sp.charm],
    map: [],
    at: null,
    screen: { t: 'map' },
    stats: { rooms: 0, kills: 0, turns: 0, eaten: 0, coilKills: 0, lostSegments: 0 },
    log: [],
  };
  run.map = generateMap(run.rng);
  return run;
}

// ---------------------------------------------------------------- map

export function generateMap(r: Rng): MapNode[] {
  const nodes = new Map<string, MapNode>();
  let nextId = 0;
  const get = (row: number, col: number) => {
    const k = `${row},${col}`;
    let n = nodes.get(k);
    if (!n) {
      n = { id: nextId++, row, col, kind: 'fight', next: [] };
      nodes.set(k, n);
    }
    return n;
  };
  const at = (row: number, col: number) => nodes.get(`${row},${col}`);
  // Six wandering paths (the first two start apart), never crossing an existing edge.
  const starts = [...shuffle(r, [0, 1, 2, 3, 4]).slice(0, 2)];
  while (starts.length < 6) starts.push(int(r, 0, MAP_COLS - 1));
  for (const s of starts) {
    let col = s;
    let prev = get(0, col);
    for (let row = 1; row < MAP_ROWS - 1; row++) {
      let d = int(r, -1, 1);
      if (col + d < 0 || col + d >= MAP_COLS) d = 0;
      // Moving diagonally across an existing opposite diagonal would draw an X: go straight instead.
      const other = d !== 0 ? at(row - 1, col + d) : undefined;
      if (other && other.next.includes(at(row, col)?.id ?? -1)) d = 0;
      col += d;
      const n = get(row, col);
      if (!prev.next.includes(n.id)) prev.next.push(n.id);
      prev = n;
    }
  }
  // Extra forks: link to a diagonal neighbour in the next row when that draws no X.
  for (const n of [...nodes.values()]) {
    if (n.row >= MAP_ROWS - 2) continue;
    for (const d of shuffle(r, [-1, 1])) {
      const t = at(n.row + 1, n.col + d);
      const side = at(n.row, n.col + d), below = at(n.row + 1, n.col);
      if (!t || n.next.includes(t.id) || (side && below && side.next.includes(below.id))) continue;
      if (chance(r, 0.7)) n.next.push(t.id);
    }
  }
  const boss = get(MAP_ROWS - 1, 2);
  boss.kind = 'boss';
  const all = [...nodes.values()];
  for (const n of all) if (n.row === MAP_ROWS - 2) n.next = [boss.id];
  const parents = new Map<number, MapNode[]>();
  for (const n of all) for (const c of n.next) parents.set(c, [...(parents.get(c) ?? []), n]);
  // Kinds, row by row: no special node right after the same special, and siblings differ.
  const SPECIAL: NodeKind[] = ['elite', 'pool', 'bask', 'event', 'nest'];
  for (const n of [...all].sort((x, y) => x.row - y.row || x.col - y.col)) {
    if (n.kind === 'boss') continue;
    if (n.row === 0) { n.kind = 'fight'; continue; }
    if (n.row === MAP_ROWS - 2) { n.kind = 'bask'; continue; }
    const ps = parents.get(n.id) ?? [];
    const banned = new Set<NodeKind>();
    for (const p of ps) {
      if (SPECIAL.includes(p.kind)) banned.add(p.kind);
      for (const sib of p.next) if (sib !== n.id && SPECIAL.includes(nodeById(all, sib).kind)) banned.add(nodeById(all, sib).kind);
    }
    if (n.row === MAP_ROWS - 3) banned.add('bask'); // the row before the boss is always a bask
    let opts: [NodeKind, number][] = [['fight', 45], ['event', 16], ['pool', 10], ['nest', 7]];
    if (n.row >= 2) opts.push(['elite', 13]);
    if (n.row >= 3) opts.push(['bask', 8]);
    if (n.row === 4) opts.push(['nest', 12]);
    opts = opts.filter(([k]) => !banned.has(k));
    n.kind = weighted(r, opts);
  }
  // Every act gets at least one Molting Pool.
  if (!all.some((n) => n.kind === 'pool')) {
    const mid = all.filter((n) => n.row >= 3 && n.row <= MAP_ROWS - 4 && n.kind === 'fight');
    if (mid.length) pick(r, mid).kind = 'pool';
  }
  return all.sort((a, b) => a.id - b.id);
}

const nodeById = (all: MapNode[], id: number) => all.find((n) => n.id === id)!;

export function reachable(run: RunState): number[] {
  if (run.at === null) return run.map.filter((n) => n.row === 0).map((n) => n.id);
  return run.map[run.at].next;
}

// ---------------------------------------------------------------- nodes

function fightOpts(pool: Pool, row: number, molt: number): Partial<FightOpts> {
  const hunger = molt >= 1 ? { hungerEvery: 10 } : {};
  if (pool === 'boss') return { escalateFrom: 20, escalateEvery: 8, ...hunger };
  if (pool === 'elite') return { escalateFrom: 30, escalateEvery: 6, ...hunger };
  return { escalateFrom: 30 - row, escalateEvery: 6, ...hunger };
}

export function startFight(run: RunState, nodeId: number, pool: Pool): RunState {
  const encs = ENCOUNTERS.filter((e) => e.act === run.act && e.pool === pool);
  let enc = pick(run.rng, encs);
  const layouts = LAYOUTS.filter((l) => (enc.layouts ? enc.layouts.includes(l.id) : !l.boss && (!l.acts || l.acts.includes(run.act))));
  let layout = pick(run.rng, layouts);
  // After the normal picks, so the rest of the run's random stream stays the same.
  if (run.teach && pool === 'easy') {
    run.teach = false;
    layout = FIRST_COIL;
    enc = { id: 'first-coil', act: 0, pool: 'easy', enemies: [] }; // both beetles are in the layout
  }
  const node = run.map[nodeId];
  const arc = drawArc(run);
  const fight = createFight({
    rows: layout.rows,
    genome: arc.items,
    shuffleGenome: false,
    flesh: run.flesh,
    seed: int(run.rng, 0, 2 ** 31),
    charms: run.charms,
    place: run.molt >= 4 && (pool === 'normal' || pool === 'elite') ? [...enc.enemies, 'beetle'] : enc.enemies,
    opts: { ...fightOpts(pool, node.row, run.molt), minFood: run.act >= 1 || pool === 'boss' ? 2 : 1 },
  });
  // Event modifiers for this fight.
  const nf = run.nextFight;
  run.nextFight = undefined;
  if (nf) {
    for (const it of nf.tempItems ?? []) addSeg(fight, it, 'neck', true);
    if (nf.hungerEvery) fight.opts.hungerEvery = nf.hungerEvery;
    if (nf.shield) fight.shield = (fight.shield ?? 0) + nf.shield;
    for (let i = 0; i < -(nf.fleshDelta ?? 0); i++) {
      const k = fight.snake.segs.map((x) => !x.item).lastIndexOf(true);
      if (k >= 0) fight.snake.segs.splice(k, 1);
    }
    for (const kind of nf.extraEnemies ?? []) {
      const p = randomEmpty(fight.rng, fight);
      if (p && manhattan(p, fight.snake.body[0]) >= 5) {
        const e = spawnEnemy(fight, kind, p);
        e.intent = think(fight, e);
      }
    }
    for (const e of fight.enemies) e.poison += nf.enemyPoison ?? 0;
  }
  // Later acts: tougher versions of the regulars.
  for (const e of fight.enemies) {
    const boss = enemyDef(e.kind).boss;
    const actBonus = [0, 1, 3][Math.min(run.act, 2)];
    const bonus = boss ? (run.molt >= 6 ? Math.round(e.hp * 0.3) : 0) + (run.bossBonus ?? 0) : e.hp >= 2 ? actBonus + (run.molt >= 2 && run.act === 0 ? 1 : 0) : 0;
    e.hp += bonus;
    e.maxHp += bonus;
  }
  run.screen = { t: 'fight', node: nodeId, encounter: enc.id, layout: layout.id, fight, mods: nf ? describeNextFight(nf) : undefined, arcStart: arc.start };
  return run;
}

/** Human-readable list of pending next-fight modifiers. */
export function describeNextFight(nf: NextFight): string[] {
  const out: string[] = [];
  const count = new Map<string, number>();
  for (const k of nf.extraEnemies ?? []) count.set(k, (count.get(k) ?? 0) + 1);
  for (const [k, n] of count) out.push(`+${n} ${enemyDef(k).name}${n > 1 ? 's' : ''}`);
  if (nf.tempItems?.length) out.push(`start with ${nf.tempItems.map((i) => ITEMS.get(i)?.name ?? i).join(', ')}`);
  if (nf.hungerEvery) out.push(`hunger every ${nf.hungerEvery} turns`);
  if (nf.enemyPoison) out.push(`enemies start with ${nf.enemyPoison} poison`);
  if (nf.shield) out.push(`${nf.shield} shield`);
  if (nf.fleshDelta) out.push(`${nf.fleshDelta} flesh`);
  return out;
}

export function enterNode(prev: RunState, nodeId: number): RunState {
  if (!reachable(prev).includes(nodeId)) return prev;
  const run = clone(prev);
  run.at = nodeId;
  run.path = [...(run.path ?? []), nodeId];
  run.lastRoom = undefined;
  const n = run.map[nodeId];
  switch (n.kind) {
    case 'fight':
      return startFight(run, nodeId, n.row <= 1 ? 'easy' : 'normal');
    case 'elite':
      return startFight(run, nodeId, 'elite');
    case 'boss':
      return startFight(run, nodeId, 'boss');
    case 'nest':
      run.screen = { t: 'reward', options: rollItems(run.rng, 3, 'nest'), skipFlesh: 3, title: 'A nest of strange eggs' };
      return run;
    case 'pool':
      run.screen = { t: 'pool', stock: rollShop(run.rng), removePrice: 3, removed: false, moltPrice: MOLT_PRICE, molted: false };
      {
        const c = rollCharms(run, 'common', 1)[0];
        if (c) run.screen.charm = { id: c, price: 6, sold: false };
      }
      return run;
    case 'bask':
      run.screen = { t: 'bask', done: false };
      return run;
    case 'event':
      {
        const fits = EVENTS.filter((e) => !e.acts || e.acts.includes(run.act));
        const fresh = fits.filter((e) => !(run.seenEvents ?? []).includes(e.id));
        const ev = pick(run.rng, fresh.length ? fresh : fits);
        run.seenEvents = [...(run.seenEvents ?? []), ev.id];
        run.screen = { t: 'event', id: ev.id, result: null };
      }
      return run;
  }
}

/** Save progress inside a fight (for continue). */
export function updateFight(prev: RunState, fight: Fight): RunState {
  if (prev.screen.t !== 'fight') return prev;
  return { ...prev, screen: { ...prev.screen, fight } };
}

export function finishFight(prev: RunState, fight: Fight): RunState {
  const run = clone(prev);
  if (run.screen.t !== 'fight') return run;
  const node = run.map[run.screen.node];
  run.stats.turns += fight.turn;
  if (fight.status === 'dead') {
    const d = fight.events.find((e) => e.t === 'death');
    const layout = LAYOUTS.find((l) => l.id === (run.screen as { layout: string }).layout);
    run.flesh = 0;
    run.screen = { t: 'dead', cause: d && d.t === 'death' ? d.cause : 'unknown', where: layout?.name ?? '' };
    return run;
  }
  run.stats.rooms++;
  // Spent items nourish you: +1 flesh per 2 items played (max 2), within the cap.
  const regrown = Math.min(PLAYED_REGROW_MAX, Math.floor((fight.played ?? 0) / 2));
  const body = fight.snake.segs.filter((s) => !s.item || s.temp).length;
  run.flesh = Math.min(fleshCap(run), body + regrown);
  run.lastRoom = { played: fight.played ?? 0, wasted: fight.wasted ?? 0, regrown, kept: run.flesh, body, fleshLost: fight.fleshLost ?? 0 };
  if (node.kind === 'boss') {
    if (run.act >= ACT_NAMES.length - 1) {
      run.screen = { t: 'victory' };
      return run;
    }
    run.screen = {
      t: 'reward',
      options: rollItems(run.rng, 3, 'boss'),
      skipFlesh: 6,
      title: `${ACT_NAMES[run.act]} conquered — descend`,
      boss: true,
      charms: rollCharms(run, 'boss', 2),
    };
    run.act++;
    run.map = generateMap(run.rng);
    run.at = null;
    run.path = [];
    run.flesh = Math.min(fleshCap(run), run.flesh + ACT_HEAL);
    return run;
  }
  const elite = node.kind === 'elite';
  run.screen = {
    t: 'reward',
    options: rollItems(run.rng, 3, elite ? 'elite' : 'fight'),
    skipFlesh: elite ? 4 : 2,
    title: elite ? 'Elite defeated' : 'Room cleared',
    charms: elite ? rollCharms(run, 'common', 2) : undefined,
  };
  return run;
}

/** Track stats from the fight's event stream (the UI feeds every step's events). */
export function recordEvents(prev: RunState, events: Fight['events']): RunState {
  let changed = false;
  const stats = { ...prev.stats };
  let lastCause = '';
  for (const e of events) {
    if (e.t === 'enemyHurt') lastCause = e.cause;
    if (e.t === 'enemyDie') {
      stats.kills++;
      if (lastCause === 'crush') stats.coilKills++;
      if (lastCause === 'poison') stats.poisonKills = (stats.poisonKills ?? 0) + 1;
      if (lastCause === 'bite') stats.biteKills = (stats.biteKills ?? 0) + 1;
      changed = true;
    }
    if (e.t === 'absorb') { stats.absorbed = (stats.absorbed ?? 0) + 1; changed = true; }
    if (e.t === 'play') {
      const id = ITEMS.get(e.item)?.base ?? e.item;
      stats.played = { ...stats.played, [id]: (stats.played?.[id] ?? 0) + 1 };
      changed = true;
    }
    if (e.t === 'eat') { stats.eaten++; changed = true; }
    if (e.t === 'segLost' && e.cause !== 'cost') { stats.lostSegments++; changed = true; }
  }
  return changed ? { ...prev, stats } : prev;
}


// ---------------------------------------------------------------- rewards

type RollKind = 'fight' | 'elite' | 'nest' | 'shop' | 'boss';

export function rollItems(r: Rng, n: number, kind: RollKind): ItemId[] {
  const weights: Record<string, number> =
    kind === 'fight' ? { starter: 3, common: 10, uncommon: 4, rare: 1 }
    : kind === 'elite' ? { common: 3, uncommon: 8, rare: 4 }
    : kind === 'nest' ? { common: 4, uncommon: 6, rare: 3 }
    : kind === 'boss' ? { uncommon: 2, rare: 8 }
    : { starter: 2, common: 8, uncommon: 5, rare: 2 };
  const pool = [...ITEMS.values()].filter((d) => d.rarity !== 'signature' && !d.base && weights[d.rarity]);
  const out: ItemId[] = [];
  for (let guard = 0; out.length < n && guard < 100; guard++) {
    const d = weighted(r, pool.map((x) => [x, weights[x.rarity]] as const));
    if (!out.includes(d.id)) out.push(d.id);
  }
  return out;
}

export const PRICE: Record<string, number> = { starter: 2, common: 3, uncommon: 5, rare: 7 };

export function rollCharms(run: RunState, pool: 'common' | 'boss', n: number): string[] {
  const have = new Set(run.charms ?? []);
  const opts = shuffle(run.rng, [...CHARMS.values()].filter((c) => c.pool === pool && !have.has(c.id)).map((c) => c.id));
  return opts.slice(0, n);
}

export function takeCharm(prev: RunState, idx: number): RunState {
  const sc = prev.screen;
  if (sc.t !== 'reward' || !sc.charms || sc.charmTaken || !sc.charms[idx]) return prev;
  const run = clone(prev);
  const s2 = run.screen as Extract<Screen, { t: 'reward' }>;
  run.charms = [...(run.charms ?? []), sc.charms[idx]];
  run.flesh = Math.min(run.flesh, fleshCap(run));
  s2.charmTaken = true;
  if (s2.itemTaken) run.screen = { t: 'map' };
  return run;
}

export function buyCharm(prev: RunState): RunState {
  const sc = prev.screen;
  if (sc.t !== 'pool' || !sc.charm || sc.charm.sold || prev.flesh < sc.charm.price) return prev;
  const run = clone(prev);
  const s2 = run.screen as Extract<Screen, { t: 'pool' }>;
  s2.charm!.sold = true;
  run.flesh -= sc.charm.price;
  run.charms = [...(run.charms ?? []), sc.charm.id];
  run.flesh = Math.min(run.flesh, fleshCap(run));
  return run;
}

function rollShop(r: Rng): ShopSlot[] {
  return rollItems(r, 4, 'shop').map((item) => ({ item, price: PRICE[ITEMS.get(item)!.rarity] ?? 5, sold: false }));
}

export function takeReward(prev: RunState, idx: number | null): RunState {
  if (prev.screen.t !== 'reward') return prev;
  const run = clone(prev);
  const sc = run.screen as Extract<Screen, { t: 'reward' }>;
  if (sc.itemTaken) return prev;
  if (idx === null) run.flesh = Math.max(run.flesh, Math.min(fleshCap(run), run.flesh + sc.skipFlesh));
  else run.genome.push(sc.options[idx]);
  sc.itemTaken = true;
  if (!sc.charms?.length || sc.charmTaken) run.screen = { t: 'map' };
  return run;
}

export function buy(prev: RunState, slot: number): RunState {
  if (prev.screen.t !== 'pool') return prev;
  const s = prev.screen.stock[slot];
  if (!s || s.sold || prev.flesh < s.price) return prev;
  const run = clone(prev);
  const sc = run.screen as Extract<Screen, { t: 'pool' }>;
  sc.stock[slot].sold = true;
  run.flesh -= s.price;
  run.genome.push(s.item);
  return run;
}

export function removeItem(prev: RunState, genomeIdx: number, free = false): RunState {
  const run = clone(prev);
  if (run.genome.length <= 1 || genomeIdx < 0 || genomeIdx >= run.genome.length) return prev;
  if (run.screen.t === 'pool') {
    if (run.screen.removed || run.flesh < run.screen.removePrice) return prev;
    run.flesh -= run.screen.removePrice;
    run.screen.removed = true;
  } else if (run.screen.t === 'bask') {
    if (run.screen.done || !free) return prev;
    run.screen.done = true;
  } else if (!free) return prev;
  run.genome.splice(genomeIdx, 1);
  return run;
}

export const BASK_FLESH = 5;
export const MOLT_PRICE = 4;

export const canUpgrade = (id: ItemId) => !!ITEMS.get(id)?.upgrade;

/** Molt an item: it grows back as its upgraded version. Bask (free) or the Pool (flesh). */
export function upgradeItem(prev: RunState, genomeIdx: number): RunState {
  const id = prev.genome[genomeIdx];
  if (!id || !canUpgrade(id)) return prev;
  const run = clone(prev);
  const sc = run.screen;
  if (sc.t === 'bask') {
    if (sc.done) return prev;
    sc.done = true;
  } else if (sc.t === 'pool') {
    const price = sc.moltPrice ?? MOLT_PRICE;
    if (sc.molted || run.flesh < price) return prev;
    run.flesh -= price;
    sc.molted = true;
  } else if (sc.t !== 'event') return prev;
  run.genome[genomeIdx] = ITEMS.get(id)!.upgrade!;
  return run;
}

export function bask(prev: RunState): RunState {
  if (prev.screen.t !== 'bask' || prev.screen.done) return prev;
  const run = clone(prev);
  run.flesh = Math.max(run.flesh, Math.min(fleshCap(run), run.flesh + BASK_FLESH));
  (run.screen as Extract<Screen, { t: 'bask' }>).done = true;
  return run;
}

export function eventChoice(prev: RunState, choice: number): RunState {
  if (prev.screen.t !== 'event' || prev.screen.result !== null) return prev;
  const ev = EVENTS.find((e) => e.id === (prev.screen as { id: string }).id);
  const c = ev?.choices[choice];
  if (!c || (c.canChoose && !c.canChoose(prev))) return prev;
  const run = clone(prev);
  const before = run.flesh;
  const result = c.apply(run, run.rng);
  let note = '';
  if (run.flesh > fleshCap(run) && run.flesh > before) {
    note = ` (You can only carry ${fleshCap(run)} flesh — the rest is wasted.)`;
    run.flesh = Math.max(before, fleshCap(run));
  }
  if (run.screen.t === 'event') run.screen.result = result + note;
  return run;
}

export function toMap(prev: RunState): RunState {
  return { ...prev, screen: { t: 'map' } };
}

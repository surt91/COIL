/**
 * Run layer: map, node flow, rewards, shop, rest and events. Pure and
 * deterministic like the fight core — every function returns a new RunState.
 */
import { ENCOUNTERS, Pool } from '../content/encounters';
import { EVENTS } from '../content/events';
import { LAYOUTS } from '../content/layouts';
import { SPECIES } from '../content/species';
import { createFight } from './fight';
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
  | { t: 'fight'; node: number; encounter: string; layout: string; fight: Fight }
  | { t: 'reward'; options: ItemId[]; skipFlesh: number; title: string; charms?: string[]; charmTaken?: boolean; itemTaken?: boolean }
  | { t: 'pool'; stock: ShopSlot[]; removePrice: number; removed: boolean; charm?: { id: string; price: number; sold: boolean } }
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
}

/** Ascension-style difficulty levels, cumulative. */
export const MOLTS = [
  'Base game',
  'Hungrier: you starve every 10 turns instead of 12.',
  'Tougher Garden: Act 1 enemies have +1 HP.',
  'Lean: you can carry 2 less flesh between rooms.',
  'Crowded: normal fights and elites bring an extra beetle.',
  'Thin skin: you start with 1 flesh.',
  'Apex: bosses have 30% more HP.',
];

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
  /** Ledger of the last cleared room (shown on the reward screen). */
  lastRoom?: { played: number; wasted: number; regrown: number; kept: number; body: number };
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
  const starts = shuffle(r, [0, 1, 2, 3, 4]).slice(0, 3);
  starts.push(pick(r, [0, 1, 2, 3, 4]));
  for (const s of starts) {
    let col = s;
    let prev = get(0, col);
    for (let row = 1; row < MAP_ROWS - 1; row++) {
      col = Math.max(0, Math.min(MAP_COLS - 1, col + int(r, -1, 1)));
      const n = get(row, col);
      if (!prev.next.includes(n.id)) prev.next.push(n.id);
      prev = n;
    }
  }
  const boss = get(MAP_ROWS - 1, 2);
  boss.kind = 'boss';
  const all = [...nodes.values()];
  for (const n of all) if (n.row === MAP_ROWS - 2) n.next = [boss.id];
  // Kinds.
  for (const n of all) {
    if (n.kind === 'boss') continue;
    if (n.row === 0) n.kind = 'fight';
    else if (n.row === MAP_ROWS - 2) n.kind = 'bask';
    else if (n.row === 4 && chance(r, 0.5)) n.kind = 'nest';
    else {
      const opts: [NodeKind, number][] = [['fight', 52], ['event', 15], ['pool', 11], ['nest', 6]];
      if (n.row >= 2) opts.push(['elite', 14]);
      if (n.row >= 3) opts.push(['bask', 8]);
      n.kind = weighted(r, opts);
    }
  }
  return all.sort((a, b) => a.id - b.id);
}

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
  const enc = pick(run.rng, encs);
  const layouts = LAYOUTS.filter((l) => (enc.layouts ? enc.layouts.includes(l.id) : !l.boss));
  const layout = pick(run.rng, layouts);
  const node = run.map[nodeId];
  // Your genome is a deck: each room only some of it grows on you.
  const drawn = shuffle(run.rng, [...run.genome]).slice(0, genomeDraw(run));
  const fight = createFight({
    rows: layout.rows,
    genome: drawn,
    flesh: run.flesh,
    seed: int(run.rng, 0, 2 ** 31),
    charms: run.charms,
    place: run.molt >= 4 && (pool === 'normal' || pool === 'elite') ? [...enc.enemies, 'beetle'] : enc.enemies,
    opts: { ...fightOpts(pool, node.row, run.molt), minFood: run.act >= 1 || pool === 'boss' ? 2 : 1 },
  });
  // Later acts: tougher versions of the regulars.
  for (const e of fight.enemies) {
    const boss = enemyDef(e.kind).boss;
    const actBonus = [0, 1, 3][Math.min(run.act, 2)];
    const bonus = boss ? (run.molt >= 6 ? Math.round(e.hp * 0.3) : 0) : e.hp >= 2 ? actBonus + (run.molt >= 2 && run.act === 0 ? 1 : 0) : 0;
    e.hp += bonus;
    e.maxHp += bonus;
  }
  run.screen = { t: 'fight', node: nodeId, encounter: enc.id, layout: layout.id, fight };
  return run;
}

export function enterNode(prev: RunState, nodeId: number): RunState {
  if (!reachable(prev).includes(nodeId)) return prev;
  const run = clone(prev);
  run.at = nodeId;
  run.path = [...(run.path ?? []), nodeId];
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
      run.screen = { t: 'pool', stock: rollShop(run.rng), removePrice: 3, removed: false };
      {
        const c = rollCharms(run, 'common', 1)[0];
        if (c) run.screen.charm = { id: c, price: 6, sold: false };
      }
      return run;
    case 'bask':
      run.screen = { t: 'bask', done: false };
      return run;
    case 'event':
      run.screen = { t: 'event', id: pick(run.rng, EVENTS).id, result: null };
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
  const kills = countKills(fight);
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
  run.lastRoom = { played: fight.played ?? 0, wasted: fight.wasted ?? 0, regrown, kept: run.flesh, body };
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
  void kills;
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
      changed = true;
    }
    if (e.t === 'eat') { stats.eaten++; changed = true; }
    if (e.t === 'segLost' && e.cause !== 'cost') { stats.lostSegments++; changed = true; }
  }
  return changed ? { ...prev, stats } : prev;
}

function countKills(f: Fight) {
  return f.events.filter((e) => e.t === 'enemyDie').length;
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
  const pool = [...ITEMS.values()].filter((d) => d.rarity !== 'signature' && weights[d.rarity]);
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

export function bask(prev: RunState): RunState {
  if (prev.screen.t !== 'bask' || prev.screen.done) return prev;
  const run = clone(prev);
  run.flesh = Math.max(run.flesh, Math.min(fleshCap(run), run.flesh + BASK_FLESH));
  (run.screen as Extract<Screen, { t: 'bask' }>).done = true;
  return run;
}

export function eventChoice(prev: RunState, choice: number): RunState {
  if (prev.screen.t !== 'event' || prev.screen.result !== null) return prev;
  const ev = EVENTS.find((e) => e.id === (prev.screen as { id: string }).id)!;
  const c = ev.choices[choice];
  if (!c || (c.canChoose && !c.canChoose(prev))) return prev;
  const run = clone(prev);
  const before = run.flesh;
  const result = c.apply(run, run.rng);
  if (run.flesh > before) run.flesh = Math.max(before, Math.min(run.flesh, fleshCap(run)));
  if (run.screen.t === 'event') run.screen.result = result;
  return run;
}

export function toMap(prev: RunState): RunState {
  return { ...prev, screen: { t: 'map' } };
}

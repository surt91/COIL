/**
 * Headless fight / run simulation with per-step invariant checks.
 * Exceptions and invariant violations are captured, not thrown (fuzzing).
 */
import '../content';
import { ROOMS, RoomDef } from '../content/rooms';
import { createFight, legalMoves, step } from '../core/fight';
import { makeRng } from '../core/rng';
import type { Action, Fight, GameEvent, ItemId } from '../core/types';
import { checkInvariants } from './invariants';
import type { Policy } from './policies';

export const STARTER: ItemId[] = ['lunge', 'fang', 'scale', 'reverse', 'venom', 'rattle'];

export type Outcome = 'won' | 'dead' | 'stalled' | 'error';

export interface Issue {
  kind: 'exception' | 'invariant' | 'noop' | 'softlock';
  room: string;
  seed: number;
  actionIndex: number;
  turn: number;
  message: string;
  action?: Action;
}

export interface FightResult {
  room: string;
  seed: number;
  outcome: Outcome;
  turns: number;
  actions: number;
  segsStart: number;
  segsEnd: number;
  /** Segments destroyed by damage (segLost excluding costs / hunger) + severed segments. */
  segsLost: number;
  hungerLost: number;
  kills: Record<string, number>;
  cards: Record<string, number>;
  deathCause?: string;
  /** Flesh carried to the next room (flesh + temp segments), like App.tsx. */
  fleshOut: number;
  issues: Issue[];
  ms: number;
}

export interface SimOpts {
  turnCap?: number;
  /** Max card plays / tucks within one turn before a move is forced. */
  maxActionsPerTurn?: number;
  checkInvariants?: boolean;
}

export function killCause(cause: string): string {
  if (cause === 'bite' || cause === 'crush' || cause === 'poison' || cause === 'spine') return cause;
  return 'other';
}

/** Tally kills by cause: each 'enemyDie' is attributed to the 'enemyHurt' for the same enemy right before it. */
function tallyEvents(evs: GameEvent[], r: FightResult) {
  const lastHurt = new Map<number, string>();
  for (const e of evs) {
    switch (e.t) {
      case 'enemyHurt':
        lastHurt.set(e.enemy, e.cause);
        break;
      case 'enemyDie': {
        const c = killCause(lastHurt.get(e.enemy) ?? 'unknown');
        r.kills[c] = (r.kills[c] ?? 0) + 1;
        break;
      }
      case 'play':
        r.cards[e.item] = (r.cards[e.item] ?? 0) + 1;
        break;
      case 'segLost':
        if (e.cause === 'hunger') r.hungerLost++;
        else if (e.cause !== 'cost') r.segsLost++;
        break;
      case 'sever':
        r.segsLost += e.n;
        break;
      case 'death':
        r.deathCause = e.cause;
        break;
    }
  }
}

export function runFight(
  room: RoomDef,
  genome: ItemId[],
  flesh: number,
  seed: number,
  policy: Policy,
  opts: SimOpts = {},
): FightResult {
  const turnCap = opts.turnCap ?? 300;
  const maxPerTurn = opts.maxActionsPerTurn ?? 8;
  const check = opts.checkInvariants ?? true;
  const t0 = performance.now();
  const r: FightResult = {
    room: room.id, seed, outcome: 'stalled', turns: 0, actions: 0, segsStart: genome.length + flesh, segsEnd: 0,
    segsLost: 0, hungerLost: 0, kills: {}, cards: {}, fleshOut: 0, issues: [], ms: 0,
  };
  const issue = (kind: Issue['kind'], f: Fight | null, message: string, action?: Action) =>
    r.issues.push({ kind, room: room.id, seed, actionIndex: r.actions, turn: f?.turn ?? 0, message, action });

  let f: Fight;
  try {
    f = createFight({ rows: room.rows, genome, flesh, seed });
  } catch (err) {
    issue('exception', null, `createFight: ${(err as Error).stack ?? err}`);
    r.outcome = 'error';
    return r;
  }
  if (check) for (const m of checkInvariants(f)) issue('invariant', f, `initial: ${m}`);
  // The bot has its own RNG stream, independent of the fight's.
  const rng = makeRng((seed ^ 0x9e3779b9) >>> 0);
  let perTurn = 0;
  const reported = new Set<string>();

  while (f.status === 'play' && f.turn < turnCap) {
    let a: Action;
    try {
      if (legalMoves(f).length === 0) {
        issue('softlock', f, 'no legal moves at all');
        break;
      }
      a = perTurn >= maxPerTurn ? { t: 'move', dir: legalMoves(f)[0] } : policy(f, rng);
    } catch (err) {
      issue('exception', f, `policy: ${(err as Error).stack ?? err}`);
      r.outcome = 'error';
      break;
    }
    let g: Fight;
    try {
      g = step(f, a);
    } catch (err) {
      issue('exception', f, `step: ${(err as Error).stack ?? err}`, a);
      r.outcome = 'error';
      break;
    }
    r.actions++;
    tallyEvents(g.events, r);
    if (g.turn === f.turn && g.events.length === 0 && g.status === f.status && a.t !== 'tuck') {
      issue('noop', f, `action had no effect: ${JSON.stringify(a)}`, a);
      perTurn = maxPerTurn; // force a move next
    } else perTurn = g.turn === f.turn ? perTurn + 1 : 0;
    if (check) {
      for (const m of checkInvariants(g)) {
        // Report each distinct violation once per fight.
        const k = m.replace(/\(.*?\)|\d+/g, '#');
        if (reported.has(k)) continue;
        reported.add(k);
        issue('invariant', g, m, a);
      }
    }
    f = g;
  }
  if (r.outcome !== 'error') r.outcome = f.status === 'won' ? 'won' : f.status === 'dead' ? 'dead' : 'stalled';
  r.turns = f.turn;
  r.segsEnd = f.snake.segs.length;
  r.fleshOut = f.snake.segs.filter((s) => !s.item || s.temp).length;
  r.ms = performance.now() - t0;
  return r;
}

export interface ChainResult {
  seed: number;
  rooms: FightResult[];
  /** Number of rooms won in a row. */
  depth: number;
}

/** Play rooms 0..n-1 in sequence carrying flesh over, like src/ui/App.tsx. */
export function runChain(n: number, genome: ItemId[], seed: number, policy: Policy, opts: SimOpts = {}, flesh0 = 4): ChainResult {
  const out: ChainResult = { seed, rooms: [], depth: 0 };
  let flesh = flesh0;
  for (let i = 0; i < n; i++) {
    const room = ROOMS[i % ROOMS.length];
    const r = runFight(room, genome, flesh, seed + i, policy, opts);
    out.rooms.push(r);
    if (r.outcome !== 'won') break;
    out.depth++;
    flesh = Math.max(0, r.fleshOut);
  }
  return out;
}

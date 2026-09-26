/**
 * Headless policies: (fight, rng) -> action. Used for fuzzing and balancing.
 */
import { DIRS, Dir } from '../core/geom';
import { canPlay, legalMoves, step } from '../core/fight';
import * as ops from '../core/ops';
import { item } from '../core/registry';
import { Rng, chance, pick } from '../core/rng';
import type { Action, Fight } from '../core/types';
import { DEFAULT_WEIGHTS, Weights, evaluate } from './evaluate';

export type Policy = (f: Fight, rng: Rng) => Action;

/** All currently playable card actions (slot × dir). */
export function playableCards(f: Fight): Action[] {
  const out: Action[] = [];
  ops.hand(f).forEach((k, slot) => {
    const d = item(f.snake.segs[k].item!);
    if (!d.active) return;
    const dirs: (Dir | undefined)[] = d.active.target === 'dir' ? [...DIRS] : [undefined];
    for (const dir of dirs) if (canPlay(f, slot, dir)) out.push(dir === undefined ? { t: 'play', slot } : { t: 'play', slot, dir });
  });
  return out;
}

const endsTurn = (f: Fight, a: Action) => {
  if (a.t === 'move') return true;
  if (a.t !== 'play') return false;
  const k = ops.hand(f)[a.slot];
  return !!item(f.snake.segs[k].item!).active?.move;
};

// ---------------------------------------------------------------- random

export const randomPolicy: Policy = (f, rng) => {
  if (chance(rng, 0.25)) {
    const cards = playableCards(f);
    if (cards.length) return pick(rng, cards);
  }
  if (!f.tuckUsed && ops.hand(f).length && chance(rng, 0.03)) return { t: 'tuck' };
  const moves = legalMoves(f);
  if (!moves.length) return { t: 'move', dir: pick(rng, DIRS) };
  return { t: 'move', dir: pick(rng, moves) };
};

// ---------------------------------------------------------------- greedy / lookahead

/** Cost of a card play relative to an equal-valued move, to avoid wasting cards on ties. */
const CARD_TIE = 0.5;

function makeSearch(depth: 1 | 2 | 3, w: Weights, beam = 4): Policy {
  /** Value of a state in which the turn has ended: its own worth, blended with the best follow-up moves. */
  const value = (s: Fight, d: number): number => {
    const v = evaluate(s, w);
    if (d <= 1 || s.status !== 'play') return v;
    const next = legalMoves(s).map((m) => step(s, { t: 'move', dir: m }));
    if (!next.length) return v;
    // Deeper than one follow-up, only the most promising moves are searched on.
    const kids = d > 2 ? next.map((n) => [evaluate(n, w), n] as const).sort((a, b) => b[0] - a[0]).slice(0, beam) : next.map((n) => [0, n] as const);
    let best = -Infinity;
    for (const [, n] of kids) best = Math.max(best, value(n, d - 1));
    return 0.4 * v + 0.6 * best;
  };
  const leaf = (s: Fight): number => value(s, depth);
  /** Best value reachable by ending the turn with a plain move. */
  const bestMove = (s: Fight): number => {
    if (s.status !== 'play') return evaluate(s, w);
    let best = -Infinity;
    for (const d of legalMoves(s)) best = Math.max(best, leaf(step(s, { t: 'move', dir: d })));
    return best === -Infinity ? evaluate(s, w) : best;
  };

  return (f) => {
    let bestA: Action | null = null;
    let bestV = -Infinity;
    for (const d of legalMoves(f)) {
      const v = leaf(step(f, { t: 'move', dir: d }));
      if (v > bestV) { bestV = v; bestA = { t: 'move', dir: d }; }
    }
    for (const a of playableCards(f)) {
      const s = step(f, a);
      const v = (endsTurn(f, a) || s.status !== 'play' ? leaf(s) : bestMove(s)) - CARD_TIE;
      if (v > bestV) { bestV = v; bestA = a; }
    }
    return bestA ?? { t: 'move', dir: f.snake.dir };
  };
}

export const greedyPolicy: Policy = makeSearch(1, DEFAULT_WEIGHTS);
export const lookahead2Policy: Policy = makeSearch(2, DEFAULT_WEIGHTS);

/** Tuning knobs for experiments (scripts only; the browser has no process). */
const env = (k: string, d: number) => Number((typeof process !== 'undefined' && process.env?.[k]) || d);

/** The experienced player: plans coils (see coilSense) and searches a beamed third move. */
export const EXPERT_WEIGHTS: Weights = {
  ...DEFAULT_WEIGHTS,
  confine: env('W_CONFINE', 12),
  wrap: env('W_WRAP', 20),
  exposed: env('W_EXPOSED', 40),
};
export const expertPolicy: Policy = makeSearch(env('EXPERT_DEPTH', 3) as 2 | 3, EXPERT_WEIGHTS, env('EXPERT_BEAM', 2));

export const POLICIES: Record<string, Policy> = {
  random: randomPolicy,
  greedy: greedyPolicy,
  lookahead2: lookahead2Policy,
  expert: expertPolicy,
};

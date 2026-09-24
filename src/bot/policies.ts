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

function makeSearch(depth: 1 | 2, w: Weights): Policy {
  /** Value of a state in which the turn has ended (or the fight is over). */
  const leaf = (s: Fight): number => {
    const v = evaluate(s, w);
    if (depth === 1 || s.status !== 'play') return v;
    let best = -Infinity;
    for (const d of legalMoves(s)) best = Math.max(best, evaluate(step(s, { t: 'move', dir: d }), w));
    return best === -Infinity ? v : 0.4 * v + 0.6 * best;
  };
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

export const POLICIES: Record<string, Policy> = {
  random: randomPolicy,
  greedy: greedyPolicy,
  lookahead2: lookahead2Policy,
};

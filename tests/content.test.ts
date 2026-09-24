import { describe, expect, test } from 'vitest';
import '../src/content';
import { ENCOUNTERS } from '../src/content/encounters';
import { EVENTS } from '../src/content/events';
import { LAYOUTS } from '../src/content/layouts';
import { createFight, legalMoves, step } from '../src/core/fight';
import { manhattan } from '../src/core/geom';
import { hand } from '../src/core/ops';
import { ENEMIES, ITEMS } from '../src/core/registry';
import { makeRng, pick } from '../src/core/rng';
import { STARTER, createRun, enterNode, eventChoice, finishFight, generateMap, reachable, takeCharm, takeReward } from '../src/core/run';
import type { Action, Fight } from '../src/core/types';

const ALL_ITEMS = [...ITEMS.keys()].filter((k) => ITEMS.get(k)!.rarity !== 'signature');

function invariants(f: Fight) {
  const b = f.snake.body;
  expect(b.length).toBeLessThanOrEqual(f.snake.segs.length + 1);
  for (let i = 1; i < b.length; i++) expect(manhattan(b[i], b[i - 1])).toBe(1);
  expect(new Set(b.map((p) => `${p.x},${p.y}`)).size).toBe(b.length);
  for (const e of f.enemies) {
    expect(e.hp).toBeGreaterThan(0);
    if (!e.under) expect(b.some((p) => p.x === e.pos.x && p.y === e.pos.y)).toBe(false);
    if (e.body) {
      for (let i = 0; i < e.body.length; i++) expect(manhattan(e.body[i], i ? e.body[i - 1] : e.pos)).toBe(1);
      expect(e.body.length).toBeLessThanOrEqual(e.hp - 1);
    }
  }
}

describe('content', () => {
  test('every layout parses and has a start', () => {
    for (const l of LAYOUTS) {
      const f = createFight({ rows: l.rows, genome: STARTER, flesh: 3, seed: 1 });
      expect(f.w).toBe(17);
      expect(f.h).toBe(13);
    }
  });

  test('every encounter survives random play without breaking invariants', () => {
    for (const enc of ENCOUNTERS) {
      for (let seed = 1; seed <= 6; seed++) {
        const layouts = LAYOUTS.filter((l) => (enc.layouts ? enc.layouts.includes(l.id) : !l.boss));
        const r = makeRng(seed * 977);
        const layout = pick(r, layouts);
        let f = createFight({ rows: layout.rows, genome: [...ALL_ITEMS], flesh: 6, seed, place: enc.enemies });
        expect(f.enemies.length).toBe(enc.enemies.length);
        for (let i = 0; i < 200 && f.status === 'play'; i++) {
          const moves = legalMoves(f);
          let a: Action;
          if (hand(f).length && r.s % 4 === 0) a = { t: 'play', slot: pick(r, [0, 1, 2]), dir: pick(r, [0, 1, 2, 3] as const) };
          else if (moves.length) a = { t: 'move', dir: pick(r, moves) };
          else break;
          try {
            f = step(f, a);
          } catch (err) {
            throw new Error(`${enc.id} seed ${seed} step ${i}: ${(err as Error).message}`);
          }
          invariants(f);
        }
      }
    }
  });

  test('all enemies used in encounters exist', () => {
    for (const enc of ENCOUNTERS) for (const k of enc.enemies) expect(ENEMIES.has(k)).toBe(true);
  });
});

describe('run', () => {
  test('map: every node reachable from row 0 and leads to the boss', () => {
    for (let s = 1; s < 30; s++) {
      const map = generateMap(makeRng(s));
      const boss = map.find((n) => n.kind === 'boss')!;
      for (const n of map) if (n.kind !== 'boss') expect(n.next.length).toBeGreaterThan(0);
      const seen = new Set<number>(map.filter((n) => n.row === 0).map((n) => n.id));
      for (const n of [...map].sort((a, b) => a.row - b.row)) if (seen.has(n.id)) n.next.forEach((m) => seen.add(m));
      expect(seen.has(boss.id)).toBe(true);
      expect(seen.size).toBe(map.length);
    }
  });

  test('clicking through a run with auto-won fights reaches victory after three acts', () => {
    let run = createRun(123);
    for (let guard = 0; guard < 200 && run.screen.t !== 'victory'; guard++) {
      const sc = run.screen;
      if (sc.t === 'map') run = enterNode(run, reachable(run)[0]);
      else if (sc.t === 'fight') {
        const f = structuredClone(sc.fight);
        f.status = 'won';
        run = finishFight(run, f);
      } else if (sc.t === 'reward') run = sc.charms?.length && !sc.charmTaken ? takeCharm(run, 0) : takeReward(run, 0);
      else if (sc.t === 'event') {
        run = eventChoice(run, EVENTS.find((e) => e.id === sc.id)!.choices.length - 1);
        run = { ...run, screen: { t: 'map' } };
      } else run = { ...run, screen: { t: 'map' } };
    }
    expect(run.screen.t).toBe('victory');
    expect(run.act).toBe(2);
  });
});

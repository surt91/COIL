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
import { coilWithin } from '../src/core/hints';
import { PLAYED_REGROW_MAX, STARTER, createRun, enterNode, eventChoice, finishFight, generateMap, reachable, regrowFromPlayed, rollItems, startFight, takeCharm, takeReward } from '../src/core/run';
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

  test('every layout is one connected room with a reachable exit, and every act has its own rooms', () => {
    for (const l of LAYOUTS) {
      const open = (x: number, y: number) => y >= 0 && y < 13 && x >= 0 && x < 17 && l.rows[y][x] !== '#';
      let start: [number, number] | null = null;
      let floor = 0;
      l.rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'S') start = [x, y]; if (c !== '#') floor++; }));
      expect(start, l.id).not.toBeNull();
      const seen = new Set<number>();
      const stack = [start!];
      let exit = false;
      while (stack.length) {
        const [x, y] = stack.pop()!;
        if (!open(x, y) || seen.has(y * 17 + x)) continue;
        seen.add(y * 17 + x);
        if (l.rows[y][x] === 'E') exit = true;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      expect(seen.size, l.id).toBe(floor);
      expect(exit || !!l.boss, l.id).toBe(true);
    }
    for (const act of [0, 1, 2]) expect(LAYOUTS.filter((l) => !l.boss && (!l.acts || l.acts.includes(act))).length).toBeGreaterThanOrEqual(5);
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

describe('events', () => {
  test('every choice of every event applies cleanly and next-fight modifiers work', () => {
    for (const ev of EVENTS) {
      ev.choices.forEach((c, i) => {
        for (let seed = 1; seed <= 4; seed++) {
          let run = createRun(seed);
          run.genome.push('venom', 'lunge+');
          run.flesh = 8;
          run = { ...run, act: ev.acts?.[0] ?? 0, screen: { t: 'event', id: ev.id, result: null } };
          if (c.canChoose && !c.canChoose(run)) continue;
          run = eventChoice(run, i);
          expect(run.screen.t === 'event' && run.screen.result).toBeTruthy();
          for (const g of run.genome) expect(ITEMS.has(g)).toBe(true);
          run = enterNode({ ...run, screen: { t: 'map' }, at: null }, reachable({ ...run, at: null })[0]);
          if (run.screen.t === 'fight') expect(run.nextFight).toBeUndefined();
        }
      });
    }
  });

  test('every item has a valid upgrade chain', () => {
    for (const d of ITEMS.values()) {
      if (d.upgrade) expect(ITEMS.get(d.upgrade)!.base).toBe(d.id);
      if (d.base) expect(ITEMS.get(d.base)!.upgrade).toBe(d.id);
    }
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

describe('card text', () => {
  // Cards have room for about three lines of active text and two of passive text
  // (checked in the browser at 1400×900); longer texts got clipped on the hand cards.
  test.each([...ITEMS.values()].map((d) => [d.id, d] as const))('%s fits on a card', (_id, d) => {
    expect(d.activeText?.length ?? 0).toBeLessThanOrEqual(72);
    expect(d.passiveText?.length ?? 0).toBeLessThanOrEqual(60);
  });
});

describe('Nursery (first fight of a first run)', () => {
  test('walking in seals the nook and crushes the beetle — the first coil needs no explanation', () => {
    for (let seed = 1; seed <= 5; seed++) {
      let run = createRun(seed);
      run.teach = true;
      run = enterNode(run, reachable(run)[0]);
      const scr = run.screen as { t: 'fight'; layout: string; fight: Fight };
      expect(scr.layout).toBe('first-coil');
      expect(run.teach).toBe(false);
      let f = scr.fight;
      const crushed: boolean[] = [];
      for (let t = 0; t < 2; t++) {
        expect(legalMoves(f)).toEqual([1]); // the corridor only goes east
        f = step(f, { t: 'move', dir: 1 });
        crushed.push(f.events.some((e) => e.t === 'enemyHurt' && e.cause === 'crush'));
      }
      expect(crushed).toEqual([false, true]);
      expect(f.enemies.length).toBe(1);
    }
  });

  test('ordinary runs never see it, and the teaching run keeps its random stream', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const a = enterNode(createRun(seed), reachable(createRun(seed))[0]);
      expect((a.screen as { layout: string }).layout).not.toBe('first-coil');
      const t = createRun(seed);
      t.teach = true;
      const b = enterNode(t, reachable(t)[0]);
      expect(b.rng.s).toBe(a.rng.s);
    }
  });
});

test('the pocket cue sees the Nursery coil two moves ahead, without touching the state', () => {
  const run = createRun(1);
  run.teach = true;
  const f = (enterNode(run, reachable(run)[0]).screen as { fight: Fight }).fight;
  const before = JSON.stringify(f);
  const p = coilWithin(f);
  expect(p).toMatchObject({ moves: 2, dmg: 2 });
  expect(p!.tiles).toContainEqual({ x: 2, y: 4 });
  expect(JSON.stringify(f)).toBe(before);
});

test('elites are always optional: every node leading to one also leads elsewhere', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const map = generateMap(makeRng(seed * 31));
    const byId = new Map(map.map((n) => [n.id, n]));
    for (const n of map) for (const m of n.next) if (byId.get(m)!.kind === 'elite') expect(n.next.length, `seed ${seed}`).toBeGreaterThan(1);
  }
});

test('the same room never comes twice in a row', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const run = createRun(seed);
    const a = startFight(structuredClone(run), reachable(run)[0], 'normal');
    const b = startFight(structuredClone(a), reachable(run)[0], 'normal');
    expect((b.screen as { layout: string }).layout, `seed ${seed}`).not.toBe((a.screen as { layout: string }).layout);
  }
});

test('room end regrows one flesh per two items played, capped', () => {
  expect([0, 1, 2, 3, 4, 5, 9].map(regrowFromPlayed)).toEqual([0, 0, 1, 1, 2, 2, PLAYED_REGROW_MAX]);
  const run = enterNode(createRun(3), reachable(createRun(3))[0]);
  const f = structuredClone((run.screen as { fight: Fight }).fight);
  f.enemies = [];
  f.status = 'won';
  f.played = 3;
  const body = f.snake.segs.filter((s) => !s.item || s.temp).length;
  const after = finishFight(run, f);
  expect(after.lastRoom?.regrown).toBe(1);
  expect(after.flesh).toBe(Math.min(body + 1, 8));
});

test('recently offered items come up less often', () => {
  const r = makeRng(9);
  const recent = rollItems(makeRng(1), 3, 'fight');
  let again = 0, base = 0;
  for (let i = 0; i < 2000; i++) {
    again += rollItems(r, 3, 'fight', recent).filter((x) => recent.includes(x)).length;
    base += rollItems(r, 3, 'fight').filter((x) => recent.includes(x)).length;
  }
  expect(again).toBeLessThan(base * 0.5);
});

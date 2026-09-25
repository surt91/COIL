import { describe, expect, test } from 'vitest';
import '../src/content';
import { checkInvariants } from '../src/bot/invariants';
import { ENCOUNTERS } from '../src/content/encounters';
import { LAYOUTS } from '../src/content/layouts';
import { coiledEnemies } from '../src/core/coil';
import { createFight, legalMoves, step } from '../src/core/fight';
import { Dir, Pos } from '../src/core/geom';
import { hand, spawnEnemy } from '../src/core/ops';
import { CHARMS, ITEMS } from '../src/core/registry';
import { makeRng, pick } from '../src/core/rng';
import type { Action, Fight, ItemId } from '../src/core/types';

const P = (x: number, y: number): Pos => ({ x, y });
const U: Dir = 0, R: Dir = 1, D: Dir = 2, L: Dir = 3;

const open = (w: number, h: number) =>
  Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.')).join(''));

function fight(body: Pos[], items: (ItemId | null)[], charms: string[] = [], w = 12, h = 9): Fight {
  return createFight({ rows: open(w, h), genome: [], flesh: 0, seed: 1, charms, snake: { body, items, dir: L }, opts: { minFood: 0, hungerEvery: 1000 } });
}

/** A ring around (3,3) with the head at (3,2); segments behind it as given. */
const RING = [P(3, 2), P(4, 2), P(4, 3), P(4, 4), P(3, 4), P(2, 4), P(2, 3), P(2, 2)];

function enemy(f: Fight, kind: string, at: Pos) {
  const e = spawnEnemy(f, kind, at);
  e.intent = { t: 'wait' };
  return e;
}

describe('coil holding rules', () => {
  test('Muscle crushes a coiled beetle but not a buried mole', () => {
    const f = fight(RING, ['muscle', null, null, null, null, null, null]);
    const mole = enemy(f, 'mole', P(3, 3));
    mole.under = true;
    const g = step(f, { t: 'play', slot: 0 });
    expect(g.enemies.find((e) => e.kind === 'mole')!.hp).toBe(mole.hp);
    const f2 = fight(RING, ['muscle', null, null, null, null, null, null]);
    const b = enemy(f2, 'beetle', P(3, 3));
    const g2 = step(f2, { t: 'play', slot: 0 });
    expect(g2.enemies.find((e) => e.id === b.id)?.hp ?? 0).toBeLessThan(b.hp);
  });

  test('bosses are only held by tight coils', () => {
    // A 3x3 interior (area 9) is too big for the Mongoose (≤3).
    const big = [P(2, 1), P(3, 1), P(4, 1), P(5, 1), P(6, 1), P(6, 2), P(6, 3), P(6, 4), P(6, 5), P(5, 5), P(4, 5), P(3, 5), P(2, 5), P(2, 4), P(2, 3), P(2, 2)];
    const f = fight(big, new Array(big.length - 1).fill(null));
    enemy(f, 'mongoose', P(4, 3));
    enemy(f, 'beetle', P(3, 3));
    const held = [...coiledEnemies(f).keys()].map((e) => e.kind);
    expect(held).toContain('beetle');
    expect(held).not.toContain('mongoose');
  });

  test('Digestive Acid needs a held enemy and poisons it', () => {
    const f = fight(RING, ['acid', null, null, null, null, null, null]);
    const b = enemy(f, 'tortoise', P(3, 3));
    const g = step(f, { t: 'play', slot: 0 });
    const t = g.enemies.find((e) => e.id === b.id)!;
    expect(t.hp).toBe(b.hp - 2);
    expect(t.poison).toBe(2);
  });

  test('coiled enemies lose their intent and cannot attack', () => {
    const f = fight(RING, new Array(7).fill(null));
    const b = enemy(f, 'beetle', P(3, 3));
    b.hp = b.maxHp = 10; // survives the crush, so only the attack could change the length
    b.intent = { t: 'lock', seg: f.snake.segs[0].uid, dmg: 1, windup: 1, reach: 1 };
    const g = step(f, { t: 'move', dir: U });
    expect(g.snake.segs.length).toBe(7);
  });

  test('crushing an enemy to death swallows it: +1 flesh, hunger resets', () => {
    const f = fight(RING, new Array(7).fill(null));
    const b = enemy(f, 'beetle', P(3, 3));
    b.hp = 1;
    f.hunger = 9;
    const g = step(f, { t: 'move', dir: U });
    expect(g.enemies.some((e) => e.id === b.id)).toBe(false);
    expect(g.snake.segs.length).toBe(8);
    expect(g.hunger).toBeLessThanOrEqual(1);
  });
});

describe('wrap, poison, stealing, burrowing', () => {
  test('an enemy touching 4 snake tiles is squeezed for 1', () => {
    // Snake bends around the beetle at (5,4) without closing a ring.
    const body = [P(4, 3), P(5, 3), P(6, 3), P(6, 4), P(6, 5), P(7, 5)];
    const f = fight(body, new Array(5).fill(null));
    const b = enemy(f, 'tortoise', P(5, 4));
    const g = step(f, { t: 'move', dir: D }); // head to (4,4): touches (5,4) too
    const hurt = g.events.filter((e) => e.t === 'enemyHurt' && e.enemy === b.id && e.cause === 'crush');
    expect(hurt.length).toBe(1);
  });

  test('poison ticks one damage per turn', () => {
    const f = fight([P(8, 4), P(9, 4)], [null]);
    const b = enemy(f, 'tortoise', P(2, 2));
    b.poison = 2;
    const g = step(step(f, { t: 'move', dir: U }), { t: 'move', dir: U });
    const t = g.enemies.find((e) => e.id === b.id)!;
    expect(t.hp).toBe(b.hp - 2);
    expect(t.poison).toBe(0);
  });

  test('a magpie steals an item; killing it grafts the item back', () => {
    const f = fight([P(6, 4), P(7, 4), P(8, 4)], ['fang', null]);
    const m = enemy(f, 'magpie', P(7, 5));
    m.intent = { t: 'steal', seg: f.snake.segs[0].uid, reach: 1 };
    // Move up: seg 0 goes to (6,4) — still within reach of (7,5).
    let g = step(f, { t: 'move', dir: U });
    expect(g.snake.segs.some((s) => s.item === 'fang')).toBe(false);
    const thief = g.enemies.find((e) => e.id === m.id)!;
    expect(thief.carry).toBe('fang');
    thief.hp = 1;
    thief.pos = P(6, 2);
    g = step(g, { t: 'move', dir: U });
    expect(g.snake.segs[0].item).toBe('fang');
  });

  test('a buried mole is untouchable and erupts on the marked tile', () => {
    const f = fight([P(6, 4), P(7, 4), P(8, 4)], [null, null]);
    const m = enemy(f, 'mole', P(3, 4));
    m.under = true;
    m.intent = { t: 'emerge', at: P(5, 4), dmg: 2 };
    const g = step(f, { t: 'move', dir: L }); // head moves onto the marked tile
    expect(g.snake.segs.length).toBe(0);
    expect(g.enemies.find((e) => e.id === m.id)!.under).toBe(false);
  });
});

describe('charms', () => {
  test('Lucky Scale absorbs the first hit of a room', () => {
    const f = fight([P(6, 4), P(7, 4), P(8, 4)], [null, null], ['lucky-scale']);
    const b = enemy(f, 'beetle', P(6, 3));
    b.intent = { t: 'lock', seg: 0, dmg: 1, windup: 1, reach: 1 };
    const g = step(f, { t: 'move', dir: L });
    expect(g.snake.segs.length).toBe(2);
    expect(g.events.some((e) => e.t === 'absorb')).toBe(true);
  });

  test("Hunter's Gut grows extra flesh on a biting kill", () => {
    const f = fight([P(6, 4), P(7, 4)], [null], ['hunter']);
    const b = enemy(f, 'beetle', P(5, 4));
    b.hp = 1;
    const g = step(f, { t: 'move', dir: L });
    expect(g.snake.segs.length).toBe(1 + 2);
  });

  test('Slow Metabolism delays hunger', () => {
    const rows = open(12, 9);
    rows[4] = 'S' + rows[4].slice(1);
    const f = createFight({ rows, genome: [], flesh: 1, seed: 1, charms: ['slow-metabolism'] });
    expect(f.opts.hungerEvery).toBe(12 + 5);
  });
});

describe('engine contract', () => {
  const genome = [...ITEMS.keys()].filter((k) => ITEMS.get(k)!.rarity !== 'signature');
  const charmIds = [...CHARMS.keys()];

  function randomFight(seed: number): Fight {
    const r = makeRng(seed);
    const enc = pick(r, ENCOUNTERS);
    const layout = pick(r, LAYOUTS.filter((l) => (enc.layouts ? enc.layouts.includes(l.id) : !l.boss)));
    const charms = [pick(r, charmIds), pick(r, charmIds)];
    return createFight({ rows: layout.rows, genome, flesh: 5, seed, place: enc.enemies, charms });
  }

  test('step never mutates its input and states survive a JSON round trip', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const r = makeRng(seed * 31);
      let f = randomFight(seed);
      for (let i = 0; i < 120 && f.status === 'play'; i++) {
        const moves = legalMoves(f);
        const a: Action = hand(f).length && r.s % 3 === 0 ? { t: 'play', slot: pick(r, [0, 1, 2]), dir: pick(r, [U, R, D, L]) } : moves.length ? { t: 'move', dir: pick(r, moves) } : { t: 'tuck' };
        const before = JSON.stringify(f);
        const g = step(f, a);
        expect(JSON.stringify(f)).toBe(before);
        expect(JSON.parse(JSON.stringify(g))).toEqual(g);
        const bad = checkInvariants(g);
        if (bad.length) throw new Error(`seed ${seed} step ${i}: ${bad.join('; ')}`);
        f = g;
      }
    }
  });
});

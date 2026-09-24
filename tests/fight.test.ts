import { describe, expect, test } from 'vitest';
import '../src/content';
import { computeCoils } from '../src/core/coil';
import { createFight, legalMoves, step } from '../src/core/fight';
import { Dir, Pos, manhattan } from '../src/core/geom';
import { hand } from '../src/core/ops';
import { makeRng, pick } from '../src/core/rng';
import type { Fight, ItemId } from '../src/core/types';

const U: Dir = 0, R: Dir = 1, D: Dir = 2, L: Dir = 3;
const P = (x: number, y: number): Pos => ({ x, y });

const open = (w: number, h: number, extra: Record<string, string> = {}) => {
  const rows = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.')).join(''),
  );
  for (const [k, c] of Object.entries(extra)) {
    const [x, y] = k.split(',').map(Number);
    rows[y] = rows[y].slice(0, x) + c + rows[y].slice(x + 1);
  }
  return rows;
};

function fight(rows: string[], body: Pos[], items: (ItemId | null)[] | null = null, dir: Dir = R): Fight {
  return createFight({
    rows,
    genome: [],
    flesh: 0,
    seed: 1,
    snake: { body, items: items ?? new Array(body.length - 1).fill(null), dir },
    opts: { minFood: 0, hungerEvery: 1000 },
  });
}

describe('movement', () => {
  test('body follows the head', () => {
    let f = fight(open(10, 8), [P(4, 3), P(3, 3), P(2, 3)]);
    f = step(f, { t: 'move', dir: D });
    expect(f.snake.body).toEqual([P(4, 4), P(4, 3), P(3, 3)]);
  });

  test('cannot reverse onto the neck or walk into walls', () => {
    const f = fight(open(10, 8), [P(1, 3), P(2, 3), P(3, 3)], null, L);
    expect(legalMoves(f).sort()).toEqual([U, D]);
  });

  test('food grows the tail', () => {
    let f = fight(open(10, 8, { '5,3': 'f' }), [P(4, 3), P(3, 3), P(2, 3)]);
    f = step(f, { t: 'move', dir: R });
    expect(f.snake.body).toEqual([P(5, 3), P(4, 3), P(3, 3), P(2, 3)]);
    expect(f.snake.segs.length).toBe(3);
  });

  test('the tail tip can be entered because it moves away', () => {
    // 2x2 square: head (3,3), (4,3), (4,4), tail (3,4)
    const f = fight(open(10, 8), [P(3, 3), P(4, 3), P(4, 4), P(3, 4)], null, L);
    expect(legalMoves(f)).toContain(D);
    const g = step(f, { t: 'move', dir: D });
    expect(g.snake.body[0]).toEqual(P(3, 4));
  });

  test('emerging from the burrow', () => {
    let f = createFight({ rows: open(10, 8, { '1,3': 'S' }), genome: ['fang', 'scale'], flesh: 2, seed: 3, opts: { minFood: 0 } });
    expect(f.snake.body).toEqual([P(1, 3)]);
    expect(f.snake.dir).toBe(R);
    f = step(f, { t: 'move', dir: R });
    f = step(f, { t: 'move', dir: R });
    expect(f.snake.body).toEqual([P(3, 3), P(2, 3), P(1, 3)]);
    f = step(f, { t: 'move', dir: R });
    f = step(f, { t: 'move', dir: R });
    f = step(f, { t: 'move', dir: R });
    expect(f.snake.body.length).toBe(5);
    expect(f.snake.body[4]).toEqual(P(2, 3));
  });
});

describe('combat', () => {
  test('a surviving enemy is knocked back and interrupted; a killed one is eaten', () => {
    let f = fight(open(10, 8, { '5,3': 'b' }), [P(4, 3), P(3, 3), P(2, 3)]);
    const hp = f.enemies[0].hp;
    f = step(f, { t: 'move', dir: R });
    expect(f.enemies[0].hp).toBe(hp - 1);
    expect(f.snake.body[0]).toEqual(P(4, 3));
    // Knocked back to (6,3); the interrupt costs it its action.
    expect(f.enemies[0].pos).toEqual(P(6, 3));
    f = step(f, { t: 'move', dir: R });
    f = step(f, { t: 'move', dir: R });
    expect(f.enemies.length).toBe(0);
    expect(f.snake.body[0]).toEqual(P(6, 3));
    expect(f.snake.segs[0].item).toBe('carapace');
    expect(f.snake.segs[0].temp).toBe(true);
    expect(f.cleared).toBe(true);
  });

  test('beetle lock lands when the body curls around it', () => {
    // Beetle at (5,4). Snake heading right along y=3, segment at (5,3) adjacent.
    let f = fight(open(12, 8, { '5,5': 'b' }), [P(5, 3), P(4, 3), P(3, 3), P(2, 3)], null, R);
    // Force a lock on the head-adjacent position: move beetle next to segment (4,3).
    f.enemies[0].pos = P(4, 4);
    f.enemies[0].intent = { t: 'lock', seg: f.snake.segs[0].uid, dmg: 1, windup: 1, reach: 1 };
    // Moving down: seg0 goes to (5,3)... which is diagonal to (4,4) -> Chebyshev 1 -> hit.
    const g = step(f, { t: 'move', dir: D });
    expect(g.snake.segs.length).toBe(2);
    // Moving right instead: seg0 moves to (5,3) as well; but moving up keeps it at (5,3) too.
    // Contrast: target the tail seg which moves to (3,3) -> Chebyshev 1 from (4,4) also hits,
    // so instead start the beetle further left.
    f.enemies[0].pos = P(3, 4);
    f.enemies[0].intent = { t: 'lock', seg: f.snake.segs[1].uid, dmg: 1, windup: 1, reach: 1 };
    // seg1 is at (3,3); after moving right it is at (4,3): Chebyshev 1 from (3,4) -> hit.
    // seg2 at (2,3) -> after move at (3,3): hit. So lock seg0 (at (4,3)) -> moves to (5,3): distance 2 -> fizzle.
    f.enemies[0].intent = { t: 'lock', seg: f.snake.segs[0].uid, dmg: 1, windup: 1, reach: 1 };
    const h = step(f, { t: 'move', dir: R });
    expect(h.snake.segs.length).toBe(3);
    expect(h.events.some((e) => e.t === 'fizzle')).toBe(true);
  });

  test('a head hit destroys the two segments behind the head', () => {
    let f = fight(open(12, 8), [P(5, 3), P(4, 3), P(3, 3), P(2, 3)], ['fang', 'rattle', null]);
    f.enemies.push({ id: 99, kind: 'frog', pos: P(9, 3), hp: 2, maxHp: 2, intent: { t: 'strike', tiles: [P(6, 3)], dmg: 1 }, poison: 0, held: false, mem: {} });
    f = step(f, { t: 'move', dir: R });
    // Head moved to (6,3) and got hit: the two neck segments are gone.
    expect(f.snake.segs.map((s) => s.item)).toEqual([null]);
  });

  test('scale absorbs a hit on its own segment', () => {
    let f = fight(open(12, 8), [P(5, 3), P(4, 3), P(3, 3)], ['scale', null]);
    f.enemies.push({ id: 99, kind: 'frog', pos: P(9, 6), hp: 2, maxHp: 2, intent: { t: 'strike', tiles: [P(5, 3)], dmg: 1 }, poison: 0, held: false, mem: {} });
    f = step(f, { t: 'move', dir: R });
    expect(f.snake.segs.length).toBe(2);
    expect(f.snake.segs[0].item).toBe(null);
    expect(f.events.some((e) => e.t === 'absorb')).toBe(true);
  });

  test('trapped snake bites itself', () => {
    // Head in a corner pocket surrounded by its own body.
    const rows = open(6, 6);
    const body = [P(1, 1), P(2, 1), P(2, 2), P(1, 2), P(1, 3), P(2, 3)];
    // Head (1,1): up wall, left wall, right = neck, down = (1,2) body -> trapped.
    const f = fight(rows, body, null, U);
    expect(legalMoves(f)).toEqual([D]);
    const g = step(f, { t: 'move', dir: D });
    expect(g.snake.body[0]).toEqual(P(1, 2));
    expect(g.husks.length).toBeGreaterThan(0);
  });
});

describe('coils', () => {
  test('a ring around an enemy holds and crushes it', () => {
    // Ring around the hedgehog at (3,3), head at (3,2), tail at (2,2).
    const body = [P(3, 2), P(4, 2), P(4, 3), P(4, 4), P(3, 4), P(2, 4), P(2, 3), P(2, 2)];
    const f = fight(open(10, 8, { '3,3': 'h' }), body, null, L);
    expect(computeCoils(f).map((c) => c.area)).toEqual([1]);
    // Moving up keeps all four orthogonal neighbours of (3,3) covered: area 1 -> crush 3.
    const g = step(f, { t: 'move', dir: U });
    expect(g.events.some((e) => e.t === 'enemyHurt' && e.cause === 'crush' && e.dmg === 3)).toBe(true);
    expect(g.enemies.length).toBe(0);
  });

  test('crush damage scales with tightness', () => {
    const b = [P(3, 2), P(4, 2), P(4, 3), P(4, 4), P(3, 4), P(2, 4), P(2, 3), P(2, 2), P(2, 1), P(3, 1), P(4, 1), P(5, 1)];
    // head (3,2) with (3,1)(2,2)(4,2) around: moving... just check static coil areas
    const f = fight(open(10, 8, { '3,3': 'h' }), b, null, L);
    const coils = computeCoils(f);
    expect(coils.length).toBe(1);
    expect(coils[0].crush).toBe(3);
  });

  test('natural wall pockets are not coils', () => {
    const rows = open(10, 8, { '7,1': '#', '8,2': '#', '7,3': '#' }); // (8,1) enclosed by walls only
    const f = fight(rows, [P(3, 5), P(2, 5)]);
    expect(computeCoils(f)).toEqual([]);
  });
});

describe('body is the deck', () => {
  test('the hand is the first three item segments; playing consumes the segment', () => {
    let f = fight(open(12, 8), [P(6, 3), P(5, 3), P(4, 3), P(3, 3), P(2, 3), P(1, 3)], [null, 'fang', 'scale', 'rattle', 'spine']);
    expect(hand(f)).toEqual([1, 2, 3]);
    f = step(f, { t: 'play', slot: 0 });
    expect(f.buffs.bite).toBe(2);
    expect(f.snake.segs.map((s) => s.item)).toEqual([null, 'scale', 'rattle', 'spine']);
    expect(f.snake.body.length).toBe(5);
    expect(hand(f)).toEqual([1, 2, 3]);
  });

  test('tuck sends the first hand item to the tail, once per turn', () => {
    let f = fight(open(12, 8), [P(5, 3), P(4, 3), P(3, 3), P(2, 3)], ['fang', 'scale', null]);
    f = step(f, { t: 'tuck' });
    expect(f.snake.segs.map((s) => s.item)).toEqual(['scale', null, 'fang']);
    const g = step(f, { t: 'tuck' });
    expect(g.snake.segs.map((s) => s.item)).toEqual(['scale', null, 'fang']);
  });

  test('lunge moves two tiles and ends the turn', () => {
    let f = fight(open(12, 8), [P(4, 3), P(3, 3), P(2, 3)], ['lunge', null]);
    f = step(f, { t: 'play', slot: 0, dir: R });
    expect(f.snake.body[0]).toEqual(P(6, 3));
    expect(f.turn).toBe(1);
  });

  test('reverse swaps head and tail', () => {
    let f = fight(open(12, 8), [P(5, 3), P(4, 3), P(3, 3), P(2, 3), P(1, 3)], ['reverse', 'fang', null, 'scale']);
    f = step(f, { t: 'play', slot: 0 });
    expect(f.snake.body[0]).toEqual(P(2, 3));
    expect(f.snake.segs.map((s) => s.item)).toEqual(['scale', null, 'fang']);
    expect(f.snake.dir).toBe(L);
  });

  test('hunger eats the tail', () => {
    let f = createFight({ rows: open(12, 8), genome: [], flesh: 0, seed: 1, snake: { body: [P(2, 3), P(1, 3)], items: [null], dir: R }, opts: { minFood: 0, hungerEvery: 3 } });
    for (let i = 0; i < 3; i++) f = step(f, { t: 'move', dir: i < 2 ? R : D });
    expect(f.snake.segs.length).toBe(0);
  });
});

describe('determinism and invariants', () => {
  const room = [
    '#################',
    '#...............#',
    '#..b.......r....#',
    '#.......##......#',
    '#S......##...h..#',
    '#...............#',
    '#....m......s...#',
    '#...............E',
    '#################',
  ];
  const genome: ItemId[] = ['lunge', 'fang', 'scale', 'venom', 'spine', 'heart', 'muscle', 'reverse', 'shed', 'rattle', 'tailwhip', 'swallow', 'molt', 'ouroboros', 'kinetic'];

  function randomPlay(seed: number, steps: number) {
    const r = makeRng(seed);
    let f = createFight({ rows: room, genome, flesh: 4, seed });
    const log: string[] = [];
    for (let i = 0; i < steps && f.status === 'play'; i++) {
      const moves = legalMoves(f);
      const plays = hand(f).map((_, slot) => slot);
      const a =
        plays.length && r.s % 3 === 0
          ? { t: 'play' as const, slot: pick(r, plays), dir: pick(r, [U, R, D, L]) }
          : moves.length
            ? { t: 'move' as const, dir: pick(r, moves) }
            : { t: 'tuck' as const };
      f = step(f, a);
      log.push(JSON.stringify(a));
      checkInvariants(f);
      if (!moves.length && a.t !== 'play') break;
    }
    return { f, log };
  }

  function checkInvariants(f: Fight) {
    const b = f.snake.body;
    expect(b.length).toBeLessThanOrEqual(f.snake.segs.length + 1);
    for (let i = 1; i < b.length; i++) expect(manhattan(b[i], b[i - 1])).toBe(1);
    expect(new Set(b.map((p) => `${p.x},${p.y}`)).size).toBe(b.length);
    for (const e of f.enemies) {
      expect(e.hp).toBeGreaterThan(0);
      expect(Number.isFinite(e.pos.x)).toBe(true);
      expect(b.some((p) => p.x === e.pos.x && p.y === e.pos.y)).toBe(false);
    }
    expect(new Set(f.snake.segs.map((s) => s.uid)).size).toBe(f.snake.segs.length);
  }

  test('same seed and actions give the same state', () => {
    const a = randomPlay(5, 150), b = randomPlay(5, 150);
    expect(a.log).toEqual(b.log);
    expect(JSON.stringify(a.f)).toEqual(JSON.stringify(b.f));
  });

  test('fuzz: random play never breaks invariants', () => {
    for (let seed = 1; seed <= 60; seed++) randomPlay(seed, 300);
  });
});

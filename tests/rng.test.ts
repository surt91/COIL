import { expect, test } from 'vitest';
import { makeRng, next, int, shuffle } from '../src/core/rng';

test('rng is deterministic', () => {
  const a = makeRng(42), b = makeRng(42);
  const xs = Array.from({ length: 10 }, () => next(a));
  const ys = Array.from({ length: 10 }, () => next(b));
  expect(xs).toEqual(ys);
  expect(new Set(xs).size).toBe(10);
});

test('int stays in range and covers it', () => {
  const r = makeRng(1);
  const seen = new Set<number>();
  for (let i = 0; i < 1000; i++) {
    const v = int(r, 2, 5);
    expect(v).toBeGreaterThanOrEqual(2);
    expect(v).toBeLessThanOrEqual(5);
    seen.add(v);
  }
  expect(seen.size).toBe(4);
});

test('shuffle is a permutation', () => {
  const xs = shuffle(makeRng(7), [1, 2, 3, 4, 5, 6]);
  expect([...xs].sort()).toEqual([1, 2, 3, 4, 5, 6]);
});

import { expect, test } from 'vitest';
import { enclosedTiles } from '../src/core/enclosure';
import { key } from '../src/core/geom';

const bar = (pts: [number, number][]) => new Set(pts.map(([x, y]) => key({ x, y })));

test('ring encloses its interior', () => {
  const ring: [number, number][] = [];
  for (let x = 1; x <= 3; x++) { ring.push([x, 1], [x, 3]); }
  ring.push([1, 2], [3, 2]);
  expect(enclosedTiles(6, 6, bar(ring))).toEqual([{ x: 2, y: 2 }]);
});

test('ring with an orthogonal gap encloses nothing', () => {
  expect(enclosedTiles(6, 6, bar([[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]]))).toEqual([]);
});

test('diagonal gaps still hold (enemies move orthogonally)', () => {
  expect(enclosedTiles(6, 6, bar([[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3]]))).toEqual([{ x: 2, y: 2 }]);
});

test('board edge is not a barrier', () => {
  // U shape against top edge
  expect(enclosedTiles(5, 5, bar([[0, 0], [0, 1], [1, 1], [2, 1], [2, 0]]))).toEqual([]);
});

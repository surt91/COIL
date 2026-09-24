import { Pos, key } from './geom';

/**
 * Tiles enclosed by the barrier set: flood fill from outside the board (a
 * one-tile margin around it); everything not reached and not itself a barrier
 * is "inside". Only the snake body counts as a barrier — walls do not — so
 * pinning an enemy against a wall is not a coil.
 */
export function enclosedTiles(w: number, h: number, barrier: Set<number>): Pos[] {
  const W = w + 2, H = h + 2;
  const seen = new Uint8Array(W * H);
  const idx = (x: number, y: number) => (y + 1) * W + (x + 1);
  const stack: number[] = [0];
  seen[0] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = (i % W) - 1, y = Math.floor(i / W) - 1;
    const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of nb) {
      if (nx < -1 || ny < -1 || nx > w || ny > h) continue;
      const j = idx(nx, ny);
      if (seen[j]) continue;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && barrier.has(key({ x: nx, y: ny }))) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  const out: Pos[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!seen[idx(x, y)] && !barrier.has(key({ x, y }))) out.push({ x, y });
  return out;
}

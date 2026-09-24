export interface Pos {
  x: number;
  y: number;
}

export type Dir = 0 | 1 | 2 | 3; // up, right, down, left

export const DIRS: readonly Dir[] = [0, 1, 2, 3];
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

export const step = (p: Pos, d: Dir, n = 1): Pos => ({ x: p.x + DX[d] * n, y: p.y + DY[d] * n });
export const eq = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y;
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;
export const turnLeft = (d: Dir): Dir => ((d + 3) % 4) as Dir;
export const turnRight = (d: Dir): Dir => ((d + 1) % 4) as Dir;
export const manhattan = (a: Pos, b: Pos): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const chebyshev = (a: Pos, b: Pos): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const key = (p: Pos): number => p.y * 1024 + p.x;
export const unkey = (k: number): Pos => ({ x: k % 1024, y: Math.floor(k / 1024) });
export const neighbors4 = (p: Pos): Pos[] => DIRS.map((d) => step(p, d));
export const adjacent = (a: Pos, b: Pos): boolean => manhattan(a, b) === 1;

/** Direction from a to an orthogonally adjacent b (or the dominant axis otherwise). */
export function dirTo(a: Pos, b: Pos): Dir {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 1 : 3;
  return dy >= 0 ? 2 : 0;
}

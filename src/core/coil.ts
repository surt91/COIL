import { Pos, adjacent } from './geom';
import type { Fight } from './types';
import { bodyBonus } from './ops';
import { Tile } from './types';

export const MAX_COIL_AREA = 12;

export interface Coil {
  tiles: Pos[];
  area: number;
  crush: number;
}

/** Crush damage per turn by coil area ("tightness"). */
export function crushFor(area: number): number {
  if (area <= 1) return 3;
  if (area <= 3) return 2;
  if (area <= 8) return 1;
  return 0;
}

/**
 * Label 4-connected components of non-barrier tiles.
 * Returns component id per tile (-1 for barriers) and component sizes.
 */
function components(w: number, h: number, barrier: (i: number) => boolean) {
  const comp = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (comp[start] !== -1 || barrier(start)) continue;
    const id = sizes.length;
    let size = 0;
    comp[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % w, y = (i - x) / w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) {
        if (j < 0 || comp[j] !== -1 || barrier(j)) continue;
        comp[j] = id;
        stack.push(j);
      }
    }
    sizes.push(size);
  }
  return { comp, sizes };
}

/**
 * A coil is a connected region of free tiles that the snake has cut off:
 * it touches the snake, is at most MAX_COIL_AREA big, and is smaller than the
 * region it belonged to before the snake (and husks/webs) were considered —
 * so natural wall pockets never count. Walls, husks and webs do help close it.
 */
export function computeCoils(f: Fight, bodyOverride?: Pos[]): Coil[] {
  const { w, h } = f;
  const body = bodyOverride ?? f.snake.body;
  const terrain = (i: number) => f.tiles[i] === Tile.Wall || f.tiles[i] === Tile.Exit;
  const blocked = new Uint8Array(w * h);
  for (const p of body) blocked[p.y * w + p.x] = 1;
  for (const hk of f.husks) blocked[hk.pos.y * w + hk.pos.x] = 1;
  for (const wb of f.webs) blocked[wb.y * w + wb.x] = 1;

  const base = components(w, h, terrain);
  const cur = components(w, h, (i) => terrain(i) || blocked[i] === 1);

  const maxArea = MAX_COIL_AREA + bodyBonus(f, 'coilAreaBonus');
  const coils: Coil[] = [];
  const tilesOf: Pos[][] = cur.sizes.map(() => []);
  for (let i = 0; i < w * h; i++) {
    const c = cur.comp[i];
    if (c >= 0 && cur.sizes[c] <= maxArea) tilesOf[c].push({ x: i % w, y: Math.floor(i / w) });
  }
  tilesOf.forEach((tiles) => {
    if (tiles.length === 0) return;
    const t0 = tiles[0];
    if (base.sizes[base.comp[t0.y * w + t0.x]] <= tiles.length) return;
    if (!tiles.some((t) => body.some((b) => adjacent(t, b)))) return;
    coils.push({ tiles, area: tiles.length, crush: crushFor(tiles.length) });
  });
  return coils;
}

/**
 * Is the player's head enclosed by enemy snake bodies (walls help)? Mirrors the
 * player's own coil rule: a region of at most MAX_COIL_AREA tiles that is
 * smaller than it would be without the enemy snakes.
 */
export function enemyCoilsHead(f: Fight): boolean {
  const snakes = f.enemies.filter((e) => e.body && e.hp > 0);
  if (!snakes.length) return false;
  const { w, h } = f;
  const terrain = (i: number) => f.tiles[i] === Tile.Wall || f.tiles[i] === Tile.Exit;
  const blocked = new Uint8Array(w * h);
  for (const e of snakes) for (const p of [e.pos, ...e.body!]) blocked[p.y * w + p.x] = 1;
  const base = components(w, h, terrain);
  const cur = components(w, h, (i) => terrain(i) || blocked[i] === 1);
  const hd = f.snake.body[0];
  const i = hd.y * w + hd.x;
  const c = cur.comp[i];
  if (c < 0) return false;
  const size = cur.sizes[c];
  return size <= MAX_COIL_AREA && size < base.sizes[base.comp[i]];
}

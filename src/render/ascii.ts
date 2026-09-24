import { computeCoils } from '../core/coil';
import { key } from '../core/geom';
import * as ops from '../core/ops';
import { ENEMIES, ITEMS } from '../core/registry';
import type { Fight } from '../core/types';
import { Tile } from '../core/types';

/**
 * Plain-text board, ncurses style: `@` head, `o` flesh, `1`-`3` hand items,
 * `+` other items, `*` food, `x` husk, `~` web, `:` coil, `!` strike tiles.
 */
export function renderAscii(f: Fight): string[] {
  const grid: string[][] = [];
  for (let y = 0; y < f.h; y++) {
    const row: string[] = [];
    for (let x = 0; x < f.w; x++) {
      const t = f.tiles[y * f.w + x];
      row.push(t === Tile.Wall ? '#' : t === Tile.Exit ? (f.cleared ? 'O' : '=') : t === Tile.Burrow ? 'u' : '.');
    }
    grid.push(row);
  }
  const put = (x: number, y: number, c: string) => {
    if (y >= 0 && y < f.h && x >= 0 && x < f.w) grid[y][x] = c;
  };
  for (const c of computeCoils(f)) for (const t of c.tiles) put(t.x, t.y, ':');
  for (const e of f.enemies) if (e.intent.t === 'strike') for (const t of e.intent.tiles) put(t.x, t.y, '!');
  for (const w of f.webs) put(w.x, w.y, '~');
  for (const fd of f.food) put(fd.x, fd.y, '*');
  for (const h of f.husks) put(h.pos.x, h.pos.y, 'x');
  const hand = ops.hand(f);
  f.snake.body.forEach((p, i) => {
    if (i === 0) return put(p.x, p.y, '@');
    const s = f.snake.segs[i - 1];
    const slot = hand.indexOf(i - 1);
    put(p.x, p.y, slot >= 0 ? String(slot + 1) : s.item ? '+' : 'o');
  });
  for (const e of f.enemies) put(e.pos.x, e.pos.y, ENEMIES.get(e.kind)?.char ?? '?');
  const lines = grid.map((r) => r.join(''));
  const locked = new Set(f.enemies.flatMap((e) => (e.intent.t === 'lock' ? [e.intent.seg] : [])));
  void key;
  const info = [
    `turn ${f.turn}  hunger ${f.opts.hungerEvery - f.hunger}  segs ${f.snake.segs.length} (pending ${ops.pending(f)})  ${f.cleared ? 'CLEARED' : ''} ${f.status}`,
    `hand: ${hand.map((k, i) => `${i + 1}=${ITEMS.get(f.snake.segs[k].item!)?.name}`).join('  ')}`,
    `body: ${f.snake.segs.map((s) => (s.item ? ITEMS.get(s.item)!.name : 'o') + (locked.has(s.uid) ? '[LOCK]' : '')).join(' ')}`,
    ...f.enemies.map((e) => {
      const it = e.intent;
      const desc = it.t === 'move' ? `move ${'URDL'[it.dir]}x${it.steps}` : it.t === 'lock' ? `lock seg#${f.snake.segs.findIndex((s) => s.uid === it.seg) + 1}${it.seg === 0 ? '(head)' : ''} w${it.windup} r${it.reach}${it.sever ? ' SEVER' : ''}` : it.t === 'strike' ? `strike ${it.tiles.map((t) => `${t.x},${t.y}`).join(' ')}` : it.t;
      return `${ENEMIES.get(e.kind)?.name} @${e.pos.x},${e.pos.y} hp${e.hp}${e.held ? ' HELD' : ''}${e.poison ? ` psn${e.poison}` : ''}: ${desc}`;
    }),
  ];
  return [...lines, ...info];
}

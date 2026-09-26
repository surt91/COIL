import { DIRS, Pos, chebyshev, dirTo, manhattan, step } from '../core/geom';
import { protectedSeg } from '../core/fight';
import * as ops from '../core/ops';
import { defineEnemy } from '../core/registry';
import { adjacentParts, approach, juiciest, line, prey, retreat } from './ai';

defineEnemy({
  kind: 'beetle',
  name: 'Beetle',
  char: 'b',
  hp: 2,
  glyph: 'beetle',
  color: '#b0764a',
  text: 'Walks toward you. Latches onto an adjacent segment and bites it next turn — unless that segment has moved out of reach.',
  signature: 'carapace',
  think(f, e) {
    const adj = adjacentParts(f, e.pos);
    if (adj.length) return { t: 'lock', seg: juiciest(f, adj).uid, dmg: 1, windup: 1, reach: 1 };
    return approach(f, e, prey(f));
  },
});

defineEnemy({
  kind: 'hedgehog',
  name: 'Hedgehog',
  char: 'h',
  hp: 3,
  glyph: 'hedgehog',
  color: '#8a7a6a',
  text: 'Spiny: biting it costs you your neck segment, and it curls up (bite-immune for 2 turns). Slow. Coil it instead.',
  spiky: true,
  signature: 'quill',
  onBitten(_f, e) {
    return (e.mem.curled ?? 0) > 0;
  },
  afterBitten(_f, e) {
    e.mem.curled = 3;
  },
  think(f, e) {
    if (e.mem.curled > 0) e.mem.curled--;
    if (e.mem.curled > 0) return { t: 'wait' };
    e.mem.tick = (e.mem.tick ?? 0) + 1;
    const adj = adjacentParts(f, e.pos);
    if (adj.length) return { t: 'lock', seg: juiciest(f, adj).uid, dmg: 1, windup: 1, reach: 1 };
    if (e.mem.tick % 2 === 0) return { t: 'wait' };
    return approach(f, e, prey(f));
  },
});

defineEnemy({
  kind: 'frog',
  name: 'Frog',
  char: 'r',
  hp: 2,
  glyph: 'frog',
  color: '#6aa84f',
  text: 'Hops two tiles. When lined up with your head, lashes its tongue along 3 tiles — hitting everything on that line.',
  signature: 'tongue',
  think(f, e) {
    const h = ops.head(f);
    if ((e.mem.cd ?? 0) > 0) {
      e.mem.cd--;
      return manhattan(e.pos, h) < 3 ? retreat(f, e, h) : { t: 'wait' };
    }
    if ((h.x === e.pos.x || h.y === e.pos.y) && manhattan(h, e.pos) <= 3) {
      const d = dirTo(e.pos, h);
      const tiles = line(f, e.pos, d, 3);
      if (tiles.some((t) => t.x === h.x && t.y === h.y)) {
        e.mem.cd = 1;
        return { t: 'strike', tiles, dmg: 1 };
      }
    }
    // Hop to line up with the head.
    const goals: Pos[] = [];
    for (const d of DIRS) for (let i = 2; i <= 3; i++) goals.push(step(h, d, i));
    const d = ops.pathStep(f, e.pos, goals.filter((g) => ops.freeForEnemy(f, g)));
    return d === null ? approach(f, e, [h]) : { t: 'move', dir: d, steps: 2 };
  },
});

defineEnemy({
  kind: 'mantis',
  name: 'Mantis',
  char: 'm',
  hp: 3,
  glyph: 'mantis',
  color: '#9bc53d',
  text: 'Raises its scythes for two turns, then severs a segment within 2 tiles. Everything behind the cut falls off as husks.',
  signature: 'scythe',
  think(f, e) {
    if ((e.mem.cd ?? 0) > 0) {
      e.mem.cd--;
      return approach(f, e, prey(f));
    }
    const s = f.snake;
    let best = -1, bestScore = -1;
    for (let bi = 1; bi < s.body.length; bi++) {
      if (chebyshev(s.body[bi], e.pos) > 2 || protectedSeg(f, s.segs[bi - 1].uid)) continue;
      const behind = s.segs.slice(bi - 1).filter((x) => x.item).length;
      const score = behind * 10 + (s.segs.length - bi);
      if (score > bestScore) { bestScore = score; best = bi; }
    }
    if (best > 0) {
      e.mem.cd = 2;
      return { t: 'lock', seg: s.segs[best - 1].uid, dmg: 1, sever: true, windup: 2, reach: 2 };
    }
    return approach(f, e, s.body);
  },
});

defineEnemy({
  kind: 'spider',
  name: 'Spider',
  char: 's',
  hp: 2,
  glyph: 'spider',
  color: '#8d7b68',
  text: 'Keeps its distance and spins webs ahead of you. A webbed head loses its move. Webs also count as walls for your coils.',
  signature: 'silk',
  think(f, e) {
    const h = ops.head(f);
    const dist = manhattan(e.pos, h);
    if ((e.mem.cd ?? 0) > 0) e.mem.cd--;
    else if (dist <= 6) {
      e.mem.cd = 3;
      const d = f.snake.dir;
      const tiles = [step(h, d, 2), step(h, d, 3)].filter((t) => ops.inBounds(f, t) && !ops.isSolid(f, t));
      if (tiles.length) return { t: 'web', tiles };
    }
    e.mem.slow = ((e.mem.slow ?? 0) + 1) % 2;
    if (dist < 3) return e.mem.slow ? retreat(f, e, h) : { t: 'wait' };
    if (dist > 5) return approach(f, e, [h]);
    return { t: 'wait' };
  },
});

defineEnemy({
  kind: 'mongoose',
  name: 'Mongoose',
  char: 'M',
  hp: 14,
  glyph: 'mongoose',
  color: '#c9a66b',
  text: 'Boss. Fast — moves two tiles a turn, three when wounded. Bites hard. Pounces along a line when lined up with your head. Only a tight coil (≤3 tiles) can hold it.',
  boss: true,
  heldMaxArea: 3,
  think(f, e) {
    e.mem.t = (e.mem.t ?? 0) + 1;
    const h = ops.head(f);
    const wounded = e.hp <= e.maxHp / 2;
    const adj = adjacentParts(f, e.pos);
    if (adj.length) return { t: 'lock', seg: juiciest(f, adj).uid, dmg: wounded ? 2 : 1, windup: 1, reach: 1 };
    if (e.mem.t % 3 === 0 && (h.x === e.pos.x || h.y === e.pos.y) && manhattan(h, e.pos) <= 5) {
      const tiles = line(f, e.pos, dirTo(e.pos, h), 5);
      if (tiles.length) return { t: 'strike', tiles, dmg: 1 };
    }
    return approach(f, e, prey(f), wounded ? 3 : 2);
  },
});

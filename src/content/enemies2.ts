/** Act 2 ("The Roots") and Act 3 ("The Deep") enemies. */
import { DIRS, Pos, chebyshev, dirTo, manhattan, step } from '../core/geom';
import * as ops from '../core/ops';
import { defineEnemy } from '../core/registry';
import type { Enemy, Fight, Intent } from '../core/types';

function adjacentParts(f: Fight, p: Pos) {
  const out: { uid: number; bi: number }[] = [];
  f.snake.body.forEach((b, bi) => {
    if (manhattan(b, p) === 1) out.push({ uid: bi === 0 ? 0 : f.snake.segs[bi - 1].uid, bi });
  });
  return out;
}

const approach = (f: Fight, e: Enemy, goals: Pos[], steps = 1, flies = false): Intent => {
  const d = ops.pathStep(f, e.pos, goals, flies);
  return d === null ? { t: 'wait' } : { t: 'move', dir: d, steps, chase: steps > 1 };
};

function retreat(f: Fight, e: Enemy, from: Pos, flies = false): Intent {
  let best = null as null | 0 | 1 | 2 | 3, bestD = manhattan(e.pos, from);
  for (const d of DIRS) {
    const p = step(e.pos, d);
    if (ops.freeForEnemy(f, p, flies) && manhattan(p, from) > bestD) { best = d; bestD = manhattan(p, from); }
  }
  return best === null ? { t: 'wait' } : { t: 'move', dir: best, steps: 1 };
}

const lockAdjacent = (f: Fight, e: Enemy, dmg = 1): Intent | null => {
  const adj = adjacentParts(f, e.pos);
  if (!adj.length) return null;
  const pick = adj.sort((a, b) => (b.bi === 0 ? -1 : 1) - (a.bi === 0 ? -1 : 1))[0];
  return { t: 'lock', seg: pick.uid, dmg, windup: 1, reach: 1 };
};

/** Where the head will probably be in two turns (straight ahead, else current). */
function predictHead(f: Fight): Pos {
  const h = ops.head(f);
  const a = step(h, f.snake.dir, 2);
  return ops.inBounds(f, a) && !ops.isSolid(f, a) ? a : h;
}

defineEnemy({
  kind: 'mole',
  name: 'Mole',
  char: 'l',
  hp: 3,
  glyph: 'mole',
  color: '#6d5a4f',
  text: 'Digs underground and erupts on a marked tile a turn later, hitting whatever is there for 2. Untouchable while buried. Keep the marked tile clear — or coil it.',
  think(f, e) {
    if (e.under) {
      const at = predictHead(f);
      return { t: 'emerge', at, dmg: 2 };
    }
    const l = lockAdjacent(f, e);
    if (l) return l;
    e.mem.t = (e.mem.t ?? 0) + 1;
    if (e.mem.t % 3 === 0 && manhattan(e.pos, ops.head(f)) <= 8) return { t: 'burrow' };
    return approach(f, e, f.snake.body);
  },
});

defineEnemy({
  kind: 'magpie',
  name: 'Magpie',
  char: 'p',
  hp: 2,
  glyph: 'magpie',
  color: '#dfe7ef',
  text: 'Flies over your body and steals the item from an adjacent segment, then flees. Kill it to get the item back.',
  flies: true,
  think(f, e) {
    if (e.carry) return retreat(f, e, ops.head(f), true);
    const s = f.snake;
    for (let bi = 1; bi < s.body.length; bi++) {
      const seg = s.segs[bi - 1];
      if (seg.item && chebyshev(s.body[bi], e.pos) <= 1) return { t: 'steal', seg: seg.uid, reach: 1 };
    }
    const targets = s.body.filter((_, bi) => bi > 0 && s.segs[bi - 1]?.item);
    return approach(f, e, targets.length ? targets : s.body, 2, true);
  },
});

defineEnemy({
  kind: 'ant',
  name: 'Ant',
  char: 'a',
  hp: 1,
  glyph: 'ant',
  color: '#c0392b',
  text: 'Weak alone, never alone. Latches onto adjacent segments. A big coil catches a whole column of them.',
  think(f, e) {
    return lockAdjacent(f, e) ?? approach(f, e, f.snake.body);
  },
});

defineEnemy({
  kind: 'tortoise',
  name: 'Tortoise',
  char: 't',
  hp: 5,
  glyph: 'tortoise',
  color: '#7a8b5c',
  text: 'Its shell shrugs off bites entirely. Slow. Only constriction (or poison) can hurt it.',
  onBitten: () => true,
  think(f, e) {
    e.mem.tick = (e.mem.tick ?? 0) + 1;
    const l = lockAdjacent(f, e, 2);
    if (l) return l;
    return e.mem.tick % 2 === 0 ? { t: 'wait' } : approach(f, e, f.snake.body);
  },
});

defineEnemy({
  kind: 'wasp',
  name: 'Wasp',
  char: 'v',
  hp: 1,
  glyph: 'wasp',
  color: '#f9c74f',
  text: 'Fast and flying. Ignores your body and stings the tile where your head is. Dodge by moving your head.',
  flies: true,
  think(f, e) {
    const h = ops.head(f);
    if (chebyshev(e.pos, h) <= 2 && (e.mem.cd ?? 0) === 0) {
      e.mem.cd = 1;
      return { t: 'strike', tiles: [{ ...h }], dmg: 1 };
    }
    if (e.mem.cd) e.mem.cd--;
    return approach(f, e, [h], 2, true);
  },
});

defineEnemy({
  kind: 'queen',
  name: 'Ant Queen',
  char: 'Q',
  hp: 18,
  glyph: 'queen',
  color: '#e74c3c',
  text: 'Boss. Huge and slow. Summons ants around herself every few turns and bites hard. Only a coil of 8 tiles or less can hold her.',
  boss: true,
  heldMaxArea: 8,
  think(f, e) {
    e.mem.t = (e.mem.t ?? 0) + 1;
    const l = lockAdjacent(f, e, 2);
    if (l) return l;
    if (e.mem.t % 4 === 1) {
      const tiles = DIRS.map((d) => step(e.pos, d)).filter((p) => ops.isEmpty(f, p)).slice(0, e.hp < 9 ? 3 : 2);
      if (tiles.length) return { t: 'summon', kind: 'ant', tiles };
    }
    return e.mem.t % 2 === 0 ? approach(f, e, f.snake.body) : { t: 'wait' };
  },
});

defineEnemy({
  kind: 'glowworm',
  name: 'Glowworm',
  char: 'g',
  hp: 2,
  glyph: 'glowworm',
  color: '#b8f2e6',
  text: 'Drifts through the dark and spits light along a line of 4 tiles when lined up with your head.',
  think(f, e) {
    const h = ops.head(f);
    if ((e.mem.cd ?? 0) > 0) {
      e.mem.cd--;
      return retreat(f, e, h);
    }
    if ((h.x === e.pos.x || h.y === e.pos.y) && manhattan(h, e.pos) <= 4) {
      const d = dirTo(e.pos, h);
      const tiles: Pos[] = [];
      let p = e.pos;
      for (let i = 0; i < 4; i++) {
        p = step(p, d);
        if (ops.isSolid(f, p)) break;
        tiles.push(p);
      }
      e.mem.cd = 2;
      return { t: 'strike', tiles, dmg: 1 };
    }
    return approach(f, e, [h]);
  },
});

/** Shared brain for enemy snakes. */
function snakeThink(f: Fight, e: Enemy, opts: { sever: boolean; hunt: 'tail' | 'body' }): Intent {
  const s = f.snake;
  // Bite an adjacent segment (never the head: it prefers to cut you).
  const adj = adjacentParts(f, e.pos).filter((x) => x.bi > 0);
  if (adj.length) {
    const t = adj.sort((a, b) => a.bi - b.bi)[0];
    return { t: 'lock', seg: t.uid, dmg: 1, sever: opts.sever, windup: 1, reach: 1 };
  }
  const h = ops.head(f);
  const nearFood = f.food.filter((p) => manhattan(p, e.pos) < manhattan(h, e.pos));
  if (nearFood.length && e.hp < e.maxHp + 4) return approach(f, e, nearFood);
  const goals = opts.hunt === 'tail' ? [s.body[s.body.length - 1]] : s.body.slice(1);
  return approach(f, e, goals.length ? goals : s.body);
}

defineEnemy({
  kind: 'rival',
  name: 'Rival Snake',
  char: 'R',
  hp: 7,
  glyph: 'rival',
  color: '#e056fd',
  text: 'Another snake, playing by your rules. Its length is its health. Bite into its body to cut it in two — the severed part becomes husks you can eat. It eats food to regrow.',
  snake: true,
  think: (f, e) => snakeThink(f, e, { sever: false, hunt: 'body' }),
});

defineEnemy({
  kind: 'ouroboros',
  name: 'The Ouroboros',
  char: 'U',
  hp: 22,
  glyph: 'ouroboros',
  color: '#ffbe0b',
  text: 'Final boss. An ancient serpent that hunts your tail and severs what it bites. Its length is its health — cut it down, eat what falls, and do not let it close its circle around you.',
  snake: true,
  boss: true,
  heldMaxArea: 6,
  think(f, e) {
    e.mem.t = (e.mem.t ?? 0) + 1;
    if (e.mem.t % 6 === 0) {
      const tiles = DIRS.map((d) => step(e.pos, d)).filter((p) => ops.isEmpty(f, p)).slice(0, 1);
      if (tiles.length) return { t: 'summon', kind: 'glowworm', tiles };
    }
    return snakeThink(f, e, { sever: true, hunt: 'tail' });
  },
});

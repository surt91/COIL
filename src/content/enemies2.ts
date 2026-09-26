/** Act 2 ("The Roots") and Act 3 ("The Deep") enemies. */
import { DIRS, Pos, chebyshev, dirTo, eq, manhattan, step } from '../core/geom';
import { bossExposed, forcedStep, gorges, protectedSeg } from '../core/fight';
import * as ops from '../core/ops';
import { defineEnemy, enemyDef } from '../core/registry';
import { shuffle } from '../core/rng';
import type { Enemy, Fight, Intent } from '../core/types';
import { approach, lockAdjacent, predictHead, retreat } from './ai';

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
  text: 'Flies over your body and steals the item from an adjacent segment, then flees. Kill it within 3 turns to get the item back — or it escapes with it.',
  flies: true,
  think(f, e) {
    if (e.carry) {
      // Escapes with the loot after a few turns.
      e.mem.fleeing = (e.mem.fleeing ?? 0) + 1;
      if (e.mem.fleeing > 3) {
        e.hp = 0;
        e.mem.escaped = 1;
        return { t: 'wait' };
      }
      return retreat(f, e, ops.head(f), true);
    }
    const s = f.snake;
    for (let bi = 1; bi < s.body.length; bi++) {
      const seg = s.segs[bi - 1];
      if (seg.item && chebyshev(s.body[bi], e.pos) <= 1 && !protectedSeg(f, seg.uid)) return { t: 'steal', seg: seg.uid, reach: 1 };
    }
    const targets = s.body.filter((_, bi) => bi > 0 && s.segs[bi - 1]?.item && !protectedSeg(f, s.segs[bi - 1].uid));
    return approach(f, e, targets.length ? targets : s.body, 2, true);
  },
});

defineEnemy({
  kind: 'ant',
  name: 'Ant',
  char: 'a',
  hp: 1,
  glyph: 'ant',
  color: '#b5651d',
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
  text: 'Its shell turns every bite into a scratch: bites deal at most 1. Slow, but bites hard. Constriction and poison work fine.',
  biteCap: 1,
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
  color: '#d9822b',
  text: 'Boss. Huge and slow. Lays ants anywhere within 2 tiles every few turns and bites hard. Only a coil of 8 tiles or less can hold her — and a ring around her walls in her brood. After turn 40 her ants are too small to feed you.',
  boss: true,
  heldMaxArea: 8,
  think(f, e) {
    e.mem.t = (e.mem.t ?? 0) + 1;
    const l = lockAdjacent(f, e, 2);
    if (l) return l;
    const ants = f.enemies.filter((x) => x.kind === 'ant').length;
    if (e.mem.t % 4 === 1 && ants < 5) {
      // Anywhere within 2 tiles: parking next to her doesn't block the brood — only a ring does.
      const near: Pos[] = [];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx || dy) near.push({ x: e.pos.x + dx, y: e.pos.y + dy });
      const reach = new Set(ops.floodFrom(f, e.pos, 2).map((p) => p.y * f.w + p.x));
      const tiles = shuffle(f.rng, near.filter((p) => ops.isEmpty(f, p) && reach.has(p.y * f.w + p.x))).slice(0, e.hp < 9 ? 3 : 2);
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
function snakeThink(f: Fight, e: Enemy, opts: { sever: boolean; hunt: 'tail' | 'body'; reach?: number; gorge?: boolean }): Intent {
  const s = f.snake;
  // A husk-eater goes for husks close by first: a race for what falls.
  if (opts.gorge && e.hp < enemyDef(e.kind).hp) {
    const near = f.husks.filter((hk) => manhattan(hk.pos, e.pos) <= 4).map((hk) => hk.pos);
    const adjacent = DIRS.find((d) => near.some((p) => eq(p, step(e.pos, d))) && gorges(f, e, step(e.pos, d)));
    if (adjacent !== undefined) return { t: 'move', dir: adjacent, steps: 1 };
    const it = near.length ? approach(f, e, near) : null;
    if (it && it.t === 'move') return it;
  }
  // Snakes play by your rules: never wait, and bite by moving into you. (After a landed
  // lunge the engine turns the next one into a plain move: see `gulp` in enemyPhase.)
  // Lunge at a segment in reach, in a straight line (never the head: it prefers to cut you) —
  // The first segment on the line is the one it aims for.
  {
    let best: { bi: number; tiles: Pos[] } | null = null;
    for (const d of DIRS) {
      const tiles: Pos[] = [];
      let p = e.pos;
      for (let i = 0; i < (opts.reach ?? 1); i++) {
        p = step(p, d);
        const bi = ops.bodyIndexAt(f, p);
        if (bi < 0 && !ops.freeForEnemy(f, p)) break;
        tiles.push(p);
        if (bi === 0) break;
        if (bi > 0) {
          // The tail tip's tile empties when you move (unless more of you is still emerging): not worth it.
          const tip = bi === f.snake.body.length - 1 && ops.pending(f) === 0;
          const uid = f.snake.segs[bi - 1].uid;
          if (!tip && !protectedSeg(f, uid) && (!best || bi < best.bi)) best = { bi, tiles: [...tiles] };
          break;
        }
      }
    }
    // Pressed in around its head, a boss's lunge can't sever (shown without ✂).
    if (best) return { t: 'strike', tiles: best.tiles, dmg: 1, lunge: true, sever: opts.sever && !(enemyDef(e.kind).boss && bossExposed(f, e)) };
  }
  const h = ops.head(f);
  const nearFood = f.food.filter((p) => manhattan(p, e.pos) < manhattan(h, e.pos));
  // Hunt the body, not the tail tip (its tile empties as you move): the last few segments, or all of it.
  const n = s.body.length;
  const prey = opts.hunt === 'tail' ? s.body.slice(Math.max(1, n - 4), n - 1) : s.body.slice(1, n - 1);
  // Husk-eaters don't forage: they feed on you (and what falls off you).
  const goals = !opts.gorge && nearFood.length && e.hp < e.maxHp + 4 ? nearFood : prey;
  const it = approach(f, e, goals.length ? goals : s.body);
  if (it.t === 'move') return it;
  // Already there, or no way through: it still has to move somewhere.
  const d = forcedStep(f, e);
  return { t: 'move', dir: d ?? 0, steps: 1 };
}

defineEnemy({
  kind: 'rival',
  name: 'Rival Snake',
  char: 'R',
  hp: 7,
  glyph: 'rival',
  color: '#9aa35f',
  text: 'Another snake, playing by your rules: it never stands still, and bites by lunging into the red tile. Its length is its health. Bite into its body to cut it in two — the severed part becomes husks you can eat. It eats food to regrow.',
  snake: true,
  think: (f, e) => snakeThink(f, e, { sever: false, hunt: 'body' }),
});

defineEnemy({
  kind: 'ouroboros',
  name: 'The Ouroboros',
  char: 'U',
  hp: 28,
  glyph: 'ouroboros',
  color: '#d9d2c3',
  text: 'Final boss. A serpent that plays by your rules: never still, it lunges along the red line and severs what it hits. Its length is its health, and it swallows what it severs from you to regrow; its own cut length crumbles. Its spiny hide cuts back when you bite its body — unless you wrap its head first (or coil it).',
  snake: true,
  boss: true,
  heldMaxArea: 6,
  spikyHide: true,
  eatsHusks: true,
  think: (f, e) => snakeThink(f, e, { sever: true, hunt: 'body', reach: 2, gorge: true }),
});

defineEnemy({
  kind: 'grub',
  name: 'Brood Grub',
  char: 'c',
  hp: 2,
  glyph: 'grub',
  color: '#b9a58c',
  text: 'Fat, slow and full of brood. Kill it any way but crushing and it bursts into two Grublings. Coil it — what you crush, you swallow whole.',
  think(f, e) {
    e.mem.tick = (e.mem.tick ?? 0) + 1;
    const l = lockAdjacent(f, e);
    if (l) return l;
    return e.mem.tick % 2 === 0 ? { t: 'wait' } : approach(f, e, f.snake.body);
  },
  onDie(f, e, cause) {
    if (cause === 'crush' || cause === 'swallow') return;
    const free = shuffle(f.rng, DIRS.map((d) => step(e.pos, d)).filter((p) => ops.freeForEnemy(f, p, false) && !ops.enemyAt(f, p)));
    for (const p of free.slice(0, 2)) {
      const g = ops.spawnEnemy(f, 'grubling', p);
      g.intent = lockAdjacent(f, g) ?? { t: 'wait' };
      ops.emit(f, { t: 'spawn', enemy: g.id, at: { ...p } });
    }
  },
});

defineEnemy({
  kind: 'grubling',
  name: 'Grubling',
  char: 'i',
  hp: 1,
  glyph: 'grubling',
  color: '#a8927a',
  text: 'Freshly hatched and hungry. Latches onto adjacent segments. Too small to feed you.',
  meagre: true,
  think(f, e) {
    return lockAdjacent(f, e) ?? approach(f, e, f.snake.body);
  },
});

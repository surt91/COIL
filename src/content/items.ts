import { computeCoils } from '../core/coil';
import { doMove, legalMoves, moveOutcome } from '../core/fight';
import { DIRS, Dir, Pos, chebyshev, dirTo, eq, manhattan, neighbors4, step } from '../core/geom';
import * as ops from '../core/ops';
import { defineItem } from '../core/registry';
import { pick } from '../core/rng';
import type { Enemy, Fight } from '../core/types';

const segPosAt = (f: Fight, k: number): Pos | null => (k + 1 < f.snake.body.length ? f.snake.body[k + 1] : null);

/** First enemy on the straight line from the head, up to n tiles, blocked by terrain and body. */
function firstInLine(f: Fight, d: Dir, n: number): Enemy | null {
  let p = ops.head(f);
  for (let i = 0; i < n; i++) {
    p = step(p, d);
    if (ops.isSolid(f, p) || !ops.inBounds(f, p)) return null;
    const e = ops.enemyAt(f, p);
    if (e) return e;
    if (ops.bodyIndexAt(f, p) >= 0) return null;
  }
  return null;
}

const firstStepOk = (f: Fight, d?: Dir) => {
  if (d === undefined || !legalMoves(f).includes(d)) return false;
  return moveOutcome(f, d).k !== 'body';
};

function absorbOnHit(f: Fight, k: number) {
  const p = segPosAt(f, k) ?? ops.head(f);
  f.snake.segs[k].item = null;
  ops.emit(f, { t: 'absorb', at: p });
  return true;
}

function spineOnHit(f: Fight, _k: number, src: Enemy | null) {
  if (src) ops.damageEnemy(f, src, 2, 'spine');
  return false;
}

function spineBurst(f: Fight) {
  for (const e of f.enemies) {
    if (f.snake.body.some((b) => manhattan(b, e.pos) === 1)) ops.damageEnemy(f, e, 1, 'spine');
  }
}

function crushNow(f: Fight, extra = 0) {
  const bonus = ops.bodyBonus(f, 'crushBonus');
  for (const c of computeCoils(f)) {
    for (const e of f.enemies) {
      if (c.tiles.some((t) => eq(t, e.pos))) ops.damageEnemy(f, e, Math.max(c.crush, 1) + bonus + extra, 'crush');
    }
    ops.emit(f, { t: 'coil', tiles: c.tiles });
  }
}

// ---------------------------------------------------------------- starters & commons

defineItem({
  id: 'lunge',
  name: 'Lunge',
  glyph: 'lunge',
  color: '#4cc9f0',
  rarity: 'starter',
  activeText: 'Move: dash 2 tiles straight. The second step bites for +1.',
  active: {
    target: 'dir',
    move: true,
    canPlay: (f, a) => firstStepOk(f, a.dir),
    play(f, a) {
      if (doMove(f, a.dir!) && f.status === 'play' && legalMoves(f).includes(a.dir!) && moveOutcome(f, a.dir!).k !== 'body')
        doMove(f, a.dir!, 1);
    },
  },
});

defineItem({
  id: 'fang',
  name: 'Fang',
  glyph: 'fang',
  color: '#f1faee',
  rarity: 'starter',
  activeText: 'Your next bite this turn deals +2.',
  active: { target: 'none', play: (f) => void (f.buffs.bite += 2) },
});

defineItem({
  id: 'scale',
  name: 'Scale',
  glyph: 'scale',
  color: '#90e0ef',
  rarity: 'starter',
  passiveText: 'Absorbs a hit on this segment (then becomes flesh).',
  activeText: 'Absorb the next hit anywhere this turn.',
  onHit: absorbOnHit,
  active: { target: 'none', play: (f) => void f.buffs.absorb++ },
});

defineItem({
  id: 'venom',
  name: 'Venom Sac',
  glyph: 'venom',
  color: '#80ed99',
  rarity: 'common',
  passiveText: 'Enemies next to this segment get 1 poison each turn.',
  activeText: 'Spit: the first enemy in line (4 tiles) gets 3 poison.',
  bodyPhase(f, k) {
    const p = segPosAt(f, k);
    if (!p) return;
    for (const e of f.enemies) if (manhattan(e.pos, p) === 1) e.poison++;
  },
  active: {
    target: 'dir',
    canPlay: (f, a) => a.dir !== undefined && !!firstInLine(f, a.dir, 4),
    play(f, a) {
      const e = firstInLine(f, a.dir!, 4);
      if (e) e.poison += 3;
    },
  },
});

defineItem({
  id: 'spine',
  name: 'Spine',
  glyph: 'spine',
  color: '#e9c46a',
  rarity: 'common',
  passiveText: 'Enemies that hit this segment take 2 damage.',
  activeText: 'Every enemy next to your body takes 1.',
  onHit: spineOnHit,
  active: { target: 'none', play: spineBurst },
});

defineItem({
  id: 'heart',
  name: 'Heart',
  glyph: 'heart',
  color: '#ff6b9a',
  rarity: 'uncommon',
  passiveText: 'Every 6 turns, grow 1 flesh.',
  activeText: 'Grow 3 flesh.',
  bodyPhase(f) {
    if (f.turn % 6 === 5) ops.addSeg(f, null, 'tail');
  },
  active: {
    target: 'none',
    play(f) {
      for (let i = 0; i < 3; i++) ops.addSeg(f, null, 'tail');
      ops.emit(f, { t: 'grow', n: 3 });
    },
  },
});

defineItem({
  id: 'muscle',
  name: 'Muscle',
  glyph: 'muscle',
  color: '#c77dff',
  rarity: 'common',
  passiveText: 'Your coils crush for +1.',
  activeText: 'Crush every coiled enemy right now.',
  crushBonus: 1,
  active: { target: 'none', play: (f) => crushNow(f) },
});

defineItem({
  id: 'reverse',
  name: 'Reverse',
  glyph: 'reverse',
  color: '#ffd166',
  rarity: 'common',
  activeText: 'Swap head and tail. Your hand changes!',
  active: {
    target: 'none',
    canPlay: (f) => ops.pending(f) === 0 && f.snake.body.length > 3,
    play(f) {
      const s = f.snake;
      s.body.reverse();
      s.segs.reverse();
      s.dir = dirTo(s.body[1], s.body[0]);
    },
  },
});

defineItem({
  id: 'shed',
  name: 'Shed Skin',
  glyph: 'shed',
  color: '#adb5bd',
  rarity: 'common',
  activeText: 'Your last 3 segments fall off as husks (walls you can eat back).',
  active: {
    target: 'none',
    canPlay: (f) => f.snake.segs.length >= 1,
    play(f) {
      ops.sever(f, Math.max(0, f.snake.body.length - 1 - 3));
    },
  },
});

defineItem({
  id: 'rattle',
  name: 'Rattle',
  glyph: 'rattle',
  color: '#f4a261',
  rarity: 'common',
  activeText: 'Enemies within 3 tiles of your head lose their intent.',
  active: {
    target: 'none',
    play(f) {
      const h = ops.head(f);
      for (const e of f.enemies) if (chebyshev(e.pos, h) <= 3) e.intent = { t: 'wait' };
      ops.emit(f, { t: 'msg', text: 'Rattle!' });
    },
  },
});

defineItem({
  id: 'tailwhip',
  name: 'Tail Whip',
  glyph: 'tailwhip',
  color: '#e76f51',
  rarity: 'common',
  activeText: 'Your tail tip deals 2 to every enemy around it.',
  active: {
    target: 'none',
    play(f) {
      const s = f.snake;
      const tip = s.body[s.body.length - 1];
      ops.emit(f, { t: 'strike', enemy: 0, tiles: neighbors4(tip) });
      for (const e of f.enemies) if (chebyshev(e.pos, tip) === 1) ops.damageEnemy(f, e, 2, 'tail whip');
    },
  },
});

defineItem({
  id: 'swallow',
  name: 'Swallow',
  glyph: 'swallow',
  color: '#06d6a0',
  rarity: 'uncommon',
  activeText: 'Swallow an adjacent enemy with ≤2 HP whole: +2 flesh.',
  active: {
    target: 'dir',
    canPlay(f, a) {
      if (a.dir === undefined) return false;
      const e = ops.enemyAt(f, step(ops.head(f), a.dir));
      return !!e && e.hp <= 2;
    },
    play(f, a) {
      const e = ops.enemyAt(f, step(ops.head(f), a.dir!))!;
      ops.damageEnemy(f, e, e.hp, 'swallow');
      ops.addSeg(f, null, 'tail');
      ops.addSeg(f, null, 'tail');
      f.hunger = 0;
      ops.emit(f, { t: 'eat', at: { ...e.pos }, what: 'enemy' });
    },
  },
});

defineItem({
  id: 'molt',
  name: 'Molt',
  glyph: 'molt',
  color: '#dee2e6',
  rarity: 'rare',
  activeText: 'Leave your current shape behind as a husk-skin for 2 turns.',
  active: {
    target: 'none',
    play(f) {
      for (const p of f.snake.body.slice(1)) f.husks.push({ pos: { ...p }, item: null, ttl: 3 });
    },
  },
});

defineItem({
  id: 'ouroboros',
  name: 'Ouroboros',
  glyph: 'ouroboros',
  color: '#ffbe0b',
  rarity: 'rare',
  activeText: 'If your tail tip touches your head: every coiled enemy takes 3 extra crush.',
  active: {
    target: 'none',
    canPlay(f) {
      const s = f.snake;
      return s.body.length > 3 && manhattan(s.body[0], s.body[s.body.length - 1]) === 1;
    },
    play: (f) => crushNow(f, 3),
  },
});

defineItem({
  id: 'kinetic',
  name: 'Kinetic Walk',
  glyph: 'kinetic',
  color: '#a0c4ff',
  rarity: 'uncommon',
  activeText: 'Move: take 3 random self-avoiding steps. (A nod to smart kinetic walks.)',
  active: {
    target: 'none',
    move: true,
    canPlay: (f) => DIRS.some((d) => firstStepOk(f, d)),
    play(f) {
      for (let i = 0; i < 3 && f.status === 'play'; i++) {
        const opts = DIRS.filter((d) => {
          const o = moveOutcome(f, d).k;
          return o === 'step' || o === 'food' || o === 'husk';
        });
        if (!opts.length) return;
        doMove(f, pick(f.rng, opts));
      }
    },
  },
});

// ---------------------------------------------------------------- enemy signatures (temporary)

defineItem({
  id: 'carapace',
  name: 'Carapace',
  glyph: 'carapace',
  color: '#b0764a',
  rarity: 'signature',
  passiveText: 'Absorbs a hit on this segment.',
  activeText: 'Absorb the next hit anywhere this turn.',
  onHit: absorbOnHit,
  active: { target: 'none', play: (f) => void f.buffs.absorb++ },
});

defineItem({
  id: 'quill',
  name: 'Quill',
  glyph: 'spine',
  color: '#8a7a6a',
  rarity: 'signature',
  passiveText: 'Enemies that hit this segment take 2 damage.',
  activeText: 'Every enemy next to your body takes 1.',
  onHit: spineOnHit,
  active: { target: 'none', play: spineBurst },
});

defineItem({
  id: 'tongue',
  name: 'Tongue',
  glyph: 'tongue',
  color: '#6aa84f',
  rarity: 'signature',
  activeText: 'The first enemy in line (5 tiles) takes 2.',
  active: {
    target: 'dir',
    canPlay: (f, a) => a.dir !== undefined && !!firstInLine(f, a.dir, 5),
    play(f, a) {
      const e = firstInLine(f, a.dir!, 5);
      if (e) ops.damageEnemy(f, e, 2, 'tongue');
    },
  },
});

defineItem({
  id: 'scythe',
  name: 'Scythe',
  glyph: 'scythe',
  color: '#9bc53d',
  rarity: 'signature',
  activeText: 'Deal 3 to the first enemy within 2 tiles in a direction.',
  active: {
    target: 'dir',
    canPlay: (f, a) => a.dir !== undefined && !!firstInLine(f, a.dir, 2),
    play(f, a) {
      const e = firstInLine(f, a.dir!, 2);
      if (e) ops.damageEnemy(f, e, 3, 'scythe');
    },
  },
});

defineItem({
  id: 'silk',
  name: 'Silk',
  glyph: 'silk',
  color: '#7d6b91',
  rarity: 'signature',
  activeText: 'Spin webs on the 3 tiles in a line from your head. Webs are coil walls.',
  active: {
    target: 'dir',
    play(f, a) {
      let p = ops.head(f);
      for (let i = 0; i < 3; i++) {
        p = step(p, a.dir!);
        if (ops.isEmpty(f, p)) f.webs.push({ ...p });
      }
    },
  },
});

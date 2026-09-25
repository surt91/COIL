import { coilDamage, coiledEnemies, computeCoils, isWrapped, segBorders } from '../core/coil';
import { bossExposed, doMove, legalMoves, moveOutcome, wrapMin } from '../core/fight';
import { DIRS, Dir, Pos, chebyshev, dirTo, key, manhattan, neighbors4, step } from '../core/geom';
import * as ops from '../core/ops';
import { ENEMIES, defineItem, defineUpgrade, item } from '../core/registry';
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
  const k = moveOutcome(f, d).k;
  return k !== 'body' && k !== 'neck';
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

/** Crush every coiled enemy right now (same holding rules as the constrict phase). */
function crushNow(f: Fight, extra = 0) {
  const held = coiledEnemies(f);
  for (const [e, c] of held) ops.damageEnemy(f, e, coilDamage(f, { ...c, crush: Math.max(c.crush, 1) }) + extra, 'crush');
  for (const c of new Set(held.values())) ops.emit(f, { t: 'coil', tiles: c.tiles });
}

/** Coiled (and held) or wrapped. */
const wrapped = (f: Fight, e: Enemy) => coiledEnemies(f).has(e) || isWrapped(f, e, wrapMin(f));

// ---------------------------------------------------------------- starters & commons

defineItem({
  id: 'lunge',
  name: 'Lunge',
  glyph: 'lunge',
  color: '#4cc9f0',
  rarity: 'starter',
  activeText: 'Move: dash 2 tiles straight. The second step bites for +1.',
  active: {
    requires: 'Needs a free tile ahead in that direction.',
    target: 'dir',
    move: true,
    canPlay: (f, a) => firstStepOk(f, a.dir),
    play(f, a) {
      if (doMove(f, a.dir!) && f.status === 'play' && firstStepOk(f, a.dir))
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
  passiveText: 'Absorbs a hit on this segment (then it breaks).',
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
    requires: 'Needs an enemy in a straight line (4 tiles) — pick that direction.',
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
  activeText: 'Grow 2 flesh.',
  bodyPhase(f) {
    if (f.turn % 6 === 5) ops.addSeg(f, null, 'tail');
  },
  active: {
    target: 'none',
    play(f) {
      for (let i = 0; i < 2; i++) ops.addSeg(f, null, 'tail');
      ops.emit(f, { t: 'grow', n: 2 });
    },
  },
});

defineItem({
  id: 'muscle',
  name: 'Muscle',
  glyph: 'muscle',
  color: '#c77dff',
  rarity: 'common',
  passiveText: 'Ring: coils this segment borders crush +1.',
  activeText: 'Crush every coiled enemy right now.',
  ringCrush: 1,
  active: { target: 'none', play: (f) => crushNow(f) },
});

defineItem({
  id: 'reverse',
  name: 'Reverse',
  glyph: 'reverse',
  color: '#ffd166',
  rarity: 'common',
  activeText: 'Swap head and tail: your rearmost items become your hand.',
  active: {
    requires: 'Needs your whole body out of the burrow and at least 3 segments.',
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
    requires: 'Needs an adjacent enemy with 2 HP or less.',
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
  name: 'Ghost Skin',
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
  passiveText: 'While your tail tip touches your head, your coils crush for +2.',
  activeText: 'Every coiled or wrapped enemy takes 4.',
  active: {
    requires: 'Needs a coiled or wrapped enemy.',
    target: 'none',
    canPlay: (f) => f.enemies.some((e) => wrapped(f, e)),
    play(f) {
      for (const e of f.enemies.filter((x) => wrapped(f, x))) ops.damageEnemy(f, e, 4, 'crush');
    },
  },
  bodyPhase(f) {
    const s = f.snake;
    // Implemented as a temporary crush buff for this turn's constrict phase.
    if (s.body.length > 3 && manhattan(s.body[0], s.body[s.body.length - 1]) === 1) f.buffs.crush = (f.buffs.crush ?? 0) + 2;
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
    requires: 'Needs a free tile next to your head.',
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
    requires: 'Needs an enemy in a straight line (5 tiles).',
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
    requires: 'Needs an enemy within 2 tiles in a straight line.',
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

// ---------------------------------------------------------------- more commons / uncommons / rares

defineItem({
  id: 'strike',
  name: 'Coiled Strike',
  glyph: 'strike',
  color: '#ff8fab',
  rarity: 'common',
  activeText: 'Bite an adjacent enemy in any direction for 2 — without moving.',
  active: {
    requires: 'Needs an adjacent enemy.',
    target: 'dir',
    canPlay: (f, a) => a.dir !== undefined && !!ops.enemyAt(f, step(ops.head(f), a.dir)),
    play(f, a) {
      const e = ops.enemyAt(f, step(ops.head(f), a.dir!))!;
      const d = ENEMIES.get(e.kind)!;
      const dmg = Math.min(2 + f.buffs.bite, d.biteCap ?? Infinity);
      ops.damageEnemy(f, e, dmg, 'bite');
      f.buffs.bite = 0;
      ops.emit(f, { t: 'bite', enemy: e.id, at: { ...e.pos }, dmg, killed: e.hp <= 0 });
      // It interrupts like a bite: never snakes, and bosses only while exposed.
      if (e.hp > 0 && !e.body && (!d.boss || bossExposed(f, e))) e.intent = { t: 'wait' };
    },
  },
});

defineItem({
  id: 'sprint',
  name: 'Sprint',
  glyph: 'sprint',
  color: '#90dbf4',
  rarity: 'common',
  activeText: 'Move: slither up to 3 tiles straight ahead.',
  active: {
    requires: 'Needs a free tile ahead in that direction.',
    target: 'dir',
    move: true,
    canPlay: (f, a) => firstStepOk(f, a.dir),
    play(f, a) {
      for (let i = 0; i < 3 && f.status === 'play'; i++) {
        if (!firstStepOk(f, a.dir)) return;
        if (!doMove(f, a.dir!)) return;
      }
    },
  },
});

defineItem({
  id: 'reserve',
  name: 'Fat Reserve',
  glyph: 'reserve',
  color: '#ffc8dd',
  rarity: 'common',
  activeText: 'Grow 2 flesh and reset your hunger.',
  active: {
    target: 'none',
    play(f) {
      ops.addSeg(f, null, 'tail');
      ops.addSeg(f, null, 'tail');
      f.hunger = 0;
      ops.emit(f, { t: 'grow', n: 2 });
    },
  },
});

defineItem({
  id: 'acid',
  name: 'Digestive Acid',
  glyph: 'acid',
  color: '#caffbf',
  rarity: 'uncommon',
  activeText: 'Every enemy in your coils takes 2 and gets 2 poison.',
  active: {
    requires: 'Needs an enemy inside one of your coils.',
    target: 'none',
    canPlay: (f) => coiledEnemies(f).size > 0,
    play(f) {
      for (const e of coiledEnemies(f).keys()) {
        ops.damageEnemy(f, e, 2, 'acid');
        e.poison += 2;
      }
    },
  },
});

defineItem({
  id: 'hood',
  name: 'Cobra Hood',
  glyph: 'hood',
  color: '#ffafcc',
  rarity: 'uncommon',
  activeText: 'Flare: enemies within 2 tiles of your head are pushed back a tile and lose their intent.',
  active: {
    target: 'none',
    play(f) {
      const h = ops.head(f);
      for (const e of f.enemies) {
        if (e.under || chebyshev(e.pos, h) > 2) continue;
        e.intent = { t: 'wait' };
        if (e.body) continue;
        const d = dirTo(h, e.pos);
        const to = step(e.pos, d);
        if (ops.freeForEnemy(f, to)) {
          ops.emit(f, { t: 'knockback', enemy: e.id, from: { ...e.pos }, to });
          e.pos = to;
        }
      }
      ops.emit(f, { t: 'msg', text: 'Hsss!' });
    },
  },
});

defineItem({
  id: 'egg',
  name: 'Egg',
  glyph: 'egg',
  color: '#fefae0',
  rarity: 'uncommon',
  passiveText: 'When this segment is destroyed, it hatches: grow 3 flesh.',
  activeText: 'Grow 1 flesh.',
  onHit(f) {
    for (let i = 0; i < 3; i++) ops.addSeg(f, null, 'tail');
    ops.emit(f, { t: 'grow', n: 3 });
    return false;
  },
  active: { target: 'none', play: (f) => ops.addSeg(f, null, 'tail') },
});

defineItem({
  id: 'gorge',
  name: 'Gorge',
  glyph: 'gorge',
  color: '#ffd166',
  rarity: 'common',
  activeText: 'Suck in all food within 3 tiles of your head: +1 flesh each.',
  active: {
    requires: 'Needs food within 3 tiles of your head.',
    target: 'none',
    canPlay: (f) => f.food.some((p) => manhattan(p, ops.head(f)) <= 3),
    play(f) {
      const h = ops.head(f);
      const near = f.food.filter((p) => manhattan(p, h) <= 3);
      f.food = f.food.filter((p) => manhattan(p, h) > 3);
      for (const p of near) {
        ops.addSeg(f, null, 'tail');
        ops.emit(f, { t: 'eat', at: p, what: 'food' });
      }
      f.hunger = 0;
    },
  },
});

defineItem({
  id: 'python',
  name: 'Python Coils',
  glyph: 'python',
  color: '#b5838d',
  rarity: 'rare',
  passiveText: 'Coils up to 20 tiles count, and they crush for +1.',
  activeText: 'Every coiled enemy takes 2.',
  coilAreaBonus: 8,
  crushBonus: 1,
  active: { target: 'none', play: (f) => crushNow(f, 1) },
});

// ================================================================ upgrades ("molted" items)

const locksFizzle = (f: Fight) => {
  for (const e of f.enemies) if (e.intent.t === 'lock' || e.intent.t === 'steal') e.intent = { t: 'wait' };
};
function allInLine(f: Fight, d: Dir, n: number): Enemy[] {
  const out: Enemy[] = [];
  let p = ops.head(f);
  for (let i = 0; i < n; i++) {
    p = step(p, d);
    if (!ops.inBounds(f, p) || ops.isSolid(f, p)) break;
    const e = ops.enemyAt(f, p);
    if (e && !out.includes(e)) out.push(e);
  }
  return out;
}

defineUpgrade('lunge', {
  name: 'Striking Lunge',
  activeText: 'Move: dash 2 tiles straight, the second step bites for +1. A kill regrows a temporary Lunge behind your head.',
  active: {
    target: 'dir',
    move: true,
    requires: 'Needs a free tile ahead in that direction.',
    canPlay: (f, a) => firstStepOk(f, a.dir),
    play(f, a) {
      const kills = () => f.events.filter((e) => e.t === 'enemyDie').length;
      const k0 = kills();
      if (doMove(f, a.dir!) && f.status === 'play' && firstStepOk(f, a.dir)) doMove(f, a.dir!, 1);
      if (kills() > k0) ops.addSeg(f, 'lunge', 'neck', true);
    },
  },
});

defineUpgrade('fang', {
  name: 'Hollow Fang',
  activeText: 'Your next bite this turn deals +2 and injects 3 poison.',
  active: { target: 'none', play: (f) => { f.buffs.bite += 2; f.buffs.poison = (f.buffs.poison ?? 0) + 3; } },
});

defineUpgrade('scale', {
  name: 'Keeled Scale',
  passiveText: 'Absorbs a hit on this segment, then becomes a regular Scale (two hits in total).',
  activeText: 'Absorb the next 2 hits anywhere this turn.',
  onHit(f, k) {
    const p = segPosAt(f, k) ?? ops.head(f);
    f.snake.segs[k].item = 'scale';
    ops.emit(f, { t: 'absorb', at: p });
    return true;
  },
  active: { target: 'none', play: (f) => void (f.buffs.absorb += 2) },
});

defineUpgrade('venom', {
  name: 'Venom Gland',
  passiveText: 'Enemies next to this segment, diagonals included, get 1 poison each turn.',
  activeText: 'Piercing spit: every enemy in a line (5 tiles) gets 3 poison.',
  bodyPhase(f, k) {
    const p = segPosAt(f, k);
    if (!p) return;
    for (const e of f.enemies) if (chebyshev(e.pos, p) === 1) e.poison++;
  },
  active: {
    target: 'dir',
    requires: 'Needs an enemy in a straight line (5 tiles).',
    canPlay: (f, a) => a.dir !== undefined && allInLine(f, a.dir, 5).length > 0,
    play(f, a) {
      for (const e of allInLine(f, a.dir!, 5)) e.poison += 3;
    },
  },
});

defineUpgrade('spine', {
  name: 'Barbed Spine',
  activeText: 'Every enemy next to your body takes 1 — or 2 if it touches 3 or more of your tiles.',
  active: {
    target: 'none',
    play(f) {
      for (const e of f.enemies) {
        const touch = f.snake.body.filter((b) => chebyshev(b, e.pos) === 1).length;
        if (f.snake.body.some((b) => manhattan(b, e.pos) === 1)) ops.damageEnemy(f, e, touch >= 3 ? 2 : 1, 'spine');
      }
    },
  },
});

defineUpgrade('heart', {
  name: 'Twin Heart',
  activeText: 'Grow 2 flesh, and a temporary Heart regrows at your tail.',
  active: {
    target: 'none',
    play(f) {
      ops.addSeg(f, null, 'tail');
      ops.addSeg(f, null, 'tail');
      ops.addSeg(f, 'heart', 'tail', true);
      ops.emit(f, { t: 'grow', n: 3 });
    },
  },
});

defineUpgrade('muscle', {
  name: 'Sinew',
  passiveText: 'Ring: coils this segment borders crush +1. Wrapping needs one tile less.',
  wrapBonus: 1,
  activeText: 'Crush every coiled or wrapped enemy right now.',
  active: {
    target: 'none',
    play(f) {
      for (const e of f.enemies.filter((x) => wrapped(f, x))) ops.damageEnemy(f, e, 2 + ops.bodyBonus(f, 'crushBonus'), 'crush');
    },
  },
});

defineUpgrade('reverse', {
  name: 'Two-Headed',
  activeText: 'Swap head and tail: your rearmost items become your hand. Every bite locked onto you fizzles.',
  active: {
    target: 'none',
    requires: 'Needs your whole body out of the burrow and at least 3 segments.',
    canPlay: (f) => ops.pending(f) === 0 && f.snake.body.length > 3,
    play(f) {
      const s = f.snake;
      s.body.reverse();
      s.segs.reverse();
      s.dir = dirTo(s.body[1], s.body[0]);
      locksFizzle(f);
    },
  },
});

defineUpgrade('shed', {
  name: 'Clean Shed',
  activeText: 'Your last 4 segments fall off as husks — then 2 fresh flesh grow back.',
  active: {
    target: 'none',
    play(f) {
      ops.sever(f, Math.max(0, f.snake.body.length - 1 - 4));
      ops.addSeg(f, null, 'tail');
      ops.addSeg(f, null, 'tail');
    },
  },
});

defineUpgrade('rattle', {
  name: 'Tail Rattle',
  activeText: 'Enemies within 3 tiles of your head or your tail tip lose their intent.',
  active: {
    target: 'none',
    play(f) {
      const h = ops.head(f), t = f.snake.body[f.snake.body.length - 1];
      for (const e of f.enemies) if (chebyshev(e.pos, h) <= 3 || chebyshev(e.pos, t) <= 3) e.intent = { t: 'wait' };
      ops.emit(f, { t: 'msg', text: 'Rattle!' });
    },
  },
});

defineUpgrade('tailwhip', {
  name: 'Whip Crack',
  activeText: 'Your tail tip deals 2 to every enemy around it and cancels their intents.',
  active: {
    target: 'none',
    play(f) {
      const tip = f.snake.body[f.snake.body.length - 1];
      ops.emit(f, { t: 'strike', enemy: 0, tiles: neighbors4(tip) });
      for (const e of f.enemies)
        if (chebyshev(e.pos, tip) === 1) {
          e.intent = { t: 'wait' };
          ops.damageEnemy(f, e, 2, 'tail whip');
        }
    },
  },
});

defineUpgrade('swallow', {
  name: 'Unhinged Jaw',
  activeText: 'Swallow an adjacent enemy with ≤3 HP whole: +2 flesh, and graft its signature item.',
  active: {
    target: 'dir',
    requires: 'Needs an adjacent enemy with 3 HP or less.',
    canPlay(f, a) {
      if (a.dir === undefined) return false;
      const e = ops.enemyAt(f, step(ops.head(f), a.dir));
      return !!e && e.hp <= 3 && !e.body;
    },
    play(f, a) {
      const e = ops.enemyAt(f, step(ops.head(f), a.dir!))!;
      ops.damageEnemy(f, e, e.hp, 'swallow');
      ops.addSeg(f, null, 'tail');
      ops.addSeg(f, null, 'tail');
      const sig = ENEMIES.get(e.kind)?.signature;
      if (sig) ops.addSeg(f, sig, 'neck', true);
      f.hunger = 0;
      ops.emit(f, { t: 'eat', at: { ...e.pos }, what: 'enemy' });
    },
  },
});

defineUpgrade('molt', {
  name: 'Phantom Skin',
  activeText: 'Leave your shape behind as a husk-skin for 3 turns. Every bite locked onto you fizzles.',
  active: {
    target: 'none',
    play(f) {
      for (const p of f.snake.body.slice(1)) f.husks.push({ pos: { ...p }, item: null, ttl: 4 });
      locksFizzle(f);
    },
  },
});

defineUpgrade('ouroboros', {
  name: 'Worldserpent',
  passiveText: 'While your tail tip touches your head, coils crush +2 and hunger stands still.',
  activeText: 'Every coiled or wrapped enemy takes 4 — or 6 if your tail tip touches your head.',
  bodyPhase(f) {
    const s = f.snake;
    if (s.body.length > 3 && manhattan(s.body[0], s.body[s.body.length - 1]) === 1) {
      f.buffs.crush = (f.buffs.crush ?? 0) + 2;
      f.hunger = Math.max(0, f.hunger - 1);
    }
  },
  active: {
    target: 'none',
    requires: 'Needs a coiled or wrapped enemy.',
    canPlay: (f) => f.enemies.some((e) => wrapped(f, e)),
    play(f) {
      const s = f.snake;
      const loop = s.body.length > 3 && manhattan(s.body[0], s.body[s.body.length - 1]) === 1;
      for (const e of f.enemies.filter((x) => wrapped(f, x))) ops.damageEnemy(f, e, loop ? 6 : 4, 'crush');
    },
  },
});

defineUpgrade('kinetic', {
  name: 'Smart Kinetic Walk',
  activeText: 'Move: take 4 self-avoiding steps that never enter a telegraphed tile and prefer food.',
  active: {
    target: 'none',
    move: true,
    requires: 'Needs a free tile next to your head.',
    canPlay: (f) => DIRS.some((d) => firstStepOk(f, d)),
    play(f) {
      for (let i = 0; i < 4 && f.status === 'play'; i++) {
        const danger = new Set(f.enemies.flatMap((e) => (e.intent.t === 'strike' ? e.intent.tiles : e.intent.t === 'emerge' ? [e.intent.at] : [])).map(key));
        const opts = DIRS.filter((d) => {
          const o = moveOutcome(f, d).k;
          return (o === 'step' || o === 'food' || o === 'husk') && !danger.has(key(step(ops.head(f), d)));
        });
        if (!opts.length) return;
        const food = opts.filter((d) => moveOutcome(f, d).k === 'food');
        doMove(f, pick(f.rng, food.length ? food : opts));
      }
    },
  },
});

defineUpgrade('strike', {
  name: 'Striking Coil',
  activeText: 'Hit the first enemy within 2 tiles in a line for 2 and yank it next to your head. It loses its intent.',
  active: {
    target: 'dir',
    requires: 'Needs an enemy within 2 tiles in a straight line.',
    canPlay: (f, a) => a.dir !== undefined && !!firstInLine(f, a.dir, 2),
    play(f, a) {
      const e = firstInLine(f, a.dir!, 2)!;
      ops.damageEnemy(f, e, 2 + f.buffs.bite, 'bite');
      f.buffs.bite = 0;
      if (e.hp <= 0) return;
      e.intent = { t: 'wait' };
      const to = step(ops.head(f), a.dir!);
      if (!e.body && ops.freeForEnemy(f, to)) {
        ops.emit(f, { t: 'knockback', enemy: e.id, from: { ...e.pos }, to });
        e.pos = to;
      }
    },
  },
});

defineUpgrade('sprint', {
  name: 'Slipstream',
  activeText: 'Move: slither up to 4 tiles straight ahead, tearing through webs.',
  active: {
    target: 'dir',
    move: true,
    requires: 'Needs a free tile ahead in that direction.',
    canPlay: (f, a) => a.dir !== undefined && (firstStepOk(f, a.dir) || ops.webAt(f, step(ops.head(f), a.dir)) >= 0),
    play(f, a) {
      for (let i = 0; i < 4 && f.status === 'play'; i++) {
        const w = ops.webAt(f, step(ops.head(f), a.dir!));
        if (w >= 0) f.webs.splice(w, 1);
        if (!firstStepOk(f, a.dir)) return;
        if (!doMove(f, a.dir!)) return;
      }
    },
  },
});

defineUpgrade('reserve', {
  name: 'Deep Reserve',
  hungerShield: true,
  passiveText: 'When hunger bites, it eats this segment instead of your tail.',
  activeText: 'Grow 2 flesh and reset your hunger.',
});

defineUpgrade('acid', {
  name: 'Stomach Acid',
  activeText: 'Every coiled or wrapped enemy takes 2 and gets 3 poison.',
  active: {
    target: 'none',
    requires: 'Needs a coiled or wrapped enemy.',
    canPlay: (f) => f.enemies.some((e) => wrapped(f, e)),
    play(f) {
      for (const e of f.enemies.filter((x) => wrapped(f, x))) {
        ops.damageEnemy(f, e, 2, 'acid');
        e.poison += 3;
      }
    },
  },
});

defineUpgrade('hood', {
  name: 'Spectacled Hood',
  activeText: 'Flare: enemies within 2 tiles are pushed back and lose their intent. Enemies that can’t be pushed take 2.',
  active: {
    target: 'none',
    play(f) {
      const h = ops.head(f);
      for (const e of f.enemies) {
        if (e.under || chebyshev(e.pos, h) > 2) continue;
        e.intent = { t: 'wait' };
        const to = step(e.pos, dirTo(h, e.pos));
        if (!e.body && ops.freeForEnemy(f, to)) {
          ops.emit(f, { t: 'knockback', enemy: e.id, from: { ...e.pos }, to });
          e.pos = to;
        } else ops.damageEnemy(f, e, 2, 'hood');
      }
      ops.emit(f, { t: 'msg', text: 'HSSS!' });
    },
  },
});

defineUpgrade('egg', {
  name: 'Clutch',
  passiveText: 'When this segment is destroyed, it hatches: grow 3 flesh and a temporary Fang.',
  activeText: 'Grow 2 flesh.',
  onHit(f) {
    for (let i = 0; i < 3; i++) ops.addSeg(f, null, 'tail');
    ops.addSeg(f, 'fang', 'neck', true);
    ops.emit(f, { t: 'grow', n: 3 });
    return false;
  },
  active: { target: 'none', play: (f) => { ops.addSeg(f, null, 'tail'); ops.addSeg(f, null, 'tail'); } },
});

defineUpgrade('gorge', {
  name: 'Bottomless Gorge',
  activeText: 'Suck in all food and husks within 3 tiles: +1 flesh each, and husk items graft back on.',
  active: {
    target: 'none',
    requires: 'Needs food or husks within 3 tiles of your head.',
    canPlay: (f) => f.food.some((p) => manhattan(p, ops.head(f)) <= 3) || f.husks.some((hk) => manhattan(hk.pos, ops.head(f)) <= 3),
    play(f) {
      const h = ops.head(f);
      for (const p of f.food.filter((q) => manhattan(q, h) <= 3)) {
        ops.addSeg(f, null, 'tail');
        ops.emit(f, { t: 'eat', at: p, what: 'food' });
      }
      f.food = f.food.filter((q) => manhattan(q, h) > 3);
      for (const hk of f.husks.filter((q) => manhattan(q.pos, h) <= 3)) {
        ops.addSeg(f, hk.item, hk.item ? 'neck' : 'tail');
        ops.emit(f, { t: 'eat', at: hk.pos, what: 'husk' });
      }
      f.husks = f.husks.filter((q) => manhattan(q.pos, h) > 3);
      f.hunger = 0;
    },
  },
});

defineUpgrade('python', {
  name: 'Reticulated Coils',
  passiveText: 'Coils up to 22 tiles count, and they crush for +1.',
  coilAreaBonus: 10,
  activeText: 'Every coiled or wrapped enemy takes 3.',
  active: {
    target: 'none',
    play(f) {
      for (const e of f.enemies.filter((x) => wrapped(f, x))) ops.damageEnemy(f, e, 3, 'crush');
    },
  },
});

// ---------------------------------------------------------------- arrangement items (genome ring)

/** Index of the first item segment behind segment k (skipping flesh), or -1. */
const nextItemBehind = (f: Fight, k: number) => {
  for (let i = k + 1; i < f.snake.segs.length; i++) if (f.snake.segs[i].item) return i;
  return -1;
};

/** Pull the next n items behind segment index `from` (exclusive) right behind the head. */
function pullBehind(f: Fight, from: number, n: number) {
  const pulled = [];
  let i = from;
  while (pulled.length < n) {
    const j = nextItemBehind(f, i - 1);
    if (j < 0) break;
    pulled.push(f.snake.segs.splice(j, 1)[0]);
    i = j;
  }
  f.snake.segs.unshift(...pulled);
}

/** Knot: a crush kill in a coil this segment borders (or, molted, a wrap kill next to it) copies the tied item. */
function knotKill(wrapToo: boolean) {
  return (f: Fight, k: number, e: Enemy, cause: string) => {
    if (cause !== 'crush') return;
    const coil = computeCoils(f).find((c) => c.tiles.some((t) => t.x === e.pos.x && t.y === e.pos.y));
    const p = f.snake.body[k + 1];
    const ok = coil ? segBorders(f, k, coil.tiles) : wrapToo && !!p && chebyshev(p, e.pos) === 1;
    if (!ok) return;
    const j = nextItemBehind(f, k);
    const tied = j >= 0 ? f.snake.segs[j].item! : null;
    if (!tied || tied.startsWith('knot')) return;
    ops.addSeg(f, tied, 'neck', true);
    ops.emit(f, { t: 'msg', text: `Knot: a copy of ${item(tied).name} grows` });
  };
}

defineItem({
  id: 'knot',
  name: 'Knot',
  glyph: 'knot',
  color: '#b39ddb',
  rarity: 'rare',
  passiveText: 'When an enemy is crushed to death in a coil this segment borders, a temporary copy of the next item behind it grows behind your head.',
  activeText: 'Pull the next item behind this one right behind your head.',
  onEnemyDie: knotKill(false),
  active: {
    target: 'none',
    requires: 'Needs an item behind it.',
    canPlay: (f, a) => nextItemBehind(f, a.seg) >= 0,
    play: (f, a) => pullBehind(f, a.seg, 1),
  },
});

defineUpgrade('knot', {
  name: 'Double Knot',
  passiveText: 'When an enemy is crushed to death in a coil this segment borders — or squeezed to death right next to it — a temporary copy of the next item behind it grows behind your head.',
  activeText: 'Pull the next 2 items behind this one right behind your head.',
  onEnemyDie: knotKill(true),
  active: {
    target: 'none',
    requires: 'Needs an item behind it.',
    canPlay: (f, a) => nextItemBehind(f, a.seg) >= 0,
    play: (f, a) => pullBehind(f, a.seg, 2),
  },
});

defineItem({
  id: 'scute',
  name: 'Scute',
  glyph: 'scute',
  color: '#a8dadc',
  rarity: 'common',
  guardsNeighbours: true,
  passiveText: 'The segments right in front of and behind this one can’t be latched onto, severed or robbed.',
  activeText: 'Every enemy latched onto you lets go.',
  active: {
    target: 'none',
    requires: 'Needs an enemy latched onto you.',
    canPlay: (f) => f.enemies.some((e) => e.intent.t === 'lock' || e.intent.t === 'steal'),
    play: (f) => locksFizzle(f),
  },
});

defineUpgrade('scute', {
  name: 'Armored Scute',
  passiveText: 'The segments right in front of and behind this one can’t be latched onto, severed or robbed. Absorbs one hit on itself, then becomes a regular Scute.',
  onHit(f, k) {
    f.snake.segs[k].item = 'scute';
    ops.emit(f, { t: 'absorb', at: segPosAt(f, k) ?? ops.head(f) });
    return true;
  },
});

/** Heat Pit: bites hit harder on prey held in a coil this segment borders (molted: or wrapped right next to it). */
function heatBonus(wrapToo: boolean) {
  return (f: Fight, k: number, e: Enemy) => {
    const c = coiledEnemies(f).get(e);
    if (c) return segBorders(f, k, c.tiles) ? 2 : 0;
    const p = f.snake.body[k + 1];
    return wrapToo && !!p && chebyshev(p, e.pos) === 1 && isWrapped(f, e, wrapMin(f)) ? 2 : 0;
  };
}

defineItem({
  id: 'heatpit',
  name: 'Heat Pit',
  glyph: 'heatpit',
  color: '#ffcf99',
  rarity: 'common',
  passiveText: 'Your bites deal +2 to enemies held in a coil this segment borders.',
  activeText: 'Your next bite this turn deals +2 and ignores shells and curls.',
  biteBonusVs: heatBonus(false),
  active: {
    target: 'none',
    play(f) {
      f.buffs.bite += 2;
      f.buffs.pierce = 1;
    },
  },
});

defineUpgrade('heatpit', {
  name: 'Labial Pits',
  passiveText: 'Your bites deal +2 to enemies held in a coil this segment borders, or wrapped and touching it.',
  activeText: 'Your next bite this turn deals +3 and ignores shells and curls.',
  biteBonusVs: heatBonus(true),
  active: {
    target: 'none',
    play(f) {
      f.buffs.bite += 3;
      f.buffs.pierce = 1;
    },
  },
});

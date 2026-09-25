import { adjacent, key } from '../core/geom';
import * as ops from '../core/ops';
import { ENEMIES, ITEMS } from '../core/registry';
import type { Fight } from '../core/types';
import { Tile } from '../core/types';

/** Structural invariants that must hold after every action. Returns violation messages. */
export function checkInvariants(f: Fight): string[] {
  const out: string[] = [];
  const s = f.snake;
  if (s.body.length === 0) out.push('empty body');
  if (s.body.length > s.segs.length + 1) out.push(`body.length ${s.body.length} > segs.length+1 ${s.segs.length + 1}`);
  for (let i = 1; i < s.body.length; i++) {
    if (!adjacent(s.body[i - 1], s.body[i])) {
      out.push(`body disconnected at ${i}: (${s.body[i - 1].x},${s.body[i - 1].y})-(${s.body[i].x},${s.body[i].y})`);
      break;
    }
  }
  const seen = new Set<number>();
  for (const p of s.body) {
    if (seen.has(key(p))) { out.push(`body overlaps itself at (${p.x},${p.y})`); break; }
    seen.add(key(p));
    if (!ops.inBounds(f, p)) out.push(`body out of bounds at (${p.x},${p.y})`);
    else if (ops.tileAt(f, p) === Tile.Wall) out.push(`body in wall at (${p.x},${p.y})`);
  }
  const uids = new Set<number>();
  for (const sg of s.segs) {
    if (uids.has(sg.uid)) out.push(`duplicate seg uid ${sg.uid}`);
    uids.add(sg.uid);
    if (sg.item && !ITEMS.has(sg.item)) out.push(`unknown item ${sg.item}`);
  }
  const epos = new Set<number>();
  for (const e of f.enemies) {
    if (e.hp <= 0) out.push(`dead enemy ${e.kind}#${e.id} left on board`);
    const flies = ENEMIES.get(e.kind)?.flies;
    if (!flies && seen.has(key(e.pos))) out.push(`enemy ${e.kind}#${e.id} on body tile (${e.pos.x},${e.pos.y})`);
    if (flies && key(e.pos) === key(s.body[0])) out.push(`flying enemy ${e.kind}#${e.id} on head`);
    if (ops.isSolid(f, e.pos) || ops.tileAt(f, e.pos) === Tile.Exit) out.push(`enemy ${e.kind}#${e.id} in terrain (${e.pos.x},${e.pos.y})`);
    if (epos.has(key(e.pos))) out.push(`two enemies on (${e.pos.x},${e.pos.y})`);
    epos.add(key(e.pos));
  }
  for (const p of f.food) if (seen.has(key(p))) out.push(`food under body at (${p.x},${p.y})`);
  for (const p of f.webs) if (seen.has(key(p))) out.push(`web under body at (${p.x},${p.y})`);
  // Husks under the body are allowed: Ghost Skin leaves the current shape behind as husks.
  if (f.status === 'play' && !f.cleared && f.food.length < f.opts.minFood) out.push(`food ${f.food.length} < minFood`);
  return out;
}

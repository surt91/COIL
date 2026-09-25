import { coiledEnemies, touchCount } from '../core/coil';
import * as ops from '../core/ops';
import type { Fight } from '../core/types';

export interface Tip { id: string; text: string }

const TIPS: { id: string; when(f: Fight): boolean; text: string }[] = [
  { id: 'start', when: (f) => f.turn === 0, text: typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
    ? 'Tap next to your head or swipe to preview a move — it shows exactly what will happen. Tap or swipe the same way again to do it. You can never stand still: every turn, you move.'
    : 'Move with the arrow keys, WASD or by clicking next to your head. You can never stand still — every turn, you move. Hover a tile next to your head to preview the whole turn.' },
  { id: 'hand', when: (f) => f.turn >= 2 && ops.hand(f).length > 0, text: 'The glowing items right behind your head are your hand. Press 1–3 (or tap a card) to play one. Items are ammunition, not health: every item comes back next room, played or not. Only flesh carries over — so spend items freely.' },
  { id: 'lock-item', when: (f) => f.enemies.some((e) => e.intent.t === 'lock' && !!f.snake.segs.find((x) => x.uid === (e.intent as { seg: number }).seg)?.item), text: 'That enemy is going for one of your items — enemies always prefer items. If it’s in your hand, play it now: the attack fizzles and you get its effect. You lose nothing: it comes back next room.' },
  { id: 'lock', when: (f) => f.enemies.some((e) => e.intent.t === 'lock' && !e.intent.sever), text: 'A red reticle: an enemy has latched onto that segment and will bite it after your move — if the segment is still inside the faint red box around the enemy (1 tile, diagonals count). Bite the attacker to knock it back and interrupt it (not if it is pinned against something, and never bosses), or move so the segment slides out of reach.' },
  { id: 'strike', when: (f) => f.enemies.some((e) => e.intent.t === 'strike'), text: 'Red tiles will be struck after your move. Your head can step out of the way — but your body follows into the tiles your head just left.' },
  { id: 'sever', when: (f) => f.enemies.some((e) => e.intent.t === 'lock' && !!e.intent.sever), text: 'A mantis is winding up to SEVER you. Everything behind the cut falls off as husks. Get that segment out of reach (2 tiles), or kill the mantis first. You can eat husks to reattach them.' },
  { id: 'spiky', when: (f) => f.enemies.some((e) => e.kind === 'hedgehog'), text: 'Hedgehogs are spiny: biting one costs you your neck segment, and it curls up. Coil it instead — enclose it with your body.' },
  { id: 'coil', when: (f) => coiledEnemies(f).size > 0, text: 'Coiled! Enemies enclosed by your body (walls help) can’t move or attack and are crushed every turn — and what you crush, you eat. The tighter the coil, the harder the crush: 1 tile = 3 damage, 2–3 = 2, 4–8 = 1, 9–12 = held only. You must keep moving — to keep a coil closed, chase your own tail.' },
  { id: 'wrap', when: (f) => f.enemies.some((e) => !e.under && touchCount(f, e) >= 2), text: 'The violet arcs around an enemy count how many of your tiles touch it (diagonals count). At 4 it is wrapped and squeezed for 1 damage every turn. A fully closed coil is much stronger: coiled enemies can’t move or attack at all.' },
  { id: 'hunger', when: (f) => f.opts.hungerEvery - f.hunger <= 3 && f.status === 'play', text: 'You are getting hungry. If the hunger counter runs out, you lose your tail segment. Eat food, husks or enemies to reset it.' },
  { id: 'web', when: (f) => f.webs.length > 0 || f.enemies.some((e) => e.intent.t === 'web'), text: 'Webs: moving your head into one wastes your move. But webs also count as walls for your coils.' },
  { id: 'cleared', when: (f) => f.cleared && f.status === 'play', text: 'Room cleared! The exits are open. Flesh carries over (your health and currency), so grab food on the way out. Items don’t need saving — they all come back — and every 2 items you played regrow 1 flesh.' },
  { id: 'burrow', when: (f) => ops.pending(f) > 0 && f.turn === 1, text: 'The rest of your body is still in the burrow (+N at your tail). It uncoils onto the board as you move.' },
];

const KEY = 'coil.tips.seen';

function seen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

export function nextTip(f: Fight): Tip | null {
  const s = seen();
  for (const t of TIPS) if (!s.has(t.id) && t.when(f)) return { id: t.id, text: t.text };
  return null;
}

export function markSeen(id: string) {
  const s = seen();
  s.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

export function resetTips() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

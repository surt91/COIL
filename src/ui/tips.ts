import { coiledEnemies, occupiedCoils, touchCount } from '../core/coil';
import { ITEMS } from '../core/registry';
import { coilWithin } from '../core/hints';
import { riposteTile } from '../core/fight';
import * as ops from '../core/ops';
import type { Fight } from '../core/types';

export interface Tip { id: string; text: string }

/** Coils closed so far (career): the pocket cue teaches the first few, then gets out of the way. */
export const COILS_KEY = 'coil.coils';
export const coilsSoFar = () => { try { return Number(localStorage.getItem(COILS_KEY) ?? 0); } catch { return 0; } };
export const showPocket = () => coilsSoFar() < 3;

const TIPS: { id: string; when(f: Fight): boolean; text: string; urgent?: boolean }[] = [
  { id: 'start', when: (f) => f.turn === 0, text: typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
    ? 'Tap or swipe next to your head to preview — again to move. You can never stand still.'
    : 'Arrows or WASD to move — you can never stand still. Hover next to your head to preview.' },
  { id: 'pocket', when: (f) => f.turn >= 1 && showPocket() && !!coilWithin(f), text: 'Violet pocket: close your body around it to trap what’s inside.' },
  { id: 'hand', when: (f) => f.turn >= 5 && ops.hand(f).length > 0, text: 'The numbered items behind your head are your hand (1–3). Spend freely: they all come back next room.' },
  { id: 'lock-item', when: (f) => f.enemies.some((e) => e.intent.t === 'lock' && !!f.snake.segs.find((x) => x.uid === (e.intent as { seg: number }).seg)?.item), text: 'It’s after one of your items. In your hand? Play it now — the bite fizzles.' },
  { id: 'lock', when: (f) => f.enemies.some((e) => e.intent.t === 'lock' && !e.intent.sever), text: 'Red reticle: that segment gets bitten — unless it slides out of the red box, or you bite the attacker first.' },
  { id: 'strike', when: (f) => f.enemies.some((e) => e.intent.t === 'strike'), text: 'Red tiles get struck after your move — and your body follows your head.' },
  { id: 'sever', when: (f) => f.enemies.some((e) => e.intent.t === 'lock' && !!e.intent.sever), text: '✂ Sever: everything behind the cut falls off. Get it out of reach — husks can be eaten back.' },
  { id: 'ring', when: (f) => f.snake.segs.some((x) => x.item && ITEMS.get(x.item)?.ringCrush) && occupiedCoils(f).length > 0, text: 'Ring items only boost coils their own segment touches — wrap prey with that part of you.' },
  { id: 'grub', urgent: true, when: (f) => f.enemies.some((e) => e.kind === 'grub'), text: 'Brood Grub: bitten, it bursts into two. Crush it in a coil instead.' },
  { id: 'riposte', urgent: true, when: (f) => f.enemies.some((e) => !!riposteTile(e)), text: 'Riposte: never bite a boss twice from the same tile. Wrap or coil it to expose it.' },
  { id: 'spiky', when: (f) => f.enemies.some((e) => e.kind === 'hedgehog'), text: 'Spines: biting a hedgehog costs you a segment. Coil it instead.' },
  { id: 'coil', urgent: true, when: (f) => coiledEnemies(f).size > 0, text: 'Coiled! It can’t act, and takes the violet number every turn. Tighter coils crush harder.' },
  { id: 'wrap', when: (f) => f.enemies.some((e) => !e.under && touchCount(f, e) >= 2), text: 'Violet arcs count your tiles touching it. All arcs lit: squeezed every turn.' },
  { id: 'breath', urgent: true, when: (f) => f.snake.segs.length === 0 && !f.cleared && f.status === 'play', text: 'Last breaths: nothing left behind your head. Eat before the pips run out — they never come back this fight.' },
  { id: 'hunger', when: (f) => f.opts.hungerEvery - f.hunger <= 3 && f.status === 'play', text: 'Hungry: when the meter runs out, you lose your tail. Eat something.' },
  { id: 'web', when: (f) => f.webs.length > 0 || f.enemies.some((e) => e.intent.t === 'web'), text: 'Webs cost you a move — but they are walls for your coils.' },
  { id: 'cleared', when: (f) => f.cleared && f.status === 'play', text: 'Cleared! Flesh carries over — grab food on the way out.' },
  { id: 'burrow', when: (f) => ops.pending(f) > 0 && f.turn === 1, text: 'The rest of you is still in the burrow (+N) and follows as you move.' },
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

/** A tip that must be shown right now (it explains what is about to hit you), jumping the queue. */
export function urgentTip(f: Fight): Tip | null {
  const s = seen();
  for (const t of TIPS) if (t.urgent && !s.has(t.id) && t.when(f)) return { id: t.id, text: t.text };
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
    localStorage.removeItem(COILS_KEY);
  } catch {
    /* ignore */
  }
}

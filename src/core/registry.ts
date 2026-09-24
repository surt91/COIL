import type { Dir } from './geom';
import type { Enemy, EnemyKind, Fight, Intent, ItemId } from './types';

export interface PlayArgs {
  dir?: Dir;
  /** Index of the played item's segment in snake.segs (already removed when play runs). */
  seg: number;
}

export interface ItemDef {
  id: ItemId;
  name: string;
  /** Key for the glyph renderer. */
  glyph: string;
  color: string;
  rarity: 'starter' | 'common' | 'uncommon' | 'rare' | 'signature';
  passiveText?: string;
  activeText?: string;
  /** Flat bonus to bite damage while this item is on the body. */
  biteBonus?: number;
  /** Flat bonus to crush damage while this item is on the body. */
  crushBonus?: number;
  /** A hit landed on this segment. Return true to absorb it. */
  onHit?(f: Fight, segIndex: number, source: Enemy | null): boolean;
  /** Runs every body phase for each segment carrying this item. */
  bodyPhase?(f: Fight, segIndex: number): void;
  active?: {
    target: 'none' | 'dir';
    /** The active is the turn's move (ends the turn). */
    move?: boolean;
    /** Additional flesh taken from the tail. */
    extraCost?: number;
    canPlay?(f: Fight, args: PlayArgs): boolean;
    play(f: Fight, args: PlayArgs): void;
  };
}

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  /** Character used in ASCII room layouts. */
  char: string;
  hp: number;
  glyph: string;
  color: string;
  text: string;
  /** Biting it hurts. */
  spiky?: boolean;
  /** Passes over the snake body. */
  flies?: boolean;
  boss?: boolean;
  /** An enemy snake: hp is its length, its body follows its head. */
  snake?: boolean;
  /** Only coils of at most this area hold (and crush) it. */
  heldMaxArea?: number;
  signature?: ItemId;
  /** Choose the next intent. Called at the end of each enemy phase. */
  think(f: Fight, e: Enemy): Intent;
  /** Return true to ignore the bite's damage. */
  onBitten?(f: Fight, e: Enemy): boolean;
  /** Called when a bite happens, after damage. */
  afterBitten?(f: Fight, e: Enemy): void;
}

export const ITEMS = new Map<ItemId, ItemDef>();
export const ENEMIES = new Map<EnemyKind, EnemyDef>();

export function defineItem(d: ItemDef): ItemDef {
  ITEMS.set(d.id, d);
  return d;
}

export function defineEnemy(d: EnemyDef): EnemyDef {
  ENEMIES.set(d.kind, d);
  return d;
}

export function item(id: ItemId): ItemDef {
  const d = ITEMS.get(id);
  if (!d) throw new Error(`unknown item ${id}`);
  return d;
}

export function enemyDef(kind: EnemyKind): EnemyDef {
  const d = ENEMIES.get(kind);
  if (!d) throw new Error(`unknown enemy ${kind}`);
  return d;
}

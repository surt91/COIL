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
  /** Upgraded items point to their base version (and vice versa). */
  base?: ItemId;
  upgrade?: ItemId;
  /** Hunger eats this segment instead of the tail. */
  hungerShield?: boolean;
  /** Fewer touching tiles needed to wrap while on the body. */
  wrapBonus?: number;
  passiveText?: string;
  activeText?: string;
  /** Flat bonus to bite damage while this item is on the body. */
  biteBonus?: number;
  /** Flat bonus to crush damage while this item is on the body. */
  crushBonus?: number;
  /** Larger coils count while this item is on the body. */
  coilAreaBonus?: number;
  /** Ring: bonus crush for coils this segment borders (4-adjacent to a coil tile). */
  ringCrush?: number;
  /** The segments right in front of and behind this one can't be latched onto, severed or robbed. */
  guardsNeighbours?: boolean;
  /** Extra bite damage against a specific enemy (segIndex = this item's segment). */
  biteBonusVs?(f: Fight, segIndex: number, e: Enemy): number;
  /** An enemy just died (any cause); runs for each on-board segment carrying this item. */
  onEnemyDie?(f: Fight, segIndex: number, e: Enemy, cause: string): void;
  /** A hit landed on this segment. Return true to absorb it. */
  onHit?(f: Fight, segIndex: number, source: Enemy | null): boolean;
  /** Runs every body phase for each segment carrying this item. */
  bodyPhase?(f: Fight, segIndex: number): void;
  active?: {
    target: 'none' | 'dir';
    /** The active is the turn's move (ends the turn). */
    move?: boolean;
    /** Shown when it can't be played. */
    requires?: string;
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
  /** Biting its body costs you a segment, unless it is wrapped or coiled (bossExposed). */
  spikyHide?: boolean;
  /** Slithers onto husks and swallows them: +1 hp each, up to its starting hp. */
  eatsHusks?: boolean;
  /** Only coils of at most this area hold (and crush) it. */
  heldMaxArea?: number;
  signature?: ItemId;
  /** Choose the next intent. Called at the end of each enemy phase. */
  think(f: Fight, e: Enemy): Intent;
  /** Bites deal at most this much (shells). */
  biteCap?: number;
  /** Return true to ignore the bite's damage. */
  onBitten?(f: Fight, e: Enemy): boolean;
  /** Called when a bite happens, after damage. */
  afterBitten?(f: Fight, e: Enemy): void;
  /** Called when it dies, before it is removed. */
  onDie?(f: Fight, e: Enemy, cause: string): void;
  /** Too small to feed you: killing it grows no flesh and doesn't reset hunger. */
  meagre?: boolean;
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

/** Charms: passive run-long relics. Fight-side effects read f.charms. */
export interface CharmDef {
  id: string;
  name: string;
  text: string;
  glyph: string;
  color: string;
  /** Where it can drop. */
  pool: 'common' | 'boss' | 'species';
  biteBonus?: number;
  crushBonus?: number;
  coilAreaBonus?: number;
  /** Fewer touching tiles needed to wrap. */
  wrapBonus?: number;
  /** Extra turns before hunger bites. */
  hungerBonus?: number;
  /** Extra flesh you may carry between rooms. */
  fleshCapBonus?: number;
  tuckBonus?: number;
  /** Your bites never interrupt (no knockback). */
  noInterrupt?: boolean;
  /** More genome items grow per room. */
  drawBonus?: number;
  /** Poison applied by each bite. */
  bitePoison?: number;
  /** Extra bite damage against enemies with at least 3 HP. */
  toughBite?: number;
  fightStart?(f: Fight): void;
  /** An enemy died (after the killing blow). */
  onKill?(f: Fight, e: Enemy, cause: string): void;
  onEatHusk?(f: Fight): void;
}

export const CHARMS = new Map<string, CharmDef>();
export function defineCharm(d: CharmDef): CharmDef {
  CHARMS.set(d.id, d);
  return d;
}
export const charmSum = (ids: readonly string[] | undefined, field: 'biteBonus' | 'crushBonus' | 'coilAreaBonus' | 'wrapBonus' | 'hungerBonus' | 'fleshCapBonus' | 'tuckBonus' | 'toughBite' | 'bitePoison' | 'drawBonus') =>
  (ids ?? []).reduce((a, id) => a + (CHARMS.get(id)?.[field] ?? 0), 0);

/** Define the upgraded version of an item; unspecified fields are inherited. */
export function defineUpgrade(baseId: ItemId, d: Partial<ItemDef> & { name: string }): ItemDef {
  const b = item(baseId);
  const up: ItemDef = { ...b, ...d, id: `${baseId}+`, base: baseId, upgrade: undefined };
  if (d.active === undefined && b.active) up.active = b.active;
  b.upgrade = up.id;
  ITEMS.set(up.id, up);
  return up;
}

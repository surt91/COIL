import type { Dir, Pos } from './geom';
import type { Rng } from './rng';

export type ItemId = string;
export type EnemyKind = string;

/** A body segment. `uid` 0 is reserved for the head. */
export interface Seg {
  uid: number;
  item: ItemId | null;
  /** Temporary items (eaten from enemies) digest into flesh at room end. */
  temp?: boolean;
}

/**
 * body[0] is the head, body[i] is the position of segs[i-1].
 * segs.length may exceed body.length - 1: the surplus is "pending" — still in
 * the burrow at room start, or freshly grown — and appears at the tail as the
 * snake moves.
 */
export interface Snake {
  body: Pos[];
  segs: Seg[];
  dir: Dir;
}

export type Intent =
  | { t: 'wait' }
  /** `chase`: steps after the first re-path toward the snake. */
  | { t: 'move'; dir: Dir; steps: number; chase?: boolean }
  | { t: 'strike'; tiles: Pos[]; dmg: number }
  /** Latches onto a segment (uid). Lands if the segment is within `reach` (Chebyshev) at resolution. */
  | { t: 'lock'; seg: number; dmg: number; sever?: boolean; windup: number; reach: number }
  | { t: 'web'; tiles: Pos[] }
  | { t: 'burrow' }
  | { t: 'emerge'; at: Pos; dmg: number }
  | { t: 'steal'; seg: number; reach: number }
  | { t: 'summon'; kind: EnemyKind; tiles: Pos[] };

export interface Enemy {
  id: number;
  kind: EnemyKind;
  pos: Pos;
  hp: number;
  maxHp: number;
  intent: Intent;
  poison: number;
  held: boolean;
  /** Free-form per-enemy memory (cooldowns, phases). */
  mem: Record<string, number>;
  /** Underground (moles): untargetable, invisible to coils. */
  under?: boolean;
  /** Item stolen from the snake (magpies); returned on death. */
  carry?: ItemId;
  /** Escalation spawns and summons: not required to clear the room. */
  minion?: boolean;
  /** Enemy snakes: body tiles behind the head (e.pos). hp = 1 + body.length. */
  body?: Pos[];
}

export interface Husk {
  pos: Pos;
  item: ItemId | null;
  ttl: number;
}

export const Tile = {
  Floor: 0,
  Wall: 1,
  Exit: 2,
  Burrow: 3,
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

export type FightStatus = 'play' | 'won' | 'dead';

export interface Fight {
  w: number;
  h: number;
  tiles: Tile[];
  food: Pos[];
  husks: Husk[];
  webs: Pos[];
  enemies: Enemy[];
  snake: Snake;
  turn: number;
  /** Turns since the snake last ate. */
  hunger: number;
  cleared: boolean;
  status: FightStatus;
  tuckUsed: boolean;
  /** Per-turn buffs from played items. */
  buffs: { bite: number; absorb: number; crush?: number };
  nextId: number;
  rng: Rng;
  /** The start burrow; its mouth is safe while the snake is still emerging. */
  entry?: Pos;
  /** Tiles the escalation spawner uses. */
  spawns: Pos[];
  /** Events produced by the last action (consumed by the renderer). */
  events: GameEvent[];
  /** Options for this fight. */
  opts: FightOpts;
  /** Run charms active in this fight. */
  charms?: string[];
  /** Hits absorbed anywhere (charms), persists across turns. */
  shield?: number;
  /** Tucks used this turn. */
  tucks?: number;
  /** Items played this room. */
  played?: number;
  /** Items destroyed without being played this room. */
  wasted?: number;
}

export interface FightOpts {
  hungerEvery: number;
  escalateFrom: number;
  escalateEvery: number;
  minFood: number;
}

export type Action =
  | { t: 'move'; dir: Dir }
  | { t: 'play'; slot: number; dir?: Dir }
  | { t: 'tuck' };

export type GameEvent =
  | { t: 'move'; from: Pos; to: Pos }
  | { t: 'eat'; at: Pos; what: 'food' | 'husk' | 'enemy' }
  | { t: 'grow'; n: number }
  | { t: 'bite'; enemy: number; at: Pos; dmg: number; killed: boolean }
  | { t: 'knockback'; enemy: number; from: Pos; to: Pos }
  | { t: 'enemyMove'; enemy: number; from: Pos; to: Pos }
  | { t: 'enemyHurt'; enemy: number; at: Pos; dmg: number; cause: string }
  | { t: 'enemyDie'; enemy: number; at: Pos; kind: EnemyKind }
  | { t: 'strike'; enemy: number; tiles: Pos[] }
  | { t: 'segLost'; at: Pos; item: ItemId | null; cause: string }
  | { t: 'absorb'; at: Pos }
  | { t: 'sever'; at: Pos; n: number }
  | { t: 'fizzle'; enemy: number }
  | { t: 'coil'; tiles: Pos[] }
  | { t: 'play'; item: ItemId }
  | { t: 'webbed'; at: Pos }
  | { t: 'spawn'; enemy: number; at: Pos }
  | { t: 'hunger'; at: Pos }
  | { t: 'cleared' }
  | { t: 'exit' }
  | { t: 'death'; cause: string }
  | { t: 'steal'; enemy: number; at: Pos; item: ItemId }
  | { t: 'burrow'; enemy: number; at: Pos }
  | { t: 'emerge'; enemy: number; at: Pos }
  | { t: 'msg'; text: string };

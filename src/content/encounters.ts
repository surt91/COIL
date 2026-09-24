export type Pool = 'easy' | 'normal' | 'elite' | 'boss';

export interface Encounter {
  id: string;
  act: number;
  pool: Pool;
  enemies: string[];
  /** Restrict to certain layouts (e.g. boss arenas). */
  layouts?: string[];
}

export const ENCOUNTERS: Encounter[] = [
  // Act 1 — The Garden
  { id: 'lone-beetle', act: 0, pool: 'easy', enemies: ['beetle'] },
  { id: 'beetle-pair', act: 0, pool: 'easy', enemies: ['beetle', 'beetle'] },
  { id: 'frog', act: 0, pool: 'easy', enemies: ['frog'] },
  { id: 'hedgehog', act: 0, pool: 'easy', enemies: ['hedgehog'] },

  { id: 'beetles-frog', act: 0, pool: 'normal', enemies: ['beetle', 'beetle', 'frog'] },
  { id: 'hedgehog-beetle', act: 0, pool: 'normal', enemies: ['hedgehog', 'beetle', 'beetle'] },
  { id: 'mantis', act: 0, pool: 'normal', enemies: ['mantis', 'beetle'] },
  { id: 'spiders', act: 0, pool: 'normal', enemies: ['spider', 'spider', 'beetle'] },
  { id: 'frog-pond', act: 0, pool: 'normal', enemies: ['frog', 'frog', 'hedgehog'] },

  { id: 'mantis-court', act: 0, pool: 'elite', enemies: ['mantis', 'mantis', 'beetle'] },
  { id: 'spiny-web', act: 0, pool: 'elite', enemies: ['hedgehog', 'hedgehog', 'spider'] },
  { id: 'swarm', act: 0, pool: 'elite', enemies: ['beetle', 'beetle', 'beetle', 'beetle', 'frog'] },

  { id: 'mongoose', act: 0, pool: 'boss', enemies: ['mongoose'], layouts: ['mongoose-den'] },
];

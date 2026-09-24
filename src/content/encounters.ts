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

  { id: 'beetles-frog', act: 0, pool: 'normal', enemies: ['beetle', 'beetle', 'beetle', 'frog'] },
  { id: 'hedgehog-beetle', act: 0, pool: 'normal', enemies: ['hedgehog', 'beetle', 'beetle'] },
  { id: 'mantis', act: 0, pool: 'normal', enemies: ['mantis', 'beetle', 'beetle'] },
  { id: 'spiders', act: 0, pool: 'normal', enemies: ['spider', 'spider', 'beetle', 'beetle'] },
  { id: 'frog-pond', act: 0, pool: 'normal', enemies: ['frog', 'frog', 'hedgehog', 'beetle'] },

  { id: 'mantis-court', act: 0, pool: 'elite', enemies: ['mantis', 'mantis', 'beetle', 'beetle'] },
  { id: 'spiny-web', act: 0, pool: 'elite', enemies: ['hedgehog', 'hedgehog', 'spider', 'frog'] },
  { id: 'swarm', act: 0, pool: 'elite', enemies: ['beetle', 'beetle', 'beetle', 'beetle', 'frog'] },

  { id: 'mongoose', act: 0, pool: 'boss', enemies: ['mongoose'], layouts: ['mongoose-den'] },

  // Act 2 — The Roots
  { id: 'moles', act: 1, pool: 'easy', enemies: ['mole', 'beetle'] },
  { id: 'ant-line', act: 1, pool: 'easy', enemies: ['ant', 'ant', 'ant', 'ant'] },
  { id: 'magpie', act: 1, pool: 'easy', enemies: ['magpie', 'beetle'] },

  { id: 'tortoise', act: 1, pool: 'normal', enemies: ['tortoise', 'ant', 'ant', 'ant'] },
  { id: 'mole-pack', act: 1, pool: 'normal', enemies: ['mole', 'mole', 'frog'] },
  { id: 'thieves', act: 1, pool: 'normal', enemies: ['magpie', 'magpie', 'hedgehog'] },
  { id: 'root-mantis', act: 1, pool: 'normal', enemies: ['mantis', 'mole', 'ant', 'ant'] },
  { id: 'web-roots', act: 1, pool: 'normal', enemies: ['spider', 'tortoise', 'beetle'] },

  { id: 'rival', act: 1, pool: 'elite', enemies: ['rival', 'ant', 'ant'] },
  { id: 'tortoise-pair', act: 1, pool: 'elite', enemies: ['tortoise', 'tortoise', 'magpie'] },
  { id: 'underground', act: 1, pool: 'elite', enemies: ['mole', 'mole', 'mole', 'mantis'] },

  { id: 'queen', act: 1, pool: 'boss', enemies: ['queen'], layouts: ['queen-hall'] },

  // Act 3 — The Deep
  { id: 'glow', act: 2, pool: 'easy', enemies: ['glowworm', 'glowworm', 'ant', 'ant'] },
  { id: 'wasps', act: 2, pool: 'easy', enemies: ['wasp', 'wasp', 'beetle'] },
  { id: 'deep-rival', act: 2, pool: 'easy', enemies: ['rival'] },

  { id: 'hive', act: 2, pool: 'normal', enemies: ['wasp', 'wasp', 'wasp', 'tortoise', 'ant', 'ant'] },
  { id: 'deep-mix', act: 2, pool: 'normal', enemies: ['glowworm', 'mole', 'mantis', 'magpie', 'beetle'] },
  { id: 'deep-web', act: 2, pool: 'normal', enemies: ['spider', 'spider', 'glowworm', 'hedgehog', 'mole'] },
  { id: 'rivals', act: 2, pool: 'normal', enemies: ['rival', 'wasp', 'ant', 'ant'] },

  { id: 'twin-rivals', act: 2, pool: 'elite', enemies: ['rival', 'rival', 'wasp'] },
  { id: 'swarm-deep', act: 2, pool: 'elite', enemies: ['ant', 'ant', 'ant', 'ant', 'ant', 'ant', 'wasp', 'wasp'] },
  { id: 'mantis-deep', act: 2, pool: 'elite', enemies: ['mantis', 'mantis', 'mole', 'glowworm'] },

  { id: 'ouroboros', act: 2, pool: 'boss', enemies: ['ouroboros'], layouts: ['ouroboros-ring'] },
];

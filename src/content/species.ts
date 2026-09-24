import type { ItemId } from '../core/types';

export interface Species {
  id: string;
  name: string;
  charm: string;
  genome: ItemId[];
  flesh: number;
  text: string;
  /** How to unlock (profile flag). */
  unlock?: 'act1' | 'act2' | 'victory';
  unlockText?: string;
  color: string;
}

export const SPECIES: Species[] = [
  {
    id: 'garden', name: 'Garden Snake', charm: 'garden', color: '#3ddbb4', flesh: 4,
    genome: ['lunge', 'fang', 'scale', 'scale', 'reverse', 'rattle'],
    text: 'Balanced. A little bit of everything.',
  },
  {
    id: 'viper', name: 'Viper', charm: 'viper', color: '#ff6b6b', flesh: 2,
    genome: ['fang', 'strike', 'venom', 'lunge', 'scale', 'rattle'],
    text: 'Short and venomous. Every bite poisons, but it carries less flesh.',
    unlock: 'act1', unlockText: 'Defeat the Mongoose.',
  },
  {
    id: 'python', name: 'Python', charm: 'python', color: '#b5838d', flesh: 7,
    genome: ['muscle', 'muscle', 'scale', 'reserve', 'sprint', 'hood'],
    text: 'Long and heavy. Its bites can’t interrupt, but its coils are huge and crush hard.',
    unlock: 'act2', unlockText: 'Defeat the Ant Queen.',
  },
  {
    id: 'ouro', name: 'Ouroboros', charm: 'ouro', color: '#ffbe0b', flesh: 4,
    genome: ['reverse', 'shed', 'ouroboros', 'lunge', 'scale', 'egg'],
    text: 'Feeds on itself. Husks are a meal, and it tucks twice per turn.',
    unlock: 'victory', unlockText: 'Win a run.',
  },
];

import { ITEMS } from '../core/registry';
import { Rng, chance, int, pick } from '../core/rng';
import type { RunState } from '../core/run';

export interface EventChoice {
  label: string;
  canChoose?(run: RunState): boolean;
  /** Mutates the run, returns the outcome text. */
  apply(run: RunState, r: Rng): string;
}

export interface EventDef {
  id: string;
  title: string;
  text: string;
  choices: EventChoice[];
}

const name = (id: string) => ITEMS.get(id)?.name ?? id;
const leave: EventChoice = { label: 'Slither on.', apply: () => 'You leave it be.' };

export const EVENTS: EventDef[] = [
  {
    id: 'abandoned-nest',
    title: 'Abandoned Nest',
    text: 'A clutch of speckled eggs lies unattended between the roots. One of them is twitching.',
    choices: [
      {
        label: 'Swallow the twitching egg. (50%: a rare item. 50%: it hatches inside you — lose 3 flesh.)',
        apply(run, r) {
          if (chance(r, 0.5)) {
            const rares = [...ITEMS.values()].filter((d) => d.rarity === 'rare');
            const it = pick(r, rares).id;
            run.genome.push(it);
            return `Something settles in behind your head: ${name(it)}.`;
          }
          run.flesh = Math.max(0, run.flesh - 3);
          return 'It hatches. It bites. It leaves. You lose 3 flesh.';
        },
      },
      {
        label: 'Swallow a quiet egg. (+3 flesh)',
        apply(run) {
          run.flesh += 3;
          return 'Warm and filling. +3 flesh.';
        },
      },
      leave,
    ],
  },
  {
    id: 'molting-stone',
    title: 'Molting Stone',
    text: 'A rough stone, worn smooth on one side by generations of shedding skins.',
    choices: [
      {
        label: 'Rub against it: lose a random item, gain 4 flesh.',
        canChoose: (run) => run.genome.length > 1,
        apply(run, r) {
          const i = int(r, 0, run.genome.length - 1);
          const [it] = run.genome.splice(i, 1);
          run.flesh += 4;
          return `Your ${name(it)} peels away with the old skin. +4 flesh.`;
        },
      },
      leave,
    ],
  },
  {
    id: 'mirror-pool',
    title: 'Mirror Pool',
    text: 'In the still water your reflection looks back — and it has one more item than you do.',
    choices: [
      {
        label: 'Pay 5 flesh: duplicate a random item.',
        canChoose: (run) => run.flesh >= 5,
        apply(run, r) {
          run.flesh -= 5;
          const it = pick(r, run.genome);
          run.genome.push(it);
          return `The reflection steps out and merges with you. A second ${name(it)}.`;
        },
      },
      leave,
    ],
  },
  {
    id: 'sleeping-toad',
    title: 'Sleeping Toad',
    text: 'An enormous toad dozes on a lily pad, snoring softly.',
    choices: [
      {
        label: 'Eat it. (70%: +6 flesh. 30%: it wakes up — lose 2 flesh.)',
        apply(run, r) {
          if (chance(r, 0.7)) {
            run.flesh += 6;
            return 'It does not wake up. +6 flesh.';
          }
          run.flesh = Math.max(0, run.flesh - 2);
          return 'It wakes up and it is not amused. −2 flesh.';
        },
      },
      leave,
    ],
  },
  {
    id: 'old-skin',
    title: 'Old Skin',
    text: 'A snakeskin, shed by something much, much larger than you. It still holds its shape.',
    choices: [
      {
        label: `Wear it (3 flesh): gain ${'Molt'}.`,
        canChoose: (run) => run.flesh >= 3,
        apply(run) {
          run.flesh -= 3;
          run.genome.push('molt');
          return 'It fits. Sort of. You gain Molt.';
        },
      },
      {
        label: 'Eat it. (+2 flesh)',
        apply(run) {
          run.flesh += 2;
          return 'Chewy. +2 flesh.';
        },
      },
    ],
  },
  {
    id: 'ouroboros-shrine',
    title: 'Ring of Stone',
    text: 'A circle of carved stone: a serpent devouring its own tail. The carving seems to move when you look away.',
    choices: [
      {
        label: 'Bite your own tail in reverence: gain Ouroboros, lose a random item.',
        canChoose: (run) => run.genome.length > 1,
        apply(run, r) {
          const i = int(r, 0, run.genome.length - 1);
          const [it] = run.genome.splice(i, 1);
          run.genome.push('ouroboros');
          return `You lose ${name(it)}. You gain Ouroboros. The circle is complete.`;
        },
      },
      leave,
    ],
  },
  {
    id: 'kinetic-trail',
    title: 'A Strange Trail',
    text: 'A trail in the moss that never crosses itself, wandering at random and yet never stuck. Someone clearly studied this.',
    choices: [
      {
        label: 'Follow it: gain Kinetic Walk.',
        apply(run) {
          run.genome.push('kinetic');
          return 'You learn to wander without ever trapping yourself. Mostly.';
        },
      },
      leave,
    ],
  },
];

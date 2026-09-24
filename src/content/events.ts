import { CHARMS, ITEMS } from '../core/registry';
import { Rng, chance, int, pick, shuffle } from '../core/rng';
import type { RunState } from '../core/run';

export interface EventChoice {
  label: string;
  canChoose?(run: RunState): boolean;
  /** Mutates the run, returns the outcome text. */
  apply(run: RunState, r: Rng): string;
}

export interface EventDef {
  id: string;
  /** Only in these acts (0-based). */
  acts?: number[];
  title: string;
  text: string;
  choices: EventChoice[];
}

const name = (id: string) => ITEMS.get(id)?.name ?? id;
const leave: EventChoice = { label: 'Slither on.', apply: () => 'You leave it be.' };

/** Upgrade up to n random upgradeable genome items; returns their new names. */
function upgradeRandom(run: RunState, r: Rng, n: number): string[] {
  const idx = shuffle(r, run.genome.map((_, i) => i).filter((i) => ITEMS.get(run.genome[i])?.upgrade)).slice(0, n);
  return idx.map((i) => {
    run.genome[i] = ITEMS.get(run.genome[i])!.upgrade!;
    return name(run.genome[i]);
  });
}
const nf = (run: RunState) => (run.nextFight = run.nextFight ?? {});
const RARER: Record<string, string[]> = { starter: ['uncommon'], common: ['uncommon'], uncommon: ['rare'], rare: ['rare'] };

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
        label: 'Wear it (3 flesh): gain Ghost Skin.',
        canChoose: (run) => run.flesh >= 3,
        apply(run) {
          run.flesh -= 3;
          run.genome.push('molt');
          return 'It fits. Sort of. You gain Ghost Skin.';
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
  {
    id: 'brick-in-moss',
    title: 'Brick in the Moss',
    text: 'A grey brick half-sunk in the moss, its tiny green screen still glowing. On it, a snake made of square pixels eats a square pixel and grows. It has never looked so happy.',
    choices: [
      {
        label: 'Play until the battery dies. (−2 flesh, upgrade a random item.)',
        apply(run, r) {
          run.flesh = Math.max(0, run.flesh - 2);
          const up = upgradeRandom(run, r, 1);
          return `HIGH SCORE: 3310. You forgot to eat. ${up.length ? `Something in you learned from it: ${up[0]}.` : ''}`;
        },
      },
      {
        label: 'Eat the battery. (+4 flesh; hunger bites every 8 turns next fight.)',
        apply(run) {
          run.flesh += 4;
          nf(run).hungerEvery = 8;
          return 'It tingles. Your metabolism is racing.';
        },
      },
      leave,
    ],
  },
  {
    id: 'blockade-cabinet',
    title: 'Blockade, 1976',
    text: 'A wooden arcade cabinet hums in a clearing. Two blocky lines chase each other across the screen, each trying to trap the other. The coin slot has been gnawed into a mouth.',
    choices: [
      {
        label: 'Feed it 3 flesh. (60%: a random charm. 40%: it just flashes GAME OVER and keeps the flesh.)',
        canChoose: (run) => run.flesh >= 3,
        apply(run, r) {
          run.flesh -= 3;
          const have = new Set(run.charms ?? []);
          const opts = [...CHARMS.values()].filter((c) => c.pool === 'common' && !have.has(c.id));
          if (chance(r, 0.6) && opts.length) {
            const c = pick(r, opts);
            run.charms = [...(run.charms ?? []), c.id];
            return `The cabinet rattles and spits out ${c.name}.`;
          }
          return 'GAME OVER. INSERT COIN. (The machine keeps your 3 flesh.)';
        },
      },
      {
        label: 'Challenge Player 2. (Next fight: an extra Rival snake. You start with a temporary Fang and Rattle.)',
        apply(run) {
          const n = nf(run);
          n.extraEnemies = [...(n.extraEnemies ?? []), 'rival'];
          n.tempItems = [...(n.tempItems ?? []), 'fang', 'rattle'];
          return 'Somewhere ahead, another snake raises its head. PLAYER 2 READY.';
        },
      },
      leave,
    ],
  },
  {
    id: 'hermit-crab',
    title: 'The Hermit Crab',
    text: 'A crab in a borrowed shell eyes your body the way a buyer eyes a house. "Nice segment," it clicks. "I would trade."',
    choices: [
      {
        label: 'Trade: lose a random item, gain a random item one rarity higher.',
        canChoose: (run) => run.genome.length > 1,
        apply(run, r) {
          const i = int(r, 0, run.genome.length - 1);
          const [old] = run.genome.splice(i, 1);
          const rar = RARER[ITEMS.get(old)?.rarity ?? 'common'] ?? ['uncommon'];
          const pool = [...ITEMS.values()].filter((d) => rar.includes(d.rarity) && !d.base);
          const got = pick(r, pool).id;
          run.genome.push(got);
          return `It takes your ${name(old)} and leaves you ${name(got)}.`;
        },
      },
      {
        label: 'Trade blind: lose a random item, gain a random uncommon item — already molted.',
        canChoose: (run) => run.genome.length > 1,
        apply(run, r) {
          const [old] = run.genome.splice(int(r, 0, run.genome.length - 1), 1);
          const pool = [...ITEMS.values()].filter((d) => d.rarity === 'uncommon' && !d.base && d.upgrade);
          const got = pick(r, pool).upgrade!;
          run.genome.push(got);
          return `Gone: ${name(old)}. In its place: ${name(got)}.`;
        },
      },
      { label: 'Keep your shell.', apply: () => '"Your loss," it clicks.' },
    ],
  },
  {
    id: 'snake-oil',
    title: 'Toad with Bottles',
    text: 'A toad in a waistcoat stands behind a stump lined with murky flasks. Every single one is labelled SNAKE OIL. It seems very pleased with this.',
    choices: [
      {
        label: 'Buy a tonic (2 flesh). (40%: upgrade an item. 40%: +4 flesh. 20%: it curdles.)',
        canChoose: (run) => run.flesh >= 2,
        apply(run, r) {
          run.flesh -= 2;
          const roll = int(r, 1, 10);
          if (roll <= 4) {
            const up = upgradeRandom(run, r, 1);
            return up.length ? `You feel your skin loosen. ${up[0]}!` : 'Nothing happens. The toad shrugs.';
          }
          if (roll <= 8) {
            run.flesh += 4;
            return 'Surprisingly nourishing. +4 flesh.';
          }
          const ups = run.genome.map((g, i) => [g, i] as const).filter(([g]) => ITEMS.get(g)?.base);
          if (ups.length) {
            const [g, i] = pick(r, ups);
            run.genome[i] = ITEMS.get(g)!.base!;
            return `It curdles. Your ${name(g)} shrivels back into a ${name(run.genome[i])}.`;
          }
          run.flesh = Math.max(0, run.flesh - 2);
          return 'It curdles. You lose another 2 flesh getting rid of it.';
        },
      },
      {
        label: 'Drink the whole shelf (4 flesh): upgrade 2 random items; start the next fight 2 flesh lighter.',
        canChoose: (run) => run.flesh >= 4,
        apply(run, r) {
          run.flesh -= 4;
          const up = upgradeRandom(run, r, 2);
          nf(run).fleshDelta = (nf(run).fleshDelta ?? 0) - 2;
          return `You feel terrible and magnificent. ${up.join(', ') || 'Nothing to improve, sadly.'}`;
        },
      },
      { label: 'Decline politely.', apply: () => 'The toad looks offended, then relieved.' },
    ],
  },
  {
    id: 'rubber-snake',
    title: 'A Rubber Snake',
    text: 'Bright green, perfectly still, and utterly unafraid of you. You have been staring at each other for some time.',
    choices: [
      {
        label: 'Win the staring contest. (−3 flesh; gain Slow Metabolism.)',
        canChoose: (run) => !(run.charms ?? []).includes('slow-metabolism'),
        apply(run) {
          run.flesh = Math.max(0, run.flesh - 3);
          run.charms = [...(run.charms ?? []), 'slow-metabolism'];
          return 'Hours pass. You win. You have learned patience, and hunger.';
        },
      },
      {
        label: 'Bite it. (Next fight: start with a temporary Rattle and Fang.)',
        apply(run) {
          nf(run).tempItems = [...(nf(run).tempItems ?? []), 'rattle', 'fang'];
          return '*squeak*';
        },
      },
      { label: 'Blink first and leave.', apply: () => 'It wins. It always wins.' },
    ],
  },
  {
    id: 'birdbath',
    acts: [0],
    title: 'The Birdbath',
    text: 'A stone basin brimming with rainwater. In its surface you see the sky — and something circling in it.',
    choices: [
      {
        label: 'Bathe: molt all your Scales. (Next fight: an extra Frog saw you.)',
        canChoose: (run) => run.genome.includes('scale'),
        apply(run) {
          let n = 0;
          run.genome = run.genome.map((g) => (g === 'scale' ? (n++, 'scale+') : g));
          nf(run).extraEnemies = [...(nf(run).extraEnemies ?? []), 'frog'];
          return `${n} Scale${n > 1 ? 's' : ''} grow back keeled and hard. Something green watched you do it.`;
        },
      },
      {
        label: 'Drink. (+2 flesh)',
        apply(run) {
          run.flesh += 2;
          return 'Cold and clean. +2 flesh.';
        },
      },
      { label: 'Keep your head down.', apply: () => 'The shadow passes.' },
    ],
  },
  {
    id: 'ant-toll',
    acts: [1],
    title: 'The Toll Tunnel',
    text: 'A root tunnel narrows to single file. Soldier ants line the walls, mandibles raised. One taps the floor twice: pay.',
    choices: [
      {
        label: 'Pay 3 flesh.',
        canChoose: (run) => run.flesh >= 3,
        apply(run) {
          run.flesh -= 3;
          return 'They part. You pass. Nobody says anything.';
        },
      },
      {
        label: 'Refuse. (Next fight: 3 extra Ants.)',
        apply(run) {
          nf(run).extraEnemies = [...(nf(run).extraEnemies ?? []), 'ant', 'ant', 'ant'];
          return 'You squeeze past. The tunnel behind you starts to rustle.';
        },
      },
      {
        label: 'Leave a tribute: lose a random item, gain the Nest Egg charm.',
        canChoose: (run) => run.genome.length > 1 && !(run.charms ?? []).includes('nest-egg'),
        apply(run, r) {
          const [old] = run.genome.splice(int(r, 0, run.genome.length - 1), 1);
          run.charms = [...(run.charms ?? []), 'nest-egg'];
          return `They carry off your ${name(old)}. The colony remembers — an egg grows in you.`;
        },
      },
    ],
  },
  {
    id: 'mole-larder',
    acts: [1],
    title: "Mole's Larder",
    text: 'A side chamber packed with paralysed worms, neatly stacked. The mole that owns them is snoring somewhere close.',
    choices: [
      {
        label: 'Take everything. (+5 flesh; next fight: an angry extra Mole.)',
        apply(run) {
          run.flesh += 5;
          nf(run).extraEnemies = [...(nf(run).extraEnemies ?? []), 'mole'];
          return 'Delicious. The snoring stops.';
        },
      },
      {
        label: 'Take a few. (+2 flesh)',
        apply(run) {
          run.flesh += 2;
          return 'Nobody will notice. Probably.';
        },
      },
      leave,
    ],
  },
  {
    id: 'last-glowworm',
    acts: [2],
    title: 'The Last Glowworm',
    text: 'Down here the only light is one glowworm, pulsing slowly. It is warm. It would be warmer inside you.',
    choices: [
      {
        label: 'Swallow it: upgrade 2 random items. (−4 flesh — it burns on the way down.)',
        canChoose: (run) => run.flesh >= 4,
        apply(run, r) {
          run.flesh -= 4;
          const up = upgradeRandom(run, r, 2);
          return `Light spreads through your segments. ${up.join(', ') || 'Nothing to improve, but it was warm.'}`;
        },
      },
      {
        label: 'Follow its light. (Next fight: every enemy starts with 2 poison.)',
        apply(run) {
          nf(run).enemyPoison = (nf(run).enemyPoison ?? 0) + 2;
          return 'It leads you along a path of pale fungus. Whatever lives ahead has been eating it.';
        },
      },
      { label: 'Let it shine.', apply: () => 'You leave the dark a little less dark.' },
    ],
  },
  {
    id: 'great-shed',
    acts: [2],
    title: 'Skin of the World-Serpent',
    text: 'A shed skin coils through the cavern, wide as a tunnel. You can see where the scales flexed around something you would rather not meet.',
    choices: [
      {
        label: 'Crawl through it (3 flesh): upgrade a random item; start the next fight with a shield.',
        canChoose: (run) => run.flesh >= 3,
        apply(run, r) {
          run.flesh -= 3;
          const up = upgradeRandom(run, r, 1);
          nf(run).shield = (nf(run).shield ?? 0) + 1;
          return `You come out the other end changed. ${up[0] ?? ''}`;
        },
      },
      {
        label: 'Pry off a scale: gain a Keeled Scale. (The Ouroboros will notice: +3 HP.)',
        apply(run) {
          run.genome.push('scale+');
          run.bossBonus = (run.bossBonus ?? 0) + 3;
          return 'It comes loose with a sound like a bell. Far below, something stirs.';
        },
      },
      { label: 'Go around. It takes a while.', apply: () => 'A long while.' },
    ],
  },
];

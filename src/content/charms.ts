import * as ops from '../core/ops';
import { defineCharm } from '../core/registry';

// ---------------------------------------------------------------- species charms

defineCharm({ id: 'garden', name: 'Garden Snake', pool: 'species', glyph: 'scale', color: '#3ddbb4', text: 'Adaptable. No special rules.' });
defineCharm({ id: 'viper', name: 'Viper Blood', pool: 'species', glyph: 'venom', color: '#ff6b6b', text: 'Every bite that doesn’t kill injects 2 poison. You carry 3 less flesh.', bitePoison: 2, fleshCapBonus: -3 });
defineCharm({
  id: 'python', name: 'Python Build', pool: 'species', glyph: 'python', color: '#b5838d',
  text: 'Coils up to 18 tiles hold and crush +1. But your bites never knock back or interrupt.',
  coilAreaBonus: 6, crushBonus: 1, noInterrupt: true,
});
defineCharm({
  id: 'ouro', name: 'Ouroboros Spirit', pool: 'species', glyph: 'ouroboros', color: '#ffbe0b',
  text: 'Eating a husk grows 1 extra flesh. You may tuck twice per turn.',
  tuckBonus: 1,
  onEatHusk: (f) => ops.addSeg(f, null, 'tail'),
});

// ---------------------------------------------------------------- droppable charms

defineCharm({ id: 'fat-body', name: 'Fat Body', pool: 'common', glyph: 'reserve', color: '#ffc8dd', text: 'You can carry 3 more flesh between rooms.', fleshCapBonus: 3 });
defineCharm({ id: 'slow-metabolism', name: 'Slow Metabolism', pool: 'common', glyph: 'heart', color: '#ff9fb2', text: 'Hunger bites 5 turns later.', hungerBonus: 5 });
defineCharm({
  id: 'lucky-scale', name: 'Lucky Scale', pool: 'common', glyph: 'scale', color: '#90e0ef',
  text: 'The first hit in every room is absorbed.',
  fightStart: (f) => void (f.shield = (f.shield ?? 0) + 1),
});
defineCharm({
  id: 'hunter', name: "Hunter's Gut", pool: 'common', glyph: 'gorge', color: '#06d6a0',
  text: 'Killing an enemy with a bite grows 1 extra flesh.',
  onKill: (f, _e, cause) => {
    if (cause === 'bite') ops.addSeg(f, null, 'tail');
  },
});
defineCharm({
  id: 'constrictor', name: "Constrictor's Ring", pool: 'common', glyph: 'ring', color: '#c77dff',
  text: 'Crushing an enemy to death grows 1 flesh.',
  onKill: (f, _e, cause) => {
    if (cause === 'crush') ops.addSeg(f, null, 'tail');
  },
});
defineCharm({ id: 'second-mouth', name: 'Second Throat', pool: 'common', glyph: 'reverse', color: '#ffd166', text: 'You may tuck twice per turn.', tuckBonus: 1 });
defineCharm({
  id: 'nest-egg', name: 'Nest Egg', pool: 'common', glyph: 'egg', color: '#fefae0',
  text: 'Every room, a temporary Egg grows right behind your head.',
  fightStart: (f) => ops.addSeg(f, 'egg', 'neck', true),
});
defineCharm({ id: 'long-jaw', name: 'Long Jaw', pool: 'common', glyph: 'fang', color: '#f1faee', text: 'Your bites deal +1 to enemies with 3 or more HP.', toughBite: 1 });
defineCharm({ id: 'wide-coils', name: 'Wide Coils', pool: 'common', glyph: 'wide', color: '#9b5de5', text: 'Coils up to 16 tiles hold.', coilAreaBonus: 4 });
defineCharm({
  id: 'venom-drip', name: 'Venom Drip', pool: 'common', glyph: 'venom', color: '#80ed99',
  text: 'Every room starts with a temporary Venom Sac behind your head.',
  fightStart: (f) => ops.addSeg(f, 'venom', 'neck', true),
});

defineCharm({ id: 'deep-roots', name: 'Deep Roots', pool: 'common', glyph: 'roots', color: '#a0c4ff', text: 'Two more items from your genome grow on you each room.', drawBonus: 2 });

// ---------------------------------------------------------------- boss charms

defineCharm({
  id: 'mongoose-tooth', name: 'Mongoose Tooth', pool: 'boss', glyph: 'tooth', color: '#c9a66b',
  text: 'Your bites deal +2. But hunger bites 4 turns sooner.',
  biteBonus: 2, hungerBonus: -4,
});
defineCharm({ id: 'queen-jelly', name: 'Royal Jelly', pool: 'boss', glyph: 'heart', color: '#d9822b', text: 'Carry 5 more flesh between rooms. But hunger bites 3 turns sooner.', fleshCapBonus: 5, hungerBonus: -3 });
defineCharm({ id: 'crushing-coils', name: 'Crushing Coils', pool: 'boss', glyph: 'crush', color: '#9b5de5', text: 'Coils crush +1 and wrap needs one tile less. But your bites never interrupt.', crushBonus: 1, wrapBonus: 1, noInterrupt: true });
defineCharm({
  id: 'glass-scales', name: 'Glass Scales', pool: 'boss', glyph: 'carapace', color: '#caf0f8',
  text: 'The first two hits in every room are absorbed. But you carry 3 less flesh.',
  fleshCapBonus: -3,
  fightStart: (f) => void (f.shield = (f.shield ?? 0) + 2),
});

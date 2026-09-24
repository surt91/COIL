# COIL — a turn-based roguelike about a snake that is its own everything

> *Your body is your health bar, your inventory and your weapon.*

## Pitch

Classic Snake is a real-time reflex game with one resource: length. COIL keeps the
two sacred rules of Snake — **you can never stand still** and **your body follows your
head** — but turns everything else into a tactical, turn-based roguelike with a
light deckbuilder on top.

The central idea: **length is the only resource that matters, and it is spent in
three competing ways.**

1. **Health** — enemies bite off segments from your tail. When only the head remains and it is hit, you die.
2. **Inventory** — segments can carry *grafts* (genes): armour scales, venom sacs,
   spines, hearts, eyes… Their *position* on the grid matters.
3. **Weapon** — encircle enemies with your body to *constrict* them. The longer
   you are, the larger the loops you can close.

On top of that, a deck of *Instinct* cards (Lunge, Shed Skin, Reverse, Burrow, …)
lets you bend the movement rules at an energy cost.

## Core rules (one turn)

1. **Player phase.**
   - Play any number of cards whose total cost ≤ current energy (free actions).
   - Then you must **move**: head steps one tile (not backwards). Some cards
     (Lunge, Reverse) replace the move and end the turn.
   - Moving into an **enemy** = *bite*. Damage = 1 + fang grafts. If it dies you
     move onto its tile and eat it (+1 length). If it survives, you stay put.
   - Moving into **food** = grow +1 at the tail.
   - Moving into a **wall** or your **own body** is illegal (the tail tip is
     fine, it moves away). If no legal move exists you are *trapped*: you must bite
     yourself (severing everything behind the bitten segment) — the Ouroboros move.
2. **Body phase.** Passive grafts trigger (venom ticks adjacent enemies, heart
   regenerates, …).
3. **Constrict.** Every tile fully enclosed by your body (flood fill from the
   outside with body segments as the only barrier) is *in the coil*. Enemies inside
   are stunned and take crush damage every turn.
4. **Enemy phase.** Each enemy resolves its *telegraphed intent* (shown the turn
   before, Into-the-Breach style), then picks a new one.
5. **Upkeep.** +1 energy (cap 3), draw 1 card (hand cap 5).

### Damage

- A hit on a body segment or the head removes `dmg` segments from the **tail**.
- A *Scale* graft on the hit segment absorbs the hit (scale is used up).
- *Severing* attacks (Mantis) cut the body at the hit segment: everything
  behind falls off and becomes a *husk* (obstacle that can be eaten back
  within a few turns — eat your own tail!).
- Head hit with zero body segments → death.

### Growth & grafts

- Plain food grows the snake at the tail (classic Snake).
- Grafts (from golden eggs, rewards, shops) are attached **directly behind the
  head** and push existing grafts back. Damage eats the tail first, so the
  oldest grafts are the most vulnerable.

## Run structure

Slay-the-Spire-like branching map, 3 acts ("The Garden", "The Roots", "The Deep").
Node types: Fight, Elite, Nest (graft reward), Molting Pool (shop / rearrange /
remove cards), Event, Rest ("Bask": regrow), Boss.

Currency: **Bones** dropped by enemies.

Every room is an arena grid (~17×13). The snake enters through a burrow; the
body that has not emerged yet is "still in the burrow" and uncoils onto the board
as you move. Clear all enemies → exit burrows open.

## Enemies (all telegraphed)

| Enemy | Behaviour |
|---|---|
| Beetle | Walks toward you, bites an adjacent tile next turn. |
| Hedgehog | Slow. Biting it hurts you (spines). Constrict it instead. |
| Frog | Hops 2 tiles; tongue strikes a line of 3. |
| Mantis | Telegraphs a sever on a tile. |
| Spider | Lays webs: a webbed head loses its move. |
| Mole | Burrows and emerges at a telegraphed tile. |
| Wasp | Flies over the body; fast. |
| Rival snake (elite) | Plays by your rules and competes for food. |
| Bosses | Mongoose (moves twice), Hydra (many heads), Hawk (area dives), the Ouroboros. |

## Tech

- TypeScript + Vite; Preact for UI screens; Canvas2D for the board.
- **Deterministic pure core** (`src/core`): `state + action → state + events`,
  seeded RNG. Enables seeds/daily runs, replays, unit tests and headless bots
  for balancing.
- Renderer consumes the event list and animates it (tweens, particles, shake).
- Sound: synthesized WebAudio, no asset files.
- All art is procedural.

## Roadmap

- [ ] P0 Scaffold, git, test runner
- [ ] P1 Grid, snake movement, food, rendering, turn loop
- [ ] P2 Enemies with intents, bite, damage, death
- [ ] P3 Cards, energy, hand UI
- [ ] P4 Grafts
- [ ] P5 Constrict
- [ ] P6 Run structure: map, rewards, shop, events, bosses
- [ ] P7 Juice: animations, sound, particles, title screen, save/continue
- [ ] P8 Balancing with headless bots

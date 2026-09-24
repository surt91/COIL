# COIL

*A turn-based roguelike about a snake that is its own everything.*

### ▶ [Play in your browser: surt91.github.io/COIL](https://surt91.github.io/COIL/)

[![Deploy](https://github.com/surt91/COIL/actions/workflows/pages.yml/badge.svg)](https://github.com/surt91/COIL/actions/workflows/pages.yml)

Your body is your health bar, your wallet, your deck and your weapon:

- Every segment behind your head is **flesh** or carries an **item**. The first
  three items behind your head are your **hand** — playing one spends that
  segment, but items are ammunition: they all come back next room.
- Enemies telegraph every attack. A hit destroys the segment it lands on — and
  the item on it.
- Enclose enemies with your body to **coil** and crush them.
- Flesh carries over between rooms: it is your health *and* the currency you
  pay the Molting Pool with.

Three acts (The Garden, The Roots, The Deep), a branching map, 28 items that
can all be upgraded ("molted"), 19 charms, 4 snake species, 17 events,
15 enemies (including three bosses: Mongoose, Ant Queen, the Ouroboros)
and 6 difficulty depths.
All art is procedural Canvas2D, all sound is synthesized WebAudio — there are
no asset files. Press <kbd>F2</kbd> in a fight for the ncurses-style terminal skin.

## Running

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/
npm test           # rules, fuzzing and run-flow tests
```

URL parameters: `?seed=123` starts a seeded run; `?fight=garden-gate&enemies=beetle,frog&act=0`
starts a debug fight; `?instant` disables animations.

## Controls

| | |
|---|---|
| Arrows / WASD / click next to the head | move (you must move every turn) |
| <kbd>1</kbd>–<kbd>3</kbd> | play a hand item (then a direction, if it needs one) |
| <kbd>T</kbd> | tuck: send your first hand item to the tail (once per turn) |
| <kbd>Z</kbd> | undo the card plays of this turn |
| hover a tile next to the head | preview the whole turn: body, losses, coils |
| <kbd>F2</kbd> | terminal skin |

## Tools

```sh
npm run play -- new 7 garden-gate beetle,frog   # play a fight in the terminal
npm run play -- "R R U p2R"                     # moves, p<slot><dir> plays a card
npm run sim -- --runs 200 --policy lookahead2   # bot fights: win rates, kill causes, fuzzing
npx tsx scripts/runsim.ts --runs 40             # bot plays full runs
```

## Architecture

- `src/core` — the pure, deterministic rules engine: `step(fight, action) → fight`
  with a seeded RNG in the state. Previews, undo, saves, replays, tests and
  bots all fall out of this.
- `src/content` — items, enemies, layouts, encounters, events as data.
- `src/render` — canvas board renderer (procedural creatures and glyphs),
  ASCII renderer.
- `src/ui` — Preact screens. `src/audio` — WebAudio synth. `src/bot` —
  search-based bots, fight/run simulators, invariant checks.

See `DESIGN.md` for the design and `notes/devlog.md` for the story of how it
was made.

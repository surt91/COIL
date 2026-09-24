# COIL — a turn-based roguelike about a snake that is its own everything

> *Your body is your health bar, your wallet, your deck and your weapon.*

Design v2 — revised after a three-way critique (systems designer, player-experience
critic, engineer). See `notes/devlog.md` for what changed and why.

## Pitch

COIL keeps the two sacred rules of Snake — **you can never stand still** and
**your body follows your head** — and turns everything else into a tactical
turn-based roguelike.

There is exactly **one resource: segments.**

- Every segment behind the head is either **flesh** (blank) or carries an
  **item** (a card).
- The first three items behind your head are your **hand**. Playing one
  consumes its segment: the body contracts, the next item slides forward.
- Getting hit destroys the segment that was hit — and the item on it.
- Encircling enemies with your body **constricts** them. Longer snakes close bigger loops.
- Flesh is also your **currency** between rooms (shops take flesh) and your
  **health** (it is what's left when you are out of items).

Every decision — play a card, eat, fight, coil, buy — spends the same thing.

## A turn

1. **Player phase.**
   - Optionally *tuck* once (free): move your first hand item to the tail end.
   - Play any number of hand items (each consumes its segment; some cost extra
     flesh from the tail). Card plays can be undone (Z) until you move.
   - **Move** (ends the turn): the head steps one tile, not backwards. Some cards
     (Lunge, Reverse) *are* the move.
     - Into an **enemy** → *bite* (1 dmg + bonuses). If it dies you move in and
       eat it (+1 segment). If it survives it is knocked back 1 tile and its
       intent is cancelled — biting is how you interrupt.
     - Into **food** → grow +1 flesh at the tail.
     - Into a **husk** → eat it, its item (if any) is grafted behind the head.
     - Into a **web** → stuck; web is consumed, you don't move this turn.
     - Into a **wall**, your **own body** (except a tail tip that moves away) → illegal.
     - No legal move at all → *Ouroboros*: bite an adjacent own segment; it and
       everything behind it becomes husk.
2. **Body phase.** Passive items trigger (venom, heart, …). Poison ticks.
3. **Constrict.** Compute coils (see below); coiled enemies take crush damage.
4. **Enemy phase.** Enemies resolve their telegraphed intents in fixed order
   (id), then pick new, visible intents.
5. **Upkeep.** Hunger ticks; escalation spawns.

### Two kinds of enemy attacks

- **Tile strikes** (frog tongue, hawk dive, mole emergence) target tiles,
  locked when telegraphed. They hit whatever is there on resolution (including
  other enemies). The head can dodge them; the body mostly can't.
- **Segment locks** (beetle bite, mantis sever) latch onto a specific segment;
  the marker travels with it. At resolution the attack lands only if the
  segment still exists *and* is still within the attacker's reach (adjacent for
  melee). Answers: bite the attacker (interrupt + knockback), move so the
  segment slides out of reach, *play the item on that segment* (the lock
  fizzles), or let it hit flesh / a Scale.

### Damage

- A hit on body segment *k* destroys that segment (its item is lost for this
  room); the body contracts from the tail.
- **Scale** items absorb a hit on their own segment (the scale becomes flesh).
- A hit on the **head** destroys the two segments right behind it (your hand!).
- **Sever** (mantis) cuts at *k*: everything behind becomes husks (items stay
  on them — eat them back within 4 turns).
- Hit on the head with no segments left → death.

### Constriction

- Barriers: snake body (incl. head), walls, husks, webs.
- A *coil* is any connected region (4-neighbourhood) of free tiles that
  (a) is separated from the room's main open area, (b) touches the snake body,
  and (c) has area ≤ 12. Diagonal gaps count as sealed (enemies move orthogonally).
- Crush damage by tightness: area 1 → 3/turn, 2–3 → 2, 4–8 → 1, 9–12 → *held* only.
- Coiled enemies are *held*: they cannot move, but they can still attack the ring.
- Hovering a move previews the resulting coil.

### Pressure (anti-stall)

- **Hunger:** every 10 turns without eating, lose the tail segment.
- **Escalation:** from turn 25, a beetle crawls out of a burrow every 6 turns.
- There is always ≥1 food on the board.

## Items (the deck)

- The run's **genome** is your persistent deck. At room start the snake is
  built as head + genome (shuffled) + your flesh. You emerge from a burrow;
  the rest of the body is still underground and uncoils as you move.
- Played or destroyed items return next room. **Flesh does not** — it is
  attrition, and it is also what you pay shops with.
- Eating an enemy with a killing bite may graft its **signature item** behind
  your head (temporary, digests into flesh at room end).

Each item has an **active** (play from hand, consumes) and/or a **passive**
(works while on the body, often positional). Initial list:

| Item | Passive | Active |
|---|---|---|
| Lunge | — | Dash 2 straight; the bite at the end +1 |
| Fang | — | Next bite this turn +2 |
| Scale | Absorbs a hit on this segment | Next hit this turn is absorbed |
| Venom Sac | Adjacent enemies get 1 poison / turn | Spit: first enemy in line (≤4): 3 poison |
| Spine | Enemies hitting this segment take 2 | All enemies adjacent to the body take 1 |
| Heart | Every 6 turns grow 1 flesh | Grow 3 flesh |
| Muscle | Crush +1 | Crush all coiled enemies now |
| Reverse | — | Swap head and tail (the hand changes!) |
| Shed Skin | — | Last 3 segments become husks |
| Rattle | — | Enemies within 3 of the head lose their intent |
| Tail Whip | — | Tail tip hits the 4 tiles around it for 2 |
| Swallow | — | Eat an adjacent enemy with ≤2 HP whole |
| Molt | — | Leave your current shape as a husk-skin (2 turns); keep your body |
| Ouroboros | — | If tail tip touches head: enemies in coils take 3 |
| Kinetic Walk | — | 3 random self-avoiding steps (a nod to rsnake) |
| Carapace / Tongue / Scythe / Silk | enemy signature items | |

## Enemies — each asks one question

| Enemy | Question | Behaviour |
|---|---|---|
| Beetle | Can you interrupt in time? | Walks toward you, locks an adjacent segment, bites next turn. |
| Hedgehog | Can you coil? | Biting it costs you your neck segment and it curls (bite-immune 2 turns). |
| Frog | Are you too straight? | Hops 2; tongue strikes a line of 3 tiles. |
| Mantis | Where is your neck? | 2-turn sever lock on a segment with many items behind it. |
| Spider | Can you plan 3 turns ahead? | Spins webs (which are also coil walls). |
| Mole | Keep the tile clear? | Burrows; emerges on a telegraphed tile. |
| Wasp | Protect the head. | Flies over the body, strikes the head. |
| Magpie | Protect your items. | Steals the item from an adjacent segment. |
| Ant swarm | Big coils. | Many 1-HP ants. |
| Rival snake (elite) | Can it coil *you*? | Plays by your rules. |
| Bosses | | Mongoose (acts twice), Hydra (many heads), Hawk (area dives), the Ouroboros. |

## Run structure

Branching map à la Slay the Spire. Act 1 "The Garden" first; later "The Roots", "The Deep".
Nodes: Fight, Elite, Nest (item reward), Molting Pool (shop: buy/remove items
for flesh, reorder), Bask (rest: regrow flesh), Event, Boss.
First three rooms of a new save are a scripted tutorial taught through layout,
not text.

## Readability & feel

- Visual channels: hue = allegiance (snake teal, enemies earth tones, food
  gold); **red is reserved for incoming damage**; items are glyphs on segments;
  coils are a violet hatch.
- Ghost previews for each legal move: resulting body, coils, which telegraphs land.
- Damage preview: segments that will be destroyed are darkened/marked.
- Art direction "bioluminescent terrarium": ink-blue background, dotted moss grid,
  the snake as one tapered continuous stroke, a food bulge that travels down the
  body, ripple flash when a coil closes.
- Sound: pentatonic plucks per move, rising arpeggio on eating, resolving chord on coil.

## Nods to the commissioner's history

- Terminal skin: ncurses-style ASCII renderer (`@ooo`, `*`).
- Kinetic Walk card; an "Autopilot" relic driven by the balancing bot.
- Seeded daily runs where bots race you as ghosts.
- A real-time Classic mode unlock.

## Tech

TypeScript + Vite, Preact UI, Canvas2D board. Pure deterministic core
(`src/core`) with a seeded uint32 RNG in the state: `(state, action) → (state, events)`.
Content is data-driven (`src/content`). Renderer consumes events. Headless bots
in `src/bot` for fuzzing and balancing.

## Roadmap

- [x] P0 Scaffold, git, test runner
- [ ] P1 Grid, snake, burrow emergence, food, render, turn loop, ASCII fixtures
- [ ] P2 Beetle, intents (tile strike + segment lock), damage, death
- [ ] P3 Constriction + Hedgehog
- [ ] P4 Body-as-deck: items, hand, tuck, play, undo
- [ ] P5 Sever, husks, Mantis, Frog, Spider
- [ ] P6 Run: map, rewards, shop, rest, Mongoose boss (Act 1 vertical slice)
- [ ] P7 Juice: animations, sound, previews, title, save
- [ ] P8 Bots: fuzzing + balancing
- [ ] P9 Acts 2–3, more content, species, daily seeds, terminal skin

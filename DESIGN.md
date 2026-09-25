# COIL — a turn-based roguelike about a snake that is its own everything

> *Your body is your health bar, your wallet, your deck and your weapon.*

Design v3 — v2 came from a three-way critique (systems designer, player-experience
critic, engineer); v3 reflects bot-driven balancing and two browser playtests.
See `notes/devlog.md` for what changed and why. Numbers here are current defaults.

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
       intent is cancelled — biting is how you interrupt. **Pinned** enemies
       (nowhere to be knocked to), enemy snakes and bosses are *not* interrupted.
     - Into **food** → grow +1 flesh at the tail.
     - Into a **husk** → eat it, its item (if any) is grafted behind the head.
     - Into a **web** → stuck; web is consumed, you don't move this turn.
     - Into a **wall**, your **own body** (except a tail tip that moves away) → illegal.
     - Into a **burrow** (entrance or spawn hole) → illegal: they are dead ends.
     - No legal move at all → *Ouroboros*: bite an adjacent own segment; it and
       everything behind it becomes husk (last resort: your own neck).
2. **Body phase.** Passive items trigger (venom, heart, …). Poison ticks.
3. **Constrict.** Compute coils (see below); coiled enemies take crush damage;
   wrapped enemies are squeezed.
4. **Enemy phase.** Enemies resolve their telegraphed intents in fixed order
   (id), then pick new, visible intents. Enemy snakes that enclose your head
   constrict you (−1 tail per turn).
5. **Upkeep.** Hunger ticks; escalation spawns.

### Two kinds of enemy attacks

- **Tile strikes** (frog tongue, hawk dive, mole emergence) target tiles,
  locked when telegraphed. They hit whatever is there on resolution (including
  other enemies). The head can dodge them; the body mostly can't.
- **Segment locks** (beetle bite, mantis sever) latch onto a specific segment;
  the marker travels with it. At resolution the attack lands only if the
  segment still exists *and* is still within the attacker's reach — measured
  in **Chebyshev** distance (diagonals count; 1 for melee, 2 for the mantis).
  Orthogonal reach would make every lock either always miss or always hit,
  because a segment moves one tile per turn. With Chebyshev reach, a lock lands
  when the body curls around the attacker and misses when it slides away. Answers: bite the attacker (interrupt + knockback), move so the
  segment slides out of reach, *play the item on that segment* (the lock
  fizzles), *tuck* it to the tail, or let it hit flesh / a Scale.
- While the snake is still emerging, segments at the burrow mouth can't be targeted.

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
- An enemy crushed to death is swallowed like a bite kill: +1 flesh, hunger resets.
- Coiled enemies are *held*: they cannot move, but they can still attack the ring.
- Bosses are only held by tight coils (Mongoose ≤3 tiles, Queen ≤8, Ouroboros ≤6).
- **Bosses riposte:** after a bite it survives, a boss marks the tile your head
  bit from (red). If your head is still there after your next move, it strikes
  the head. Biting a boss twice from the same tile is punished — circle it.
- **Exposed:** a boss that is wrapped or inside *any* coil of yours (held or
  not) is knocked back and interrupted like a normal enemy, takes +1 from
  bites and can't riposte. Loose coils pay before they hold.
- A bite tears at most 5 segments off a boss snake (the Ouroboros).
- **Wrap:** an enemy touching 4+ snake tiles (8-neighbourhood) is squeezed for
  1/turn even without a closed coil. This makes constriction incremental.
- To keep a coil, the snake chases its own tail (the tail tip vacates each turn).
- Hovering a move previews the resulting coil (area and crush).

### Pressure (anti-stall)

- **Hunger:** every 12 turns without eating, lose the tail segment.
- **No farming:** once a room is cleared, no new food grows.
- **Escalation:** from turn ~25, a beetle crawls out of a spawn hole every 6 turns.
  Escalation spawns and summons are *minions*: not required to clear the room.
- There is always ≥1 food on the board (2 from Act 2).
- **Flesh cap:** you carry at most 8 / 10 / 12 flesh (per act) out of a room.

## Items (the deck)

- The run's **genome** is your persistent deck — an **ordered ring** that you
  may reorder freely between fights. At room start you emerge at a random point
  on the ring: the snake is head + the next 8 items *in ring order* + your flesh.
  You don't control where the arc starts, but you control what sits next to
  what (combos in one hand, strong items spread out, ring items together). You emerge from a burrow;
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
| Muscle | Ring: coils this segment borders crush +1 | Crush all coiled enemies now |
| Reverse | — | Swap head and tail (the hand changes!) |
| Shed Skin | — | Last 3 segments become husks |
| Rattle | — | Enemies within 3 of the head lose their intent |
| Tail Whip | — | Tail tip hits the 4 tiles around it for 2 |
| Swallow | — | Eat an adjacent enemy with ≤2 HP whole |
| Molt | — | Leave your current shape as a husk-skin (2 turns); keep your body |
| Ouroboros | — | If tail tip touches head: enemies in coils take 3 |
| Kinetic Walk | — | 3 random self-avoiding steps (a nod to rsnake) |
| Knot | Crush kill in a coil it borders: temporary copy of the next item behind it | Pull the next item behind it into the hand |
| Scute | Its two neighbour segments can't be latched onto, severed or robbed | Every latched enemy lets go |
| Heat Pit | Bites +2 vs. enemies held in a coil it borders | Next bite +2, ignores shells and curls |
| Carapace / Tongue / Scythe / Silk | enemy signature items | |

## Enemies — each asks one question

| Act | Enemy | Question | Behaviour |
|---|---|---|---|
| 1 | Beetle | Can you interrupt in time? | Walks toward you, locks an adjacent segment. |
| 1 | Hedgehog | Can you coil? | Biting it costs your neck segment and it curls up. |
| 1 | Frog | Are you too straight? | Hops; tongue strikes a line of 3 tiles. |
| 1 | Mantis | Where is your neck? | 2-turn sever lock (reach 2). |
| 1 | Spider | Can you plan ahead? | Webs ahead of your head (webs are coil walls). |
| 1 | **Mongoose** (boss) | | Fast, bites hard, pounces along lines. |
| 2 | Mole | Keep the tile clear? | Burrows; erupts on a marked tile. |
| 2 | Magpie | Protect your items. | Flies over the body, steals an item, escapes after 3 turns. |
| 2 | Ant | Big coils. | 1 HP, many of them. |
| 2 | Tortoise | Coil or poison. | Bites deal at most 1. |
| 2 | **Ant Queen** (boss) | | Summons ants (max 5), bites hard. |
| 3 | Wasp | Protect the head. | Flies, stings the head's tile. |
| 3 | Glowworm | Lines again. | Spits light along 4 tiles. |
| 3 | Rival snake | Can it coil *you*? | Plays by your rules; bite its body to cut it. |
| 3 | Brood Grub | Will you coil it? | Slow. Any kill but a crush bursts it into two Grublings, which don't feed you. |
| 3 | **The Ouroboros** (boss) | | Giant snake that hunts your tail and severs. |

Enemy HP scales +1 per act (non-bosses).

## Run structure

Branching map à la Slay the Spire, 10 rows per act, 3 acts ("The Garden",
"The Roots", "The Deep"). Six non-crossing paths plus extra forks; no
special node (elite, pool, bask, event, nest) follows the same kind, and
siblings differ. Every act has its own rooms: open garden beds, tangled roots
with choke points, deep caverns with pillars, a chasm and a grotto. Nodes: Fight, Elite (+charm), Nest (item),
Molting Pool (shop: items, a charm, remove an item — paid in flesh),
Bask (rest), Event, Boss (+boss charm).

- **Charms**: passive run relics (flesh cap, hunger, shields, crush, …).
  Boss charms are strong with a drawback.
- **Species**: Garden Snake, Viper (poison bites), Python (huge coils, no
  interrupts), Ouroboros (feeds on husks, double tuck) — unlocked by milestones.
- **Molts**: 6 cumulative ascension levels, one unlocked per victory.
- **Daily run**: one attempt per day on a date-derived seed.

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

- [x] Core rules engine, fuzz-tested
- [x] Body-as-deck, coils, wrap, 28 items, 15 enemies, 3 bosses
- [x] Run: map, rewards, shop, rest, events, 3 acts, charms, species, molts, daily
- [x] Procedural art, synthesized sound, terminal skin, autopilot hints
- [x] Bots, fight/run simulators, balancing
- [ ] Bot that plans coils (better balance data for the Python)
- [x] Item upgrades (molting)
- [x] Genome ring (ordered deck), ring/adjacency items
- [x] Run-end screen with records, unlocks and the next goal
- [ ] More events and items per act

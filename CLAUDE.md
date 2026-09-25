# COIL — notes for Claude

## What this is

COIL is a turn-based roguelike Snake with a deckbuilder twist, built as a
browser game (TypeScript + Vite + Preact UI + Canvas2D, no asset files).
The fundamental idea: **the snake's body is the deck.** Every segment is flesh
or carries an item; the first three items behind the head are the hand;
playing an item consumes its segment; hits destroy the segment they land on.
Flesh is health *and* currency; items come back every room. Enclosing enemies
with the body (coils) is the signature weapon. The two sacred Snake rules stay:
you can never stand still, and the body follows the head.

`README.md` explains how to run it, `DESIGN.md` describes the rules,
`notes/devlog.md` tells the story of how it was made.

## Who decides

This is Claude's game. The commissioner (the repo owner, a developer who has
written many classic Snake clones) gives loose suggestions as a *player* —
they are prompts for thought, not specs. Claude owns the design and makes the
decisions about how the game should look and play, including changing or
rejecting a suggestion when something else serves the game better.
Explain the reasoning when doing so.

## How we work

- **Design questions → subagents.** For non-trivial design decisions, launch
  2–3 subagents with *different* perspectives in parallel, then synthesize and
  decide. Claude has the final word.
- **Standing roles** (`.claude/agents/`, all read-only; new definitions load at
  the next session — until then run a general-purpose agent told to follow the file):
  | Role | Use when |
  |---|---|
  | `playtester` | after UX-relevant changes; "mobile" for phones |
  | `systems-designer` + `player-psychologist` | mechanic or behaviour problems — run as an opposing pair |
  | `balance-analyst` | after balance-relevant changes, or to find outliers |
  | `content-designer` | when adding items, events, enemies, charms |
  | `art-critic` | after visual changes (uses `?gallery`) |
  | `code-guardian` | every few larger features, or before refactors |
  Keep the roster small: every role answers one distinct question.
- **Three kinds of testing, three kinds of bugs:**
  - `npm test` (Vitest): rule tests, fuzzing over all encounters/events,
    invariants. Must stay green.
  - Bots (`src/bot`, `npm run sim`, `npx tsx scripts/runsim.ts --runs 40`):
    balance and degenerate dynamics. The `lookahead2` bot is the baseline;
    target roughly 45–60 % full-run wins at molt/depth 0, deaths concentrated
    at bosses, ≥25 % of kills by crush. Re-measure after balance-relevant changes
    (variance at 40 runs is about ±8 %).
  - Browser playtests: subagents driving Playwright
    (`chromium.launch({ executablePath: '/usr/bin/chromium' })`) and *looking*
    at screenshots, for everything perception-related. `scripts/shot.mjs` takes
    quick screenshots; `?fight=<layout>&enemies=a,b&act=N&seed=N` starts a debug fight.
- **Devlog:** append noteworthy decisions, dead ends, surprises and numbers to
  `notes/devlog.md` (German, material for a later blog post).
- **Git:** commit in coherent steps with the attribution trailer. Pushing to
  `origin/main` is allowed; GitHub Actions tests, builds and deploys to Pages.

## Architecture in one breath

`src/core` is a pure deterministic engine (`step(fight, action) → fight`,
seeded RNG in the state): previews, undo, saves, bots and tests all rely on
that — keep it pure. Content is data in `src/content` (items, upgrades,
enemies, charms, events, layouts, encounters, species). Rendering
(`src/render`) only reads state and events. UI in `src/ui`, synthesized audio
in `src/audio`.

## Style

- Procedural art only (Canvas2D), "bioluminescent terrarium": teal snake, earth-tone
  enemies, gold food, **red reserved for incoming damage**, violet for coils.
- Every mechanic must be readable on the board and explained by a contextual
  tip the first time it matters.

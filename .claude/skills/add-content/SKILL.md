---
name: add-content
description: Checklist for adding or changing COIL content — items and upgrades, charms, enemies, encounters, layouts, events, species.
---

Design first: every piece must create a decision, interact with the
body-as-deck / coil mechanics and fit the tone (the `content-designer` agent
can propose specs). Then:

- **Item** (`src/content/items.ts`): `defineItem` with id, name, glyph (add a
  new one in `src/render/glyphs.ts` if needed — must stay distinct at 16 px),
  colour, rarity, texts, hooks. Give playable actives a `requires` text. Add a
  `defineUpgrade(id, …)` that changes *how* it plays. Add card art in
  `src/render/cardArt.ts` (`SCENES[id]`, one focal idea, serpent/creature renderers).
  Coil/wrap logic must go through `coiledEnemies` / `isWrapped` in `src/core/coil.ts`.
- **Charm** (`src/content/charms.ts`): prefer numeric fields over hooks; boss
  charms need a drawback.
- **Enemy** (`src/content/enemies*.ts`): one clear question it asks the player;
  telegraph everything; use helpers from `src/content/ai.ts`; drawing in
  `src/render/creatures.ts` (check it in `?gallery` at 44 px); a tip in
  `src/ui/tips.ts` if it introduces a new mechanic; add it to `ENCOUNTERS`.
- **Layout** (`src/content/layouts.ts`): 17×13, `S` start on the border, no
  isolated wall pockets.
- **Event** (`src/content/events.ts`): 2–3 choices with real trade-offs, `acts`
  if act-specific; next-fight effects via `run.nextFight`.
- **Always:** `npm test` (the fuzzers cover every item, encounter and event
  automatically), look at it (`look` skill), check balance (`balance-check`
  skill), and add a codex-visible text that explains it.

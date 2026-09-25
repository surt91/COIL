---
name: balance-check
description: Measure COIL's balance with the bot after rule, content or number changes, and compare against the targets. Use before shipping anything that could change difficulty.
---

1. Baseline across seeds (each ~1 min):
   `npx tsx scripts/runsim.ts --runs 40 --policy lookahead2 --seed 500` and `--seed 1000`.
   Add `--species viper|python|ouro` or `--depth`-style `--molt N` when relevant.
2. Targets (garden, depth 0): **45–60 %** full-run wins; deaths concentrated at
   the bosses (rows `a1r9`, `a2r9`, `a3r9`); crush share **≥ 25 %** of kills;
   stalls ≤ 3 per 40 runs; flesh entering acts roughly 4 / 10 / 12.
3. Noise: ±8 % at 40 runs. Don't react to a single run set — confirm with a
   second seed or 80 runs before changing numbers.
4. Diagnose outliers with `--verbose` (one JSON line per run: `cause`, `where`,
   `stalledIn`) and single-room stats: `npm run sim -- --runs 200 --room all`.
5. Remember the bot's blind spot: it doesn't plan coils, so coil-centric content
   (Python, Muscle, Python Coils) is underrated by it — humans will do better.
6. Record meaningful before/after numbers in the devlog.
For a deeper analysis, delegate to the `balance-analyst` agent.

---
name: ship
description: Verify, commit, push and confirm the GitHub Pages deployment of COIL. Use after a coherent, finished change.
---

1. `npx tsc --noEmit && npm test` — must be clean. For UI changes also `npm run build`.
2. Commit with a descriptive message (what and why) ending with the attribution
   trailer from the system instructions. Don't commit `screenshots/` or scratch
   `_*.mjs` files (check `git status --short` first).
3. `git push -q origin main` (pushing is allowed).
4. Run `scripts/ci-status.sh` in the background; when it reports `completed
   success`, the build is live at https://surt91.github.io/COIL/. On failure,
   fetch the failing step: `curl -s https://api.github.com/repos/surt91/COIL/actions/runs/<id>/jobs`.
5. If the change is noteworthy, add a devlog entry (see the `devlog` skill) —
   ideally in the same commit.

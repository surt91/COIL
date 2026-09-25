---
name: look
description: Take screenshots of COIL (desktop, phone, a specific fight, the art gallery) and look at them. Use to verify any visual or UI change yourself before shipping.
---

The dev server must run: `curl -s -o /dev/null localhost:5173 || (npx vite --port 5173 --strictPort > /tmp/vite.log 2>&1 &)`.

Quick screenshots with `scripts/shot.mjs <url> <out.png> [actions…]`
(actions: `key:ArrowRight`, `wait:300`, `click:x,y`, `tap:x,y`, `eval:<js>`,
`shot:<file>`; env `W`/`H` for the viewport, `MOBILE=1` for an iPhone 13):

| What | URL |
|---|---|
| Title / new run on the map | `http://localhost:5173/` · `/?seed=7` |
| A debug fight | `/?fight=<layoutId>&enemies=beetle,frog&act=0..2&species=garden\|viper\|python\|ouro&seed=5` |
| Every graphic (style sheet) | `/?gallery` |

Save to `screenshots/` (git-ignored), then **Read the PNG** — never judge a
screenshot you haven't looked at. Zoom into details with PIL:
`python3 -c "from PIL import Image; im=Image.open('a.png').crop((x0,y0,x1,y1)); im.resize((im.width*2, im.height*2)).save('b.png')"`.

For anything scripted beyond that (hover a tile, swipe, read state), write a
throwaway `_*.mjs` in the project root (so `playwright` resolves), launch
`chromium.launch({ executablePath: '/usr/bin/chromium' })`, use
`window.__coil.{fight, dispatch, renderer}` (dev builds only), delete it afterwards.
Tile centres on screen: `renderer.ox + (x + 0.5) * renderer.T` (not rotated);
on phones the board may be rotated (`renderer.rotated`).

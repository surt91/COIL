// Scratch: long-running Playwright driver. POST JS body to http://localhost:PORT/ ; runs as async fn(page, ctx, cdp, h)
import { chromium, devices } from 'playwright';
import http from 'node:http';

const dev = process.argv[2] ?? 'iPhone 13';
const port = Number(process.argv[3] ?? 9301);
let opts;
if (dev === 'landscape') opts = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: devices['iPhone 13'].userAgent };
else opts = { ...devices[dev] };
delete opts.defaultBrowserType;
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const ctx = await browser.newContext(opts);
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const cdp = await ctx.newCDPSession(page);
const h = {
  async tap(x, y) { await page.touchscreen.tap(x, y); await page.waitForTimeout(250); },
  async swipe(x, y, dx, dy, steps = 6) {
    const pt = (px, py) => [{ x: px, y: py, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x, y) });
    for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x + dx * i / steps, y + dy * i / steps) }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
  },
  async shot(name) { await page.screenshot({ path: `/tmp/mob/${name}.png` }); return `/tmp/mob/${name}.png`; },
  // screen center (page coords) of a board tile
  async tileXY(x, y) {
    return page.evaluate(([x, y]) => {
      const r = window.__coil.renderer; const c = document.querySelector('.board-wrap canvas').getBoundingClientRect();
      const f = window.__coil.fight; const T = r.T;
      if (r.rotated) return { x: c.left + r.rx + f.h * T - (y + 0.5) * T, y: c.top + r.ry + (x + 0.5) * T };
      return { x: c.left + r.ox + (x + 0.5) * T, y: c.top + r.oy + (y + 0.5) * T };
    }, [x, y]);
  },
  logs,
};
http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', async () => {
    try {
      const fn = new (Object.getPrototypeOf(async function () {}).constructor)('page', 'ctx', 'cdp', 'h', body);
      const out = await fn(page, ctx, cdp, h);
      const l = logs.splice(0);
      res.end(JSON.stringify(out, null, 1) + (l.length ? '\nLOGS:\n' + l.join('\n') : ''));
    } catch (e) { res.end('ERR ' + e.stack); }
  });
}).listen(port);
console.log('ready', dev, port);

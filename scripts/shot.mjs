// Usage: node scripts/shot.mjs <url> <out.png> [actions...]
// actions: key:ArrowUp  wait:200  click:x,y  eval:js  shot:name.png
import { chromium } from 'playwright';

const [url, out, ...actions] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(400);
for (const a of actions) {
  const i = a.indexOf(':');
  const kind = a.slice(0, i), arg = a.slice(i + 1);
  if (kind === 'key') await page.keyboard.press(arg);
  else if (kind === 'wait') await page.waitForTimeout(Number(arg));
  else if (kind === 'click') { const [x, y] = arg.split(',').map(Number); await page.mouse.click(x, y); }
  else if (kind === 'eval') console.log('eval:', JSON.stringify(await page.evaluate(arg)));
  else if (kind === 'shot') await page.screenshot({ path: arg });
  await page.waitForTimeout(60);
}
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
if (logs.length) console.log(logs.join('\n'));

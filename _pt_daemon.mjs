import { chromium } from 'playwright';
import fs from 'fs';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
globalThis.page = page;
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
globalThis.logs = logs;
await page.goto(process.argv[2] || 'http://localhost:5173/?seed=4242');
fs.writeFileSync('/tmp/pt/ready', '1');
let n = 0;
while (true) {
  if (fs.existsSync('/tmp/pt/cmd.js')) {
    const code = fs.readFileSync('/tmp/pt/cmd.js', 'utf8'); fs.unlinkSync('/tmp/pt/cmd.js');
    let out = '';
    try { const f = new Function('page','logs','fs', `return (async()=>{${code}})()`); const r = await f(page, logs, fs); out = typeof r === 'string' ? r : JSON.stringify(r); } catch (e) { out = 'ERR ' + e.stack; }
    fs.writeFileSync('/tmp/pt/out.txt', out ?? '');
    fs.writeFileSync('/tmp/pt/done', String(++n));
  }
  await new Promise(r => setTimeout(r, 100));
}

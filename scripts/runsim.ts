// npx tsx scripts/runsim.ts --runs 50 --policy lookahead2 --seed 1 [--molt N] [--charm id]  (--charm: granted from the start)
import { POLICIES } from '../src/bot/policies';
import { RunResult, pickByValue, simulateRun } from '../src/bot/runsim';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const runs = Number(opt('runs', '30'));
const seed0 = Number(opt('seed', '1'));
const policy = POLICIES[opt('policy', 'lookahead2')];
const t0 = Date.now();
const res: RunResult[] = [];
for (let i = 0; i < runs; i++) {
  const charm = opt('charm', '');
  const r = simulateRun(seed0 + i, policy, 300, opt('species', 'garden'), Number(opt('molt', '0')), {
    onStart: charm ? (run) => ({ ...run, charms: [...(run.charms ?? []), charm] }) : undefined,
    // The experienced player compares charms; the others take the first one offered.
    pickCharm: opt('policy', 'lookahead2') === 'expert' ? pickByValue : undefined,
  });
  res.push(r);
  if (args.includes('--verbose')) console.log(JSON.stringify(r));
}
const pct = (n: number) => `${Math.round((100 * n) / runs)}%`;
console.log(`${runs} runs in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`victories: ${pct(res.filter((r) => r.won).length)}  stalls: ${res.filter((r) => r.stalled).length}`);
const byAct = [0, 1, 2].map((a) => res.filter((r) => !r.won && r.act === a).length);
console.log(`deaths by act: ${byAct.map((n, a) => `act${a + 1}=${n}`).join(' ')}`);
const rows: Record<string, number> = {};
for (const r of res.filter((r) => !r.won)) rows[`a${r.act + 1}r${r.row}`] = (rows[`a${r.act + 1}r${r.row}`] ?? 0) + 1;
console.log('death rows:', Object.entries(rows).sort().map(([k, v]) => `${k}:${v}`).join(' '));
const causes: Record<string, number> = {};
for (const r of res.filter((r) => !r.won)) causes[r.cause] = (causes[r.cause] ?? 0) + 1;
console.log('causes:', Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
for (let a = 0; a < 3; a++) {
  const xs = res.filter((r) => r.fleshAtAct.length > a).map((r) => r.fleshAtAct[a]);
  if (xs.length) console.log(`flesh entering act ${a + 1}: avg ${(xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1)} (n=${xs.length})`);
}
const kills = res.reduce((s, r) => s + r.kills, 0), coil = res.reduce((s, r) => s + r.coilKills, 0);
console.log(`kills/run ${(kills / runs).toFixed(1)}, crush share ${Math.round((100 * coil) / Math.max(1, kills))}%, fights/run ${(res.reduce((s, r) => s + r.fights, 0) / runs).toFixed(1)}`);

// Fight benchmark: the same fight starts (captured from real bot runs, all acts incl. bosses)
// played by any policy, so policies compare on identical fights.
//   npx tsx scripts/bench.ts gen --runs 60 --out /tmp/bench.json        (capture with lookahead2)
//   npx tsx scripts/bench.ts play --in /tmp/bench.json --policy expert [--shards 12]
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import '../src/content';
import { POLICIES } from '../src/bot/policies';
import { simulateRun } from '../src/bot/runsim';
import { step } from '../src/core/fight';
import { makeRng } from '../src/core/rng';
import type { Fight } from '../src/core/types';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
interface Case { enc: string; act: number; kind: string; seed: number; fight: Fight }
const value = (f: Fight) => f.snake.segs.reduce((a, s) => a + (s.item ? 0 : 1), 0);

if (args[0] === 'gen') {
  const cases: Case[] = [];
  const runs = Number(opt('runs', '60'));
  for (let i = 0; i < runs; i++)
    simulateRun(50000 + i, POLICIES.lookahead2, 300, 'garden', 0, {
      onFight: (f, info) => cases.push({ ...info, seed: 50000 + i, fight: structuredClone(f) }),
    });
  writeFileSync(opt('out', '/tmp/bench.json'), JSON.stringify(cases));
  console.log(`${cases.length} fights from ${runs} runs`);
} else if (args[0] === 'play') {
  const cases: Case[] = JSON.parse(readFileSync(opt('in', '/tmp/bench.json'), 'utf8'));
  const shards = Number(opt('shards', '1'));
  const shard = Number(opt('shard', '-1'));
  const policy = opt('policy', 'lookahead2');
  if (shards > 1 && shard < 0) {
    // Fan out to child processes and aggregate.
    const t0 = Date.now();
    const outs = await Promise.all([...Array(shards).keys()].map((k) => new Promise<string>((res) => {
      const c = spawn('npx', ['tsx', 'scripts/bench.ts', 'play', '--in', opt('in', '/tmp/bench.json'), '--policy', policy, '--shards', String(shards), '--shard', String(k)]);
      let o = '';
      c.stdout.on('data', (d) => (o += d));
      c.stderr.on('data', (d) => process.stderr.write(d));
      c.on('close', () => res(o));
    })));
    const rows = outs.flatMap((o) => o.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    report(rows, policy, (Date.now() - t0) / 1000);
  } else {
    for (let i = 0; i < cases.length; i++) {
      if (shards > 1 && i % shards !== shard) continue;
      const c = cases[i];
      let f = c.fight;
      const r = makeRng(c.seed ^ i);
      const start = value(f);
      const t0 = performance.now();
      for (let n = 0; n < 900 && f.status === 'play' && f.turn < 300; n++) f = step(f, POLICIES[policy](f, r));
      const row = { i, act: c.act, kind: c.kind, enc: c.enc, out: f.status, lost: start - value(f), turns: f.turn, ms: performance.now() - t0 };
      if (shards > 1) console.log(JSON.stringify(row));
      else (globalThis as any).__rows = [...((globalThis as any).__rows ?? []), row];
    }
    if (shards <= 1) report((globalThis as any).__rows ?? [], policy, 0);
  }
}

function report(rows: { act: number; kind: string; out: string; lost: number; turns: number; ms: number }[], policy: string, secs: number) {
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.kind === 'boss' ? `boss a${r.act + 1}` : r.kind === 'elite' ? `elite a${r.act + 1}` : `fight a${r.act + 1}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const line = (k: string, rs: typeof rows) => {
    const won = rs.filter((r) => r.out === 'won');
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    console.log(`${k.padEnd(10)} n=${String(rs.length).padStart(4)}  win ${(100 * won.length / rs.length).toFixed(1).padStart(5)}%  flesh lost (wins) ${avg(won.map((r) => r.lost)).toFixed(2).padStart(5)}  turns ${avg(rs.map((r) => r.turns)).toFixed(0).padStart(3)}  ms/turn ${(avg(rs.map((r) => r.ms)) / Math.max(1, avg(rs.map((r) => r.turns)))).toFixed(1)}`);
  };
  console.log(`policy=${policy}  ${rows.length} fights  ${secs.toFixed(0)}s`);
  for (const k of [...groups.keys()].sort()) line(k, groups.get(k)!);
  line('ALL', rows);
}

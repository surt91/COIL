/**
 * Headless simulation / fuzzing CLI.
 *
 *   npx tsx scripts/sim.ts --runs 200 --policy greedy --seed 1 --room all
 *   npx tsx scripts/sim.ts --runs 100 --policy greedy --chain [--rooms 6]
 *   npx tsx scripts/sim.ts --runs 1 --room lily-pond --seed 1234 --policy random   (repro)
 *
 * Flags: --runs N, --policy random|greedy|lookahead2, --seed S, --room ID|all,
 *        --chain, --rooms N (chain length, default all), --genome a,b,c,
 *        --flesh N (default 4), --cap T (turn cap, default 300), --no-check, --verbose
 */
import { ROOMS } from '../src/content/rooms';
import { ITEMS } from '../src/core/registry';
import { POLICIES } from '../src/bot/policies';
import { FightResult, Issue, STARTER, runChain, runFight } from '../src/bot/simulate';

function parseArgs(argv: string[]) {
  const a: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) continue;
    const k = t.slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) a[k] = true;
    else { a[k] = v; i++; }
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const runs = Number(args.runs ?? 100);
const policyName = String(args.policy ?? 'greedy');
const seed0 = Number(args.seed ?? 1);
const roomArg = String(args.room ?? 'all');
const chain = !!args.chain;
const flesh = Number(args.flesh ?? 4);
const cap = Number(args.cap ?? 300);
const verbose = !!args.verbose;
const genome = typeof args.genome === 'string'
  ? (args.genome === 'all' ? [...ITEMS.values()].filter((d) => d.rarity !== 'signature').map((d) => d.id) : args.genome.split(','))
  : STARTER;
const policy = POLICIES[policyName];
if (!policy) {
  console.error(`unknown policy ${policyName}; have ${Object.keys(POLICIES).join(', ')}`);
  process.exit(2);
}
for (const g of genome) if (!ITEMS.has(g)) { console.error(`unknown item ${g}`); process.exit(2); }
const opts = { turnCap: cap, checkInvariants: !args['no-check'] };

// ---------------------------------------------------------------- run

const t0 = performance.now();
const results: FightResult[] = [];
const depths: number[] = [];
if (chain) {
  const n = Number(args.rooms ?? ROOMS.length);
  for (let i = 0; i < runs; i++) {
    const c = runChain(n, genome, seed0 + i * 1000, policy, opts, flesh);
    results.push(...c.rooms);
    depths.push(c.depth);
  }
} else {
  const rooms = roomArg === 'all' ? ROOMS : ROOMS.filter((r) => r.id === roomArg || String(ROOMS.indexOf(r)) === roomArg);
  if (!rooms.length) { console.error(`unknown room ${roomArg}; have ${ROOMS.map((r) => r.id).join(', ')}`); process.exit(2); }
  for (const room of rooms) for (let i = 0; i < runs; i++) results.push(runFight(room, genome, flesh, seed0 + i, policy, opts));
}
const elapsed = performance.now() - t0;

// ---------------------------------------------------------------- report

const pct = (x: number, n: number) => (n ? `${Math.round((100 * x) / n)}%` : '-');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pad = (s: string | number, n: number) => String(s).padStart(n);
const padR = (s: string | number, n: number) => String(s).padEnd(n);
const add = (into: Record<string, number>, from: Record<string, number>) => { for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v; };

console.log(`policy=${policyName} runs=${runs} seed=${seed0} ${chain ? 'chain' : `room=${roomArg}`} genome=[${genome.join(',')}] flesh=${flesh} cap=${cap}`);
console.log(`${results.length} fights in ${(elapsed / 1000).toFixed(1)}s (${(elapsed / Math.max(1, results.length)).toFixed(0)} ms/fight)\n`);

const CAUSES = ['bite', 'crush', 'poison', 'spine', 'other'];
const roomIds = ROOMS.map((r) => r.id).filter((id) => results.some((r) => r.room === id));
const header = `${padR('room', 14)} ${pad('n', 4)} ${pad('win', 5)} ${pad('dead', 5)} ${pad('stall', 5)} ${pad('lock', 4)} ${pad('err', 4)} ${pad('turns', 6)} ${pad('lost', 5)} ${pad('hungr', 5)} ${pad('kills', 5)} | ${CAUSES.map((c) => pad(c, 6)).join(' ')}`;
console.log(header);
console.log('-'.repeat(header.length));
const row = (label: string, rs: FightResult[]) => {
  const n = rs.length;
  const kills: Record<string, number> = {};
  rs.forEach((r) => add(kills, r.kills));
  const totalK = Object.values(kills).reduce((a, b) => a + b, 0);
  console.log(
    `${padR(label, 14)} ${pad(n, 4)} ${pad(pct(rs.filter((r) => r.outcome === 'won').length, n), 5)} ${pad(pct(rs.filter((r) => r.outcome === 'dead').length, n), 5)} ` +
      `${pad(pct(rs.filter((r) => r.outcome === 'stalled').length, n), 5)} ${pad(rs.filter((r) => r.outcome === 'softlock').length, 4)} ${pad(rs.filter((r) => r.outcome === 'error').length, 4)} ` +
      `${pad(avg(rs.map((r) => r.turns)).toFixed(1), 6)} ${pad(avg(rs.map((r) => r.segsLost)).toFixed(1), 5)} ${pad(avg(rs.map((r) => r.hungerLost)).toFixed(1), 5)} ` +
      `${pad((totalK / Math.max(1, n)).toFixed(1), 5)} | ${CAUSES.map((c) => pad(pct(kills[c] ?? 0, totalK), 6)).join(' ')}`,
  );
};
for (const id of roomIds) row(id, results.filter((r) => r.room === id));
console.log('-'.repeat(header.length));
row('ALL', results);
console.log('(lock/err = softlocks / exceptions (counts); turns = avg turns; lost = avg segments destroyed by attacks incl. severed; hungr = avg lost to hunger; kills = per fight; right: kill share by cause)');

if (chain) {
  const n = Number(args.rooms ?? ROOMS.length);
  const hist = new Array(n + 1).fill(0);
  depths.forEach((d) => hist[d]++);
  console.log(`\nchain: rooms cleared per run  avg ${avg(depths).toFixed(2)} / ${n}`);
  console.log('  ' + hist.map((c, d) => `${d}:${pct(c, depths.length)}`).join('  '));
  const reach = roomIds.map((id) => `${id} ${results.filter((r) => r.room === id).length}`).join(', ');
  console.log(`  runs reaching room: ${reach}`);
  const fleshIn = ROOMS.slice(0, n).map((_, i) => {
    const rs = results.filter((r) => r.room === ROOMS[i].id);
    return `${ROOMS[i].id} ${avg(rs.map((r) => r.segsStart - genome.length)).toFixed(1)}`;
  });
  console.log(`  avg flesh entering: ${fleshIn.join(', ')}`);
}

// Cards played per fight, by item.
const cards: Record<string, number> = {};
results.forEach((r) => add(cards, r.cards));
const winCards: Record<string, number> = {};
const lossCards: Record<string, number> = {};
results.filter((r) => r.outcome === 'won').forEach((r) => add(winCards, r.cards));
results.filter((r) => r.outcome !== 'won').forEach((r) => add(lossCards, r.cards));
const nWon = results.filter((r) => r.outcome === 'won').length;
const nLost = results.length - nWon;
console.log('\ncards played per fight (all | in won | in lost):');
const cardIds = [...new Set([...genome, ...Object.keys(cards)])].sort((a, b) => (cards[b] ?? 0) - (cards[a] ?? 0));
for (const id of cardIds) {
  const per = (cards[id] ?? 0) / Math.max(1, results.length);
  console.log(`  ${padR(id, 10)} ${pad(per.toFixed(2), 5)} | ${pad(((winCards[id] ?? 0) / Math.max(1, nWon)).toFixed(2), 5)} | ${pad(((lossCards[id] ?? 0) / Math.max(1, nLost)).toFixed(2), 5)}${genome.includes(id) ? '' : '  (signature)'}`);
}

// Death causes.
const deaths: Record<string, number> = {};
const dead = results.filter((r) => r.outcome === 'dead');
dead.forEach((r) => (deaths[r.deathCause ?? '?'] = (deaths[r.deathCause ?? '?'] ?? 0) + 1));
console.log(`\ndeath causes (${dead.length} deaths): ` + (Object.entries(deaths).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, dead.length)}`).join(', ') || '-'));
const deathsByRoom = roomIds
  .map((id) => {
    const d: Record<string, number> = {};
    dead.filter((r) => r.room === id).forEach((r) => (d[r.deathCause ?? '?'] = (d[r.deathCause ?? '?'] ?? 0) + 1));
    const s = Object.entries(d).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
    return s ? `  ${padR(id, 14)} ${s}` : '';
  })
  .filter(Boolean);
if (deathsByRoom.length) console.log(deathsByRoom.join('\n'));

// Bugs.
const issues: Issue[] = results.flatMap((r) => r.issues);
console.log(`\nissues: ${issues.length}`);
const byMsg = new Map<string, Issue[]>();
for (const is of issues) {
  const k = `${is.kind}: ${is.message.split('\n')[0].replace(/\(.*?\)|#\d+|\d+/g, '#')}`;
  if (!byMsg.has(k)) byMsg.set(k, []);
  byMsg.get(k)!.push(is);
}
for (const [k, list] of [...byMsg.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const ex = list[0];
  console.log(`  [${list.length}x] ${k}`);
  console.log(`      e.g. room=${ex.room} seed=${ex.seed} action#${ex.actionIndex} turn=${ex.turn}${ex.action ? ` action=${JSON.stringify(ex.action)}` : ''}`);
  console.log(`      repro: npx tsx scripts/sim.ts --runs 1 --policy ${policyName} --room ${ex.room} --seed ${ex.seed}${genome === STARTER ? '' : ` --genome ${genome.join(',')}`} --verbose`);
  if (verbose) console.log('      ' + ex.message.split('\n').slice(0, 8).join('\n      '));
}
const slow = results.reduce((a, b) => (b.ms > a.ms ? b : a), results[0]);
if (slow) console.log(`\nslowest fight: ${slow.room} seed=${slow.seed} ${slow.ms.toFixed(0)}ms (${slow.turns} turns, ${slow.actions} actions)`);

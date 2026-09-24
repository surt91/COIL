// Tiny CLI to play a fight turn by turn: state kept in /tmp/coil-play.json
//   npx tsx scripts/play.ts new <seed> [layoutId] [enemies,comma,sep]
//   npx tsx scripts/play.ts U|R|D|L          move
//   npx tsx scripts/play.ts p<slot>[U|R|D|L]  play hand slot (1-3), e.g. p2R
//   npx tsx scripts/play.ts t                tuck
import { readFileSync, writeFileSync } from 'node:fs';
import '../src/content';
import { LAYOUTS } from '../src/content/layouts';
import { createFight, step } from '../src/core/fight';
import type { Action, Fight } from '../src/core/types';
import { STARTER } from '../src/core/run';
import { renderAscii } from '../src/render/ascii';

const FILE = '/tmp/coil-play.json';
const [cmd, ...rest] = process.argv.slice(2);
let f: Fight;
if (cmd === 'new') {
  const seed = Number(rest[0] ?? 1);
  const layout = LAYOUTS.find((l) => l.id === rest[1]) ?? LAYOUTS[0];
  f = createFight({ rows: layout.rows, genome: STARTER, flesh: 5, seed, place: (rest[2] ?? 'beetle,beetle,frog').split(',') });
} else {
  f = JSON.parse(readFileSync(FILE, 'utf8'));
  const D = { U: 0, R: 1, D: 2, L: 3 } as const;
  for (const c of cmd.split(' ')) {
    let a: Action;
    if (c === 't') a = { t: 'tuck' };
    else if (c[0] === 'p') a = { t: 'play', slot: Number(c[1]) - 1, dir: c[2] ? D[c[2] as 'U'] : undefined };
    else a = { t: 'move', dir: D[c as 'U'] };
    const g = step(f, a);
    if (g.events.length === 0 && a.t !== 'tuck') console.log(`!! action ${c} had no effect`);
    f = g;
    const ev = f.events.filter((e) => e.t !== 'move').map((e) => e.t + ('cause' in e ? `(${e.cause})` : '') + ('dmg' in e ? `-${e.dmg}` : ''));
    if (ev.length) console.log(`${c}: ${ev.join(', ')}`);
  }
}
writeFileSync(FILE, JSON.stringify(f));
console.log(renderAscii(f).join('\n'));

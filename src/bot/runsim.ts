/** Full-run simulation: map choices, rewards, shops, events — with a fight policy. */
import '../content';
import { EVENTS } from '../content/events';
import { step } from '../core/fight';
import { ITEMS } from '../core/registry';
import { Rng, makeRng, pick } from '../core/rng';
import { NodeKind, RunState, bask, buy, canUpgrade, fleshCap, upgradeItem, createRun, enterNode, eventChoice, finishFight, reachable, recordEvents, takeCharm, takeReward, toMap } from '../core/run';
import type { Fight, ItemId } from '../core/types';
import type { Policy } from './policies';

export interface RunResult {
  seed: number;
  won: boolean;
  act: number;
  row: number;
  cause: string;
  where: string;
  fleshAtAct: number[];
  genomeSize: number;
  kills: number;
  coilKills: number;
  fights: number;
  stalled: boolean;
  stalledIn: string[];
  /** One entry per fight: encounter, act, turns, flesh at start / lowest / end, food and enemies eaten, outcome. */
  fightLog: { enc: string; act: number; turns: number; start: number; low: number; end: number; ate: number; hunger: number; out: string }[];
}

/** Rough item tier list for the reward picker. */
const TIER: Record<string, number> = {
  python: 9, venom: 8, lunge: 7, fang: 6, muscle: 6, egg: 6, heart: 6, acid: 6, strike: 6, hood: 5, spine: 5,
  scale: 5, swallow: 5, ouroboros: 5, sprint: 4, reserve: 4, gorge: 3, rattle: 4, reverse: 3, tailwhip: 3,
  kinetic: 2, molt: 3, shed: 1, heatpit: 5, scute: 4, knot: 4,
};
const tier = (id: ItemId) => (TIER[id.replace('+', '')] ?? 3) + (id.endsWith('+') ? 1 : 0);

/**
 * Arrange the genome ring so strong items are spread evenly (tier-sorted into
 * every other slot): any arc, and so every opening hand, gets some of them.
 */
function arrangeGenome(run: RunState): RunState {
  if (process.env.NOORDER) return run;
  const sorted = [...run.genome].sort((a, b) => tier(b) - tier(a));
  const n = sorted.length;
  const slots = [...Array(n).keys()].filter((i) => i % 2 === 0).concat([...Array(n).keys()].filter((i) => i % 2 === 1));
  const genome: ItemId[] = new Array(n);
  sorted.forEach((id, i) => (genome[slots[i]] = id));
  return { ...run, genome };
}

function chooseNode(run: RunState, r: Rng): number {
  const opts = reachable(run).map((id) => run.map[id]);
  const want = (k: NodeKind) => {
    if (k === 'bask') return run.flesh < 6 ? 10 : 2;
    if (k === 'pool') return run.flesh >= 8 ? 6 : 1;
    // Near the carry cap (6/8/10): elites are what a healthy run should take.
    if (k === 'elite') return run.flesh >= fleshCap(run) - 2 ? 5 : 0.5;
    if (k === 'nest') return 5;
    if (k === 'event') return 3;
    return 4;
  };
  const best = Math.max(...opts.map((n) => want(n.kind)));
  return pick(r, opts.filter((n) => want(n.kind) === best)).id;
}

/** Optional hooks for experiments: see every fight as it starts (e.g. to snapshot a benchmark). */
export interface RunHooks {
  onFight?: (f: Fight, info: { enc: string; act: number; kind: NodeKind }) => void;
}

export function simulateRun(seed: number, policy: Policy, turnCap = 300, species = 'garden', molt = 0, hooks: RunHooks = {}): RunResult {
  const r = makeRng(seed ^ 0x5bd1e995);
  let run = createRun(seed, molt, undefined, species);
  const fleshAtAct = [run.flesh];
  let fights = 0, stalled = false;
  const fightLog: RunResult['fightLog'] = [];
  const stalledIn: string[] = [];
  for (let guard = 0; guard < 500; guard++) {
    const sc = run.screen;
    if (sc.t === 'victory' || sc.t === 'dead') break;
    if (sc.t === 'map') {
      if (fleshAtAct.length <= run.act) fleshAtAct.push(run.flesh);
      run = enterNode(arrangeGenome(run), chooseNode(run, r));
    } else if (sc.t === 'fight') {
      let f: Fight = sc.fight;
      fights++;
      hooks.onFight?.(f, { enc: sc.encounter, act: run.act, kind: run.map[sc.node].kind });
      const fleshOf = (x: Fight) => x.snake.segs.filter((g) => !g.item).length;
      const entry = { enc: sc.encounter, act: run.act, turns: 0, start: fleshOf(f), low: fleshOf(f), end: 0, ate: 0, hunger: 0, out: '' };
      for (let i = 0; i < turnCap * 3 && f.status === 'play' && f.turn < turnCap; i++) {
        f = step(f, policy(f, r));
        run = recordEvents(run, f.events);
        entry.low = Math.min(entry.low, fleshOf(f));
        for (const e of f.events) {
          if (e.t === 'eat') entry.ate++;
          if (e.t === 'hunger') entry.hunger++;
        }
      }
      Object.assign(entry, { turns: f.turn, end: fleshOf(f), out: f.status });
      fightLog.push(entry);
      if (f.status === 'play') {
        stalled = true;
        stalledIn.push(sc.encounter);
        f = { ...f, status: 'dead', events: [{ t: 'death', cause: 'stalled' }] };
      }
      run = finishFight(run, f);
    } else if (sc.t === 'reward') {
      if (sc.charms?.length && !sc.charmTaken && !process.env.NOCHARM) run = takeCharm(run, 0);
      const best = sc.options.map((id, i) => [tier(id), i] as const).sort((a, b) => b[0] - a[0])[0];
      run = takeReward(run, best && best[0] >= 4 && run.genome.length < 14 ? best[1] : null);
    } else if (sc.t === 'pool') {
      const i = sc.stock.findIndex((s) => !s.sold && run.flesh - s.price >= 6 && tier(s.item) >= 5);
      run = i >= 0 ? buy(run, i) : toMap(run);
      if (i < 0) continue;
      run = toMap(run);
    } else if (sc.t === 'bask') {
      const up = run.genome.map((g, i) => [tier(g), i, g] as const).filter(([, , g]) => canUpgrade(g)).sort((a, b) => b[0] - a[0])[0];
      run = toMap(run.flesh >= fleshCap(run) - 2 && up ? upgradeItem(run, up[1]) : bask(run));
    } else if (sc.t === 'event') {
      const ev = EVENTS.find((e) => e.id === sc.id)!;
      const idx = ev.choices.findIndex((c) => !c.canChoose || c.canChoose(run));
      run = toMap(eventChoice(run, idx));
    }
  }
  const sc = run.screen;
  const node = run.at !== null ? run.map[run.at] : null;
  return {
    seed,
    won: sc.t === 'victory',
    act: run.act,
    row: node?.row ?? 0,
    cause: sc.t === 'dead' ? sc.cause : sc.t === 'victory' ? '' : 'timeout',
    where: sc.t === 'dead' ? sc.where : '',
    fleshAtAct,
    genomeSize: run.genome.length,
    kills: run.stats.kills,
    coilKills: run.stats.coilKills,
    fights,
    stalled,
    stalledIn,
    fightLog,
  };
}

export const itemName = (id: ItemId) => ITEMS.get(id)?.name ?? id;

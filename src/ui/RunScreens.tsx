import { useEffect, useState } from 'preact/hooks';
import { stinger, uiClick } from '../audio/audio';
import { EVENTS } from '../content/events';
import { CHARMS, ITEMS, item } from '../core/registry';
import {
  ACT_NAMES, BASK_FLESH, MAP_COLS, MOLTS, MAP_ROWS, NodeKind, RunState, Screen,
  bask, buy, buyCharm, canUpgrade, enterNode, eventChoice, fleshCap, genomeDraw, reachable, removeItem, takeCharm, takeReward, toMap, upgradeItem,
} from '../core/run';
import type { ItemId } from '../core/types';
import { CardArt } from './CardArt';
import { GlyphIcon } from './GlyphIcon';

type SetRun = (r: RunState) => void;

export function ItemCard({ id, onClick, footer, disabled, compact }: {
  id: ItemId; onClick?: () => void; footer?: preact.ComponentChildren; disabled?: boolean; compact?: boolean;
}) {
  const d = item(id);
  return (
    <button class={`card item-card ${disabled ? 'disabled' : ''} ${compact ? 'compact' : ''}`} style={{ '--c': d.color }} onClick={disabled ? undefined : onClick}>
      {!compact && <CardArt id={id} width={238} height={84} />}
      <div class="card-top">
        <GlyphIcon glyph={d.glyph} color={d.color} size={compact ? 22 : 30} />
        <span class="card-name">{d.name}</span>
        {d.base && <span class="molted" title="Molted (upgraded)">✦</span>}
        <span class={`rarity r-${d.rarity}`}>{d.rarity}</span>
      </div>
      {!compact && d.activeText && <div class="card-text">{d.active?.move ? <b class="tag">MOVE </b> : null}{d.activeText}</div>}
      {!compact && d.passiveText && <div class="card-passive">While carried: {d.passiveText}</div>}
      {footer && <div class="card-footer">{footer}</div>}
    </button>
  );
}

export function CharmCard({ id, onClick, footer, disabled }: { id: string; onClick?: () => void; footer?: string; disabled?: boolean }) {
  const c = CHARMS.get(id)!;
  return (
    <button class={`card item-card charm ${disabled ? 'disabled' : ''}`} style={{ '--c': c.color }} onClick={disabled ? undefined : onClick}>
      <CardArt id={id} width={238} height={84} />
      <div class="card-top">
        <GlyphIcon glyph={c.glyph} color={c.color} size={30} />
        <span class="card-name">{c.name}</span>
        <span class="rarity">charm</span>
      </div>
      <div class="card-text">{c.text}</div>
      {footer && <div class="card-footer">{footer}</div>}
    </button>
  );
}

/** Pick an item to molt; shows the current and upgraded version side by side on hover. */
export function UpgradePicker({ run, onPick, onCancel }: { run: RunState; onPick(idx: number): void; onCancel(): void }) {
  const [hover, setHover] = useState<number | null>(null);
  const opts = run.genome.map((id, i) => [id, i] as const).filter(([id]) => canUpgrade(id));
  const h = hover !== null ? run.genome[hover] : opts[0]?.[0];
  return (
    <div class="upgrade-pick">
      <p>Choose an item to molt. It grows back stronger — for the rest of the run.</p>
      <div class="choices small">
        {opts.map(([id, i]) => (
          <div onMouseEnter={() => setHover(i)}><ItemCard id={id} compact onClick={() => onPick(i)} /></div>
        ))}
        {opts.length === 0 && <p class="dim">Nothing left to molt.</p>}
      </div>
      {h && canUpgrade(h) && (
        <div class="upgrade-compare">
          <ItemCard id={h} />
          <span class="arrow">→</span>
          <ItemCard id={item(h).upgrade!} />
        </div>
      )}
      <button class="btn" onClick={onCancel}>Cancel</button>
    </div>
  );
}

/** Full-screen overlay: every genome item as a full card, plus charms. */
export function GenomeView({ run, onClose }: { run: RunState; onClose(): void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      // Swallow all keys while open so the fight underneath doesn't react.
      e.stopImmediatePropagation();
      if (e.key === 'Escape' || e.key === 'g' || e.key === 'G') onClose();
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, []);
  const sorted = [...run.genome].sort((a, b) => item(a).name.localeCompare(item(b).name));
  return (
    <div class="genome-view" onClick={onClose}>
      <div class="genome-view-inner" onClick={(e) => e.stopPropagation()}>
        <div class="codex-head">
          <h2>Your genome</h2>
          <span class="dim">{run.genome.length} items · {Math.min(genomeDraw(run), run.genome.length)} random ones grow on you each room · {run.flesh}/{fleshCap(run)} flesh</span>
          <button class="btn" onClick={onClose}>Close <kbd>G</kbd></button>
        </div>
        {(run.charms ?? []).length > 0 && (
          <>
            <h3>Charms</h3>
            <div class="choices">{(run.charms ?? []).map((c) => <CharmCard id={c} />)}</div>
          </>
        )}
        <h3>Items</h3>
        <div class="choices">{sorted.map((id) => <ItemCard id={id} footer={item(id).upgrade ? <span class="dim">Molts into {item(item(id).upgrade!).name}</span> : item(id).base ? <span>✦ molted</span> : undefined} />)}</div>
      </div>
    </div>
  );
}

export function GenomePanel({ run, inFight }: { run: RunState; inFight?: boolean }) {
  const counts = new Map<ItemId, number>();
  for (const g of run.genome) counts.set(g, (counts.get(g) ?? 0) + 1);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.key === 'g' || e.key === 'G') && !open) setOpen(true);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  return (
    <div class="genome">
      {open && <GenomeView run={run} onClose={() => setOpen(false)} />}
      <button class="btn view-genome" onClick={() => setOpen(true)}>View genome <kbd>G</kbd></button>
      <h3>Genome <span class="dim">({run.genome.length} items · {Math.min(genomeDraw(run), run.genome.length)} grow each room)</span></h3>
      {inFight
        ? <div class="flesh-line dim">Brought {run.flesh} flesh into this room · carry up to {fleshCap(run)} out</div>
        : <div class="flesh-line"><b>{run.flesh}</b> / {fleshCap(run)} flesh <span class="dim">— health & currency</span></div>}
      {(run.charms ?? []).length > 0 && (
        <div class="charm-row">
          {(run.charms ?? []).map((id) => {
            const c = CHARMS.get(id);
            return c ? <span class="charm-chip" title={`${c.name}: ${c.text}`} style={{ '--c': c.color }}><GlyphIcon glyph={c.glyph} color={c.color} size={24} /> {c.name}</span> : null;
          })}
        </div>
      )}
      <ul>
        {[...counts].map(([id, n]) => {
          const d = ITEMS.get(id)!;
          return (
            <li title={[d.activeText, d.passiveText && `Passive: ${d.passiveText}`].filter(Boolean).join('\n')}>
              <GlyphIcon glyph={d.glyph} color={d.color} size={28} /> <span>{d.name}{d.base ? ' ✦' : ''}{n > 1 ? ` ×${n}` : ''}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const NODE_ICON: Record<NodeKind, string> = {
  fight: '⚔', elite: '☠', nest: '◉', pool: '≋', bask: '☀', event: '?', boss: '♛',
};
const NODE_NAME: Record<NodeKind, string> = {
  fight: 'Fight', elite: 'Elite', nest: 'Nest (item)', pool: 'Molting Pool (shop)', bask: 'Bask (rest)', event: 'Unknown', boss: 'Boss',
};

export function MapScreen({ run, setRun }: { run: RunState; setRun: SetRun }) {
  const reach = new Set(reachable(run));
  const W = 560, H = 760, padX = 60, padY = 50;
  const px = (col: number) => padX + (col / (MAP_COLS - 1)) * (W - 2 * padX);
  const py = (row: number) => H - padY - (row / (MAP_ROWS - 1)) * (H - 2 * padY);
  const [hover, setHover] = useState<number | null>(null);
  const visitedPath = new Set<number>();
  // approximate: current node and everything below it that leads to it is not tracked; highlight current
  if (run.at !== null) visitedPath.add(run.at);
  return (
    <div class="screen map-screen">
      <div class="map-col">
        <h2>Act {run.act + 1}: {ACT_NAMES[run.act]}</h2>
        <svg width={W} height={H} class="map">
          {run.map.flatMap((n) =>
            n.next.map((m) => {
              const t = run.map[m];
              const active = run.at === n.id && reach.has(m);
              const path = run.path ?? [];
              const walked = path.includes(n.id) && path.includes(m) && path.indexOf(m) === path.indexOf(n.id) + 1;
              return <line x1={px(n.col)} y1={py(n.row)} x2={px(t.col)} y2={py(t.row)} class={`edge ${active ? 'active' : ''} ${walked ? 'walked' : ''}`} />;
            }),
          )}
          {run.map.map((n) => {
            const can = reach.has(n.id);
            const here = run.at === n.id;
            const visited = (run.path ?? []).includes(n.id) && !here;
            const passed = run.at !== null && n.row <= run.map[run.at].row && !here && !visited;
            return (
              <g
                class={`node k-${n.kind} ${can ? 'can' : ''} ${here ? 'here' : ''} ${passed ? 'passed' : ''} ${visited ? 'visited' : ''}`}
                transform={`translate(${px(n.col)},${py(n.row)})`}
                onClick={() => { if (can) { uiClick(); if (n.kind === 'boss') stinger('boss'); setRun(enterNode(run, n.id)); } }}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
              >
                <circle r={n.kind === 'boss' ? 32 : 24} />
                <text dy="0.35em">{NODE_ICON[n.kind]}</text>
              </g>
            );
          })}
        </svg>
        <div class="map-hint">{hover !== null ? NODE_NAME[run.map[hover].kind] : 'Choose your path. Paths only go upward.'}</div>
      </div>
      <aside class="side">
        <GenomePanel run={run} />
        <Legend />
      </aside>
    </div>
  );
}

function Legend() {
  return (
    <ul class="map-legend">
      {(Object.keys(NODE_ICON) as NodeKind[]).map((k) => (
        <li><span class={`dot k-${k}`}>{NODE_ICON[k]}</span> {NODE_NAME[k]}</li>
      ))}
    </ul>
  );
}

export function RewardScreen({ run, setRun, screen }: { run: RunState; setRun: SetRun; screen: Extract<Screen, { t: 'reward' }> }) {
  return (
    <div class="screen center-screen">
      <h2>{screen.title}</h2>
      <p class="dim">Choose an item to add to your genome. It will grow on your body in every room from now on.</p>
      {run.lastRoom && (
        <div class="ledger">
          <span>Items played <b>{run.lastRoom.played}</b>{run.lastRoom.regrown ? ` → +${run.lastRoom.regrown} flesh regrown` : ''}</span>
          <span class={run.lastRoom.wasted ? 'bad' : ''}>Destroyed unplayed <b>{run.lastRoom.wasted}</b>{run.lastRoom.wasted ? ' (their effects were lost — they’re back now)' : ''}</span>
        </div>
      )}
      <p class="dim small">You carry <b>{run.flesh}</b> of at most {fleshCap(run)} flesh (temporary items were digested into flesh{run.flesh >= fleshCap(run) ? '; anything beyond the cap was too much to carry' : ''}).</p>
      {screen.itemTaken ? <h3>Item chosen</h3> : (
        <div class="choices">
          {screen.options.map((id, i) => (
            <ItemCard id={id} onClick={() => { stinger('reward'); setRun(takeReward(run, i)); }} />
          ))}
        </div>
      )}
      {screen.charms && screen.charms.length > 0 && (
        <>
          <h3>{screen.charmTaken ? 'Charm taken' : 'And choose a charm'}</h3>
          {!screen.charmTaken && <div class="choices">{screen.charms.map((c, i) => <CharmCard id={c} onClick={() => { stinger('reward'); setRun(takeCharm(run, i)); }} />)}</div>}
        </>
      )}
      {!screen.itemTaken && <button class="btn" onClick={() => { uiClick(); setRun(takeReward(run, null)); }}>Skip the item — digest it instead (+{screen.skipFlesh} flesh)</button>}
      {screen.itemTaken && !screen.charmTaken && <button class="btn" onClick={() => { uiClick(); setRun(toMap(run)); }}>Leave the charm</button>}
      <GenomePanel run={run} />
    </div>
  );
}

export function PoolScreen({ run, setRun: setRun0, screen }: { run: RunState; setRun: SetRun; screen: Extract<Screen, { t: 'pool' }> }) {
  const [removing, setRemoving] = useState(false);
  const [molting, setMolting] = useState(false);
  const [undoStack, setUndo] = useState<RunState[]>([]);
  const setRun = (r: RunState) => {
    if (r !== run && r.screen.t === 'pool') setUndo((u) => [...u, run]);
    setRun0(r);
  };
  return (
    <div class="screen center-screen">
      <h2>Molting Pool</h2>
      <p class="dim">Old skins drift in the warm water. Trade flesh for new growths — or shed what you don't need. You have <b>{run.flesh}</b> flesh.</p>
      <div class="choices">
        {screen.stock.map((s, i) => (
          <ItemCard
            id={s.item}
            disabled={s.sold || run.flesh < s.price}
            onClick={() => { uiClick(); setRun(buy(run, i)); }}
            footer={s.sold ? 'sold' : `${s.price} flesh${run.flesh >= s.price ? ` → leaves ${run.flesh - s.price}` : ''}`}
          />
        ))}
      </div>
      {screen.charm && (
        <CharmCard
          id={screen.charm.id}
          disabled={screen.charm.sold || run.flesh < screen.charm.price}
          onClick={() => { uiClick(); setRun(buyCharm(run)); }}
          footer={screen.charm.sold ? 'sold' : `${screen.charm.price} flesh`}
        />
      )}
      {screen.moltPrice !== undefined && !molting && (
        <button class="btn" disabled={screen.molted || run.flesh < screen.moltPrice || !run.genome.some(canUpgrade)} onClick={() => setMolting(true)}>
          {screen.molted ? 'Already molted here' : `Molt an item (${screen.moltPrice} flesh)`}
        </button>
      )}
      {molting && <UpgradePicker run={run} onPick={(i) => { stinger('reward'); setRun(upgradeItem(run, i)); setMolting(false); }} onCancel={() => setMolting(false)} />}
      {!removing ? (
        <button class="btn" disabled={screen.removed || run.flesh < screen.removePrice || run.genome.length <= 1} onClick={() => setRemoving(true)}>
          {screen.removed ? 'Already shed an item here' : `Shed an item (${screen.removePrice} flesh)`}
        </button>
      ) : (
        <div class="remove-pick">
          <p>Choose an item to remove:</p>
          <div class="choices small">
            {run.genome.map((id, i) => (
              <ItemCard id={id} compact onClick={() => { uiClick(); setRun(removeItem(run, i)); setRemoving(false); }} />
            ))}
          </div>
          <button class="btn" onClick={() => setRemoving(false)}>Cancel</button>
        </div>
      )}
      <div class="title-buttons">
        {undoStack.length > 0 && <button class="btn" onClick={() => { uiClick(); setRun0(undoStack[undoStack.length - 1]); setUndo((u) => u.slice(0, -1)); }}>Undo last purchase</button>}
        <button class="btn primary" onClick={() => { uiClick(); setRun0(toMap(run)); }}>Leave</button>
      </div>
      <GenomePanel run={run} />
    </div>
  );
}

export function BaskScreen({ run, setRun, screen }: { run: RunState; setRun: SetRun; screen: Extract<Screen, { t: 'bask' }> }) {
  const [mode, setMode] = useState<'choose' | 'remove' | 'molt'>('choose');
  const full = run.flesh >= fleshCap(run);
  const canMolt = run.genome.some(canUpgrade);
  return (
    <div class="screen center-screen">
      <h2>A Warm Stone</h2>
      <p class="dim">Sunlight falls through the leaves. There is time for one thing.</p>
      {!screen.done && mode === 'choose' && (
        <div class="choices">
          <button class={`card big-choice ${full ? 'disabled' : ''}`} onClick={() => { if (!full) { uiClick(); setRun(bask(run)); } }}>
            <div class="card-name">Bask</div>
            <div class="card-text">
              {full ? `You are already full (${run.flesh}/${fleshCap(run)} flesh).` : `Regrow ${Math.min(BASK_FLESH, fleshCap(run) - run.flesh)} flesh (${run.flesh} → ${Math.min(fleshCap(run), run.flesh + BASK_FLESH)}).`}
            </div>
          </button>
          <button class={`card big-choice ${canMolt ? '' : 'disabled'}`} onClick={() => canMolt && setMode('molt')}>
            <div class="card-name">Molt</div>
            <div class="card-text">Shed your skin: upgrade one item for the rest of the run.</div>
          </button>
          <button class={`card big-choice ${run.genome.length > 1 ? '' : 'disabled'}`} onClick={() => run.genome.length > 1 && setMode('remove')}>
            <div class="card-name">Scrape</div>
            <div class="card-text">Rub an item off against the stone: remove it from your genome.</div>
          </button>
        </div>
      )}
      {!screen.done && mode === 'remove' && (
        <>
          <div class="choices small">
            {run.genome.map((id, i) => (
              <ItemCard id={id} compact onClick={() => { uiClick(); setRun(removeItem(run, i, true)); setMode('choose'); }} />
            ))}
          </div>
          <button class="btn" onClick={() => setMode('choose')}>Cancel</button>
        </>
      )}
      {!screen.done && mode === 'molt' && (
        <UpgradePicker run={run} onPick={(i) => { stinger('reward'); setRun(upgradeItem(run, i)); setMode('choose'); }} onCancel={() => setMode('choose')} />
      )}
      {screen.done && <p>You feel renewed.</p>}
      <button class="btn primary" onClick={() => { uiClick(); setRun(toMap(run)); }}>{screen.done ? 'Move on' : 'Skip'}</button>
      <GenomePanel run={run} />
    </div>
  );
}

export function EventScreen({ run, setRun, screen }: { run: RunState; setRun: SetRun; screen: Extract<Screen, { t: 'event' }> }) {
  const ev = EVENTS.find((e) => e.id === screen.id)!;
  return (
    <div class="screen center-screen event">
      <h2>{ev.title}</h2>
      <p class="event-text">{ev.text}</p>
      {screen.result === null ? (
        <div class="event-choices">
          {ev.choices.map((c, i) => {
            const ok = !c.canChoose || c.canChoose(run);
            return (
              <button class="btn choice" disabled={!ok} onClick={() => { uiClick(); setRun(eventChoice(run, i)); }}>
                {c.label}
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <p class="event-result">{screen.result}</p>
          <button class="btn primary" onClick={() => { uiClick(); setRun(toMap(run)); }}>Continue</button>
        </>
      )}
      <GenomePanel run={run} />
    </div>
  );
}

export function EndScreen({ run, onDone }: { run: RunState; onDone: () => void }) {
  const s = run.stats;
  const won = run.screen.t === 'victory';
  return (
    <div class="screen center-screen">
      <h1 class={won ? 'win' : 'lose'}>{won ? 'The circle is complete' : 'Your coil unwinds'}</h1>
      {won && <p>You devoured the Ouroboros. {(run.molt ?? 0) + 1 < MOLTS.length ? `Molt ${(run.molt ?? 0) + 1} unlocked: ${MOLTS[(run.molt ?? 0) + 1]}` : 'You have shed every skin.'}</p>}
      {run.screen.t === 'dead' && <p>Killed by <b>{run.screen.cause}</b> in {run.screen.where}.</p>}
      <table class="stats">
        <tbody>
          <tr><td>Rooms cleared</td><td>{s.rooms}</td></tr>
          <tr><td>Enemies killed</td><td>{s.kills}</td></tr>
          <tr><td>…of those crushed in coils</td><td>{s.coilKills}</td></tr>
          <tr><td>Things eaten</td><td>{s.eaten}</td></tr>
          <tr><td>Segments lost</td><td>{s.lostSegments}</td></tr>
          <tr><td>Turns</td><td>{s.turns}</td></tr>
          <tr><td>Seed</td><td>{run.seed}</td></tr>
          <tr><td>Molt</td><td>{run.molt ?? 0}</td></tr>
        </tbody>
      </table>
      <GenomePanel run={run} />
      <button class="btn primary" onClick={onDone}>Back to title</button>
    </div>
  );
}

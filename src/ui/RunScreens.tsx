import { createPortal } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { stinger, uiClick } from '../audio/audio';
import { EVENTS } from '../content/events';
import { CHARMS, ITEMS, item } from '../core/registry';
import {
  ACT_NAMES, BASK_FLESH, MAP_COLS, MOLTS, MAP_ROWS, NodeKind, RunState, Screen, progressOf,
  bask, buy, buyCharm, canUpgrade, arcIndices, describeNextFight, enterNode, eventChoice, fleshCap, genomeDraw, moveGenome, reachable, removeItem, takeCharm, takeReward, toMap, upgradeItem,
} from '../core/run';
import type { ItemId } from '../core/types';
import { epithetOf, loadProfile } from '../save/storage';
import { CardArt } from './CardArt';
import { GlyphIcon } from './GlyphIcon';

type SetRun = (r: RunState) => void;

const SPECIES_GOALS = [
  { unlock: 'act1', id: 'viper', species: 'Viper', goal: 'defeat the Mongoose to wake the Viper', stirs: 'A new species stirs: the Viper. Short and venomous — pick it on the title screen next run.' },
  { unlock: 'act2', id: 'python', species: 'Python', goal: 'defeat the Ant Queen to wake the Python', stirs: 'A new species stirs: the Python. Long and heavy — pick it on the title screen next run.' },
  { unlock: 'victory', id: 'ouro', species: 'Ouroboros', goal: 'win a run to wake the Ouroboros', stirs: 'The Ouroboros wakes. It feeds on its own husks — pick it on the title screen next run.' },
];

export function ItemCard({ id, onClick, footer, disabled, compact }: {
  id: ItemId; onClick?: () => void; footer?: preact.ComponentChildren; disabled?: boolean; compact?: boolean;
}) {
  const d = item(id);
  return (
    <button class={`card item-card ${disabled ? 'disabled' : ''} ${compact ? 'compact' : ''}`} style={{ '--c': d.color }} onClick={disabled ? undefined : onClick}>
      {!compact && <CardArt id={id} height={84} />}
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
      <CardArt id={id} height={84} />
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

/** Pick an item to molt: select it, compare before/after, then confirm. */
export function UpgradePicker({ run, onPick, onCancel, cost }: { run: RunState; onPick(idx: number): void; onCancel(): void; cost?: string }) {
  const opts = run.genome.map((id, i) => [id, i] as const).filter(([id]) => canUpgrade(id));
  const [sel, setSel] = useState<number | null>(opts[0]?.[1] ?? null);
  const h = sel !== null ? run.genome[sel] : null;
  return (
    <div class="upgrade-pick">
      <p>Choose an item to molt. It grows back stronger — for the rest of the run.</p>
      <div class="upgrade-layout">
        <div class="choices small upgrade-list">
          {opts.map(([id, i]) => (
            <div class={sel === i ? 'picked' : ''}><ItemCard id={id} compact onClick={() => setSel(i)} /></div>
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
      </div>
      <div class="title-buttons">
        <button class="btn" onClick={onCancel}>Cancel</button>
        <button class="btn primary" disabled={sel === null} onClick={() => sel !== null && onPick(sel)}>Molt {h ? item(h).name : ''}{cost ? ` (${cost})` : ''}</button>
      </div>
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
          <span class="dim">{run.genome.length} items · {Math.min(genomeDraw(run), run.genome.length)} grow on you each room, in ring order · {run.flesh}/{fleshCap(run)} flesh</span>
          <button class="btn" onClick={onClose}>Close <kbd>G</kbd></button>
        </div>
        {(run.charms ?? []).length > 0 && (
          <>
            <h3>Charms</h3>
            <div class="choices">{(run.charms ?? []).map((c) => <CharmCard id={c} />)}</div>
          </>
        )}
        <h3>Items</h3>
        <div class="choices">{sorted.map((id) => <ItemCard id={id} footer={item(id).upgrade ? <span class="dim small-footer">Molts into <b>{item(item(id).upgrade!).name}</b>: {item(item(id).upgrade!).activeText ?? item(item(id).upgrade!).passiveText}</span> : item(id).base ? <span>✦ molted</span> : undefined} />)}</div>
      </div>
    </div>
  );
}

const describeItem = (id: ItemId) => {
  const d = item(id);
  return `${d.name}: ${[d.activeText, d.passiveText && `While carried: ${d.passiveText}`].filter(Boolean).join(' ')}`;
};

export function GenomePanel({ run, inFight, setRun }: { run: RunState; inFight?: boolean; setRun?: SetRun }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.key === 'g' || e.key === 'G') && !open) setOpen(true);
      if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  const sc = run.screen;
  const arcStart = sc.t === 'fight' ? sc.arcStart : undefined;
  const arc = arcStart !== undefined ? new Set(arcIndices(run, arcStart)) : null;
  const canOrder = !!setRun && sc.t !== 'fight' && run.genome.length > 1;
  const draw = Math.min(genomeDraw(run), run.genome.length);
  const move = (from: number, to: number) => {
    setSel(null);
    setDrag(null);
    if (from !== to && setRun) { uiClick(); setRun(moveGenome(run, from, to)); }
  };
  const hint = canOrder
    ? sel !== null
      ? `${describeItem(run.genome[sel])} — now tap where it should go (it takes that place), or tap it again to cancel.`
      : draw < run.genome.length
        ? `A ring: each room the next ${draw} grow on you in this order, from a random point. Click an item, then a place, to reorder.`
        : `A ring: each room it grows on you in this order, from a random point. Click an item, then a place, to reorder.`
    : arc ? `▶ marks where you emerged this room.${arc.size < run.genome.length ? ' Dimmed items stayed in the burrow.' : ''}` : null;
  return (
    <div class="genome">
      {/* Portal: a fixed overlay inside the (transformed) phone info sheet would open off-screen. */}
      {open && createPortal(<GenomeView run={run} onClose={() => setOpen(false)} />, document.body)}
      <h3>Genome <span class="dim">({run.genome.length} items · {draw} grow each room)</span></h3>
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
      <ol class={`ring ${canOrder ? 'orderable' : ''} ${sel !== null ? 'placing' : ''}`}>
        {run.genome.map((id, i) => {
          const d = ITEMS.get(id)!;
          const cls = [sel === i && 'sel', drag === i && 'sel', arc && !arc.has(i) && 'out', arcStart === i && 'first'].filter(Boolean).join(' ');
          return (
            <li
              class={cls}
              draggable={canOrder}
              onDragStart={(e) => { setDrag(i); e.dataTransfer?.setData('text/plain', String(i)); }}
              onDragEnd={() => setDrag(null)}
              onDragOver={(e) => canOrder && e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (drag !== null) move(drag, i); }}
              onClick={canOrder ? () => (sel === null ? setSel(i) : sel === i ? setSel(null) : move(sel, i)) : undefined}
              title={[d.activeText, d.passiveText && `While carried: ${d.passiveText}`].filter(Boolean).join('\n')}
            >
              <span class="ring-i">{arcStart === i ? '▶' : i + 1}</span>
              {canOrder && <span class="ring-grip" aria-hidden>⋮⋮</span>}
              <GlyphIcon glyph={d.glyph} color={d.color} size={26} /> <span>{d.name}{d.base ? ' ✦' : ''}</span>
            </li>
          );
        })}
        <li class="ring-wrap dim" onClick={canOrder && sel !== null ? () => move(sel, run.genome.length - 1) : undefined}>↻ back to 1{canOrder && sel !== null ? ' (tap: move to the end)' : ''}</li>
      </ol>
      {hint && <div class="ring-hint dim">{hint}</div>}
      <button class="btn view-genome" onClick={() => setOpen(true)}>View all cards <kbd>G</kbd></button>
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
  useEffect(() => {
    // Bring the next choices into view (the map is taller than a phone screen).
    const el = document.querySelector('.map .node.can');
    el?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
  }, [run.at]);
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
        <svg viewBox={`0 0 ${W} ${H}`} class="map">
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
        {run.nextFight && describeNextFight(run.nextFight).length > 0 && (
          <div class="mods">Next fight: {describeNextFight(run.nextFight).map((m) => <span class="mod-chip">{m}</span>)}</div>
        )}
      </div>
      <aside class="side">
        <GenomePanel run={run} setRun={setRun} />
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
      {screen.boss && run.meta && SPECIES_GOALS.filter((g) => g.unlock === (run.act >= 2 ? 'act2' : 'act1') && !run.meta!.unlocksBefore.includes(g.unlock)).map((g) => <p class="unlock-banner">{g.stirs}</p>)}
      <p class="dim">Choose an item: it grows on you in every room from now on.</p>
      {run.lastRoom && (
        <div class="ledger">
          <span>Items played <b>{run.lastRoom.played}</b>{run.lastRoom.regrown ? ` → +${run.lastRoom.regrown} flesh regrown` : ''}</span>
          <span class={run.lastRoom.wasted ? 'bad' : ''}>Destroyed unplayed <b>{run.lastRoom.wasted}</b>{run.lastRoom.wasted ? ' — back now' : ''}</span>
          {(run.lastRoom.fleshLost ?? 0) > 0 && <span class="bad">Flesh lost <b>{run.lastRoom.fleshLost}</b></span>}
        </div>
      )}
      <p class="dim small" title="Temporary items were digested into flesh; anything beyond the cap was too much to carry."><b class="flesh">♥ {run.flesh}</b> / {fleshCap(run)} flesh carried</p>
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
      <GenomePanel run={run} setRun={setRun} />
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
      {molting && <UpgradePicker run={run} cost={`${screen.moltPrice} flesh`} onPick={(i) => { stinger('reward'); setRun(upgradeItem(run, i)); setMolting(false); }} onCancel={() => setMolting(false)} />}
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
      <GenomePanel run={run} setRun={setRun0} />
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
      <button class={`btn ${screen.done ? 'primary' : ''}`} onClick={() => { uiClick(); setRun(toMap(run)); }}>{screen.done ? 'Move on' : 'Skip'}</button>
      <GenomePanel run={run} setRun={setRun} />
    </div>
  );
}

/** Items named in an event choice, so the choice can explain them (longest names win: "Keeled Scale" over "Scale"). */
function mentionedItems(label: string) {
  for (const c of CHARMS.values()) label = label.split(c.name).join('');
  const hits = [...ITEMS.values()].filter((d) => d.rarity !== 'signature' && label.includes(d.name));
  const uniq = hits.filter((d, i) => hits.findIndex((x) => x.name === d.name) === i);
  return uniq.filter((d) => !uniq.some((o) => o !== d && o.name.includes(d.name)));
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
                {mentionedItems(c.label).map((d) => (
                  <span class="choice-item"><GlyphIcon glyph={d.glyph} color={d.color} size={18} /> <b>{d.name}</b>: {[d.activeText, d.passiveText && `While carried: ${d.passiveText}`].filter(Boolean).join(' ')}</span>
                ))}
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
      <GenomePanel run={run} setRun={setRun} />
    </div>
  );
}


const placeText = (p: number) => (p >= 30 ? 'victory' : `Act ${Math.floor(p / MAP_ROWS) + 1}, ${p % MAP_ROWS === MAP_ROWS - 1 ? 'the boss' : `room ${(p % MAP_ROWS) + 1}`}`);

export function EndScreen({ run, onDone, onAgain, onDaily }: { run: RunState; onDone: () => void; onAgain: (species?: string) => void; onDaily?: () => void }) {
  const s = run.stats;
  const won = run.screen.t === 'victory';
  const profile = loadProfile();
  const meta = run.meta;
  const prog = progressOf(run);
  const bestBefore = meta?.bestBefore ?? 0;
  const record = !!meta && prog > bestBefore && prog > 0;
  const newUnlocks = meta ? SPECIES_GOALS.filter((g) => profile.unlocks.includes(g.unlock) && !meta.unlocksBefore.includes(g.unlock)) : [];
  const newDepth = meta && profile.moltUnlocked > meta.moltUnlockedBefore ? profile.moltUnlocked : null;
  const nextSpecies = SPECIES_GOALS.find((g) => !profile.unlocks.includes(g.unlock));
  const next = nextSpecies
    ? `Next: ${nextSpecies.goal}.`
    : profile.moltUnlocked < MOLTS.length
      ? profile.moltUnlocked < MOLTS.length - 1
        ? `Next: win at Depth ${profile.moltUnlocked} to open Depth ${profile.moltUnlocked + 1} — ${MOLTS[profile.moltUnlocked + 1]}`
        : `Next: win at Depth ${profile.moltUnlocked}, the bottom.`
      : 'You have reached the bottom.';
  const ep = epithetOf(run);
  const node = run.at !== null ? run.map[run.at] : null;
  const where = node ? `Act ${run.act + 1} · ${ACT_NAMES[run.act]}, ${node.row === MAP_ROWS - 1 ? 'the boss' : `room ${node.row + 1}`}` : '';
  const fresh = newUnlocks[newUnlocks.length - 1];
  const again = () => { uiClick(); onAgain(fresh?.id); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Enter') again(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const cause = run.screen.t === 'dead' ? run.screen.cause : '';
  return (
    <div class="screen center-screen end-screen">
      <h1 class={won ? 'win' : 'lose'}>{won ? 'The circle is complete' : 'Your coil unwinds'}</h1>
      {won && <p>You devoured the Ouroboros.</p>}
      {won && meta && !meta.unlocksBefore.includes('victory') && <p class="unlock-banner">{SPECIES_GOALS[2].stirs}</p>}
      {run.screen.t === 'dead' && (
        <p>{cause === 'starvation' ? <>You <b>starved</b></> : cause === 'suffocation' ? <>You <b>ran out of breath</b></> : cause === 'stalled' ? <>You <b>ran out of time</b></> : <>Killed by <b>{cause}</b></>} in {run.screen.where}{where ? ` — ${where}` : ''}.</p>
      )}
      {meta && (record
        ? <p class="record">Deepest yet: {placeText(prog)}{bestBefore > 0 ? ` (previous best: ${placeText(bestBefore)})` : ''}.</p>
        : <p class="dim">Your best: {placeText(profile.best ?? prog)}.</p>)}
      {(newUnlocks.length > 0 || newDepth !== null) && (
        <div class="earned">
          {newUnlocks.map((g) => <span class="earn-chip">Unlocked: {g.species}</span>)}
          {newDepth !== null && <span class="earn-chip">Depth {newDepth} unlocked: {MOLTS[newDepth]?.split(':')[0]}</span>}
        </div>
      )}
      <div class="milestones">
        {SPECIES_GOALS.map((g) => {
          const ok = profile.unlocks.includes(g.unlock);
          return <span class={`ms ${ok ? 'ok' : nextSpecies === g ? 'next' : ''}`} title={ok ? `${g.species} unlocked` : g.goal}>{g.species}</span>;
        })}
        <span class="ms-label dim">Depth</span>
        {MOLTS.slice(1).map((m, i) => {
          const d = i + 1;
          const ok = profile.moltUnlocked >= d;
          return <span class={`ms depth ${ok ? 'ok' : !nextSpecies && profile.moltUnlocked + 1 === d ? 'next' : ''}`} title={`Depth ${d}: ${m}`}>{d}</span>;
        })}
      </div>
      <p class="next-goal">{next}</p>
      {ep && <p class="epithet">You fought like <b>{ep.name}</b> — {ep.why}.</p>}
      <div class="title-buttons">
        <button class="btn primary" onClick={again}>{fresh ? `Try the ${fresh.species}` : 'Shed your skin and go again'} <kbd>Enter</kbd></button>
        {fresh && <button class="btn" onClick={() => { uiClick(); onAgain(); }}>Go again as before</button>}
        {onDaily && <button class="btn" onClick={() => { uiClick(); onDaily(); }}>Try today’s Daily</button>}
        <button class="btn" onClick={() => { uiClick(); onDone(); }}>Back to title</button>
      </div>
      <details class="end-details">
        <summary>Run details</summary>
        <table class="stats">
          <tbody>
            <tr><td>Rooms cleared</td><td>{s.rooms}</td></tr>
            <tr><td>Enemies killed</td><td>{s.kills}</td></tr>
            <tr><td>…of those crushed in coils</td><td>{s.coilKills}</td></tr>
            <tr><td>Things eaten</td><td>{s.eaten}</td></tr>
            <tr><td>Segments lost</td><td>{s.lostSegments}</td></tr>
            <tr><td>Turns</td><td>{s.turns}</td></tr>
            <tr><td>Seed</td><td>{run.seed}</td></tr>
            <tr><td>Depth</td><td>{run.molt ?? 0}</td></tr>
          </tbody>
        </table>
        <GenomePanel run={run} />
      </details>
    </div>
  );
}

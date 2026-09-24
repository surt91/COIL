import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { computeCoils } from '../core/coil';
import { canPlay, legalMoves, moveOutcome, step, wrapMin } from '../core/fight';
import { DIRS, Dir, Pos, eq, step as stepPos } from '../core/geom';
import * as ops from '../core/ops';
import { ENEMIES, ITEMS, item } from '../core/registry';
import type { Action, Enemy, Fight } from '../core/types';
import { BoardRenderer } from '../render/board';
import { playEvents } from '../audio/audio';
import { lookahead2Policy } from '../bot/policies';
import { makeRng } from '../core/rng';
import { CardArt } from './CardArt';
import { GlyphIcon } from './GlyphIcon';
import { Tip, markSeen, nextTip } from './tips';

const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3,
  w: 0, d: 1, s: 2, a: 3, W: 0, D: 1, S: 2, A: 3,
};

export interface FightViewProps {
  initial: Fight;
  title: string;
  onEnd(f: Fight): void;
  /** Called after every committed action (saving, stats, audio). */
  onStep?(f: Fight, undo?: boolean): void;
  side?: preact.ComponentChildren;
  act?: number;
  /** Max flesh carried to the next room (shown in the HUD). */
  fleshCap?: number;
}

export function FightView({ initial, title, onEnd, onStep, side, act: actNo = 0, fleshCap }: FightViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const renderer = useRef<BoardRenderer | null>(null);
  const [fight, setFight] = useState(initial);
  const fightRef = useRef(fight);
  const turnStart = useRef<Fight>(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const selectedRef = useRef(selected);
  const [hover, setHover] = useState<Pos | null>(null);
  const ended = useRef(false);
  const [tip, setTip] = useState<Tip | null>(() => nextTip(initial));
  const tipTurn = useRef(initial.turn);
  const [hint, setHint] = useState<{ action: Action; preview: Fight } | null>(null);
  selectedRef.current = selected;

  // Renderer lifecycle + animation loop.
  useEffect(() => {
    const r = new BoardRenderer(canvasRef.current!);
    r.act = actNo;
    renderer.current = r;
    (window as any).__coil = { get fight() { return fightRef.current; }, dispatch, renderer: r };
    r.instant = new URLSearchParams(location.search).has('instant');
    try { r.terminal = localStorage.getItem('coil.terminal') === '1'; } catch { /* ignore */ }
    r.push(initial);
    const fit = () => {
      const el = wrapRef.current!;
      r.resize(el.clientWidth, el.clientHeight);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrapRef.current!);
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      r.frame(now, Math.min(50, now - last));
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  function commit(next: Fight, endsTurn: boolean) {
    fightRef.current = next;
    if (endsTurn) turnStart.current = next;
    setFight(next);
    renderer.current?.push(next);
    playEvents(next.events);
    onStep?.(next);
    setTip((t) => {
      if (t && next.turn - tipTurn.current < 3) return t;
      if (t) markSeen(t.id);
      tipTurn.current = next.turn;
      return nextTip(next);
    });
    if (next.status !== 'play' && !ended.current) {
      ended.current = true;
      setTimeout(() => onEnd(next), next.status === 'won' ? 350 : 1400);
    }
  }

  function dispatch(a: Action) {
    const f = fightRef.current;
    if (f.status !== 'play') return;
    const next = step(f, a);
    if (next.events.length === 0 && a.t !== 'tuck') return;
    const endsTurn = next.turn !== f.turn || next.status !== 'play';
    setSelected(null);
    setHint(null);
    commit(next, endsTurn);
  }

  /** The autopilot: the same search bot used for balancing. */
  function suggest(): Action | null {
    const f = fightRef.current;
    if (f.status !== 'play') return null;
    return lookahead2Policy(f, makeRng(f.turn + 1));
  }

  function undo() {
    const f = turnStart.current;
    if (f === fightRef.current) return;
    fightRef.current = f;
    setFight(f);
    setSelected(null);
    renderer.current?.set(f);
    onStep?.(f, true);
  }

  function selectSlot(slot: number) {
    const f = fightRef.current;
    const k = ops.hand(f)[slot];
    if (k === undefined) return;
    const d = item(f.snake.segs[k].item!);
    if (!d.active) return;
    if (d.active.target === 'none') {
      if (canPlay(f, slot)) dispatch({ t: 'play', slot });
      return;
    }
    setSelected((s) => (s === slot ? null : slot));
  }

  function act(dir: Dir) {
    const sel = selectedRef.current;
    if (sel !== null) {
      if (canPlay(fightRef.current, sel, dir)) dispatch({ t: 'play', slot: sel, dir });
    } else dispatch({ t: 'move', dir });
  }

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key in KEY_DIRS) {
        e.preventDefault();
        act(KEY_DIRS[e.key]);
      } else if (e.key >= '1' && e.key <= '3') selectSlot(Number(e.key) - 1);
      else if (e.key === 't' || e.key === 'T') dispatch({ t: 'tuck' });
      else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') undo();
      else if (e.key === 'Escape') { setSelected(null); setHint(null); }
      else if (e.key === 'h' || e.key === 'H') {
        const a = suggest();
        if (a) setHint({ action: a, preview: step(fightRef.current, a) });
      } else if (e.key === 'p' || e.key === 'P') {
        const a = suggest();
        if (a) dispatch(a);
      }
      else if (e.key === 'F2' || e.key === '`') {
        e.preventDefault();
        const r = renderer.current;
        if (r) {
          r.terminal = !r.terminal;
          try { localStorage.setItem('coil.terminal', r.terminal ? '1' : '0'); } catch { /* ignore */ }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Preview of the hovered adjacent tile.
  const f = fight;
  const head = f.snake.body[0];
  let hoverDir: Dir | null = null;
  if (hover) for (const d of DIRS) if (eq(stepPos(head, d), hover)) hoverDir = d;
  const preview = useMemo<Fight | null>(() => {
    if (f.status !== 'play') return null;
    if (hint && !hover) return hint.preview;
    if (selected !== null) {
      if (hoverDir !== null && canPlay(f, selected, hoverDir)) return step(f, { t: 'play', slot: selected, dir: hoverDir });
    } else if (hoverDir !== null && legalMoves(f).includes(hoverDir)) return step(f, { t: 'move', dir: hoverDir });
    return null;
  }, [hover, selected, f, hint]);
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    r.hover = hover;
    r.preview = preview;
    r.targetDirs = f.status === 'play' && selected !== null ? DIRS.filter((d) => canPlay(f, selected, d)) : null;
  }, [hover, selected, f, preview]);

  const toCss = (e: MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return renderer.current?.tileAt(e.clientX - rect.left, e.clientY - rect.top) ?? null;
  };
  const onMove = (e: MouseEvent) => {
    const t = toCss(e);
    setHover((h) => (h && t && eq(h, t)) || h === t ? h : t);
  };
  const onClick = (e: MouseEvent) => {
    const t = toCss(e);
    if (!t) return;
    for (const d of DIRS) if (eq(stepPos(fightRef.current.snake.body[0], d), t)) act(d);
  };

  const handIdx = ops.hand(f);
  const cardW = typeof window !== 'undefined' && window.innerWidth <= 1200 ? 198 : 238;
  const pend = ops.pending(f);
  const onBoard = f.snake.body.length - 1;
  const flesh = f.snake.segs.filter((s) => !s.item).length;
  const items = f.snake.segs.length - flesh;
  const hungerLeft = f.opts.hungerEvery - f.hunger;
  const fleshCapNote = fleshCap !== undefined ? `(carry ≤${fleshCap})` : '';
  // Hand items an enemy has latched onto: play them and the attack fizzles.
  const targeted = new Set(f.enemies.flatMap((e) => (e.intent.t === 'lock' || e.intent.t === 'steal' ? [e.intent.seg] : [])));

  return (
    <div class="fight">
      <header class="hud">
        <div class="hud-title">{title}</div>
        <div class="hud-stat" title="Flesh is your health and your currency. It carries to the next room (up to your cap). Temporary items count as flesh at room end.">
          <b class="flesh">♥ {flesh}</b> flesh <span class="dim">{fleshCapNote}</span>
        </div>
        <div class="hud-stat" title="Items are ammunition: every item comes back next room, played or not. Play them freely — a destroyed item is just wasted.">
          <b class="ammo">{items}</b> items <span class="dim">↻ return next room{pend ? ` · ${pend} still in burrow` : ''}</span>
        </div>
        {(f.played ?? 0) > 0 && <div class="hud-stat dim" title="Every 2 items played regrow 1 flesh at room end (max 2).">played {f.played}{Math.min(2, Math.floor((f.played ?? 0) / 2)) > 0 ? ` → +${Math.min(2, Math.floor((f.played ?? 0) / 2))} flesh` : ''}</div>}
        {(f.buffs.bite > 0 || f.buffs.absorb > 0) && (
          <div class="hud-stat buffs">
            {f.buffs.bite > 0 && <span class="buff">Next bite +{f.buffs.bite}</span>}
            {f.buffs.absorb > 0 && <span class="buff">Absorb ×{f.buffs.absorb}</span>}
          </div>
        )}
        <div class={`hud-stat ${hungerLeft <= 3 ? 'warn' : ''}`} title="Every few turns without eating, you lose your tail.">
          Hunger <b>{hungerLeft}</b>
        </div>
        <div class="hud-stat">Turn <b>{f.turn}</b></div>
        {f.cleared && <div class="hud-stat good">Exits open</div>}
      </header>
      <div class="board-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={onClick} />
        {f.status !== 'play' && (
          <div class={`fight-end ${f.status}`}>
            <div>{f.status === 'won' ? 'Onward…' : 'Your coil unwinds'}</div>
          </div>
        )}
      </div>
      <aside class="inspector">
        {tip && (
          <div class="tip" onClick={() => { markSeen(tip.id); tipTurn.current = fightRef.current.turn; setTip(nextTip(fightRef.current)); }}>
            <span class="tip-label">Tip</span> {tip.text} <span class="dim">(click to dismiss)</span>
          </div>
        )}
        <MoveHint f={f} dir={hoverDir} preview={preview} spent={selected !== null && ops.hand(f)[selected] !== undefined ? f.snake.segs[ops.hand(f)[selected]].uid : undefined} />
        <Inspector f={f} hover={hover} />
        {hint && <div class="autopilot">Autopilot suggests: <b>{describeAction(f, hint.action)}</b> <span class="dim">(P to let it play, Esc to dismiss)</span></div>}
        {side}
      </aside>
      <footer class="hand">
        {[0, 1, 2].map((slot) => {
          const k = handIdx[slot];
          if (k === undefined) return <div class="card empty">empty</div>;
          const seg = f.snake.segs[k];
          const d = item(seg.item!);
          const playable = d.active && (d.active.target === 'none' ? canPlay(f, slot) : DIRS.some((dd) => canPlay(f, slot, dd)));
          const threatened = targeted.has(seg.uid);
          return (
            <button
              class={`card ${selected === slot ? 'selected' : ''} ${playable ? '' : 'disabled'} ${k >= onBoard ? 'buried' : ''} ${threatened ? 'threatened' : ''}`}
              style={{ '--c': d.color }}
              onClick={() => selectSlot(slot)}
            >
              <CardArt id={seg.item!} width={cardW} height={52} />
              <div class="card-top">
                <span class="key">{slot + 1}</span>
                <GlyphIcon glyph={d.glyph} color={d.color} size={28} />
                <span class="card-name">{d.name}{seg.temp ? ' ·temp' : ''}</span>
              </div>
              {d.activeText && <div class="card-text">{d.activeText}</div>}
              {d.passiveText && <div class="card-passive">While carried: {d.passiveText}</div>}
              {d.active?.move && <div class="card-tag">MOVE</div>}
              {threatened && <div class="card-threat">Targeted! Play it — the attack fizzles.</div>}
              {!playable && d.active && <div class="card-why">{d.active.requires ?? (d.active.target === 'dir' ? 'No valid direction right now.' : 'Can’t be played right now.')}</div>}
              {!d.active && <div class="card-why">Passive only — tuck it (T) to cycle.</div>}
            </button>
          );
        })}
        <div class="hand-actions">
          <button onClick={() => dispatch({ t: 'tuck' })} disabled={f.tuckUsed || handIdx.length === 0} title="Send your first hand item to the tail (once per turn)">
            Tuck <kbd>T</kbd>
          </button>
          <button onClick={undo} disabled={turnStart.current === f} title="Undo card plays this turn">
            Undo <kbd>Z</kbd>
          </button>
        </div>
      </footer>
    </div>
  );
}

function describeAction(f: Fight, a: Action): string {
  const dn = (d?: Dir) => (d === undefined ? '' : ['up', 'right', 'down', 'left'][d]);
  if (a.t === 'move') return `move ${dn(a.dir)}`;
  if (a.t === 'tuck') return 'tuck';
  const k = ops.hand(f)[a.slot];
  const name = k !== undefined ? ITEMS.get(f.snake.segs[k].item!)?.name : '?';
  return `play ${name}${a.dir !== undefined && item(f.snake.segs[k].item!).active?.target === 'dir' ? ` ${dn(a.dir)}` : ''}`;
}

function describeIntent(f: Fight, e: Enemy): string {
  const it = e.intent;
  switch (it.t) {
    case 'wait': return e.held ? 'Held in your coil' : 'Waiting';
    case 'move': return `Moving ${['up', 'right', 'down', 'left'][it.dir]}${it.steps > 1 ? ` ×${it.steps}` : ''}`;
    case 'strike': return `Striking ${it.tiles.length} tile${it.tiles.length > 1 ? 's' : ''} for ${it.dmg}`;
    case 'lock': {
      const k = f.snake.segs.findIndex((s) => s.uid === it.seg);
      const what = it.seg === 0 ? 'your head' : f.snake.segs[k]?.item ? ITEMS.get(f.snake.segs[k].item!)?.name : 'a flesh segment';
      return `${it.sever ? 'Will SEVER' : 'Will bite'} ${what}${it.windup > 1 ? ` in ${it.windup} turns` : ' next turn'} (if within ${it.reach} tile${it.reach > 1 ? 's' : ''})`;
    }
    case 'web': return 'Spinning webs';
    case 'summon': return `Summoning ${it.tiles.length} ${ENEMIES.get(it.kind)?.name ?? it.kind}${it.tiles.length > 1 ? 's' : ''}`;
    case 'burrow': return 'Digging underground';
    case 'emerge': return `Erupting from the marked tile for ${it.dmg}`;
    case 'steal': return 'Going to steal an item';
    default: return 'Waiting';
  }
}

function Inspector({ f, hover }: { f: Fight; hover: Pos | null }) {
  if (!hover) return <div class="inspect dim">Hover a tile to inspect it.<Legend f={f} /></div>;
  const e = ops.enemyAt(f, hover);
  if (e) {
    const d = ENEMIES.get(e.kind)!;
    return (
      <div class="inspect">
        <h3 style={{ color: d.color }}>{d.name}</h3>
        <div>HP {e.hp}/{e.maxHp}{e.poison ? ` · ☠ ${e.poison}` : ''}{e.held ? ' · held' : ''}</div>
        <div class="intent">{describeIntent(f, e)}</div>
        {d.boss && <div class="dim">Boss: bites don’t interrupt it.</div>}
        <p>{d.text}</p>
      </div>
    );
  }
  const bi = ops.bodyIndexAt(f, hover);
  if (bi === 0) return <div class="inspect"><h3>Your head</h3><p>A hit on the head destroys the two segments behind it.</p></div>;
  if (bi > 0) {
    const s = f.snake.segs[bi - 1];
    const d = s.item ? ITEMS.get(s.item) : null;
    return (
      <div class="inspect">
        <h3 style={{ color: d?.color }}>{d ? d.name : 'Flesh'}</h3>
        <div class="dim">Segment {bi}{s.temp ? ' · temporary' : ''}</div>
        {d?.passiveText && <p>Passive: {d.passiveText}</p>}
        {d?.activeText && <p>Active: {d.activeText}</p>}
        {!d && <p>Plain body. Your health — and your currency.</p>}
      </div>
    );
  }
  const hk = ops.huskAt(f, hover);
  if (hk >= 0) {
    const h = f.husks[hk];
    return <div class="inspect"><h3>Husk</h3><p>A severed piece of you{h.item ? ` carrying ${ITEMS.get(h.item)?.name}` : ''}. Blocks the way; counts as a coil wall. Eat it within {h.ttl} turns to take it back.</p></div>;
  }
  const tile = ops.tileAt(f, hover);
  if (tile === 2) return <div class="inspect"><h3>Exit</h3><p>{f.cleared ? 'Open! Move into it to leave the room.' : 'Closed until every enemy is dead (escalation spawns don’t count).'}</p></div>;
  if (tile === 3) return <div class="inspect"><h3>Burrow</h3><p>{f.entry && eq(f.entry, hover) ? 'Where you came in. While you are still emerging, segments at its mouth are safe.' : 'Late in a fight, beetles crawl out of holes like this.'} Your head can’t go back in.</p></div>;
  const coil = computeCoils(f).find((c) => c.tiles.some((t) => eq(t, hover)));
  if (coil) return <div class="inspect"><h3>Inside your coil</h3><p>{coil.area} enclosed tile{coil.area > 1 ? 's' : ''}: {coil.crush ? `enemies here take ${coil.crush} crush per turn` : 'enemies here are held, but not crushed'}. Coiled enemies can’t move or attack.</p></div>;
  if (ops.foodAt(f, hover) >= 0) return <div class="inspect"><h3>Food</h3><p>+1 flesh at the tail. Resets hunger.</p></div>;
  if (ops.webAt(f, hover) >= 0) return <div class="inspect"><h3>Web</h3><p>Moving into it costs your move. Counts as a coil wall.</p></div>;
  return <div class="inspect dim">Empty.<Legend f={f} /></div>;
}

function Legend({ f }: { f: Fight }) {
  return (
    <ul class="legend">
      <li><b>Move</b> arrows / WASD / click. You can never stand still.</li>
      <li><b>Hand</b> = the first three items behind your head. <kbd>1</kbd>–<kbd>3</kbd> to play. Items are ammunition: they all come back next room. Only flesh carries over.</li>
      <li><b>Hits</b> destroy the segment they land on.</li>
      <li><b>Coil</b>: enclose enemies with your body (walls help). Coiled enemies can’t move or attack. Tighter = more crush (1 tile: 3/turn, 2–3: 2, 4–8: 1, 9–12: held only). To keep a coil, chase your own tail.</li>
      <li><b>Wrap</b>: the violet arcs count how many of your tiles touch an enemy. At {wrapMin(f)} (diagonals count) it is squeezed for 1 each turn.</li>
      <li><b>Bites interrupt</b> by knocking the enemy back — not if it is pinned against something, and never bosses.</li>
      <li><kbd>H</kbd> asks the autopilot for a hint, <kbd>P</kbd> lets it play a turn. (Every snake needs an autopilot.)</li>
      <li><kbd>F2</kbd> toggles the terminal skin — a nod to where all this started: C and ncurses.</li>
      <li><b>Red</b> = incoming damage. A red reticle = a bite locked on that segment: it lands only if the segment is still inside the faint red box after your move.</li>
    </ul>
  );
}

function MoveHint({ f, dir, preview, spent }: { f: Fight; dir: Dir | null; preview: Fight | null; spent?: number }) {
  if (dir === null || f.status !== 'play') return null;
  const legal = legalMoves(f).includes(dir);
  const o = moveOutcome(f, dir);
  const text: Record<string, string> = {
    illegal: 'Blocked', step: 'Move', food: 'Eat', husk: 'Eat husk', web: 'Web: stuck',
    exit: 'Leave the room', bite: 'Bite', body: 'Bite yourself (trapped)', neck: 'Bite your own neck (stuck!)',
  };
  if (!legal) return <div class="movehint">Blocked</div>;
  const lines: string[] = [];
  if (preview) {
    const keep = new Set(preview.snake.segs.map((x) => x.uid));
    const spentUid = spent ?? -1;
    const lost = f.snake.segs.filter((x) => !keep.has(x.uid) && x.uid !== spentUid);
    const lostItems = lost.filter((x) => x.item).map((x) => ITEMS.get(x.item!)?.name);
    const lostFlesh = lost.length - lostItems.length;
    if (spent !== undefined) {
      const sp = f.snake.segs.find((x) => x.uid === spent);
      if (sp?.item) lines.push(`Spend: ${ITEMS.get(sp.item)?.name} (back next room)`);
    }
    if (preview.status === 'dead') lines.push('☠ You would die.');
    else if (lost.length) {
      if (lostItems.length) lines.push(`Destroyed unplayed: ${lostItems.join(', ')}`);
      if (lostFlesh) lines.push(`Lose ${lostFlesh} flesh`);
    } else lines.push('No damage taken.');
    const fizzles = preview.events.filter((e) => e.t === 'fizzle').length;
    if (fizzles) lines.push(`${fizzles} attack${fizzles > 1 ? 's' : ''} will miss`);
    const kills = preview.events.filter((e) => e.t === 'enemyDie').length;
    if (kills) lines.push(`${kills} kill${kills > 1 ? 's' : ''}`);
    const coils = computeCoils(preview).filter((c) => c.tiles.some((t) => preview.enemies.some((e) => eq(e.pos, t))));
    for (const c of coils) lines.push(`Coil: ${c.area} tile${c.area > 1 ? 's' : ''} → ${c.crush ? `${c.crush} crush/turn` : 'held only'}`);
  }
  return (
    <div class="movehint">
      <b>{text[o.k]}</b>
      {lines.map((l) => <div class={l.startsWith('☠') || l.startsWith('Lose') || l.startsWith('Destroyed') ? 'bad' : l.startsWith('Spend') ? 'spend' : ''}>{l}</div>)}
    </div>
  );
}

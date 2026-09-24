import { useEffect, useRef, useState } from 'preact/hooks';
import { canPlay, legalMoves, moveOutcome, step } from '../core/fight';
import { DIRS, Dir, Pos, eq, step as stepPos } from '../core/geom';
import * as ops from '../core/ops';
import { ENEMIES, ITEMS, item } from '../core/registry';
import type { Action, Enemy, Fight } from '../core/types';
import { BoardRenderer } from '../render/board';
import { playEvents } from '../audio/audio';
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
}

export function FightView({ initial, title, onEnd, onStep, side, act: actNo = 0 }: FightViewProps) {
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
      if (t) markSeen(t.id);
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
    commit(next, endsTurn);
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
      else if (e.key === 'Escape') setSelected(null);
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
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    r.hover = hover;
    r.preview = null;
    r.targetDirs = null;
    if (f.status !== 'play') return;
    if (selected !== null) {
      r.targetDirs = DIRS.filter((d) => canPlay(f, selected, d));
      if (hoverDir !== null && canPlay(f, selected, hoverDir)) r.preview = step(f, { t: 'play', slot: selected, dir: hoverDir });
    } else if (hoverDir !== null && legalMoves(f).includes(hoverDir)) {
      r.preview = step(f, { t: 'move', dir: hoverDir });
    }
  }, [hover, selected, f]);

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
  const pend = ops.pending(f);
  const onBoard = f.snake.body.length - 1;
  const flesh = f.snake.segs.filter((s) => !s.item).length;
  const items = f.snake.segs.length - flesh;
  const hungerLeft = f.opts.hungerEvery - f.hunger;

  return (
    <div class="fight">
      <header class="hud">
        <div class="hud-title">{title}</div>
        <div class="hud-stat" title="Segments: items + flesh">
          <b>{f.snake.segs.length}</b> segments <span class="dim">({items} items · {flesh} flesh{pend ? ` · ${pend} in burrow` : ''})</span>
        </div>
        <div class={`hud-stat ${hungerLeft <= 3 ? 'warn' : ''}`} title="Every few turns without eating, you lose your tail.">
          Hunger <b>{hungerLeft}</b>
        </div>
        <div class="hud-stat">Turn <b>{f.turn}</b></div>
        {f.cleared && <div class="hud-stat good">Exits open</div>}
      </header>
      <div class="board-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={onClick} />
        {tip && (
          <div class="tip" onClick={() => { markSeen(tip.id); setTip(nextTip(fightRef.current)); }}>
            <span class="tip-label">Tip</span> {tip.text} <span class="dim">(click to dismiss)</span>
          </div>
        )}
      </div>
      <aside class="inspector">
        <Inspector f={f} hover={hover} />
        <MoveHint f={f} dir={hoverDir} />
        {side}
      </aside>
      <footer class="hand">
        {[0, 1, 2].map((slot) => {
          const k = handIdx[slot];
          if (k === undefined) return <div class="card empty">empty</div>;
          const seg = f.snake.segs[k];
          const d = item(seg.item!);
          const playable = d.active && (d.active.target === 'none' ? canPlay(f, slot) : DIRS.some((dd) => canPlay(f, slot, dd)));
          return (
            <button
              class={`card ${selected === slot ? 'selected' : ''} ${playable ? '' : 'disabled'} ${k >= onBoard ? 'buried' : ''}`}
              style={{ '--c': d.color }}
              onClick={() => selectSlot(slot)}
            >
              <div class="card-top">
                <span class="key">{slot + 1}</span>
                <GlyphIcon glyph={d.glyph} color={d.color} size={28} />
                <span class="card-name">{d.name}{seg.temp ? ' ·temp' : ''}</span>
              </div>
              {d.activeText && <div class="card-text">{d.activeText}</div>}
              {d.passiveText && <div class="card-passive">Passive: {d.passiveText}</div>}
              {d.active?.move && <div class="card-tag">MOVE</div>}
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
    default: return it.t;
  }
}

function Inspector({ f, hover }: { f: Fight; hover: Pos | null }) {
  if (!hover) return <div class="inspect dim">Hover a tile to inspect it.<Legend /></div>;
  const e = ops.enemyAt(f, hover);
  if (e) {
    const d = ENEMIES.get(e.kind)!;
    return (
      <div class="inspect">
        <h3 style={{ color: d.color }}>{d.name}</h3>
        <div>HP {e.hp}/{e.maxHp}{e.poison ? ` · ☠ ${e.poison}` : ''}{e.held ? ' · held' : ''}</div>
        <div class="intent">{describeIntent(f, e)}</div>
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
  if (ops.foodAt(f, hover) >= 0) return <div class="inspect"><h3>Food</h3><p>+1 flesh at the tail. Resets hunger.</p></div>;
  if (ops.webAt(f, hover) >= 0) return <div class="inspect"><h3>Web</h3><p>Moving into it costs your move. Counts as a coil wall.</p></div>;
  return <div class="inspect dim">Empty.<Legend /></div>;
}

function Legend() {
  return (
    <ul class="legend">
      <li><b>Move</b> arrows / WASD / click. You can never stand still.</li>
      <li><b>Hand</b> = the first three items behind your head. <kbd>1</kbd>–<kbd>3</kbd> to play; playing consumes the segment.</li>
      <li><b>Hits</b> destroy the segment they land on.</li>
      <li><b>Coil</b>: enclose enemies with your body (walls help). Tighter = more crush.</li>
      <li><kbd>F2</kbd> toggles the terminal skin — a nod to where all this started: C and ncurses.</li>
      <li><b>Red</b> = incoming damage. Dashed line = a bite locked on a segment; move that segment out of reach to dodge.</li>
    </ul>
  );
}

function MoveHint({ f, dir }: { f: Fight; dir: Dir | null }) {
  if (dir === null || f.status !== 'play') return null;
  const o = moveOutcome(f, dir);
  const text: Record<string, string> = {
    illegal: 'Blocked', step: 'Move', food: 'Eat', husk: 'Eat husk', web: 'Web: stuck',
    exit: 'Leave the room', bite: 'Bite', body: 'Bite yourself (trapped)', neck: 'Bite your own neck (stuck!)',
  };
  return <div class="movehint">{text[o.k]}</div>;
}

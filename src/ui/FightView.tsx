import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { coilDamage, coiledEnemies, computeCoils, occupiedCoils } from '../core/coil';
import { coilWithin } from '../core/hints';
import { regrowFromPlayed } from '../core/run';
import { BREATH, bossExposed, canPlay, spawnIn, legalMoves, moveOutcome, riposteTile, step, wrapMin } from '../core/fight';
import { DIRS, Dir, Pos, eq, step as stepPos } from '../core/geom';
import * as ops from '../core/ops';
import { ENEMIES, ITEMS, item } from '../core/registry';
import type { Action, Enemy, Fight } from '../core/types';
import { BoardRenderer } from '../render/board';
import { SPECIES_STYLES } from '../render/serpent';
import { playEvents } from '../audio/audio';
import { lookahead2Policy } from '../bot/policies';
import { makeRng } from '../core/rng';
import { CardArt } from './CardArt';
import { GlyphIcon } from './GlyphIcon';
import { COILS_KEY, Tip, coilsSoFar, markSeen, nextTip, showPocket, urgentTip } from './tips';

const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

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
  /** Event modifiers active in this fight. */
  mods?: string[];
  species?: string;
}

export function FightView({ initial, title, onEnd, onStep, side, act: actNo = 0, fleshCap, mods, species = 'garden' }: FightViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const renderer = useRef<BoardRenderer | null>(null);
  const [fight, setFight] = useState(initial);
  const fightRef = useRef(fight);
  const turnStart = useRef<Fight>(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const selectedRef = useRef(selected);
  const [hover, setHover] = useState<Pos | null>(null);
  /** Touch: a direction previewed by the first tap/swipe; a second one confirms. */
  const [pending, setPending] = useState<Dir | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [quick, setQuick] = useState(() => { try { return localStorage.getItem('coil.quickmove') === '1'; } catch { return false; } });
  const quickRef = useRef(quick);
  quickRef.current = quick;
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTouch = useRef(0);
  const ended = useRef(false);
  const [tip, setTip] = useState<Tip | null>(() => nextTip(initial));
  const tipTurn = useRef(initial.turn);
  const [hint, setHint] = useState<{ action: Action; preview: Fight } | null>(null);
  selectedRef.current = selected;

  // Renderer lifecycle + animation loop.
  useEffect(() => {
    const r = new BoardRenderer(canvasRef.current!);
    r.act = actNo;
    r.style = SPECIES_STYLES[species] ?? SPECIES_STYLES.garden;
    renderer.current = r;
    // Debug/test hook (dev builds only).
    if (import.meta.env.DEV) (window as unknown as { __coil: unknown }).__coil = { get fight() { return fightRef.current; }, dispatch, renderer: r };
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
    if (coiledEnemies(next).size > 0 && coiledEnemies(fightRef.current).size === 0) {
      try { localStorage.setItem(COILS_KEY, String(coilsSoFar() + 1)); } catch { /* ignore */ }
    }
    fightRef.current = next;
    if (endsTurn) turnStart.current = next;
    setFight(next);
    renderer.current?.push(next);
    playEvents(next.events);
    onStep?.(next);
    setTip((t) => {
      const u = urgentTip(next);
      if (u && u.id !== t?.id) {
        tipTurn.current = next.turn;
        return u; // the old tip isn't marked seen: it comes back later
      }
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
    setPending(null);
    if (isTouch) setHover(null); // a tapped tile's preview ring must not outlive the action
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
      if (!canPlay(f, slot)) return;
      // On touch screens the first tap previews, the second plays.
      if (isTouch && selectedRef.current !== slot) {
        setSelected(slot);
        return;
      }
      dispatch({ t: 'play', slot });
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
        act(renderer.current ? renderer.current.screenToBoardDir(KEY_DIRS[e.key]) : KEY_DIRS[e.key]);
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
  let hoverDir: Dir | null = pending;
  if (hoverDir === null && hover) for (const d of DIRS) if (eq(stepPos(head, d), hover)) hoverDir = d;
  const preview = useMemo<Fight | null>(() => {
    if (f.status !== 'play') return null;
    if (hint && !hover) return hint.preview;
    if (selected !== null) {
      const k = ops.hand(f)[selected];
      const d = k !== undefined ? item(f.snake.segs[k].item!) : null;
      if (d?.active?.target === 'none' && canPlay(f, selected)) return step(f, { t: 'play', slot: selected });
      if (hoverDir !== null && canPlay(f, selected, hoverDir)) return step(f, { t: 'play', slot: selected, dir: hoverDir });
    } else if (hoverDir !== null && legalMoves(f).includes(hoverDir)) return step(f, { t: 'move', dir: hoverDir });
    return null;
  }, [hover, selected, f, hint, pending]);
  const pocket = useMemo(() => (showPocket() ? coilWithin(f) : null), [f]);
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    r.pocket = pocket;
    r.hover = hover;
    r.preview = preview;
    r.targetDirs = f.status === 'play' && selected !== null ? DIRS.filter((d) => canPlay(f, selected, d)) : null;
  }, [hover, selected, f, preview, pocket]);

  const toCss = (e: MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return renderer.current?.tileAt(e.clientX - rect.left, e.clientY - rect.top) ?? null;
  };
  const onMove = (e: MouseEvent) => {
    const t = toCss(e);
    setHover((h) => (h && t && eq(h, t)) || h === t ? h : t);
  };
  const onClick = (e: MouseEvent) => {
    if (Date.now() - lastTouch.current < 700) return; // handled by the touch path
    const t = toCss(e);
    if (!t) return;
    for (const d of DIRS) if (eq(stepPos(fightRef.current.snake.body[0], d), t)) act(d);
  };
  // Touch: tap/swipe once to preview a direction, again to commit. Taps elsewhere inspect.
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    touchStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || !touchStart.current) return;
    lastTouch.current = Date.now();
    const dx = e.clientX - touchStart.current.x, dy = e.clientY - touchStart.current.y;
    touchStart.current = null;
    const fNow = fightRef.current;
    const h = fNow.snake.body[0];
    let d: Dir | null = null;
    if (Math.hypot(dx, dy) > 28) d = renderer.current!.screenToBoardDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
    else {
      const rect = canvasRef.current!.getBoundingClientRect();
      const t = renderer.current?.tileAt(e.clientX - rect.left, e.clientY - rect.top) ?? null;
      if (t) for (const dd of DIRS) if (eq(stepPos(h, dd), t)) d = dd;
      if (d === null) {
        setPending(null);
        setHover(t);
        if (t) setInfoOpen(true);
        return;
      }
    }
    if (quickRef.current && pendingRef.current === null && legalMoves(fNow).includes(d)) {
      // Quick mode: a swipe moves at once if the preview shows no harm.
      const g = step(fNow, { t: 'move', dir: d });
      const keep = new Set(g.snake.segs.map((x) => x.uid));
      const safe = g.status === 'play' && fNow.snake.segs.every((x) => keep.has(x.uid));
      if (safe && Math.hypot(dx, dy) > 28) {
        act(d);
        return;
      }
    }
    if (pendingRef.current === d) {
      setPending(null);
      setHover(null);
      act(d);
    } else {
      setPending(d);
      setHover(stepPos(h, d));
    }
  };
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  view.rotated = renderer.current?.rotated ?? false;
  const handIdx = ops.hand(f);
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 820px), (pointer: coarse) and (max-height: 520px)').matches;
  const onBoard = f.snake.body.length - 1;
  const flesh = f.snake.segs.filter((s) => !s.item).length;
  const hungerLeft = f.opts.hungerEvery - f.hunger;
  const bonus = regrowFromPlayed(f.played ?? 0);
  // Every item this room started with, in body order, plus temporary ones grown since; faded once gone.
  const liveUids = new Set(f.snake.segs.map((x) => x.uid));
  const seenUids = new Set<number>();
  const itemRow = [...initial.snake.segs, ...f.snake.segs].filter((x) => x.item && !seenUids.has(x.uid) && seenUids.add(x.uid)).map((x) => {
    const d = item(x.item!);
    return { glyph: d.glyph, color: d.color, live: liveUids.has(x.uid), temp: !!x.temp };
  });
  // Hand items an enemy has latched onto: play them and the attack fizzles.
  const targeted = new Set(f.enemies.flatMap((e) => (e.intent.t === 'lock' || e.intent.t === 'steal' ? [e.intent.seg] : [])));

  return (
    <div class="fight">
      <header class="hud">
        <div class="hud-title">{title}</div>
        <div class="hud-stat" title={`Flesh: your health and your currency.${fleshCap !== undefined ? ` Up to ${fleshCap} carry to the next room (hollow: room to grow; grey: won't carry).` : ''}${bonus ? ` Pulsing: ${bonus} regrow at room end (every 2 items played regrow 1).` : ''}`}>
          <b class="flesh">{flesh}</b> <FleshPips n={flesh} cap={fleshCap} regrow={bonus} />
        </div>
        <div class="hud-stat hud-items" title={`Your items. Faded ones are spent or lost — all of them come back next room.${bonus ? ` Every 2 played regrow 1 flesh at room end (+${bonus}).` : ''}`}>
          {itemRow.map((it) => <span class={`hud-item ${it.live ? '' : 'spent'} ${it.temp ? 'temp' : ''}`}><GlyphIcon glyph={it.glyph} color={it.color} size={22} /></span>)}
        </div>
        {mods && mods.length > 0 && <div class="hud-stat mods" title="From an event">{mods.map((m) => <span class="mod-chip">{m}</span>)}</div>}
        {(f.buffs.bite > 0 || f.buffs.absorb > 0) && (
          <div class="hud-stat buffs">
            {f.buffs.bite > 0 && <span class="buff">Next bite +{f.buffs.bite}</span>}
            {f.buffs.absorb > 0 && <span class="buff">Absorb ×{f.buffs.absorb}</span>}
          </div>
        )}
        {(f.snake.segs.length === 0 || (f.breath ?? BREATH) < BREATH) && (
          <div class={`hud-stat breath ${f.snake.segs.length === 0 ? 'warn' : ''}`} title="Breath: every turn with nothing behind your head costs one, for the whole fight. None left: you die.">
            <span class="breath-label">breath</span>
            {Array.from({ length: BREATH }, (_, i) => <span class={`pip ${i < (f.breath ?? BREATH) ? 'on' : ''}`} />)}
          </div>
        )}
        <div class={`hud-stat hunger ${hungerLeft <= 3 ? 'warn' : ''}`} title="Hunger: when the meter runs out, you lose your tail. Eating refills it.">
          <span class="food-orb" />
          <span class="meter"><span style={{ width: `${(100 * Math.max(0, hungerLeft)) / f.opts.hungerEvery}%` }} /></span>
          <b>{hungerLeft}</b>
        </div>
        {spawnIn(f) <= 5 && (
          <div class={`hud-stat spawn ${spawnIn(f) <= 1 ? 'warn' : ''}`} title="Reinforcements: a beetle climbs out of a burrow hole. None come while you are a bare head.">
            beetle in <b>{spawnIn(f)}</b>
          </div>
        )}
        <div class="hud-stat dim turn">Turn {f.turn}</div>
        {f.cleared && <div class="hud-stat good">Exits open</div>}
      </header>
      <div class="board-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={onClick} onPointerDown={onPointerDown} onPointerUp={onPointerUp} />
        {isTouch && hint && pending === null && selected === null && (
          <div class="touch-confirm">Autopilot suggests: <b>{describeAction(f, hint.action)}</b> <span class="dim">— tap Auto to let it play</span></div>
        )}
        {isTouch && pending === null && selected !== null && preview && (
          <div class="touch-confirm">
            <MoveHint f={f} dir={hoverDir} card={hoverDir === null} preview={preview} spent={ops.hand(f)[selected] !== undefined ? f.snake.segs[ops.hand(f)[selected]].uid : undefined} />
            {item(f.snake.segs[ops.hand(f)[selected]].item!).passiveText && <div class="dim">◇ While carried: {item(f.snake.segs[ops.hand(f)[selected]].item!).passiveText}</div>}
            <div class="dim">Tap the card again to play it{item(f.snake.segs[ops.hand(f)[selected]].item!).active?.target === 'dir' ? ' — or pick a direction' : ''}</div>
          </div>
        )}
        {pending !== null && (
          <div class="touch-confirm">
            {hint && <div class="autopilot">Autopilot suggests: <b>{describeAction(f, hint.action)}</b> <span class="dim">{isTouch ? '(Auto to let it play)' : '(P to let it play, Esc to dismiss)'}</span></div>}
        <MoveHint f={f} dir={hoverDir} preview={preview} spent={selected !== null && ops.hand(f)[selected] !== undefined ? f.snake.segs[ops.hand(f)[selected]].uid : undefined} />
            <div class="dim">Tap or swipe the same way again to confirm</div>
          </div>
        )}
        {tip && (
          <div class="tip tip-toast mobile-only" onClick={() => { markSeen(tip.id); tipTurn.current = fightRef.current.turn; setTip(nextTip(fightRef.current)); }}>
            <span class="tip-label">Tip</span> {tip.text} <span class="dim">(tap to dismiss)</span>
          </div>
        )}
        {f.status !== 'play' && (
          <div class={`fight-end ${f.status}`}>
            <div>{f.status === 'won' ? 'Onward…' : 'Your coil unwinds'}</div>
          </div>
        )}
      </div>
      <aside class={`inspector ${infoOpen ? 'open' : ''}`} onClick={(e) => { if ((e.target as HTMLElement).closest('.sheet-close')) setInfoOpen(false); }}>
        <button class="sheet-close mobile-only btn">Close ✕</button>
        {tip && (
          <div class="tip desktop-tip" onClick={() => { markSeen(tip.id); tipTurn.current = fightRef.current.turn; setTip(nextTip(fightRef.current)); }}>
            <span class="tip-label">Tip</span> {tip.text} <span class="dim">(click to dismiss)</span>
          </div>
        )}
        {!isTouch && hint && <div class="autopilot">Autopilot suggests: <b>{describeAction(f, hint.action)}</b> <span class="dim">(P to let it play, Esc to dismiss)</span></div>}
        <MoveHint f={f} dir={hoverDir} preview={preview} spent={selected !== null && ops.hand(f)[selected] !== undefined ? f.snake.segs[ops.hand(f)[selected]].uid : undefined} />
        <Inspector f={f} hover={hover} />
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
              class={`card ${selected === slot ? 'selected' : ''} ${playable ? '' : 'disabled'} ${k >= onBoard ? 'buried' : ''} ${threatened ? 'threatened' : ''} ${!playable && d.active ? 'blocked' : ''}`}
              style={{ '--c': d.color }}
              onClick={() => selectSlot(slot)}
            >
              <CardArt id={seg.item!} height={narrow ? 34 : 50} />
              <div class="card-top">
                <span class="key">{slot + 1}</span>
                <GlyphIcon glyph={d.glyph} color={d.color} size={28} />
                <span class="card-name">{d.name}{seg.temp && <span class="temp-mark"> ·temp</span>}</span>
              </div>
              {d.activeText && <div class="card-text">{d.activeText}</div>}
              {d.passiveText && <div class="card-passive" title={`While carried: ${d.passiveText}`}><span class="passive-mark">◇</span> {d.passiveText}</div>}
              {d.active?.move && <div class="card-tag">MOVE</div>}
              {threatened && <div class="card-threat">{playable ? 'Targeted — play it!' : 'Targeted!'}</div>}
              {!playable && d.active && <div class="card-why">{d.active.requires ?? (d.active.target === 'dir' ? 'No valid direction right now.' : 'Can’t be played right now.')}</div>}
              {!d.active && <div class="card-why">Passive — tuck (T) to cycle</div>}
            </button>
          );
        })}
        <div class="hand-actions">
          <div class="mobile-only mobile-tools">
            <button onClick={() => setInfoOpen((o) => !o)}>Info</button>
            <button onClick={() => { const a = suggest(); if (a) setHint({ action: a, preview: step(fightRef.current, a) }); }}>Hint</button>
            <button onClick={() => { const a = suggest(); if (a) dispatch(a); }}>Auto</button>
            <button onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }))}>Genome</button>
            <button class={quick ? 'on' : ''} title="Quick: safe swipes move at once; risky ones still ask" onClick={() => setQuick((q) => { try { localStorage.setItem('coil.quickmove', q ? '0' : '1'); } catch { /* ignore */ } return !q; })}>Quick{quick ? ' ✓' : ''}</button>
          </div>
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

/** Direction words in screen terms (the board may be drawn rotated). */
const view = { rotated: false };
const dirName = (d: Dir) => ['up', 'right', 'down', 'left'][view.rotated ? (d + 1) % 4 : d];

function describeAction(f: Fight, a: Action): string {
  const dn = (d?: Dir) => (d === undefined ? '' : dirName(d));
  if (a.t === 'move') return `move ${dn(a.dir)}`;
  if (a.t === 'tuck') return 'tuck';
  const k = ops.hand(f)[a.slot];
  const name = k !== undefined ? ITEMS.get(f.snake.segs[k].item!)?.name : '?';
  return `play ${name}${a.dir !== undefined && item(f.snake.segs[k].item!).active?.target === 'dir' ? ` ${dn(a.dir)}` : ''}`;
}

function describeIntent(f: Fight, e: Enemy): string {
  if (e.intent.t === 'move' && e.intent.turn) return 'Boxed in — turning around: its tail becomes its head';
  if (e.mem.swallowing && !e.held && e.intent.t !== 'lock' && e.intent.t !== 'strike') return 'Swallowing — it won’t bite this turn';
  const it = e.intent;
  switch (it.t) {
    case 'wait': return e.held ? 'Held in your coil' : e.mem.swallowing ? 'Swallowing — it won’t bite this turn' : 'Waiting';
    case 'move': return `Moving ${dirName(it.dir)}${it.steps > 1 ? ` ×${it.steps}` : ''}`;
    case 'strike': if (it.lunge) return it.sever ? 'Lunging — severs whatever lies on the red tile' : 'Lunging at the red tile';
      return `Striking ${it.tiles.length} tile${it.tiles.length > 1 ? 's' : ''} for ${it.dmg}`;
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
  if (!hover) return <div class="inspect dim">{isTouch ? 'Tap a tile to inspect it.' : 'Hover a tile to inspect it.'}<Legend f={f} /></div>;
  const e = ops.enemyAt(f, hover);
  if (e) {
    const d = ENEMIES.get(e.kind)!;
    return (
      <div class="inspect">
        <h3 style={{ color: d.color }}>{d.name}</h3>
        <div>HP {e.hp}/{e.maxHp}{e.poison ? ` · ☠ ${e.poison}` : ''}{e.held ? ' · held' : ''}{ops.isMeagre(e) ? ' · meagre: won’t feed you' : ''}</div>
        <div class={`intent ${['strike', 'lock', 'emerge', 'steal'].includes(e.intent.t) ? '' : 'calm'}`}>{describeIntent(f, e)}</div>
        {d.boss && (
          <div class="dim">
            {bossExposed(f, e)
              ? <b style={{ color: 'var(--coil, #c77dff)' }}>Exposed: </b>
              : <>Boss: bites don’t interrupt it, and it <b>ripostes</b> — the tile you bit it from gets struck if you’re still on it next turn. </>}
            {bossExposed(f, e)
              ? <>wrapped or coiled — bites deal +1 and it can’t riposte (with room behind it, a bite knocks it back and interrupts it).{e.body ? ' Its lunge can’t sever.' : ''}</>
              : <>Wrap it or coil it (a snake at its head) to expose it.</>}
          </div>
        )}
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
    return <div class="inspect"><h3>Husk</h3><p>A severed piece of you{h.item ? ` carrying ${ITEMS.get(h.item)?.name}` : ''}. Blocks the way; counts as a coil wall. {h.ttl <= 9 ? `Eat it within ${h.ttl} turns to take it back.` : 'Eat it to take it back.'}</p></div>;
  }
  const tile = ops.tileAt(f, hover);
  if (tile === 2) return <div class="inspect"><h3>Exit</h3><p>{f.cleared ? 'Open! Move into it to leave the room.' : 'Closed until every enemy is dead (escalation spawns don’t count).'}</p></div>;
  if (tile === 3) return <div class="inspect"><h3>Burrow</h3><p>{f.entry && eq(f.entry, hover) ? 'Where you came in. While you are still emerging, segments at its mouth are safe.' : 'Late in a fight, beetles crawl out of holes like this.'} Your head can’t go back in.</p></div>;
  const coil = computeCoils(f).find((c) => c.tiles.some((t) => eq(t, hover)));
  if (coil) return <div class="inspect"><h3>Inside your coil</h3><p>{coil.area} enclosed tile{coil.area > 1 ? 's' : ''}: {coil.crush ? `enemies here take ${coilDamage(f, coil)} crush per turn${coil.ring ? ` (${coil.ring} from ring items)` : ''}` : 'enemies here are held, but not crushed'}. Coiled enemies can’t move or attack.</p></div>;
  if (ops.foodAt(f, hover) >= 0) return <div class="inspect"><h3>Food</h3><p>+1 flesh at the tail. Resets hunger.</p></div>;
  if (ops.webAt(f, hover) >= 0) return <div class="inspect"><h3>Web</h3><p>Moving into it costs your move. Counts as a coil wall.</p></div>;
  return <div class="inspect dim">Empty.<Legend f={f} /></div>;
}

/** Hearts: filled = flesh, grey = over the carry cap, pulsing = regrows at room end, hollow = room to grow. */
function FleshPips({ n, cap, regrow = 0 }: { n: number; cap?: number; regrow?: number }) {
  const total = Math.max(n + regrow, cap ?? n);
  if (total > 16) return <span class="dim">{regrow ? `+${regrow} ` : ''}{cap !== undefined ? `/ ${cap}` : ''}</span>;
  return (
    <span class="pips">
      {Array.from({ length: total }, (_, i) => <i class={i >= n + regrow ? 'empty' : i >= n ? 'regrow' : cap !== undefined && i >= cap ? 'over' : ''} />)}
    </span>
  );
}

function Legend({ f }: { f: Fight }) {
  return (
    <div class="legend">
      {isTouch
        ? <div class="keys">Tap/swipe twice to move · tap a card to play</div>
        : <div class="keys"><kbd>WASD</kbd> move · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> play · <kbd>T</kbd> tuck · <kbd>Z</kbd> undo · <kbd>H</kbd> hint · <kbd>P</kbd> autopilot</div>}
      <details>
        <summary>Rules</summary>
        <ul>
          <li><b>Hand</b>: the first three items behind your head. All items come back next room; only flesh carries over.</li>
          <li><b>Hits</b> destroy the segment they land on. A head hit destroys the two behind it.</li>
          <li><b>Coil</b>: enclose enemies (walls help). They can’t act; the violet number is their crush per turn — tighter is harder.</li>
          <li><b>Wrap</b>: {wrapMin(f)} of your tiles touching an enemy (diagonals count) squeeze it for 1.</li>
          <li><b>Bites</b> knock enemies back and interrupt them, unless pinned. Bosses only while exposed — otherwise they <b>riposte</b>.</li>
          <li><b>Red</b> is always incoming damage.</li>
          {!isTouch && <li><kbd>F2</kbd> toggles the terminal skin — a nod to C and ncurses.</li>}
        </ul>
      </details>
    </div>
  );
}

function MoveHint({ f, dir, preview, spent, card }: { f: Fight; dir: Dir | null; preview: Fight | null; spent?: number; card?: boolean }) {
  if ((dir === null && !card) || f.status !== 'play') return null;
  const legal = card || legalMoves(f).includes(dir!);
  const o = card ? { k: 'play' as const } : moveOutcome(f, dir!);
  const text: Record<string, string> = {
    illegal: 'Blocked', step: 'Move', food: 'Eat', husk: 'Eat husk', web: 'Web: stuck',
    exit: 'Leave the room', bite: 'Bite', body: 'Bite yourself (trapped)', neck: 'Bite your own neck (stuck!)', play: 'Play',
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
    // A dead end: every way on from there is a bite into yourself.
    else if (!card && preview.status === 'play') {
      const outs = legalMoves(preview).map((d) => moveOutcome(preview, d).k);
      if (outs.length && outs.every((k) => k === 'neck' || k === 'body')) lines.push('Lose: dead end — next turn you must bite yourself');
    }
    if (!card && f.buffs.bite > 0 && o.k !== 'bite') lines.push(`Lose: +${f.buffs.bite} bite bonus (no bite this turn)`);
    else if (lost.length) {
      if (lostItems.length) lines.push(`Destroyed unplayed: ${lostItems.join(', ')}`);
      if (lostFlesh) lines.push(`Lose ${lostFlesh} flesh`);
    } else lines.push('No damage taken.');
    if (preview.events.some((e) => e.t === 'msg' && e.text === 'riposte!')) lines.push('Lose: riposte — you stayed on the tile you bit the boss from');
    if (preview.enemies.some((e) => { const rp = riposteTile(e); return !!rp && eq(rp, preview.snake.body[0]); }))
      lines.push('The boss marks this tile: move off it next turn');
    const fizzles = preview.events.filter((e) => e.t === 'fizzle').length;
    if (fizzles) lines.push(`${fizzles} attack${fizzles > 1 ? 's' : ''} will miss`);
    // What you take off them this turn (a snake's cut, a crush, poison), per enemy.
    const dealt = new Map<string, number>();
    for (const ev of preview.events) {
      if (ev.t !== 'enemyHurt' || ev.cause === 'gnaw') continue;
      const en = f.enemies.find((x) => x.id === ev.enemy);
      const name = en ? (ENEMIES.get(en.kind)?.name ?? en.kind) : '?';
      dealt.set(name, (dealt.get(name) ?? 0) + ev.dmg);
    }
    if (dealt.size) lines.push(`Deal: ${[...dealt].map(([n, d]) => `${n} −${d}`).join(', ')}`);
    const kills = preview.events.filter((e) => e.t === 'enemyDie').length;
    if (kills) lines.push(`${kills} kill${kills > 1 ? 's' : ''}`);
    const coils = occupiedCoils(preview);
    for (const c of coils) lines.push(`Coil: ${c.area} tile${c.area > 1 ? 's' : ''} → ${c.crush ? `${coilDamage(preview, c)} crush/turn` : 'held only'}`);
  }
  return (
    <div class="movehint">
      <b>{text[o.k]}</b>
      {lines.map((l) => <div class={l.startsWith('☠') || l.startsWith('Lose') || l.startsWith('Destroyed') ? 'bad' : l.startsWith('Spend') ? 'spend' : ''}>{l}</div>)}
    </div>
  );
}

/**
 * COIL sound design: maps game events to synthesized sounds, plus a quiet
 * procedural ambient pad, UI blips and stingers. See synth.ts for primitives.
 */
import type { GameEvent } from '../core/types';
import { engine, ensureEngine, midi, noise, tone } from './synth';

// ---------------------------------------------------------------- settings

const KEY = 'coil.audio';
let muted = false;
let volume = 0.7;

try {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  if (raw) {
    const s = JSON.parse(raw) as { muted?: unknown; volume?: unknown };
    if (typeof s.muted === 'boolean') muted = s.muted;
    if (typeof s.volume === 'number' && isFinite(s.volume)) volume = clamp01(s.volume);
  }
} catch {
  /* ignore corrupt settings */
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ muted, volume }));
  } catch {
    /* storage may be unavailable */
  }
}

function applyGain(): void {
  const e = engine();
  if (!e) return;
  e.master.gain.setTargetAtTime(muted ? 0 : volume, e.ctx.currentTime, 0.03);
}

export function setMuted(m: boolean): void {
  muted = m;
  persist();
  applyGain();
}
export function isMuted(): boolean {
  return muted;
}
export function setVolume(v: number): void {
  volume = clamp01(v);
  persist();
  applyGain();
}
export function getVolume(): number {
  return volume;
}

/** Create/resume the AudioContext. Call from a user gesture; safe to repeat. */
export function initAudio(): void {
  const had = engine() !== null;
  const e = ensureEngine(muted ? 0 : volume);
  if (e && !had && pendingAct !== null) startAmbient(pendingAct);
}

/** True when sounds should actually be scheduled. */
const live = (): boolean => engine() !== null && !muted;

// ---------------------------------------------------------------- scales

const PENT = [0, 2, 4, 7, 9];
/** Degree `d` (may exceed 4 / be negative) of the major pentatonic on `root` (midi). */
function pent(root: number, d: number): number {
  const o = Math.floor(d / 5);
  const i = ((d % 5) + 5) % 5;
  return midi(root + 12 * o + PENT[i]);
}

// ---------------------------------------------------------------- per-event sounds

let lastDir = '';
let moveStreak = 0;
let eatHeat = 0;
let eatAt = 0;

function sMove(ev: Extract<GameEvent, { t: 'move' }>, dt: number): void {
  const dir = `${Math.sign(ev.to.x - ev.from.x)},${Math.sign(ev.to.y - ev.from.y)}`;
  moveStreak = dir === lastDir ? Math.min(moveStreak + 1, 9) : 0;
  lastDir = dir;
  const f = pent(64, moveStreak);
  tone(f, 0.09, dt, { type: 'triangle', gain: 0.045, lp: 2400, wet: 0.12 });
  tone(f * 2, 0.04, dt, { gain: 0.012 });
}

function sEat(what: 'food' | 'husk' | 'enemy', dt: number): void {
  const now = performance.now() / 1000;
  eatHeat = eatHeat * Math.exp(-(now - eatAt) / 10) + 1;
  eatAt = now;
  if (what === 'food') {
    const base = Math.min(Math.floor(eatHeat) - 1, 10);
    for (let i = 0; i < 4; i++) {
      const f = pent(72, base + i);
      tone(f, 0.16, dt + i * 0.045, { type: 'triangle', gain: 0.09, lp: 5000, wet: 0.3 });
      tone(f * 2, 0.08, dt + i * 0.045, { gain: 0.02 });
    }
  } else if (what === 'husk') {
    tone(midi(57), 0.18, dt, { type: 'triangle', gain: 0.1, lp: 900, wet: 0.2 });
    tone(midi(64), 0.2, dt + 0.07, { type: 'triangle', gain: 0.08, lp: 900, wet: 0.2 });
    noise(0.08, dt, { filter: 'lowpass', from: 900, to: 300, gain: 0.08 });
  } else {
    noise(0.12, dt, { filter: 'lowpass', from: 1400, to: 200, gain: 0.14 });
    tone(140, 0.18, dt, { type: 'sawtooth', glide: 70, gain: 0.08, lp: 600 });
    tone(pent(60, 2), 0.2, dt + 0.08, { type: 'triangle', gain: 0.06, wet: 0.3 });
  }
}

function sBite(killed: boolean, dt: number): void {
  noise(killed ? 0.12 : 0.07, dt, { from: 2600, to: 700, q: 1.4, gain: killed ? 0.2 : 0.14 });
  tone(1900, 0.012, dt, { type: 'square', gain: 0.04, lp: 4000 });
  if (killed) tone(150, 0.22, dt + 0.01, { glide: 50, gain: 0.25 });
}

function sCoil(dt: number): void {
  const sus = [60, 65, 67];
  const maj = [60, 64, 67, 72];
  sus.forEach((m, i) => tone(midi(m), 0.22, dt + i * 0.012, { type: 'triangle', gain: 0.07, lp: 3000, wet: 0.4 }));
  maj.forEach((m, i) =>
    tone(midi(m), 0.7, dt + 0.2 + i * 0.015, { type: 'triangle', gain: 0.075, attack: 0.02, lp: 3500, wet: 0.5 }),
  );
  tone(midi(84), 0.6, dt + 0.24, { gain: 0.02, wet: 0.6 });
}

function sCrush(dt: number): void {
  tone(95, 0.35, dt, { type: 'sawtooth', glide: 62, gain: 0.09, lp: 500, q: 9, attack: 0.04 });
  noise(0.3, dt, { filter: 'bandpass', from: 300, to: 180, q: 6, gain: 0.08, attack: 0.05 });
}

function sPlay(dt: number): void {
  // Fixed shimmer: bell-like partials, staggered upward.
  [2093, 2637, 3136, 3951, 4699].forEach((f, i) =>
    tone(f, 0.35, dt + i * 0.028, { gain: 0.025, wet: 0.7, attack: 0.004 }),
  );
  noise(0.25, dt, { filter: 'highpass', from: 5000, to: 8000, gain: 0.025, attack: 0.03, wet: 0.5 });
}

function sHunger(dt: number): void {
  tone(92, 0.35, dt, { type: 'triangle', glide: 70, gain: 0.1, lp: 350, q: 5, attack: 0.05 });
  tone(118, 0.3, dt + 0.22, { type: 'triangle', glide: 82, gain: 0.08, lp: 300, q: 5, attack: 0.05 });
}

function sCleared(dt: number): void {
  [0, 2, 3, 5].forEach((d, i) => tone(pent(72, d), 0.2, dt + i * 0.08, { type: 'triangle', gain: 0.09, wet: 0.35 }));
  [72, 76, 79, 84].forEach((m) => tone(midi(m), 0.8, dt + 0.34, { type: 'triangle', gain: 0.05, attack: 0.02, wet: 0.5 }));
}

function sDeath(dt: number): void {
  [67, 63, 60, 55, 51].forEach((m, i) =>
    tone(midi(m), 0.45, dt + i * 0.17, { type: 'triangle', gain: 0.1, lp: 1600, wet: 0.5 }),
  );
  tone(midi(36), 1.4, dt + 0.85, { gain: 0.15, attack: 0.05, wet: 0.3 });
}

function playOne(ev: GameEvent, dt: number): void {
  switch (ev.t) {
    case 'move':
      return sMove(ev, dt);
    case 'eat':
      return sEat(ev.what, dt);
    case 'bite':
      return sBite(ev.killed, dt);
    case 'knockback':
      return tone(180, 0.08, dt, { glide: 110, gain: 0.08 });
    case 'segLost':
      tone(170, 0.26, dt, { glide: 45, gain: 0.26 });
      return noise(0.05, dt, { filter: 'lowpass', from: 600, to: 150, gain: 0.1 });
    case 'absorb':
      tone(1760, 0.3, dt, { gain: 0.05, wet: 0.6 });
      return tone(2637, 0.22, dt + 0.01, { gain: 0.03, wet: 0.6 });
    case 'sever':
      noise(0.5, dt, { from: 3500, to: 250, q: 3, gain: 0.22, wet: 0.3 });
      noise(0.3, dt + 0.05, { filter: 'highpass', from: 2000, to: 800, gain: 0.08 });
      return tone(220, 0.45, dt, { type: 'sawtooth', glide: 55, gain: 0.07, lp: 1200 });
    case 'coil':
      return sCoil(dt);
    case 'enemyHurt':
      if (ev.cause === 'crush') return sCrush(dt);
      return tone(260, 0.07, dt, { type: 'triangle', glide: 140, gain: 0.08 });
    case 'enemyDie':
      tone(880, 0.1, dt, { type: 'triangle', glide: 440, gain: 0.08, wet: 0.3 });
      return noise(0.04, dt, { from: 1500, gain: 0.06 });
    case 'fizzle':
      return noise(0.22, dt, { filter: 'highpass', from: 2500, to: 5000, gain: 0.04, attack: 0.03 });
    case 'strike':
      return noise(0.2, dt, { from: 350, to: 2800, q: 2, gain: 0.12, attack: 0.05 });
    case 'webbed':
      return tone(118, 0.4, dt, { type: 'triangle', glide: 92, gain: 0.12, lp: 700, q: 10 });
    case 'spawn':
      noise(0.6, dt, { filter: 'lowpass', from: 220, to: 70, gain: 0.2, attack: 0.08 });
      return tone(55, 0.6, dt, { gain: 0.12, attack: 0.08 });
    case 'hunger':
      return sHunger(dt);
    case 'cleared':
      return sCleared(dt);
    case 'exit':
      noise(0.45, dt, { from: 300, to: 4000, q: 1.5, gain: 0.1, attack: 0.1, wet: 0.4 });
      return tone(300, 0.45, dt, { glide: 900, gain: 0.05, attack: 0.1, wet: 0.4 });
    case 'death':
      return sDeath(dt);
    case 'play':
      return sPlay(dt);
    case 'grow':
    case 'enemyMove':
    case 'msg':
      return;
  }
}

/** Stagger phase (seconds) per event type: player → contact → enemies → room. */
const PHASE: Partial<Record<GameEvent['t'], number>> = {
  move: 0, play: 0, exit: 0,
  eat: 0.04, bite: 0.04, absorb: 0.05, coil: 0.06, sever: 0.05, knockback: 0.06,
  enemyHurt: 0.12, enemyDie: 0.15, strike: 0.12, fizzle: 0.12, webbed: 0.14, segLost: 0.16, spawn: 0.2,
  hunger: 0.22, cleared: 0.3, death: 0.3,
};
/** Max repeats of one event type per batch (the rest are dropped). */
const MAX_SAME = 3;
const MAX_PER_BATCH = 10;

/** Play all events from one game action, staggered so they stay legible. */
export function playEvents(events: GameEvent[]): void {
  if (!live()) return;
  const seen = new Map<string, number>();
  let n = 0;
  for (const ev of events) {
    const phase = PHASE[ev.t];
    if (phase === undefined) continue;
    const k = seen.get(ev.t) ?? 0;
    const limit = ev.t === 'coil' || ev.t === 'death' || ev.t === 'cleared' ? 1 : MAX_SAME;
    if (k >= limit || n >= MAX_PER_BATCH) continue;
    seen.set(ev.t, k + 1);
    n++;
    try {
      playOne(ev, phase + k * 0.045);
    } catch {
      /* never let audio break the game */
    }
  }
}

// ---------------------------------------------------------------- UI + stingers

let hoverAt = 0;
export function uiClick(): void {
  if (!live()) return;
  tone(1300, 0.03, 0, { type: 'triangle', gain: 0.05 });
  tone(650, 0.04, 0.005, { gain: 0.03 });
}
export function uiHover(): void {
  if (!live()) return;
  const now = performance.now();
  if (now - hoverAt < 50) return;
  hoverAt = now;
  tone(2100, 0.025, 0, { gain: 0.012 });
}

export function stinger(kind: 'victory' | 'defeat' | 'reward' | 'boss'): void {
  if (!live()) return;
  try {
    if (kind === 'victory') {
      [0, 1, 2, 3, 4, 5].forEach((d, i) => tone(pent(67, d), 0.25, i * 0.09, { type: 'triangle', gain: 0.08, wet: 0.4 }));
      [67, 71, 74, 79, 83].forEach((m) => tone(midi(m), 1.6, 0.55, { type: 'triangle', gain: 0.045, attack: 0.04, wet: 0.6 }));
    } else if (kind === 'defeat') {
      [64, 60, 57, 52].forEach((m, i) => tone(midi(m), 0.7, i * 0.3, { type: 'triangle', gain: 0.08, lp: 1200, wet: 0.6 }));
      tone(midi(33), 2, 1.1, { gain: 0.14, attack: 0.1, wet: 0.4 });
    } else if (kind === 'reward') {
      tone(pent(79, 0), 0.3, 0, { gain: 0.06, wet: 0.6 });
      tone(pent(79, 2), 0.4, 0.08, { gain: 0.06, wet: 0.6 });
      tone(pent(79, 5), 0.6, 0.16, { gain: 0.04, wet: 0.7 });
    } else {
      noise(1.2, 0, { filter: 'lowpass', from: 300, to: 60, gain: 0.25, attack: 0.02, wet: 0.4 });
      tone(midi(31), 1.6, 0, { type: 'sawtooth', gain: 0.1, lp: 400, attack: 0.02, wet: 0.4 });
      tone(midi(37), 1.4, 0.2, { type: 'sawtooth', gain: 0.07, lp: 500, attack: 0.05, wet: 0.5 });
    }
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- ambient

interface Ambient {
  bus: GainNode;
  oscs: OscillatorNode[];
  timer: number;
}
let amb: Ambient | null = null;
let pendingAct: number | null = null;

/** Root (midi) and scale per act: Garden warm, Roots earthy, Deep dark. */
const ACTS: { root: number; scale: number[]; cutoff: number }[] = [
  { root: 50, scale: [0, 2, 4, 7, 9], cutoff: 900 }, // D major pentatonic
  { root: 45, scale: [0, 3, 5, 7, 10], cutoff: 650 }, // A minor pentatonic
  { root: 40, scale: [0, 1, 5, 7, 8], cutoff: 420 }, // E "in" scale, dark
];

export function startAmbient(act: number): void {
  pendingAct = act;
  const e = engine();
  if (!e) return;
  stopAmbient(true);
  const cfg = ACTS[Math.max(0, Math.min(ACTS.length - 1, act | 0))];
  try {
    const { ctx } = e;
    const t = ctx.currentTime;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.exponentialRampToValueAtTime(0.05, t + 4);
    bus.connect(e.master);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    bus.connect(send).connect(e.verb);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cfg.cutoff;
    lp.Q.value = 0.5;
    lp.connect(bus);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = cfg.cutoff * 0.35;
    lfo.connect(lfoAmt).connect(lp.frequency);

    const oscs: OscillatorNode[] = [lfo];
    const voicing: [number, OscillatorType, number, number][] = [
      [cfg.root - 12, 'sine', 0, 0.5],
      [cfg.root, 'triangle', -6, 0.3],
      [cfg.root + 7, 'triangle', 5, 0.22],
      [cfg.root + 12, 'sine', 3, 0.12],
    ];
    for (const [m, type, det, g] of voicing) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = midi(m);
      o.detune.value = det;
      const vg = ctx.createGain();
      vg.gain.value = g;
      o.connect(vg).connect(lp);
      oscs.push(o);
    }
    for (const o of oscs) o.start(t);

    const sparkle = (): void => {
      if (!amb || amb.bus !== bus) return;
      if (!muted) {
        const d = cfg.scale[Math.floor(Math.random() * cfg.scale.length)];
        const oct = 12 * (1 + Math.floor(Math.random() * 2));
        tone(midi(cfg.root + oct + d), 1.6, 0, { gain: 0.35, attack: 0.25, lp: 1800, out: bus });
      }
      amb.timer = window.setTimeout(sparkle, 2500 + Math.random() * 4500);
    };
    amb = { bus, oscs, timer: window.setTimeout(sparkle, 3000) };
  } catch {
    amb = null;
  }
}

export function stopAmbient(keepPending = false): void {
  if (!keepPending) pendingAct = null;
  const a = amb;
  amb = null;
  const e = engine();
  if (!a || !e) return;
  window.clearTimeout(a.timer);
  try {
    const t = e.ctx.currentTime;
    a.bus.gain.cancelScheduledValues(t);
    a.bus.gain.setTargetAtTime(0.0001, t, 0.5);
    for (const o of a.oscs) o.stop(t + 2.5);
    window.setTimeout(() => {
      try {
        a.bus.disconnect();
      } catch {
        /* ignore */
      }
    }, 2700);
  } catch {
    /* ignore */
  }
}

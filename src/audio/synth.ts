/**
 * Low-level WebAudio synthesis primitives for COIL. Everything is generated at
 * runtime — no audio files. All functions are no-ops until `ensureEngine()`
 * has succeeded (which must happen inside a user gesture).
 */

export interface Engine {
  ctx: AudioContext;
  /** Master volume/mute stage (→ compressor → destination). */
  master: GainNode;
  /** Dry bus for sound effects. */
  sfx: GainNode;
  /** Reverb send (→ convolver → master). */
  verb: GainNode;
  noise: AudioBuffer;
}

let eng: Engine | null = null;
let failed = false;

/** Hard cap on concurrently sounding voices (one voice = one scheduled note/noise). */
const MAX_VOICES = 24;
let voices = 0;

export function engine(): Engine | null {
  return eng;
}

export function ensureEngine(volume: number): Engine | null {
  if (eng) {
    if (eng.ctx.state === 'suspended') void eng.ctx.resume().catch(() => {});
    return eng;
  }
  if (failed || typeof window === 'undefined') return null;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error('no WebAudio');
    const ctx = new Ctor();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = volume;
    master.connect(comp);

    const sfx = ctx.createGain();
    sfx.gain.value = 0.9;
    sfx.connect(master);

    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, 2.2, 2.8);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.35;
    conv.connect(verbOut).connect(master);
    const verb = ctx.createGain();
    verb.gain.value = 1;
    verb.connect(conv);

    eng = { ctx, master, sfx, verb, noise: makeNoise(ctx, 2) };
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return eng;
  } catch {
    failed = true;
    eng = null;
    return null;
  }
}

function makeNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Exponentially decaying stereo noise — a soft, damp "cave" room. */
function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      // one-pole lowpass on the noise keeps the tail dark and non-hissy
      lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;
      d[i] = lp * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function claim(): boolean {
  if (voices >= MAX_VOICES) return false;
  voices++;
  return true;
}

function release(src: AudioScheduledSourceNode, extra: AudioNode[]): void {
  src.onended = () => {
    voices = Math.max(0, voices - 1);
    try {
      src.disconnect();
      for (const n of extra) n.disconnect();
    } catch {
      /* ignore */
    }
  };
}

export const midi = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  /** Frequency to glide to over the duration. */
  glide?: number;
  /** Lowpass cutoff (Hz); a pluck-like filter envelope drops it to 30% over the note. */
  lp?: number;
  q?: number;
  /** Reverb send amount 0..1. */
  wet?: number;
  detune?: number;
  /** Destination override (e.g. ambient bus). */
  out?: AudioNode;
}

/** One enveloped oscillator note starting `delay` seconds from now. */
export function tone(freq: number, dur: number, delay = 0, o: ToneOpts = {}): void {
  const e = eng;
  if (!e || !claim()) return;
  const { ctx } = e;
  const t = ctx.currentTime + Math.max(0, delay);
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.glide), t + dur);
  if (o.detune) osc.detune.value = o.detune;
  const g = ctx.createGain();
  const peak = o.gain ?? 0.2;
  const atk = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + atk + dur);
  const extra: AudioNode[] = [g];
  let head: AudioNode = osc;
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = o.q ?? 0.7;
    f.frequency.setValueAtTime(o.lp, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, o.lp * 0.3), t + atk + dur);
    osc.connect(f);
    head = f;
    extra.push(f);
  }
  head.connect(g);
  g.connect(o.out ?? e.sfx);
  if (o.wet) {
    const s = ctx.createGain();
    s.gain.value = o.wet;
    g.connect(s).connect(e.verb);
    extra.push(s);
  }
  osc.start(t);
  osc.stop(t + atk + dur + 0.05);
  release(osc, extra);
}

export interface NoiseOpts {
  gain?: number;
  attack?: number;
  filter?: BiquadFilterType;
  /** Filter frequency at start and end (sweep). */
  from?: number;
  to?: number;
  q?: number;
  wet?: number;
}

/** A filtered noise burst. */
export function noise(dur: number, delay = 0, o: NoiseOpts = {}): void {
  const e = eng;
  if (!e || !claim()) return;
  const { ctx } = e;
  const t = ctx.currentTime + Math.max(0, delay);
  const src = ctx.createBufferSource();
  src.buffer = e.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.Q.value = o.q ?? 1;
  const from = o.from ?? 1200;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to ?? from), t + dur);
  const g = ctx.createGain();
  const atk = o.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + atk + dur);
  src.connect(f).connect(g).connect(e.sfx);
  const extra: AudioNode[] = [f, g];
  if (o.wet) {
    const s = ctx.createGain();
    s.gain.value = o.wet;
    g.connect(s).connect(e.verb);
    extra.push(s);
  }
  src.start(t, Math.random() * 1.5);
  src.stop(t + atk + dur + 0.05);
  release(src, extra);
}

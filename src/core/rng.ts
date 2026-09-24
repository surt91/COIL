/**
 * Small deterministic PRNG (mulberry32). The whole state is a single uint32,
 * so it can be stored in the (serializable) game state and cloned for free.
 */
export interface Rng {
  s: number;
}

export function makeRng(seed: number): Rng {
  return { s: seed >>> 0 };
}

export function seedFromString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Uniform float in [0, 1). */
export function next(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform integer in [lo, hi] (inclusive). */
export function int(r: Rng, lo: number, hi: number): number {
  return lo + Math.floor(next(r) * (hi - lo + 1));
}

export function chance(r: Rng, p: number): boolean {
  return next(r) < p;
}

export function pick<T>(r: Rng, xs: readonly T[]): T {
  if (xs.length === 0) throw new Error('pick from empty array');
  return xs[Math.floor(next(r) * xs.length)];
}

export function shuffle<T>(r: Rng, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(next(r) * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

export function weighted<T>(r: Rng, xs: readonly (readonly [T, number])[]): T {
  const total = xs.reduce((a, [, w]) => a + w, 0);
  let x = next(r) * total;
  for (const [v, w] of xs) {
    x -= w;
    if (x < 0) return v;
  }
  return xs[xs.length - 1][0];
}

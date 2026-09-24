/**
 * Serpent body renderer: a continuous, tapered, filled body along a smoothed
 * centreline (Catmull-Rom through the segment centres), with two-tone
 * shading, a dorsal stripe and diamond markings. Used for the player and for
 * enemy snakes.
 */
type G = CanvasRenderingContext2D;
type V = { x: number; y: number };

export interface SerpentStyle {
  head: readonly number[];
  tail: readonly number[];
  outline: string;
  pattern: string;
  stripe: string;
}

interface Sample extends V {
  /** Fractional segment index (0 = head). */
  t: number;
  w: number;
  nx: number;
  ny: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rgb = (c: readonly number[], a = 1) => `rgba(${c.map(Math.round).join(',')},${a})`;
const mixc = (a: readonly number[], b: readonly number[], t: number) => a.map((v, i) => lerp(v, b[i], t));

function catmull(p0: V, p1: V, p2: V, p3: V, t: number): V {
  const t2 = t * t, t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

/**
 * pts: segment centres in px, head first. width(t): body width in px at
 * fractional index t. sway: lateral wobble amplitude in px.
 */
export function sampleBody(pts: V[], width: (t: number) => number, sway: number, now: number, tipLen: number): Sample[] {
  const n = pts.length;
  if (n < 2) return [];
  const per = 7;
  const raw: { p: V; t: number }[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < per; k++) raw.push({ p: catmull(p0, p1, p2, p3, k / per), t: i + k / per });
  }
  raw.push({ p: pts[n - 1], t: n - 1 });
  // Pointed tail tip beyond the last segment centre.
  const a = pts[n - 2], b = pts[n - 1];
  const dl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const steps = 4;
  for (let k = 1; k <= steps; k++) {
    const u = k / steps;
    raw.push({ p: { x: b.x + ((b.x - a.x) / dl) * tipLen * u, y: b.y + ((b.y - a.y) / dl) * tipLen * u }, t: n - 1 + u * 0.999 });
  }
  const out: Sample[] = [];
  for (let i = 0; i < raw.length; i++) {
    const prev = raw[Math.max(0, i - 1)].p, next = raw[Math.min(raw.length - 1, i + 1)].p;
    let tx = next.x - prev.x, ty = next.y - prev.y;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const nx = -ty, ny = tx;
    const t = raw[i].t;
    const tipFade = t > n - 1 ? 1 - (t - (n - 1)) : 1;
    const w = width(Math.min(t, n - 1)) * Math.max(0.08, tipFade);
    // Slither: a travelling wave, fading in behind the neck.
    const s = Math.sin(now / 380 - t * 1.1) * sway * Math.min(1, t / 1.5);
    out.push({ x: raw[i].p.x + nx * s, y: raw[i].p.y + ny * s, t, w, nx, ny });
  }
  return out;
}

function outlinePath(ctx: G, ss: Sample[], grow: number, from = 0, to = ss.length - 1) {
  ctx.beginPath();
  for (let i = from; i <= to; i++) {
    const s = ss[i];
    const r = s.w / 2 + grow;
    i === from ? ctx.moveTo(s.x + s.nx * r, s.y + s.ny * r) : ctx.lineTo(s.x + s.nx * r, s.y + s.ny * r);
  }
  for (let i = to; i >= from; i--) {
    const s = ss[i];
    const r = s.w / 2 + grow;
    ctx.lineTo(s.x - s.nx * r, s.y - s.ny * r);
  }
  ctx.closePath();
}

export function drawBody(ctx: G, ss: Sample[], n: number, st: SerpentStyle) {
  if (ss.length < 2) return;
  ctx.save();
  ctx.lineJoin = 'round';
  // Outline.
  ctx.fillStyle = st.outline;
  outlinePath(ctx, ss, 2.2);
  ctx.fill();
  // Body in chunks (colour fades from head to tail); overlap slightly to hide seams.
  const chunk = 3;
  for (let i = 0; i < ss.length - 1; i += chunk) {
    const j = Math.min(ss.length - 1, i + chunk + 1);
    const c = rgb(mixc(st.head, st.tail, Math.min(1, ss[i].t / Math.max(1, n - 1))));
    ctx.fillStyle = c;
    outlinePath(ctx, ss, 0, i, j);
    ctx.fill();
  }
  // Belly shading on one side, sheen on the other.
  const edge = (side: number, off: number, width: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ss.forEach((s, i) => {
      const r = (s.w / 2) * off * side;
      i ? ctx.lineTo(s.x + s.nx * r, s.y + s.ny * r) : ctx.moveTo(s.x + s.nx * r, s.y + s.ny * r);
    });
    ctx.stroke();
  };
  const wHead = ss[0].w;
  edge(-1, 0.62, wHead * 0.22, 'rgba(0,0,0,0.22)');
  edge(1, 0.45, wHead * 0.1, 'rgba(255,255,255,0.14)');
  // Dorsal stripe.
  ctx.strokeStyle = st.stripe;
  ctx.lineWidth = wHead * 0.12;
  ctx.beginPath();
  ss.forEach((s, i) => (i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y)));
  ctx.stroke();
  // Diamond markings between segment centres.
  ctx.fillStyle = st.pattern;
  for (const s of ss) {
    const frac = s.t % 1;
    if (Math.abs(frac - 0.5) > 0.08 || s.t < 0.6 || s.t > n - 1) continue;
    const big = Math.floor(s.t) % 2 === 0;
    const L = s.w * (big ? 0.36 : 0.24), W = s.w * (big ? 0.26 : 0.16);
    const tx = s.ny, ty = -s.nx;
    ctx.beginPath();
    ctx.moveTo(s.x + tx * L, s.y + ty * L);
    ctx.lineTo(s.x + s.nx * W, s.y + s.ny * W);
    ctx.lineTo(s.x - tx * L, s.y - ty * L);
    ctx.lineTo(s.x - s.nx * W, s.y - s.ny * W);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Head facing +x in local coordinates; T = tile size. */
export function drawHead(ctx: G, T0: number, st: SerpentStyle, now: number, opts: { tongue?: boolean; eye?: string; crown?: boolean } = {}) {
  const T = T0 * 1.18;
  // Wedge-shaped head, wider than the neck, rounded snout.
  const shape = (g: number) => {
    ctx.beginPath();
    ctx.moveTo(-0.3 * T, -0.24 * T - g);
    ctx.bezierCurveTo(-0.1 * T, -0.42 * T - g, 0.3 * T, -0.36 * T - g, 0.46 * T + g, -0.12 * T);
    ctx.quadraticCurveTo(0.55 * T + g, 0, 0.46 * T + g, 0.12 * T);
    ctx.bezierCurveTo(0.3 * T, 0.36 * T + g, -0.1 * T, 0.42 * T + g, -0.3 * T, 0.24 * T + g);
    ctx.quadraticCurveTo(-0.4 * T - g, 0, -0.3 * T, -0.24 * T - g);
    ctx.closePath();
  };
  // Tongue first (under the head).
  if (opts.tongue ?? Math.sin(now / 900) > 0.9) {
    const flick = Math.sin(now / 45) * 0.04 * T;
    ctx.strokeStyle = '#ef476f';
    ctx.lineWidth = Math.max(1.5, T * 0.045);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0.45 * T, 0);
    ctx.lineTo(0.68 * T, flick);
    ctx.lineTo(0.78 * T, flick - 0.07 * T);
    ctx.moveTo(0.68 * T, flick);
    ctx.lineTo(0.78 * T, flick + 0.07 * T);
    ctx.stroke();
  }
  ctx.fillStyle = st.outline;
  shape(2.2);
  ctx.fill();
  const g = ctx.createLinearGradient(-0.3 * T, -0.3 * T, 0.4 * T, 0.3 * T);
  g.addColorStop(0, rgb(mixc(st.head, [255, 255, 255], 0.25)));
  g.addColorStop(1, rgb(st.head));
  ctx.fillStyle = g;
  shape(0);
  ctx.fill();
  // V-shaped crown marking behind the eyes (top-down view).
  ctx.strokeStyle = st.pattern;
  ctx.lineWidth = Math.max(1.5, T * 0.05);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-0.22 * T, -0.16 * T);
  ctx.lineTo(0.02 * T, 0);
  ctx.lineTo(-0.22 * T, 0.16 * T);
  ctx.stroke();
  // Eyes with slit pupils; occasional blink.
  const blink = Math.sin(now / 1700) > 0.985;
  for (const s of [-1, 1]) {
    ctx.fillStyle = opts.eye ?? '#f7e36b';
    ctx.beginPath();
    ctx.ellipse(0.2 * T, s * 0.24 * T, 0.09 * T, blink ? 0.012 * T : 0.065 * T, s * 0.35, 0, Math.PI * 2);
    ctx.fill();
    if (!blink) {
      ctx.fillStyle = '#0d1321';
      ctx.beginPath();
      ctx.ellipse(0.22 * T, s * 0.24 * T, 0.016 * T, 0.055 * T, s * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(0.2 * T, s * 0.24 * T - 0.02 * T, 0.012 * T, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Nostrils.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(0.42 * T, s * 0.055 * T, 0.017 * T, 0, Math.PI * 2);
    ctx.fill();
  }
  if (opts.crown) {
    ctx.fillStyle = '#ffd166';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-0.12 * T, i * 0.13 * T - 0.04 * T);
      ctx.lineTo(-0.34 * T, i * 0.16 * T);
      ctx.lineTo(-0.12 * T, i * 0.13 * T + 0.04 * T);
      ctx.closePath();
      ctx.fill();
    }
  }
}

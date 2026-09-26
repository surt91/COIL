/**
 * Procedural card illustrations, one small scene per item, in the same
 * hand-drawn vector style as the board. Snakes are drawn with the serpent
 * renderer, creatures with the creature renderer.
 */
import { CHARMS, ITEMS } from '../core/registry';
import { drawCreature } from './creatures';
import { drawGlyph } from './glyphs';
import { SPECIES_STYLES, SerpentStyle, drawBody, drawHead, sampleBody } from './serpent';

type G = CanvasRenderingContext2D;
type V = { x: number; y: number };

const SNAKE: SerpentStyle = SPECIES_STYLES.garden;

function hexRgb(h: string): number[] {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const rgba = (c: number[], a: number) => `rgba(${c.join(',')},${a})`;

/** A snake along a polyline (head first) with body width ~ T*0.6. */
function snake(ctx: G, pts: V[], T: number, opts: { head?: boolean; alpha?: number; tongue?: boolean; style?: SerpentStyle } = {}) {
  const st = opts.style ?? SNAKE;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  const n = pts.length;
  const ss = sampleBody(pts, (t) => (0.62 - 0.3 * (t / Math.max(1, n - 1))) * T * (st.girth ?? 1), 0, 0, T * 0.5);
  drawBody(ctx, ss, n, st);
  if (opts.head !== false && n > 1) {
    ctx.translate(pts[0].x, pts[0].y);
    ctx.rotate(Math.atan2(pts[0].y - pts[1].y, pts[0].x - pts[1].x));
    drawHead(ctx, T, st, 0, { tongue: opts.tongue ?? false });
  }
  ctx.restore();
}

const wave = (x0: number, x1: number, y: number, amp: number, n: number, phase = 0): V[] =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { x: x0 + (x1 - x0) * t, y: y + Math.sin(t * Math.PI * 2 + phase) * amp };
  });

function speedLines(ctx: G, x0: number, x1: number, ys: number[], color: string) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ys.forEach((y, i) => {
    ctx.lineWidth = 2 - i * 0.3;
    ctx.beginPath();
    ctx.moveTo(x0 + i * 8, y);
    ctx.lineTo(x1 - i * 14, y);
    ctx.stroke();
  });
}

function drop(ctx: G, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.6);
  ctx.quadraticCurveTo(x + r * 1.1, y - r * 0.2, x + r, y + r * 0.3);
  ctx.arc(x, y + r * 0.3, r, 0, Math.PI);
  ctx.quadraticCurveTo(x - r * 1.1, y - r * 0.2, x, y - r * 1.6);
  ctx.fill();
}

function scalesPattern(ctx: G, w: number, h: number, r: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  for (let row = 0; row * r * 0.7 < h + r; row++) {
    for (let col = -1; col * r * 1.4 < w + r; col++) {
      const x = col * r * 1.4 + (row % 2 ? r * 0.7 : 0), y = row * r * 0.7;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.75, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
  }
}

type Scene = (ctx: G, w: number, h: number, c: number[]) => void;

const SCENES: Record<string, Scene> = {
  lunge(ctx, w, h, c) {
    // A diagonal strike at a beetle.
    speedLines(ctx, w * 0.02, w * 0.45, [h * 0.72, h * 0.84, h * 0.95], rgba(c, 0.45));
    snake(ctx, [{ x: w * 0.66, y: h * 0.34 }, { x: w * 0.52, y: h * 0.5 }, { x: w * 0.38, y: h * 0.62 }, { x: w * 0.22, y: h * 0.7 }, { x: w * 0.08, y: h * 0.72 }], h * 0.3, { tongue: true });
    ctx.save();
    ctx.translate(w * 0.84, h * 0.24);
    drawCreature(ctx, 'beetle', h * 0.5, '#b0764a', 0.2);
    ctx.restore();
  },
  sprint(ctx, w, h, c) {
    speedLines(ctx, w * 0.02, w * 0.7, [h * 0.25, h * 0.4, h * 0.55, h * 0.7, h * 0.82], rgba(c, 0.45));
    snake(ctx, wave(w * 0.9, w * 0.45, h * 0.5, h * 0.04, 5), h * 0.28);
  },
  fang(ctx, w, h, c) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.1, w * 0.4, h * 0.5, 0, 0, Math.PI);
    ctx.fill();
    for (const s of [-1, 1]) {
      const x = w / 2 + s * w * 0.12;
      const g = ctx.createLinearGradient(x, h * 0.1, x, h * 0.85);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, rgba(c, 1));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 12, h * 0.1);
      ctx.quadraticCurveTo(x - 4, h * 0.5, x + s * 6, h * 0.88);
      ctx.quadraticCurveTo(x + 4, h * 0.45, x + 12, h * 0.1);
      ctx.fill();
    }
  },
  scale(ctx, w, h, c) {
    scalesPattern(ctx, w, h, h * 0.3, rgba(c, 0.35));
    ctx.fillStyle = rgba(c, 0.9);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.12);
    ctx.quadraticCurveTo(w / 2 + h * 0.42, h * 0.3, w / 2, h * 0.9);
    ctx.quadraticCurveTo(w / 2 - h * 0.42, h * 0.3, w / 2, h * 0.12);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.18);
    ctx.lineTo(w / 2, h * 0.84);
    ctx.stroke();
  },
  venom(ctx, w, h, c) {
    // A single fat drop falling onto a beetle, with a green splash.
    ctx.save();
    ctx.translate(w * 0.62, h * 0.72);
    drawCreature(ctx, 'beetle', h * 0.55, '#b0764a', 0.2);
    ctx.restore();
    ctx.fillStyle = rgba(c, 0.95);
    drop(ctx, w * 0.62, h * 0.3, 9);
    ctx.strokeStyle = rgba(c, 0.8);
    ctx.lineWidth = 2;
    for (const a of [-2.4, -1.9, -1.2, -0.7]) {
      ctx.beginPath();
      ctx.moveTo(w * 0.62 + Math.cos(a) * h * 0.25, h * 0.66 + Math.sin(a) * h * 0.25);
      ctx.lineTo(w * 0.62 + Math.cos(a) * h * 0.38, h * 0.66 + Math.sin(a) * h * 0.38);
      ctx.stroke();
    }
    ctx.fillStyle = rgba(c, 0.5);
    drop(ctx, w * 0.2, h * 0.45, 4);
    drop(ctx, w * 0.3, h * 0.2, 3);
  },
  spine(ctx, w, h, c) {
    snake(ctx, wave(w * 0.95, w * 0.05, h * 0.75, h * 0.08, 7), h * 0.3, { head: false });
    ctx.fillStyle = rgba(c, 1);
    for (let i = 0; i < 7; i++) {
      const x = w * (0.12 + i * 0.12), y = h * 0.62 + Math.sin(i) * 3;
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 3, y - h * 0.45);
      ctx.lineTo(x + 6, y);
      ctx.fill();
    }
  },
  heart(ctx, w, h, c) {
    ctx.fillStyle = '#2a1426';
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, h * 0.7);
    g.addColorStop(0, 'rgba(255, 209, 150, 0.45)');
    g.addColorStop(1, 'rgba(255, 209, 150, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    drawGlyph(ctx, 'heart', w / 2, h * 0.52, h * 0.55, rgba(c, 1));
    ctx.strokeStyle = 'rgba(255, 200, 150, 0.45)';
    ctx.lineWidth = 1.5;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + sgn * h * 0.3, h * 0.45);
      ctx.bezierCurveTo(w / 2 + sgn * h * 0.8, h * 0.2, w / 2 + sgn * h * 1.1, h * 0.9, w / 2 + sgn * w * 0.45, h * 0.6);
      ctx.stroke();
    }
  },
  knot(ctx, w, h, c) {
    // A body tied in an overhand knot, a violet thread running to the item tied behind it.
    const cx = w * 0.42, cy = h * 0.5, R = h * 0.26;
    const pts: V[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const a = -Math.PI * 0.2 + t * Math.PI * 2.4;
      pts.push({ x: cx + Math.cos(a) * R * (1 - 0.25 * t) - (1 - t) * R * 1.2, y: cy + Math.sin(a) * R * 0.9 });
    }
    snake(ctx, pts.reverse(), h * 0.2);
    ctx.strokeStyle = rgba(c, 0.85);
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx + R * 0.9, cy);
    ctx.quadraticCurveTo(w * 0.7, h * 0.2, w * 0.8, h * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(13, 19, 33, 0.85)';
    ctx.beginPath();
    ctx.arc(w * 0.8, h * 0.5, h * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(c, 0.9);
    ctx.stroke();
    drawGlyph(ctx, 'fang', w * 0.8, h * 0.5, h * 0.12, '#f1faee');
  },
  scute(ctx, w, h, c) {
    // Three belly plates; the glowing middle one turns a mandible away from its neighbour.
    const pw = w * 0.2, ph = h * 0.5, y = h * 0.28;
    for (let i = -1; i <= 1; i++) {
      const x = w / 2 + i * pw * 1.15 - pw / 2;
      ctx.fillStyle = i === 0 ? rgba(c, 0.95) : 'rgba(168, 218, 220, 0.35)';
      ctx.beginPath();
      ctx.roundRect(x, y, pw, ph, pw * 0.3);
      ctx.fill();
      if (i === 0) {
        ctx.strokeStyle = 'rgba(13, 19, 33, 0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + pw / 2, y + ph * 0.18);
        ctx.lineTo(x + pw / 2, y + ph * 0.82);
        ctx.stroke();
      }
    }
    // Guard brackets over both neighbours.
    ctx.strokeStyle = rgba(c, 0.9);
    ctx.lineWidth = 2;
    for (const i of [-1, 1]) {
      const x = w / 2 + i * pw * 1.15;
      ctx.beginPath();
      ctx.arc(x, y + ph / 2, pw * 0.75, i < 0 ? Math.PI * 0.75 : -Math.PI * 0.25, i < 0 ? Math.PI * 1.25 : Math.PI * 0.25);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(w * 0.08, h * 0.52);
    drawCreature(ctx, 'beetle', h * 0.42, '#b0764a', 0.3);
    ctx.restore();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    for (const a of [-0.7, 0, 0.7]) {
      ctx.beginPath();
      ctx.moveTo(w * 0.22 + Math.cos(a) * 4, h * 0.52 + Math.sin(a) * 4);
      ctx.lineTo(w * 0.22 + Math.cos(a) * 10, h * 0.52 + Math.sin(a) * 10);
      ctx.stroke();
    }
  },
  heatpit(ctx, w, h, c) {
    // A head sensing warm prey inside its coil: heat waves from the pits to the held beetle.
    ctx.strokeStyle = 'rgba(155, 93, 229, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(w * 0.68, h * 0.52, h * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.translate(w * 0.68, h * 0.52);
    drawCreature(ctx, 'beetle', h * 0.4, '#b0764a', 0.4);
    ctx.restore();
    ctx.strokeStyle = rgba(c, 0.9);
    for (let i = 0; i < 3; i++) {
      ctx.lineWidth = 2.2 - i * 0.5;
      ctx.beginPath();
      ctx.arc(w * 0.2, h * 0.5, h * (0.2 + i * 0.12), -0.5, 0.5);
      ctx.stroke();
    }
    snake(ctx, [{ x: w * 0.2, y: h * 0.5 }, { x: w * 0.1, y: h * 0.62 }, { x: w * 0.02, y: h * 0.8 }], h * 0.3);
  },
  muscle(ctx, w, h, c) {
    // A tight ring squeezing a beetle.
    ctx.save();
    ctx.translate(w / 2, h / 2);
    drawCreature(ctx, 'beetle', h * 0.45, '#b0764a', 0.2);
    ctx.restore();
    ctx.strokeStyle = rgba(c, 0.8);
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(a) * h * 0.5, h / 2 + Math.sin(a) * h * 0.5);
      ctx.lineTo(w / 2 + Math.cos(a) * h * 0.45, h / 2 + Math.sin(a) * h * 0.45);
      ctx.stroke();
    }
    const pts: V[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 1.85 + 0.3;
      pts.push({ x: w / 2 + Math.cos(a) * h * 0.3, y: h / 2 + Math.sin(a) * h * 0.3 });
    }
    snake(ctx, pts.reverse(), h * 0.24);
  },
  reverse(ctx, w, h, c) {
    ctx.strokeStyle = rgba(c, 0.5);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, h * 0.4, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, h * 0.4, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
    const pts = wave(w * 0.2, w * 0.8, h * 0.5, h * 0.12, 7);
    snake(ctx, pts, h * 0.26);
    ctx.save();
    ctx.translate(pts[pts.length - 1].x, pts[pts.length - 1].y);
    drawHead(ctx, h * 0.26, SNAKE, 0, { tongue: false, eye: '#ff8fa3' });
    ctx.restore();
  },
  shed(ctx, w, h, c) {
    ctx.setLineDash([5, 4]);
    snake(ctx, wave(w * 0.9, w * 0.1, h * 0.5, h * 0.18, 8), h * 0.32, { alpha: 0.28, style: { ...SNAKE, head: [200, 210, 215], tail: [120, 130, 140] } });
    ctx.setLineDash([]);
    snake(ctx, wave(w * 0.95, w * 0.55, h * 0.72, h * 0.05, 4), h * 0.22);
    void c;
  },
  glottis(ctx, w, h, c) {
    // A snake head, jaws around something huge, still breathing: bubbles rise from its throat.
    snake(ctx, wave(w * 0.02, w * 0.5, h * 0.62, h * 0.06, 3), h * 0.34, { tongue: false });
    ctx.fillStyle = rgba(hexRgb('#d9c2a8'), 0.9);
    ctx.beginPath();
    ctx.ellipse(w * 0.66, h * 0.62, h * 0.2, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      const x = w * (0.52 + i * 0.05), y = h * (0.42 - i * 0.1), r = h * (0.06 + i * 0.015);
      ctx.fillStyle = rgba(c, 0.85);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  sidewinder(ctx, w, h, c) {
    // Sand with J-shaped tracks; a red strike lands just beside the snake, on nothing.
    ctx.fillStyle = rgba(c, 0.12);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = rgba(c, 0.55);
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const x = w * (0.1 + i * 0.14);
      ctx.beginPath();
      ctx.moveTo(x, h * 0.2);
      ctx.lineTo(x + h * 0.18, h * 0.62);
      ctx.quadraticCurveTo(x + h * 0.24, h * 0.82, x + h * 0.08, h * 0.8);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(239, 71, 111, 0.8)';
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(w * 0.62, h * 0.25, h * 0.4, h * 0.4);
    ctx.setLineDash([]);
    snake(ctx, [{ x: w * 0.58, y: h * 0.95 }, { x: w * 0.72, y: h * 0.78 }, { x: w * 0.9, y: h * 0.72 }], h * 0.28);
  },
  rattle(ctx, w, h, c) {
    // A tail tip ending in keratin rattle segments, buzzing.
    snake(ctx, [{ x: w * 0.02, y: h * 0.75 }, { x: w * 0.2, y: h * 0.6 }, { x: w * 0.38, y: h * 0.52 }], h * 0.32, { head: false });
    for (let i = 0; i < 5; i++) {
      const x = w * 0.45 + i * h * 0.17, r = h * (0.17 - i * 0.02);
      ctx.fillStyle = '#05080f';
      ctx.beginPath();
      ctx.ellipse(x, h * 0.5, r * 0.75 + 1.5, r + 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = i % 2 ? '#c9a66b' : '#e0c48f';
      ctx.beginPath();
      ctx.ellipse(x, h * 0.5, r * 0.75, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = rgba(c, 0.6);
    ctx.lineWidth = 2;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(w * 0.82, h * 0.5, i * h * 0.12, -0.7, 0.7);
      ctx.stroke();
    }
  },
  tailwhip(ctx, w, h, c) {
    snake(ctx, [{ x: w * 0.1, y: h * 0.85 }, { x: w * 0.3, y: h * 0.7 }, { x: w * 0.45, y: h * 0.45 }, { x: w * 0.6, y: h * 0.3 }], h * 0.3, { head: false });
    ctx.strokeStyle = rgba(c, 0.8);
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.72 + Math.cos(a) * 8, h * 0.22 + Math.sin(a) * 8);
      ctx.lineTo(w * 0.72 + Math.cos(a) * 18, h * 0.22 + Math.sin(a) * 18);
      ctx.stroke();
    }
  },
  swallow(ctx, w, h) {
    // Top-down snake head, jaws unhinged around a beetle.
    snake(ctx, [{ x: w * 0.5, y: h * 0.5 }, { x: w * 0.3, y: h * 0.5 }, { x: w * 0.12, y: h * 0.55 }, { x: -w * 0.05, y: h * 0.6 }], h * 0.34, { head: false });
    ctx.save();
    ctx.translate(w * 0.62, h * 0.5);
    ctx.fillStyle = '#48e2ba';
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-h * 0.2, sgn * h * 0.12);
      ctx.quadraticCurveTo(h * 0.15, sgn * h * 0.5, h * 0.42, sgn * h * 0.3);
      ctx.lineTo(h * 0.3, sgn * h * 0.18);
      ctx.quadraticCurveTo(h * 0.1, sgn * h * 0.26, -h * 0.1, sgn * h * 0.05);
      ctx.closePath();
      ctx.fill();
    }
    ctx.translate(h * 0.22, 0);
    drawCreature(ctx, 'beetle', h * 0.5, '#b0764a', 0.2);
    ctx.restore();
  },
  molt(ctx, w, h) {
    // A glowing, empty ghost of a snake.
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.5);
    g.addColorStop(0, 'rgba(190, 220, 255, 0.25)');
    g.addColorStop(1, 'rgba(190, 220, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    snake(ctx, wave(w * 0.85, w * 0.12, h * 0.5, h * 0.22, 8), h * 0.34, { alpha: 0.45, style: { head: [220, 235, 255], tail: [140, 160, 200], outline: 'rgba(230,240,255,0.9)', pattern: 'rgba(255,255,255,0.35)', stripe: 'rgba(255,255,255,0.3)' } });
  },
  ouroboros(ctx, w, h, c) {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * 0.6);
    g.addColorStop(0, rgba(c, 0.35));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const pts: V[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI * 1.9 - Math.PI / 2;
      pts.push({ x: w / 2 + Math.cos(a) * h * 0.36, y: h / 2 + Math.sin(a) * h * 0.36 });
    }
    snake(ctx, pts.reverse(), h * 0.22, { style: { ...SNAKE, head: [255, 200, 60], tail: [150, 100, 20] } });
  },
  kinetic(ctx, w, h, c) {
    const s2 = h * 0.14;
    ctx.fillStyle = rgba(c, 0.18);
    for (let x = s2; x < w; x += s2) for (let y = s2; y < h; y += s2) ctx.fillRect(x - 1, y - 1, 2, 2);
    const walk = [[8, 2], [8, 3], [7, 3], [7, 4], [6, 4], [6, 3], [5, 3], [5, 2], [4, 2], [3, 2], [3, 3], [3, 4], [4, 4], [4, 5]];
    snake(ctx, walk.map(([x, y]) => ({ x: x * s2 * 1.35, y: y * s2 })), h * 0.2, { tongue: true });
  },
  strike(ctx, w, h, c) {
    const pts: V[] = [{ x: w * 0.72, y: h * 0.32 }, { x: w * 0.55, y: h * 0.3 }, { x: w * 0.45, y: h * 0.45 }, { x: w * 0.55, y: h * 0.62 }, { x: w * 0.42, y: h * 0.78 }, { x: w * 0.25, y: h * 0.72 }];
    snake(ctx, pts, h * 0.26, { tongue: true });
    drawGlyph(ctx, 'strike', w * 0.86, h * 0.35, h * 0.22, rgba(c, 1));
  },
  reserve(ctx, w, h, c) {
    // A plump, satisfied coil with a golden belly.
    const pts: V[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 1.6 + Math.PI * 0.7;
      pts.push({ x: w / 2 + Math.cos(a) * h * 0.3 * 1.5, y: h * 0.55 + Math.sin(a) * h * 0.3 });
    }
    const n = pts.length;
    const ss = sampleBody(pts.reverse(), (t) => (0.5 + 0.35 * Math.sin((t / (n - 1)) * Math.PI)) * h * 0.4, 0, 0, h * 0.15);
    drawBody(ctx, ss, n, { ...SNAKE, head: [110, 230, 190], tail: [40, 140, 110] });
    ctx.fillStyle = rgba(c, 0.9);
    drop(ctx, w * 0.78, h * 0.35, 4);
    drop(ctx, w * 0.2, h * 0.3, 3);
  },
  acid(ctx, w, h, c) {
    // A beetle sinking into a bubbling acid pool.
    ctx.fillStyle = rgba(c, 0.3);
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.75, w * 0.42, h * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h * 0.7);
    ctx.clip();
    ctx.translate(w / 2, h * 0.7);
    ctx.rotate(-Math.PI / 2);
    drawCreature(ctx, 'beetle', h * 0.6, '#8a6a4a', 0.1);
    ctx.restore();
    ctx.fillStyle = rgba(c, 0.55);
    ctx.fillRect(w * 0.08, h * 0.7, w * 0.84, h * 0.3);
    ctx.fillStyle = rgba(c, 0.95);
    for (const [x, y, r] of [[0.3, 0.62, 5], [0.42, 0.45, 3], [0.62, 0.55, 6], [0.7, 0.35, 3], [0.55, 0.25, 2]]) {
      ctx.beginPath();
      ctx.arc(w * x, h * y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  hood(ctx, w, h, c) {
    ctx.save();
    ctx.translate(w / 2, h * 0.6);
    const k = h * 0.7;
    ctx.fillStyle = '#2fb393';
    ctx.beginPath();
    ctx.moveTo(0, -k * 0.5);
    ctx.bezierCurveTo(k * 0.72, -k * 0.42, k * 0.55, k * 0.4, k * 0.14, k * 0.5);
    ctx.lineTo(-k * 0.14, k * 0.5);
    ctx.bezierCurveTo(-k * 0.55, k * 0.4, -k * 0.72, -k * 0.42, 0, -k * 0.5);
    ctx.fill();
    ctx.strokeStyle = rgba(c, 0.9);
    ctx.lineWidth = 2;
    for (const s2 of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s2 * k * 0.2, k * 0.05, k * 0.08, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.translate(0, -k * 0.28);
    ctx.rotate(-Math.PI / 2);
    drawHead(ctx, k * 0.4, SNAKE, 0, { tongue: true });
    ctx.restore();
  },
  egg(ctx, w, h, c) {
    ctx.strokeStyle = 'rgba(160, 120, 70, 0.8)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc(w / 2 + (i - 4) * 4, h * 0.95, h * 0.4, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    drawGlyph(ctx, 'egg', w / 2, h * 0.48, h * 0.42, rgba(c, 1));
  },
  gorge(ctx, w, h, c) {
    // A swollen snake inhaling a stream of food.
    const pts = wave(w * 0.4, w * 0.05, h * 0.55, h * 0.06, 5);
    const n = pts.length;
    const ss = sampleBody(pts, (t) => (0.55 + 0.45 * Math.max(0, 1 - Math.abs(t - 2) / 1.5)) * h * 0.34, 0, 0, h * 0.2);
    drawBody(ctx, ss, n, SNAKE);
    ctx.save();
    ctx.translate(pts[0].x, pts[0].y);
    drawHead(ctx, h * 0.34, SNAKE, 0, { tongue: false });
    ctx.restore();
    for (let i = 0; i < 7; i++) {
      const t = i / 7;
      ctx.fillStyle = `rgba(255, 209, 102, ${1 - t * 0.5})`;
      ctx.beginPath();
      ctx.arc(w * (0.58 + t * 0.4), h * (0.55 + Math.sin(t * 6) * 0.2), 3 + t * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    void c;
  },
  python(ctx, w, h) {
    const pts: V[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 3.6;
      const r = h * (0.12 + (i / 24) * 0.3);
      pts.push({ x: w / 2 + Math.cos(a) * r * 1.4, y: h / 2 + Math.sin(a) * r });
    }
    snake(ctx, pts.reverse(), h * 0.2, { style: SPECIES_STYLES.python });
  },
};

SCENES.carapace = (ctx, w, h) => {
  // A shell plate catching a strike: spark burst on the rim.
  ctx.save();
  ctx.translate(w * 0.45, h * 0.62);
  ctx.fillStyle = '#b0764a';
  ctx.beginPath();
  ctx.arc(0, 0, h * 0.42, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.42);
  ctx.lineTo(0, 0);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.ellipse(-h * 0.15, -h * 0.25, h * 0.12, h * 0.05, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#fff3b0';
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const a = -0.6 - i * 0.35;
    ctx.beginPath();
    ctx.moveTo(w * 0.72 + Math.cos(a) * 5, h * 0.25 + Math.sin(a) * 5);
    ctx.lineTo(w * 0.72 + Math.cos(a) * 15, h * 0.25 + Math.sin(a) * 15);
    ctx.stroke();
  }
};
SCENES.tongue = (ctx, w, h) => {
  ctx.save();
  ctx.translate(w * 0.18, h * 0.55);
  drawCreature(ctx, 'frog', h * 0.8, '#6aa84f', 0.2);
  ctx.restore();
  ctx.strokeStyle = '#ef8fb2';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(w * 0.3, h * 0.55);
  ctx.quadraticCurveTo(w * 0.6, h * 0.35, w * 0.85, h * 0.5);
  ctx.stroke();
  ctx.fillStyle = '#ef8fb2';
  ctx.beginPath();
  ctx.arc(w * 0.86, h * 0.5, 6, 0, Math.PI * 2);
  ctx.fill();
};
SCENES.scythe = (ctx, w, h) => {
  ctx.strokeStyle = 'rgba(210, 255, 170, 0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(w * 0.55, h * 1.1, h * 0.95, Math.PI * 1.15, Math.PI * 1.7);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(w * 0.55, h * 1.1, h * 0.8, Math.PI * 1.2, Math.PI * 1.65);
  ctx.stroke();
  ctx.save();
  ctx.translate(w * 0.25, h * 0.6);
  drawCreature(ctx, 'mantis', h * 0.8, '#9bc53d', 0.2);
  ctx.restore();
};
SCENES.quill = (ctx, w, h) => {
  ctx.save();
  ctx.translate(w * 0.3, h * 0.55);
  drawCreature(ctx, 'hedgehog', h * 0.8, '#8a7a6a', 0.2);
  ctx.restore();
  ctx.strokeStyle = '#e9c46a';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const y = h * (0.25 + i * 0.12), x = w * (0.55 + (i % 2) * 0.08);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w * 0.2, y - h * 0.05);
    ctx.stroke();
  }
};
SCENES.silk = (ctx, w, h) => {
  // A quarter web in the corner with a snake tangled in it.
  ctx.strokeStyle = 'rgba(230, 225, 255, 0.4)';
  ctx.lineWidth = 1.2;
  const cx = w, cy = 0;
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI / 2 + (i / 6) * (Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * w);
    ctx.stroke();
  }
  for (let r = 14; r < w * 0.8; r += 14) {
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI / 2 + (i / 6) * (Math.PI / 2);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  snake(ctx, wave(w * 0.1, w * 0.62, h * 0.62, h * 0.12, 6), h * 0.26, { alpha: 0.9 });
  ctx.save();
  ctx.translate(w * 0.85, h * 0.28);
  drawCreature(ctx, 'spider', h * 0.55, '#8d7b68', 0.4);
  ctx.restore();
};

const CREATURE_OF: Record<string, [string, string]> = {};

/** Draw the art for an item (or charm) id into a w×h area at the origin. */
export function drawCardArt(ctx: G, id: string, w: number, h: number) {
  const def = ITEMS.get(id);
  const charm = !def ? CHARMS.get(id) : undefined;
  const color = def?.color ?? charm?.color ?? '#ffffff';
  const c = hexRgb(color);
  const baseId = def?.base ?? id;
  // Background: dark vignette tinted with the item colour.
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, rgba(c.map((v) => v * 0.25), 1));
  bg.addColorStop(1, '#0b1322');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  const scene = SCENES[baseId];
  if (scene) scene(ctx, w, h, c);
  else if (CREATURE_OF[baseId]) {
    const [kind, col] = CREATURE_OF[baseId];
    ctx.translate(w / 2, h / 2);
    drawCreature(ctx, kind, h * 0.95, col, 0.3);
  } else if (charm && ['garden', 'viper', 'python', 'ouro'].includes(id)) {
    // Species: a portrait of the snake.
    const st: SerpentStyle = SPECIES_STYLES[id] ?? SNAKE;
    snake(ctx, wave(w * 0.72, w * 0.08, h * 0.62, h * 0.12, 7), h * 0.3, { style: st, tongue: true });
  } else {
    // Charms and anything else: a big glyph in a frame that varies per charm.
    const hsh = [...id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
    const frame = hsh % 4;
    ctx.fillStyle = rgba(c, 0.12);
    for (let i = 0; i < 24; i++) {
      const x = ((hsh >> (i % 16)) * (i + 3) * 37) % w, y = ((hsh >> ((i + 5) % 16)) * (i + 7) * 23) % h;
      ctx.beginPath();
      ctx.arc(x, y, 1 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = rgba(c, 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    const R = h * 0.36;
    void frame;
    ctx.arc(w / 2, h / 2, R, 0, Math.PI * 2);
    ctx.stroke();
    if (charm?.pool === 'boss') {
      ctx.fillStyle = '#ffd166';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(w / 2 + i * 12 - 5, h * 0.12);
        ctx.lineTo(w / 2 + i * 12, h * 0.02);
        ctx.lineTo(w / 2 + i * 12 + 5, h * 0.12);
        ctx.fill();
      }
    }
    drawGlyph(ctx, def?.glyph ?? charm?.glyph ?? 'shed', w / 2, h / 2, h * 0.24, color);
  }
  ctx.restore();
  // Molted items: a golden sheen, a frame, sparkles and a shed-skin ribbon.
  if (def?.base) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, 'rgba(255, 209, 102, 0)');
    g.addColorStop(0.5, 'rgba(255, 209, 102, 0.22)');
    g.addColorStop(1, 'rgba(255, 209, 102, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = '#ffd166';
    for (const [x, y, r] of [[0.08, 0.2, 4], [0.92, 0.25, 3], [0.88, 0.8, 4], [0.14, 0.82, 2.5]]) {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, rr = i % 2 ? r * 0.35 : r;
        const px = w * x + Math.cos(a) * rr, py = h * y + Math.sin(a) * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.fill();
    }
  }
}

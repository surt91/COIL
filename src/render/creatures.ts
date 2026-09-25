/** Procedural creature drawings. Centred at (0,0), facing +x, tile size T. */
type G = CanvasRenderingContext2D;

/** Jointed insect legs: hip → knee → foot, gently walking. */
function legs(ctx: G, n: number, len: number, spread: number, t: number, wiggle: number) {
  ctx.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * spread;
    const w = Math.sin(t * 8 + i * 1.7) * wiggle;
    const splay = (i - (n - 1) / 2) * spread * 0.6;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(off, s * len * 0.15);
      ctx.lineTo(off + splay * 0.5 + w, s * len * 0.7);
      ctx.lineTo(off + splay + w * 1.5, s * len);
      ctx.stroke();
    }
  }
}

function eyes(ctx: G, x: number, dy: number, r: number) {
  ctx.fillStyle = '#0d1321';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x, s * dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draw a creature with the shared dark outline (drop-shadow filter; browsers
 * without canvas filters simply get no outline).
 */
let off: HTMLCanvasElement | null = null;
let sil: HTMLCanvasElement | null = null;

export function drawCreature(ctx: G, kind: string, T: number, color: string, t: number, curled = false) {
  // Render into an offscreen canvas, then stamp a dark silhouette at eight
  // offsets underneath: a crisp outline that needs no canvas filters.
  if (typeof document === 'undefined') return drawCreatureInner(ctx, kind, T, color, t, curled);
  const m = ctx.getTransform();
  const scale = Math.hypot(m.a, m.b) || 1;
  const size = Math.ceil(T * 1.6 * scale);
  off ??= document.createElement('canvas');
  sil ??= document.createElement('canvas');
  for (const c of [off, sil]) {
    if (c.width < size || c.height < size) {
      c.width = size;
      c.height = size;
    }
  }
  const o = off.getContext('2d')!;
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.clearRect(0, 0, off.width, off.height);
  o.setTransform(scale, 0, 0, scale, size / 2, size / 2);
  drawCreatureInner(o, kind, T, color, t, curled);
  const q = sil.getContext('2d')!;
  q.setTransform(1, 0, 0, 1, 0, 0);
  q.clearRect(0, 0, sil.width, sil.height);
  q.globalCompositeOperation = 'source-over';
  q.drawImage(off, 0, 0);
  q.globalCompositeOperation = 'source-in';
  q.fillStyle = '#05080f';
  q.fillRect(0, 0, size, size);
  q.globalCompositeOperation = 'source-over';
  const half = size / 2 / scale, dim = size / scale;
  const w = Math.max(1, T * 0.035);
  ctx.save();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.drawImage(sil, 0, 0, size, size, -half + Math.cos(a) * w, -half + Math.sin(a) * w, dim, dim);
  }
  ctx.drawImage(off, 0, 0, size, size, -half, -half, dim, dim);
  ctx.restore();
}

function drawCreatureInner(ctx: G, kind: string, T: number, color: string, t: number, curled = false) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const dark = 'rgba(0,0,0,0.45)';
  switch (kind) {
    case 'beetle': {
      ctx.strokeStyle = dark;
      ctx.lineWidth = T * 0.05;
      legs(ctx, 3, T * 0.36, T * 0.16, t, T * 0.03);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(-T * 0.04, 0, T * 0.27, T * 0.21, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(T * 0.25, 0, T * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = T * 0.025;
      ctx.beginPath();
      ctx.moveTo(-T * 0.3, 0);
      ctx.lineTo(T * 0.2, 0);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.ellipse(-T * 0.08, -T * 0.09, T * 0.12, T * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      // mandibles
      ctx.strokeStyle = color;
      ctx.lineWidth = T * 0.04;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(T * 0.3, s * T * 0.05);
        ctx.quadraticCurveTo(T * 0.42, s * T * 0.1, T * 0.44, s * T * 0.01);
        ctx.stroke();
      }
      break;
    }
    case 'hedgehog': {
      const R = curled ? T * 0.28 : T * 0.3;
      ctx.fillStyle = '#5b4a3c';
      ctx.beginPath();
      const n = 16;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (curled ? t : 0);
        const skip = !curled && Math.cos(a) > 0.6;
        const rr = skip ? R * 0.9 : R * 1.35;
        const a2 = a + Math.PI / n;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.lineTo(Math.cos(a2) * R * 0.95, Math.sin(a2) * R * 0.95);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.85, 0, Math.PI * 2);
      ctx.fill();
      if (!curled) {
        ctx.fillStyle = '#d9c7b0';
        ctx.beginPath();
        ctx.ellipse(R * 0.6, 0, R * 0.45, R * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        eyes(ctx, R * 0.62, R * 0.16, T * 0.03);
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(R * 1.02, 0, T * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'frog': {
      const squash = 1 + Math.sin(t * 3) * 0.04;
      ctx.fillStyle = '#4a7d38';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(-T * 0.14, s * T * 0.22, T * 0.16, T * 0.08, s * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, T * 0.28 * squash, T * 0.24 / squash, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c9e4a6';
      ctx.beginPath();
      ctx.ellipse(T * 0.05, 0, T * 0.14, T * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const s of [-1, 1]) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(T * 0.16, s * T * 0.14, T * 0.09, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f7e36b';
        ctx.beginPath();
        ctx.arc(T * 0.18, s * T * 0.14, T * 0.055, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.fillRect(T * 0.165, s * T * 0.14 - T * 0.012, T * 0.04, T * 0.024);
      }
      break;
    }
    case 'mantis': {
      ctx.strokeStyle = '#6f8f2b';
      ctx.lineWidth = T * 0.035;
      legs(ctx, 2, T * 0.3, T * 0.22, t * 0.5, T * 0.02);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(-T * 0.14, 0, T * 0.26, T * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(-T * 0.3, -T * 0.015, T * 0.3, T * 0.03);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(T * 0.14, 0, T * 0.12, T * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      poly3(ctx, [T * 0.36, 0], [T * 0.22, -T * 0.13], [T * 0.22, T * 0.13]);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2.5, T * 0.06);
      const raise = Math.sin(t * 4) * 0.15;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(T * 0.15, s * T * 0.04);
        ctx.lineTo(T * 0.3, s * T * (0.2 + raise));
        ctx.lineTo(T * 0.42, s * T * 0.08);
        ctx.stroke();
      }
      eyes(ctx, T * 0.27, T * 0.08, T * 0.03);
      break;
    }
    case 'spider': {
      ctx.strokeStyle = '#8a7560';
      ctx.lineWidth = T * 0.035;
      for (let i = 0; i < 4; i++) {
        const a = -0.9 + i * 0.6;
        const w = Math.sin(t * 6 + i) * 0.08;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          const kx = Math.cos(a + w) * T * 0.28, ky = s * Math.abs(Math.sin(a + w)) * T * 0.28 + s * T * 0.1;
          ctx.quadraticCurveTo(kx, ky - s * T * 0.18, kx * 1.3, ky * 1.35);
          ctx.stroke();
        }
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(-T * 0.1, 0, T * 0.19, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(T * 0.12, 0, T * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e63946';
      for (const [x, y] of [[0.18, -0.04], [0.18, 0.04], [0.15, -0.08], [0.15, 0.08]]) {
        ctx.beginPath();
        ctx.arc(T * x, T * y, T * 0.018, 0, Math.PI * 2);
        ctx.fill();
      }
      // Pale hourglass on the abdomen.
      ctx.fillStyle = 'rgba(240, 225, 200, 0.75)';
      ctx.beginPath();
      ctx.moveTo(-T * 0.2, -T * 0.06);
      ctx.lineTo(-T * 0.1, 0);
      ctx.lineTo(-T * 0.2, T * 0.06);
      ctx.lineTo(-T * 0.0, T * 0.06);
      ctx.lineTo(-T * 0.1, 0);
      ctx.lineTo(-T * 0.0, -T * 0.06);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'mongoose': {
      const sw = Math.sin(t * 5) * 0.12;
      // bushy tail
      ctx.fillStyle = '#8c6d45';
      ctx.beginPath();
      ctx.moveTo(-T * 0.2, 0);
      ctx.quadraticCurveTo(-T * 0.5, T * (0.35 + sw), -T * 0.62, T * (0.05 + sw));
      ctx.quadraticCurveTo(-T * 0.5, -T * 0.05, -T * 0.2, -T * 0.08);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(-T * 0.02, 0, T * 0.34, T * 0.19, 0, 0, Math.PI * 2);
      ctx.fill();
      // stripes
      ctx.strokeStyle = 'rgba(60, 40, 20, 0.45)';
      ctx.lineWidth = T * 0.03;
      for (let i = 0; i < 4; i++) {
        const x = -T * 0.22 + i * T * 0.1;
        ctx.beginPath();
        ctx.moveTo(x, -T * 0.16);
        ctx.lineTo(x + T * 0.03, T * 0.16);
        ctx.stroke();
      }
      // head + snout
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(T * 0.33, 0, T * 0.15, T * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      poly3(ctx, [T * 0.58, 0], [T * 0.4, -T * 0.08], [T * 0.4, T * 0.08]);
      ctx.fill();
      ctx.fillStyle = '#2b1d10';
      ctx.beginPath();
      ctx.arc(T * 0.58, 0, T * 0.03, 0, Math.PI * 2);
      ctx.fill();
      eyes(ctx, T * 0.38, T * 0.07, T * 0.028);
      ctx.fillStyle = '#8c6d45';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(T * 0.27, s * T * 0.12, T * 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'mole': {
      // Big pink spade paws with claws.
      ctx.fillStyle = '#f0b8a8';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(T * 0.2, s * T * 0.22, T * 0.13, T * 0.09, s * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff4ea';
        ctx.lineWidth = Math.max(1, T * 0.02);
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.moveTo(T * 0.28, s * T * 0.22 + k * T * 0.04);
          ctx.lineTo(T * 0.36, s * T * 0.24 + k * T * 0.05);
          ctx.stroke();
        }
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(-T * 0.02, 0, T * 0.3, T * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4a6a6';
      poly3(ctx, [T * 0.4, 0], [T * 0.24, -T * 0.07], [T * 0.24, T * 0.07]);
      ctx.fill();
      eyes(ctx, T * 0.18, T * 0.08, T * 0.015);
      break;
    }
    case 'magpie': {
      const flap = Math.sin(t * 14) * 0.25;
      ctx.fillStyle = '#3a4a78';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(-T * 0.02, s * T * 0.2, T * 0.26, T * 0.08, s * (0.5 + flap), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(-T * 0.02, 0, T * 0.2, T * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b1b2f';
      ctx.beginPath();
      ctx.moveTo(-T * 0.18, 0);
      ctx.lineTo(-T * 0.45, -T * 0.06);
      ctx.lineTo(-T * 0.45, T * 0.06);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(T * 0.2, 0, T * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4d35e';
      poly3(ctx, [T * 0.38, 0], [T * 0.27, -T * 0.04], [T * 0.27, T * 0.04]);
      ctx.fill();
      break;
    }
    case 'ant': {
      ctx.strokeStyle = '#3a2414';
      ctx.lineWidth = T * 0.03;
      legs(ctx, 3, T * 0.24, T * 0.1, t * 1.5, T * 0.03);
      ctx.fillStyle = color;
      for (const [x, r] of [[-T * 0.18, T * 0.11], [0, T * 0.07], [T * 0.15, T * 0.08]] as const) {
        ctx.beginPath();
        ctx.arc(x, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'tortoise': {
      ctx.fillStyle = '#9aa77a';
      ctx.beginPath();
      ctx.arc(T * 0.33, 0, T * 0.08, 0, Math.PI * 2);
      ctx.fill();
      for (const [x, y] of [[0.18, 0.22], [0.18, -0.22], [-0.2, 0.22], [-0.2, -0.22]]) {
        ctx.beginPath();
        ctx.arc(T * x, T * y, T * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, T * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40, 50, 25, 0.6)';
      ctx.lineWidth = T * 0.025;
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * T * 0.12, Math.sin(a) * T * 0.12);
        ctx.lineTo(Math.cos(a) * T * 0.3, Math.sin(a) * T * 0.3);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, T * 0.12, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'wasp': {
      const flap = Math.sin(t * 30) * 0.3;
      ctx.fillStyle = 'rgba(220, 240, 255, 0.55)';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(0, s * T * 0.16, T * 0.16, T * 0.07, s * (0.6 + flap), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(-T * 0.1, 0, T * 0.16, T * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a2a08';
      for (const x of [-0.16, -0.06]) ctx.fillRect(T * x, -T * 0.1, T * 0.035, T * 0.2);
      ctx.fillStyle = '#8a5f14';
      ctx.beginPath();
      ctx.arc(T * 0.12, 0, T * 0.08, 0, Math.PI * 2);
      ctx.fill();
      eyes(ctx, T * 0.15, T * 0.04, T * 0.02);
      ctx.fillStyle = '#3a2a08';
      poly3(ctx, [-T * 0.34, 0], [-T * 0.24, -T * 0.03], [-T * 0.24, T * 0.03]);
      ctx.fill();
      break;
    }
    case 'queen': {
      ctx.strokeStyle = '#3a2414';
      ctx.lineWidth = T * 0.05;
      legs(ctx, 3, T * 0.42, T * 0.16, t, T * 0.03);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(-T * 0.2, 0, T * 0.24, T * 0.19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(T * 0.06, 0, T * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(T * 0.26, 0, T * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      poly3(ctx, [T * 0.2, -T * 0.14], [T * 0.26, -T * 0.26], [T * 0.32, -T * 0.14]);
      ctx.fill();
      eyes(ctx, T * 0.32, T * 0.06, T * 0.025);
      break;
    }
    case 'glowworm': {
      const glow = 0.5 + 0.5 * Math.sin(t * 3);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, T * 0.5);
      g.addColorStop(0, `rgba(184, 242, 230, ${0.35 * glow})`);
      g.addColorStop(1, 'rgba(184, 242, 230, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(-T / 2, -T / 2, T, T);
      ctx.fillStyle = color;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(-T * 0.2 + i * T * 0.13, Math.sin(t * 4 + i) * T * 0.04, T * (0.07 + i * 0.01), 0, Math.PI * 2);
        ctx.fill();
      }
      // Darker head with eyes.
      ctx.fillStyle = '#5c8a80';
      ctx.beginPath();
      ctx.arc(T * 0.26, Math.sin(t * 4 + 4) * T * 0.04, T * 0.085, 0, Math.PI * 2);
      ctx.fill();
      eyes(ctx, T * 0.29, T * 0.035, T * 0.018);
      break;
    }
    case 'rival':
    case 'ouroboros': {
      ctx.fillStyle = '#07100f';
      ctx.beginPath();
      ctx.ellipse(T * 0.04, 0, T * 0.38, T * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(T * 0.04, 0, T * 0.35, T * 0.29, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const s of [-1, 1]) {
        ctx.fillStyle = kind === 'ouroboros' ? '#e63946' : '#fff3b0';
        ctx.beginPath();
        ctx.ellipse(T * 0.16, s * T * 0.13, T * 0.08, T * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0d1321';
        ctx.beginPath();
        ctx.ellipse(T * 0.18, s * T * 0.13, T * 0.02, T * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (kind === 'ouroboros') {
        ctx.fillStyle = '#ffd166';
        for (let i = -1; i <= 1; i++) poly3(ctx, [-T * 0.12, i * T * 0.12 - T * 0.04], [-T * 0.3, i * T * 0.14], [-T * 0.12, i * T * 0.12 + T * 0.04]), ctx.fill();
      }
      break;
    }
    default: {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, T * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function poly3(ctx: G, a: number[], b: number[], c: number[]) {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.lineTo(c[0], c[1]);
  ctx.closePath();
}

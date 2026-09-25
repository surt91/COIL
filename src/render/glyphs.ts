/** Procedural item glyphs, drawn centred at (0,0) with radius r. */
type G = CanvasRenderingContext2D;

function poly(ctx: G, pts: [number, number][]) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

const glyphs: Record<string, (ctx: G, r: number) => void> = {
  lunge(ctx, r) {
    ctx.beginPath();
    for (const o of [-0.45, 0.15]) {
      ctx.moveTo((o - 0.3) * r, -0.55 * r);
      ctx.lineTo((o + 0.3) * r, 0);
      ctx.lineTo((o - 0.3) * r, 0.55 * r);
    }
    ctx.stroke();
  },
  fang(ctx, r) {
    poly(ctx, [[-0.5 * r, -0.55 * r], [0.5 * r, -0.55 * r], [0.05 * r, 0.7 * r]]);
    ctx.fill();
  },
  scale(ctx, r) {
    const pts: [number, number][] = [];
    for (let i = 0; i < 6; i++) pts.push([Math.cos((i * Math.PI) / 3 + Math.PI / 6) * 0.65 * r, Math.sin((i * Math.PI) / 3 + Math.PI / 6) * 0.65 * r]);
    poly(ctx, pts);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -0.65 * r);
    ctx.lineTo(0, 0.65 * r);
    ctx.stroke();
  },
  carapace(ctx, r) {
    ctx.beginPath();
    ctx.arc(0, 0.2 * r, 0.6 * r, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
  },
  venom(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(0, -0.7 * r);
    ctx.quadraticCurveTo(0.6 * r, 0.1 * r, 0.4 * r, 0.35 * r);
    ctx.arc(0, 0.25 * r, 0.42 * r, 0.2, Math.PI - 0.2);
    ctx.quadraticCurveTo(-0.6 * r, 0.1 * r, 0, -0.7 * r);
    ctx.fill();
  },
  spine(ctx, r) {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.45 * r;
      ctx.moveTo(x - 0.22 * r, 0.45 * r);
      ctx.lineTo(x, -0.6 * r);
      ctx.lineTo(x + 0.22 * r, 0.45 * r);
    }
    ctx.fill();
  },
  heart(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(0, 0.6 * r);
    ctx.bezierCurveTo(-0.9 * r, 0, -0.5 * r, -0.8 * r, 0, -0.3 * r);
    ctx.bezierCurveTo(0.5 * r, -0.8 * r, 0.9 * r, 0, 0, 0.6 * r);
    ctx.fill();
  },
  muscle(ctx, r) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.65 * r, 0.35 * r, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.2 * r, -0.35 * r);
    ctx.lineTo(-0.2 * r, 0.35 * r);
    ctx.moveTo(0.2 * r, -0.35 * r);
    ctx.lineTo(0.2 * r, 0.35 * r);
    ctx.stroke();
  },
  reverse(ctx, r) {
    ctx.beginPath();
    ctx.arc(0, 0, 0.5 * r, -Math.PI * 0.9, -Math.PI * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 0.5 * r, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
    poly(ctx, [[0.5 * r, -0.05 * r], [0.25 * r, -0.4 * r], [0.75 * r, -0.4 * r]]);
    ctx.fill();
    poly(ctx, [[-0.5 * r, 0.05 * r], [-0.25 * r, 0.4 * r], [-0.75 * r, 0.4 * r]]);
    ctx.fill();
  },
  shed(ctx, r) {
    ctx.setLineDash([0.25 * r, 0.2 * r]);
    ctx.beginPath();
    ctx.arc(0, 0, 0.55 * r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  },
  molt(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(-0.5 * r, 0.6 * r);
    ctx.lineTo(-0.5 * r, -0.1 * r);
    ctx.arc(0, -0.1 * r, 0.5 * r, Math.PI, 0);
    ctx.lineTo(0.5 * r, 0.6 * r);
    ctx.lineTo(0.25 * r, 0.4 * r);
    ctx.lineTo(0, 0.6 * r);
    ctx.lineTo(-0.25 * r, 0.4 * r);
    ctx.closePath();
    ctx.stroke();
  },
  rattle(ctx, r) {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, (i - 1) * 0.38 * r, (0.55 - i * 0.12) * r, 0.17 * r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  tailwhip(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(-0.6 * r, 0.5 * r);
    ctx.quadraticCurveTo(0.6 * r, 0.5 * r, 0.1 * r, -0.2 * r);
    ctx.quadraticCurveTo(-0.2 * r, -0.6 * r, 0.5 * r, -0.6 * r);
    ctx.stroke();
  },
  swallow(ctx, r) {
    ctx.beginPath();
    ctx.arc(0, 0, 0.6 * r, 0.6, Math.PI * 2 - 0.6);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
  },
  ouroboros(ctx, r) {
    ctx.beginPath();
    ctx.arc(0, 0, 0.5 * r, 0.5, Math.PI * 2 - 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0.5 * r * Math.cos(0.3), 0.5 * r * Math.sin(0.3), 0.16 * r, 0, Math.PI * 2);
    ctx.fill();
  },
  kinetic(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(-0.6 * r, 0.4 * r);
    ctx.lineTo(-0.2 * r, 0.4 * r);
    ctx.lineTo(-0.2 * r, -0.1 * r);
    ctx.lineTo(0.2 * r, -0.1 * r);
    ctx.lineTo(0.2 * r, -0.5 * r);
    ctx.lineTo(0.6 * r, -0.5 * r);
    ctx.stroke();
  },
  tongue(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(-0.6 * r, 0);
    ctx.lineTo(0.3 * r, 0);
    ctx.lineTo(0.65 * r, -0.3 * r);
    ctx.moveTo(0.3 * r, 0);
    ctx.lineTo(0.65 * r, 0.3 * r);
    ctx.stroke();
  },
  scythe(ctx, r) {
    ctx.beginPath();
    ctx.arc(0.1 * r, 0.2 * r, 0.6 * r, Math.PI * 1.05, Math.PI * 1.75);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.3 * r, 0.7 * r);
    ctx.lineTo(0.2 * r, -0.2 * r);
    ctx.stroke();
  },
  silk(ctx, r) {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 4;
      ctx.moveTo(Math.cos(a) * 0.6 * r, Math.sin(a) * 0.6 * r);
      ctx.lineTo(-Math.cos(a) * 0.6 * r, -Math.sin(a) * 0.6 * r);
    }
    ctx.stroke();
  },
};

Object.assign(glyphs, {
  sprint(ctx: G, r: number) {
    ctx.beginPath();
    for (const o of [-0.55, -0.1, 0.35]) {
      ctx.moveTo((o - 0.22) * r, -0.5 * r);
      ctx.lineTo((o + 0.22) * r, 0);
      ctx.lineTo((o - 0.22) * r, 0.5 * r);
    }
    ctx.stroke();
  },
  egg(ctx: G, r: number) {
    ctx.beginPath();
    ctx.ellipse(0, 0.05 * r, 0.45 * r, 0.62 * r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (const [x, y] of [[-0.15, -0.2], [0.18, 0.1], [-0.05, 0.35]]) {
      ctx.beginPath();
      ctx.arc(x * r, y * r, 0.08 * r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  python(ctx: G, r: number) {
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.2) {
      const rr = (0.1 + (a / (Math.PI * 5)) * 0.55) * r;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  },
  acid(ctx: G, r: number) {
    for (const [x, y, rr] of [[-0.25, 0.2, 0.25], [0.2, -0.05, 0.2], [0.05, -0.45, 0.12], [0.3, 0.4, 0.12]]) {
      ctx.beginPath();
      ctx.arc(x * r, y * r, rr * r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  strike(ctx: G, r: number) {
    ctx.beginPath();
    ctx.moveTo(0.15 * r, -0.7 * r);
    ctx.lineTo(-0.3 * r, 0.05 * r);
    ctx.lineTo(0.05 * r, 0.05 * r);
    ctx.lineTo(-0.15 * r, 0.7 * r);
    ctx.lineTo(0.35 * r, -0.15 * r);
    ctx.lineTo(0, -0.15 * r);
    ctx.closePath();
    ctx.fill();
  },
  hood(ctx: G, r: number) {
    ctx.beginPath();
    ctx.moveTo(0, -0.65 * r);
    ctx.bezierCurveTo(0.8 * r, -0.4 * r, 0.6 * r, 0.5 * r, 0.15 * r, 0.65 * r);
    ctx.lineTo(-0.15 * r, 0.65 * r);
    ctx.bezierCurveTo(-0.6 * r, 0.5 * r, -0.8 * r, -0.4 * r, 0, -0.65 * r);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -0.1 * r, 0.12 * r, 0, Math.PI * 2);
    ctx.fill();
  },
  reserve(ctx: G, r: number) {
    ctx.beginPath();
    ctx.arc(0, 0, 0.55 * r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.3 * r, 0);
    ctx.lineTo(0.3 * r, 0);
    ctx.moveTo(0, -0.3 * r);
    ctx.lineTo(0, 0.3 * r);
    ctx.stroke();
  },
  gorge(ctx: G, r: number) {
    ctx.beginPath();
    ctx.arc(0.2 * r, 0, 0.45 * r, 0.7, Math.PI * 2 - 0.7);
    ctx.lineTo(0.2 * r, 0);
    ctx.closePath();
    ctx.fill();
    for (const x of [-0.45, -0.7]) {
      ctx.beginPath();
      ctx.arc(x * r, 0, 0.1 * r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
});

Object.assign(glyphs, {
  sprint(ctx: G, r: number) {
    ctx.beginPath();
    ctx.moveTo(-0.2 * r, 0);
    ctx.lineTo(0.6 * r, 0);
    ctx.moveTo(0.3 * r, -0.3 * r);
    ctx.lineTo(0.6 * r, 0);
    ctx.lineTo(0.3 * r, 0.3 * r);
    for (const y of [-0.35, 0, 0.35]) {
      ctx.moveTo(-0.7 * r, y * r);
      ctx.lineTo(-0.4 * r, y * r);
    }
    ctx.stroke();
  },
  ring(ctx: G, r: number) {
    ctx.beginPath();
    ctx.arc(0, 0, 0.6 * r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 0.28 * r, 0, Math.PI * 2);
    ctx.fill();
  },
  crush(ctx: G, r: number) {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const cx = Math.cos(a), cy = Math.sin(a);
      ctx.moveTo(cx * 0.7 * r, cy * 0.7 * r);
      ctx.lineTo(cx * 0.25 * r, cy * 0.25 * r);
      ctx.moveTo(cx * 0.25 * r + cy * 0.18 * r, cy * 0.25 * r - cx * 0.18 * r);
      ctx.lineTo(cx * 0.25 * r, cy * 0.25 * r);
      ctx.lineTo(cx * 0.25 * r - cy * 0.18 * r, cy * 0.25 * r + cx * 0.18 * r);
    }
    ctx.stroke();
  },
  wide(ctx: G, r: number) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.7 * r, 0.4 * r, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.3 * r, 0);
    ctx.lineTo(0.3 * r, 0);
    ctx.moveTo(-0.3 * r, 0);
    ctx.lineTo(-0.15 * r, -0.12 * r);
    ctx.moveTo(0.3 * r, 0);
    ctx.lineTo(0.15 * r, -0.12 * r);
    ctx.stroke();
  },
  roots(ctx: G, r: number) {
    ctx.beginPath();
    ctx.moveTo(0, -0.7 * r);
    ctx.lineTo(0, 0.1 * r);
    ctx.moveTo(0, 0.1 * r);
    ctx.quadraticCurveTo(-0.1 * r, 0.5 * r, -0.5 * r, 0.65 * r);
    ctx.moveTo(0, 0.1 * r);
    ctx.quadraticCurveTo(0.1 * r, 0.5 * r, 0.5 * r, 0.65 * r);
    ctx.moveTo(0, 0.1 * r);
    ctx.lineTo(0, 0.7 * r);
    ctx.stroke();
  },
  tooth(ctx: G, r: number) {
    ctx.beginPath();
    ctx.moveTo(-0.45 * r, -0.5 * r);
    ctx.quadraticCurveTo(0, -0.75 * r, 0.45 * r, -0.5 * r);
    ctx.lineTo(0.2 * r, 0.3 * r);
    ctx.lineTo(0, 0.7 * r);
    ctx.lineTo(-0.2 * r, 0.3 * r);
    ctx.closePath();
    ctx.fill();
  },
  shed(ctx: G, r: number) {
    ctx.setLineDash([0.18 * r, 0.14 * r]);
    ctx.beginPath();
    ctx.moveTo(-0.6 * r, 0.4 * r);
    ctx.quadraticCurveTo(-0.2 * r, -0.6 * r, 0.1 * r, 0.1 * r);
    ctx.quadraticCurveTo(0.35 * r, 0.6 * r, 0.6 * r, -0.4 * r);
    ctx.stroke();
    ctx.setLineDash([]);
  },
});

/** Extra rotation applied to every glyph (the board sets this when it is drawn rotated). */
export const glyphOpts = { rotation: 0 };

Object.assign(glyphs, {
  ouroboros(ctx: G, r: number) {
    ctx.lineWidth *= 1.3;
    ctx.beginPath();
    ctx.arc(0, 0, 0.5 * r, 0.9, Math.PI * 2 - 0.1);
    ctx.stroke();
    // Head biting the tail.
    ctx.beginPath();
    ctx.ellipse(0.42 * r, 0.3 * r, 0.26 * r, 0.18 * r, 0.9, 0, Math.PI * 2);
    ctx.fill();
  },
  hood(ctx: G, r: number) {
    // Flared cobra hood silhouette.
    ctx.beginPath();
    ctx.moveTo(-0.15 * r, -0.7 * r);
    ctx.lineTo(0.15 * r, -0.7 * r);
    ctx.quadraticCurveTo(0.75 * r, -0.2 * r, 0.25 * r, 0.7 * r);
    ctx.lineTo(-0.25 * r, 0.7 * r);
    ctx.quadraticCurveTo(-0.75 * r, -0.2 * r, -0.15 * r, -0.7 * r);
    ctx.fill();
  },
  wide(ctx: G, r: number) {
    ctx.beginPath();
    ctx.moveTo(-0.7 * r, 0);
    ctx.lineTo(0.7 * r, 0);
    ctx.moveTo(-0.4 * r, -0.3 * r);
    ctx.lineTo(-0.7 * r, 0);
    ctx.lineTo(-0.4 * r, 0.3 * r);
    ctx.moveTo(0.4 * r, -0.3 * r);
    ctx.lineTo(0.7 * r, 0);
    ctx.lineTo(0.4 * r, 0.3 * r);
    ctx.stroke();
  },
  muscle(ctx: G, r: number) {
    // Flexed coil: two stacked filled lobes.
    ctx.beginPath();
    ctx.ellipse(-0.2 * r, 0.1 * r, 0.35 * r, 0.42 * r, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0.3 * r, -0.2 * r, 0.25 * r, 0.3 * r, 0.4, 0, Math.PI * 2);
    ctx.fill();
  },
});

export function drawGlyph(ctx: G, key: string, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  if (glyphOpts.rotation) ctx.rotate(glyphOpts.rotation);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  // Thicker strokes at small sizes so glyphs stay legible at 16 px.
  ctx.lineWidth = r < 8 ? Math.max(1.6, r * 0.26) : Math.max(1.5, r * 0.18);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  (glyphs[key] ?? glyphs.shed)(ctx, r);
  ctx.restore();
}

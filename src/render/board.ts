import { computeCoils, occupiedCoils, touchCount } from '../core/coil';
import { Dir, Pos, eq } from '../core/geom';
import { riposteTile, wrapMin } from '../core/fight';
import * as ops from '../core/ops';
import { ENEMIES, ITEMS } from '../core/registry';
import type { Enemy, Fight, GameEvent } from '../core/types';
import { Tile } from '../core/types';
import { drawCreature } from './creatures';
import { drawGlyph, glyphOpts } from './glyphs';
import { renderAscii } from './ascii';
import { OUROBOROS_STYLE, RIVAL_STYLE, SPECIES_STYLES, SerpentStyle, drawBody, drawHead, sampleBody } from './serpent';

export const PAL = {
  bg: '#0d1321',
  floorDot: 'rgba(120, 180, 140, 0.16)',
  wall: '#1c2a3a',
  wallTop: '#2a3d52',
  wallMoss: 'rgba(90, 160, 110, 0.35)',
  snake: [61, 219, 180] as const,
  snakeTail: [27, 122, 106] as const,
  outline: '#07100f',
  food: '#ffd166',
  danger: '#ef476f',
  coil: '#9b5de5',
  husk: '#6c757d',
  web: 'rgba(210, 200, 255, 0.55)',
  text: '#e8f1f2',
};


function enemySnakeStyle(_color: string, kind = ''): SerpentStyle {
  return kind === 'ouroboros' ? OUROBOROS_STYLE : RIVAL_STYLE;
}

const SNAKE_STYLE: SerpentStyle = SPECIES_STYLES.garden;

/** Per-act terrain themes. */
export const THEMES = [
  { bg: '#0d1321', wall: '#1c2a3a', wallTop: '#2a3d52', wallMoss: 'rgba(90, 160, 110, 0.35)', floorDot: 'rgba(120, 180, 140, 0.16)', vignette: 0.25 },
  { bg: '#15100c', wall: '#35271b', wallTop: '#4a3725', wallMoss: 'rgba(200, 140, 60, 0.30)', floorDot: 'rgba(210, 160, 100, 0.14)', vignette: 0.35 },
  { bg: '#060913', wall: '#121a30', wallTop: '#1b2744', wallMoss: 'rgba(120, 200, 230, 0.25)', floorDot: 'rgba(140, 180, 255, 0.12)', vignette: 0.6 },
];

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface Float { x: number; y: number; text: string; color: string; life: number; max: number; big?: boolean }
interface Flash { tiles: Pos[]; color: string; life: number; max: number }

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: readonly number[], b: readonly number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`;

export class BoardRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  T = 40;
  ox = 0;
  oy = 0;
  private dpr = 1;

  shown: Fight | null = null;
  private prev: Fight | null = null;
  private animStart = 0;
  animDur = 130;
  private particles: Particle[] = [];
  private floats: Float[] = [];
  private flashes: Flash[] = [];
  private shake = 0;
  private bulges: { start: number }[] = [];
  private lastHeadAngle = 0;
  private attacks = new Map<number, { to: Pos; start: number }>();
  private hitStop = 0;

  hover: Pos | null = null;
  preview: Fight | null = null;
  previewDir: Dir | null = null;
  targetDirs: Dir[] | null = null;
  instant = false;
  act = 0;
  /** Player snake look (species). */
  style: SerpentStyle = SNAKE_STYLE;
  /** ncurses-style ASCII skin. */
  terminal = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  resize(cssW: number, cssH: number) {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.layout();
  }

  /**
   * Portrait screens show a landscape board rotated by 90° (clockwise) so it
   * fills the screen. Board coordinates stay the same; only the view turns.
   */
  rotated = false;
  /** Counter-rotate text when rotated (off while drawing in a screen-space frame). */
  private textUpright = true;
  private rx = 0;
  private ry = 0;

  private layout() {
    const f = this.shown;
    if (!f) return;
    const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
    const flat = Math.floor(Math.min(w / f.w, h / f.h));
    const turned = Math.floor(Math.min(w / f.h, h / f.w));
    this.rotated = f.w !== f.h && turned > flat * 1.15;
    if (this.rotated) {
      this.T = turned;
      this.ox = 0;
      this.oy = 0;
      this.rx = Math.floor((w - this.T * f.h) / 2);
      this.ry = Math.floor((h - this.T * f.w) / 2);
    } else {
      this.T = flat;
      this.ox = Math.floor((w - this.T * f.w) / 2);
      this.oy = Math.floor((h - this.T * f.h) / 2);
    }
  }

  /** Screen direction (0 up, 1 right, 2 down, 3 left) to board direction. */
  screenToBoardDir(d: Dir): Dir {
    return this.rotated ? (((d + 3) % 4) as Dir) : d;
  }

  tileAt(cssX: number, cssY: number): Pos | null {
    const f = this.shown;
    if (!f) return null;
    let lx = cssX - this.ox, ly = cssY - this.oy;
    if (this.rotated) {
      lx = cssY - this.ry;
      ly = this.rx + f.h * this.T - cssX;
    }
    const x = Math.floor(lx / this.T), y = Math.floor(ly / this.T);
    return x >= 0 && y >= 0 && x < f.w && y < f.h ? { x, y } : null;
  }

  /** Keep text upright when the board is rotated. */
  private patchText() {
    const ctx = this.ctx as CanvasRenderingContext2D & { __patched?: boolean };
    if (ctx.__patched) return;
    ctx.__patched = true;
    const fill = ctx.fillText.bind(ctx), stroke = ctx.strokeText.bind(ctx);
    const upright = (orig: typeof fill) => (text: string, x: number, y: number, maxW?: number) => {
      if (!this.rotated || !this.textUpright) return orig(text, x, y, maxW);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-Math.PI / 2);
      orig(text, 0, 0, maxW);
      ctx.restore();
    };
    ctx.fillText = upright(fill);
    ctx.strokeText = upright(stroke);
  }

  /** Show a new state; animate from the current one using its events. */
  push(next: Fight, now = performance.now()) {
    const first = !this.shown || this.shown.w !== next.w || this.shown.h !== next.h;
    this.prev = first ? null : this.shown;
    this.shown = next;
    this.animStart = now;
    if (first) this.layout();
    for (const e of next.events) this.effect(e, next);
  }

  /** Replace the shown state without animation (undo). */
  set(next: Fight) {
    this.prev = null;
    this.shown = next;
  }

  private cx = (x: number) => this.ox + (x + 0.5) * this.T;
  private cy = (y: number) => this.oy + (y + 0.5) * this.T;

  private float(p: Pos, text: string, color: string, big = false) {
    // Stack texts that appear near each other at the same time.
    const near = this.floats.filter((f) => f.life < 500 && Math.abs(f.x - p.x) < 2 && Math.abs(f.y - p.y) < 1.5).length;
    this.floats.push({ x: p.x, y: p.y - near * 0.75, text, color, life: 0, max: big ? 2200 : 1000, big });
  }

  private burst(p: Pos, color: string, n: number, speed = 3, size = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random()) * speed;
      this.particles.push({ x: p.x + 0.5, y: p.y + 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 400 + Math.random() * 400, color, size: size * (0.5 + Math.random()) });
    }
  }

  private effect(e: GameEvent, f: Fight) {
    switch (e.t) {
      case 'eat':
        this.burst(e.at, e.what === 'food' ? PAL.food : e.what === 'husk' ? '#adb5bd' : '#f1faee', 14, 3);
        this.bulges.push({ start: performance.now() });
        break;
      case 'bite':
        this.burst(e.at, '#ffffff', 8, 4, 2);
        this.shake = Math.max(this.shake, 3);
        break;
      case 'enemyHurt':
        this.float(e.at, `-${e.dmg}`, e.cause === 'crush' ? PAL.coil : e.cause === 'poison' ? '#80ed99' : '#ffffff');
        break;
      case 'enemyDie': {
        const d = ENEMIES.get(e.kind);
        this.burst(e.at, d?.color ?? '#fff', 22, 4, 3.5);
        if (d?.boss) {
          this.burst(e.at, PAL.food, 80, 9, 4);
          this.burst(e.at, '#ffffff', 40, 6, 3);
          this.shake = 22;
          this.float({ x: e.at.x, y: e.at.y - 1 }, `${d.name.toUpperCase()} FALLS`, PAL.food, true);
          this.hitStop = performance.now() + 350;
        }
        break;
      }
      case 'segLost':
        this.burst(e.at, PAL.danger, 16, 4, 3);
        this.burst(e.at, mix(PAL.snake, PAL.snake, 0), 8, 2, 3);
        if (e.item) {
          const d = ITEMS.get(e.item);
          this.burst(e.at, d?.color ?? '#fff', 18, 5, 3.5);
          this.float(e.at, `${d?.name ?? e.item} lost!`, '#ff8fa3', true);
        }
        else if (e.cause === 'hunger') this.float(e.at, 'starving', '#f4a261');
        this.shake = Math.max(this.shake, 6);
        break;
      case 'absorb':
        this.burst(e.at, '#90e0ef', 12, 2.5, 2.5);
        this.float(e.at, 'blocked', '#90e0ef');
        break;
      case 'sever':
        this.shake = Math.max(this.shake, 12);
        this.float(e.at, 'SEVERED', PAL.danger, true);
        break;
      case 'fizzle': {
        const en = f.enemies.find((x) => x.id === e.enemy);
        if (en) this.float(en.pos, 'miss', '#adb5bd');
        break;
      }
      case 'coil':
        this.flashes.push({ tiles: e.tiles, color: PAL.coil, life: 0, max: 600 });
        break;
      case 'play':
        this.float(f.snake.body[0], ITEMS.get(e.item)?.name ?? e.item, ITEMS.get(e.item)?.color ?? '#fff');
        break;
      case 'webbed':
        this.float(e.at, 'stuck!', '#d0c8ff');
        break;
      case 'spawn':
        this.burst(e.at, '#8d6e63', 12, 2);
        break;
      case 'cleared':
        this.float({ x: f.w / 2 - 0.5, y: 0.6 }, 'Room cleared — the exits are open', PAL.food, true);
        break;
      case 'death':
        this.shake = 16;
        break;
      case 'strike':
        this.flashes.push({ tiles: e.tiles, color: PAL.danger, life: 0, max: 350 });
        if (e.tiles.length) this.attacks.set(e.enemy, { to: e.tiles[0], start: performance.now() });
        break;
      case 'steal':
        this.float(e.at, `${ITEMS.get(e.item)?.name ?? ''} stolen!`, PAL.food);
        break;
      case 'burrow':
      case 'emerge':
        this.burst(e.at, '#6d5a4f', 14, 2.5);
        break;
      case 'msg':
        this.float(f.snake.body[0], e.text, '#fff');
        break;
    }
  }

  // ---------------------------------------------------------------- frame

  frame(now: number, dt: number) {
    const ctx = this.ctx, f = this.shown;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const th = THEMES[this.act] ?? THEMES[0];
    Object.assign(PAL, { bg: th.bg, wall: th.wall, wallTop: th.wallTop, wallMoss: th.wallMoss, floorDot: th.floorDot });
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!f) return;
    this.patchText();
    glyphOpts.rotation = this.rotated ? -Math.PI / 2 : 0;
    if (this.rotated) {
      ctx.translate(this.rx + f.h * this.T, this.ry);
      ctx.rotate(Math.PI / 2);
    }
    if (this.terminal) return this.drawTerminal(f, now);
    if (now < this.hitStop) this.animStart = now; // freeze the animation for a beat
    const k = Math.max(1, f.events.filter((e) => e.t === 'move').length);
    const dur = this.animDur * (1 + (k - 1) * 0.6);
    const p = this.instant || !this.prev ? 1 : ease(Math.min(1, (now - this.animStart) / dur));
    this.shake *= Math.pow(0.9, dt / 16);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    ctx.save();
    ctx.translate(sx, sy);

    this.drawTerrain(f, now);
    this.drawCoils(f, now);
    this.drawWebsFoodHusks(f, now);
    this.drawStrikes(f, now);
    const bodyPts = this.snakePoints(f, p);
    this.drawEnemies(f, p, now);
    this.drawLocks(f, bodyPts, now);
    this.drawPreview(f, now);
    this.drawSnake(f, bodyPts, now);
    this.drawTargeting(f, now);
    this.drawFx(dt);
    ctx.restore();
    // Vignette (stronger in the Deep), with the snake's head as a faint light source.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.canvas.width / this.dpr, H = this.canvas.height / this.dpr;
    const h = f.snake.body[0];
    const hx = this.rotated ? this.rx + f.h * this.T - this.cy(h.y) : this.cx(h.x);
    const hy = this.rotated ? this.ry + this.cx(h.x) : this.cy(h.y);
    const g = ctx.createRadialGradient(hx, hy, this.T * 2, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${th.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    glyphOpts.rotation = 0;
  }

  private drawTerminal(f: Fight, now: number) {
    const ctx = this.ctx, T = this.T;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const lines = renderAscii(f).slice(0, f.h);
    ctx.font = `bold ${Math.round(T * 0.8)}px ui-monospace, 'DejaVu Sans Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const color = (c: string) =>
      c === '#' ? '#1f7a1f' : c === '@' ? '#b6ff9e' : /[123]/.test(c) ? '#ffe066' : c === '+' ? '#7fd1ff' : c === 'o' ? '#5fdc5f'
      : c === '*' ? '#ffd166' : c === '!' ? '#ff3030' : c === ':' ? '#c77dff' : c === '.' ? '#133313' : /[a-zA-Z]/.test(c) ? '#ff9f40' : '#8f8';
    lines.forEach((line, y) => {
      [...line].forEach((c, x) => {
        ctx.fillStyle = color(c);
        ctx.fillText(c, this.cx(x), this.cy(y));
      });
    });
    // scanlines + cursor blink
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < this.canvas.height; y += 3) ctx.fillRect(0, y, this.canvas.width, 1);
    if (Math.floor(now / 500) % 2 === 0) {
      const h = f.snake.body[0];
      ctx.fillStyle = 'rgba(182,255,158,0.25)';
      ctx.fillRect(this.ox + h.x * T, this.oy + h.y * T, T, T);
    }
    ctx.textBaseline = 'alphabetic';
  }

  private drawTerrain(f: Fight, now: number) {
    const ctx = this.ctx, T = this.T;
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const t = f.tiles[y * f.w + x];
        const X = this.ox + x * T, Y = this.oy + y * T;
        if (t === Tile.Wall) {
          ctx.fillStyle = PAL.wall;
          ctx.fillRect(X, Y, T, T);
          const above = y > 0 && f.tiles[(y - 1) * f.w + x] === Tile.Wall;
          if (!above) {
            ctx.fillStyle = PAL.wallTop;
            ctx.fillRect(X, Y, T, T * 0.22);
            ctx.fillStyle = PAL.wallMoss;
            for (let i = 0; i < 3; i++) {
              const hx = ((x * 7 + y * 13 + i * 5) % 10) / 10;
              ctx.beginPath();
              ctx.arc(X + hx * T, Y + T * 0.2, T * 0.08, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else {
          ctx.fillStyle = PAL.floorDot;
          ctx.beginPath();
          ctx.arc(X + T / 2, Y + T / 2, Math.max(1, T * 0.035), 0, Math.PI * 2);
          ctx.fill();
          if (f.spawns.some((q) => q.x === x && q.y === y)) {
            ctx.fillStyle = '#0a1019';
            ctx.beginPath();
            ctx.ellipse(X + T / 2, Y + T / 2, T * 0.26, T * 0.18, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(141, 110, 99, 0.6)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          if (t === Tile.Exit || t === Tile.Burrow) {
            const open = t === Tile.Exit && f.cleared;
            ctx.fillStyle = t === Tile.Burrow ? '#050a12' : open ? '#0a0f18' : '#1c2a3a';
            ctx.beginPath();
            ctx.ellipse(X + T / 2, Y + T / 2, T * 0.38, T * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();
            if (t === Tile.Exit) {
              if (open) {
                const g = ctx.createRadialGradient(X + T / 2, Y + T / 2, 0, X + T / 2, Y + T / 2, T * 1.3);
                g.addColorStop(0, `rgba(255, 209, 102, ${0.45 + 0.15 * Math.sin(now / 250)})`);
                g.addColorStop(1, 'rgba(255, 209, 102, 0)');
                ctx.fillStyle = g;
                ctx.fillRect(X - T, Y - T, T * 3, T * 3);
                ctx.beginPath();
                ctx.ellipse(X + T / 2, Y + T / 2, T * 0.38, T * 0.3, 0, 0, Math.PI * 2);
              }
              ctx.strokeStyle = open ? PAL.food : 'rgba(120,140,160,0.4)';
              ctx.lineWidth = open ? 3 : 2;
              ctx.stroke();
              if (!open) {
                // Closed: bars across the hole.
                ctx.strokeStyle = 'rgba(150, 170, 190, 0.55)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                for (const k of [-0.2, 0, 0.2]) {
                  ctx.moveTo(X + T / 2 + k * T, Y + T * 0.22);
                  ctx.lineTo(X + T / 2 + k * T, Y + T * 0.78);
                }
                ctx.stroke();
              }
            }
          }
        }
      }
    }
  }

  private hatch(tiles: Pos[], color: string, alpha: number, now: number) {
    const ctx = this.ctx, T = this.T;
    ctx.save();
    ctx.beginPath();
    for (const t of tiles) ctx.rect(this.ox + t.x * T, this.oy + t.y * T, T, T);
    ctx.clip();
    ctx.globalAlpha = alpha * 0.25;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    const off = (now / 60) % 12;
    const W = this.canvas.width;
    ctx.beginPath();
    for (let i = -W; i < W * 2; i += 12) {
      ctx.moveTo(i + off, 0);
      ctx.lineTo(i + off - W, W);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawCoils(f: Fight, now: number) {
    const coils = computeCoils(f);
    const occupied = new Set(occupiedCoils(f, coils));
    for (const c of coils) this.hatch(c.tiles, PAL.coil, occupied.has(c) ? 0.5 : 0.14, now);
  }

  private drawWebsFoodHusks(f: Fight, now: number) {
    const ctx = this.ctx, T = this.T;
    ctx.strokeStyle = PAL.web;
    ctx.lineWidth = 1;
    for (const w of f.webs) {
      const X = this.cx(w.x), Y = this.cy(w.y);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 4;
        ctx.moveTo(X + Math.cos(a) * T * 0.45, Y + Math.sin(a) * T * 0.45);
        ctx.lineTo(X - Math.cos(a) * T * 0.45, Y - Math.sin(a) * T * 0.45);
      }
      for (const r of [0.15, 0.28, 0.4]) {
        for (let i = 0; i <= 8; i++) {
          const a = (i * Math.PI) / 4;
          const px = X + Math.cos(a) * T * r, py = Y + Math.sin(a) * T * r;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
      }
      ctx.stroke();
    }
    for (const fd of f.food) {
      const X = this.cx(fd.x), Y = this.cy(fd.y);
      const pulse = 1 + Math.sin(now / 300 + fd.x) * 0.08;
      const g = ctx.createRadialGradient(X, Y, 0, X, Y, T * 0.6);
      g.addColorStop(0, 'rgba(255, 209, 102, 0.35)');
      g.addColorStop(1, 'rgba(255, 209, 102, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(X - T, Y - T, 2 * T, 2 * T);
      ctx.fillStyle = PAL.food;
      ctx.beginPath();
      ctx.arc(X, Y, T * 0.2 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(X - T * 0.06, Y - T * 0.06, T * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const hk of f.husks) {
      const X = this.cx(hk.pos.x), Y = this.cy(hk.pos.y);
      ctx.fillStyle = '#3b4148';
      ctx.strokeStyle = '#6c757d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X, Y, T * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(X - T * 0.15, Y - T * 0.1);
      ctx.lineTo(X, Y + T * 0.02);
      ctx.lineTo(X + T * 0.12, Y - T * 0.14);
      ctx.stroke();
      if (hk.item) {
        const d = ITEMS.get(hk.item);
        if (d) drawGlyph(ctx, d.glyph, X, Y + T * 0.05, T * 0.18, d.color);
      }
      for (let i = 0; i < hk.ttl; i++) {
        ctx.fillStyle = '#adb5bd';
        ctx.beginPath();
        ctx.arc(X - T * 0.2 + i * T * 0.13, Y + T * 0.38, T * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawStrikes(f: Fight, now: number) {
    const ctx = this.ctx, T = this.T;
    const pulse = 0.6 + 0.3 * Math.sin(now / 160);
    for (const e of f.enemies) {
      const rp = riposteTile(e);
      if (rp) {
        // Riposte: the boss will strike this tile if your head is still on it after your move.
        this.hatch([rp], PAL.danger, pulse * 0.55, now);
        ctx.strokeStyle = PAL.danger;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(this.ox + rp.x * T + 2, this.oy + rp.y * T + 2, T - 4, T - 4);
        ctx.setLineDash([]);
      }
      const it = e.intent;
      if (it.t === 'strike') {
        this.hatch(it.tiles, PAL.danger, pulse * 0.7, now);
        ctx.strokeStyle = PAL.danger;
        ctx.lineWidth = 2;
        for (const t of it.tiles) ctx.strokeRect(this.ox + t.x * T + 2, this.oy + t.y * T + 2, T - 4, T - 4);
      } else if (it.t === 'web') {
        ctx.strokeStyle = '#c8b6ff';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2;
        for (const t of it.tiles) ctx.strokeRect(this.ox + t.x * T + 4, this.oy + t.y * T + 4, T - 8, T - 8);
        ctx.setLineDash([]);
      }
    }
  }

  private enemyPos(e: Enemy, p: number): { x: number; y: number } {
    const pe = this.prev?.enemies.find((x) => x.id === e.id);
    if (!pe) return e.pos;
    return { x: lerp(pe.pos.x, e.pos.x, p), y: lerp(pe.pos.y, e.pos.y, p) };
  }

  private drawEnemies(f: Fight, p: number, now: number) {
    const ctx = this.ctx, T = this.T;
    const head = f.snake.body[0];
    for (const e of f.enemies) {
      const d = ENEMIES.get(e.kind);
      const q0 = this.enemyPos(e, p);
      const atk = this.attacks.get(e.id);
      let q = q0;
      if (atk) {
        const t = (now - atk.start) / 260;
        if (t >= 1) this.attacks.delete(e.id);
        else {
          const k = Math.sin(Math.PI * t) * 0.35;
          q = { x: q0.x + (atk.to.x - q0.x) * k, y: q0.y + (atk.to.y - q0.y) * k };
        }
      }
      const X = this.cx(q.x), Y = this.cy(q.y);
      if (e.under) {
        ctx.fillStyle = '#3a2e26';
        ctx.beginPath();
        ctx.ellipse(X, Y + T * 0.1, T * 0.32, T * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5a4637';
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.arc(X - T * 0.2 + i * T * 0.1, Y + T * 0.02 + Math.sin(now / 200 + i) * T * 0.03, T * 0.05, 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }
      if (e.body && e.body.length) this.drawEnemySnake(e, q, d?.color ?? '#e056fd', now);
      if (e.held) {
        ctx.strokeStyle = PAL.coil;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(X, Y, T * 0.44, 0, Math.PI * 2);
        ctx.stroke();
      } else if (!e.body) {
        // Wrap progress: how many of your tiles touch it (4 = squeezed).
        const touching = touchCount(f, e);
        if (touching >= 2) {
          const full = touching >= wrapMin(f);
          ctx.strokeStyle = PAL.coil;
          ctx.lineWidth = full ? 3 : 2;
          for (let i = 0; i < Math.min(touching, wrapMin(f)); i++) {
            const a0 = -Math.PI / 2 + (i * Math.PI * 2) / wrapMin(f) + 0.12;
            ctx.beginPath();
            ctx.arc(X, Y, T * 0.46, a0, a0 + (Math.PI * 2) / wrapMin(f) - 0.24);
            ctx.stroke();
          }
        }
      }
      const halo = ctx.createRadialGradient(X, Y, T * 0.1, X, Y, T * 0.55);
      halo.addColorStop(0, 'rgba(255,255,255,0.10)');
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(X - T * 0.6, Y - T * 0.6, T * 1.2, T * 1.2);
      ctx.save();
      ctx.translate(X, Y);
      if (e.body) {
        // Snakes face along their own body, away from the neck.
        const nb = e.body[0];
        ctx.rotate(nb ? Math.atan2(e.pos.y - nb.y, e.pos.x - nb.x) : Math.atan2(head.y - e.pos.y, head.x - e.pos.x));
        drawHead(ctx, T, enemySnakeStyle(d?.color ?? '#e056fd', e.kind), now + e.id * 777, { crown: e.kind === 'ouroboros' });
        ctx.restore();
        this.drawEnemyHud(e, X, Y, d, now);
        continue;
      }
      ctx.rotate(Math.atan2(head.y - e.pos.y, head.x - e.pos.x));
      drawCreature(ctx, e.kind, d?.boss ? T * 1.35 : T, d?.color ?? '#fff', now / 1000 + e.id, (e.mem.curled ?? 0) > 0);
      ctx.restore();
      this.drawEnemyHud(e, X, Y, d, now);
      if (this.hover && eq(this.hover, e.pos)) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(this.ox + e.pos.x * T + 1, this.oy + e.pos.y * T + 1, T - 2, T - 2);
      }
    }
  }

  private drawEnemyHud(e: Enemy, X: number, Y: number, d: ReturnType<typeof ENEMIES.get>, now: number) {
    const ctx = this.ctx, T = this.T;
    void now;
    // HP and poison live in screen space ("above" the creature even when the board is rotated).
    ctx.save();
    ctx.translate(X, Y);
    if (this.rotated) ctx.rotate(-Math.PI / 2);
    this.textUpright = false;
    if (e.maxHp <= 6) {
      for (let i = 0; i < e.maxHp; i++) {
        ctx.fillStyle = i < e.hp ? '#f1faee' : 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.arc(-((e.maxHp - 1) / 2) * T * 0.14 + i * T * 0.14, -T * 0.42, T * 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const wBar = T * 0.8;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-wBar / 2, -T * 0.5, wBar, T * 0.07);
      ctx.fillStyle = d?.boss ? PAL.food : '#f1faee';
      ctx.fillRect(-wBar / 2, -T * 0.5, (wBar * Math.max(0, e.hp)) / e.maxHp, T * 0.07);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(T * 0.22)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(String(e.hp), 0, -T * 0.56);
    }
    if (e.poison > 0) {
      ctx.fillStyle = '#80ed99';
      ctx.font = `bold ${Math.round(T * 0.26)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(`☠${e.poison}`, T * 0.2, T * 0.42);
    }
    this.textUpright = true;
    ctx.restore();
    // Move intent chevrons (board space: they point in the board direction).
    if (e.intent.t === 'move') {
      const dx = [0, 1, 0, -1][e.intent.dir], dy = [-1, 0, 1, 0][e.intent.dir];
      const n = e.intent.steps;
      const base = e.body ? 0.72 : 0.55;
      ctx.strokeStyle = 'rgba(232, 241, 242, 0.55)';
      ctx.lineWidth = 2.5;
      for (let k = 0; k < n; k++) {
        const bx = X + dx * T * (base + k * 0.22), by = Y + dy * T * (base + k * 0.22);
        ctx.beginPath();
        ctx.moveTo(bx - dx * T * 0.1 - dy * T * 0.12, by - dy * T * 0.1 - dx * T * 0.12);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx - dx * T * 0.1 + dy * T * 0.12, by - dy * T * 0.1 + dx * T * 0.12);
        ctx.stroke();
      }
    }
  }

  private drawEnemySnake(e: Enemy, head: { x: number; y: number }, color: string, now: number) {
    const T = this.T;
    const prev = this.prev?.enemies.find((x) => x.id === e.id)?.body;
    const t = this.instant ? 1 : ease(Math.min(1, (now - this.animStart) / this.animDur));
    const pts = [head, ...e.body!.map((b, i) => {
      const a = prev?.[i];
      if (!a || Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1) return b;
      return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
    })].map((q) => ({ x: this.cx(q.x), y: this.cy(q.y) }));
    const n = pts.length;
    const girth = enemySnakeStyle(color, e.kind).girth ?? 1;
    const samples = sampleBody(pts, (u) => lerp(0.56, 0.32, n > 1 ? u / (n - 1) : 0) * T * girth, T * 0.03, now + e.id * 777, T * 0.2);
    drawBody(this.ctx, samples, n, enemySnakeStyle(color, e.kind));
  }

  private drawLocks(f: Fight, pts: { x: number; y: number }[], now: number) {
    const ctx = this.ctx, T = this.T;
    for (const e of f.enemies) {
      const it0 = e.intent;
      if (it0.t === 'steal') {
        const idx = f.snake.segs.findIndex((s) => s.uid === it0.seg) + 1;
        if (idx > 0 && idx < pts.length) {
          ctx.strokeStyle = PAL.food;
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(this.cx(e.pos.x), this.cy(e.pos.y));
          ctx.lineTo(this.cx(pts[idx].x), this.cy(pts[idx].y));
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(this.cx(pts[idx].x), this.cy(pts[idx].y), T * 0.38, 0, Math.PI * 2);
          ctx.stroke();
        }
        continue;
      }
      if (it0.t === 'emerge') {
        this.hatch([it0.at], PAL.danger, 0.7, now);
        ctx.strokeStyle = PAL.danger;
        ctx.lineWidth = 2;
        ctx.strokeRect(this.ox + it0.at.x * T + 2, this.oy + it0.at.y * T + 2, T - 4, T - 4);
        continue;
      }
      if (it0.t === 'summon') {
        ctx.strokeStyle = 'rgba(239, 71, 111, 0.6)';
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 2;
        for (const t of it0.tiles) {
          ctx.beginPath();
          ctx.arc(this.cx(t.x), this.cy(t.y), T * 0.3, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        continue;
      }
      const it = it0;
      if (it.t !== 'lock') continue;
      const idx = it.seg === 0 ? 0 : f.snake.segs.findIndex((s) => s.uid === it.seg) + 1;
      if (idx < 0 || (it.seg !== 0 && idx === 0) || idx >= pts.length) continue;
      const tp = pts[idx];
      const X = this.cx(tp.x), Y = this.cy(tp.y);
      const E = this.cx(e.pos.x), F = this.cy(e.pos.y);
      ctx.strokeStyle = PAL.danger;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -now / 40;
      ctx.beginPath();
      ctx.moveTo(E, F);
      ctx.lineTo(X, Y);
      ctx.stroke();
      ctx.setLineDash([]);
      // reach area
      ctx.strokeStyle = 'rgba(239, 71, 111, 0.35)';
      ctx.lineWidth = 1;
      const r = it.reach;
      ctx.strokeRect(this.ox + (e.pos.x - r) * T, this.oy + (e.pos.y - r) * T, (2 * r + 1) * T, (2 * r + 1) * T);
      // reticle
      const rr = T * (0.42 + 0.05 * Math.sin(now / 120));
      ctx.strokeStyle = PAL.danger;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(X, Y, rr, 0, Math.PI * 2);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        ctx.moveTo(X + Math.cos(a) * rr * 0.7, Y + Math.sin(a) * rr * 0.7);
        ctx.lineTo(X + Math.cos(a) * rr * 1.2, Y + Math.sin(a) * rr * 1.2);
      }
      ctx.stroke();
      if (it.sever || it.windup > 1) {
        ctx.fillStyle = PAL.danger;
        ctx.font = `bold ${Math.round(T * 0.28)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`${it.sever ? '✂' : ''}${it.windup > 1 ? it.windup : ''}`, E, F - T * 0.55);
      }
    }
  }

  /**
   * Interpolated body positions. Segments slide along the trail the head laid
   * down this action (so multi-step moves follow corners instead of cutting them).
   */
  private snakePoints(f: Fight, p: number) {
    const next = f.snake.body;
    const prev = this.prev?.snake.body;
    if (!prev || prev.length === 0) return next.map((q) => ({ ...q }));
    const steps = f.events.filter((e) => e.t === 'move').map((e) => (e as { to: Pos }).to);
    const trail = [...steps].reverse().concat(prev);
    const k = steps.length;
    const consistent = next.every((q, i) => i >= trail.length || eq(q, trail[i]));
    if (!consistent) {
      if (Math.abs(prev[0].x - next[0].x) + Math.abs(prev[0].y - next[0].y) > 2) return next.map((q) => ({ ...q }));
      return next.map((q, i) => {
        const a = prev[Math.min(i, prev.length - 1)];
        return { x: lerp(a.x, q.x, p), y: lerp(a.y, q.y, p) };
      });
    }
    const at = (t: number) => {
      const i = Math.min(Math.floor(t), trail.length - 1), j = Math.min(i + 1, trail.length - 1);
      const fr = Math.min(1, t - i);
      return { x: lerp(trail[i].x, trail[j].x, fr), y: lerp(trail[i].y, trail[j].y, fr) };
    };
    return next.map((_, i) => at(Math.min(i + k * (1 - p), trail.length - 1)));
  }

  private drawSnake(f: Fight, pts: { x: number; y: number }[], now: number) {
    const ctx = this.ctx, T = this.T;
    const n = pts.length;
    const width = (t: number) => {
      // Narrow neck, thickest around a third of the way back, tapering tail.
      const u = n > 1 ? t / (n - 1) : 0;
      const neck = Math.min(1, t / 1.2);
      let w = (lerp(0.46, 0.64, neck) * (1 - u) + 0.36 * u) * T * (this.style.girth ?? 1);
      for (const b of this.bulges) {
        const d = Math.abs(t - (now - b.start) / 70);
        if (d < 1.5) w *= 1 + 0.35 * (1 - d / 1.5);
      }
      return w;
    };
    this.bulges = this.bulges.filter((b) => (now - b.start) / 70 < n + 2);
    const px = pts.map((q) => ({ x: this.cx(q.x), y: this.cy(q.y) }));
    const samples = sampleBody(px, width, T * 0.035, now, T * 0.45);
    // Item badges and the head sit on the swaying centreline.
    const onBody = (i: number) => {
      const s = samples.find((x) => x.t >= i) ?? samples[samples.length - 1];
      return s ? { x: s.x, y: s.y } : px[i];
    };
    const P = (i: number) => (i === 0 || !samples.length ? px[i] : onBody(i));
    if (f.status === 'dead') ctx.globalAlpha = 0.5;
    drawBody(ctx, samples, n, this.style);
    // items
    const handIdx = ops.hand(f);
    f.snake.segs.forEach((s, k) => {
      if (!s.item || k + 1 >= n) return;
      const d = ITEMS.get(s.item);
      if (!d) return;
      const a = P(k + 1);
      const r = T * 0.24;
      ctx.fillStyle = '#0b1a1f';
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
      ctx.fill();
      const slot = handIdx.indexOf(k);
      if (slot >= 0) {
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(a.x, a.y, r + 1, 0, Math.PI * 2);
        ctx.stroke();
      } else if (s.temp) {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(a.x, a.y, r + 1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      drawGlyph(ctx, d.glyph, a.x, a.y, r * 0.8, d.color);
      if (slot >= 0) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(T * 0.22)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(String(slot + 1), a.x + r * 0.95, a.y - r * 0.75);
      }
    });
    // head
    const h = P(0);
    const target = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][f.snake.dir];
    let da = target - this.lastHeadAngle;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    this.lastHeadAngle += da * 0.35;
    const ang = this.lastHeadAngle;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(ang);
    drawHead(ctx, T, this.style, now);
    ctx.restore();
    ctx.globalAlpha = 1;
    // pending segments count at the burrow
    const pend = ops.pending(f);
    if (pend > 0 && n > 1) {
      const t = P(n - 1);
      ctx.fillStyle = 'rgba(232,241,242,0.8)';
      ctx.font = `bold ${Math.round(T * 0.24)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`+${pend}`, t.x, t.y + T * 0.5);
    }
  }

  /** Ghost of the hovered move: resulting body, lost segments and new coils. */
  private drawPreview(f: Fight, now: number) {
    const g = this.preview;
    if (!g) return;
    const ctx = this.ctx, T = this.T;
    for (const c of computeCoils(g)) {
      ctx.strokeStyle = PAL.coil;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      for (const t of c.tiles) ctx.strokeRect(this.ox + t.x * T + 3, this.oy + t.y * T + 3, T - 6, T - 6);
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 0.5 + 0.12 * Math.sin(now / 200);
    ctx.strokeStyle = '#bff5e8';
    ctx.lineWidth = T * 0.22;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    g.snake.body.forEach((q, i) => (i ? ctx.lineTo(this.cx(q.x), this.cy(q.y)) : ctx.moveTo(this.cx(q.x), this.cy(q.y))));
    ctx.stroke();
    const h = g.snake.body[0];
    ctx.fillStyle = '#bff5e8';
    ctx.beginPath();
    ctx.arc(this.cx(h.x), this.cy(h.y), T * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.cx(h.x), this.cy(h.y), T * 0.34, 0, Math.PI * 2);
    ctx.stroke();
    // Segments that will be lost this turn (compare uids).
    const keep = new Set(g.snake.segs.map((s) => s.uid));
    const lost = f.snake.segs.filter((s, k) => !keep.has(s.uid) && k + 1 < f.snake.body.length);
    for (const s of lost) {
      const pos = ops.segPos(f, s.uid);
      if (!pos) continue;
      const X = this.cx(pos.x), Y = this.cy(pos.y);
      ctx.strokeStyle = PAL.danger;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(X - T * 0.2, Y - T * 0.2);
      ctx.lineTo(X + T * 0.2, Y + T * 0.2);
      ctx.moveTo(X + T * 0.2, Y - T * 0.2);
      ctx.lineTo(X - T * 0.2, Y + T * 0.2);
      ctx.stroke();
    }
    if (g.status === 'dead') {
      ctx.fillStyle = PAL.danger;
      ctx.font = `bold ${Math.round(T * 0.35)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('DEATH', this.cx(h.x), this.cy(h.y) - T * 0.5);
    }
  }

  private drawTargeting(f: Fight, now: number) {
    if (!this.targetDirs) return;
    const ctx = this.ctx, T = this.T;
    const h = f.snake.body[0];
    const a = 0.5 + 0.3 * Math.sin(now / 150);
    for (const d of this.targetDirs) {
      const dx = [0, 1, 0, -1][d], dy = [-1, 0, 1, 0][d];
      const X = this.cx(h.x + dx), Y = this.cy(h.y + dy);
      ctx.strokeStyle = `rgba(255, 209, 102, ${a})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(X - dy * T * 0.2 - dx * T * 0.1, Y - dx * T * 0.2 - dy * T * 0.1);
      ctx.lineTo(X + dx * T * 0.15, Y + dy * T * 0.15);
      ctx.lineTo(X + dy * T * 0.2 - dx * T * 0.1, Y + dx * T * 0.2 - dy * T * 0.1);
      ctx.stroke();
    }
  }

  private drawFx(dt: number) {
    const ctx = this.ctx, T = this.T;
    for (const fl of this.flashes) {
      fl.life += dt;
      const a = 1 - fl.life / fl.max;
      ctx.fillStyle = fl.color;
      ctx.globalAlpha = Math.max(0, a) * 0.5;
      for (const t of fl.tiles) ctx.fillRect(this.ox + t.x * T, this.oy + t.y * T, T, T);
    }
    ctx.globalAlpha = 1;
    this.flashes = this.flashes.filter((x) => x.life < x.max);
    for (const pt of this.particles) {
      pt.life += dt;
      pt.x += (pt.vx * dt) / 1000;
      pt.y += (pt.vy * dt) / 1000;
      pt.vx *= 0.96;
      pt.vy *= 0.96;
      ctx.globalAlpha = Math.max(0, 1 - pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(this.ox + pt.x * T, this.oy + pt.y * T, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.particles = this.particles.filter((x) => x.life < x.max);
    for (const fl of this.floats) {
      fl.life += dt;
      const t = fl.life / fl.max;
      ctx.globalAlpha = Math.max(0, 1 - t * t);
      ctx.fillStyle = fl.color;
      ctx.font = `bold ${Math.round(T * (fl.big ? 0.6 : 0.32))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      const X = this.cx(fl.x), Y = this.cy(fl.y) - T * 0.3 - t * T * (fl.big ? 0.3 : 0.8);
      ctx.strokeText(fl.text, X, Y);
      ctx.fillText(fl.text, X, Y);
    }
    ctx.globalAlpha = 1;
    this.floats = this.floats.filter((x) => x.life < x.max);
  }
}

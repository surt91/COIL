/**
 * Dev-only style sheet of every graphic in the game (?gallery): snake styles,
 * creatures, glyphs at several sizes, card art, terrain per act. Used for art
 * reviews.
 */
import { useEffect, useRef } from 'preact/hooks';
import { createFight } from '../core/fight';
import { CHARMS, ENEMIES, ITEMS } from '../core/registry';
import { LAYOUTS } from '../content/layouts';
import { BoardRenderer } from '../render/board';
import { drawCardArt } from '../render/cardArt';
import { drawCreature } from '../render/creatures';
import { drawGlyph } from '../render/glyphs';
import { SPECIES_STYLES, drawBody, drawHead, sampleBody } from '../render/serpent';

function Canvas({ w, h, draw }: { w: number; h: number; draw(ctx: CanvasRenderingContext2D): void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    c.width = w * 2;
    c.height = h * 2;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#0d1321';
    ctx.fillRect(0, 0, w, h);
    draw(ctx);
  }, []);
  return <canvas ref={ref} style={{ width: `${w}px`, height: `${h}px`, borderRadius: '6px' }} />;
}

function Board({ act, enemies, species }: { act: number; enemies: string[]; species: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const r = new BoardRenderer(ref.current!);
    r.act = act;
    r.instant = true;
    r.style = SPECIES_STYLES[species];
    const f = createFight({ rows: LAYOUTS[act * 2].rows, genome: ['lunge', 'fang', 'scale', 'venom', 'spine', 'heart'], flesh: 3, seed: 3 + act, place: enemies });
    // Lay the snake out in a curve so it is visible.
    f.snake.body = [{ x: 6, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 4, y: 7 }, { x: 5, y: 7 }, { x: 6, y: 7 }, { x: 7, y: 7 }, { x: 8, y: 7 }, { x: 8, y: 8 }];
    f.snake.dir = 1;
    r.push(f);
    r.resize(560, 430);
    let raf = 0;
    const loop = (t: number) => { r.frame(t, 16); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} />;
}

export function Gallery() {
  const sec = { margin: '28px 0 10px' };
  const row = { display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' } as const;
  const label = { fontSize: '12px', color: '#8796ab', textAlign: 'center' as const };
  return (
    <div class="screen" style={{ padding: '24px' }}>
      <h1>COIL style sheet</h1>
      <h2 style={sec}>Player snakes (species)</h2>
      <div style={row}>
        {Object.entries(SPECIES_STYLES).map(([id, st]) => (
          <div>
            <Canvas w={260} h={110} draw={(ctx) => {
              const T = 44;
              const pts = [{ x: 220, y: 55 }, { x: 176, y: 55 }, { x: 132, y: 55 }, { x: 132, y: 80 }, { x: 88, y: 80 }, { x: 44, y: 80 }, { x: 22, y: 50 }];
              const n = pts.length;
              drawBody(ctx, sampleBody(pts, (t) => (0.64 - 0.28 * t / (n - 1)) * T * (st.girth ?? 1), 0, 0, T * 0.45), n, st);
              ctx.translate(220, 55);
              drawHead(ctx, T, st, 0, { tongue: true });
            }} />
            <div style={label}>{id}</div>
          </div>
        ))}
      </div>
      <h2 style={sec}>Creatures (1 tile = 44 px and 88 px)</h2>
      <div style={row}>
        {[...ENEMIES.values()].map((d) => (
          <div>
            <Canvas w={140} h={96} draw={(ctx) => {
              ctx.save(); ctx.translate(30, 60); drawCreature(ctx, d.kind, 44, d.color, 0.3); ctx.restore();
              ctx.save(); ctx.translate(96, 48); drawCreature(ctx, d.kind, 88, d.color, 0.3); ctx.restore();
            }} />
            <div style={label}>{d.name}</div>
          </div>
        ))}
      </div>
      <h2 style={sec}>Glyphs (16 / 24 / 40 px)</h2>
      <div style={row}>
        {[...new Set([...ITEMS.values()].map((d) => d.glyph).concat([...CHARMS.values()].map((c) => c.glyph)))].map((g) => (
          <div>
            <Canvas w={100} h={50} draw={(ctx) => {
              for (const [x, r] of [[14, 8], [40, 12], [76, 20]] as const) {
                ctx.fillStyle = '#0b1a1f';
                ctx.beginPath(); ctx.arc(x, 25, r + 3, 0, Math.PI * 2); ctx.fill();
                drawGlyph(ctx, g, x, 25, r * 0.8, '#e8f1f2');
              }
            }} />
            <div style={label}>{g}</div>
          </div>
        ))}
      </div>
      <h2 style={sec}>Card art</h2>
      <div style={row}>
        {[...ITEMS.keys(), ...CHARMS.keys()].map((id) => (
          <div>
            <Canvas w={238} h={84} draw={(ctx) => drawCardArt(ctx, id, 238, 84)} />
            <div style={label}>{id}</div>
          </div>
        ))}
      </div>
      <h2 style={sec}>Boards per act (with telegraphs)</h2>
      <div style={row}>
        <Board act={0} enemies={['beetle', 'frog', 'hedgehog', 'mantis', 'spider']} species="garden" />
        <Board act={1} enemies={['mole', 'magpie', 'ant', 'tortoise', 'queen']} species="python" />
        <Board act={2} enemies={['wasp', 'glowworm', 'rival', 'ouroboros']} species="viper" />
      </div>
    </div>
  );
}

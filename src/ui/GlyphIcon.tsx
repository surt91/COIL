import { useEffect, useRef } from 'preact/hooks';
import { drawGlyph } from '../render/glyphs';

export function GlyphIcon({ glyph, color, size = 24 }: { glyph: string; color: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0b1a1f';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    drawGlyph(ctx, glyph, size / 2, size / 2, size * 0.36, color);
  }, [glyph, color, size]);
  return <canvas ref={ref} style={{ width: `${size}px`, height: `${size}px` }} class="glyph" />;
}

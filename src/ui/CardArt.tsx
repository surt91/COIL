import { useEffect, useRef } from 'preact/hooks';
import { drawCardArt } from '../render/cardArt';

export function CardArt({ id, width, height }: { id: string; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCardArt(ctx, id, width, height);
  }, [id, width, height]);
  return <canvas ref={ref} class="card-art" style={{ width: `${width}px`, height: `${height}px` }} />;
}

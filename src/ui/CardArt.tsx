import { useEffect, useRef } from 'preact/hooks';
import { drawCardArt } from '../render/cardArt';

/** Card illustration that fills the card's full width (it bleeds over the card padding). */
export function CardArt({ id, height }: { id: string; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const draw = () => {
      const width = Math.max(40, Math.round(c.getBoundingClientRect().width));
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawCardArt(ctx, id, width, height);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [id, height]);
  return <canvas ref={ref} class="card-art" style={{ height: `${height}px` }} />;
}

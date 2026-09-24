import { useEffect, useRef, useState } from 'preact/hooks';
import { CHARMS, ENEMIES, ITEMS } from '../core/registry';
import { drawCreature } from '../render/creatures';
import { CharmCard, ItemCard } from './RunScreens';

function CreatureIcon({ kind, color, size = 56 }: { kind: string; color: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, size / 2 * dpr, size / 2 * dpr);
    drawCreature(ctx, kind, size * 0.9, color, 0.3);
  }, [kind]);
  return <canvas ref={ref} style={{ width: `${size}px`, height: `${size}px` }} />;
}

export function Codex({ onClose }: { onClose(): void }) {
  const [tab, setTab] = useState<'items' | 'enemies' | 'charms'>('items');
  const order = ['starter', 'common', 'uncommon', 'rare', 'signature'];
  const items = [...ITEMS.values()].sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity));
  return (
    <div class="screen codex">
      <div class="codex-head">
        <h2>Codex</h2>
        <button class={`btn ${tab === 'items' ? 'primary' : ''}`} onClick={() => setTab('items')}>Items ({items.length})</button>
        <button class={`btn ${tab === 'charms' ? 'primary' : ''}`} onClick={() => setTab('charms')}>Charms ({CHARMS.size})</button>
        <button class={`btn ${tab === 'enemies' ? 'primary' : ''}`} onClick={() => setTab('enemies')}>Creatures ({ENEMIES.size})</button>
        <button class="btn" onClick={onClose}>Back</button>
      </div>
      {tab === 'charms' ? (
        <div class="choices">{[...CHARMS.values()].map((c) => <CharmCard id={c.id} />)}</div>
      ) : tab === 'items' ? (
        <>
          <p class="dim">Signature items are grafted temporarily when you eat the creature that carries them.</p>
          <div class="choices">{items.map((d) => <ItemCard id={d.id} />)}</div>
        </>
      ) : (
        <div class="bestiary">
          {[...ENEMIES.values()].map((d) => (
            <div class="beast">
              <CreatureIcon kind={d.kind} color={d.color} />
              <div>
                <h3 style={{ color: d.color }}>{d.name}{d.boss ? ' · boss' : ''}</h3>
                <div class="dim">HP {d.hp}{d.flies ? ' · flies' : ''}{d.spiky ? ' · spiny' : ''}{d.snake ? ' · snake' : ''}{d.signature ? ` · carries ${ITEMS.get(d.signature)?.name}` : ''}</div>
                <p>{d.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

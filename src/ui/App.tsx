import { useState } from 'preact/hooks';
import { createFight } from '../core/fight';
import { ROOMS } from '../content/rooms';
import type { Fight, ItemId } from '../core/types';
import { FightView } from './FightView';

const STARTER: ItemId[] = ['lunge', 'fang', 'scale', 'reverse', 'venom', 'rattle'];

/** Temporary sandbox flow: endless rooms until the run structure exists. */
export function App() {
  const params = new URLSearchParams(location.search);
  const [seed, setSeed] = useState(() => Number(params.get('seed') ?? Math.floor(Math.random() * 1e9)));
  const [roomIx, setRoomIx] = useState(() => Number(params.get('room') ?? 0));
  const [flesh, setFlesh] = useState(4);
  const [dead, setDead] = useState<Fight | null>(null);
  const room = ROOMS[roomIx % ROOMS.length];
  const fight = createFight({ rows: room.rows, genome: STARTER, flesh, seed: seed + roomIx });

  if (dead) {
    const cause = dead.events.find((e) => e.t === 'death');
    return (
      <div class="overlay">
        <h1>You died</h1>
        <p>{cause && cause.t === 'death' ? `Killed by ${cause.cause}` : ''} in {room.name}.</p>
        <button onClick={() => { setDead(null); setRoomIx(0); setFlesh(4); setSeed(Math.floor(Math.random() * 1e9)); }}>Try again</button>
      </div>
    );
  }
  return (
    <FightView
      key={`${seed}-${roomIx}`}
      initial={fight}
      title={`${room.name} · room ${roomIx + 1}`}
      onEnd={(f) => {
        if (f.status === 'dead') return setDead(f);
        setFlesh(Math.max(0, f.snake.segs.filter((s) => !s.item || s.temp).length));
        setRoomIx((i) => i + 1);
      }}
    />
  );
}

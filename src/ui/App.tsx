import { useEffect, useRef, useState } from 'preact/hooks';
import { initAudio, isMuted, setMuted, startAmbient, stinger, uiClick } from '../audio/audio';
import { LAYOUTS } from '../content/layouts';
import { RunState, createRun, finishFight, recordEvents, updateFight } from '../core/run';
import { seedFromString } from '../core/rng';
import { loadRun, saveRun } from '../save/storage';
import { FightView } from './FightView';
import { BaskScreen, EndScreen, EventScreen, GenomePanel, MapScreen, PoolScreen, RewardScreen } from './RunScreens';

export function App() {
  const [run, setRunState] = useState<RunState | null>(null);
  const runRef = useRef(run);
  const [muted, setMutedState] = useState(isMuted());

  const setRun = (r: RunState | null) => {
    runRef.current = r;
    setRunState(r);
    saveRun(r);
  };

  useEffect(() => {
    const unlock = () => initAudio();
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    const params = new URLSearchParams(location.search);
    if (params.has('seed')) {
      const s = params.get('seed')!;
      setRun(createRun(/^\d+$/.test(s) ? Number(s) : seedFromString(s)));
    }
    return () => {
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('pointerdown', unlock);
    };
  }, []);

  useEffect(() => {
    if (run) startAmbient(run.act);
  }, [run?.act, !!run]);

  const muteBtn = (
    <button class="mute" title="Toggle sound" onClick={() => { setMuted(!muted); setMutedState(!muted); }}>
      {muted ? '🔇' : '🔊'}
    </button>
  );

  if (!run) return <><Title onStart={(r) => setRun(r)} />{muteBtn}</>;
  const sc = run.screen;
  let body;
  switch (sc.t) {
    case 'map':
      body = <MapScreen run={run} setRun={setRun} />;
      break;
    case 'fight': {
      const layout = LAYOUTS.find((l) => l.id === sc.layout);
      const node = run.map[sc.node];
      body = (
        <FightView
          key={`${run.seed}-${sc.node}`}
          initial={sc.fight}
          title={`${layout?.name ?? ''}${node.kind === 'elite' ? ' · elite' : node.kind === 'boss' ? ' · BOSS' : ''}`}
          side={<GenomePanel run={run} />}
          onStep={(f, undo) => {
            let r = runRef.current!;
            if (!undo) r = recordEvents(r, f.events);
            setRun(updateFight(r, f));
          }}
          onEnd={(f) => {
            stinger(f.status === 'won' ? 'victory' : 'defeat');
            setRun(finishFight(runRef.current!, f));
          }}
        />
      );
      break;
    }
    case 'reward':
      body = <RewardScreen run={run} setRun={setRun} screen={sc} />;
      break;
    case 'pool':
      body = <PoolScreen run={run} setRun={setRun} screen={sc} />;
      break;
    case 'bask':
      body = <BaskScreen run={run} setRun={setRun} screen={sc} />;
      break;
    case 'event':
      body = <EventScreen run={run} setRun={setRun} screen={sc} />;
      break;
    case 'victory':
    case 'dead':
      body = <EndScreen run={run} onDone={() => setRun(null)} />;
      break;
  }
  return <>{body}{muteBtn}</>;
}

function Title({ onStart }: { onStart(r: RunState): void }) {
  const saved = loadRun();
  const [seed, setSeed] = useState('');
  const start = () => {
    uiClick();
    const s = seed.trim();
    onStart(createRun(s ? (/^\d+$/.test(s) ? Number(s) : seedFromString(s)) : Math.floor(Math.random() * 2 ** 31)));
  };
  return (
    <div class="screen title-screen">
      <h1 class="logo">COIL</h1>
      <p class="tagline">Your body is your health, your wallet, your deck and your weapon.</p>
      <div class="title-buttons">
        {saved && <button class="btn primary" onClick={() => { uiClick(); onStart(saved); }}>Continue run</button>}
        <button class={`btn ${saved ? '' : 'primary'}`} onClick={start}>New run</button>
        <input class="seed" placeholder="seed (optional)" value={seed} onInput={(e) => setSeed((e.target as HTMLInputElement).value)} />
      </div>
      <div class="howto">
        <h3>How to play</h3>
        <ul>
          <li>Turn-based. Every turn your head moves one tile — you can never stand still. Your body follows.</li>
          <li>Every segment is <b>flesh</b> or carries an <b>item</b>. The first three items behind your head are your <b>hand</b>: press <kbd>1</kbd>–<kbd>3</kbd> to play one. Playing consumes that segment.</li>
          <li>Enemies telegraph everything. A hit destroys the segment it lands on — and its item. A dashed red line means a bite locked on a segment: move so that segment slides out of reach, or bite the attacker first.</li>
          <li><b>Coil</b>: enclose enemies with your body (walls help). Tighter coils crush harder.</li>
          <li>Hover a tile next to your head to preview the whole turn. <kbd>Z</kbd> undoes card plays, <kbd>T</kbd> tucks an item to your tail.</li>
          <li>Flesh carries between rooms. It is your health and your currency.</li>
        </ul>
      </div>
    </div>
  );
}

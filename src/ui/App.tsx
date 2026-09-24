import { useEffect, useRef, useState } from 'preact/hooks';
import { initAudio, isMuted, setMuted, startAmbient, stinger, uiClick } from '../audio/audio';
import { LAYOUTS } from '../content/layouts';
import { createFight } from '../core/fight';
import { MOLTS, RunState, createRun, fleshCap, finishFight, recordEvents, updateFight } from '../core/run';
import { seedFromString } from '../core/rng';
import { loadProfile, loadRun, recordRun, saveRun, todayKey } from '../save/storage';
import { Codex } from './Codex';
import { SPECIES } from '../content/species';
import { GlyphIcon } from './GlyphIcon';
import { CHARMS } from '../core/registry';
import { FightView } from './FightView';
import { BaskScreen, EndScreen, EventScreen, GenomePanel, MapScreen, PoolScreen, RewardScreen } from './RunScreens';

export function App() {
  const [run, setRunState] = useState<RunState | null>(null);
  const runRef = useRef(run);
  const [muted, setMutedState] = useState(isMuted());

  const setRun = (r: RunState | null) => {
    const prev = runRef.current;
    runRef.current = r;
    setRunState(r);
    saveRun(r);
    const ended = (x: RunState | null) => !!x && (x.screen.t === 'victory' || x.screen.t === 'dead');
    if (r && ended(r) && !ended(prev)) recordRun(r);
  };

  useEffect(() => {
    const unlock = () => initAudio();
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    const params = new URLSearchParams(location.search);
    if (params.has('fight')) {
      // Debug: ?fight=<layout>&enemies=beetle,frog&seed=N
      const r = createRun(Number(params.get('seed') ?? 1));
      r.act = Number(params.get('act') ?? 0);
      const layout = LAYOUTS.find((l) => l.id === params.get('fight')) ?? LAYOUTS[0];
      r.at = r.map.find((n) => n.row === 0)!.id;
      r.screen = {
        t: 'fight', node: r.at, encounter: 'debug', layout: layout.id,
        fight: createFight({ rows: layout.rows, genome: r.genome, flesh: r.flesh, seed: Number(params.get('seed') ?? 1), place: (params.get('enemies') ?? 'beetle').split(',') }),
      };
      setRun(r);
    } else if (params.has('seed')) {
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
          side={<GenomePanel run={run} inFight />}
          act={run.act}
          fleshCap={fleshCap(run)}
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
  const profile = loadProfile();
  const [seed, setSeed] = useState('');
  const [molt, setMolt] = useState(Math.min(profile.moltUnlocked, MOLTS.length - 1));
  const [codex, setCodex] = useState(false);
  const unlocked = (sp: (typeof SPECIES)[number]) => !sp.unlock || profile.unlocks.includes(sp.unlock);
  const [species, setSpecies] = useState('garden');
  const start = () => {
    uiClick();
    const s = seed.trim();
    onStart(createRun(s ? (/^\d+$/.test(s) ? Number(s) : seedFromString(s)) : Math.floor(Math.random() * 2 ** 31), molt, undefined, species));
  };
  const today = todayKey();
  const daily = profile.dailies[today];
  const startDaily = () => {
    uiClick();
    onStart(createRun(seedFromString(`coil-daily-${today}`), 0, today));
  };
  if (codex) return <Codex onClose={() => setCodex(false)} />;
  return (
    <div class="screen title-screen">
      <h1 class="logo">COIL</h1>
      <p class="tagline">Your body is your health, your wallet, your deck and your weapon.</p>
      <div class="title-buttons">
        {saved && <button class="btn primary" onClick={() => { uiClick(); onStart(saved); }}>Continue run</button>}
        <button class={`btn ${saved ? '' : 'primary'}`} onClick={start}>New run</button>
        <input class="seed" placeholder="seed (optional)" value={seed} onInput={(e) => setSeed((e.target as HTMLInputElement).value)} />
        <button class="btn" onClick={() => { uiClick(); setCodex(true); }}>Codex</button>
        <button class="btn" onClick={startDaily} disabled={!!daily} title="Everyone gets the same seed today. One attempt.">
          {daily ? `Daily done: ${daily.won ? 'victory!' : `act ${daily.act + 1}, ${daily.rooms} rooms`}` : `Daily run ${today}`}
        </button>
      </div>
      <div class="species">
        {SPECIES.map((sp) => {
          const ok = unlocked(sp);
          const c = CHARMS.get(sp.charm);
          return (
            <button class={`card species-card ${species === sp.id ? 'selected' : ''} ${ok ? '' : 'disabled'}`} style={{ '--c': sp.color }} onClick={() => ok && setSpecies(sp.id)}>
              <div class="card-top">{c && <GlyphIcon glyph={c.glyph} color={sp.color} size={26} />}<span class="card-name">{sp.name}</span></div>
              <div class="card-text">{ok ? sp.text : `Locked — ${sp.unlockText}`}</div>
              {ok && c && <div class="card-passive">{c.text}</div>}
            </button>
          );
        })}
      </div>
      {profile.moltUnlocked > 0 && (
        <div class="molts">
          <label>Molt </label>
          <select value={molt} onChange={(e) => setMolt(Number((e.target as HTMLSelectElement).value))}>
            {MOLTS.slice(0, profile.moltUnlocked + 1).map((m, i) => <option value={i}>{i}: {m}</option>)}
          </select>
          <span class="dim"> — each molt also includes all previous ones</span>
        </div>
      )}
      {profile.runs > 0 && <div class="dim">{profile.runs} runs · {profile.victories} victories{profile.bestMolt >= 0 ? ` · best molt ${profile.bestMolt}` : ''}</div>}
      <div class="howto">
        <h3>How to play</h3>
        <ul>
          <li>Turn-based. Every turn your head moves one tile — you can never stand still. Your body follows.</li>
          <li>Every segment is <b>flesh</b> or carries an <b>item</b>. The first three items behind your head are your <b>hand</b>: press <kbd>1</kbd>–<kbd>3</kbd> to play one. Playing consumes that segment.</li>
          <li>Enemies telegraph everything. A hit destroys the segment it lands on — and its item. A red reticle means a bite locked on a segment: move so that segment slides out of the attacker's reach, or bite the attacker first to knock it back.</li>
          <li><b>Coil</b>: enclose enemies with your body (walls help). Tighter coils crush harder. Touching an enemy with 4 of your tiles <b>wraps</b> it — it gets squeezed too.</li>
          <li>Hover a tile next to your head to preview the whole turn. <kbd>Z</kbd> undoes card plays, <kbd>T</kbd> tucks an item to your tail.</li>
          <li>Flesh carries between rooms. It is your health and your currency.</li>
        </ul>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clearBaseline, loadAthlete, loadBaseline, saveAthlete, saveBaseline } from './baseline/storage';
import type { ExerciseType } from './biomechanics/catalog';
import { CameraStage } from './components/CameraStage';
import { FormDrawdown } from './components/FormDrawdown';
import { Header } from './components/Header';
import { Landing } from './components/Landing';
import { RepTimeline } from './components/RepTimeline';
import { ResearchModal, type ResearchTab } from './components/ResearchModal';
import { SidePanel } from './components/SidePanel';
import { SummaryModal } from './components/SummaryModal';
import { DEFAULT_DETECTOR_CONFIG, loadDetectorConfig, type DetectorConfig } from './detection/config';
import { SessionEngine } from './session/engine';
import { DemoRunner, LiveRunner, type Runner } from './session/runners';
import { arrow } from './utils/format';
import { useEngine } from './utils/hooks';

type View = 'landing' | 'session';
type Mode = 'demo' | 'live';

export default function App() {
  const [config, setConfig] = useState<DetectorConfig>(DEFAULT_DETECTOR_CONFIG);
  const [configReady, setConfigReady] = useState(false);
  const [view, setView] = useState<View>('landing');
  const [mode, setMode] = useState<Mode>('demo');
  const [exercise, setExercise] = useState<ExerciseType>('squat');
  const [athlete, setAthleteState] = useState(loadAthlete());
  const [sessionKey, setSessionKey] = useState(0);
  const [research, setResearch] = useState<ResearchTab | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [selectedRep, setSelectedRep] = useState<number | null>(null);
  const [runner, setRunner] = useState<Runner | null>(null);
  const [liveStatus, setLiveStatus] = useState('');
  const [liveError, setLiveError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: string } | null>(null);
  const [demoSpeed, setDemoSpeed] = useState(2);
  const [demoPaused, setDemoPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    loadDetectorConfig().then((c) => {
      setConfig(c);
      setConfigReady(true);
    });
  }, []);

  // Presenter deep links: ?demo=1 [&exercise=cmj] [&speed=4] [&skip=1 (jump to the end of the set)] [&live=1]
  const deepLink = useRef(new URLSearchParams(window.location.search));
  useEffect(() => {
    if (!configReady) return;
    const q = deepLink.current;
    if (q.get('exercise') === 'cmj') setExercise('cmj');
    const sp = Number(q.get('speed'));
    if ([1, 2, 4].includes(sp)) setDemoSpeed(sp);
    if (q.get('demo') === '1') startSession('demo');
    else if (q.get('live') === '1') startSession('live');
    const panel = q.get('panel');
    if (panel === 'lab' || panel === 'method' || panel === 'science' || panel === 'privacy') setResearch(panel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configReady]);
  useEffect(() => {
    if (runner instanceof DemoRunner && deepLink.current.get('skip') === '1') {
      deepLink.current.delete('skip');
      runner.skipToEnd();
    }
  }, [runner]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const engine = useMemo(() => new SessionEngine(exercise, config, athlete, mode), [exercise, mode, sessionKey]);
  const snap = useEngine(engine);

  useEffect(() => engine.setConfig(config), [engine, config]);
  useEffect(() => engine.setAthlete(athlete), [engine, athlete]);

  // Frame source lifecycle (sessions start only once the Lab config is loaded)
  useEffect(() => {
    if (view !== 'session' || !configReady) return;
    let r: Runner;
    setLiveError(null);
    if (mode === 'demo') {
      const d = new DemoRunner(engine, exercise);
      d.speed = demoSpeed;
      d.start();
      r = d;
    } else {
      const video = videoRef.current as HTMLVideoElement;
      const l = new LiveRunner(engine, video);
      l.start(setLiveStatus).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setLiveError(
          /Permission|NotAllowed/i.test(msg)
            ? 'Camera permission was denied. Allow camera access in your browser, or run the demo dataset.'
            : `Could not start the camera or pose model (${msg}).`,
        );
        setLiveStatus('');
      });
      r = l;
    }
    setRunner(r);
    setDemoPaused(false);
    if (import.meta.env.DEV) (window as unknown as { __breakingpoint?: unknown }).__breakingpoint = { engine, runner: r };
    return () => {
      r.stop();
      setRunner(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, mode, engine, exercise, configReady]);

  // Event side-effects: toasts, breaking-point flash, summary, baseline persistence
  const lastEvent = useRef<number>(0);
  useEffect(() => {
    const ev = snap.event;
    if (!ev || ev.id === lastEvent.current) return;
    lastEvent.current = ev.id;
    if (ev.type === 'breakpoint') {
      setFlash(true);
      setTimeout(() => setFlash(false), 1700);
      setToast({ text: ev.message, kind: 'break' });
    } else if (ev.type === 'baseline' || ev.type === 'recovery' || ev.type === 'discarded') {
      setToast({ text: ev.message, kind: '' });
    }
    if (ev.type === 'baseline' && mode === 'live' && snap.baseline && snap.calibrationReps.length) saveBaseline(snap.baseline);
  }, [snap.event, snap.baseline, snap.calibrationReps.length, mode]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const prevPhase = useRef(snap.phase);
  useEffect(() => {
    if (snap.phase === 'summary' && prevPhase.current === 'monitoring') setShowSummary(true);
    prevPhase.current = snap.phase;
  }, [snap.phase]);

  // Presenter keyboard shortcuts (demo): Space pause, 1/2/4 speed, S skip
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(runner instanceof DemoRunner) || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        runner.paused = !runner.paused;
        setDemoPaused(runner.paused);
      } else if (['1', '2', '4'].includes(e.key)) {
        runner.speed = Number(e.key);
        setDemoSpeed(runner.speed);
      } else if (e.key.toLowerCase() === 's') runner.skipToEnd();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runner]);

  const startSession = useCallback((m: Mode) => {
    setMode(m);
    setSelectedRep(null);
    setShowSummary(false);
    setSessionKey((k) => k + 1);
    setView('session');
  }, []);

  const setAthlete = (name: string) => {
    setAthleteState(name);
    saveAthlete(name);
  };

  const newSet = () => {
    setShowSummary(false);
    setSelectedRep(null);
    if (mode === 'demo') setSessionKey((k) => k + 1);
    else engine.startMonitoring();
  };

  const startRecovery = () => {
    setShowSummary(false);
    if (runner instanceof DemoRunner) runner.demo.startRecovery();
    else engine.startRecovery();
  };

  const resetBaseline = () => {
    clearBaseline(exercise);
    setSelectedRep(null);
    if (mode === 'demo') setSessionKey((k) => k + 1);
    else engine.resetBaseline();
  };

  const maxScore = Math.max(1, ...snap.monitorReps.map((r) => r.drift?.score ?? 0));
  const contrib = snap.breakpointContributors?.slice(0, 3) ?? [];
  const specLabel = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).toLowerCase();

  return (
    <div className="app">
      <Header
        view={view}
        snap={view === 'session' ? snap : null}
        mode={mode}
        exercise={exercise}
        athlete={athlete}
        onHome={() => setView('landing')}
        onExercise={(e) => {
          setExercise(e);
          setSelectedRep(null);
        }}
        onAthlete={setAthlete}
        onResearch={() => setResearch('method')}
        onLab={() => setResearch('lab')}
        onResetBaseline={resetBaseline}
      />

      {view === 'landing' ? (
        <Landing config={config} exercise={exercise} athlete={athlete} onDemo={() => startSession('demo')} onLive={() => startSession('live')} onLab={() => setResearch('lab')} />
      ) : (
        <main className="dashboard">
          <div className="stage-col">
            <CameraStage
              snap={snap}
              runner={runner}
              videoRef={videoRef}
              liveStatus={liveStatus}
              liveError={liveError}
              flash={flash}
              demoSpeed={demoSpeed}
              demoPaused={demoPaused}
              onDemoSpeed={(s) => {
                setDemoSpeed(s);
                if (runner instanceof DemoRunner) runner.speed = s;
              }}
              onDemoPause={() => {
                if (runner instanceof DemoRunner) {
                  runner.paused = !runner.paused;
                  setDemoPaused(runner.paused);
                }
              }}
              onDemoSkip={() => runner instanceof DemoRunner && runner.skipToEnd()}
              onRetryLive={() => startSession('live')}
              onSwitchToDemo={() => startSession('demo')}
            />
          </div>
          <aside className="side-col">
            <SidePanel
              snap={snap}
              mode={mode}
              selectedRep={selectedRep}
              onSelectRep={setSelectedRep}
              savedBaseline={mode === 'live' ? loadBaseline(exercise) : null}
              onStartCalibration={() => engine.startCalibration()}
              onFinishCalibration={() => engine.finishCalibration()}
              onUseSaved={() => {
                const b = loadBaseline(exercise);
                if (b) engine.useBaseline({ ...b, athlete });
              }}
              onStartMonitoring={() => engine.startMonitoring()}
              onEndSet={() => engine.endSet()}
              onStartRecovery={startRecovery}
              onShowSummary={() => setShowSummary(true)}
              onNewSet={newSet}
            />
          </aside>
          <section className="bottom">
            <div className="panel chart-card">
              <div className="chart-head">
                <h2>
                  Form drawdown
                  <small>Movement Drift Score per rep vs {athlete}'s personal baseline</small>
                </h2>
                <div className="legend">
                  <span><i className="box" style={{ background: 'rgba(46,229,157,0.35)' }} />your normal range</span>
                  <span><i className="box" style={{ background: '#2ee59d', opacity: 0.6 }} />per-rep drift</span>
                  <span><i style={{ background: '#e9eef6', height: 3 }} />smoothed drift (EWMA)</span>
                  <span><i style={{ background: '#ffb020' }} />warning</span>
                  <span><i style={{ background: '#ff4d5e' }} />breaking point</span>
                  <span><i style={{ background: '#a594ff' }} />CUSUM evidence</span>
                </div>
              </div>
              <FormDrawdown
                reps={snap.monitorReps}
                thresholds={snap.thresholds}
                cusumH={snap.config.cusumH}
                mode={snap.config.mode}
                alarmRep={snap.alarmRep}
                onsetRep={snap.onsetRep}
                exercise={exercise}
                selected={selectedRep}
                onSelect={setSelectedRep}
                height={185}
              />
              <div className="chart-caption">
                {snap.alarmRep !== null ? (
                  <>
                    <span>
                      <b className="c-break">BreakingPoint occurred at rep {snap.alarmRep}.</b> Drift began ≈ rep {snap.onsetRep}.
                    </span>
                    <span>
                      Primary changes: <b>{contrib.map((d) => `${specLabel(d.key)} ${arrow(d.zClipped ?? 0)}`).join(', ')}</b>
                    </span>
                  </>
                ) : snap.monitorReps.length ? (
                  <span>
                    No persistent drift yet · {snap.monitorReps.length} rep{snap.monitorReps.length > 1 ? 's' : ''} scored against your baseline.
                  </span>
                ) : (
                  <span className="muted">The chart fills in as monitored reps are completed. Hover or click a bar for its measurements.</span>
                )}
              </div>
              <div style={{ marginTop: 6 }}>
                <RepTimeline reps={snap.monitorReps} alarmRep={snap.alarmRep} selected={selectedRep} onSelect={setSelectedRep} maxScore={maxScore} />
              </div>
            </div>
          </section>
        </main>
      )}

      {showSummary && snap.summary && <SummaryModal snap={snap} onClose={() => setShowSummary(false)} onRecovery={startRecovery} onNewSet={newSet} />}
      {research && <ResearchModal config={config} initialTab={research} onClose={() => setResearch(null)} />}
      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}

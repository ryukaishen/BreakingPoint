import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clearBaseline, loadAthlete, loadBaseline, saveAthlete, saveBaseline } from './baseline/storage';
import { CameraStage } from './components/CameraStage';
import { FormDrawdown } from './components/FormDrawdown';
import { Header } from './components/Header';
import { Landing } from './components/Landing';
import { ProtocolLibrary } from './components/ProtocolLibrary';
import { RepTimeline } from './components/RepTimeline';
import { ResearchModal, type ResearchTab } from './components/ResearchModal';
import { SidePanel } from './components/SidePanel';
import { SportPage } from './components/SportPage';
import { SummaryModal } from './components/SummaryModal';
import { DEFAULT_DETECTOR_CONFIG, loadDetectorConfig, type DetectorConfig } from './detection/config';
import { heldReps, loadBestHeld, recordHeld, type HeldRecord } from './progress/records';
import { LabelProvider, makeLabeler } from './protocols/labels';
import { DEFAULT_LAUNCH, getSport, launchForExercise, resolveDemo, resolveLaunch, type LaunchContext } from './protocols/launch';
import { sessionPattern } from './protocols/patterns';
import { SessionEngine } from './session/engine';
import { DemoRunner, LiveRunner, type Runner } from './session/runners';
import { C } from './ui/theme';
import { arrow } from './utils/format';
import { useEngine } from './utils/hooks';

type View = 'landing' | 'sport' | 'session';
type Mode = 'demo' | 'live';

export default function App() {
  const [config, setConfig] = useState<DetectorConfig>(DEFAULT_DETECTOR_CONFIG);
  const [configReady, setConfigReady] = useState(false);
  const [view, setView] = useState<View>('landing');
  const [mode, setMode] = useState<Mode>('demo');
  const [launch, setLaunch] = useState<LaunchContext>(DEFAULT_LAUNCH);
  const [sportView, setSportView] = useState<{ sportId: string; subSportId?: string }>({ sportId: 'soccer' });
  const [athlete, setAthleteState] = useState(loadAthlete());
  const [sessionKey, setSessionKey] = useState(0);
  const [research, setResearch] = useState<ResearchTab | null>(null);
  const [library, setLibrary] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [selectedRep, setSelectedRep] = useState<number | null>(null);
  const [runner, setRunner] = useState<Runner | null>(null);
  const [liveStatus, setLiveStatus] = useState('');
  const [liveError, setLiveError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: string } | null>(null);
  const [demoSpeed, setDemoSpeed] = useState(2);
  const [demoPaused, setDemoPaused] = useState(false);
  /** Personal-best comparison for the last finished live set (null in demo mode). */
  const [heldRecord, setHeldRecord] = useState<HeldRecord | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const exercise = launch.exercise;

  useEffect(() => {
    loadDetectorConfig().then((c) => {
      setConfig(c);
      setConfigReady(true);
    });
  }, []);

  /** The single entry point into analysis — only launchable (READY/BETA) contexts get here. */
  const startSession = useCallback((m: Mode, ctx?: LaunchContext) => {
    if (ctx) setLaunch(ctx);
    setMode(m);
    setSelectedRep(null);
    setShowSummary(false);
    setLibrary(false);
    setHeldRecord(null);
    setSessionKey((k) => k + 1);
    setView('session');
  }, []);

  const openSport = useCallback((sportId: string, subSportId?: string) => {
    setSportView({ sportId, subSportId });
    setLibrary(false);
    setView('sport');
  }, []);

  // Presenter deep links:
  //   ?demo=soccer|volleyball|strength|pickleball      featured demo contexts
  //   ?sport=<id>[&sub=<id>][&protocol=<id>&demo=1]     sport page, or launch a protocol demo
  //   ?demo=1[&exercise=squat|cmj|lunge] · ?live=1      legacy links
  //   &speed=1|2|4 · &skip=1 · ?panel=lab|method|science|privacy|library
  const deepLink = useRef(new URLSearchParams(window.location.search));
  useEffect(() => {
    if (!configReady) return;
    const q = deepLink.current;
    const sp = Number(q.get('speed'));
    if ([1, 2, 4].includes(sp)) setDemoSpeed(sp);
    const demo = q.get('demo');
    const sport = q.get('sport');
    const protocol = q.get('protocol');
    if (sport && protocol) {
      const ctx = resolveLaunch(sport, protocol, q.get('sub') ?? undefined);
      if (ctx && (demo || q.get('live') === '1')) startSession(demo ? 'demo' : 'live', ctx);
      else if (getSport(sport)) openSport(sport, q.get('sub') ?? undefined);
    } else if (sport && getSport(sport)) openSport(sport, q.get('sub') ?? undefined);
    else if (demo && demo !== '1' && resolveDemo(demo)) startSession('demo', resolveDemo(demo)!);
    else if (demo === '1') startSession('demo', launchForExercise(q.get('exercise')));
    else if (q.get('live') === '1') startSession('live', launchForExercise(q.get('exercise')));
    const panel = q.get('panel');
    if (panel === 'lab' || panel === 'method' || panel === 'science' || panel === 'privacy') setResearch(panel);
    if (panel === 'library') setLibrary(true);
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
  const labeler = useMemo(() => makeLabeler(exercise, launch.featureLabels), [exercise, launch]);

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
    } else if (ev.type === 'baseline' || ev.type === 'recovery') {
      setToast({ text: ev.message, kind: 'milestone' });
    } else if (ev.type === 'discarded') {
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
    if (snap.phase === 'summary' && prevPhase.current === 'monitoring') {
      // Personal records come only from real camera sessions, never from the synthetic demo athlete.
      setHeldRecord(mode === 'live' && snap.monitorReps.length ? recordHeld(exercise, heldReps(snap.monitorReps)) : null);
      setShowSummary(true);
    }
    prevPhase.current = snap.phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const setAthlete = (name: string) => {
    setAthleteState(name);
    saveAthlete(name);
  };

  const newSet = () => {
    setShowSummary(false);
    setSelectedRep(null);
    setHeldRecord(null);
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
  const pattern = snap.alarmRep !== null ? sessionPattern(exercise, snap.monitorReps, snap.onsetRep, snap.baseline?.reference.sigma0, launch.patternLabels) : null;
  const sportForPage = getSport(sportView.sportId);
  // Best before the current set, so the live comparison is against the previous record.
  const bestHeld = mode === 'live' ? (heldRecord ? heldRecord.previousBest : loadBestHeld(exercise)) : null;

  return (
    <div className="app">
      <Header
        view={view}
        snap={view === 'session' ? snap : null}
        mode={mode}
        launch={launch}
        athlete={athlete}
        onHome={() => setView('landing')}
        onChangeProtocol={() => openSport(launch.sport.id, launch.subSport?.id)}
        onLibrary={() => setLibrary(true)}
        onAthlete={setAthlete}
        onResearch={() => setResearch('method')}
        onLab={() => setResearch('lab')}
        onResetBaseline={resetBaseline}
      />

      {view === 'landing' && (
        <Landing
          config={config}
          athlete={athlete}
          onSport={(id) => openSport(id)}
          onDemo={(id) => {
            const ctx = resolveDemo(id);
            if (ctx) startSession('demo', ctx);
          }}
          onLibrary={() => setLibrary(true)}
          onLab={() => setResearch('lab')}
        />
      )}

      {view === 'sport' && sportForPage && (
        <SportPage
          sport={sportForPage}
          subSportId={sportView.subSportId}
          onSubSport={(id) => setSportView({ sportId: sportForPage.id, subSportId: id })}
          onBack={() => setView('landing')}
          onDemo={(ctx) => startSession('demo', ctx)}
          onLive={(ctx) => startSession('live', ctx)}
          onLibrary={() => setLibrary(true)}
        />
      )}

      {view === 'session' && (
        <LabelProvider value={labeler}>
          <main className="dashboard">
            <div className="stage-col">
              <CameraStage
                snap={snap}
                launch={launch}
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
                launch={launch}
                selectedRep={selectedRep}
                onSelectRep={setSelectedRep}
                savedBaseline={mode === 'live' ? loadBaseline(exercise) : null}
                bestHeld={bestHeld}
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
                    <small>Drift per rep vs {athlete}'s personal baseline</small>
                  </h2>
                  <div className="legend">
                    <span><i className="box" style={{ background: C.stable, opacity: 0.3 }} />your normal range</span>
                    <span><i className="box" style={{ background: C.stable, opacity: 0.65 }} />per-rep drift</span>
                    <span><i style={{ background: C.text, height: 3 }} />smoothed drift (EWMA)</span>
                    <span><i style={{ background: C.drift }} />warning</span>
                    <span><i style={{ background: C.break }} />breaking point</span>
                    <span><i style={{ background: C.violet }} />CUSUM evidence</span>
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
                        {pattern && (
                          <>
                            {' '}
                            Pattern: <b>{pattern.label}</b>.
                          </>
                        )}
                      </span>
                      <span>
                        Primary changes: <b>{contrib.map((d) => `${labeler.short(d.key)} ${arrow(d.zClipped ?? 0)}`).join(', ')}</b>
                      </span>
                    </>
                  ) : snap.monitorReps.length ? (
                    <span>
                      No persistent drift yet. {snap.monitorReps.length} rep{snap.monitorReps.length > 1 ? 's' : ''} scored against your baseline.
                    </span>
                  ) : (
                    <span className="muted">The chart fills in as monitored reps are completed. Hover or click a bar for its measurements.</span>
                  )}
                </div>
                <RepTimeline reps={snap.monitorReps} alarmRep={snap.alarmRep} selected={selectedRep} onSelect={setSelectedRep} maxScore={maxScore} />
              </div>
            </section>
          </main>
          {showSummary && snap.summary && (
            <SummaryModal
              snap={snap}
              launch={launch}
              heldRecord={heldRecord}
              onClose={() => setShowSummary(false)}
              onRecovery={startRecovery}
              onNewSet={newSet}
            />
          )}
        </LabelProvider>
      )}

      {library && <ProtocolLibrary onClose={() => setLibrary(false)} onOpenSport={openSport} />}
      {research && <ResearchModal config={config} initialTab={research} onClose={() => setResearch(null)} />}
      {toast && (
        <div
          className={`sys-window toned toast ${toast.kind} ${toast.kind === 'break' ? 'tone-break' : toast.kind === 'milestone' ? 'tone-violet' : ''}`}
          role="status"
          aria-live="polite"
        >
          <span className="toast-mark" aria-hidden />
          {toast.text}
        </div>
      )}
    </div>
  );
}

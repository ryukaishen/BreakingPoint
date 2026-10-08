import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AthleteDialog } from './components/athletes/AthleteDialog';
import { AthleteMenu } from './components/athletes/AthleteMenu';
import { LegacyDialog } from './components/athletes/LegacyDialog';
import { CameraStage } from './components/CameraStage';
import { ConfirmDialog } from './components/ConfirmDialog';
import { FormDrawdown } from './components/FormDrawdown';
import { Header } from './components/Header';
import { Landing } from './components/Landing';
import { ProtocolLibrary } from './components/ProtocolLibrary';
import { RepTimeline } from './components/RepTimeline';
import { ResearchModal, type ResearchTab } from './components/ResearchModal';
import { SidePanel } from './components/SidePanel';
import { SportPage } from './components/SportPage';
import { SummaryModal } from './components/SummaryModal';
import { claimLegacyBaseline } from './data/migrate';
import { calibrationQuality } from './data/quality';
import { SAMPLE_ATHLETE_NAME } from './data/sample';
import { useAthleteData } from './data/useAthleteData';
import { DEFAULT_DETECTOR_CONFIG, loadDetectorConfig, type DetectorConfig } from './detection/config';
import { LabelProvider, makeLabeler } from './protocols/labels';
import { DEFAULT_LAUNCH, getSport, launchForExercise, resolveDemo, resolveLaunch, type LaunchContext } from './protocols/launch';
import { sessionPattern } from './protocols/patterns';
import { SessionEngine } from './session/engine';
import { DemoRunner, LiveRunner, type Runner } from './session/runners';
import { useSessionRecorder } from './session/useSessionRecorder';
import { C } from './ui/theme';
import { arrow } from './utils/format';
import { useEngine } from './utils/hooks';

type View = 'landing' | 'sport' | 'session';
type Mode = 'demo' | 'live';

type Dialog = { kind: 'add'; intro?: string } | { kind: 'rename' } | { kind: 'legacy' } | null;
type Confirm = { title: string; body: ReactNode; confirmLabel: string; onConfirm: () => void } | null;

/** Phases in which leaving would throw away work in progress. */
const ACTIVE_PHASES = new Set(['calibrating', 'monitoring', 'recovery']);

export default function App() {
  const data = useAthleteData();
  const [config, setConfig] = useState<DetectorConfig>(DEFAULT_DETECTOR_CONFIG);
  const [configReady, setConfigReady] = useState(false);
  const [view, setView] = useState<View>('landing');
  const [mode, setMode] = useState<Mode>('demo');
  const [launch, setLaunch] = useState<LaunchContext>(DEFAULT_LAUNCH);
  const [sportView, setSportView] = useState<{ sportId: string; subSportId?: string }>({ sportId: 'soccer' });
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
  const [dialog, setDialog] = useState<Dialog>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  /** A live launch waiting for the user to create their first athlete profile. */
  const pendingLive = useRef<LaunchContext | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const exercise = launch.exercise;

  // Live sets belong to a real athlete; demo sets always belong to the synthetic sample athlete.
  const sessionRepo = mode === 'live' ? data.real : data.repo;
  const sessionAthlete = mode === 'live' ? data.real.activeAthlete() : data.repo.activeAthlete();
  const athleteName = sessionAthlete?.name ?? (mode === 'demo' ? SAMPLE_ATHLETE_NAME : 'Athlete');

  useEffect(() => {
    loadDetectorConfig().then((c) => {
      setConfig(c);
      setConfigReady(true);
    });
  }, []);

  // One-time notices about stored data.
  useEffect(() => {
    if (!data.persistent) setToast({ text: 'Browser storage is unavailable, so sets will only be kept for this visit.', kind: 'break' });
    else if (data.migration.ran && data.migration.legacyBaselines > 0)
      setToast({ text: 'Found saved baselines from an earlier version. Review them in the athlete menu.', kind: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The single entry point into analysis — only launchable (READY/BETA) contexts get here. */
  const startSession = useCallback(
    (m: Mode, ctx?: LaunchContext) => {
      if (m === 'live') {
        if (data.scope === 'sample') data.setScope('real');
        if (!data.real.activeAthlete()) {
          pendingLive.current = ctx ?? launch;
          setDialog({ kind: 'add', intro: 'Live sets, baselines and records are saved to an athlete profile on this device. Who is training?' });
          return;
        }
      } else if (data.scope !== 'sample') data.setScope('sample');
      if (ctx) setLaunch(ctx);
      setMode(m);
      setSelectedRep(null);
      setShowSummary(false);
      setLibrary(false);
      setSessionKey((k) => k + 1);
      setView('session');
    },
    [data, launch],
  );

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
  const engine = useMemo(() => new SessionEngine(exercise, config, athleteName, mode), [exercise, mode, sessionKey]);
  const snap = useEngine(engine);
  const labeler = useMemo(() => makeLabeler(exercise, launch.featureLabels), [exercise, launch]);

  useEffect(() => engine.setConfig(config), [engine, config]);
  useEffect(() => engine.setAthlete(athleteName), [engine, athleteName]);

  const recorder = useSessionRecorder({
    snap,
    mode,
    repo: sessionRepo,
    athleteId: sessionAthlete?.id ?? null,
    launch,
    config,
    sessionKey,
    onSaved: data.refresh,
    onStorageError: (text) => setToast({ text, kind: 'break' }),
  });

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
    if (import.meta.env.DEV) (window as unknown as { __breakingpoint?: unknown }).__breakingpoint = { engine, runner: r, data };
    return () => {
      r.stop();
      setRunner(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, mode, engine, exercise, configReady]);

  // Event side-effects: toasts, breaking-point flash, baseline persistence
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
    // A freshly calibrated live baseline is saved for this athlete and this protocol only.
    const owner = data.real.activeAthlete();
    if (ev.type === 'baseline' && mode === 'live' && owner && snap.baseline && snap.calibrationReps.length) {
      const ok = data.real.saveBaseline({
        athleteId: owner.id,
        protocolId: launch.protocol.id,
        exercise,
        savedAt: new Date().toISOString(),
        baseline: snap.baseline,
        calibration: calibrationQuality(snap.baseline, config),
      });
      if (!ok) setToast({ text: 'The baseline could not be saved: browser storage is full or unavailable.', kind: 'break' });
      data.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.event]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
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
      const tag = (e.target as HTMLElement)?.tagName;
      if (!(runner instanceof DemoRunner) || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || confirm || dialog) return;
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
  }, [runner, confirm, dialog]);

  // ---------------------------------------------------------------- guarded actions
  const liveActive = view === 'session' && mode === 'live' && ACTIVE_PHASES.has(snap.phase);

  /** Run `action`, first asking for confirmation if it would abandon a live calibration, set or recovery check. */
  const guardLeave = (action: () => void) => {
    if (!liveActive) return action();
    const p = snap.phase;
    setConfirm({
      title: p === 'calibrating' ? 'Leave calibration?' : p === 'recovery' ? 'Leave the recovery check?' : 'End this set and leave?',
      body:
        p === 'calibrating' ? (
          <p>The calibration in progress will be discarded. Your saved baselines are not affected.</p>
        ) : p === 'recovery' ? (
          <p>Your set is already saved. This recovery check will not be recorded.</p>
        ) : (
          <p>The set ends now and is saved with the reps completed so far.</p>
        ),
      confirmLabel: p === 'monitoring' ? 'End set and leave' : 'Leave',
      onConfirm: () => {
        if (p === 'monitoring' && snap.monitorReps.length) engine.endSet();
        setShowSummary(false);
        action();
      },
    });
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

  const doResetBaseline = () => {
    const owner = data.real.activeAthlete();
    if (mode === 'live' && owner) {
      data.real.clearBaseline(owner.id, launch.protocol.id);
      data.refresh();
    }
    setSelectedRep(null);
    if (mode === 'demo') setSessionKey((k) => k + 1);
    else engine.resetBaseline();
  };

  const resetBaseline = () => {
    if (mode === 'demo') return doResetBaseline();
    setConfirm({
      title: 'Reset this baseline?',
      body: (
        <p>
          This deletes {athleteName}’s saved {launch.protocol.name.toLowerCase()} baseline on this device and starts a new calibration. Saved sets and records
          are kept.
        </p>
      ),
      confirmLabel: 'Reset baseline',
      onConfirm: doResetBaseline,
    });
  };

  const savedBaseline = mode === 'live' && sessionAthlete ? data.real.baseline(sessionAthlete.id, launch.protocol.id) : null;
  const maxScore = Math.max(1, ...snap.monitorReps.map((r) => r.drift?.score ?? 0));
  const contrib = snap.breakpointContributors?.slice(0, 3) ?? [];
  const pattern = snap.alarmRep !== null ? sessionPattern(exercise, snap.monitorReps, snap.onsetRep, snap.baseline?.reference.sigma0, launch.patternLabels) : null;
  const sportForPage = getSport(sportView.sportId);

  const athleteMenu = (
    <AthleteMenu
      scope={data.scope}
      athlete={data.scope === 'sample' ? data.repo.activeAthlete() : data.real.activeAthlete()}
      athletes={data.real.athletes()}
      legacyCount={data.real.legacy().length}
      locked={liveActive}
      onLockedAttempt={() => setToast({ text: 'Finish or end the set before switching athletes.', kind: '' })}
      onSwitch={(id) => {
        if (data.scope === 'sample') data.setScope('real');
        data.real.setActive(id);
        data.refresh();
        if (view === 'session') setView('landing');
      }}
      onAdd={() => setDialog({ kind: 'add' })}
      onRename={() => setDialog({ kind: 'rename' })}
      onLegacy={() => setDialog({ kind: 'legacy' })}
      onScope={(s) => {
        data.setScope(s);
        if (view === 'session') setView('landing');
      }}
    />
  );

  return (
    <div className="app">
      <Header
        view={view}
        snap={view === 'session' ? snap : null}
        mode={mode}
        launch={launch}
        athleteSlot={athleteMenu}
        onHome={() => guardLeave(() => setView('landing'))}
        onChangeProtocol={() => guardLeave(() => openSport(launch.sport.id, launch.subSport?.id))}
        onLibrary={() => setLibrary(true)}
        onResearch={() => setResearch('method')}
        onLab={() => setResearch('lab')}
        onResetBaseline={resetBaseline}
      />

      {data.scope === 'sample' && (
        <div className="sample-banner" role="note">
          <span>
            <b>Sample athlete.</b> Synthetic example data — does not affect your records.
          </span>
          <button className="link-btn" onClick={() => guardLeave(() => (data.setScope('real'), setView('landing')))}>
            Back to my data
          </button>
        </div>
      )}

      {view === 'landing' && (
        <Landing
          config={config}
          athlete={SAMPLE_ATHLETE_NAME}
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
                savedBaseline={savedBaseline?.baseline ?? null}
                bestHeld={recorder.bestBefore}
                onStartCalibration={() => engine.startCalibration()}
                onFinishCalibration={() => engine.finishCalibration()}
                onUseSaved={() => {
                  if (savedBaseline) engine.useBaseline({ ...savedBaseline.baseline, athlete: athleteName });
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
                    <small>Drift per rep vs {athleteName}'s personal baseline</small>
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
              outcome={recorder.outcome}
              onClose={() => setShowSummary(false)}
              onRecovery={startRecovery}
              onNewSet={newSet}
            />
          )}
        </LabelProvider>
      )}

      {library && <ProtocolLibrary onClose={() => setLibrary(false)} onOpenSport={(s, sub) => guardLeave(() => openSport(s, sub))} />}
      {research && <ResearchModal config={config} initialTab={research} onClose={() => setResearch(null)} />}

      {dialog?.kind === 'add' && (
        <AthleteDialog
          mode="create"
          intro={dialog.intro}
          onCancel={() => {
            pendingLive.current = null;
            setDialog(null);
          }}
          onSubmit={(name) => {
            const p = data.real.createAthlete(name);
            data.real.setActive(p.id);
            if (data.scope === 'sample') data.setScope('real');
            data.refresh();
            setDialog(null);
            const next = pendingLive.current;
            pendingLive.current = null;
            if (next) startSession('live', next);
          }}
        />
      )}
      {dialog?.kind === 'rename' && data.real.activeAthlete() && (
        <AthleteDialog
          mode="rename"
          initialName={data.real.activeAthlete()!.name}
          onCancel={() => setDialog(null)}
          onSubmit={(name) => {
            data.real.updateAthlete(data.real.activeAthlete()!.id, { name });
            data.refresh();
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'legacy' && (
        <LegacyDialog
          items={data.real.legacy()}
          athletes={data.real.athletes()}
          onAssign={(id, athleteId) => {
            const ok = claimLegacyBaseline(data.real, id, athleteId, config);
            setToast(ok ? { text: 'Baseline assigned.', kind: '' } : { text: 'That baseline could not be assigned.', kind: 'break' });
            data.refresh();
          }}
          onDiscard={(id) => {
            data.real.discardLegacy(id);
            data.refresh();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          confirmLabel={confirm.confirmLabel}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const c = confirm;
            setConfirm(null);
            c.onConfirm();
          }}
        >
          {confirm.body}
        </ConfirmDialog>
      )}

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

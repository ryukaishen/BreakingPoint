import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AthleteDialog } from './components/athletes/AthleteDialog';
import { AthleteMenu } from './components/athletes/AthleteMenu';
import { AthletesView, type Panel as AthletesPanel } from './components/athletes/AthletesView';
import { CameraStage } from './components/CameraStage';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Header } from './components/Header';
import { Landing } from './components/Landing';
import { ProtocolLibrary } from './components/ProtocolLibrary';
import { RecoveryDialog } from './components/RecoveryDialog';
import { ResearchModal, type ResearchTab } from './components/ResearchModal';
import { SessionAnnouncer } from './components/SessionAnnouncer';
import { Evidence } from './components/session/Evidence';
import { FocusPanel } from './components/session/FocusPanel';
import { SportPage } from './components/SportPage';
import { StatusView } from './components/status/StatusView';
import { SignalSpine } from './components/system/SignalSpine';
import { SystemNav } from './components/system/SystemNav';
import { PostWorkout } from './components/post/PostWorkout';
import { clearDraft, draftAthleteId, interruptedRecord, listDrafts, type SetDraft } from './data/draft';
import { browserStore } from './data/kv';
import { claimLegacyBaseline } from './data/migrate';
import { calibrationQuality } from './data/quality';
import { SAMPLE_ATHLETE_NAME } from './data/sample';
import { useAthleteData } from './data/useAthleteData';
import { DEFAULT_DETECTOR_CONFIG, loadDetectorConfig, type DetectorConfig } from './detection/config';
import { LabelProvider, makeLabeler } from './protocols/labels';
import { DEFAULT_LAUNCH, getSport, launchForExercise, resolveDemo, resolveLaunch, type LaunchContext } from './protocols/launch';
import { PROTOCOLS } from './protocols/protocols';
import { SessionEngine } from './session/engine';
import { exportCsv, exportJson } from './session/export';
import { postSetFromSession, type PostSection } from './session/postWorkout';
import { useNavGuard } from './session/useNavGuard';
import type { NavView } from './session/navGuard';
import { CameraError, cameraErrorText, DemoRunner, LiveRunner, type Runner } from './session/runners';
import { useSustained } from './session/useSustained';
import { workoutView, type CameraState } from './session/workoutView';
import { DemoControls } from './components/session/DemoControls';
import { TechnicalCorners } from './components/system/TechnicalCorners';
import { useSessionRecorder } from './session/useSessionRecorder';
import { useHandsFree } from './session/useHandsFree';
import { usePref } from './session/usePref';
import { useSetDraft } from './session/useSetDraft';
import { useVoiceCues, voiceAvailable } from './session/voice';
import { useEngine } from './utils/hooks';

type View = NavView;
type Mode = 'demo' | 'live';

type Dialog = { kind: 'add'; intro?: string } | { kind: 'rename' } | null;
type Confirm = { title: string; body: ReactNode; confirmLabel: string; bar?: string; code?: string; onConfirm: () => void } | null;

const NEEDS_PROFILE = 'Live sets, baselines and records are saved to an athlete profile on this device. Who is training?';
const STORAGE_FULL = 'browser storage is full or unavailable.';

/** Phases in which leaving would throw away work in progress. */
const ACTIVE_PHASES = new Set(['calibrating', 'monitoring', 'recovery']);

export default function App() {
  const data = useAthleteData();
  const [config, setConfig] = useState<DetectorConfig>(DEFAULT_DETECTOR_CONFIG);
  const [configReady, setConfigReady] = useState(false);
  const [view, setView] = useState<View>('landing');
  const [mode, setMode] = useState<Mode>('demo');
  const [launch, setLaunch] = useState<LaunchContext>(DEFAULT_LAUNCH);
  // The sport page's context: sport, discipline and selected movement. The library opens on it too.
  const [sportView, setSportView] = useState<{ sportId: string; subSportId?: string; protocolId?: string }>({ sportId: 'soccer' });
  const [sessionKey, setSessionKey] = useState(0);
  const [research, setResearch] = useState<ResearchTab | null>(null);
  const [library, setLibrary] = useState(false);
  /** Figma Make's post-workout system over the workout, once a set has ended (M5). */
  const [post, setPost] = useState<{ open: boolean; section: PostSection }>({ open: false, section: 'summary' });
  /** When the last set ended, for the rest timer before the recovery check. */
  const [restSince, setRestSince] = useState<number | null>(null);
  /** The History page's section (outside a session). */
  const [historySection, setHistorySection] = useState<PostSection>('history');
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const postHeading = useRef<HTMLHeadingElement>(null);
  const [selectedRep, setSelectedRep] = useState<number | null>(null);
  const [runner, setRunner] = useState<Runner | null>(null);
  const [liveStatus, setLiveStatus] = useState('');
  const [liveError, setLiveError] = useState<CameraState['error']>(null);
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: string } | null>(null);
  const [demoSpeed, setDemoSpeed] = useState(2);
  const [demoPaused, setDemoPaused] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  /** Which Athletes panel to open; the key remounts the page when asked again while it is showing. */
  const [athletesPanel, setAthletesPanel] = useState<{ panel: AthletesPanel; key: number }>({ panel: 'list', key: 0 });
  /** Bumped to bring the landing page's sport roster into view. */
  const [sportsRequest, setSportsRequest] = useState(0);
  /** Detector evidence under the athlete view: open by default in demos (people exploring), closed in live sets (an athlete at 3 m). */
  const [showEvidence, setShowEvidence] = useState(true);
  const [voiceOn, setVoiceOn] = usePref('bp.pref.voice', false);
  const [handsFreeOn, setHandsFreeOn] = usePref('bp.pref.handsFree', true);
  /** Live sets cut off by a refresh, crash or closed tab, waiting for the athlete to keep or discard them (oldest first). */
  const [recoveryQueue, setRecoveryQueue] = useState<SetDraft[]>([]);
  const draftKv = useMemo(() => browserStore(), []);
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
      setToast({ text: 'Found saved baselines from an earlier version. Review them on the Athletes page.', kind: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Work cut off by a refresh, crash or closed tab: offer what was really measured (see data/draft.ts).
  useEffect(() => {
    if (!data.persistent) return;
    const sets: SetDraft[] = [];
    let lostCalibration = false;
    for (const d of listDrafts(draftKv)) {
      const owner = draftAthleteId(d);
      if (!data.real.athlete(owner)) clearDraft(draftKv, owner); // the profile no longer exists: nothing to attach it to
      else if (d.kind === 'calibration') {
        clearDraft(draftKv, owner);
        lostCalibration = true;
      } else sets.push(d);
    }
    if (sets.length) setRecoveryQueue(sets);
    else if (lostCalibration)
      setToast({ text: 'Your last calibration was interrupted before it finished. Nothing was saved, and your saved baseline is unchanged.', kind: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The single entry point into analysis — only launchable (READY/BETA) contexts get here. */
  const startSession = useCallback(
    (m: Mode, ctx?: LaunchContext) => {
      if (m === 'live') {
        if (data.scope === 'sample') data.setScope('real');
        if (!data.real.activeAthlete()) {
          pendingLive.current = ctx ?? launch;
          setDialog({ kind: 'add', intro: NEEDS_PROFILE });
          return;
        }
      } else if (data.scope !== 'sample') data.setScope('sample');
      if (ctx) setLaunch(ctx);
      setMode(m);
      setShowEvidence(m === 'demo');
      setSelectedRep(null);
      setPost({ open: false, section: 'summary' });
      setRestSince(null);
      setLibrary(false);
      setSessionKey((k) => k + 1);
      setView('session');
    },
    [data, launch],
  );

  const openSport = useCallback((sportId: string, subSportId?: string, protocolId?: string) => {
    setSportView({ sportId, subSportId, protocolId });
    setLibrary(false);
    setView('sport');
  }, []);

  const openAthletes = useCallback((panel: AthletesPanel = 'list') => {
    setAthletesPanel((a) => ({ panel, key: a.key + 1 }));
    setLibrary(false);
    setView('athletes');
  }, []);

  // Presenter deep links:
  //   ?demo=soccer|volleyball|strength|pickleball      featured demo contexts
  //   ?sport=<id>[&sub=<id>][&protocol=<id>&demo=1]     sport page, or launch a protocol demo
  //   ?demo=1[&exercise=squat|cmj|lunge] · ?live=1      legacy links
  //   ?status=1 · ?history=1 [&sample=1]                status or session history (sample athlete)
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
      else if (getSport(sport)) openSport(sport, q.get('sub') ?? undefined, protocol);
    } else if (sport && getSport(sport)) openSport(sport, q.get('sub') ?? undefined);
    else if (demo && demo !== '1' && resolveDemo(demo)) startSession('demo', resolveDemo(demo)!);
    else if (demo === '1') startSession('demo', launchForExercise(q.get('exercise')));
    else if (q.get('live') === '1') startSession('live', launchForExercise(q.get('exercise')));
    else if (q.get('status') === '1' || q.get('history') === '1') {
      if (q.get('sample') === '1') data.setScope('sample');
      setView(q.get('history') === '1' ? 'history' : 'status');
    }
    const panel = q.get('panel');
    if (panel === 'lab' || panel === 'method' || panel === 'realworld' || panel === 'science' || panel === 'privacy') setResearch(panel);
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

  // Checkpoint a live set after every rep so an accidental refresh or close can be recovered (data/draft.ts).
  const draft = useSetDraft({
    snap,
    mode,
    kv: draftKv,
    persistent: data.persistent,
    athleteId: sessionAthlete?.id ?? null,
    launch,
    config,
    active: view === 'session',
    blocked: recoveryQueue.length > 0,
  });

  // Frame source lifecycle (sessions start only once the Lab config is loaded)
  useEffect(() => {
    if (view !== 'session' || !configReady) return;
    let r: Runner;
    let current = true; // a camera that fails after the session was left must not report into the next one
    setLiveError(null);
    if (mode === 'demo') {
      const d = new DemoRunner(engine, exercise);
      d.speed = demoSpeed;
      d.start();
      r = d;
    } else {
      const video = videoRef.current as HTMLVideoElement;
      const l = new LiveRunner(engine, video);
      l.start(
        (st) => current && setLiveStatus(st),
        () => current && setLiveError({ problem: 'stopped', text: '' }),
      ).catch((e: unknown) => {
        if (!current) return;
        setLiveError({ problem: e instanceof CameraError ? e.problem : 'other', text: cameraErrorText(e) });
        setLiveStatus('');
      });
      r = l;
    }
    setRunner(r);
    setDemoPaused(false);
    if (import.meta.env.DEV) (window as unknown as { __breakingpoint?: unknown }).__breakingpoint = { engine, runner: r, data };
    return () => {
      current = false;
      r.stop();
      setRunner(null);
      setLiveStatus('');
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
    const prev = prevPhase.current;
    // A set ended: the post-workout system opens on the next step, the recovery check after an alert.
    if (snap.phase === 'summary' && prev !== 'summary' && prev !== 'recovery' && prev !== 'recoveryDone') {
      setRestSince(Date.now());
      setPost({ open: true, section: snap.alarmRep !== null ? 'recovery' : 'summary' });
    }
    if (snap.phase === 'recoveryDone' && prev === 'recovery') setPost({ open: true, section: 'recovery' });
    if (snap.phase !== 'summary' && snap.phase !== 'recovery' && snap.phase !== 'recoveryDone') setPost((x) => (x.open ? { ...x, open: false } : x));
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
      bar: p === 'calibrating' ? 'Calibration in progress' : p === 'recovery' ? 'Recovery check in progress' : 'Live set in progress',
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
        action();
      },
    });
  };

  // Browser Back/Forward, refresh and close get the same protection as the in-app buttons (session/navGuard.ts).
  useNavGuard({ view, setView, isProtected: liveActive, requestLeave: guardLeave, persist: draft.flush });

  /** Closes the post-workout system; focus goes to the session (the button that had it is gone). */
  const showWorkout = () => {
    setPost((x) => ({ ...x, open: false }));
    requestAnimationFrame(() => document.getElementById('main')?.focus());
  };

  const newSet = () => {
    showWorkout();
    setSelectedRep(null);
    if (mode === 'demo') setSessionKey((k) => k + 1);
    else engine.startMonitoring();
  };

  /** Starts the three-rep recovery check; its progress shows in the post-workout Recovery section. */
  const startRecovery = () => {
    setPost({ open: true, section: 'recovery' });
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
      bar: 'Reset baseline',
      code: 'Local records / permanent action',
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

  // ---------------------------------------------------------------- athletes
  /** Every profile change goes through the device repository; a failed write is reported, never ignored. */
  const createAthlete = (name: string): boolean => {
    try {
      const p = data.real.createAthlete(name);
      data.real.setActive(p.id);
    } catch {
      setToast({ text: `The athlete could not be saved: ${STORAGE_FULL}`, kind: 'break' });
      return false;
    }
    if (data.scope === 'sample') data.setScope('real');
    data.refresh();
    return true;
  };

  const renameAthlete = (id: string, name: string) => {
    if (!data.real.updateAthlete(id, { name })) setToast({ text: `The new name could not be saved: ${STORAGE_FULL}`, kind: 'break' });
    data.refresh();
  };

  const switchAthlete = (id: string) => {
    if (data.scope === 'sample') data.setScope('real');
    data.real.setActive(id);
    data.refresh();
  };

  const deleteAthlete = (a: { id: string; name: string }) => {
    if (liveActive) return; // the athlete of a running live set cannot be removed
    setConfirm({
      title: `Delete ${a.name}?`,
      bar: 'Delete athlete',
      code: 'Local records / permanent action',
      body: (
        <>
          <p>This deletes {a.name}’s baselines, sets and records from this device.</p>
          <p>This can’t be undone.</p>
        </>
      ),
      confirmLabel: 'Delete athlete',
      onConfirm: () => {
        if (!data.real.deleteAthlete(a.id)) {
          setToast({ text: `${a.name} could not be deleted: ${STORAGE_FULL}`, kind: 'break' });
          return;
        }
        clearDraft(draftKv, a.id);
        data.refresh();
        setToast({ text: `${a.name} was deleted from this device.`, kind: '' });
      },
    });
  };

  const exploreSample = () => {
    data.setScope('sample');
    setView('status');
  };

  const savedBaseline = mode === 'live' && sessionAthlete ? data.real.baseline(sessionAthlete.id, launch.protocol.id) : null;
  // Hands-free runs only in a live set with the camera working and nothing else asking for attention.
  const handsFree = mode === 'live' && handsFreeOn;
  const countdown = useHandsFree(
    engine,
    snap,
    view === 'session' && handsFree && runner instanceof LiveRunner && !liveError && !confirm && !dialog && !post.open && !recoveryQueue.length,
  );
  useVoiceCues(snap, view === 'session' && voiceOn);
  const canSpeak = voiceAvailable();
  // The live workout screen (Make's M4) is a projection of the real session: see session/workoutView.ts.
  // Tracking counts as lost only after a second without the athlete, so one dropped frame does not flash it.
  const trackingLost = useSustained(
    view === 'session' && mode === 'live' && !liveError && !liveStatus && !snap.live.present && (snap.phase === 'calibrating' || snap.phase === 'monitoring'),
    1000,
  );
  // A stray pose from an empty room lasts a frame or two; the screen shows an athlete once presence holds.
  const athleteInView = useSustained(view === 'session' && mode === 'live' && snap.live.present, 500);
  const freshCalibration = useMemo(
    () => (snap.baseline && snap.calibrationReps.length ? calibrationQuality(snap.baseline, config) : null),
    [snap.baseline, snap.calibrationReps.length, config],
  );
  const workout = workoutView(snap, {
    mode,
    camera: { status: liveStatus, error: liveError },
    trackingLost,
    calibration: freshCalibration,
    handsFree,
    athleteInView: mode === 'live' ? athleteInView : undefined,
  });

  // ---------------------------------------------------------------- post-workout system (M5)
  // The set this session just finished, as Recovery and Summary show it (session/postWorkout.ts).
  const postSet = useMemo(
    () => postSetFromSession(snap, launch, recorder),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap.summary, snap.recovery, snap.recoveryReps, snap.thresholds, recorder.record, recorder.outcome, launch],
  );
  const recoveryScores = useMemo(() => snap.recoveryReps.map((r) => r.drift?.score ?? null), [snap.recoveryReps]);
  // During a live recovery check the camera sits under the post-workout system: say when it loses the athlete.
  const recoveryLost = useSustained(view === 'session' && mode === 'live' && !liveError && !liveStatus && !snap.live.present && snap.phase === 'recovery', 1000);
  const recoveryCapture =
    mode === 'live'
      ? {
          label: workout.quality.label,
          problem: liveError
            ? 'The camera stopped. Open the camera to try again.'
            : recoveryLost
              ? 'Tracking lost. Step back into the frame with your whole body visible. Reps without a clear view are not scored.'
              : null,
        }
      : null;
  const sessionRecords = useMemo(
    () => (sessionAthlete ? sessionRepo.sessions(sessionAthlete.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionRepo, sessionAthlete?.id, data.version, recorder.record],
  );
  const historyRecords = useMemo(
    () => (data.athlete ? data.repo.sessions(data.athlete.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.repo, data.athlete?.id, data.version],
  );
  const notifyExport = (name: string) => setExportNotice(`Export saved to your downloads: ${name}`);
  useEffect(() => {
    if (!exportNotice) return;
    const id = setTimeout(() => setExportNotice(null), 6000);
    return () => clearTimeout(id);
  }, [exportNotice]);
  // Keyboard and screen-reader users land on the post-workout system when it opens.
  useEffect(() => {
    if (post.open && view === 'session') postHeading.current?.focus();
  }, [post.open, view]);

  const openHistory = useCallback(() => {
    setLibrary(false);
    setHistorySection('history');
    setView('history');
  }, []);
  /** Make's DEMO / LIVE switch: the same movement, started again from the other source. */
  const switchSource = (next: Mode) => {
    if (next === mode) return;
    if (next === 'live') startSession('live', launch);
    else guardLeave(() => startSession('demo', launch));
  };

  const toggleEvidence = () => {
    const next = !showEvidence;
    setShowEvidence(next);
    if (next)
      requestAnimationFrame(() =>
        document.getElementById('evidence')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }),
      );
  };
  const sportForPage = getSport(sportView.sportId);
  const openSports = () => openSport(sportView.sportId, sportView.subSportId, sportView.protocolId);
  // The current athlete's saved baselines (protocol id to save date), shown on the movement cards.
  // Live sets offer to reuse them; the sample athlete has none of its own.
  const savedBaselines = (): Record<string, string> => {
    const athlete = data.scope === 'real' ? data.real.activeAthlete() : null;
    if (!athlete) return {};
    return Object.fromEntries(
      Object.keys(PROTOCOLS).flatMap((id) => {
        const b = data.real.baseline(athlete.id, id);
        return b ? [[id, b.savedAt]] : [];
      }),
    );
  };

  // Each view names itself for screen readers, tabs and history.
  useEffect(() => {
    document.title =
      view === 'landing'
        ? 'BreakingPoint'
        : view === 'status'
          ? 'Status | BreakingPoint'
          : view === 'athletes'
            ? 'Athletes | BreakingPoint'
          : view === 'sport'
            ? `${sportForPage?.name ?? 'Sport'} | BreakingPoint`
            : `${launch.contextName}: ${launch.title} | BreakingPoint`;
  }, [view, launch, sportForPage]);

  const pendingRecovery = recoveryQueue[0] ?? null;

  const athleteMenu = (
    <AthleteMenu
      scope={data.scope}
      athlete={data.scope === 'sample' ? data.repo.activeAthlete() : data.real.activeAthlete()}
      athletes={data.real.athletes()}
      legacyCount={data.real.legacy().length}
      locked={liveActive}
      onSwitch={(id) => {
        switchAthlete(id);
        if (view === 'session') setView('landing');
      }}
      onAdd={() => setDialog({ kind: 'add' })}
      onRename={() => setDialog({ kind: 'rename' })}
      onManage={() => guardLeave(() => openAthletes())}
      onLegacy={() => guardLeave(() => openAthletes('migration'))}
      onScope={(s) => {
        data.setScope(s);
        if (view === 'session') setView('landing');
      }}
    />
  );

  // During a session the toast sits inside the camera column (see styles-session.css), so it
  // never covers the camera's bottom overlays or the side panel's controls.
  const toastEl = toast && (
    <div
      className={`sys-window toned toast ${toast.kind} ${toast.kind === 'break' ? 'tone-break' : toast.kind === 'milestone' ? 'tone-violet' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="toast-mark" aria-hidden />
      {toast.text}
    </div>
  );

  return (
    <div className="app">
      {/* Focuses <main> directly instead of navigating to #main, so it never adds a history entry (see session/navGuard.ts). */}
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          const main = document.getElementById('main');
          main?.focus();
          main?.scrollIntoView();
        }}
      >
        Skip to main content
      </a>
      <Header
        view={view}
        snap={view === 'session' ? snap : null}
        mode={mode}
        launch={launch}
        athleteSlot={athleteMenu}
        onHome={() => guardLeave(() => setView('landing'))}
        onStatus={() => guardLeave(() => setView('status'))}
        onAthletes={() => guardLeave(() => openAthletes())}
        onChangeProtocol={() => guardLeave(() => openSport(launch.sport.id, launch.subSport?.id, launch.protocol.id))}
        onLibrary={() => setLibrary(true)}
        onResearch={() => setResearch('method')}
        onLab={() => setResearch('lab')}
        onHistory={() => guardLeave(openHistory)}
        onResetBaseline={resetBaseline}
      />

      {data.scope === 'sample' && (
        <div className="sample-banner" role="note">
          <span>
            <b>Sample athlete.</b> Synthetic data, held in memory and never saved to your records.
          </span>
          <button className="link-btn" onClick={() => guardLeave(() => (data.setScope('real'), setView('landing')))}>
            Back to my data
          </button>
        </div>
      )}

      {view === 'status' && (
        <StatusView
          scope={data.scope}
          athleteName={data.athlete?.name ?? null}
          sessions={data.athlete ? data.repo.sessions(data.athlete.id) : []}
          baselines={data.athlete ? data.repo.baselines(data.athlete.id) : []}
          persistent={data.persistent}
          onAddAthlete={() => setDialog({ kind: 'add', intro: NEEDS_PROFILE })}
          onBrowse={() => guardLeave(() => setView('landing'))}
          onOpenSport={(sportId, subSportId) => guardLeave(() => openSport(sportId, subSportId))}
          onLive={(ctx) => guardLeave(() => startSession('live', ctx))}
          onDemo={(ctx) => guardLeave(() => startSession('demo', ctx))}
          onResearch={() => setResearch('method')}
          onAthletes={() => openAthletes()}
          onSports={openSports}
          onLibrary={() => setLibrary(true)}
          onHistory={openHistory}
        />
      )}

      {view === 'landing' && (
        <Landing
          config={config}
          athlete={SAMPLE_ATHLETE_NAME}
          sportsRequest={sportsRequest}
          onSport={(id) => openSport(id)}
          onDemo={(id) => {
            const ctx = resolveDemo(id);
            if (ctx) startSession('demo', ctx);
          }}
          onSample={exploreSample}
          onCamera={() => startSession('live', DEFAULT_LAUNCH)}
          onLibrary={() => setLibrary(true)}
          onHistory={openHistory}
          onLab={() => setResearch('lab')}
          onResearch={() => setResearch('method')}
          onStatus={() => setView('status')}
          onAthletes={() => openAthletes()}
          onSports={openSports}
        />
      )}

      {view === 'athletes' && (
        <AthletesView
          key={athletesPanel.key}
          initialPanel={athletesPanel.panel}
          scope={data.scope}
          athletes={data.real.athletes()}
          activeId={data.real.activeAthlete()?.id ?? null}
          summaries={Object.fromEntries(
            data.real.athletes().map((a) => [a.id, { sets: data.real.sessions(a.id).length, baselines: data.real.baselines(a.id).length }]),
          )}
          legacy={data.real.legacy()}
          persistent={data.persistent}
          onSwitch={switchAthlete}
          onCreate={createAthlete}
          onRename={renameAthlete}
          onDelete={deleteAthlete}
          onSample={exploreSample}
          onRealData={() => data.setScope('real')}
          onDemo={() => startSession('demo', resolveDemo('soccer')!)}
          onChooseMovement={() => {
            setView('landing');
            setSportsRequest((n) => n + 1);
          }}
          onAssignLegacy={(id, athleteId) => {
            const ok = claimLegacyBaseline(data.real, id, athleteId, config);
            setToast(ok ? { text: 'Baseline assigned.', kind: '' } : { text: 'That baseline could not be assigned.', kind: 'break' });
            data.refresh();
          }}
          onDiscardLegacy={(id) => {
            data.real.discardLegacy(id);
            data.refresh();
          }}
          onEntry={() => setView('landing')}
          onStatus={() => setView('status')}
          onResearch={() => setResearch('method')}
          onSports={openSports}
          onLibrary={() => setLibrary(true)}
          onHistory={openHistory}
        />
      )}

      {view === 'sport' && sportForPage && (
        <SportPage
          sport={sportForPage}
          subSportId={sportView.subSportId}
          protocolId={sportView.protocolId}
          savedBaselines={savedBaselines()}
          // A new sport or discipline opens on its first runnable movement, as in Make.
          onSport={(id) => setSportView({ sportId: id })}
          onSubSport={(id) => setSportView((v) => ({ sportId: v.sportId, subSportId: id }))}
          onSelect={(protocolId) => setSportView((v) => (v.protocolId === protocolId ? v : { ...v, protocolId }))}
          onDemo={(ctx) => startSession('demo', ctx)}
          onLive={(ctx) => startSession('live', ctx)}
          onLibrary={() => setLibrary(true)}
          onHistory={openHistory}
          onEntry={() => setView('landing')}
          onStatus={() => setView('status')}
          onAthletes={() => openAthletes()}
          onResearch={() => setResearch('method')}
        />
      )}

      {view === 'history' && (
        <div className="st-page post-page">
          <div className="threshold-environment" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <SystemNav
            current="history"
            onEntry={() => setView('landing')}
            onStatus={() => setView('status')}
            onSports={openSports}
            onProtocols={() => setLibrary(true)}
            onHistory={() => setHistorySection('history')}
            onAthletes={() => openAthletes()}
            onResearch={() => setResearch('method')}
          />
          <main className="threshold-canvas" id="main" tabIndex={-1}>
            <h1 className="visually-hidden">Session history</h1>
            <PostWorkout
              code={`Session telemetry / ${data.scope === 'sample' ? 'Synthetic sample athlete' : (data.athlete?.name ?? 'No athlete yet')}`}
              section={historySection}
              onSection={setHistorySection}
              onExit={() => setView('status')}
              current={null}
              recoveryActions={() => (
                <>
                  <button type="button" className="threshold-action post-primary" onClick={() => setHistorySection('summary')}>
                    Session summary
                  </button>
                  <button type="button" className="threshold-action post-action" onClick={() => setHistorySection('history')}>
                    Back to history
                  </button>
                </>
              )}
              summaryActions={
                <div className="post-actions">
                  <button type="button" className="threshold-action post-action" onClick={() => setHistorySection('history')}>
                    Open session history
                  </button>
                </div>
              }
              history={{
                scope: data.scope,
                onScope: (sc) => data.setScope(sc),
                athleteName: data.athlete?.name ?? null,
                records: historyRecords,
                config,
                preferredId: null,
                empty:
                  data.scope === 'real' && !data.athlete
                    ? {
                        code: 'No athlete on this device',
                        title: 'No stored history yet',
                        text: 'Add an athlete to record sets. Baselines and history stay on this device.',
                        actions: (
                          <>
                            <button type="button" className="threshold-action post-primary" onClick={() => setDialog({ kind: 'add', intro: NEEDS_PROFILE })}>
                              Add athlete
                            </button>
                            <button type="button" className="threshold-action post-action" onClick={() => data.setScope('sample')}>
                              Explore the sample athlete
                            </button>
                          </>
                        ),
                      }
                    : !historyRecords.length
                      ? {
                          code: `First session / ${data.athlete?.name ?? 'Athlete'}`,
                          title: 'Your first counted set starts the record line',
                          text: 'Sets you finish with the live camera appear here. A set must pass the calibration and capture-quality floors before it counts toward comparisons.',
                          actions: (
                            <button type="button" className="threshold-action post-primary" onClick={openSports}>
                              Choose a movement
                            </button>
                          ),
                        }
                      : null,
              }}
            />
          </main>
        </div>
      )}

      {view === 'session' && (
        <LabelProvider value={labeler}>
          <main
            className={`dashboard st-session workout-system workout-${workout.state} is-${mode}${mode === 'live' && snap.phase === 'monitoring' ? ' is-live-set' : ''}${post.open && postSet ? ' has-post' : ''}`}
            id="main"
            tabIndex={-1}
          >
            <h1 className="visually-hidden">
              {launch.contextName}: {launch.title}, {mode === 'demo' ? 'demo' : 'live'} session
            </h1>
            <SessionAnnouncer snap={snap} />
            {post.open && postSet && (
              <PostWorkout
                code={`Session telemetry / ${mode === 'demo' ? 'Synthetic sample athlete' : athleteName}`}
                section={post.section}
                onSection={(section) => setPost({ open: true, section })}
                headingRef={postHeading}
                headerActions={
                  mode === 'live' && snap.phase === 'recovery' ? (
                    <button type="button" className="threshold-action post-camera" onClick={showWorkout}>
                      View camera
                    </button>
                  ) : null
                }
                onExit={() => guardLeave(() => openSport(launch.sport.id, launch.subSport?.id, launch.protocol.id))}
                current={{
                  set: postSet,
                  phase: snap.phase,
                  liveScores: recoveryScores,
                  restSince,
                  labels: labeler,
                  exports: { onJson: () => notifyExport(exportJson(snap, launch)), onCsv: () => notifyExport(exportCsv(snap)) },
                }}
                capture={recoveryCapture}
                recoveryActions={(state) =>
                  state === 'rest' ? (
                    <>
                      <button type="button" className="threshold-action post-primary" onClick={startRecovery}>
                        Start recovery check (3 reps)
                      </button>
                      <button type="button" className="threshold-action post-action" onClick={() => setPost({ open: true, section: 'summary' })}>
                        Session summary
                      </button>
                    </>
                  ) : state === 'active' ? (
                    <button type="button" className="threshold-action post-action" onClick={() => setPost({ open: true, section: 'summary' })}>
                      Session summary
                    </button>
                  ) : state === 'insufficient' ? (
                    <>
                      <button type="button" className="threshold-action post-primary" onClick={startRecovery}>
                        Start the check again
                      </button>
                      {mode === 'live' && (
                        <button type="button" className="threshold-action post-action" onClick={showWorkout}>
                          View camera
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button type="button" className="threshold-action post-primary" onClick={() => setPost({ open: true, section: 'summary' })}>
                        Session summary
                      </button>
                      <button type="button" className="threshold-action post-action" onClick={newSet}>
                        New set
                      </button>
                    </>
                  )
                }
                summaryActions={
                  <div className="post-actions">
                    {snap.phase === 'summary' && snap.alarmRep !== null && !snap.recovery && (
                      <button type="button" className="threshold-action post-primary" onClick={() => setPost({ open: true, section: 'recovery' })}>
                        Continue to recovery
                      </button>
                    )}
                    <button type="button" className="threshold-action post-action" onClick={() => setPost({ open: true, section: 'history' })}>
                      Open session history
                    </button>
                    <button type="button" className="threshold-action post-action" onClick={newSet}>
                      New set
                    </button>
                  </div>
                }
                history={{
                  scope: mode === 'demo' ? 'sample' : 'real',
                  onScope: null,
                  athleteName: sessionAthlete?.name ?? athleteName,
                  records: sessionRecords,
                  config,
                  preferredId: recorder.record?.id ?? null,
                  empty: sessionRecords.length
                    ? null
                    : {
                        code: 'Nothing stored',
                        title: 'This set was not saved',
                        text: 'Browser storage was full or unavailable, so the set could not be added to the history. Summary still shows it for this visit.',
                      },
                }}
              />
            )}
            <div className="workout-stage">
              <div className="workout-backplane workout-backplane-a" aria-hidden="true" />
              <div className="workout-backplane workout-backplane-b" aria-hidden="true" />
              <div className="workout-shell">
                <TechnicalCorners />
                <header className="workout-header">
                  <div>
                    <span className="threshold-code">
                      {mode === 'demo' ? 'Demo session' : 'Live session'} / {launch.contextName} / {launch.title}
                    </span>
                    <strong>
                      Movement monitoring
                      {/* Shown on narrow phones, where the header chip drops its beta badge. */}
                      {launch.status === 'BETA' && <span className="status-badge beta workout-beta">beta</span>}
                    </strong>
                  </div>
                  <div className="workout-toggles session-options" role="group" aria-label="Session options">
                    <div className="workout-source" role="group" aria-label="Session source">
                      <button type="button" className="threshold-action" aria-pressed={mode === 'demo'} onClick={() => switchSource('demo')}>
                        Demo
                      </button>
                      <button type="button" className="threshold-action" aria-pressed={mode === 'live'} onClick={() => switchSource('live')}>
                        Live
                      </button>
                    </div>
                    {canSpeak && (
                      <button type="button" className="threshold-action" aria-pressed={voiceOn} onClick={() => setVoiceOn(!voiceOn)}>
                        Voice {voiceOn ? 'on' : 'off'}
                      </button>
                    )}
                    {mode === 'live' && (
                      <button
                        type="button"
                        className="threshold-action"
                        aria-pressed={handsFreeOn}
                        onClick={() => setHandsFreeOn(!handsFreeOn)}
                        title="Starts calibration and the set after a short countdown, and ends the set when you stand still. Every step can still be done by hand."
                      >
                        Hands-free {handsFreeOn ? 'on' : 'off'}
                      </button>
                    )}
                    <button type="button" className="threshold-action" aria-pressed={showEvidence} aria-controls="evidence" onClick={toggleEvidence}>
                      Evidence {showEvidence ? 'on' : 'off'}
                    </button>
                    <button
                      type="button"
                      className="threshold-action workout-exit"
                      aria-label="Exit session"
                      onClick={() => guardLeave(() => openSport(launch.sport.id, launch.subSport?.id, launch.protocol.id))}
                    >
                      Exit
                    </button>
                  </div>
                </header>
                <div className="workout-layout">
                  <div className="stage-col">
                    <CameraStage
                      snap={snap}
                      launch={launch}
                      runner={runner}
                      videoRef={videoRef}
                      view={workout}
                      flash={flash}
                      onRetryLive={() => guardLeave(() => startSession('live'))}
                      onSwitchToDemo={() => startSession('demo')}
                      onEndSet={mode === 'live' ? () => engine.endSet() : undefined}
                      evidence={showEvidence}
                      hidden={post.open && !!postSet}
                    />
                    {toastEl}
                  </div>
                  <aside className="side-col workout-command" aria-label="Session">
                    <FocusPanel
                      snap={snap}
                      mode={mode}
                      launch={launch}
                      view={workout}
                      bestHeld={recorder.bestBefore}
                      savedBaseline={savedBaseline}
                      countdown={countdown}
                      onStartCalibration={() => engine.startCalibration()}
                      onFinishCalibration={() => engine.finishCalibration()}
                      onUseSaved={() => {
                        if (savedBaseline) engine.useBaseline({ ...savedBaseline.baseline, athlete: athleteName });
                      }}
                      onStartMonitoring={() => engine.startMonitoring()}
                      onEndSet={() => engine.endSet()}
                      onOpenRecovery={() => setPost({ open: true, section: 'recovery' })}
                      onShowSummary={() => setPost({ open: true, section: 'summary' })}
                      onNewSet={newSet}
                      inactive={post.open}
                    />
                    {mode === 'demo' && (
                      <DemoControls
                        speed={demoSpeed}
                        paused={demoPaused}
                        onSpeed={(sp) => {
                          setDemoSpeed(sp);
                          if (runner instanceof DemoRunner) runner.speed = sp;
                        }}
                        onPause={() => {
                          if (runner instanceof DemoRunner) {
                            runner.paused = !runner.paused;
                            setDemoPaused(runner.paused);
                          }
                        }}
                        onSkip={() => runner instanceof DemoRunner && runner.skipToEnd()}
                      />
                    )}
                    <SignalSpine snapshot={snap} />
                  </aside>
                </div>
              </div>
            </div>
            {showEvidence && (
              <div className="evidence-row">
                <Evidence snap={snap} launch={launch} athleteName={athleteName} selectedRep={selectedRep} onSelectRep={setSelectedRep} />
              </div>
            )}
          </main>
        </LabelProvider>
      )}

      {library && (
        <ProtocolLibrary
          sportId={sportView.sportId}
          subSportId={sportView.subSportId}
          protocolId={sportView.protocolId}
          savedBaselines={savedBaselines()}
          onClose={() => setLibrary(false)}
          onOpenSport={(s, sub, protocol) => guardLeave(() => openSport(s, sub, protocol))}
          onDemo={(ctx) => guardLeave(() => startSession('demo', ctx))}
          onLive={(ctx) => guardLeave(() => startSession('live', ctx))}
        />
      )}
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
            if (!createAthlete(name)) return;
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
            renameAthlete(data.real.activeAthlete()!.id, name);
            setDialog(null);
          }}
        />
      )}
      {pendingRecovery && (
        <RecoveryDialog
          athleteName={data.real.athlete(pendingRecovery.record.athleteId)?.name ?? 'Athlete'}
          draft={pendingRecovery}
          onKeep={() => {
            // Never drop a draft that did not reach the history: if saving fails, keep asking.
            if (!data.real.saveSession(interruptedRecord(pendingRecovery))) {
              setToast({ text: 'That set could not be saved: browser storage is full or unavailable.', kind: 'break' });
              return;
            }
            clearDraft(draftKv, pendingRecovery.record.athleteId);
            setRecoveryQueue((q) => q.slice(1));
            data.refresh();
            setToast({ text: 'Interrupted set kept. It does not count toward records.', kind: '' });
          }}
          onDiscard={() => {
            clearDraft(draftKv, pendingRecovery.record.athleteId);
            setRecoveryQueue((q) => q.slice(1));
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          bar={confirm.bar}
          code={confirm.code}
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

      {view !== 'session' && toastEl}
      {exportNotice && (
        <div className="post-export-notice" role="status">
          {exportNotice}
          <button type="button" className="threshold-action" onClick={() => setExportNotice(null)}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

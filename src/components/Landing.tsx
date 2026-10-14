import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { DetectorConfig } from '../detection/config';
import { DemoController } from '../demo/demoController';
import { heldReps } from '../data/progress';
import { makeLabeler } from '../protocols/labels';
import { DEFAULT_LAUNCH, DEMO_CONTEXTS, protocolRefs, resolveDemo } from '../protocols/launch';
import { PROTOCOLS, type ProtocolStatus } from '../protocols/protocols';
import { SPORTS, type SportProfile } from '../protocols/sports';
import { studyHeadline } from '../research/studyHeadline';
import { SessionEngine, type Snapshot } from '../session/engine';
import { DISCLAIMER } from '../session/summary';
import { arrow } from '../utils/format';
import { SystemNav } from './system/SystemNav';
import { TechnicalCorners } from './system/TechnicalCorners';

interface Props {
  config: DetectorConfig;
  athlete: string;
  /** Bumped by the app to bring the sport roster into view (e.g. "Choose a movement" on the Athletes page). */
  sportsRequest?: number;
  onSport: (sportId: string) => void;
  onDemo: (demoId: string) => void;
  onSample: () => void;
  /** The live camera flow for DEFAULT_LAUNCH: athlete profile if needed, then camera set-up and calibration. */
  onCamera: () => void;
  onLibrary: () => void;
  onLab: () => void;
  onResearch: () => void;
  onStatus: () => void;
  onAthletes: () => void;
}

function readiness(sport: SportProfile): { ready: number; beta: number; roadmap: number } {
  const ids = new Set<string>();
  for (const sub of sport.subSports?.length ? sport.subSports : [undefined]) {
    for (const r of protocolRefs(sport, sub?.id)) ids.add(r.protocolId);
  }
  const statuses = [...ids].map((id) => PROTOCOLS[id].status as ProtocolStatus);
  return {
    ready: statuses.filter((s) => s === 'READY').length,
    beta: statuses.filter((s) => s === 'BETA').length,
    roadmap: statuses.filter((s) => s === 'COMING_SOON' || s === 'FUTURE').length,
  };
}

const STAGES = [
  ['Calibrate', 'Do five to eight controlled reps while you’re fresh. They set your usual form.'],
  ['Monitor', 'Every rep is compared with your usual form: depth, tempo, trunk angle and more.'],
  ['Detect', 'One odd rep has little effect. When changes repeat, an alert shows which measurements changed.'],
  ['Recover', 'After a rest, three reps show how close you are to your usual form again.'],
] as const;

const pad = (n: number) => String(n).padStart(2, '0');
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Make's ENTRY screen: what BreakingPoint does, a real demo result, and every way in. */
export function Landing(p: Props) {
  const [preview, setPreview] = useState<Snapshot | null>(null);
  const previewCtx = useMemo(() => resolveDemo('soccer'), []);
  const sportsHeading = useRef<HTMLHeadingElement>(null);

  // A real headless run of the soccer demo through the full pipeline (~0.1 s).
  useEffect(() => {
    if (!previewCtx) return;
    const id = setTimeout(() => {
      const engine = new SessionEngine(previewCtx.exercise, p.config, p.athlete, 'demo');
      const demo = new DemoController(engine, previewCtx.exercise);
      demo.stopAfterWarning = 1; // as in the app: the athlete stops after the warning
      demo.runToEnd(false);
      setPreview(engine.getSnapshot());
    }, 30);
    return () => clearTimeout(id);
  }, [p.config, p.athlete, previewCtx]);

  const toSports = () => {
    const h = sportsHeading.current;
    h?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    h?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (p.sportsRequest) toSports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.sportsRequest]);

  const study = studyHeadline(p.config.validation);
  const labels = previewCtx ? makeLabeler(previewCtx.exercise, previewCtx.featureLabels) : null;
  const featured = DEMO_CONTEXTS[0];
  const others = DEMO_CONTEXTS.slice(1).map((d) => ({ def: d, ctx: resolveDemo(d.id) })).filter((d) => d.ctx);

  const reps = preview?.monitorReps ?? [];
  const alarm = preview?.alarmRep ?? null;
  const onset = preview?.onsetRep ?? null;
  const scores = reps.map((r) => (r.drift?.score ?? null) as number | null);
  const top = Math.max(1e-9, ...scores.filter((s): s is number => s !== null));
  const changed = preview?.breakpointContributors?.slice(0, 3) ?? [];
  const chartLabel = preview
    ? `Form Change Score for each of the ${reps.length} reps in the demo set.${onset !== null ? ` Changes began around rep ${onset}.` : ''}${alarm !== null ? ` The alert triggered at rep ${alarm}.` : ''}`
    : '';

  return (
    <div className="landing st-page entry-page">
      <div className="threshold-environment" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <SystemNav current="landing" onEntry={() => window.scrollTo({ top: 0 })} onStatus={p.onStatus} onAthletes={p.onAthletes} onResearch={p.onResearch} />

      <main className="threshold-canvas entry-canvas" id="main" tabIndex={-1}>
        <div className="entry-view">
          <section className="hero entry-hero" aria-labelledby="entry-title">
            <div className="entry-backplane entry-backplane-cyan" aria-hidden="true" />
            <div className="entry-backplane entry-backplane-violet" aria-hidden="true" />
            <div className="entry-hero-copy">
              <span className="threshold-code">Entry / personal movement system</span>
              <h1 id="entry-title" className="entry-headline">
                <span>Your movement.</span> <strong>Your baseline.</strong>
              </h1>
              <p className="entry-lede">BreakingPoint learns how you move when you’re fresh, then tracks how your form changes throughout a workout.</p>
              <div className="entry-actions">
                <button type="button" className="threshold-action entry-primary" onClick={() => p.onDemo(featured.id)}>
                  Run the {resolveDemo(featured.id)?.contextName.toLowerCase()} demo <span>No webcam needed</span>
                </button>
                <div className="entry-demo-actions" role="group" aria-label="Other demos">
                  {others.map(({ def, ctx }) => (
                    <button key={def.id} type="button" className="threshold-action" onClick={() => p.onDemo(def.id)}>
                      <b>{ctx!.contextName}</b>
                      <small>
                        {def.label}
                        {ctx!.status === 'BETA' ? ' · beta' : ''}
                      </small>
                    </button>
                  ))}
                </div>
                <div className="entry-text-actions">
                  <button type="button" className="threshold-action" onClick={p.onSample}>
                    Explore the sample athlete <span aria-hidden="true">↗</span>
                    <small>Synthetic history, kept in memory</small>
                  </button>
                  <button type="button" className="threshold-action" onClick={p.onCamera}>
                    Start with your camera <span aria-hidden="true">↗</span>
                    <small>
                      {DEFAULT_LAUNCH.title}, with set-up checks first
                    </small>
                  </button>
                </div>
              </div>
            </div>

            <section className={`entry-live-window ${alarm !== null ? 'has-alert' : ''}`} aria-labelledby="entry-demo-title">
              <TechnicalCorners />
              <div className="entry-window-rail">
                <h2 id="entry-demo-title" className="threshold-code">
                  Synthetic athlete
                </h2>
                <span>
                  {previewCtx?.contextName} / {previewCtx?.title}
                </span>
              </div>
              {preview ? (
                <>
                  <div className="entry-readout">
                    <div>
                      <span>State</span>
                      <strong className={alarm !== null ? 'is-stop' : ''}>{alarm !== null ? 'STOP' : 'STABLE'}</strong>
                      <small>{alarm !== null ? `Alert at rep ${alarm}` : 'No alert in this set'}</small>
                    </div>
                    <div>
                      <span>Reps at usual form</span>
                      <strong>{pad(heldReps(preview.monitorReps))}</strong>
                      <small>of {reps.length} reps</small>
                    </div>
                    <div>
                      <span>Changes began</span>
                      <strong>
                        {onset !== null ? (
                          <>
                            <span aria-hidden="true">~</span>
                            <span className="visually-hidden">About rep </span>
                            {pad(onset)}
                          </>
                        ) : (
                          '—'
                        )}
                      </strong>
                      <small>{onset !== null ? 'estimated rep' : 'no lasting change'}</small>
                    </div>
                  </div>
                  <div className="entry-mini-chart">
                    <span>Form Change Score, rep by rep</span>
                    <div className="entry-bars" role="img" aria-label={chartLabel}>
                      {reps.map((r, i) => {
                        const s = scores[i];
                        const cls = r.index === alarm ? 'is-alert' : onset !== null && r.index >= onset ? 'is-changing' : '';
                        return (
                          <i
                            key={r.index}
                            className={`${cls} ${s === null ? 'is-unscored' : ''}`}
                            style={{ '--height': `${s === null ? 4 : Math.max(4, (Math.max(0, s) / top) * 100)}%`, '--i': i } as CSSProperties}
                          />
                        );
                      })}
                    </div>
                    <div className="entry-bar-labels" aria-hidden="true">
                      {reps.map((r) => (
                        <span key={r.index}>{pad(r.index)}</span>
                      ))}
                    </div>
                  </div>
                  <div className="entry-measurements">
                    <span>{changed.length ? 'Measurements that changed most at the alert' : 'Every rep is compared with this athlete’s usual form'}</span>
                    {changed.length > 0 && (
                      <ul>
                        {changed.map((d) => (
                          <li key={d.key}>
                            {labels!.short(d.key)} {arrow(d.zClipped ?? 0)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              ) : (
                <div className="entry-window-loading">Running the demo pipeline…</div>
              )}
            </section>
          </section>

          <section className="entry-session" aria-labelledby="flow-h">
            <div className="entry-section-heading">
              <span className="threshold-code">Session signal / 4 stages</span>
              <h2 id="flow-h">How a session runs</h2>
            </div>
            <ol className="entry-signal-spine">
              {STAGES.map(([name, text], i) => (
                <li key={name}>
                  <i aria-hidden="true" />
                  <span>{pad(i + 1)}</span>
                  <h3>{name}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
            <p className="entry-thesis">
              Most form apps ask whether you move like an ideal athlete. <b>BreakingPoint asks whether you still move like yourself.</b>
            </p>
          </section>

          <section className="entry-sports" id="entry-sports" aria-labelledby="roster-h">
            <div className="entry-section-heading entry-section-heading--split">
              <div>
                <span className="threshold-code">Protocol roster / {SPORTS.length} sports</span>
                <h2 id="roster-h" ref={sportsHeading} tabIndex={-1}>
                  Choose a sport
                </h2>
                <p>Each sport recommends movement screens. The method is the same for all of them: learn your usual form, then watch for lasting changes.</p>
              </div>
              <button type="button" className="threshold-action entry-quiet-action" onClick={p.onLibrary}>
                Browse the protocol library
              </button>
            </div>
            <ul className="entry-sports-grid">
              {SPORTS.map((s, i) => {
                const r = readiness(s);
                const launchable = r.ready + r.beta > 0;
                return (
                  <li key={s.id}>
                    <button type="button" className={`threshold-action ${launchable ? '' : 'is-roadmap'}`} onClick={() => p.onSport(s.id)}>
                      <span>{pad(i + 1)}</span>
                      <strong>{s.name}</strong>
                      <small>
                        {r.ready} ready · {r.beta} beta · {r.roadmap} roadmap
                      </small>
                    </button>
                  </li>
                );
              })}
              <li className="entry-locked-card">
                <span>Locked / roadmap</span>
                <strong>Create your own protocol</strong>
                <small>Record a few clean reps of any repeatable movement and track how later reps change.</small>
              </li>
            </ul>
          </section>

          <section className="entry-research-strip" aria-labelledby="research-strip-h">
            <div>
              <span className="threshold-code">Synthetic validation / UF HiPerGator</span>
              <h2 id="research-strip-h">Detector validation</h2>
              <button type="button" className="threshold-action entry-strip-link" onClick={p.onLab}>
                See the study <span aria-hidden="true">↗</span>
              </button>
            </div>
            {study ? (
              study.figures.map((f) => (
                <div key={f.label}>
                  <strong>{f.value}</strong>
                  <span>{f.label}</span>
                </div>
              ))
            ) : (
              <div className="entry-strip-empty">
                <span>Open the study for its results.</span>
              </div>
            )}
            <p>
              {study ? `Rates from the ${study.heldOutSessions.toLocaleString('en-US')} held-out sessions. ` : ''}Simulated side-view bodyweight squats, not real
              athletes or real cameras.
            </p>
          </section>

          <section className="entry-built" aria-labelledby="built-h">
            <div className="entry-section-heading">
              <span className="threshold-code">System specification</span>
              <h2 id="built-h">Built with</h2>
              <button type="button" className="threshold-action entry-quiet-action" onClick={p.onResearch}>
                How it works
              </button>
            </div>
            <ul>
              <li>React, TypeScript and Vite</li>
              <li>MediaPipe Pose, running in the browser</li>
              <li>Statistical change detection (EWMA and CUSUM) against each athlete’s own baseline</li>
              <li>Any laptop or phone camera. No wearables or force plates</li>
              <li>Athletes, baselines and sets stored only on this device</li>
            </ul>
          </section>
        </div>
      </main>

      <footer className="entry-footer">
        <span>{DISCLAIMER}</span>
        <span>Pose estimation runs in your browser. No video is uploaded or stored.</span>
      </footer>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import type { DetectorConfig } from '../detection/config';
import { DemoController } from '../demo/demoController';
import { heldReps } from '../progress/records';
import { makeLabeler } from '../protocols/labels';
import { DEMO_CONTEXTS, protocolRefs, resolveDemo } from '../protocols/launch';
import { sessionPattern } from '../protocols/patterns';
import { PRIMITIVES } from '../protocols/primitives';
import { PROTOCOLS, type ProtocolStatus } from '../protocols/protocols';
import { SPORTS, type SportProfile } from '../protocols/sports';
import { SessionEngine, type Snapshot } from '../session/engine';
import { DISCLAIMER } from '../session/summary';
import { arrow, pct } from '../utils/format';
import { FormDrawdown } from './FormDrawdown';
import { Camera, Chevron, Flask, Lock, Play } from './Icons';
import { SportIcon } from './SportIcons';

interface Props {
  config: DetectorConfig;
  athlete: string;
  onSport: (sportId: string) => void;
  onDemo: (demoId: string) => void;
  onLibrary: () => void;
  onLab: () => void;
}

function statusSummary(sport: SportProfile): { ready: number; beta: number; roadmap: number; primitives: string[] } {
  const ids = new Set<string>();
  for (const sub of sport.subSports?.length ? sport.subSports : [undefined]) {
    for (const r of protocolRefs(sport, sub?.id)) ids.add(r.protocolId);
  }
  const statuses = [...ids].map((id) => PROTOCOLS[id].status as ProtocolStatus);
  const primitives = [...new Set([...ids].map((id) => PROTOCOLS[id]).filter((p) => p.status === 'READY' || p.status === 'BETA').map((p) => PRIMITIVES[p.primitive].name))];
  return {
    ready: statuses.filter((s) => s === 'READY').length,
    beta: statuses.filter((s) => s === 'BETA').length,
    roadmap: statuses.filter((s) => s === 'COMING_SOON' || s === 'FUTURE').length,
    primitives,
  };
}

function RosterRow({ sport, onClick }: { sport: SportProfile; onClick: () => void }) {
  const s = statusSummary(sport);
  const subs = sport.subSports?.map((x) => x.name).join(', ');
  const launchable = s.ready + s.beta > 0;
  return (
    <li>
      <button className={`roster-row ${launchable ? '' : 'roadmap'}`} onClick={onClick}>
        <span className="sport-icon" aria-hidden>
          <SportIcon id={sport.icon} size={24} />
        </span>
        <span className="rr-body">
          <span className="rr-name">{sport.name}</span>
          <span className="rr-desc">{sport.descriptor}</span>
          {subs && <span className="rr-subs">{subs}</span>}
        </span>
        <span className="rr-side">
          {s.ready > 0 && <span className="status-badge ready">{s.ready} ready</span>}
          {s.beta > 0 && <span className="status-badge beta">{s.beta} beta</span>}
          {!launchable && (
            <span className="status-badge soon">
              <Lock size={10} /> roadmap
            </span>
          )}
          <Chevron size={16} className="rr-chev" aria-hidden />
        </span>
      </button>
    </li>
  );
}

const FLOW = [
  ['Calibrate', 'A few fresh reps of your sport’s protocol. BreakingPoint learns your per-feature median and spread: your baseline, not an “ideal” athlete.'],
  ['Monitor', 'On-device pose estimation scores every rep with a transparent Movement Drift Score: how far it sits from your own baseline.'],
  ['Detect', 'Sequential EWMA / CUSUM detection ignores one-off bad reps, flags persistent drift, and names what changed.'],
  ['Recover', 'After rest, a three-rep check measures how far your movement has returned toward your original baseline.'],
] as const;

export function Landing({ config, athlete, onSport, onDemo, onLibrary, onLab }: Props) {
  const [preview, setPreview] = useState<Snapshot | null>(null);
  const previewCtx = useMemo(() => resolveDemo('soccer'), []);

  // A real headless run of the soccer demo through the full pipeline (~0.1 s).
  useEffect(() => {
    if (!previewCtx) return;
    const id = setTimeout(() => {
      const engine = new SessionEngine(previewCtx.exercise, config, athlete, 'demo');
      new DemoController(engine, previewCtx.exercise).runToEnd(false);
      setPreview(engine.getSnapshot());
    }, 30);
    return () => clearTimeout(id);
  }, [config, athlete, previewCtx]);

  const v = config.validation;
  const validated = v && Number.isFinite(v.numSessions);
  const labels = previewCtx ? makeLabeler(previewCtx.exercise, previewCtx.featureLabels) : null;
  const pattern =
    preview && previewCtx ? sessionPattern(previewCtx.exercise, preview.monitorReps, preview.onsetRep, preview.baseline?.reference.sigma0, previewCtx.patternLabels) : null;
  const top = preview?.breakpointContributors?.slice(0, 3) ?? [];
  const featured = DEMO_CONTEXTS[0];
  const others = DEMO_CONTEXTS.slice(1);
  const alarm = preview?.alarmRep ?? null;

  return (
    <div className="landing">
      <section className="section hero">
        <div>
          <h1>
            <span>Your movement.</span>
            <span className="base">Your baseline.</span>
          </h1>
          <p className="lead">BreakingPoint learns how you move when fresh and detects when that movement begins to change.</p>
          <p className="lead-2">Different athletes move differently. BreakingPoint compares you to you.</p>
          <div className="hero-actions">
            <button className="btn primary lg" onClick={() => onDemo(featured.id)}>
              <Play size={13} /> Run the {resolveDemo(featured.id)?.contextName.toLowerCase()} demo
            </button>
            <div className="demo-more">
              <span className="lbl">Other demos</span>
              {others.map((d) => (
                <button key={d.id} onClick={() => onDemo(d.id)}>
                  <b>{resolveDemo(d.id)?.contextName}</b>
                  {d.label.toLowerCase()}
                </button>
              ))}
            </div>
          </div>
          <ul className="hero-facts">
            <li>
              <Lock size={14} /> Video never leaves your device
            </li>
            <li>
              <Camera size={14} /> Any laptop or phone camera. No wearables, no force plates.
            </li>
          </ul>
        </div>

        <div className={`sys-window toned hero-window ${alarm !== null ? 'tone-break' : ''}`}>
          <div className="hw-head">
            <span className="eyebrow">
              {previewCtx?.contextName} / {previewCtx?.title}
            </span>
            <span className="badge demo">Synthetic athlete</span>
          </div>
          {preview ? (
            <>
              <div className="hw-readout">{alarm !== null ? `Breaking point · rep ${alarm}` : 'Stable'}</div>
              <div className="hw-stats">
                <div className="hw-stat">
                  <div className="k">Held baseline</div>
                  <div className="v">{heldReps(preview.monitorReps)} reps</div>
                </div>
                <div className="hw-stat">
                  <div className="k">Drift onset</div>
                  <div className="v">{preview.onsetRep !== null ? `≈ rep ${preview.onsetRep}` : '—'}</div>
                </div>
                <div className="hw-stat">
                  <div className="k">Pattern</div>
                  <div className="v" title={pattern?.explain}>
                    {pattern?.label ?? '—'}
                  </div>
                </div>
              </div>
              <FormDrawdown
                reps={preview.monitorReps}
                thresholds={preview.thresholds}
                cusumH={config.cusumH}
                mode={config.mode}
                alarmRep={preview.alarmRep}
                onsetRep={preview.onsetRep}
                exercise={previewCtx!.exercise}
                height={190}
                compact
              />
              <div className="hw-caption">
                {top.length > 0 ? (
                  <>
                    Primary changes: <b>{top.map((d) => `${labels!.short(d.key)} ${arrow(d.zClipped ?? 0)}`).join(', ')}</b>
                  </>
                ) : (
                  'Every rep is scored against the athlete’s own baseline.'
                )}
              </div>
            </>
          ) : (
            <div className="hw-loading">Running the demo pipeline…</div>
          )}
        </div>
      </section>

      <section className="section flow" aria-labelledby="flow-h">
        <div className="section-head">
          <h2 id="flow-h">How a session runs</h2>
          <p>The same four stages track your progress at the top of every session.</p>
        </div>
        <ol className="flow-track">
          {FLOW.map(([name, text], i) => (
            <li key={name} className="flow-stage">
              <span className="track-node" aria-hidden />
              <span className="flow-n">Stage {i + 1}</span>
              <h3>{name}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section roster" aria-labelledby="roster-h">
        <div className="roster-intro">
          <h2 id="roster-h">What do you play?</h2>
          <p>Choose a sport and BreakingPoint will recommend a movement protocol.</p>
          <button className="btn" onClick={onLibrary}>
            Browse the protocol library
          </button>
          <div className="locked-card">
            <div className="lc-head">
              <span className="lc-title">
                <Lock size={14} /> Create your own protocol
              </span>
              <span className="status-badge soon">Roadmap</span>
            </div>
            <p>Record a few clean reps of any repeatable movement. BreakingPoint learns the athlete’s movement distribution and monitors future reps for persistent drift.</p>
          </div>
        </div>
        <ul className="roster-list">
          {SPORTS.map((s) => (
            <RosterRow key={s.id} sport={s} onClick={() => onSport(s.id)} />
          ))}
        </ul>
      </section>

      <section className="section thesis">
        <div className="thesis-q">
          <p className="q-old">
            <span className="eyebrow">Most form apps ask</span>
            <span className="q">Do you move like the ideal athlete?</span>
          </p>
          <p className="q-new">
            <span className="eyebrow">BreakingPoint asks</span>
            <span className="q">Are you still moving like yourself?</span>
          </p>
        </div>
        <button className="sys-window lab-readout" onClick={onLab}>
          <span className="lr-head">
            <Flask size={14} /> BreakingPoint Lab: detector validation
          </span>
          {validated ? (
            <span className="lr-stats">
              <span className="lr-stat">
                <span className="v">{v!.numSessions!.toLocaleString()}</span>
                <span className="k">simulated sessions</span>
              </span>
              <span className="lr-stat">
                <span className="v">{pct(v!.falsePositiveRate)}</span>
                <span className="k">false alarms (held-out)</span>
              </span>
              <span className="lr-stat">
                <span className="v">{pct(v!.truePositiveRate)}</span>
                <span className="k">drift detected</span>
              </span>
              <span className="lr-stat">
                <span className="v">{v!.medianDetectionDelay} reps</span>
                <span className="k">median detection delay</span>
              </span>
            </span>
          ) : (
            <span className="lr-stats">Run the Lab to calibrate the detector.</span>
          )}
          <span className="lr-foot">
            One validated detector shared by every protocol. <b>Open the Lab report</b>
          </span>
        </button>
      </section>

      <footer className="section site-foot">
        <span>{DISCLAIMER}</span>
        <span>Pose estimation runs in your browser. No video is uploaded or stored.</span>
      </footer>
    </div>
  );
}

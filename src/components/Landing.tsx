import { useEffect, useMemo, useState } from 'react';
import type { DetectorConfig } from '../detection/config';
import { DemoController } from '../demo/demoController';
import { makeLabeler } from '../protocols/labels';
import { DEMO_CONTEXTS, protocolRefs, resolveDemo } from '../protocols/launch';
import { sessionPattern } from '../protocols/patterns';
import { PRIMITIVES } from '../protocols/primitives';
import { PROTOCOLS, type ProtocolStatus } from '../protocols/protocols';
import { SPORTS, type SportProfile } from '../protocols/sports';
import { SessionEngine, type Snapshot } from '../session/engine';
import { pct } from '../utils/format';
import { FormDrawdown } from './FormDrawdown';
import { Cpu, Flask, Lock, Play } from './Icons';
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

function SportCard({ sport, onClick, compact }: { sport: SportProfile; onClick: () => void; compact?: boolean }) {
  const s = statusSummary(sport);
  const subs = sport.subSports?.map((x) => x.name).join(' · ');
  return (
    <button className={`sport-card ${compact ? 'compact' : ''}`} onClick={onClick}>
      <span className="sport-icon">
        <SportIcon id={sport.icon} size={compact ? 24 : 30} />
      </span>
      <span className="sport-body">
        <span className="sport-name">{sport.name}</span>
        <span className="sport-desc">{sport.descriptor}</span>
        {!compact && subs && <span className="sport-subs">{subs}</span>}
      </span>
      <span className="sport-meta">
        {s.ready > 0 && <span className="status-badge ready">{s.ready} ready</span>}
        {s.beta > 0 && <span className="status-badge beta">{s.beta} beta</span>}
        {s.ready + s.beta === 0 && <span className="status-badge soon">roadmap</span>}
        {!compact && s.primitives.length > 0 && <span className="prim-tag">{s.primitives.join(' · ')}</span>}
      </span>
    </button>
  );
}

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
  const primary = SPORTS.filter((s) => s.tier === 'primary');
  const secondary = SPORTS.filter((s) => s.tier === 'secondary');

  return (
    <div className="landing">
      <section className="hero">
        <div>
          <div className="eyebrow">BreakingPoint · personalized movement monitoring for athletes</div>
          <h1>
            Your movement.
            <br />
            Your <span className="yours">baseline.</span>
          </h1>
          <p className="lead">BreakingPoint learns how you move when fresh and detects when that movement begins to change.</p>
          <p className="lead-strong">Different athletes move differently. BreakingPoint compares you to you.</p>
          <div className="demo-row">
            <span className="demo-row-label">
              <Play size={12} /> Run a demo
            </span>
            {DEMO_CONTEXTS.map((d) => {
              const ctx = resolveDemo(d.id);
              return (
                <button key={d.id} className="demo-chip" onClick={() => onDemo(d.id)}>
                  <b>{ctx?.contextName}</b> {d.label}
                </button>
              );
            })}
          </div>
          <div className="hero-note">
            <span>
              <Lock size={13} /> Video never leaves your device
            </span>
            <span>
              <Cpu size={13} /> Any laptop or phone camera · no wearables · no force plates
            </span>
          </div>
        </div>
        <div className="hero-card">
          <div className="hc-title">
            <span className="eyebrow">Form drawdown · soccer demo</span>
            <span className="badge demo">
              <span className="dot" /> synthetic athlete
            </span>
          </div>
          {preview ? (
            <FormDrawdown
              reps={preview.monitorReps}
              thresholds={preview.thresholds}
              cusumH={config.cusumH}
              mode={config.mode}
              alarmRep={preview.alarmRep}
              onsetRep={preview.onsetRep}
              exercise={previewCtx!.exercise}
              height={200}
              compact
            />
          ) : (
            <div style={{ height: 200 }} className="muted">
              Running demo pipeline…
            </div>
          )}
          <div className="hc-caption">
            {preview?.alarmRep ? (
              <>
                <b className="c-break">Breaking point at rep {preview.alarmRep}</b>
                {pattern && (
                  <>
                    {' '}
                    · pattern <b>{pattern.label}</b>
                  </>
                )}{' '}
                · primary changes: {top.map((d) => `${labels!.short(d.key)} ${(d.zClipped ?? 0) > 0 ? '↑' : '↓'}`).join(', ')}
              </>
            ) : (
              'Every rep is scored against the athlete’s own baseline.'
            )}
          </div>
        </div>
      </section>

      <section className="play">
        <div className="play-head">
          <h2>What do you play?</h2>
          <p>Choose a sport and BreakingPoint will recommend a movement protocol.</p>
        </div>
        <div className="sport-grid">
          {primary.map((s) => (
            <SportCard key={s.id} sport={s} onClick={() => onSport(s.id)} />
          ))}
        </div>
        <div className="sport-grid secondary">
          {secondary.map((s) => (
            <SportCard key={s.id} sport={s} onClick={() => onSport(s.id)} compact />
          ))}
        </div>
        <div className="play-actions">
          <button className="explore-card" onClick={onLibrary}>
            <span className="eyebrow">Explore all protocols</span>
            <span className="explore-title">Movement protocol library</span>
            <span className="muted">
              {SPORTS.reduce((n, sp) => n + (sp.subSports?.length || 1), 0)} sport contexts ·{' '}
              {Object.values(PRIMITIVES).filter((p) => p.engine).length} reusable primitives today · one shared, validated detector →
            </span>
          </button>
          <div className="custom-card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="eyebrow" style={{ color: '#a594ff' }}>
                + Create your own protocol
              </span>
              <span className="status-badge soon">Coming soon</span>
            </div>
            <div className="explore-title">Teach BreakingPoint a repeatable movement.</div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Record a few clean reps of any repeatable movement — BreakingPoint segments them, learns the athlete's movement distribution, and monitors future reps
              for persistent drift.
            </div>
          </div>
        </div>
      </section>

      <section className="how">
        <div className="how-card">
          <div className="n">01 · CALIBRATE</div>
          <h3>Learn your movement signature</h3>
          <p>A few fresh reps of your sport's protocol. Per-feature median and robust spread — your baseline, not an "ideal" athlete.</p>
        </div>
        <div className="how-card">
          <div className="n">02 · MONITOR</div>
          <h3>Score every rep against you</h3>
          <p>On-device pose estimation and rep segmentation. Each rep gets a transparent Movement Drift Score: the RMS of its standardized deviations.</p>
        </div>
        <div className="how-card">
          <div className="n">03 · DETECT</div>
          <h3>Find the breaking point</h3>
          <p>EWMA / CUSUM sequential detection ignores one-off bad reps, fires on persistent drift, and names the pattern that changed.</p>
        </div>
      </section>

      <section className="diff">
        <div className="diff-card no">
          <div className="eyebrow" style={{ color: '#7f8b9d' }}>Most form apps ask</div>
          <div className="q">"Do you move like the ideal athlete?"</div>
        </div>
        <div className="diff-card yes">
          <div className="eyebrow" style={{ color: '#2ee59d' }}>BreakingPoint asks</div>
          <div className="q">"Are you still moving like yourself?"</div>
        </div>
        <div className="diff-card lab-strip" onClick={onLab} style={{ cursor: 'pointer' }}>
          <div className="eyebrow">
            <Flask size={12} /> BreakingPoint Lab · detector backtest
          </div>
          {validated ? (
            <div className="big" style={{ marginTop: 8 }}>
              {v!.numSessions!.toLocaleString()} simulated sessions → {pct(v!.falsePositiveRate)} false alarms, {pct(v!.truePositiveRate)} drift detected, median{' '}
              {v!.medianDetectionDelay} reps delay (held-out).
            </div>
          ) : (
            <div className="big" style={{ marginTop: 8 }}>Run the Lab to calibrate the detector.</div>
          )}
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>One validated detector shared by every protocol →</div>
        </div>
      </section>
    </div>
  );
}

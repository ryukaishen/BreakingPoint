import { useEffect, useState } from 'react';
import type { ExerciseType } from '../biomechanics/catalog';
import type { DetectorConfig } from '../detection/config';
import { DemoController } from '../demo/demoController';
import { SessionEngine, type Snapshot } from '../session/engine';
import { pct } from '../utils/format';
import { FormDrawdown } from './FormDrawdown';
import { Camera, Cpu, Flask, Lock, Play } from './Icons';

interface Props {
  config: DetectorConfig;
  exercise: ExerciseType;
  athlete: string;
  onDemo: () => void;
  onLive: () => void;
  onLab: () => void;
}

export function Landing({ config, exercise, athlete, onDemo, onLive, onLab }: Props) {
  const [preview, setPreview] = useState<Snapshot | null>(null);

  // A real headless run of the demo dataset through the full pipeline (~0.1 s).
  useEffect(() => {
    const id = setTimeout(() => {
      const engine = new SessionEngine(exercise, config, athlete, 'demo');
      new DemoController(engine, exercise).runToEnd(false);
      setPreview(engine.getSnapshot());
    }, 30);
    return () => clearTimeout(id);
  }, [config, exercise, athlete]);

  const v = config.validation;
  const validated = v && Number.isFinite(v.numSessions);
  const top = preview?.breakpointContributors?.slice(0, 3) ?? [];

  return (
    <div className="landing">
      <section className="hero">
        <div>
          <div className="eyebrow">Personalized movement-drift detection · UF Dream Team Designathon 2026</div>
          <h1>
            <span className="strike">Does this look like the perfect squat?</span>
            <br />
            Does this still look like <span className="yours">YOUR</span> squat?
          </h1>
          <p className="lead">
            BreakingPoint learns how you move when fresh, then uses sequential change-point detection to flag the rep where fatigue starts{' '}
            <b>persistently</b> changing your mechanics — with any laptop or phone camera.
          </p>
          <div className="hero-actions">
            <button className="btn primary lg" onClick={onDemo}>
              <Play size={15} /> Run demo dataset
            </button>
            <button className="btn lg" onClick={onLive}>
              <Camera size={16} /> Start live camera
            </button>
          </div>
          <div className="hero-note">
            <span>
              <Lock size={13} /> Video never leaves your device
            </span>
            <span>
              <Cpu size={13} /> On-device pose estimation · no wearables · no force plates
            </span>
          </div>
        </div>
        <div className="hero-card">
          <div className="hc-title">
            <span className="eyebrow">Form drawdown · demo dataset</span>
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
              exercise={exercise}
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
                <b className="c-break">Breaking point at rep {preview.alarmRep}</b> · drift began ≈ rep {preview.onsetRep} · primary changes:{' '}
                {top.map((d, i) => (
                  <span key={d.key}>
                    {i > 0 && ', '}
                    {d.key.replace(/([A-Z])/g, ' $1').toLowerCase()} {(d.zClipped ?? 0) > 0 ? '↑' : '↓'}
                  </span>
                ))}
              </>
            ) : (
              'Every rep is scored against the athlete’s own baseline.'
            )}
          </div>
        </div>
      </section>

      <section className="how">
        <div className="how-card">
          <div className="n">01 · CALIBRATE</div>
          <h3>Learn your personal baseline</h3>
          <p>5–8 fresh reps. Per-feature median and robust spread of knee & hip ROM, depth, trunk lean, tempo, velocity and symmetry.</p>
        </div>
        <div className="how-card">
          <div className="n">02 · MONITOR</div>
          <h3>Score every rep against you</h3>
          <p>Live pose estimation and rep segmentation. Each rep gets a transparent Movement Drift Score: the RMS of its standardized deviations.</p>
        </div>
        <div className="how-card">
          <div className="n">03 · DETECT</div>
          <h3>Find the breaking point</h3>
          <p>EWMA / CUSUM sequential detection ignores one-off bad reps and fires on persistent drift — then explains exactly what changed.</p>
        </div>
      </section>

      <section className="diff">
        <div className="diff-card no">
          <div className="eyebrow" style={{ color: '#7f8b9d' }}>Most form apps ask</div>
          <div className="q">"Is this frame abnormal vs ideal form?"</div>
        </div>
        <div className="diff-card yes">
          <div className="eyebrow" style={{ color: '#2ee59d' }}>BreakingPoint asks</div>
          <div className="q">"Has this athlete entered a persistently different movement regime?"</div>
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
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Parameters chosen by Monte-Carlo validation, not by hand →</div>
        </div>
      </section>
    </div>
  );
}

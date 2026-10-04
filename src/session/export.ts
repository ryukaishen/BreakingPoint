import { featureSpecs } from '../biomechanics/catalog';
import { serializeDetectorConfig } from '../detection/config';
import type { Snapshot } from './engine';

function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

export function sessionToJson(s: Snapshot) {
  return {
    app: 'BreakingPoint Edge',
    exportedAt: new Date().toISOString(),
    mode: s.mode,
    athlete: s.athlete,
    exercise: s.exercise,
    note: 'Derived numeric movement features only. No video is recorded or stored.',
    detectorConfig: serializeDetectorConfig(s.config),
    baseline: s.baseline,
    breakpointRep: s.alarmRep,
    driftOnsetRep: s.onsetRep,
    summary: s.summary,
    recovery: s.recovery,
    reps: s.monitorReps.map((r) => ({
      rep: r.index,
      durationS: r.tEnd - r.tStart,
      captureQuality: r.quality,
      driftScore: r.drift?.score ?? null,
      state: r.step?.state,
      ewmaLevel: r.step?.ewmaLevel,
      cusum: r.step?.cusum,
      features: r.features.values,
      featureQuality: r.features.quality,
      zScores: Object.fromEntries((r.drift?.deviations ?? []).map((d) => [d.key, d.zClipped])),
    })),
    recoveryReps: s.recoveryReps.map((r) => ({ rep: r.index, driftScore: r.drift?.score ?? null, features: r.features.values })),
  };
}

export function exportJson(s: Snapshot) {
  download(`breakingpoint-${s.exercise}-${stamp()}.json`, JSON.stringify(sessionToJson(s), null, 2), 'application/json');
}

export function sessionToCsv(s: Snapshot): string {
  const specs = featureSpecs(s.exercise);
  const head = ['rep', 'state', 'drift_score', 'ewma_level', 'cusum', 'capture_quality', ...specs.map((f) => f.key), ...specs.map((f) => `z_${f.key}`)];
  const rows = s.monitorReps.map((r) => {
    const z = Object.fromEntries((r.drift?.deviations ?? []).map((d) => [d.key, d.zClipped]));
    const cell = (v: unknown) => (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v)) ? '' : typeof v === 'number' ? v.toFixed(4) : String(v));
    return [r.index, r.step?.state, r.drift?.score, r.step?.ewmaLevel, r.step?.cusum, r.quality, ...specs.map((f) => r.features.values[f.key]), ...specs.map((f) => z[f.key])].map(cell).join(',');
  });
  return [head.join(','), ...rows].join('\n');
}

export function exportCsv(s: Snapshot) {
  download(`breakingpoint-${s.exercise}-${stamp()}.csv`, sessionToCsv(s), 'text/csv');
}

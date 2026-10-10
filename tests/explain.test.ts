// Plain-language explanations: the deterministic demo runs through the real pipeline
// and the explanation must name real measurement changes and the right reps.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { featureSpecs, type ExerciseType } from '../src/biomechanics/catalog';
import { CHANGE_PHRASES } from '../src/biomechanics/plainLanguage';
import { DEFAULT_DETECTOR_CONFIG, parseDetectorConfig } from '../src/detection/config';
import { DemoController } from '../src/demo/demoController';
import { SessionEngine } from '../src/session/engine';
import { describeChanges, describeTiming, explainAlert, explainAlertText } from '../src/session/explain';

const shipped = existsSync('public/breakingpoint_detector_config.json')
  ? parseDetectorConfig(JSON.parse(readFileSync('public/breakingpoint_detector_config.json', 'utf8')))
  : DEFAULT_DETECTOR_CONFIG;

function run(exercise: 'squat' | 'cmj') {
  const engine = new SessionEngine(exercise, shipped, 'Adam', 'demo');
  new DemoController(engine, exercise).runToEnd(false);
  return engine.getSnapshot();
}

const allPhrases = (exercise: ExerciseType) => Object.values(CHANGE_PHRASES[exercise]).flatMap((p) => [p.up, p.down]);

describe('plain-language phrases', () => {
  it.each(['squat', 'cmj', 'lunge'] as const)('cover every %s measurement in both directions', (exercise) => {
    for (const s of featureSpecs(exercise)) {
      const p = CHANGE_PHRASES[exercise][s.key];
      expect(p, s.key).toBeDefined();
      expect(p.up).not.toBe(p.down);
    }
  });

  it('avoid jargon and judgements', () => {
    const text = (['squat', 'cmj', 'lunge'] as const).flatMap(allPhrases).join(' ');
    expect(text).not.toMatch(/drift|σ|sigma|z-score|ewma|cusum|fatigue|injur|risk|worse|better|bad|good/i);
  });
});

describe('describeChanges', () => {
  it('names up to two changes, largest first, without repeating a phrase', () => {
    const s = describeChanges('squat', [
      { key: 'repDuration', z: 1.4 },
      { key: 'kneeRomL', z: -2.1 },
      { key: 'kneeRomR', z: -2.0 },
      { key: 'trunkLean', z: 1.2 },
    ]);
    expect(s).toBe('Your knee range of motion decreased and your reps became slower.');
  });

  it('names only the largest change when nothing reaches one unit of normal variation', () => {
    expect(describeChanges('cmj', [{ key: 'jumpHeight', z: -0.6 }, { key: 'trunkLean', z: 0.4 }])).toBe('Your jump height dropped.');
  });

  it('returns null when nothing changed', () => {
    expect(describeChanges('squat', [])).toBeNull();
    expect(describeChanges('squat', [{ key: 'depth', z: 0 }])).toBeNull();
  });

  it('describes the timing as an estimate, and copes with an onset on the alert rep', () => {
    expect(describeTiming(7, 10)).toBe('These changes first appeared around rep 7, and BreakingPoint triggered an alert at rep 10.');
    expect(describeTiming(10, 10)).toBe('BreakingPoint triggered an alert at rep 10.');
    expect(describeTiming(null, 10)).toBe('BreakingPoint triggered an alert at rep 10.');
  });
});

describe.each(['squat', 'cmj'] as const)('explanation of the %s demo', (exercise) => {
  const s = run(exercise);
  const e = explainAlert(exercise, s.monitorReps, s.onsetRep, s.alarmRep!);
  const text = explainAlertText(e);

  it('names at least one measured change in plain words', () => {
    expect(e.what).not.toBeNull();
    expect(allPhrases(exercise).some((p) => e.what!.toLowerCase().includes(p))).toBe(true);
  });

  it('reports the estimated start and the alert rep from the detector', () => {
    expect(s.alarmRep).toBe(10);
    expect(text).toContain(`first appeared around rep ${s.onsetRep}`);
    expect(text).toContain('BreakingPoint triggered an alert at rep 10.');
  });

  it('is two plain sentences', () => {
    expect(text.split('. ').length).toBe(2);
    expect(text).not.toMatch(/drift|σ|ewma|cusum/i);
  });
});

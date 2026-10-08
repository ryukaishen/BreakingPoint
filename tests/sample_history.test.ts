// The sample athlete's history is real pipeline output on synthetic movement.
// This test regenerates it and requires the committed fixture to match, so the
// sample can never drift from what the detector actually does.
//   Refresh after a pipeline/detector change:  SAMPLE_GEN=1 npx vitest run tests/sample_history.test.ts
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseDetectorConfig } from '../src/detection/config';
import { generateSampleHistory, SAMPLE_PROTOCOLS, type SampleSessionSeed } from '../src/data/sampleHistory';
import { recordSteps } from '../src/data/progress';
import { materializeSampleSessions } from '../src/data/sampleHistory';

const FIXTURE = 'src/data/sampleHistory.json';
const shipped = parseDetectorConfig(JSON.parse(readFileSync('public/breakingpoint_detector_config.json', 'utf8')));
const generated = generateSampleHistory(shipped);
if (process.env.SAMPLE_GEN === '1') writeFileSync(FIXTURE, `${JSON.stringify(generated, null, 1)}\n`);

describe('sample athlete history', () => {
  const fixture = existsSync(FIXTURE) ? (JSON.parse(readFileSync(FIXTURE, 'utf8')) as SampleSessionSeed[]) : [];

  it('matches a fresh run of the real pipeline', () => {
    expect(fixture).toEqual(generated);
  });

  it('is synthetic and counts toward nothing real', () => {
    for (const s of fixture) {
      expect(s.record.source).toBe('demo');
      expect(s.record.id.startsWith('sample_')).toBe(true);
    }
  });

  it('every session calibrates cleanly and detects a breaking point', () => {
    for (const s of fixture) {
      expect(s.record.quality.eligible).toBe(true);
      expect(s.record.breakpointRep).not.toBeNull();
      expect(s.record.recovery).not.toBeNull();
    }
  });

  it('the sample athlete stops within two reps of the warning', () => {
    for (const s of fixture) expect(s.record.totalReps - (s.record.breakpointRep as number)).toBeLessThanOrEqual(2);
  });

  it('shows sustainable improvement under comparable conditions, with a best the demo set can beat', () => {
    const sessions = materializeSampleSessions(fixture, new Date('2026-10-08T12:00:00'));
    for (const p of SAMPLE_PROTOCOLS) {
      const steps = recordSteps(sessions, p.protocolId);
      expect(steps.length).toBe(p.sessions.length);
      const first = steps[0].held;
      const best = steps[steps.length - 1].best;
      expect(best).toBeGreaterThan(first);
      // The default demo set holds 7 reps; the sample best stays below it so a demo run can earn a genuine record.
      expect(best).toBeLessThan(7);
    }
  });
});

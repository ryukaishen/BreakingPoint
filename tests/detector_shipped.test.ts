// How the shipped detector treats one unusual rep. These tests document existing
// behaviour; they change nothing in the detector. With α = 0.4 and each rep's
// standardized score capped at 2.5, one rep moves the EWMA by at most 1.0 from a settled
// trend, half the 2.0 alert line. From a trend already near the line, one rep can
// trigger it, which is why the app never says a single rep "cannot" cause an alert.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDetectorConfig } from '../src/detection/config';
import { runDetector } from '../src/detection/detector';

const cfg = parseDetectorConfig(JSON.parse(readFileSync('public/breakingpoint_detector_config.json', 'utf8')));
const mu0 = 1.0;
const sigma0 = 0.35;
/** Score whose standardized value s = (score - mu0) / sigma0 equals `s`. */
const at = (s: number) => mu0 + s * sigma0;

describe('shipped detector and a single unusual rep', () => {
  it('is the HiPerGator-selected EWMA configuration', () => {
    expect(cfg.configId).toBe('ewma|a=0.4|bp=2|w=1|m=0|clip=2.5');
    expect([cfg.mode, cfg.ewmaAlpha, cfg.breakpointThreshold, cfg.warningThreshold, cfg.minimumPersistentReps, cfg.outlierClip]).toEqual([
      'ewma', 0.4, 2, 1, 0, 2.5,
    ]);
  });

  it('from a settled trend, one extreme rep lifts the EWMA by at most α × clip and does not alert', () => {
    const det = runDetector(cfg, mu0, sigma0, [at(0), at(0), at(0), at(0), at(50)]);
    const last = det.steps[det.steps.length - 1];
    expect(last.ewma).toBeLessThanOrEqual(cfg.ewmaAlpha * cfg.outlierClip! + 1e-12);
    expect(det.alarmRep).toBeNull();
  });

  it('from a trend already near the line, one extreme rep can trigger the alert', () => {
    const elevated = Array.from({ length: 10 }, () => at(1.7));
    const before = runDetector(cfg, mu0, sigma0, elevated);
    expect(before.alarmRep).toBeNull();
    const det = runDetector(cfg, mu0, sigma0, [...elevated, at(50)]);
    expect(det.alarmRep).toBe(11);
  });

  it('matches the threshold quoted in the research panel: (alert − α·clip) / (1 − α) ≈ 1.67', () => {
    const z = (cfg.breakpointThreshold - cfg.ewmaAlpha * cfg.outlierClip!) / (1 - cfg.ewmaAlpha);
    expect(z).toBeCloseTo(1.667, 3);
    // Just below it, one capped rep cannot reach the line; just above, it can.
    expect(cfg.ewmaAlpha * cfg.outlierClip! + (1 - cfg.ewmaAlpha) * (z - 0.01)).toBeLessThan(cfg.breakpointThreshold);
    expect(cfg.ewmaAlpha * cfg.outlierClip! + (1 - cfg.ewmaAlpha) * (z + 0.01)).toBeGreaterThan(cfg.breakpointThreshold);
  });
});

// The arithmetic behind the 3 m readability standard.
import { describe, expect, it } from 'vitest';
import { ACUITY_LETTER_DEG, angularSizeDeg, CAP_RATIO, DEVICES, fontSizeForCapPx, judge, maxDistanceM, requiredPx, TIERS } from '../src/ui/readability';

describe('visual angle', () => {
  it('matches known geometry', () => {
    expect(angularSizeDeg(1000, 1)).toBeCloseTo(53.13, 2); // 1 m tall, seen from 1 m
    expect(angularSizeDeg(0, 3)).toBe(0);
    expect(angularSizeDeg(10, 3)).toBeCloseTo(0.191, 3);
  });

  it('a 20/20 letter is 5 arcminutes: 4.36 mm tall from 3 m', () => {
    expect(ACUITY_LETTER_DEG).toBeCloseTo(0.0833, 4);
    expect(angularSizeDeg(4.363, 3)).toBeCloseTo(ACUITY_LETTER_DEG, 3);
  });

  it('requiredPx inverts angularSizeDeg and maxDistanceM inverts both', () => {
    for (const deg of [0.05, 0.25, 0.45]) {
      for (const d of [2.5, 3, 3.5]) {
        const px = requiredPx(deg, d, DEVICES.laptop15.mmPerPx);
        expect(angularSizeDeg(px * DEVICES.laptop15.mmPerPx, d)).toBeCloseTo(deg, 6);
        expect(maxDistanceM(px, deg, DEVICES.laptop15.mmPerPx)).toBeCloseTo(d, 6);
      }
    }
  });
});

describe('the tiers', () => {
  it('are multiples of the acuity limit, ordered, and strictest for what must be read at a glance', () => {
    expect(TIERS.T1.minDeg / ACUITY_LETTER_DEG).toBeGreaterThan(5);
    expect(TIERS.T1.minDeg / ACUITY_LETTER_DEG).toBeLessThan(6);
    expect(TIERS.T2.minDeg / ACUITY_LETTER_DEG).toBeCloseTo(3, 0);
    expect(TIERS.T1.minDeg).toBeGreaterThan(TIERS.T2.minDeg);
    expect(TIERS.T2.minDeg).toBeGreaterThan(TIERS.G.minDeg);
    // text never gets less than the project's AA floor, and graphics get the WCAG graphics floor
    expect(TIERS.T1.minContrast).toBeGreaterThanOrEqual(4.5);
    expect(TIERS.T2.minContrast).toBeGreaterThanOrEqual(4.5);
    expect(TIERS.G.minContrast).toBe(3);
  });

  it('give the sizes the standard document quotes for a 15.6-inch laptop at 3 m', () => {
    const mm = DEVICES.laptop15.mmPerPx;
    expect(requiredPx(TIERS.T1.minDeg, 3, mm)).toBeCloseTo(104.9, 1);
    expect(requiredPx(TIERS.T2.minDeg, 3, mm)).toBeCloseTo(58.3, 1);
    expect(requiredPx(TIERS.G.minDeg, 3, mm)).toBeCloseTo(11.7, 1);
    // glyph height to font size, for the digits and capitals in use
    expect(fontSizeForCapPx(104.9)).toBeCloseTo(104.9 / CAP_RATIO, 6);
  });

  it('a phone needs a larger CSS size than a laptop for the same angle, a big monitor a smaller one', () => {
    const need = (d: string) => requiredPx(TIERS.T1.minDeg, 3, DEVICES[d].mmPerPx);
    expect(need('phone')).toBeGreaterThan(need('laptop13'));
    expect(need('laptop13')).toBeGreaterThan(need('laptop15'));
    expect(need('laptop15')).toBeGreaterThan(need('monitor24'));
  });
});

describe('judging a measurement', () => {
  it('passes a size and contrast that meet the tier, and fails either that does not', () => {
    const big = judge('T1', 144, 12, 'laptop15');
    expect(big.pass).toBe(true);
    expect(big.readsToM).toBeGreaterThan(3);
    const small = judge('T1', 25, 12, 'laptop15');
    expect(small.sizeOk).toBe(false);
    expect(small.pass).toBe(false);
    expect(small.readsToM).toBeLessThan(1);
    const lowContrast = judge('T1', 144, 3.5, 'laptop15');
    expect(lowContrast.sizeOk).toBe(true);
    expect(lowContrast.contrastOk).toBe(false);
    expect(lowContrast.pass).toBe(false);
  });

  it('does not let an unknown contrast pass or fail a size on its own', () => {
    const v = judge('T2', 70, null, 'laptop15');
    expect(v.contrastOk).toBeNull();
    expect(v.pass).toBe(true);
    expect(judge('T2', 20, null, 'laptop15').pass).toBe(false);
  });

  it('reports how far away something still reads, which shrinks as the tier tightens', () => {
    const px = 80;
    const t2 = judge('T2', px, 10, 'laptop15').readsToM;
    const t1 = judge('T1', px, 10, 'laptop15').readsToM;
    expect(t2).toBeGreaterThan(t1);
  });

  it('accepts a raw mm-per-px figure for a screen not in the table', () => {
    expect(judge('G', 12, 4, 0.2246).sizeOk).toBe(true);
    expect(judge('G', 8, 4, 0.2246).sizeOk).toBe(false);
  });
});

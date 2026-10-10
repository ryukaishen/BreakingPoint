// The 3 m readability standard (docs/READABILITY_3M.md), as code.
//
// A font size does not make something readable from across a room: what the eye gets is the
// visual angle the glyphs subtend, which depends on the viewing distance and on how large a CSS
// pixel really is on that screen. This module turns a measured size on a given device into an
// angle and judges it against the tiers below. It is plain arithmetic, shared by the unit tests
// and by scripts/readability.mjs, which measures the real elements in a real browser.
//
// The tiers come from visual acuity. A 20/20 eye resolves a letter 5 arcminutes tall (0.083 deg).
// Reading is comfortable well above that limit, and gets harder with fatigue, sweat, motion and
// glare, so the thresholds are multiples of it:
//   T1  0.45 deg  (about 5.4x the acuity limit)  what must be read at a glance, mid-set
//   T2  0.25 deg  (about 3x)                      what is read in a second or two
//   G   0.05 deg                                  a graphic feature that carries information
// These are design thresholds, not clinical ones; a real test on a real device at 3 m is the
// final check and is part of the standard.

export const NOMINAL_DISTANCE_M = 3.0;
/** The product's stated range is 2.5 to 3.5 m: the far end is the one that matters. */
export const FAR_DISTANCE_M = 3.5;
/** A 20/20 letter, in degrees (5 arcminutes). */
export const ACUITY_LETTER_DEG = 5 / 60;

export type Tier = 'T1' | 'T2' | 'G';

// Contrast: glyphs this large count as large text, where WCAG AAA asks 4.5:1, so the text tiers use 4.5:1
// (the project's own AA floor for any text). Size, not contrast, is what the tiers add.
export const TIERS: Record<Tier, { minDeg: number; minContrast: number; what: string }> = {
  T1: { minDeg: 0.45, minContrast: 4.5, what: 'State word, rep count, the stop signal: read at a glance, mid-set' },
  T2: { minDeg: 0.25, minContrast: 4.5, what: 'The one-line instruction and the record label: read in a second or two' },
  G: { minDeg: 0.05, minContrast: 3, what: 'A graphic feature that carries information: the record marker, the lane edge' },
};

/** Millimetres per CSS pixel on typical screens (physical width / CSS width at default scaling). */
export const DEVICES: Record<string, { label: string; mmPerPx: number }> = {
  laptop13: { label: '13-inch laptop, 1440 CSS px wide', mmPerPx: 0.1986 },
  laptop15: { label: '15.6-inch laptop, 1536 CSS px wide (1080p at 125%)', mmPerPx: 0.2246 },
  monitor24: { label: '24-inch monitor, 1920 CSS px wide', mmPerPx: 0.2766 },
  phone: { label: 'Phone, 390 CSS px wide', mmPerPx: 0.1833 },
};

const RAD = Math.PI / 180;

/** The visual angle, in degrees, of an object `sizeMm` tall seen from `distanceM`. */
export function angularSizeDeg(sizeMm: number, distanceM: number): number {
  return (2 * Math.atan(sizeMm / (2 * distanceM * 1000))) / RAD;
}

/** The CSS pixels an object needs to subtend `deg` degrees from `distanceM` on a screen of `mmPerPx`. */
export function requiredPx(deg: number, distanceM: number, mmPerPx: number): number {
  return (2 * distanceM * 1000 * Math.tan((deg * RAD) / 2)) / mmPerPx;
}

/** The farthest distance, in metres, at which an object of `px` CSS pixels still subtends `deg`. */
export function maxDistanceM(px: number, deg: number, mmPerPx: number): number {
  return (px * mmPerPx) / (2 * Math.tan((deg * RAD) / 2)) / 1000;
}

/** Glyph height as a fraction of font size: the digits and capitals of the faces in use are all close to this. */
export const CAP_RATIO = 0.7;
export const fontSizeForCapPx = (capPx: number, ratio = CAP_RATIO): number => capPx / ratio;

export interface Verdict {
  tier: Tier;
  /** Measured size in CSS px (glyph height for text, thickness for a graphic). */
  px: number;
  angleDeg: number;
  requiredPx: number;
  /** How far away it still reads, in metres. */
  readsToM: number;
  sizeOk: boolean;
  /** Null when the contrast could not be computed (gradient or image behind the element). */
  contrast: number | null;
  contrastOk: boolean | null;
  pass: boolean;
}

export function judge(tier: Tier, px: number, contrast: number | null, device: keyof typeof DEVICES | number, distanceM = NOMINAL_DISTANCE_M): Verdict {
  const mmPerPx = typeof device === 'number' ? device : DEVICES[device].mmPerPx;
  const t = TIERS[tier];
  const angleDeg = angularSizeDeg(px * mmPerPx, distanceM);
  const sizeOk = angleDeg >= t.minDeg;
  const contrastOk = contrast === null ? null : contrast >= t.minContrast;
  return {
    tier,
    px,
    angleDeg,
    requiredPx: requiredPx(t.minDeg, distanceM, mmPerPx),
    readsToM: maxDistanceM(px, t.minDeg, mmPerPx),
    sizeOk,
    contrast,
    contrastOk,
    pass: sizeOk && contrastOk !== false,
  };
}

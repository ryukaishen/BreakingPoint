import type { MovementState } from '../detection/detector';

export const STATE_COLOR: Record<MovementState, string> = {
  STABLE: '#2ee59d',
  DRIFT: '#ffb020',
  BREAKPOINT: '#ff4d5e',
};

export const STATE_LABEL: Record<MovementState, string> = {
  STABLE: 'STABLE',
  DRIFT: 'DRIFT EMERGING',
  BREAKPOINT: 'BREAKING POINT',
};

export const STATE_CLASS: Record<MovementState, string> = { STABLE: 'stable', DRIFT: 'drift', BREAKPOINT: 'break' };

export function fmtSigma(z: number | null | undefined, digits = 1): string {
  if (z === null || z === undefined || !Number.isFinite(z)) return '—';
  return `${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(digits)}σ`;
}

export function fmt(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

export const arrow = (z: number) => (z > 0 ? '↑' : '↓');

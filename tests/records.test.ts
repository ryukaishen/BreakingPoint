import { describe, expect, it } from 'vitest';
import type { MovementState } from '../src/detection/detector';
import { compareHeld, heldReps, stillHolding } from '../src/progress/records';
import type { RepRecord } from '../src/session/engine';

const rep = (index: number, state: MovementState | null): RepRecord =>
  ({ index, step: state ? { state } : null }) as unknown as RepRecord;

describe('reps held at baseline', () => {
  it('counts the opening run of STABLE reps and stops at the first drift', () => {
    const reps = [1, 2, 3, 4, 5, 6, 7].map((i) => rep(i, 'STABLE')).concat([rep(8, 'DRIFT'), rep(9, 'STABLE'), rep(10, 'BREAKPOINT')]);
    expect(heldReps(reps)).toBe(7);
    expect(stillHolding(reps)).toBe(false);
  });

  it('ignores unscored reps without breaking the run', () => {
    const reps = [rep(1, 'STABLE'), rep(2, null), rep(3, 'STABLE')];
    expect(heldReps(reps)).toBe(2);
    expect(stillHolding(reps)).toBe(true);
  });

  it('is zero for an empty set or an immediate drift', () => {
    expect(heldReps([])).toBe(0);
    expect(heldReps([rep(1, 'DRIFT'), rep(2, 'STABLE')])).toBe(0);
  });
});

describe('personal best comparison', () => {
  it('a first set establishes a best but is not reported as a new one', () => {
    expect(compareHeld(5, null)).toEqual({ held: 5, previousBest: null, isNewBest: false });
  });

  it('only a strictly higher count is a new best', () => {
    expect(compareHeld(9, 7).isNewBest).toBe(true);
    expect(compareHeld(7, 7).isNewBest).toBe(false);
    expect(compareHeld(4, 7).isNewBest).toBe(false);
  });
});

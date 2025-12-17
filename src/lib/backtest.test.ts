import { describe, it, expect } from 'vitest';
import { runWalkForwardBacktest } from './backtest';
import type { Draw } from '../types';

// helper to build a draw with given mains and supp
function buildDraw(main: number[], supp: number[] = [], date = '2025-01-01'): Draw {
  return { main, supp, date };
}

describe('runWalkForwardBacktest', () => {
  it('returns zeroes for insufficient history', () => {
    const history: Draw[] = [buildDraw([1,2,3,4,5,6], [7,8])];
    const res = runWalkForwardBacktest(history, 10, () => new Set<number>([1,2,3]));
    expect(res.drawsEvaluated).toBe(0);
    expect(res.meanExcluded).toBe(0);
    expect(res.meanExcludedRandom).toBe(0);
    expect(res.deltaPerDraw).toEqual([]);
  });

  it('measures excluded winners correctly against deterministic predictor', () => {
    // create history of 15 draws; windowSize=10 -> drawsEvaluated = 5
    const history: Draw[] = [];
    // build alternating draws: draws 0..14
    for (let i = 0; i < 15; i++) {
      // winners rotate through small set so we can compute expected excluded
      const main = [ (i % 10) + 1, 11,12,13,14,15 ];
      const supp = [16,17];
      history.push(buildDraw(main, supp, `2025-01-${(i+1).toString().padStart(2,'0')}`));
    }

    // Predictor: always predicts numbers 1..10 as NOT drawn
    const predictor = (_window: Draw[]) => new Set<number>(Array.from({ length: 10 }, (_, i) => i + 1));

    const res = runWalkForwardBacktest(history, 10, predictor, 50, 100, 42);
    // drawsEvaluated should be 5
    expect(res.drawsEvaluated).toBe(5);
    // For each evaluated draw t=10..14, the actual main includes (t%10)+1 which is in 1..10 => excluded winners per draw = 1
    expect(res.meanExcluded).toBeCloseTo(1.0, 6);
    // random baseline should be similar but not exactly 1; ensure deltaPerDraw length matches drawsEvaluated
    expect(res.deltaPerDraw.length).toBe(res.drawsEvaluated);
    // bootstrapCI should be a tuple of two numbers
    expect(Array.isArray(res.bootstrapCI)).toBe(true);
    expect(res.bootstrapCI && res.bootstrapCI.length).toBe(2);
  });
});

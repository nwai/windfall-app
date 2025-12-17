import { describe, it, expect } from 'vitest';
import { trainLogistic, predictFromWeights, computeFeaturesForTime } from './ml/logistic';
import type { Draw } from '../types';

function buildDraw(main: number[], supp: number[] = []) {
  return { main, supp, date: '2025-01-01' } as Draw;
}

describe('logistic trainer and predictor', () => {
  it('computeFeaturesForTime returns feature entries for 45 numbers', () => {
    const history: Draw[] = [];
    // create 30 draws with numbers covering 1..15 repeatedly
    for (let i = 0; i < 30; i++) {
      const base = (i % 15) + 1;
      const main = [base, base+1, base+2, base+3, base+4, ((base+5)%45)+1].map(n=>((n-1)%45)+1);
      const supp = [((base+6)%45)+1, ((base+7)%45)+1].map(n=>((n-1)%45)+1);
      history.push(buildDraw(main, supp));
    }
    const feats = computeFeaturesForTime(history, history.length, 12);
    expect(Object.keys(feats).length).toBeGreaterThanOrEqual(45);
    expect(feats[1]).toHaveProperty('recency');
    expect(feats[1]).toHaveProperty('recentFreq');
    expect(feats[1]).toHaveProperty('gapZ');
  });

  it('trainLogistic and predictFromWeights run without errors and produce probability map', () => {
    const history: Draw[] = [];
    for (let i = 0; i < 50; i++) {
      const base = (i % 20) + 1;
      const main = [base, base+1, base+2, base+3, base+4, ((base+5)%45)+1].map(n=>((n-1)%45)+1);
      const supp = [((base+6)%45)+1, ((base+7)%45)+1].map(n=>((n-1)%45)+1);
      history.push(buildDraw(main, supp));
    }
    const weights = trainLogistic(history, 30, 12, { iters: 50, lr: 0.05 });
    expect(weights).toHaveProperty('bias');
    expect(weights).toHaveProperty('recency');
    const probs = predictFromWeights(history, weights, 12);
    expect(Object.keys(probs).length).toBeGreaterThanOrEqual(45);
    expect(typeof probs[1]).toBe('number');
    expect(probs[1]).toBeGreaterThanOrEqual(0);
    expect(probs[1]).toBeLessThanOrEqual(1);
  });
});

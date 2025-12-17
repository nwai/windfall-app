import { describe, it, expect } from 'vitest';
import { buildTransitionMatrix, getTransitionProbability } from './temperatureTransitions';
import { Draw } from '../types';

describe('temperatureTransitions basic matrix', () => {
  it('computes transition probabilities for a tiny fabricated history', () => {
    const history: Draw[] = [
      { date: '2025-01-01', main: [1,2,3,4,5,6], supp: [8,9] },
      { date: '2025-01-03', main: [7,10,11,12,13,14], supp: [2,3] },
      { date: '2025-01-05', main: [20,21,22,23,24,25], supp: [1,4] },
      { date: '2025-01-07', main: [2,7,27,28,29,30], supp: [31,32] },
    ];

    // Categories for number 7 across draws: other, X, X, X
    const numberTemps: Record<number, string[]> = {};
    for (let n = 1; n <= 45; n++) numberTemps[n] = Array(history.length).fill('other');
    numberTemps[7] = ['other', 'X', 'X', 'X'];

    const M = buildTransitionMatrix(history, numberTemps as any);

    // For prev temp 'X': opportunities at draws index 1 and 2 (0-based 1 and 2) -> hits at index 3 only => 1/2
    const pX = getTransitionProbability(M, 7, 'X');
    expect(pX).toBeCloseTo(0.5, 9);

    // For prev temp 'other': opportunity at index 0 only, next draw is index1 where 7 is drawn? In our history, draw index1 contains 7, so probability = 1
    const pOther = getTransitionProbability(M, 7, 'other');
    expect(pOther).toBeCloseTo(1, 9);
  });
});

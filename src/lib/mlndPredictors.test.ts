import { describe, it, expect } from 'vitest';
import { makePredictor } from './mlndPredictors';

function draw(main: number[], supp: number[] = []) {
  return { date: '2025-01-01', main, supp } as any;
}

describe('mlndPredictors', () => {
  it('produces a Set of the expected size for old formulation', () => {
    const history = [
      draw([1,2,3,4,5,6], [7,8]),
      draw([7,8,9,10,11,12], [13,14]),
      draw([13,14,15,16,17,18], [19,20])
    ];
    const pred = makePredictor('old', 0.9)(history);
    expect(pred instanceof Set).toBe(true);
    expect(pred.size).toBeLessThanOrEqual(37);
    expect(pred.size).toBeGreaterThan(0);
  });

  it('produces a Set of the expected size for new formulation', () => {
    const history = [
      draw([1,2,3,4,5,6], [7,8]),
      draw([7,8,9,10,11,12], [13,14]),
      draw([13,14,15,16,17,18], [19,20])
    ];
    const pred = makePredictor('new', 0.9)(history);
    expect(pred instanceof Set).toBe(true);
    expect(pred.size).toBeLessThanOrEqual(39);
    expect(pred.size).toBeGreaterThan(0);
  });

  it('is deterministic given same input and sensitivity', () => {
    const history = [];
    for (let i=0;i<30;i++) history.push(draw([ (i%45)+1, ((i+1)%45)+1, ((i+2)%45)+1, ((i+3)%45)+1, ((i+4)%45)+1, ((i+5)%45)+1 ]));
    const p1 = makePredictor('old', 0.7)(history);
    const p2 = makePredictor('old', 0.7)(history);
    expect(Array.from(p1).sort()).toEqual(Array.from(p2).sort());
  });
});

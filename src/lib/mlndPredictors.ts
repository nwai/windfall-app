import type { Draw } from '../types';

export type Formulation = 'old' | 'new';

export function makePredictor(formulation: Formulation, sensitivity: number) {
  const targetNotDrawn = formulation === 'old' ? 37 : 39;
  function makeLookback(trainingLen: number, baseFactor = 0.15) {
    const factor = Math.max(0.03, baseFactor * (1 - sensitivity * 0.8));
    return Math.max(1, Math.min(Math.ceil(trainingLen * factor), 60));
  }
  function makeK(lookback: number) {
    return Math.max(1, Math.round(lookback * Math.max(0.25, 1 - sensitivity * 0.7)));
  }

  return (training: Draw[]) => {
    const weights = Array(46).fill(0);
    const total = training.length;
    const k = Math.max(1, Math.round(Math.max(3, total / Math.max(1, 8 * (1 - sensitivity)))));
    for (let idx = 0; idx < training.length; idx++) {
      const d = training[idx];
      const drawnArr = formulation === 'old' ? [...d.main, ...(d.supp || [])] : [...d.main];
      const notDrawn: number[] = [];
      for (let i = 1; i <= 45; i++) if (!drawnArr.includes(i)) notDrawn.push(i);
      const w = Math.exp(-(training.length - 1 - idx) / k);
      for (const n of notDrawn) weights[n] += w;
    }
    const ordered = Array.from({ length: 45 }, (_, i) => i + 1).sort((a, b) => weights[b] - weights[a] || a - b);
    return new Set<number>(ordered.slice(0, targetNotDrawn));
  };
}

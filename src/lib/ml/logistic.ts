import type { Draw } from '../../types';

export interface Weights {
  bias: number;
  recency: number;
  recentFreq: number;
  gapZ: number;
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

// compute per-number features at time index t (predicting draw at t using history up to t-1)
export function computeFeaturesForTime(history: Draw[], t: number, featureWindow: number) {
  // history is chronological oldest->newest
  const start = Math.max(0, t - featureWindow);
  const window = history.slice(start, t); // up to t-1
  const drawsCount = window.length;
  // per-number stats
  const lastHit: number[] = Array(46).fill(-1); // last index within window where hit occurred
  const counts: number[] = Array(46).fill(0);
  const gapsList: number[][] = Array.from({ length: 46 }, () => [] as number[]);

  // track hits per number across window
  for (let idx = 0; idx < window.length; idx++) {
    const d = window[idx];
    const nums = [...d.main, ...(d.supp || [])];
    for (const n of nums) {
      counts[n]++;
      if (lastHit[n] !== -1) {
        const gap = idx - lastHit[n];
        gapsList[n].push(gap);
      }
      lastHit[n] = idx;
    }
  }

  // current gap = distance since last hit to the end of window
  const currentGap: number[] = Array(46).fill(0);
  for (let n = 1; n <= 45; n++) {
    if (lastHit[n] === -1) currentGap[n] = window.length; else currentGap[n] = window.length - lastHit[n] - 1;
  }

  // compute gap mean/std for z
  const gapMean: number[] = Array(46).fill(0);
  const gapStd: number[] = Array(46).fill(0);
  for (let n = 1; n <= 45; n++) {
    const arr = gapsList[n];
    if (arr.length === 0) {
      gapMean[n] = 0;
      gapStd[n] = 1;
    } else {
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      const v = arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length;
      gapMean[n] = m;
      gapStd[n] = Math.sqrt(v) || 1;
    }
  }

  // recency using exponential decay k = mean gap across numbers or default 6
  let avgHitsPerNumber = 0;
  for (let n = 1; n <= 45; n++) avgHitsPerNumber += counts[n];
  avgHitsPerNumber = avgHitsPerNumber / 45;
  const p = Math.max(0.001, avgHitsPerNumber / Math.max(1, window.length));
  const k = Math.max(2, 1 / Math.max(1e-6, p));

  const features: Record<number, { recency: number; recentFreq: number; gapZ: number; gap: number }> = {};
  for (let n = 1; n <= 45; n++) {
    const age = currentGap[n];
    const recency = Math.exp(-age / k); // between 0..1
    const recentFreq = counts[n];
    const gapz = (currentGap[n] - gapMean[n]) / gapStd[n];
    features[n] = { recency, recentFreq, gapZ: gapz, gap: currentGap[n] };
  }
  return features;
}

// Train logistic regression on historical labeled data within trainingWindow (chronological)
export function trainLogistic(history: Draw[], trainingWindow: number, featureWindow: number, options?: { iters?: number; lr?: number; seed?: number }): Weights {
  const iters = options?.iters ?? 2000;
  const lr = options?.lr ?? 0.01;

  // Build dataset: for each time t in [trainingStart .. history.length-1], compute features for t and label whether number drawn at t
  const startT = Math.max(featureWindow, history.length - trainingWindow);
  const X: number[][] = [];
  const Y: number[] = [];

  for (let t = startT; t < history.length; t++) {
    const feats = computeFeaturesForTime(history, t, featureWindow);
    const drawn = new Set<number>([...history[t].main, ...(history[t].supp || [])]);
    for (let n = 1; n <= 45; n++) {
      const f = feats[n];
      X.push([1, f.recency, f.recentFreq, f.gapZ]); // bias, recency, recentFreq, gapZ
      Y.push(drawn.has(n) ? 1 : 0);
    }
  }

  // Initialize weights small
  let w = [0, 0, 0, 0];

  // SGD over dataset
  for (let iter = 0; iter < iters; iter++) {
    // simple full-batch gradient descent
    const grads = [0, 0, 0, 0];
    for (let i = 0; i < X.length; i++) {
      const xi = X[i];
      const y = Y[i];
      const z = w[0] * xi[0] + w[1] * xi[1] + w[2] * xi[2] + w[3] * xi[3];
      const p = sigmoid(z);
      const err = p - y;
      grads[0] += err * xi[0];
      grads[1] += err * xi[1];
      grads[2] += err * xi[2];
      grads[3] += err * xi[3];
    }
    const n = X.length || 1;
    w[0] -= lr * grads[0] / n;
    w[1] -= lr * grads[1] / n;
    w[2] -= lr * grads[2] / n;
    w[3] -= lr * grads[3] / n;
  }

  return { bias: w[0], recency: w[1], recentFreq: w[2], gapZ: w[3] };
}

export function predictFromWeights(history: Draw[], weights: Weights, featureWindow: number) {
  const t = history.length; // predict next draw using history up to last
  const feats = computeFeaturesForTime(history, t, featureWindow);
  const p: Record<number, number> = {};
  for (let n = 1; n <= 45; n++) {
    const f = feats[n];
    const z = weights.bias + weights.recency * f.recency + weights.recentFreq * f.recentFreq + weights.gapZ * f.gapZ;
    p[n] = sigmoid(z);
  }
  return p;
}

import { Draw } from '../types';

export interface BacktestResult {
  drawsEvaluated: number;
  meanExcluded: number; // mean excluded winners per draw for method
  meanExcludedRandom: number; // mean for random baseline
  deltaMean: number; // randomMean - methodMean (positive is good)
  deltaPerDraw: number[];
  bootstrapCI?: [number, number];
}

export type PredictorFn = (historyWindow: Draw[]) => Set<number>;

function randInt(rng: () => number, max: number) {
  return Math.floor(rng() * max);
}

function seededRng(seed: number) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function runWalkForwardBacktest(history: Draw[], windowSize: number, predictor: PredictorFn, randomTrials = 100, bootstrapIters = 500, seed = 1): BacktestResult {
  const rng = seededRng(seed);
  const drawsEvaluated = Math.max(0, history.length - windowSize);
  if (drawsEvaluated <= 0) {
    return {
      drawsEvaluated: 0,
      meanExcluded: 0,
      meanExcludedRandom: 0,
      deltaMean: 0,
      deltaPerDraw: [],
    };
  }

  const deltaPerDraw: number[] = [];
  const excludedPerDraw: number[] = [];
  const randomMeanPerDraw: number[] = [];

  for (let t = windowSize; t < history.length; t++) {
    const train = history.slice(t - windowSize, t);
    const actualDraw = [...history[t].main, ...(history[t].supp || [])];
    const actualSet = new Set<number>(actualDraw);

    const predictedNotDrawn = predictor(train); // set of numbers predicted NOT drawn
    // measure excluded winners
    let excluded = 0;
    for (const n of actualSet) {
      if (predictedNotDrawn.has(n)) excluded++;
    }
    excludedPerDraw.push(excluded);

    // random baseline: sample random sets of same size
    const N = predictedNotDrawn.size || 37;
    let randSum = 0;
    for (let r = 0; r < randomTrials; r++) {
      // sample N without replacement uniformly from 1..45
      const pool = Array.from({ length: 45 }, (_, i) => i + 1);
      // shuffle using rng
      for (let i = pool.length - 1; i > 0; i--) {
        const j = randInt(rng, i + 1);
        const tmp = pool[i];
        pool[i] = pool[j];
        pool[j] = tmp;
      }
      const randSet = new Set(pool.slice(0, N));
      let randExcluded = 0;
      for (const n of actualSet) if (randSet.has(n)) randExcluded++;
      randSum += randExcluded;
    }
    const randMean = randSum / randomTrials;
    randomMeanPerDraw.push(randMean);

    deltaPerDraw.push(randMean - excluded);
  }

  const meanExcluded = excludedPerDraw.reduce((a, b) => a + b, 0) / excludedPerDraw.length;
  const meanExcludedRandom = randomMeanPerDraw.reduce((a, b) => a + b, 0) / randomMeanPerDraw.length;
  const deltaMean = deltaPerDraw.reduce((a, b) => a + b, 0) / deltaPerDraw.length;

  // bootstrap CI on delta mean
  const bootMeans: number[] = [];
  for (let it = 0; it < bootstrapIters; it++) {
    let sum = 0;
    for (let k = 0; k < deltaPerDraw.length; k++) {
      const idx = Math.floor(rng() * deltaPerDraw.length);
      sum += deltaPerDraw[idx];
    }
    bootMeans.push(sum / deltaPerDraw.length);
  }
  bootMeans.sort((a, b) => a - b);
  const lo = bootMeans[Math.floor(0.025 * bootMeans.length)] || 0;
  const hi = bootMeans[Math.floor(0.975 * bootMeans.length)] || 0;

  return {
    drawsEvaluated,
    meanExcluded,
    meanExcludedRandom,
    deltaMean,
    deltaPerDraw,
    bootstrapCI: [lo, hi],
  };
}

export function runLeaveOneOutBacktest(history: Draw[], predictor: PredictorFn, randomTrials = 100, bootstrapIters = 500, seed = 1): BacktestResult {
  const rng = seededRng(seed);
  const n = history.length;
  if (n <= 1) {
    return { drawsEvaluated: 0, meanExcluded: 0, meanExcludedRandom: 0, deltaMean: 0, deltaPerDraw: [] };
  }

  const deltaPerDraw: number[] = [];
  const excludedPerDraw: number[] = [];
  const randomMeanPerDraw: number[] = [];

  // For each draw t from 1..n-1, train on history.slice(0,t)
  for (let t = 1; t < n; t++) {
    const train = history.slice(0, t);
    const actualDraw = [...history[t].main, ...(history[t].supp || [])];
    const actualSet = new Set<number>(actualDraw);

    const predictedNotDrawn = predictor(train);
    let excluded = 0;
    for (const num of actualSet) if (predictedNotDrawn.has(num)) excluded++;
    excludedPerDraw.push(excluded);

    const N = predictedNotDrawn.size || 37;
    let randSum = 0;
    for (let r = 0; r < randomTrials; r++) {
      const pool = Array.from({ length: 45 }, (_, i) => i + 1);
      // shuffle using rng
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
      }
      const randSet = new Set(pool.slice(0, N));
      let randExcluded = 0;
      for (const num of actualSet) if (randSet.has(num)) randExcluded++;
      randSum += randExcluded;
    }
    const randMean = randSum / randomTrials;
    randomMeanPerDraw.push(randMean);
    deltaPerDraw.push(randMean - excluded);
  }

  const drawsEvaluated = deltaPerDraw.length;
  const meanExcluded = excludedPerDraw.reduce((a, b) => a + b, 0) / (excludedPerDraw.length || 1);
  const meanExcludedRandom = randomMeanPerDraw.reduce((a, b) => a + b, 0) / (randomMeanPerDraw.length || 1);
  const deltaMean = deltaPerDraw.reduce((a, b) => a + b, 0) / (deltaPerDraw.length || 1);

  // bootstrap CI on delta mean
  const bootMeans: number[] = [];
  for (let it = 0; it < bootstrapIters; it++) {
    let sum = 0;
    for (let k = 0; k < deltaPerDraw.length; k++) {
      const idx = Math.floor(rng() * deltaPerDraw.length);
      sum += deltaPerDraw[idx];
    }
    bootMeans.push(sum / (deltaPerDraw.length || 1));
  }
  bootMeans.sort((a, b) => a - b);
  const lo = bootMeans[Math.floor(0.025 * bootMeans.length)] || 0;
  const hi = bootMeans[Math.floor(0.975 * bootMeans.length)] || 0;

  return {
    drawsEvaluated,
    meanExcluded,
    meanExcludedRandom,
    deltaMean,
    deltaPerDraw,
    bootstrapCI: [lo, hi]
  };
}

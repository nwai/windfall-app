import { computeBatesWeights, BatesParameterSet } from "./batesWeightsCore";
import { weightedSampleWithoutReplacement } from "./weightedSample";

/* ---- Types ---- */
export interface ParameterSearchOptions {
  userNumbers: number[];
  weightedTargets?: Record<number, number>;
  forcedNumbers?: number[];
  excludedNumbers?: number[];
  recentSignal?: number[];
  conditionalProb?: number[];
  targetMatchCount?: number;
  targetWeightedScore?: number;
  maxIterations?: number;
  candidatesPerIter?: number;
  neighborhoodIters?: number;
  neighborhoodScale?: number;
  logEvery?: number;
  seed?: number;
  probabilitySimulations?: number;
  paretoMaxSize?: number;
}

export interface ParetoEntry {
  id: number;
  raw: number;
  weighted: number;
  params: BatesParameterSet;
  candidate: { main: number[]; supp: number[] };
}

export interface SearchResult {
  bestCandidate: { main: number[]; supp: number[]; all: number[] };
  bestParams: BatesParameterSet;
  bestMatchCount: number;
  bestWeightedScore: number;
  iterations: number;
  stoppedEarly: boolean;
  log: string[];
  probability?: {
    pAtLeastRaw: number;
    pAtLeastWeighted: number;
    simulations: number;
    targetRaw: number;
    targetWeighted: number;
  };
  pareto: ParetoEntry[];
  bestRawHistory: number[];
  bestWeightedHistory: number[];
}

/* ---- Bounds ---- */
const DEFAULT_PARAM_BOUNDS = {
  k: { min: 1.5, max: 10 },
  triMode: { min: 0.05, max: 0.95 },
  triMode2: { min: 0.05, max: 0.95 },
  dualTriWeightA: { min: 0.15, max: 0.85 },
  mixWeight: { min: 0.2, max: 0.9 },
  betaHot: { min: 0, max: 2.0 },
  betaCold: { min: 0, max: 2.0 },
  betaGlobal: { min: 0, max: 1.2 },
  gammaConditional: { min: 0, max: 2.5 },
  hotQuantile: { min: 0.55, max: 0.9 },
  coldQuantile: { min: 0.1, max: 0.45 }
};

/* ---- Utilities ---- */
function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }
function rand(rng: () => number, min: number, max: number) { return min + (max - min) * rng(); }

function randomParams(rng: () => number): BatesParameterSet {
  return {
    k: rand(rng, DEFAULT_PARAM_BOUNDS.k.min, DEFAULT_PARAM_BOUNDS.k.max),
    dualTri: rng() < 0.5,
    triMode: rand(rng, DEFAULT_PARAM_BOUNDS.triMode.min, DEFAULT_PARAM_BOUNDS.triMode.max),
    triMode2: rand(rng, DEFAULT_PARAM_BOUNDS.triMode2.min, DEFAULT_PARAM_BOUNDS.triMode2.max),
    dualTriWeightA: rand(rng, DEFAULT_PARAM_BOUNDS.dualTriWeightA.min, DEFAULT_PARAM_BOUNDS.dualTriWeightA.max),
    mixWeight: rand(rng, DEFAULT_PARAM_BOUNDS.mixWeight.min, DEFAULT_PARAM_BOUNDS.mixWeight.max),
    betaHot: rand(rng, DEFAULT_PARAM_BOUNDS.betaHot.min, DEFAULT_PARAM_BOUNDS.betaHot.max),
    betaCold: rand(rng, DEFAULT_PARAM_BOUNDS.betaCold.min, DEFAULT_PARAM_BOUNDS.betaCold.max),
    betaGlobal: rand(rng, DEFAULT_PARAM_BOUNDS.betaGlobal.min, DEFAULT_PARAM_BOUNDS.betaGlobal.max),
    gammaConditional: rand(rng, DEFAULT_PARAM_BOUNDS.gammaConditional.min, DEFAULT_PARAM_BOUNDS.gammaConditional.max),
    hotQuantile: rand(rng, DEFAULT_PARAM_BOUNDS.hotQuantile.min, DEFAULT_PARAM_BOUNDS.hotQuantile.max),
    coldQuantile: rand(rng, DEFAULT_PARAM_BOUNDS.coldQuantile.min, DEFAULT_PARAM_BOUNDS.coldQuantile.max),
    highlightHotCold: true
  };
}

function perturb(p: BatesParameterSet, scale: number, rng: () => number): BatesParameterSet {
  function j(v: number, r: { min: number; max: number }) {
    const span = r.max - r.min;
    return clamp(v + (rng() * 2 - 1) * span * scale, r.min, r.max);
  }
  return {
    k: j(p.k, DEFAULT_PARAM_BOUNDS.k),
    dualTri: p.dualTri,
    triMode: j(p.triMode, DEFAULT_PARAM_BOUNDS.triMode),
    triMode2: j(p.triMode2, DEFAULT_PARAM_BOUNDS.triMode2),
    dualTriWeightA: j(p.dualTriWeightA, DEFAULT_PARAM_BOUNDS.dualTriWeightA),
    mixWeight: j(p.mixWeight, DEFAULT_PARAM_BOUNDS.mixWeight),
    betaHot: j(p.betaHot, DEFAULT_PARAM_BOUNDS.betaHot),
    betaCold: j(p.betaCold, DEFAULT_PARAM_BOUNDS.betaCold),
    betaGlobal: j(p.betaGlobal, DEFAULT_PARAM_BOUNDS.betaGlobal),
    gammaConditional: j(p.gammaConditional, DEFAULT_PARAM_BOUNDS.gammaConditional),
    hotQuantile: j(p.hotQuantile, DEFAULT_PARAM_BOUNDS.hotQuantile),
    coldQuantile: j(p.coldQuantile, DEFAULT_PARAM_BOUNDS.coldQuantile),
    highlightHotCold: true
  };
}

function buildCandidate(weights: number[], excluded: Set<number>, forced: number[], rng: () => number) {
  const forcedMain = forced.slice(0, 6);
  const forcedSupp = forced.slice(6, 8);
  const pool = Array.from({ length: 45 }, (_, i) => i + 1)
    .filter(n => !excluded.has(n) && !forced.includes(n));
  const poolWeights = pool.map(n => weights[n - 1]);

  const needMain = Math.max(0, 6 - forcedMain.length);
  const pickedMain = weightedSampleWithoutReplacement(pool, poolWeights, needMain, rng);
  const remaining = pool.filter(n => !pickedMain.includes(n));
  const remainingWeights = remaining.map(n => weights[n - 1]);
  const needSupp = Math.max(0, 2 - forcedSupp.length);
  const pickedSupp = weightedSampleWithoutReplacement(remaining, remainingWeights, needSupp, rng);

  const main = [...forcedMain, ...pickedMain].slice(0, 6).sort((a, b) => a - b);
  const supp = [...forcedSupp, ...pickedSupp].slice(0, 2).sort((a, b) => a - b);
  return { main, supp, all: [...main, ...supp] };
}

/* Weighted & raw score */
function matchScores(all: number[], userSet: Set<number>, weightsMap: Record<number, number>) {
  let raw = 0;
  let weighted = 0;
  for (const n of all) {
    if (userSet.has(n)) {
      raw++;
      weighted += weightsMap[n] ?? 1;
    }
  }
  return { raw, weighted };
}

/* Pareto frontier maintenance */
function addPareto(
  list: ParetoEntry[],
  entry: ParetoEntry,
  maxSize: number
): ParetoEntry[] {
  // If dominated by any existing, skip.
  for (const e of list) {
    const dominates = (e.raw >= entry.raw && e.weighted >= entry.weighted) &&
      (e.raw > entry.raw || e.weighted > entry.weighted);
    if (dominates) return list;
  }
  // Remove entries dominated by new one
  const filtered = list.filter(e => {
    const dominated = (entry.raw >= e.raw && entry.weighted >= e.weighted) &&
      (entry.raw > e.raw || entry.weighted > e.weighted);
    return !dominated;
  });
  filtered.push(entry);
  // Optionally truncate by a simple heuristic (largest product)
  if (filtered.length > maxSize) {
    filtered.sort((a, b) => (b.raw * b.weighted) - (a.raw * a.weighted));
    return filtered.slice(0, maxSize);
  }
  return filtered;
}

/* ---- Main Search ---- */
export function searchForParameterMatch(opts: ParameterSearchOptions): SearchResult {
  const {
    userNumbers,
    weightedTargets,
    forcedNumbers = [],
    excludedNumbers = [],
    recentSignal,
    conditionalProb,
    targetMatchCount = 4,
    targetWeightedScore,
    maxIterations = 150,
    candidatesPerIter = 15,
    neighborhoodIters = 40,
    neighborhoodScale = 0.15,
    logEvery = 15,
    seed,
    probabilitySimulations = 10000,
    paretoMaxSize = 8
  } = opts;

  // Weighted map
  const wMap: Record<number, number> = {};
  userNumbers.forEach(n => { wMap[n] = (weightedTargets?.[n] ?? 1); });

  // Weighted threshold fallback
  const fallbackWeightedTarget = (() => {
    if (targetWeightedScore) return targetWeightedScore;
    const sorted = userNumbers.map(n => wMap[n]).sort((a, b) => a - b).slice(0, Math.min(4, userNumbers.length));
    return sorted.reduce((a, b) => a + b, 0);
  })();

  let rng = Math.random;
  if (typeof seed === "number") {
    let s = seed >>> 0;
    rng = () => {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  const userSet = new Set(userNumbers);
  const excludedSet = new Set(excludedNumbers);

  let bestParams: BatesParameterSet | null = null;
  let bestCandidate: { main: number[]; supp: number[]; all: number[] } | null = null;
  let bestRaw = -1;
  let bestWeighted = -1;

  let iterations = 0;
  let stoppedEarly = false;
  const log: string[] = [];
  const pareto: ParetoEntry[] = [];
  let paretoId = 0;

  const bestRawHistory: number[] = [];
  const bestWeightedHistory: number[] = [];

  function recordHistory() {
    bestRawHistory.push(bestRaw);
    bestWeightedHistory.push(bestWeighted);
  }

  function evaluateParameterSet(p: BatesParameterSet, phase: string): boolean {
    const weights = computeBatesWeights(p, { recentSignal, conditionalProb }).finalWeights;
    for (let c = 0; c < candidatesPerIter; c++) {
      const cand = buildCandidate(weights, excludedSet, forcedNumbers, rng);
      const scores = matchScores(cand.all, userSet, wMap);

      const improved = (scores.weighted > bestWeighted) ||
        (scores.weighted === bestWeighted && scores.raw > bestRaw);

      // Pareto update
      paretoId++;
      const entry: ParetoEntry = {
        id: paretoId,
        raw: scores.raw,
        weighted: scores.weighted,
        params: p,
        candidate: { main: cand.main, supp: cand.supp }
      };
      const updatedFrontier = addPareto(pareto, entry, paretoMaxSize);
      if (updatedFrontier !== pareto) {
        pareto.length = 0;
        pareto.push(...updatedFrontier);
      }

      if (improved) {
        bestParams = p;
        bestCandidate = cand;
        bestRaw = scores.raw;
        bestWeighted = scores.weighted;
        log.push(`[BEST ${phase}] raw=${scores.raw} weighted=${scores.weighted.toFixed(2)} cand=[${cand.all.join(",")}]`);
        if (scores.raw >= targetMatchCount && scores.weighted >= fallbackWeightedTarget) {
          stoppedEarly = true;
          return true;
        }
      }
    }
    return false;
  }

  // Phase 1: random exploration
  for (let i = 0; i < maxIterations; i++) {
    iterations++;
    if (evaluateParameterSet(randomParams(rng), "rand")) break;
    recordHistory();
    if (i % logEvery === 0) {
      log.push(`[INFO rand] iter=${i} bestRaw=${bestRaw} bestWeighted=${bestWeighted.toFixed(2)}`);
    }
    if (stoppedEarly) break;
  }

  // Phase 2: local refinement
  if (bestParams && !stoppedEarly) {
    for (let i = 0; i < neighborhoodIters; i++) {
      iterations++;
      if (evaluateParameterSet(perturb(bestParams, neighborhoodScale, rng), "local")) break;
      recordHistory();
      if (i % Math.max(5, Math.floor(neighborhoodIters / 4)) === 0) {
        log.push(`[INFO local] iter=${i} bestRaw=${bestRaw} bestWeighted=${bestWeighted.toFixed(2)}`);
      }
      if (stoppedEarly) break;
    }
  }

  // Probability estimation
  let probability: SearchResult["probability"];
  if (bestParams && bestCandidate) {
    const finalWeights = computeBatesWeights(bestParams, { recentSignal, conditionalProb }).finalWeights;
    let rawHits = 0;
    let weightedHits = 0;
    for (let i = 0; i < probabilitySimulations; i++) {
      const cand = buildCandidate(finalWeights, excludedSet, forcedNumbers, rng);
      const scores = matchScores(cand.all, userSet, wMap);
      if (scores.raw >= targetMatchCount) rawHits++;
      if (scores.weighted >= fallbackWeightedTarget) weightedHits++;
    }
    probability = {
      pAtLeastRaw: rawHits / probabilitySimulations,
      pAtLeastWeighted: weightedHits / probabilitySimulations,
      simulations: probabilitySimulations,
      targetRaw: targetMatchCount,
      targetWeighted: fallbackWeightedTarget
    };
    log.push(`[PROB] P(raw≥${targetMatchCount})=${probability.pAtLeastRaw.toFixed(4)} P(weighted≥${fallbackWeightedTarget.toFixed(2)})=${probability.pAtLeastWeighted.toFixed(4)}`);
  }

  // Finalization
  if (!bestParams || !bestCandidate) {
    log.push("[WARN] No improvement achieved.");
    return {
      bestCandidate: { main: [], supp: [], all: [] },
      bestParams: randomParams(rng),
      bestMatchCount: 0,
      bestWeightedScore: 0,
      iterations,
      stoppedEarly,
      log,
      pareto,
      bestRawHistory,
      bestWeightedHistory
    };
  }

  log.push(`[DONE] iterations=${iterations} bestRaw=${bestRaw} bestWeighted=${bestWeighted.toFixed(2)} stoppedEarly=${stoppedEarly}`);

  return {
    bestCandidate,
    bestParams,
    bestMatchCount: bestRaw,
    bestWeightedScore: bestWeighted,
    iterations,
    stoppedEarly,
    log,
    probability,
    pareto,
    bestRawHistory,
    bestWeightedHistory
  };
}
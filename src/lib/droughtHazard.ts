import { Draw } from "../types";

export const DROUGHT_HAZARD_SCOPE = "mains+supps" as const;
export const DROUGHT_HAZARD_ANY_DRAWN_BASELINE = 8 / 45;
const DROUGHT_HAZARD_PRIOR_TRIALS = 2;

export interface DroughtHazardExposure {
  k: number;
  trials: number;
  hitsNext: number;
  rawProbability: number;
  p: number;
}

export interface DroughtHazardNumberRow {
  number: number;
  k: number;
  p: number;
  rawProbability: number;
  trials: number;
  hitsNext: number;
  liftVsBaseline: number;
}

export interface DroughtHazardResult {
  hazard: number[];
  maxK: number;
  byNumber: DroughtHazardNumberRow[];
  exposureByDrought: DroughtHazardExposure[];
  baselineProbability: number;
  scope: typeof DROUGHT_HAZARD_SCOPE;
  priorTrials: number;
}

// Build a 0/1 event series per number (older→newer)
function eventSeries(history: Draw[], n: number): number[] {
  return history.map(d => (d.main.includes(n) || d.supp.includes(n) ? 1 : 0));
}

export function currentDroughtLen(history: Draw[], n: number): number {
  const s = eventSeries(history, n);
  let k = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === 1) break;
    k++;
  }
  return k;
}

function smoothAppearanceRate(hitsNext: number, trials: number): number {
  if (trials <= 0) return 0;
  return (
    hitsNext + DROUGHT_HAZARD_ANY_DRAWN_BASELINE * DROUGHT_HAZARD_PRIOR_TRIALS
  ) / (
    trials + DROUGHT_HAZARD_PRIOR_TRIALS
  );
}

// Empirical hazard with baseline shrinkage: h(k) = observed next-draw appearance rate
// after the current draw has established drought length k. Scope is mains+supps,
// so the neutral per-number baseline is 8 / 45.
export function computeDroughtHazard(history: Draw[]): DroughtHazardResult {
  const maxN = 45;
  if (!history.length) {
    const emptyExposure = [{ k: 0, trials: 0, hitsNext: 0, rawProbability: 0, p: 0 }];
    return {
      hazard: [0],
      maxK: 0,
      byNumber: Array.from({ length: maxN }, (_, i) => ({
        number: i + 1,
        k: 0,
        p: 0,
        rawProbability: 0,
        trials: 0,
        hitsNext: 0,
        liftVsBaseline: 0,
      })),
      exposureByDrought: emptyExposure,
      baselineProbability: DROUGHT_HAZARD_ANY_DRAWN_BASELINE,
      scope: DROUGHT_HAZARD_SCOPE,
      priorTrials: DROUGHT_HAZARD_PRIOR_TRIALS,
    };
  }
  // Pool exposures across all numbers
  const exposures = new Map<number, { trials: number; hitsNext: number }>();

  for (let n = 1; n <= maxN; n++) {
    const s = eventSeries(history, n);
    let k = 0;
    for (let t = 0; t < s.length - 1; t++) {
      // At time t, the current draw is known. First update the drought state
      // from draw t, then check whether the number appears at t+1.
      k = s[t] === 1 ? 0 : k + 1;
      const e = exposures.get(k) || { trials: 0, hitsNext: 0 };
      e.trials += 1;
      if (s[t + 1] === 1) e.hitsNext += 1;
      exposures.set(k, e);
    }
  }

  const maxK = Math.max(0, ...Array.from(exposures.keys()));
  const hazard: number[] = [];
  const exposureByDrought: DroughtHazardExposure[] = [];
  for (let k = 0; k <= maxK; k++) {
    const e = exposures.get(k) || { trials: 0, hitsNext: 0 };
    const rawProbability = e.trials > 0 ? e.hitsNext / e.trials : 0;
    const p = smoothAppearanceRate(e.hitsNext, e.trials);
    hazard[k] = p;
    exposureByDrought[k] = { k, trials: e.trials, hitsNext: e.hitsNext, rawProbability, p };
  }

  const byNumber = Array.from({ length: maxN }, (_, i) => {
    const number = i + 1;
    const k = currentDroughtLen(history, number);
    const kk = Math.min(k, maxK);
    const exposure = exposureByDrought[kk] ?? { k: kk, trials: 0, hitsNext: 0, rawProbability: 0, p: 0 };
    const p = exposure.p ?? 0;
    return {
      number,
      k,
      p,
      rawProbability: exposure.rawProbability,
      trials: exposure.trials,
      hitsNext: exposure.hitsNext,
      liftVsBaseline: p - DROUGHT_HAZARD_ANY_DRAWN_BASELINE,
    };
  });

  return {
    hazard,
    maxK,
    byNumber,
    exposureByDrought,
    baselineProbability: DROUGHT_HAZARD_ANY_DRAWN_BASELINE,
    scope: DROUGHT_HAZARD_SCOPE,
    priorTrials: DROUGHT_HAZARD_PRIOR_TRIALS,
  };
}

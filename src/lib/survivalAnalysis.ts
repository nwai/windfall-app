import type { Draw } from "../types";

export const SURVIVAL_NUMBER_COUNT = 45;

export type SurvivalEvidenceLevel = "exact" | "smoothed" | "prior";

export interface SurvivalDataQuality {
  drawsRead: number;
  drawsWithInvalidNumbers: number;
  invalidNumberEntries: number;
  drawsWithDuplicateNumbers: number;
  duplicateNumberEntries: number;
  drawsWithShortSelection: number;
  drawsWithLongSelection: number;
}

export interface SurvivalSummary {
  draws: number;
  includeSupp: boolean;
  expectedSelections: number;
  meanValidSelections: number;
  baselineRate: number;
}

export interface SurvivalRow {
  number: number;
  hits: number;
  currentDrought: number;
  lastSeenDrawsAgo: number | null;
  baseProbability: number;
  credibleInterval95: [number, number];
  exactExposure: number;
  exactHits: number;
  smoothedExposure: number;
  smoothedHits: number;
  evidence: SurvivalEvidenceLevel;
  excluded: boolean;
  biasWeight: number;
  rawBiasedScore: number;
  biasedProbability: number;
}

export interface SurvivalAnalysis {
  summary: SurvivalSummary;
  rows: SurvivalRow[];
  quality: SurvivalDataQuality;
  caveats: string[];
}

export interface AnalyzeSurvivalOptions {
  includeSupp?: boolean;
  excludedNumbers?: number[];
  priorStrength?: number;
  expectedSelections?: number;
}

export interface CalibrateSurvivalOptions {
  biasWeights?: Record<number, number>;
  scoreMultipliers?: Record<number, number>;
  gamma?: number;
  expectedSelections: number;
}

export interface SurvivalOptimizerOptions {
  forcedNumbers?: number[];
  excludedNumbers?: number[];
  limit?: number;
}

export interface SurvivalOptimizerResult {
  numbers: number[];
  warning?: string;
}

interface CleanDraw {
  selected: Set<number>;
}

type CountMap = Map<number, number>;

export function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

const isValidLotteryNumber = (value: number): boolean => (
  Number.isInteger(value) && value >= 1 && value <= SURVIVAL_NUMBER_COUNT
);

const clampNonNegativeFinite = (value: number, fallback: number): number => (
  Number.isFinite(value) && value >= 0 ? value : fallback
);

const uniqueValidNumbers = (values: number[] | undefined): number[] => {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values ?? []) {
    if (!isValidLotteryNumber(value) || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};

const addToMap = (map: CountMap, key: number, increment = 1): void => {
  map.set(key, (map.get(key) ?? 0) + increment);
};

const mean = (values: number[]): number => (
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
);

const cleanDraw = (
  draw: Draw,
  includeSupp: boolean,
): { clean: CleanDraw; invalidEntries: number; duplicateEntries: number } => {
  const source = includeSupp ? [...draw.main, ...draw.supp] : [...draw.main];
  const selected = new Set<number>();
  let invalidEntries = 0;
  let duplicateEntries = 0;

  for (const value of source) {
    if (!isValidLotteryNumber(value)) {
      invalidEntries += 1;
      continue;
    }
    if (selected.has(value)) {
      duplicateEntries += 1;
      continue;
    }
    selected.add(value);
  }

  return { clean: { selected }, invalidEntries, duplicateEntries };
};

const wilsonInterval = (successes: number, trials: number): [number, number] => {
  if (!Number.isFinite(trials) || trials <= 0) return [0, 1];
  const z = 1.96;
  const z2 = z * z;
  const p = Math.max(0, successes) / trials;
  const denominator = 1 + z2 / trials;
  const center = p + z2 / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials);
  return [
    clampProbability((center - spread) / denominator),
    clampProbability((center + spread) / denominator),
  ];
};

const smoothCountsAtDrought = (
  exposureByDrought: CountMap,
  hitsByDrought: CountMap,
  drought: number,
): { exposure: number; hits: number } => {
  let exposure = 0;
  let hits = 0;

  exposureByDrought.forEach((count, observedDrought) => {
    const weight = 1 / (1 + Math.abs(observedDrought - drought));
    exposure += count * weight;
    hits += (hitsByDrought.get(observedDrought) ?? 0) * weight;
  });

  return { exposure, hits };
};

const evidenceLevel = (exactExposure: number, smoothedExposure: number): SurvivalEvidenceLevel => {
  if (exactExposure >= 8) return "exact";
  if (smoothedExposure >= 8) return "smoothed";
  return "prior";
};

function scaleScoresToProbabilityBudget(
  scores: { number: number; score: number; excluded: boolean }[],
  expectedSelections: number,
): Map<number, number> {
  const result = new Map<number, number>();
  const eligible = scores.filter((row) => !row.excluded);
  const target = Math.max(0, Math.min(expectedSelections, eligible.length));

  for (const row of scores) result.set(row.number, 0);
  if (eligible.length === 0 || target === 0) return result;

  let remaining = eligible.map((row) => ({ ...row, score: clampNonNegativeFinite(row.score, 0) }));
  let remainingTarget = target;

  while (remaining.length > 0 && remainingTarget > 0) {
    const scoreSum = remaining.reduce((sum, row) => sum + row.score, 0);
    if (scoreSum <= 0) {
      const shared = Math.min(1, remainingTarget / remaining.length);
      for (const row of remaining) result.set(row.number, shared);
      break;
    }

    const scale = remainingTarget / scoreSum;
    const capped = remaining.filter((row) => row.score * scale >= 1);

    if (capped.length === 0) {
      for (const row of remaining) result.set(row.number, clampProbability(row.score * scale));
      break;
    }

    for (const row of capped) {
      result.set(row.number, 1);
      remainingTarget -= 1;
    }
    const cappedNumbers = new Set(capped.map((row) => row.number));
    remaining = remaining.filter((row) => !cappedNumbers.has(row.number));
  }

  return result;
}

export function calibrateSurvivalProbabilities<T extends { number: number; baseProbability: number; excluded?: boolean }>(
  rows: T[],
  options: CalibrateSurvivalOptions,
): Array<T & { biasWeight: number; rawBiasedScore: number; biasedProbability: number }> {
  const gamma = Math.max(0, Math.min(8, Number.isFinite(options.gamma ?? 1) ? options.gamma ?? 1 : 1));
  const scored = rows.map((row) => {
    const rawWeight = options.biasWeights?.[row.number] ?? 1;
    const biasWeight = Math.max(0, Math.min(1_000_000, Number.isFinite(rawWeight) ? rawWeight : 1));
    const rawMultiplier = options.scoreMultipliers?.[row.number] ?? 1;
    const scoreMultiplier = Math.max(0, Math.min(1_000_000, Number.isFinite(rawMultiplier) ? rawMultiplier : 1));
    const rawBiasedScore = row.excluded ? 0 : clampProbability(row.baseProbability) * Math.pow(biasWeight, gamma) * scoreMultiplier;
    return {
      number: row.number,
      score: Number.isFinite(rawBiasedScore) ? rawBiasedScore : 0,
      excluded: !!row.excluded,
      biasWeight,
      rawBiasedScore: Number.isFinite(rawBiasedScore) ? rawBiasedScore : 0,
    };
  });
  const calibrated = scaleScoresToProbabilityBudget(scored, options.expectedSelections);
  const scoreByNumber = new Map(scored.map((row) => [row.number, row]));

  return rows.map((row) => {
    const score = scoreByNumber.get(row.number);
    return {
      ...row,
      biasWeight: score?.biasWeight ?? 1,
      rawBiasedScore: score?.rawBiasedScore ?? 0,
      biasedProbability: row.excluded ? 0 : calibrated.get(row.number) ?? 0,
    };
  });
}

export function analyzeSurvival(
  history: Draw[],
  options: AnalyzeSurvivalOptions = {},
): SurvivalAnalysis {
  const includeSupp = !!options.includeSupp;
  const expectedSelections = Math.max(1, Math.min(SURVIVAL_NUMBER_COUNT, Math.round(options.expectedSelections ?? (includeSupp ? 8 : 6))));
  const excludedSet = new Set(uniqueValidNumbers(options.excludedNumbers));
  const priorStrength = Math.max(0.25, Math.min(20, Number.isFinite(options.priorStrength ?? 2) ? options.priorStrength ?? 2 : 2));
  const quality: SurvivalDataQuality = {
    drawsRead: history.length,
    drawsWithInvalidNumbers: 0,
    invalidNumberEntries: 0,
    drawsWithDuplicateNumbers: 0,
    duplicateNumberEntries: 0,
    drawsWithShortSelection: 0,
    drawsWithLongSelection: 0,
  };

  const cleaned = history.map((draw) => {
    const result = cleanDraw(draw, includeSupp);
    if (result.invalidEntries > 0) quality.drawsWithInvalidNumbers += 1;
    if (result.duplicateEntries > 0) quality.drawsWithDuplicateNumbers += 1;
    if (result.clean.selected.size < expectedSelections) quality.drawsWithShortSelection += 1;
    if (result.clean.selected.size > expectedSelections) quality.drawsWithLongSelection += 1;
    quality.invalidNumberEntries += result.invalidEntries;
    quality.duplicateNumberEntries += result.duplicateEntries;
    return result.clean;
  });

  const validSelectionCounts = cleaned.map((draw) => draw.selected.size);
  const meanValidSelections = mean(validSelectionCounts);
  const baselineRate = clampProbability(meanValidSelections / SURVIVAL_NUMBER_COUNT);
  const exposureMaps = Array.from({ length: SURVIVAL_NUMBER_COUNT + 1 }, () => new Map<number, number>());
  const hitMaps = Array.from({ length: SURVIVAL_NUMBER_COUNT + 1 }, () => new Map<number, number>());
  const droughts = Array(SURVIVAL_NUMBER_COUNT + 1).fill(0) as number[];
  const hits = Array(SURVIVAL_NUMBER_COUNT + 1).fill(0) as number[];

  for (const draw of cleaned) {
    for (let number = 1; number <= SURVIVAL_NUMBER_COUNT; number += 1) {
      const drought = droughts[number];
      addToMap(exposureMaps[number], drought);
      if (draw.selected.has(number)) {
        addToMap(hitMaps[number], drought);
        hits[number] += 1;
        droughts[number] = 0;
      } else {
        droughts[number] = drought + 1;
      }
    }
  }

  const baseRows: SurvivalRow[] = Array.from({ length: SURVIVAL_NUMBER_COUNT }, (_, index) => {
    const number = index + 1;
    const currentDrought = droughts[number];
    const exactExposure = exposureMaps[number].get(currentDrought) ?? 0;
    const exactHits = hitMaps[number].get(currentDrought) ?? 0;
    const smoothed = smoothCountsAtDrought(exposureMaps[number], hitMaps[number], currentDrought);
    const posteriorExposure = smoothed.exposure + priorStrength;
    const posteriorHits = smoothed.hits + baselineRate * priorStrength;
    const baseProbability = posteriorExposure > 0 ? clampProbability(posteriorHits / posteriorExposure) : baselineRate;
    const excluded = excludedSet.has(number);

    return {
      number,
      hits: hits[number],
      currentDrought,
      lastSeenDrawsAgo: hits[number] > 0 ? currentDrought : null,
      baseProbability: excluded ? 0 : baseProbability,
      credibleInterval95: wilsonInterval(smoothed.hits, smoothed.exposure),
      exactExposure,
      exactHits,
      smoothedExposure: smoothed.exposure,
      smoothedHits: smoothed.hits,
      evidence: evidenceLevel(exactExposure, smoothed.exposure),
      excluded,
      biasWeight: 1,
      rawBiasedScore: excluded ? 0 : baseProbability,
      biasedProbability: excluded ? 0 : baseProbability,
    };
  });

  const calibratedRows = calibrateSurvivalProbabilities(baseRows, {
    expectedSelections: meanValidSelections || expectedSelections,
    gamma: 1,
  });

  const caveats = [
    "Descriptive only: survival estimates are conditional historical absence rates with Bayesian shrinkage; they do not make lottery draws predictable.",
    "The first row of the selected window is left-censored because pre-window drought history is unknown.",
  ];
  if (quality.invalidNumberEntries > 0 || quality.duplicateNumberEntries > 0) {
    caveats.push("Invalid and duplicate number entries were ignored before exposure and hit counts were estimated.");
  }
  if (quality.drawsWithShortSelection > 0 || quality.drawsWithLongSelection > 0) {
    caveats.push("Some rows do not match the expected selection count; the probability budget uses the observed valid average.");
  }

  return {
    summary: {
      draws: cleaned.length,
      includeSupp,
      expectedSelections,
      meanValidSelections,
      baselineRate,
    },
    rows: calibratedRows,
    quality,
    caveats,
  };
}

export function selectTopSurvivalNumbers(
  rows: Array<{ number: number; biasedProbability: number; excluded?: boolean }>,
  options: SurvivalOptimizerOptions = {},
): SurvivalOptimizerResult {
  const limit = Math.max(1, Math.min(45, Math.floor(options.limit ?? 8)));
  const excluded = new Set(uniqueValidNumbers(options.excludedNumbers));
  const forced = uniqueValidNumbers(options.forcedNumbers);
  const warnings: string[] = [];
  const eligibleForced = forced.filter((number) => !excluded.has(number));

  if (eligibleForced.length < forced.length) {
    warnings.push("Some forced numbers are excluded and could not be selected.");
  }
  if (eligibleForced.length > limit) {
    warnings.push(`Too many forced numbers for a ${limit}-number selection; only the first ${limit} eligible forced numbers were used.`);
  }

  const selection: number[] = [];
  for (const number of eligibleForced) {
    if (selection.length >= limit) break;
    selection.push(number);
  }

  const selected = new Set(selection);
  const sortedRows = [...rows]
    .filter((row) => !row.excluded && !excluded.has(row.number) && !selected.has(row.number))
    .sort((a, b) => b.biasedProbability - a.biasedProbability || a.number - b.number);

  for (const row of sortedRows) {
    if (selection.length >= limit) break;
    selection.push(row.number);
  }

  if (selection.length < limit) {
    warnings.push(`Only ${selection.length} eligible numbers were available for a ${limit}-number selection.`);
  }

  return {
    numbers: selection.slice(0, limit).sort((a, b) => a - b),
    warning: warnings.length ? warnings.join(" ") : undefined,
  };
}

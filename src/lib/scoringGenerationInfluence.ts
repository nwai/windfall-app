import type { CandidateSet, Draw } from "../types";
import {
  analyzeScoringSystemDiagnostics,
  type ScoringDiagnosticsScope,
} from "./scoringSystemDiagnostics";

export type ScoringGenerationInfluence = "off" | "light" | "normal" | "strong";

export interface ScoringGenerationProfile {
  enabled: boolean;
  influence: ScoringGenerationInfluence;
  scope: ScoringDiagnosticsScope;
  numberScores: Record<number, number>;
  numberMultipliers: Record<number, number>;
  ratioScores: Record<string, number>;
  terminalDigitSetScores: Record<string, number>;
  straightRunScores: Record<string, number>;
  traceLabel: string;
}

export interface CandidateScoringEvidence {
  score: number;
  normalizedScore: number;
  components: {
    number: number;
    ratio: number;
    terminalDigitSet: number;
    straightRun: number;
  };
  trace: string[];
}

const INFLUENCE_RANGES: Record<ScoringGenerationInfluence, { min: number; max: number }> = {
  off: { min: 1, max: 1 },
  light: { min: 0.9, max: 1.2 },
  normal: { min: 0.75, max: 1.55 },
  strong: { min: 0.55, max: 2.2 },
};

const MAX_NUMBER = 45;

const clampInfluence = (value: ScoringGenerationInfluence | undefined): ScoringGenerationInfluence => {
  if (value === "light" || value === "normal" || value === "strong") return value;
  return "off";
};

const round4 = (value: number): number => Number(value.toFixed(4));

const terminalDigitSetKey = (numbers: readonly number[]): string => (
  [...new Set(numbers.map((number) => number % 10))]
    .sort((left, right) => left - right)
    .join(",")
);

const ratioKey = (numbers: readonly number[]): string => {
  const odd = numbers.filter((number) => number % 2 !== 0).length;
  return `${odd}:${numbers.length - odd}`;
};

const normalizeScore = (value: number, max: number): number => (
  max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
);

const rowMap = <T extends { combinedDiagnosticScore: number }, K extends string | number>(
  rows: readonly T[],
  getKey: (row: T) => K,
): Record<K, number> => {
  const out = {} as Record<K, number>;
  for (const row of rows) {
    out[getKey(row)] = round4(row.combinedDiagnosticScore);
  }
  return out;
};

const numberMultipliers = (
  numberScores: Record<number, number>,
  influence: ScoringGenerationInfluence,
): Record<number, number> => {
  const range = INFLUENCE_RANGES[influence];
  const values = Array.from({ length: MAX_NUMBER }, (_, index) => numberScores[index + 1] ?? 0);
  const minScore = Math.min(...values);
  const maxScore = Math.max(...values);
  const span = maxScore - minScore;
  const out: Record<number, number> = {};

  for (let number = 1; number <= MAX_NUMBER; number += 1) {
    if (influence === "off" || span <= 0) {
      out[number] = 1;
      continue;
    }
    const normalized = ((numberScores[number] ?? minScore) - minScore) / span;
    out[number] = round4(range.min + normalized * (range.max - range.min));
  }

  return out;
};

export function buildScoringGenerationProfile(
  realHistory: Draw[],
  realFilteredHistory: Draw[],
  options: { scope?: ScoringDiagnosticsScope; influence?: ScoringGenerationInfluence } = {},
): ScoringGenerationProfile {
  const influence = clampInfluence(options.influence);
  const scope = options.scope ?? "mains-plus-supps";
  const diagnostics = analyzeScoringSystemDiagnostics(realHistory, realFilteredHistory, { scope });
  const numberScores = rowMap(diagnostics.numberRows, (row) => row.number);

  return {
    enabled: influence !== "off",
    influence,
    scope,
    numberScores,
    numberMultipliers: numberMultipliers(numberScores, influence),
    ratioScores: rowMap(diagnostics.ratioRows, (row) => row.ratio),
    terminalDigitSetScores: rowMap(diagnostics.terminalDigitSetRows, (row) => row.key),
    straightRunScores: rowMap(diagnostics.straightRunRows, (row) => row.key),
    traceLabel: influence === "off"
      ? "Scoring Diagnostics evidence weighting off."
      : `Scoring Diagnostics ${influence} evidence weighting active; diagnostic support only, not a calibrated next-draw measure.`,
  };
}

export function scoringInfluenceMultiplier(number: number, profile?: ScoringGenerationProfile): number {
  if (!profile?.enabled) return 1;
  if (!Number.isInteger(number) || number < 1 || number > MAX_NUMBER) return 1;
  const multiplier = profile.numberMultipliers[number];
  return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
}

export function scoreCandidateWithScoringProfile(
  candidate: CandidateSet,
  profile?: ScoringGenerationProfile,
): CandidateScoringEvidence {
  if (!profile?.enabled) {
    return {
      score: 0,
      normalizedScore: 0,
      components: { number: 0, ratio: 0, terminalDigitSet: 0, straightRun: 0 },
      trace: [],
    };
  }

  const numbers = [...candidate.main, ...(candidate.supp ?? [])];
  const numberScoreTotal = numbers.reduce((sum, number) => sum + (profile.numberScores[number] ?? 0), 0);
  const numberComponent = numbers.length > 0 ? numberScoreTotal / numbers.length : 0;
  const ratio = ratioKey(numbers);
  const setKey = terminalDigitSetKey(numbers);
  const ratioComponent = profile.ratioScores[ratio] ?? 0;
  const terminalDigitSetComponent = profile.terminalDigitSetScores[setKey] ?? 0;
  const straightRunComponent = profile.straightRunScores[setKey] ?? 0;

  const components = {
    number: round4(numberComponent),
    ratio: round4(ratioComponent),
    terminalDigitSet: round4(terminalDigitSetComponent),
    straightRun: round4(straightRunComponent),
  };
  const score = round4(components.number + components.ratio + components.terminalDigitSet + components.straightRun);
  const maxNumberScore = Math.max(...Object.values(profile.numberScores), 1);
  const maxRatioScore = Math.max(...Object.values(profile.ratioScores), 1);
  const maxSetScore = Math.max(...Object.values(profile.terminalDigitSetScores), 1);
  const maxStraightScore = Math.max(...Object.values(profile.straightRunScores), 0);
  const maxScore = maxNumberScore + maxRatioScore + maxSetScore + maxStraightScore;
  const normalizedScore = round4(normalizeScore(score, maxScore));

  return {
    score,
    normalizedScore,
    components,
    trace: [
      `Scoring Diagnostics diagnostic evidence ${Math.round(normalizedScore * 100)}% (${profile.influence}; number ${components.number.toFixed(1)}, ratio ${ratio} ${components.ratio.toFixed(1)}, terminal digits ${setKey} ${components.terminalDigitSet.toFixed(1)}${components.straightRun > 0 ? `, straight run ${components.straightRun.toFixed(1)}` : ""}).`,
    ],
  };
}

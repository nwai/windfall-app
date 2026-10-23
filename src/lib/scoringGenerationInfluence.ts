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
  traceLabel: string;
}

export interface CandidateScoringEvidence {
  score: number;
  normalizedScore: number;
  components: {
    number: number;
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
    traceLabel: influence === "off"
      ? "Numbers diagnostic evidence weighting off."
      : `Numbers diagnostic ${influence} evidence weighting active during number sampling; survivor tie-break uses mean Numbers score only. Diagnostic support only, not a calibrated next-draw measure.`,
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
      components: { number: 0 },
      trace: [],
    };
  }

  const numbers = profile.scope === "mains" ? candidate.main : [...candidate.main, ...candidate.supp];
  const numberScoreTotal = numbers.reduce((sum, number) => sum + (profile.numberScores[number] ?? 0), 0);
  const numberComponent = numbers.length > 0 ? numberScoreTotal / numbers.length : 0;
  const components = {
    number: round4(numberComponent),
  };
  const score = components.number;
  const maxNumberScore = Math.max(...Object.values(profile.numberScores), 1);
  const normalizedScore = round4(normalizeScore(score, maxNumberScore));

  return {
    score,
    normalizedScore,
    components,
    trace: [
      `Numbers diagnostic evidence ${Math.round(normalizedScore * 100)}% (${profile.influence}; mean Numbers score ${components.number.toFixed(1)}; ${profile.scope}; number-only survivor tie-break).`,
    ],
  };
}

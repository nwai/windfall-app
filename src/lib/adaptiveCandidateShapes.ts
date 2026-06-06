import type { Draw } from "../types";
import type { OddEvenRatioOption } from "./oddEvenRatios";

const DEFAULT_SHRINK_TARGET_SIZE = 50;

export interface AdaptiveShapeEvidenceInput {
  fullHistory: Draw[];
  activeHistory: Draw[];
  shrinkTargetSize?: number;
}

export interface AdaptiveShapeEvidence {
  activeDraws: number;
  latestTargetDraws: number;
  activeWeight: number;
  shrinkTargetSize: number;
  profileOptions: OddEvenRatioOption[];
}

const validMainNumbers = (numbers: number[]): number[] => numbers
  .filter((number) => Number.isInteger(number) && number >= 1 && number <= 45)
  .slice(0, 6);

export const candidateShapeProfile = (main: number[]): string => {
  const numbers = validMainNumbers(main);
  const singleDigits = numbers.filter((number) => number >= 1 && number <= 9);
  const doubleDigits = numbers.filter((number) => number >= 10 && number <= 45);
  const singleOdd = singleDigits.filter((number) => number % 2 !== 0).length;
  const doubleOdd = doubleDigits.filter((number) => number % 2 !== 0).length;
  return `S${singleOdd}:${singleDigits.length - singleOdd} D${doubleOdd}:${doubleDigits.length - doubleOdd}`;
};

const exactMainDraws = (draws: Draw[]): Draw[] => draws
  .filter((draw) => validMainNumbers(draw.main).length === 6);

const profileDistribution = (draws: Draw[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const draw of exactMainDraws(draws)) {
    const profile = candidateShapeProfile(draw.main);
    counts.set(profile, (counts.get(profile) ?? 0) + 1);
  }
  return counts;
};

const normalizeProfileWeights = (weights: Map<string, number>): OddEvenRatioOption[] => {
  const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return [];

  return [...weights.entries()]
    .map(([ratio, weight]) => ({
      ratio,
      count: Math.round((weight / total) * 100),
      percent: Math.round((weight / total) * 100),
    }))
    .filter((option) => option.count > 0)
    .sort((left, right) => right.count - left.count || left.ratio.localeCompare(right.ratio));
};

export function buildAdaptiveShapeEvidence({
  fullHistory,
  activeHistory,
  shrinkTargetSize = DEFAULT_SHRINK_TARGET_SIZE,
}: AdaptiveShapeEvidenceInput): AdaptiveShapeEvidence {
  const targetSize = Math.max(1, Math.floor(Number.isFinite(shrinkTargetSize) ? shrinkTargetSize : DEFAULT_SHRINK_TARGET_SIZE));
  const fullDraws = exactMainDraws(fullHistory);
  const activeDraws = exactMainDraws(activeHistory);
  const latestTargetDraws = fullDraws.slice(-targetSize);
  const activeWeight = activeDraws.length >= targetSize ? 1 : activeDraws.length / targetSize;
  const targetWeight = 1 - activeWeight;
  const activeDistribution = profileDistribution(activeDraws);
  const targetDistribution = profileDistribution(latestTargetDraws);
  const blendedWeights = new Map<string, number>();

  for (const [profile, count] of activeDistribution) {
    const share = activeDraws.length > 0 ? count / activeDraws.length : 0;
    blendedWeights.set(profile, (blendedWeights.get(profile) ?? 0) + share * activeWeight);
  }

  if (targetWeight > 0) {
    for (const [profile, count] of targetDistribution) {
      const share = latestTargetDraws.length > 0 ? count / latestTargetDraws.length : 0;
      blendedWeights.set(profile, (blendedWeights.get(profile) ?? 0) + share * targetWeight);
    }
  }

  return {
    activeDraws: activeDraws.length,
    latestTargetDraws: latestTargetDraws.length,
    activeWeight,
    shrinkTargetSize: targetSize,
    profileOptions: normalizeProfileWeights(blendedWeights),
  };
}

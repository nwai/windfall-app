import type { Draw } from "../types";

const NUMBER_MIN = 1;
const NUMBER_MAX = 45;
const LOW_MAX = 15;
const MID_MAX = 30;
const TOTAL_NUMBER_COUNT = NUMBER_MAX - NUMBER_MIN + 1;
const BASELINE_BAND_SHARE = 15 / TOTAL_NUMBER_COUNT;
const BASELINE_ODD_SHARE = 23 / TOTAL_NUMBER_COUNT;
const BASELINE_EVEN_SHARE = 22 / TOTAL_NUMBER_COUNT;

export type PortfolioWindowShapeBand = "low" | "mid" | "high";
export type PortfolioWindowShapeParity = "odd" | "even";
export type PortfolioWindowShapeStatus = "fit" | "mixed" | "against";

export interface PortfolioWindowShapeEvidenceRow {
  number: number;
  band: PortfolioWindowShapeBand;
  parity: PortfolioWindowShapeParity;
  fitScore: number;
  status: PortfolioWindowShapeStatus;
  bandDelta: number;
  parityDelta: number;
  meanDelta: number;
  bandLabel: string;
  parityLabel: string;
  meanLabel: string;
}

export interface PortfolioWindowShapeEvidence {
  totalDraws: number;
  totalNumbers: number;
  averageNumber: number;
  rows: PortfolioWindowShapeEvidenceRow[];
}

interface PortfolioWindowShapeOptions {
  includeSupp?: boolean;
}

interface ShapeProfile {
  totalDraws: number;
  totalNumbers: number;
  averageNumber: number;
  bandShares: Record<PortfolioWindowShapeBand, number>;
  parityShares: Record<PortfolioWindowShapeParity, number>;
}

const clamp = (value: number, min: number, max: number): number => (
  Math.min(max, Math.max(min, value))
);

const bandForNumber = (number: number): PortfolioWindowShapeBand => {
  if (number <= LOW_MAX) return "low";
  if (number <= MID_MAX) return "mid";
  return "high";
};

const parityForNumber = (number: number): PortfolioWindowShapeParity => (
  number % 2 === 0 ? "even" : "odd"
);

const labelForBand = (band: PortfolioWindowShapeBand): string => {
  if (band === "low") return "Low";
  if (band === "mid") return "Mid";
  return "High";
};

const labelForParity = (parity: PortfolioWindowShapeParity): string => (
  parity === "odd" ? "Odd" : "Even"
);

const signedPercentagePointLabel = (label: string, delta: number): string => {
  const points = Math.round(delta * 100);
  return `${label} ${points >= 0 ? "+" : ""}${points}pp`;
};

const signedMeanLabel = (delta: number): string => (
  `Mean ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`
);

const statusForScore = (fitScore: number): PortfolioWindowShapeStatus => {
  if (fitScore >= 60) return "fit";
  if (fitScore <= 40) return "against";
  return "mixed";
};

const validNumbersForDraw = (draw: Draw, includeSupp: boolean): number[] => {
  const values = includeSupp ? [...draw.main, ...draw.supp] : draw.main;
  return Array.from(new Set(values.filter((value) => (
    Number.isInteger(value) && value >= NUMBER_MIN && value <= NUMBER_MAX
  ))));
};

const buildShapeProfile = (
  history: readonly Draw[],
  includeSupp: boolean,
): ShapeProfile | null => {
  let totalNumbers = 0;
  let sum = 0;
  const bandCounts: Record<PortfolioWindowShapeBand, number> = {
    low: 0,
    mid: 0,
    high: 0,
  };
  const parityCounts: Record<PortfolioWindowShapeParity, number> = {
    odd: 0,
    even: 0,
  };

  for (const draw of history) {
    const numbers = validNumbersForDraw(draw, includeSupp);
    for (const number of numbers) {
      totalNumbers += 1;
      sum += number;
      bandCounts[bandForNumber(number)] += 1;
      parityCounts[parityForNumber(number)] += 1;
    }
  }

  if (totalNumbers === 0) return null;

  return {
    totalDraws: history.length,
    totalNumbers,
    averageNumber: sum / totalNumbers,
    bandShares: {
      low: bandCounts.low / totalNumbers,
      mid: bandCounts.mid / totalNumbers,
      high: bandCounts.high / totalNumbers,
    },
    parityShares: {
      odd: parityCounts.odd / totalNumbers,
      even: parityCounts.even / totalNumbers,
    },
  };
};

export const buildPortfolioWindowShapeEvidence = (
  history: readonly Draw[],
  options: PortfolioWindowShapeOptions = {},
): PortfolioWindowShapeEvidence => {
  const includeSupp = options.includeSupp ?? false;
  const profile = buildShapeProfile(history, includeSupp);

  if (!profile) {
    return {
      totalDraws: history.length,
      totalNumbers: 0,
      averageNumber: 0,
      rows: [],
    };
  }

  const rows: PortfolioWindowShapeEvidenceRow[] = [];
  for (let number = NUMBER_MIN; number <= NUMBER_MAX; number += 1) {
    const band = bandForNumber(number);
    const parity = parityForNumber(number);
    const bandDelta = profile.bandShares[band] - BASELINE_BAND_SHARE;
    const parityBaseline = parity === "odd" ? BASELINE_ODD_SHARE : BASELINE_EVEN_SHARE;
    const parityDelta = profile.parityShares[parity] - parityBaseline;
    const meanDelta = number - profile.averageNumber;
    const meanCloseness = 1 - Math.min(1, Math.abs(meanDelta) / 22);

    const fitScore = Math.round(clamp(
      50
        + bandDelta * 90
        + parityDelta * 80
        + (meanCloseness - 0.5) * 20,
      0,
      100,
    ));

    rows.push({
      number,
      band,
      parity,
      fitScore,
      status: statusForScore(fitScore),
      bandDelta,
      parityDelta,
      meanDelta,
      bandLabel: signedPercentagePointLabel(labelForBand(band), bandDelta),
      parityLabel: signedPercentagePointLabel(labelForParity(parity), parityDelta),
      meanLabel: signedMeanLabel(meanDelta),
    });
  }

  return {
    totalDraws: profile.totalDraws,
    totalNumbers: profile.totalNumbers,
    averageNumber: profile.averageNumber,
    rows,
  };
};

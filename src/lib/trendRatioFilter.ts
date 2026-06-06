import type { TrendRatioStat } from "./computeHistoricalTrendRatios";

export interface ParsedTrendRatio {
  tag: string;
  up: number;
  down: number;
  flat: number;
}

export interface TrendRatioFilterRow extends TrendRatioStat {
  selected: boolean;
  expected: number;
  probability: number;
  zScore: number | null;
  posteriorMean: number;
}

export interface TrendRatioFilterSummary {
  eligibleDraws: number;
  selectedDraws: number;
  coveragePercent: number;
  selectedRatioCount: number;
  pUp: number;
  pDown: number;
  pFlat: number;
}

export interface TrendRatioFilterModel {
  rows: TrendRatioFilterRow[];
  summary: TrendRatioFilterSummary;
  cleanedAllowedRatios: string[];
}

function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
}

export function parseTrendRatioTag(tag: string): ParsedTrendRatio | null {
  const parts = tag.split("-");
  if (parts.length !== 3) return null;
  const [up, down, flat] = parts.map((part) => Number(part));
  if (![up, down, flat].every((value) => Number.isInteger(value) && value >= 0)) return null;
  if (up + down + flat !== 8) return null;
  return { tag: `${up}-${down}-${flat}`, up, down, flat };
}

function multinomialProbability(up: number, down: number, flat: number, pUp: number, pDown: number, pFlat: number): number {
  const coeff = factorial(8) / (factorial(up) * factorial(down) * factorial(flat));
  return coeff * Math.pow(pUp, up) * Math.pow(pDown, down) * Math.pow(pFlat, flat);
}

export function buildTrendRatioFilterModel(
  stats: TrendRatioStat[],
  allowedTrendRatios: string[] = [],
): TrendRatioFilterModel {
  const validStats = stats
    .map((stat) => ({ stat, parsed: parseTrendRatioTag(stat.tag) }))
    .filter((entry): entry is { stat: TrendRatioStat; parsed: ParsedTrendRatio } => entry.parsed !== null && entry.stat.count > 0);

  const eligibleDraws = validStats.reduce((sum, { stat }) => sum + stat.count, 0);
  const validTags = new Set(validStats.map(({ parsed }) => parsed.tag));
  const cleanedAllowedRatios = Array.from(new Set(allowedTrendRatios.filter((tag) => validTags.has(tag))));
  const selectedSet = new Set(cleanedAllowedRatios);

  if (!eligibleDraws) {
    return {
      rows: [],
      cleanedAllowedRatios: [],
      summary: {
        eligibleDraws: 0,
        selectedDraws: 0,
        coveragePercent: 0,
        selectedRatioCount: 0,
        pUp: 0,
        pDown: 0,
        pFlat: 0,
      },
    };
  }

  const totalClassifications = validStats.reduce(
    (sum, { stat }) => sum + stat.up + stat.down + stat.flat,
    0,
  );
  const pUp = totalClassifications > 0
    ? validStats.reduce((sum, { stat }) => sum + stat.up, 0) / totalClassifications
    : 1 / 3;
  const pDown = totalClassifications > 0
    ? validStats.reduce((sum, { stat }) => sum + stat.down, 0) / totalClassifications
    : 1 / 3;
  const pFlat = Math.max(0, 1 - pUp - pDown);

  const rows = validStats
    .map(({ stat, parsed }) => {
      const probability = multinomialProbability(parsed.up, parsed.down, parsed.flat, pUp, pDown, pFlat);
      const expected = eligibleDraws * probability;
      const variance = eligibleDraws * probability * (1 - probability);
      const zScore = expected > 0 && variance > 0 ? (stat.count - expected) / Math.sqrt(variance) : null;
      const posteriorMean = (stat.count + 0.5) / (eligibleDraws + 1);
      return {
        ...stat,
        tag: parsed.tag,
        up: parsed.up,
        down: parsed.down,
        flat: parsed.flat,
        percent: +(100 * stat.count / eligibleDraws).toFixed(2),
        selected: selectedSet.has(parsed.tag),
        expected,
        probability,
        zScore,
        posteriorMean,
      };
    })
    .sort((a, b) => Number(b.selected) - Number(a.selected) || b.count - a.count || a.tag.localeCompare(b.tag));

  const selectedDraws = rows
    .filter((row) => row.selected)
    .reduce((sum, row) => sum + row.count, 0);

  return {
    rows,
    cleanedAllowedRatios,
    summary: {
      eligibleDraws,
      selectedDraws,
      coveragePercent: +(100 * selectedDraws / eligibleDraws).toFixed(2),
      selectedRatioCount: cleanedAllowedRatios.length,
      pUp,
      pDown,
      pFlat,
    },
  };
}

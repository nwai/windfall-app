import type { Draw } from "../types";
import { windowPatternForNumbers } from "./windowPatternMatching";
import { strictValidateDraws } from "./strictDrawValidation";
import { datePartsToIso, isScheduledDrawDate, parseDrawDateParts } from "./planningDrawContext";

/**
 * Pattern statistics and analytics helpers
 * Descriptive draw-composition analytics. These functions do not influence generation.
 */

export interface PatternFeatures {
  consecPairs: number[];      // Number of consecutive pairs in each draw
  evenCounts: number[];        // Number of even numbers in each draw
  lowCounts: number[];         // Number of low numbers (<=22) in each draw
  sums: number[];              // Sum of the numbers in the chosen scope
}

/**
 * Compute pattern features for the entire history
 * @param history Array of draws
 * @returns PatternFeatures containing arrays for each feature
 */
export function computePatternFeaturesForHistory(history: Draw[], includeSupp = false): PatternFeatures {
  const consecPairs: number[] = [];
  const evenCounts: number[] = [];
  const lowCounts: number[] = [];
  const sums: number[] = [];

  for (const draw of history) {
    const numbers = includeSupp ? [...draw.main, ...draw.supp] : draw.main;
    const stats = compositionForNumbers(numbers);
    consecPairs.push(stats.consecPairs);
    evenCounts.push(stats.evenCounts);
    lowCounts.push(stats.lowCounts);
    sums.push(stats.sums);
  }

  return { consecPairs, evenCounts, lowCounts, sums };
}

/**
 * Calculate per-number frequency across history
 * @param history Array of draws
 * @param includeSupp Whether to include supplementary numbers (default: false)
 * @returns Record mapping number to frequency count
 */
export function perNumberFrequency(
  history: Draw[],
  includeSupp = false
): Record<number, number> {
  const freq: Record<number, number> = {};

  // Initialize all numbers 1-45 to 0
  for (let i = 1; i <= 45; i++) {
    freq[i] = 0;
  }

  // Count occurrences
  for (const draw of history) {
    for (const num of draw.main) {
      freq[num] = (freq[num] || 0) + 1;
    }
    if (includeSupp) {
      for (const num of draw.supp) {
        freq[num] = (freq[num] || 0) + 1;
      }
    }
  }

  return freq;
}

/**
 * Get top N numbers by frequency
 * @param freq Frequency map
 * @param n Number of top numbers to return
 * @returns Array of [number, frequency] tuples, sorted by frequency descending
 */
export function getTopNumbers(
  freq: Record<number, number>,
  n = 10
): Array<[number, number]> {
  return Object.entries(freq)
    .map(([num, count]) => [parseInt(num), count] as [number, number])
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, n);
}

/**
 * Get bottom N numbers by frequency
 * @param freq Frequency map
 * @param n Number of bottom numbers to return
 * @returns Array of [number, frequency] tuples, sorted by frequency ascending
 */
export function getBottomNumbers(
  freq: Record<number, number>,
  n = 10
): Array<[number, number]> {
  return Object.entries(freq)
    .map(([num, count]) => [parseInt(num), count] as [number, number])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .slice(0, n);
}

/**
 * Create histogram bins for a distribution
 * @param values Array of values
 * @param numBins Number of bins (default: 10)
 * @returns Array of bins with min, max, and count
 */
export function createHistogram(
  values: number[],
  numBins = 10
): Array<{ min: number; max: number; count: number }> {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return [];
  const binCount = Number.isFinite(numBins) ? Math.max(1, Math.min(100, Math.trunc(numBins))) : 10;
  const { min, max } = finite.reduce((range, value) => ({ min: Math.min(range.min, value), max: Math.max(range.max, value) }),
    { min: Infinity, max: -Infinity });
  if (min === max) return [{ min, max, count: finite.length }];
  const binWidth = (max - min) / binCount;

  const bins: Array<{ min: number; max: number; count: number }> = [];
  for (let i = 0; i < binCount; i++) {
    const binMin = min + i * binWidth;
    const binMax = i === binCount - 1 ? max : min + (i + 1) * binWidth;
    bins.push({ min: binMin, max: binMax, count: 0 });
  }

  for (const value of finite) {
    const binIndex = Math.min(Math.floor((value - min) / binWidth), binCount - 1);
    if (binIndex >= 0 && binIndex < bins.length) {
      bins[binIndex].count++;
    }
  }

  return bins;
}

export type CompositionValues = { [K in keyof PatternFeatures]: number };
export interface CompositionFrequencyRow { min: number; max: number; count: number; percent: number }

export function compositionForNumbers(numbers: readonly number[]): CompositionValues {
  const sorted = [...numbers].sort((a, b) => a - b);
  const pattern = windowPatternForNumbers(numbers);
  return { consecPairs: sorted.slice(1).filter((n, i) => n === sorted[i] + 1).length,
    evenCounts: pattern.even, lowCounts: pattern.low, sums: pattern.sum };
}

export function exactCountDistribution(values: number[], maximum: number): CompositionFrequencyRow[] {
  return Array.from({ length: maximum + 1 }, (_, value) => {
    const count = values.filter(n => n === value).length;
    return { min: value, max: value, count, percent: values.length ? count / values.length * 100 : 0 };
  });
}

function compositionSumBand(value: number, numberCount: 6 | 8) {
  const start = Math.floor(value / 20) * 20;
  return { min: Math.max(numberCount * (numberCount + 1) / 2, start),
    max: Math.min(numberCount * (91 - numberCount) / 2, start + 19) };
}

export function compositionSumDistribution(values: number[], numberCount: 6 | 8): CompositionFrequencyRow[] {
  if (!values.length) return [];
  const minimum = values.reduce((a, b) => Math.min(a, b), Infinity);
  const maximum = values.reduce((a, b) => Math.max(a, b), -Infinity);
  const rows: CompositionFrequencyRow[] = [];
  for (let start = Math.floor(minimum / 20) * 20; start <= maximum; start += 20) {
    const { min, max } = compositionSumBand(start, numberCount);
    const count = values.filter(n => n >= min && n <= max).length;
    rows.push({ min, max, count, percent: count / values.length * 100 });
  }
  return rows;
}

export function historicalDrawComposition(history: Draw[], includeSupp = false) {
  const ignored = { simulated: 0, invalid: 0, offSchedule: 0, duplicate: 0, conflict: 0 };
  const groups = new Map<string, Draw[]>();
  for (const draw of history) {
    if (draw.isSimulated) { ignored.simulated++; continue; }
    if (!strictValidateDraws([draw]).length) { ignored.invalid++; continue; }
    const date = parseDrawDateParts(draw.date);
    if (!date) { ignored.invalid++; continue; }
    if (!isScheduledDrawDate(date)) { ignored.offSchedule++; continue; }
    const key = datePartsToIso(date);
    groups.set(key, [...(groups.get(key) ?? []), draw]);
  }
  const eligible: Draw[] = [];
  for (const [date, rows] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
    const versions = new Set(rows.map(draw => JSON.stringify([[...draw.main].sort((a,b) => a-b), [...draw.supp].sort((a,b) => a-b)])));
    if (versions.size > 1) { ignored.conflict += rows.length; continue; }
    eligible.push({ ...rows[0], date });
    ignored.duplicate += rows.length - 1;
  }
  const features = computePatternFeaturesForHistory(eligible, includeSupp);
  const numberCount = includeSupp ? 8 : 6;
  const distributions = {
    consecPairs: exactCountDistribution(features.consecPairs, numberCount - 1),
    evenCounts: exactCountDistribution(features.evenCounts, numberCount),
    lowCounts: exactCountDistribution(features.lowCounts, numberCount),
    sums: compositionSumDistribution(features.sums, numberCount),
  };
  return { features, distributions, ignored, drawCount: eligible.length,
    firstDate: eligible[0]?.date ?? null, latestDate: eligible[eligible.length - 1]?.date ?? null };
}

export function compositionSelectionComparison(numbers: readonly number[], includeSupp: boolean,
  analysis: ReturnType<typeof historicalDrawComposition>) {
  const expected = includeSupp ? 8 : 6;
  if (numbers.some(n => !Number.isInteger(n) || n < 1 || n > 45) || new Set(numbers).size !== numbers.length) {
    return { status: "invalid" as const, message: "Not compared: the selection contains invalid or duplicate values." };
  }
  if (numbers.length !== expected) return { status: "incomplete" as const,
    message: `Not compared: ${numbers.length} numbers selected; this scope describes ${expected}. No main or supplementary roles were inferred.` };
  if (!analysis.drawCount) return { status: "unavailable" as const, message: "No eligible historical draws are available for comparison." };
  const values = compositionForNumbers(numbers);
  const counts = Object.fromEntries(Object.entries(values).map(([key, value]) => {
    const feature = key as keyof PatternFeatures;
    const row = analysis.distributions[feature].find(row => value >= row.min && value <= row.max);
    const band = feature === "sums" ? compositionSumBand(value, expected) : { min: value, max: value };
    return [feature, { value, count: row?.count ?? 0, percent: row?.percent ?? 0,
      min: row?.min ?? band.min, max: row?.max ?? band.max }];
  })) as { [K in keyof PatternFeatures]: { value: number; count: number; percent: number; min: number; max: number } };
  return { status: "complete" as const, message: "Descriptive comparison only. Historical frequency is not a next-draw probability.", values: counts };
}

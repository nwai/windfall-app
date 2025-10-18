import { Draw } from "../types";

/**
 * Pattern statistics and analytics helpers
 * Python-inspired analytics for windfall-app
 */

export interface PatternFeatures {
  consecPairs: number[];      // Number of consecutive pairs in each draw
  evenCounts: number[];        // Number of even numbers in each draw
  lowCounts: number[];         // Number of low numbers (<=22) in each draw
  sums: number[];              // Sum of main numbers in each draw
}

/**
 * Compute pattern features for the entire history
 * @param history Array of draws
 * @returns PatternFeatures containing arrays for each feature
 */
export function computePatternFeaturesForHistory(history: Draw[]): PatternFeatures {
  const consecPairs: number[] = [];
  const evenCounts: number[] = [];
  const lowCounts: number[] = [];
  const sums: number[] = [];

  for (const draw of history) {
    // Count consecutive pairs in main numbers
    const sortedMain = [...draw.main].sort((a, b) => a - b);
    let consecCount = 0;
    for (let i = 0; i < sortedMain.length - 1; i++) {
      if (sortedMain[i + 1] === sortedMain[i] + 1) {
        consecCount++;
      }
    }
    consecPairs.push(consecCount);

    // Count even numbers in main
    const evenCount = draw.main.filter((n) => n % 2 === 0).length;
    evenCounts.push(evenCount);

    // Count low numbers (<=22) in main
    const lowCount = draw.main.filter((n) => n <= 22).length;
    lowCounts.push(lowCount);

    // Sum of main numbers
    const sum = draw.main.reduce((a, b) => a + b, 0);
    sums.push(sum);
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
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const binWidth = max === min ? 1 : (max - min) / numBins;

  const bins: Array<{ min: number; max: number; count: number }> = [];
  for (let i = 0; i < numBins; i++) {
    const binMin = min + i * binWidth;
    const binMax = i === numBins - 1 ? max : min + (i + 1) * binWidth;
    bins.push({ min: binMin, max: binMax, count: 0 });
  }

  for (const value of values) {
    let binIndex: number;
    if (binWidth === 0 || max === min) {
      binIndex = 0; // All values are the same, put in first bin
    } else {
      binIndex = Math.min(
        Math.floor((value - min) / binWidth),
        numBins - 1
      );
    }
    if (binIndex >= 0 && binIndex < bins.length) {
      bins[binIndex].count++;
    }
  }

  return bins;
}

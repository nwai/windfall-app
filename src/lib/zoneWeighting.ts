/**
 * Zone Weighting utilities
 *
 * Compute zone-level weights from zone trends and map them to per-number weights
 */

import { ZoneTrend, ZONE_RANGES, getZoneIndex } from './zoneAnalysis';

export interface ZoneWeightOptions {
  /**
   * Base weight for all zones (default: 1.0)
   */
  baseWeight?: number;

  /**
   * Scaling factor for trend-based adjustments (default: 0.5)
   * Higher values = more aggressive weighting based on trends
   */
  trendScale?: number;

  /**
   * Minimum weight allowed (default: 0.1)
   */
  minWeight?: number;

  /**
   * Maximum weight allowed (default: 2.0)
   */
  maxWeight?: number;

  /**
   * Only weight zones with significant trends (p < threshold)
   * If undefined, all trends are considered
   */
  significanceThreshold?: number;
}

/**
 * Suggest zone-level weights based on zone trends
 * Returns a record mapping zone index (0-8) to weight
 */
export function suggestZoneWeightsFromTrends(
  zoneTrends: ZoneTrend[],
  options: ZoneWeightOptions = {}
): Record<number, number> {
  const {
    baseWeight = 1.0,
    trendScale = 0.5,
    minWeight = 0.1,
    maxWeight = 2.0,
    significanceThreshold,
  } = options;

  const weights: Record<number, number> = {};

  for (const trend of zoneTrends) {
    let weight = baseWeight;

    // Only adjust if trend is significant (if threshold specified)
    const isSignificant = significanceThreshold === undefined || trend.pValue < significanceThreshold;

    if (isSignificant) {
      // Weight based on slope direction and magnitude
      // Positive slope (upward trend) = increase weight
      // Negative slope (downward trend) = decrease weight
      const adjustment = trend.slope * trendScale;
      weight = baseWeight + adjustment;

      // Clamp to min/max
      weight = Math.max(minWeight, Math.min(maxWeight, weight));
    }

    weights[trend.zoneIdx] = weight;
  }

  return weights;
}

/**
 * Map zone weights to per-number weights (1-45)
 * Returns a record mapping number to weight
 */
export function mapZoneWeightsToNumbers(zoneWeights: Record<number, number>): Record<number, number> {
  const numberWeights: Record<number, number> = {};

  for (let num = 1; num <= 45; num++) {
    const zoneIdx = getZoneIndex(num);
    if (zoneIdx !== null && zoneIdx in zoneWeights) {
      numberWeights[num] = zoneWeights[zoneIdx];
    } else {
      numberWeights[num] = 1.0; // Default weight
    }
  }

  return numberWeights;
}

/**
 * Get per-number weights directly from zone trends
 * This is a convenience function that combines suggestZoneWeightsFromTrends
 * and mapZoneWeightsToNumbers
 */
export function getNumberWeightsFromTrends(
  zoneTrends: ZoneTrend[],
  options: ZoneWeightOptions = {}
): Record<number, number> {
  const zoneWeights = suggestZoneWeightsFromTrends(zoneTrends, options);
  return mapZoneWeightsToNumbers(zoneWeights);
}

/**
 * Normalize weights so they sum to a target value
 * Useful for ensuring weights represent a probability distribution
 */
export function normalizeWeights(
  weights: Record<number, number>,
  targetSum: number = 45
): Record<number, number> {
  const numbers = Object.keys(weights).map(Number);
  const currentSum = numbers.reduce((sum, num) => sum + weights[num], 0);

  if (currentSum === 0) return weights;

  const normalized: Record<number, number> = {};
  const scale = targetSum / currentSum;

  for (const num of numbers) {
    normalized[num] = weights[num] * scale;
  }

  return normalized;
}

/**
 * Export weights as a simple array [weight1, weight2, ..., weight45]
 * Missing weights default to 1.0
 */
export function weightsToArray(weights: Record<number, number>): number[] {
  const arr: number[] = [];
  for (let num = 1; num <= 45; num++) {
    arr.push(weights[num] ?? 1.0);
  }
  return arr;
}

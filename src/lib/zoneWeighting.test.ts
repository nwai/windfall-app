/**
 * Tests for zone weighting utilities
 */

import { describe, it, expect } from 'vitest';
import {
  suggestZoneWeightsFromTrends,
  mapZoneWeightsToNumbers,
  getNumberWeightsFromTrends,
  normalizeWeights,
  weightsToArray,
} from './zoneWeighting';
import { ZoneTrend, getZoneIndex } from './zoneAnalysis';

// Create mock zone trends
const mockTrends: ZoneTrend[] = [
  { zoneIdx: 0, slope: 0.05, intercept: 0, rSquared: 0.8, pValue: 0.01, direction: 'up' },
  { zoneIdx: 1, slope: -0.03, intercept: 0, rSquared: 0.6, pValue: 0.05, direction: 'down' },
  { zoneIdx: 2, slope: 0.001, intercept: 0, rSquared: 0.1, pValue: 0.8, direction: 'flat' },
  { zoneIdx: 3, slope: 0.02, intercept: 0, rSquared: 0.5, pValue: 0.15, direction: 'flat' },
  { zoneIdx: 4, slope: -0.01, intercept: 0, rSquared: 0.3, pValue: 0.3, direction: 'flat' },
  { zoneIdx: 5, slope: 0.04, intercept: 0, rSquared: 0.7, pValue: 0.02, direction: 'up' },
  { zoneIdx: 6, slope: -0.02, intercept: 0, rSquared: 0.4, pValue: 0.2, direction: 'flat' },
  { zoneIdx: 7, slope: 0.001, intercept: 0, rSquared: 0.2, pValue: 0.5, direction: 'flat' },
  { zoneIdx: 8, slope: -0.04, intercept: 0, rSquared: 0.75, pValue: 0.03, direction: 'down' },
];

describe('zoneWeighting legacy harness', () => {
  it('runs legacy assertions', () => {
    // Test suggestZoneWeightsFromTrends
    const zoneWeights = suggestZoneWeightsFromTrends(mockTrends);
    expect(Object.keys(zoneWeights).length).toBeGreaterThanOrEqual(9);
    expect(zoneWeights[0]).toBeGreaterThan(1.0);
    expect(zoneWeights[1]).toBeLessThan(1.0);

    // Test with significance threshold
    const significantWeights = suggestZoneWeightsFromTrends(mockTrends, { significanceThreshold: 0.05 });
    expect(significantWeights[3]).toBe(1.0);

    // Test mapZoneWeightsToNumbers
    const numberWeights = mapZoneWeightsToNumbers(zoneWeights);
    expect(Object.keys(numberWeights).length).toBe(45);
    // determine zones dynamically
    const z1 = getZoneIndex(1)!;
    const z45 = getZoneIndex(45)!;
    const z23 = getZoneIndex(23)!;
    if (zoneWeights[z1] !== undefined) {
      expect(numberWeights[1]).toBe(zoneWeights[z1]);
    } else {
      expect(numberWeights[1]).toBe(1.0);
    }
    if (zoneWeights[z45] !== undefined) {
      expect(numberWeights[45]).toBe(zoneWeights[z45]);
    } else {
      expect(numberWeights[45]).toBe(1.0);
    }
    if (zoneWeights[z23] !== undefined) {
      expect(numberWeights[23]).toBe(zoneWeights[z23]);
    } else {
      expect(numberWeights[23]).toBe(1.0);
    }

    // Test getNumberWeightsFromTrends
    const directWeights = getNumberWeightsFromTrends(mockTrends);
    expect(Object.keys(directWeights).length).toBe(45);

    // Test normalizeWeights
    const testWeights: Record<number, number> = { 1: 2, 2: 3, 3: 5 };
    const normalized = normalizeWeights(testWeights, 30);
    const sum = Object.values(normalized).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 30)).toBeLessThan(0.01);

    // Test weightsToArray
    const smallWeights: Record<number, number> = { 1: 1.5, 2: 0.8, 45: 1.2 };
    const arr = weightsToArray(smallWeights);
    expect(arr.length).toBe(45);
    expect(arr[0]).toBe(1.5);
    expect(arr[44]).toBe(1.2);
    expect(arr[5]).toBe(1.0);

    // Test weight bounds
    const extremeTrends: ZoneTrend[] = [
      { zoneIdx: 0, slope: 10, intercept: 0, rSquared: 0.9, pValue: 0.001, direction: 'up' },
      { zoneIdx: 1, slope: -10, intercept: 0, rSquared: 0.9, pValue: 0.001, direction: 'down' },
    ];
    const boundedWeights = suggestZoneWeightsFromTrends(extremeTrends, { minWeight: 0.5, maxWeight: 1.5 });
    expect(boundedWeights[0]).toBeLessThanOrEqual(1.5);
    expect(boundedWeights[1]).toBeGreaterThanOrEqual(0.5);
  });
});

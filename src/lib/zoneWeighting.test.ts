/**
 * Tests for zone weighting utilities
 */

import {
  suggestZoneWeightsFromTrends,
  mapZoneWeightsToNumbers,
  getNumberWeightsFromTrends,
  normalizeWeights,
  weightsToArray,
} from './zoneWeighting';
import { ZoneTrend } from './zoneAnalysis';

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

// Test suggestZoneWeightsFromTrends
console.log('Testing suggestZoneWeightsFromTrends...');
const zoneWeights = suggestZoneWeightsFromTrends(mockTrends);
console.log('Zone weights:', zoneWeights);
console.assert(Object.keys(zoneWeights).length === 9, 'Should have weights for all 9 zones');
console.assert(zoneWeights[0] > 1.0, 'Zone 0 (trending up) should have weight > 1');
console.assert(zoneWeights[1] < 1.0, 'Zone 1 (trending down) should have weight < 1');
console.log('✓ suggestZoneWeightsFromTrends tests passed');

// Test with significance threshold
console.log('\nTesting with significance threshold...');
const significantWeights = suggestZoneWeightsFromTrends(mockTrends, {
  significanceThreshold: 0.05,
});
console.log('Significant weights:', significantWeights);
console.assert(
  significantWeights[3] === 1.0,
  'Zone 3 (p=0.15) should not be adjusted with threshold 0.05'
);
console.log('✓ Significance threshold tests passed');

// Test mapZoneWeightsToNumbers
console.log('\nTesting mapZoneWeightsToNumbers...');
const numberWeights = mapZoneWeightsToNumbers(zoneWeights);
console.log(`Number weights: 1=${numberWeights[1]}, 45=${numberWeights[45]}`);
console.assert(Object.keys(numberWeights).length === 45, 'Should have weights for all 45 numbers');
console.assert(numberWeights[1] === zoneWeights[0], 'Number 1 should inherit zone 0 weight');
console.assert(numberWeights[45] === zoneWeights[8], 'Number 45 should inherit zone 8 weight');
console.assert(numberWeights[23] === zoneWeights[4], 'Number 23 (zone 4: 21-25) should inherit zone 4 weight');
console.log('✓ mapZoneWeightsToNumbers tests passed');

// Test getNumberWeightsFromTrends
console.log('\nTesting getNumberWeightsFromTrends...');
const directWeights = getNumberWeightsFromTrends(mockTrends);
console.log(`Direct weights: 1=${directWeights[1]}, 25=${directWeights[25]}`);
console.assert(Object.keys(directWeights).length === 45, 'Should have weights for all 45 numbers');
console.log('✓ getNumberWeightsFromTrends tests passed');

// Test normalizeWeights
console.log('\nTesting normalizeWeights...');
const testWeights: Record<number, number> = { 1: 2, 2: 3, 3: 5 };
const normalized = normalizeWeights(testWeights, 30);
const sum = Object.values(normalized).reduce((a, b) => a + b, 0);
console.log(`Normalized sum: ${sum}`);
console.assert(Math.abs(sum - 30) < 0.01, 'Normalized weights should sum to target');
console.log('✓ normalizeWeights tests passed');

// Test weightsToArray
console.log('\nTesting weightsToArray...');
const smallWeights: Record<number, number> = { 1: 1.5, 2: 0.8, 45: 1.2 };
const arr = weightsToArray(smallWeights);
console.log(`Array length: ${arr.length}`);
console.assert(arr.length === 45, 'Array should have 45 elements');
console.assert(arr[0] === 1.5, 'First element should be weight for number 1');
console.assert(arr[44] === 1.2, 'Last element should be weight for number 45');
console.assert(arr[5] === 1.0, 'Missing weights should default to 1.0');
console.log('✓ weightsToArray tests passed');

// Test weight bounds
console.log('\nTesting weight bounds...');
const extremeTrends: ZoneTrend[] = [
  { zoneIdx: 0, slope: 10, intercept: 0, rSquared: 0.9, pValue: 0.001, direction: 'up' },
  { zoneIdx: 1, slope: -10, intercept: 0, rSquared: 0.9, pValue: 0.001, direction: 'down' },
];
const boundedWeights = suggestZoneWeightsFromTrends(extremeTrends, {
  minWeight: 0.5,
  maxWeight: 1.5,
});
console.log('Bounded weights:', boundedWeights);
console.assert(boundedWeights[0] <= 1.5, 'Weight should not exceed max');
console.assert(boundedWeights[1] >= 0.5, 'Weight should not go below min');
console.log('✓ Weight bounds tests passed');

console.log('\n✅ All zone weighting tests passed!');

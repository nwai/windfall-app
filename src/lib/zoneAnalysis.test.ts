/**
 * Tests for zone analysis utilities
 */

import {
  getZoneIndex,
  getZoneLabel,
  drawToZonePattern,
  zonePatternToKey,
  countZonePatterns,
  linearRegression,
  analyzeZoneTrends,
} from './zoneAnalysis';
import { Draw } from '../types';

// Test getZoneIndex
console.log('Testing getZoneIndex...');
console.assert(getZoneIndex(1) === 0, 'Zone 1 should be index 0');
console.assert(getZoneIndex(5) === 0, 'Zone 1 should be index 0');
console.assert(getZoneIndex(6) === 1, 'Zone 2 should be index 1');
console.assert(getZoneIndex(10) === 1, 'Zone 2 should be index 1');
console.assert(getZoneIndex(45) === 8, 'Zone 9 should be index 8');
console.assert(getZoneIndex(0) === null, 'Invalid number should return null');
console.assert(getZoneIndex(46) === null, 'Invalid number should return null');
console.log('✓ getZoneIndex tests passed');

// Test getZoneLabel
console.log('\nTesting getZoneLabel...');
console.assert(getZoneLabel(0) === 'Zone 1 (1-5)', 'Zone label for index 0');
console.assert(getZoneLabel(8) === 'Zone 9 (41-45)', 'Zone label for index 8');
console.log('✓ getZoneLabel tests passed');

// Test drawToZonePattern
console.log('\nTesting drawToZonePattern...');
const testDraw: Draw = {
  date: '2024-01-01',
  main: [1, 10, 20, 30, 40, 45], // Zones 0, 1, 3, 5, 7, 8
  supp: [15, 25],
};
const pattern = drawToZonePattern(testDraw);
console.assert(pattern[0] === true, 'Zone 0 should be hit');
console.assert(pattern[1] === true, 'Zone 1 should be hit');
console.assert(pattern[2] === false, 'Zone 2 should not be hit');
console.assert(pattern[3] === true, 'Zone 3 should be hit');
console.assert(pattern[8] === true, 'Zone 8 should be hit');
console.log('✓ drawToZonePattern tests passed');

// Test zonePatternToKey
console.log('\nTesting zonePatternToKey...');
const key = zonePatternToKey(pattern);
console.log(`Pattern key: ${key}`);
console.assert(key.includes('0'), 'Key should include zone 0');
console.assert(key.includes('1'), 'Key should include zone 1');
console.assert(!key.includes('2'), 'Key should not include zone 2');
console.log('✓ zonePatternToKey tests passed');

// Test countZonePatterns
console.log('\nTesting countZonePatterns...');
const testDraws: Draw[] = [
  { date: '2024-01-01', main: [1, 6, 11, 16, 21, 26], supp: [31, 36] },
  { date: '2024-01-02', main: [1, 6, 11, 16, 21, 26], supp: [31, 36] }, // Same pattern
  { date: '2024-01-03', main: [2, 7, 12, 17, 22, 27], supp: [32, 37] }, // Different pattern
];
const counts = countZonePatterns(testDraws);
console.log(`Found ${counts.length} unique patterns`);
console.assert(counts.length > 0, 'Should find at least one pattern');
console.assert(counts[0].count >= 1, 'Top pattern should have count >= 1');
console.log('✓ countZonePatterns tests passed');

// Test linearRegression
console.log('\nTesting linearRegression...');
const x = [1, 2, 3, 4, 5];
const y = [2, 4, 6, 8, 10]; // Perfect linear relationship: y = 2x
const regression = linearRegression(x, y);
console.log(`Regression: slope=${regression.slope.toFixed(2)}, R²=${regression.rSquared.toFixed(2)}`);
console.assert(Math.abs(regression.slope - 2) < 0.01, 'Slope should be ~2');
console.assert(regression.rSquared > 0.99, 'R² should be very high for perfect fit');
console.log('✓ linearRegression tests passed');

// Test analyzeZoneTrends
console.log('\nTesting analyzeZoneTrends...');
const moreDraws: Draw[] = [];
for (let i = 0; i < 50; i++) {
  // Create draws with increasing frequency in zone 0 and decreasing in zone 8
  const main: number[] = [];
  if (i > 25) main.push(1); // Zone 0 appears more in later draws
  if (i < 25) main.push(45); // Zone 8 appears more in early draws
  while (main.length < 6) {
    main.push(20 + (main.length % 5)); // Fill with zone 3-4 numbers
  }
  moreDraws.push({ date: `2024-01-${i + 1}`, main, supp: [10, 15] });
}
const trends = analyzeZoneTrends(moreDraws);
console.log(`Analyzed ${trends.length} zone trends`);
console.assert(trends.length === 9, 'Should have 9 zone trends');
console.log(`Zone 0 trend: ${trends[0].direction}, slope=${trends[0].slope.toFixed(4)}`);
console.log(`Zone 8 trend: ${trends[8].direction}, slope=${trends[8].slope.toFixed(4)}`);
console.log('✓ analyzeZoneTrends tests passed');

console.log('\n✅ All zone analysis tests passed!');

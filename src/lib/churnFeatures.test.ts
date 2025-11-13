/**
 * Tests for churn feature extraction
 */

import { extractFeaturesForNumber } from './churnFeatures';
import { Draw } from '../types';

// Create sample history
const sampleHistory: Draw[] = [
  { main: [1, 2, 3, 4, 5, 6], supp: [7], date: '2024-01-01' },
  { main: [1, 8, 9, 10, 11, 12], supp: [13], date: '2024-01-08' },
  { main: [1, 14, 15, 16, 17, 18], supp: [19], date: '2024-01-15' },
  { main: [20, 21, 22, 23, 24, 25], supp: [26], date: '2024-01-22' },
  { main: [1, 27, 28, 29, 30, 31], supp: [32], date: '2024-01-29' },
];

console.log('Testing extractFeaturesForNumber...');

// Test number 1 (appears frequently)
const features1 = extractFeaturesForNumber(sampleHistory, 1, 4);
console.assert(features1.freqTotal === 4, `Number 1 should appear 4 times, got ${features1.freqTotal}`);
console.assert(features1.timeSinceLast === 0, `Number 1 last seen at index 4, should have timeSinceLast=0, got ${features1.timeSinceLast}`);
console.assert(features1.zpaGroup === 0, `Number 1 should be in ZPA group 0, got ${features1.zpaGroup}`);

// Test number 20 (appears once)
const features20 = extractFeaturesForNumber(sampleHistory, 20, 4);
console.assert(features20.freqTotal === 1, `Number 20 should appear 1 time, got ${features20.freqTotal}`);
console.assert(features20.timeSinceLast === 1, `Number 20 last seen at index 3, should have timeSinceLast=1, got ${features20.timeSinceLast}`);
console.assert(features20.zpaGroup === 3, `Number 20 should be in ZPA group 3 (16-20), got ${features20.zpaGroup}`);

// Test number 45 (never appears)
const features45 = extractFeaturesForNumber(sampleHistory, 45, 4);
console.assert(features45.freqTotal === 0, `Number 45 should appear 0 times, got ${features45.freqTotal}`);
console.assert(features45.timeSinceLast === 5, `Number 45 never seen, should have timeSinceLast=5, got ${features45.timeSinceLast}`);
console.assert(features45.zpaGroup === 8, `Number 45 should be in ZPA group 8 (41-45), got ${features45.zpaGroup}`);

// Test churn detection
const churned45 = extractFeaturesForNumber(sampleHistory, 45, 4, 12);
console.assert(churned45.churned === false, `Number 45 with timeSinceLast=5 and threshold=12 should not be churned, got ${churned45.churned}`);

const churned45Short = extractFeaturesForNumber(sampleHistory, 45, 4, 3);
console.assert(churned45Short.churned === true, `Number 45 with timeSinceLast=5 and threshold=3 should be churned, got ${churned45Short.churned}`);

console.log('✓ extractFeaturesForNumber tests passed');

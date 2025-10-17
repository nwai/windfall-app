/**
 * Demonstration of Zone Pattern Analysis and Weighting
 * 
 * This script shows how to use the ZPA utilities with sample data
 */

import { Draw } from '../types';
import {
  analyzeZoneTrends,
  countZonePatterns,
  getZoneLabel,
} from './zoneAnalysis';
import {
  getNumberWeightsFromTrends,
  weightsToArray,
} from './zoneWeighting';

// Generate sample draws with some patterns
function generateSampleDraws(count: number): Draw[] {
  const draws: Draw[] = [];
  
  for (let i = 0; i < count; i++) {
    const main: number[] = [];
    
    // Create some patterns:
    // Early draws favor lower zones (1-15)
    // Later draws favor higher zones (31-45)
    const progress = i / count; // 0 to 1
    
    // Zone distribution shifts over time
    if (progress < 0.5) {
      // Early: favor zones 0-2 (1-15)
      main.push(Math.floor(Math.random() * 15) + 1);
      main.push(Math.floor(Math.random() * 15) + 1);
      main.push(Math.floor(Math.random() * 15) + 16);
      main.push(Math.floor(Math.random() * 15) + 16);
      main.push(Math.floor(Math.random() * 15) + 1);
      main.push(Math.floor(Math.random() * 45) + 1);
    } else {
      // Later: favor zones 6-8 (31-45)
      main.push(Math.floor(Math.random() * 15) + 31);
      main.push(Math.floor(Math.random() * 15) + 31);
      main.push(Math.floor(Math.random() * 15) + 16);
      main.push(Math.floor(Math.random() * 15) + 16);
      main.push(Math.floor(Math.random() * 15) + 31);
      main.push(Math.floor(Math.random() * 45) + 1);
    }
    
    // Ensure unique numbers
    const uniqueMain = Array.from(new Set(main)).slice(0, 6);
    while (uniqueMain.length < 6) {
      const n = Math.floor(Math.random() * 45) + 1;
      if (!uniqueMain.includes(n)) uniqueMain.push(n);
    }
    
    // Generate supp numbers
    const supp: number[] = [];
    while (supp.length < 2) {
      const n = Math.floor(Math.random() * 45) + 1;
      if (!uniqueMain.includes(n) && !supp.includes(n)) supp.push(n);
    }
    
    draws.push({
      date: `2024-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
      main: uniqueMain,
      supp,
    });
  }
  
  return draws;
}

// Main demo
console.log('='.repeat(60));
console.log('Zone Pattern Analysis & Weighting Demo');
console.log('='.repeat(60));
console.log();

// Generate sample data
const sampleDraws = generateSampleDraws(100);
console.log(`Generated ${sampleDraws.length} sample draws`);
console.log(`First draw: ${JSON.stringify(sampleDraws[0])}`);
console.log(`Last draw:  ${JSON.stringify(sampleDraws[sampleDraws.length - 1])}`);
console.log();

// Count zone patterns
console.log('-'.repeat(60));
console.log('Top Zone Patterns:');
console.log('-'.repeat(60));
const patterns = countZonePatterns(sampleDraws);
patterns.slice(0, 5).forEach((p, idx) => {
  console.log(`${idx + 1}. Pattern: ${p.key}`);
  console.log(`   Count: ${p.count} (${((p.count / sampleDraws.length) * 100).toFixed(1)}%)`);
  console.log(`   Zones: ${p.key.split('-').map(z => getZoneLabel(parseInt(z))).join(', ')}`);
  console.log();
});

// Analyze zone trends
console.log('-'.repeat(60));
console.log('Zone Trends:');
console.log('-'.repeat(60));
const trends = analyzeZoneTrends(sampleDraws);
trends.forEach(trend => {
  const arrow = trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→';
  const color = trend.direction === 'up' ? 'UP' : trend.direction === 'down' ? 'DOWN' : 'FLAT';
  console.log(
    `${getZoneLabel(trend.zoneIdx).padEnd(18)} ${arrow} ${color.padEnd(5)} ` +
    `slope=${trend.slope.toFixed(4)} R²=${trend.rSquared.toFixed(3)} p=${trend.pValue.toFixed(3)}`
  );
});
console.log();

// Generate weights
console.log('-'.repeat(60));
console.log('Zone-Based Number Weights:');
console.log('-'.repeat(60));
const numberWeights = getNumberWeightsFromTrends(trends, {
  trendScale: 1.0,
  significanceThreshold: 0.1,
});

// Show sample weights
console.log('Sample number weights:');
[1, 10, 20, 30, 40, 45].forEach(num => {
  console.log(`  Number ${String(num).padStart(2)}: ${numberWeights[num].toFixed(4)}`);
});
console.log();

// Convert to array
const weightsArray = weightsToArray(numberWeights);
console.log(`Weights as array: [${weightsArray.slice(0, 5).map(w => w.toFixed(3)).join(', ')}, ...] (length: ${weightsArray.length})`);
console.log();

// Show summary statistics
const avgWeight = weightsArray.reduce((a, b) => a + b, 0) / weightsArray.length;
const minWeight = Math.min(...weightsArray);
const maxWeight = Math.max(...weightsArray);
console.log('Weight Statistics:');
console.log(`  Average: ${avgWeight.toFixed(4)}`);
console.log(`  Min:     ${minWeight.toFixed(4)}`);
console.log(`  Max:     ${maxWeight.toFixed(4)}`);
console.log(`  Range:   ${(maxWeight - minWeight).toFixed(4)}`);
console.log();

// Show how weights could be used
console.log('-'.repeat(60));
console.log('Usage Examples:');
console.log('-'.repeat(60));
console.log('1. For TTP (Temperature Transition Predictions):');
console.log('   - Multiply transition probabilities by number weights');
console.log('   - Numbers in trending zones get higher probabilities');
console.log();
console.log('2. For Candidate Generation:');
console.log('   - Use weights in weighted random sampling');
console.log('   - Bias selection toward numbers in favorable zones');
console.log();
console.log('3. For GPWF (Global Pattern Weight Factor):');
console.log('   - Combine zone weights with existing pattern weights');
console.log('   - Create multi-factor weighting schemes');
console.log();

console.log('='.repeat(60));
console.log('Demo Complete!');
console.log('='.repeat(60));

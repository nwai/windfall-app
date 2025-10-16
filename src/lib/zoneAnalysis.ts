/**
 * Zone Pattern Analysis utilities
 * 
 * Divides numbers 1-45 into 9 zones and analyzes patterns and trends.
 */

import { Draw } from '../types';

// 9 zones: 1-5, 6-10, 11-15, 16-20, 21-25, 26-30, 31-35, 36-40, 41-45
export const ZONE_RANGES: Array<[number, number]> = [
  [1, 5],
  [6, 10],
  [11, 15],
  [16, 20],
  [21, 25],
  [26, 30],
  [31, 35],
  [36, 40],
  [41, 45],
];

/**
 * Get the zone index (0-8) for a given number (1-45)
 */
export function getZoneIndex(num: number): number | null {
  if (num < 1 || num > 45) return null;
  for (let i = 0; i < ZONE_RANGES.length; i++) {
    const [lo, hi] = ZONE_RANGES[i];
    if (num >= lo && num <= hi) return i;
  }
  return null;
}

/**
 * Get the zone label (e.g., "Zone 1 (1-5)")
 */
export function getZoneLabel(zoneIdx: number): string {
  if (zoneIdx < 0 || zoneIdx >= ZONE_RANGES.length) return '';
  const [lo, hi] = ZONE_RANGES[zoneIdx];
  return `Zone ${zoneIdx + 1} (${lo}-${hi})`;
}

/**
 * Convert a draw's main numbers to a zone pattern (array of 9 booleans)
 * True if the zone is hit, false otherwise
 */
export function drawToZonePattern(draw: Draw): boolean[] {
  const pattern = new Array(9).fill(false);
  for (const num of draw.main) {
    const zoneIdx = getZoneIndex(num);
    if (zoneIdx !== null) {
      pattern[zoneIdx] = true;
    }
  }
  return pattern;
}

/**
 * Convert a zone pattern to a compact string key (e.g., "0-2-4-6-8")
 */
export function zonePatternToKey(pattern: boolean[]): string {
  const hitZones: number[] = [];
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i]) hitZones.push(i);
  }
  return hitZones.join('-');
}

/**
 * Count occurrences of each zone pattern across draws
 */
export interface ZonePatternCount {
  pattern: boolean[];
  key: string;
  count: number;
  drawIndices: number[]; // Indices of draws with this pattern
}

export function countZonePatterns(draws: Draw[]): ZonePatternCount[] {
  const patternMap = new Map<string, ZonePatternCount>();
  
  draws.forEach((draw, idx) => {
    const pattern = drawToZonePattern(draw);
    const key = zonePatternToKey(pattern);
    
    if (patternMap.has(key)) {
      const existing = patternMap.get(key)!;
      existing.count++;
      existing.drawIndices.push(idx);
    } else {
      patternMap.set(key, {
        pattern,
        key,
        count: 1,
        drawIndices: [idx],
      });
    }
  });
  
  return Array.from(patternMap.values()).sort((a, b) => b.count - a.count);
}

/**
 * Linear regression result
 */
export interface LinearRegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
  pValue: number;
}

/**
 * Perform simple linear regression on y vs x
 * Returns slope, intercept, R², and p-value
 */
export function linearRegression(x: number[], y: number[]): LinearRegressionResult {
  const n = x.length;
  if (n === 0 || x.length !== y.length) {
    return { slope: 0, intercept: 0, rSquared: 0, pValue: 1 };
  }
  
  // Calculate means
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  
  // Calculate slope and intercept
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (x[i] - meanX) * (y[i] - meanY);
    denominator += (x[i] - meanX) * (x[i] - meanX);
  }
  
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;
  
  // Calculate R²
  let ssRes = 0; // Residual sum of squares
  let ssTot = 0; // Total sum of squares
  for (let i = 0; i < n; i++) {
    const predicted = slope * x[i] + intercept;
    ssRes += (y[i] - predicted) ** 2;
    ssTot += (y[i] - meanY) ** 2;
  }
  
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  
  // Calculate p-value (simplified t-test)
  // Standard error of slope
  const seSlope = Math.sqrt(ssRes / (n - 2) / denominator);
  const tStat = slope / seSlope;
  
  // Two-tailed p-value approximation using t-distribution
  // For simplicity, use a rough approximation
  const df = n - 2;
  const pValue = df > 0 ? 2 * (1 - tCDF(Math.abs(tStat), df)) : 1;
  
  return { slope, intercept, rSquared, pValue };
}

/**
 * Cumulative distribution function for t-distribution (approximation)
 */
function tCDF(t: number, df: number): number {
  // Simple approximation using normal distribution for large df
  if (df > 30) {
    return normalCDF(t);
  }
  
  // For small df, use a rough approximation
  const x = df / (df + t * t);
  const prob = 1 - 0.5 * incompleteBeta(x, df / 2, 0.5);
  return t > 0 ? prob : 1 - prob;
}

/**
 * Normal CDF approximation
 */
function normalCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

/**
 * Error function approximation
 */
function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  
  return sign * y;
}

/**
 * Incomplete beta function (simplified for our use case)
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  
  // Use continued fraction approximation
  const lnBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;
  
  let f = 1, c = 1, d = 0;
  for (let i = 0; i <= 100; i++) {
    const m = i / 2;
    let numerator;
    if (i === 0) {
      numerator = 1;
    } else if (i % 2 === 0) {
      numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    } else {
      numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    }
    
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    
    const cd = c * d;
    f *= cd;
    
    if (Math.abs(cd - 1) < 1e-8) break;
  }
  
  return front * f;
}

/**
 * Log gamma function (Stirling's approximation)
 */
function logGamma(x: number): number {
  if (x <= 0) return Infinity;
  
  const cof = [
    76.18009172947146,
    -86.50532032941677,
    24.01409824083091,
    -1.231739572450155,
    0.1208650973866179e-2,
    -0.5395239384953e-5,
  ];
  
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  
  for (let j = 0; j < 6; j++) {
    ser += cof[j] / ++y;
  }
  
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/**
 * Analyze zone frequency trends over time
 * Returns per-zone regression statistics
 */
export interface ZoneTrend {
  zoneIdx: number;
  slope: number;
  intercept: number;
  rSquared: number;
  pValue: number;
  direction: 'up' | 'down' | 'flat';
}

export interface AnalyzeZoneTrendsOptions {
  // If p-value < significanceThreshold, use slope sign for direction
  significanceThreshold?: number;
  // Otherwise, use magnitude threshold: max(minThreshold, dynamicFactor / sqrt(n))
  minMagnitudeThreshold?: number;
  dynamicFactor?: number;
}

export function analyzeZoneTrends(
  draws: Draw[],
  options: AnalyzeZoneTrendsOptions = {}
): ZoneTrend[] {
  const {
    significanceThreshold = 0.1,
    minMagnitudeThreshold = 0.01,
    dynamicFactor = 0.06,
  } = options;
  
  const n = draws.length;
  const trends: ZoneTrend[] = [];
  
  // For each zone, track frequency over time
  for (let zoneIdx = 0; zoneIdx < 9; zoneIdx++) {
    const frequencies: number[] = [];
    const timePoints: number[] = [];
    
    draws.forEach((draw, idx) => {
      const pattern = drawToZonePattern(draw);
      frequencies.push(pattern[zoneIdx] ? 1 : 0);
      timePoints.push(idx);
    });
    
    // Perform linear regression
    const regression = linearRegression(timePoints, frequencies);
    
    // Determine direction based on adaptive logic
    let direction: 'up' | 'down' | 'flat' = 'flat';
    
    if (regression.pValue < significanceThreshold) {
      // Significant trend - use slope sign
      if (regression.slope > 0) direction = 'up';
      else if (regression.slope < 0) direction = 'down';
    } else {
      // Not significant - use magnitude threshold
      const threshold = Math.max(minMagnitudeThreshold, dynamicFactor / Math.sqrt(n));
      if (Math.abs(regression.slope) >= threshold) {
        if (regression.slope > 0) direction = 'up';
        else if (regression.slope < 0) direction = 'down';
      }
    }
    
    trends.push({
      zoneIdx,
      slope: regression.slope,
      intercept: regression.intercept,
      rSquared: regression.rSquared,
      pValue: regression.pValue,
      direction,
    });
  }
  
  return trends;
}

/**
 * Calculate sum of zone trends (for mains pattern)
 * This aggregates the trends across all zones
 */
export function calculateSumMainsTrend(zoneTrends: ZoneTrend[]): LinearRegressionResult {
  // Average the slopes and R² values
  const avgSlope = zoneTrends.reduce((sum, t) => sum + t.slope, 0) / zoneTrends.length;
  const avgRSquared = zoneTrends.reduce((sum, t) => sum + t.rSquared, 0) / zoneTrends.length;
  
  // For p-value, use Fisher's method to combine
  const chi2 = -2 * zoneTrends.reduce((sum, t) => sum + Math.log(Math.max(t.pValue, 1e-10)), 0);
  // Approximate p-value from chi-squared distribution
  const df = 2 * zoneTrends.length;
  const pValue = 1 - chi2CDF(chi2, df);
  
  return {
    slope: avgSlope,
    intercept: 0, // Not meaningful for aggregated trend
    rSquared: avgRSquared,
    pValue: Math.min(1, Math.max(0, pValue)),
  };
}

/**
 * Chi-squared CDF approximation
 */
function chi2CDF(x: number, df: number): number {
  if (x <= 0) return 0;
  if (df <= 0) return 1;
  
  // Use gamma CDF
  return incompleteBeta(x / (x + df), df / 2, 0.5);
}

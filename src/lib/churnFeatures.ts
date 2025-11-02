/**
 * Churn Feature Builder
 * 
 * Builds features for churn and return prediction models based on:
 * - Usage frequency (appearances in main/supp over time windows)
 * - Tenure (how long number has been active/inactive)
 * - Time since last appearance
 * - Zone/group membership (ZPA groups)
 * - Trend patterns
 */

import { Draw } from "../types";

export interface ChurnFeatures {
  number: number;
  
  // Frequency features
  freqLast5: number;      // appearances in last 5 draws
  freqLast10: number;     // appearances in last 10 draws
  freqLast20: number;     // appearances in last 20 draws
  freqLast50: number;     // appearances in last 50 draws
  freqTotal: number;      // total appearances in history
  
  // Tenure features
  timeSinceLast: number;  // draws since last appearance (0 if current)
  longestGap: number;     // longest gap between appearances
  avgGap: number;         // average gap between appearances
  
  // Pattern features
  trendSlope: number;     // linear trend of recent appearances (increasing/decreasing)
  volatility: number;     // std dev of inter-appearance gaps
  
  // State features
  isActive: boolean;      // appeared in last N draws
  hasChurned: boolean;    // inactive for extended period
  hasReturned: boolean;   // was churned but came back
  
  // Zone features (optional, for ZPA-aware models)
  zoneGroup?: number;     // which zone the number belongs to
}

export interface ChurnLabel {
  number: number;
  willChurn: boolean;     // will disappear for N+ draws
  willReturn: boolean;    // will return after churning
  drawsUntilChurn?: number;
  drawsUntilReturn?: number;
}

/**
 * Extract features for a single number at a given point in history
 */
export function extractFeaturesForNumber(
  history: Draw[],
  number: number,
  atDrawIndex: number,
  churnThreshold: number = 15
): ChurnFeatures {
  const historyUpToPoint = history.slice(0, atDrawIndex + 1);
  
  // Find all appearances
  const appearances: number[] = [];
  historyUpToPoint.forEach((draw, idx) => {
    if (draw.main.includes(number) || draw.supp.includes(number)) {
      appearances.push(idx);
    }
  });
  
  // Frequency features
  const last5 = historyUpToPoint.slice(-5);
  const last10 = historyUpToPoint.slice(-10);
  const last20 = historyUpToPoint.slice(-20);
  const last50 = historyUpToPoint.slice(-50);
  
  const freqLast5 = countAppearances(last5, number);
  const freqLast10 = countAppearances(last10, number);
  const freqLast20 = countAppearances(last20, number);
  const freqLast50 = countAppearances(last50, number);
  const freqTotal = appearances.length;
  
  // Tenure features
  const timeSinceLast = appearances.length > 0 
    ? atDrawIndex - appearances[appearances.length - 1]
    : atDrawIndex;
  
  // Calculate gaps between appearances
  const gaps: number[] = [];
  for (let i = 1; i < appearances.length; i++) {
    gaps.push(appearances[i] - appearances[i - 1]);
  }
  
  const longestGap = gaps.length > 0 ? Math.max(...gaps) : 0;
  const avgGap = gaps.length > 0 
    ? gaps.reduce((sum, g) => sum + g, 0) / gaps.length 
    : 0;
  
  // Trend: simple linear regression on recent appearances
  const recentWindow = 20;
  const recentAppearances = appearances.filter(idx => idx > atDrawIndex - recentWindow);
  const trendSlope = calculateTrendSlope(recentAppearances, atDrawIndex, recentWindow);
  
  // Volatility: std dev of gaps
  const volatility = gaps.length > 1 ? calculateStdDev(gaps) : 0;
  
  // State determination
  const isActive = timeSinceLast < churnThreshold;
  const hasChurned = timeSinceLast >= churnThreshold && appearances.length > 0;
  
  // Check if this number returned after churning
  let hasReturned = false;
  let maxGapBeforeNow = 0;
  for (let i = 0; i < gaps.length; i++) {
    if (gaps[i] >= churnThreshold) {
      maxGapBeforeNow = Math.max(maxGapBeforeNow, gaps[i]);
      // If there are more appearances after a long gap, it returned
      if (i < gaps.length - 1) {
        hasReturned = true;
      }
    }
  }
  
  return {
    number,
    freqLast5,
    freqLast10,
    freqLast20,
    freqLast50,
    freqTotal,
    timeSinceLast,
    longestGap,
    avgGap,
    trendSlope,
    volatility,
    isActive,
    hasChurned,
    hasReturned,
  };
}

/**
 * Generate churn labels for training
 * Look forward from atDrawIndex to see if number churns
 */
export function generateChurnLabel(
  history: Draw[],
  number: number,
  atDrawIndex: number,
  churnThreshold: number = 15,
  lookAhead: number = 30
): ChurnLabel {
  const futureDraws = history.slice(atDrawIndex + 1, atDrawIndex + 1 + lookAhead);
  
  // Find next appearance in future
  let nextAppearance = -1;
  for (let i = 0; i < futureDraws.length; i++) {
    if (futureDraws[i].main.includes(number) || futureDraws[i].supp.includes(number)) {
      nextAppearance = i;
      break;
    }
  }
  
  const willChurn = nextAppearance === -1 || nextAppearance >= churnThreshold;
  const drawsUntilChurn = nextAppearance === -1 ? lookAhead : nextAppearance;
  
  // For return prediction, check if number is currently churned
  // and will return within lookAhead
  const features = extractFeaturesForNumber(history, number, atDrawIndex, churnThreshold);
  const willReturn = features.hasChurned && nextAppearance !== -1 && nextAppearance < lookAhead;
  const drawsUntilReturn = willReturn ? nextAppearance : undefined;
  
  return {
    number,
    willChurn,
    willReturn,
    drawsUntilChurn,
    drawsUntilReturn,
  };
}

/**
 * Build training dataset for all numbers across history
 */
export function buildChurnDataset(
  history: Draw[],
  numbers: number[] = Array.from({ length: 45 }, (_, i) => i + 1),
  churnThreshold: number = 15,
  minHistoryLength: number = 50,
  sampleEvery: number = 5 // sample every N draws to reduce dataset size
): Array<{ features: ChurnFeatures; label: ChurnLabel }> {
  const dataset: Array<{ features: ChurnFeatures; label: ChurnLabel }> = [];
  
  // Start from minHistoryLength and sample periodically
  for (let drawIdx = minHistoryLength; drawIdx < history.length - 30; drawIdx += sampleEvery) {
    for (const number of numbers) {
      const features = extractFeaturesForNumber(history, number, drawIdx, churnThreshold);
      const label = generateChurnLabel(history, number, drawIdx, churnThreshold);
      dataset.push({ features, label });
    }
  }
  
  return dataset;
}

/**
 * Split dataset into train/test
 */
export function trainTestSplit<T>(
  data: T[],
  testRatio: number = 0.2
): { train: T[]; test: T[] } {
  const shuffled = [...data].sort(() => Math.random() - 0.5);
  const splitIdx = Math.floor(data.length * (1 - testRatio));
  return {
    train: shuffled.slice(0, splitIdx),
    test: shuffled.slice(splitIdx),
  };
}

// Helper functions

function countAppearances(draws: Draw[], number: number): number {
  return draws.reduce((count, draw) => {
    return count + (draw.main.includes(number) || draw.supp.includes(number) ? 1 : 0);
  }, 0);
}

function calculateTrendSlope(
  appearances: number[],
  currentIdx: number,
  windowSize: number
): number {
  if (appearances.length < 2) return 0;
  
  // Simple linear regression: y = mx + b
  // x = relative time, y = 1 (appearance) or 0 (no appearance)
  // We'll use a binary indicator for each draw in window
  const data: Array<{ x: number; y: number }> = [];
  for (let i = currentIdx - windowSize; i <= currentIdx; i++) {
    if (i >= 0) {
      const y = appearances.includes(i) ? 1 : 0;
      data.push({ x: i - (currentIdx - windowSize), y });
    }
  }
  
  if (data.length < 2) return 0;
  
  const n = data.length;
  const sumX = data.reduce((s, d) => s + d.x, 0);
  const sumY = data.reduce((s, d) => s + d.y, 0);
  const sumXY = data.reduce((s, d) => s + d.x * d.y, 0);
  const sumX2 = data.reduce((s, d) => s + d.x * d.x, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return isNaN(slope) ? 0 : slope;
}

function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Normalize features for ML models
 */
export function normalizeFeatures(features: ChurnFeatures): number[] {
  // Convert features to array and normalize
  return [
    features.freqLast5 / 5,
    features.freqLast10 / 10,
    features.freqLast20 / 20,
    features.freqLast50 / 50,
    features.freqTotal / 100, // assume max ~100 appearances
    Math.min(features.timeSinceLast / 50, 1), // cap at 50
    Math.min(features.longestGap / 50, 1),
    Math.min(features.avgGap / 20, 1),
    features.trendSlope, // already small values
    Math.min(features.volatility / 10, 1),
    features.isActive ? 1 : 0,
    features.hasChurned ? 1 : 0,
    features.hasReturned ? 1 : 0,
  ];
}

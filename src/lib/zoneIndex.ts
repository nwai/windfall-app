/**
 * Zone Analysis and Weighting - Public API
 * 
 * This module provides utilities for zone pattern analysis and zone-based weighting
 * for downstream use in TTP, candidate generation, etc.
 */

// Zone Analysis
export {
  ZONE_RANGES,
  getZoneIndex,
  getZoneLabel,
  drawToZonePattern,
  zonePatternToKey,
  countZonePatterns,
  linearRegression,
  analyzeZoneTrends,
  calculateSumMainsTrend,
  type ZonePatternCount,
  type ZoneTrend,
  type LinearRegressionResult,
  type AnalyzeZoneTrendsOptions,
} from './zoneAnalysis';

// Zone Weighting
export {
  suggestZoneWeightsFromTrends,
  mapZoneWeightsToNumbers,
  getNumberWeightsFromTrends,
  normalizeWeights,
  weightsToArray,
  type ZoneWeightOptions,
} from './zoneWeighting';

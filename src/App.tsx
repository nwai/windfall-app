// NOTE: Step-3 consolidated updates and fixes:
// - Pass only user exclusions to generator (fix trace "User excluded").
// - WFMQYH: add user exclusion checkboxes (1–45) in a single horizontal line.
// - Unified status badges (adds OGA + core threshold switches).
// - Lambda enable/disable toggle (disables slider when off, reflected in badges/trace).
// - Trace: append a concise block for factors affecting generation.
//
// Keep existing imports; removed unused ones previously.
import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import "./App.css";

import { LotteryPlatformShell } from "./components/lottery/LotteryPlatformShell";
import { ForcedNumbersProvider } from "./context/ForcedNumbersContext";
import { ZPASettingsProvider, useZPASettings } from "./context/ZPASettingsContext";
import { ErrorBoundary } from "./components/ErrorBoundary";

import { MonteCarloPanel } from "./components/candidates/MonteCarloPanel";
import { NumberTrendsTable, NumberTrend, NUMBER_TREND_MONTH_DRAW_WINDOW } from "./components/NumberTrendsTable";
import { entropy, minHamming, maxJaccard } from "./analytics";
import { buildDemoDrawHistory, fetchDraws, loadCsvFallbackDraws } from "./lib/fetchDraws";
import { getUniqueRandomNumbers } from "./lib/random";
import { parseCSVorJSON } from "./parseCSVorJSON";
import { getSDE1FilteredPool } from "./sde1";
import { buildDrawGrid, findDiamondsAllRadii, getPredictedNumbers } from "./dga";
import { normalizeDgaSelectedNumbers } from "./lib/dgaSelectedNumbers";
import {
  buildDgaSuppSuggestion,
  type DgaSuppSuggestion,
} from "./lib/dgaSuppSuggestion";
import { DGAVisualizer } from "./components/DGAVisualizer";
import { DGAConstellationDiagnosticPanel } from "./components/DGAConstellationDiagnosticPanel";
import { computeOGA, getOGAPercentile } from "./utils/oga";
import { ogaPercentileToSimilarity } from "./lib/ogaQuality";
import { Draw, Knobs, CandidateSet, type KeptGeneratedCandidateRow } from "./types";
import { GeneratedCandidatesPanel, ExportSettings } from "./components/candidates/GeneratedCandidatesPanel";
import { PasteWeightedCandidatesPanel } from "./components/candidates/PasteWeightedCandidatesPanel";
import { PortfolioCompressionPanel, type PortfolioHotColdEvidenceRow } from "./components/candidates/PortfolioCompressionPanel";
import { buildTrendWeights } from "./lib/trendBias";
import { computeTrendMap } from "./lib/trend";
import { buildMonthlyRepeatBiasWeights, MRB_BUCKET_KEYS, MRB_BUCKET_LABELS, MRB_BUDGET } from "./lib/numberBiases";
import { OGAHistogram } from "./components/OGAHistogram";
import { DGA_CELL_SIZE } from "./constants/ui";
import { TemperatureHeatmap } from "./components/TemperatureHeatmap";
import { TracePanel } from "./components/TracePanel";
import { SurvivalAnalyzer } from "./components/SurvivalAnalyzer";
import { ChurnPredictor } from "./components/ChurnPredictor";
import { ReturnPredictor } from "./components/ReturnPredictor";
import { MultiStateChurnPanel } from "./components/MultiStateChurnPanel";
import { SurvivalCoxPanel } from "./components/SurvivalCoxPanel";
import { SurvivalFrailtyPanel } from "./components/SurvivalFrailtyPanel";
import { ConsensusPanel } from "./components/ConsensusPanel";
import { DroughtHazardPanel } from "./components/DroughtHazardPanel";
import {
  STRICT_DROUGHT_DEFAULT_THRESHOLD,
  computeDroughtHazard,
  computeStrictDroughtShortlist,
} from "./lib/droughtHazard";
import {
  buildStrictDroughtQuotaAdvice,
  buildStrictDroughtQuotaShortlist,
  type StrictDroughtQuotaControlMode,
} from "./lib/strictDroughtQuotaAdvice";
import { BatesPanel } from "./components/BatesPanel";
import { computeTemperatureSignal } from "./lib/temperatureSignal";
import { buildConditionalProb } from "./lib/conditionalProbability";
import { computeHistoricalTrendRatios } from "./lib/computeHistoricalTrendRatios";
import { buildTrendValueSeries } from "./lib/trendValueSeries";
import { TrendRatioHistoryPanel } from "./components/TrendRatioHistoryPanel";
import { UserSelectedNumbersPanel } from "./components/UserSelectedNumbersPanel";
import { ParameterSearchPanel } from "./components/ParameterSearchPanel";
import { BatesParameterSet } from "./lib/batesWeightsCore";
import { WeightedTargetListPanel } from "./components/WeightedTargetListPanel";
import { RankingWeightsPanel, type RankingWeights } from "./components/RankingWeightsPanel";
import { TemperatureTransitionPanel } from "./components/TemperatureTransitionPanel";
import { GroupPatternPanel } from "./components/GroupPatternPanel";
import { ToastContainer } from "./components/ToastContainer";
import { PatternStatsPanel } from "./components/candidates/PatternStatsPanel";
import { NumberFrequencyPanel } from "./components/candidates/NumberFrequencyPanel";
import { TargetSetQuickStatsPanel } from "./components/candidates/TargetSetQuickStatsPanel";
import type { ZoneGroups } from "./lib/groupPatterns";
import { applyZoneWeightBiasToScores } from "./lib/zoneWeightBias";
import { getSavedZoneWeights, getSavedGroups, setSavedGroups, getSavedSelectedZones, setSavedSelectedZones, getSavedNormalizeMode, setSavedNormalizeMode } from "./lib/zpaStorage";
import { WindowStatsPanel } from "./components/WindowStatsPanel";
import { showToast } from "./lib/toastBus";
import { GlobalZoneWeighting } from "./components/GlobalZoneWeighting";
import DrawHistoryManager from "./components/DrawHistoryManager";
import DrawHistoryIntegrityPanel from "./components/DrawHistoryIntegrityPanel";
import { buildChurnDataset } from "./lib/churnFeatures";
import { HeatmapLegendBar } from "./components/HeatmapLegendBar";
import {
  buildMonthlyBucketDrawSeries,
  MONTHLY_BUCKET_HEATMAP_COLORS,
  MONTHLY_BUCKET_HEATMAP_LABELS,
  MONTHLY_BUCKET_HEATMAP_LETTERS,
} from "./lib/monthlyBucketDrawSeries";
import { buildSimulatedNextDraw } from "./lib/simulatedNextDraw";
import {
  AppPresetSnapshot,
  listPresets,
  saveNewPreset,
  updatePreset,
  deletePreset as deletePresetLS,
  exportPresetJSON,
  importPresetJSON,
  getPreset,
  type AppPreset,
} from "./lib/presets";
import type { WindowPattern } from "./components/WindowStatsPanel";
import { applyOddEvenRatioQuotas, generateCandidates, summarizeOddEvenRatios, type GenerateCandidatesResult } from "./generateCandidates";
import { useGenerateWorker, serializeMonthlyBuckets, serializeTrendMap } from "./hooks/useGenerateWorker";
import { usePlanningDrawContext } from "./hooks/usePlanningDrawContext";
import type { GenerateWorkerArgs } from "./workers/generateWorker";
import { ModulationDiagnosticsPanel } from "./components/ModulationDiagnosticsPanel";
import { SelectionInsightsPanel, SelectionInsightsPredictionPanel } from "./components/SelectionInsightsPanel";
import {
  buildSelectionInsightsAnalytics,
  buildSelectionInsightsSnapshot,
} from "./lib/selectionInsights";
import { OddEvenRatioCadencePanel } from "./components/OddEvenRatioCadencePanel";
import { ScoringSystemDiagnosticsPanel } from "./components/ScoringSystemDiagnosticsPanel";
import {
  buildScoringGenerationProfile,
  type ScoringGenerationInfluence,
} from "./lib/scoringGenerationInfluence";
import { normalizeReadinessWeights, type ReadinessWeights } from "./lib/candidateGenerationInfluences";
import { PredictionJournalPanel, type PredictionJournalDraftRequest } from "./components/PredictionJournalPanel";
import { ResearchDiaryPanel } from "./components/ResearchDiaryPanel";
import { PreviousNeighbourBacktestPanel } from "./components/PreviousNeighbourBacktestPanel";
import { CollapsibleSection } from "./components/shared/CollapsibleSection";
import { InlineCollapsibleCard } from "./components/shared/InlineCollapsibleCard";
import { HigButton, HigField, HigSlider, InfoHelp } from "./components/shared/HigControls";
import { AppWorkflowNav, WorkflowAnchor } from "./components/layout/AppWorkflowNav";
import { PanelFavoritesStrip } from "./components/layout/PanelFavoritesStrip";
import { PanelFavoritesProvider } from "./context/PanelFavoritesContext";
import { NextDrawProbabilitiesPanel } from "./components/NextDrawProbabilitiesPanel";
import { forecastOGA } from "./lib/ogaForecast";
import { MostLikelyNotDrawnPanel } from "./components/MostLikelyNotDrawnPanel";
import { BacktestPanel } from "./components/BacktestPanel";
import { DroughtBacktestPanel } from "./components/DroughtBacktestPanel";
import { SettingsSensitivityReplayPanel } from "./components/SettingsSensitivityReplayPanel";
import { NextHotBlocksPanel } from "./components/NextHotBlocksPanel";
import { TattslottoTicketGridReplayPanel } from "./components/TattslottoTicketGridReplayPanel";
import UndrawnPatternsPanel from "./components/UndrawnPatternsPanel";
import MonthlyOverlapPanel from "./components/MonthlyOverlapPanel";
import MonthlyDrawsSummaryPanel, { type MonthlyConstraintPayload, type MonthlyFrequencyConstraints, type MonthlyBucketSets, type MonthlyIdealDrawState, type StageIdealDrawState } from "./components/MonthlyDrawsSummaryPanel";
import { computeIdealMonthlyDraw } from "./lib/monthlyDrawSummary";
import MonthlyBucketTransitionLabPanel from "./components/MonthlyBucketTransitionLabPanel";
import MonthlyFirstLastPanel from "./components/MonthlyFirstLastPanel";
import MonthlyDigitOccurrencePanel from "./components/MonthlyDigitOccurrencePanel";
import MonthEndCarryOverBucketsPanel from "./components/MonthEndCarryOverBucketsPanel";
import HotColdRankingPanel from "./components/HotColdRankingPanel";
import { AdjacentCombosPanel } from "./components/AdjacentCombosPanel";
import { applyOctagonalPostProcess } from "./octagonal";
import { PickSixPanel, type PickSixSource } from "./components/PickSixPanel";
import { buildWfmqyhNumberCounts } from "./lib/wfmqyhNumberCounts";
import { DrawBucketPatternPanel } from "./components/DrawBucketPatternPanel";
import { EndingDigitSequencePanel } from "./components/EndingDigitSequencePanel";
import {
  analyzeD1TerminalMomentum,
  buildEndingDigitMonthOptions,
  type D1TerminalMomentumStrength,
} from "./lib/endingDigitSequences";
import { buildD1TerminalMomentumGenerationProfile } from "./lib/d1TerminalMomentumInfluence";
import DGAMonthlyBucketStateGrid from "./components/DGAMonthlyBucketStateGrid";
import { buildMonthlyBucketTimeline } from "./lib/monthlyBucketTimeline";
import { deriveMainConstraintExclusions } from "./lib/mainConstraintExclusions";
import {
  analyzeDrawHistoryRows,
  applyAutomaticHistoryCorrections,
  drawsFromRows,
  rowsFromDraws,
} from "./lib/drawHistoryReview";
import { clearCachedDrawHistory, loadCachedDrawHistory, saveCachedDrawHistory } from "./lib/historyPersistence";
import {
  computeWeekdayWindfallPrizeDivision,
  rankWeekdayWindfallPrizeDivision,
} from "./lib/prizeDivisions";
import { chooseInitialDrawHistory, type InitialDrawHistoryChoice } from "./lib/initialDrawHistory";
import {
  DIGIT_WIDTH_PERCENT_OPTIONS,
  deriveDigitWidthTargets,
  formatDigitWidthScopeLabel,
  type DigitWidthConstraintScope,
} from "./lib/digitWidthConstraint";
import {
  normalizeHotColdGenerationNumbers,
  toggleHotColdExcludeSelection,
  toggleHotColdIncludeSelection,
} from "./lib/hotColdGenerationSelection";
import {
  formatUserExclusionReminder,
  normalizeUserExclusionLocks,
  removeUserExcludedNumbers,
} from "./lib/userExclusionLocks";
import { toggleUserSelectedNumber } from "./lib/userSelectedNumbers";
import { normalizeManualPrizeCheckNumbers } from "./lib/manualPrizeCheck";
import { buildNumberConflictLedger } from "./lib/numberConflictLedger";
import {
  DEFAULT_GENERATED_CANDIDATE_COUNT,
  getGeneratedCandidateCountWindowDefault,
  normalizeGeneratedCandidateCount,
} from "./lib/generatedCandidateCount";
import {
  generateRwR45Candidates,
  RWR45_CANDIDATE_COUNT,
} from "./lib/rwr45Candidates";
import {
  buildGenerationSessionMainKeySet,
  filterCandidatesForGenerationSession,
} from "./lib/generationSession";
import { analyzeSde1Hc3ContextBacktest } from "./lib/sde1Hc3ContextAdvice";
import {
  buildEffectiveMonthEndCarryOverWeights,
  buildMonthEndCarryOverWeighting,
  SELECTED_MONTH_END_CARRY_OVER_BOOST_FACTOR,
  scoreMonthEndCarryOverCandidate,
} from "./lib/monthEndCarryOver";
import { getHC3OverlapNumbers, getMostRecentDraw } from "./lib/recentDraws";
import {
  annotateCandidatesWithPreviousNeighbourShape,
} from "./lib/previousNeighbourShapeGuard";
import {
  buildPreviousNeighbourConstraintRows,
  normalizePreviousNeighbourConstraintNumbers,
  togglePreviousNeighbourConstraintNumber as togglePreviousNeighbourConstraintTarget,
} from "./lib/previousNeighbourTargets";
import { buildLatestNeighbourStageMatchCompatibilityTrace } from "./lib/latestNeighbourStageMatchCompatibility";
import { analyzeHotColdRanking } from "./lib/hotColdRanking";
import { buildPortfolioWindowShapeEvidence } from "./lib/portfolioWindowShape";
import { summarizeDrawHistoryProvenance } from "./lib/drawHistoryProvenance";
import { filterRealDrawHistory } from "./lib/realDrawHistory";
import { strictValidateDraws } from "./lib/strictDrawValidation";
import { formatWfmqyhDateRange } from "./lib/wfmqyhWindowDateRange";
import { drawResultTemperatureStyle } from "./lib/drawResultTemperature";
import { getLatestObservedMonthDrawCount } from "./lib/repeatWindowDefault";
import {
  filterRowsForHistoryBaselines,
  getExcludedMonthLabelsForHistoryBaselines,
} from "./lib/monthlyAverageScope";
import {
  loadFavoritePanelIds,
  normalizeFavoritePanelIds,
  saveFavoritePanelIds,
} from "./lib/panelFavorites";
import { dateFromMonthLabel } from "./lib/planningDrawContext";

type DgaHeatmapViewMode = "temperature" | "monthlyBucketState";

const DGA_HEATMAP_GUTTER = 15;

interface DGAScoringNumberDiagnostic {
  rank: number;
  score: number;
}

type MonthEndCarryOverStrength = "light" | "normal" | "strong";
type SelectedCarryOverBoostMode = "normal" | "strong" | "nearForced";

const MONTH_END_CARRY_OVER_STRENGTHS: Record<MonthEndCarryOverStrength, {
  label: string;
  factorScale: number;
  rankingWeight: number;
}> = {
  light: { label: "Light", factorScale: 0.5, rankingWeight: 0.05 },
  normal: { label: "Normal", factorScale: 1, rankingWeight: 0.15 },
  strong: { label: "Strong", factorScale: 1.5, rankingWeight: 0.3 },
};

const SELECTED_CARRY_OVER_BOOSTS: Record<SelectedCarryOverBoostMode, {
  label: string;
  factor: number;
}> = {
  normal: { label: "Normal", factor: 10 },
  strong: { label: "Strong", factor: 100 },
  nearForced: { label: "Near-forced", factor: SELECTED_MONTH_END_CARRY_OVER_BOOST_FACTOR },
};

const normalizeMonthEndCarryOverStrength = (value: unknown): MonthEndCarryOverStrength => (
  value === "light" || value === "strong" ? value : "normal"
);

const normalizeSelectedCarryOverBoostMode = (value: unknown): SelectedCarryOverBoostMode => (
  value === "normal" || value === "nearForced" ? value : "strong"
);

const formatScoringInfluenceLabel = (value: ScoringGenerationInfluence): string => (
  value === "off" ? "Off" : `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`
);

const formatD1TerminalMomentumStrength = (value: D1TerminalMomentumStrength): string => (
  value === "off" ? "Off" : `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`
);

const RDY_WEIGHT_KEYS = ["idm", "conv", "oga"] as const;
type RdyWeightKey = typeof RDY_WEIGHT_KEYS[number];
type RdyWeightOffState = Record<RdyWeightKey, boolean>;

const DEFAULT_RDY_WEIGHTS: ReadinessWeights = {
  idm: 0,
  conv: 0,
  oga: 0,
};

const DEFAULT_RDY_WEIGHT_OFF_STATE: RdyWeightOffState = {
  idm: true,
  conv: true,
  oga: true,
};

const RDY_WEIGHT_COPY: Record<RdyWeightKey, {
  shortLabel: string;
  label: string;
  help: string;
}> = {
  idm: {
    shortLabel: "IDM",
    label: "Ideal Draw Match",
    help: "Bucket composition similarity to the Monthly Draws Summary ideal draw. Descriptive alignment only, not a win forecast.",
  },
  conv: {
    shortLabel: "Conv",
    label: "Convergence",
    help: "SSD reduction between the current and target bucket distributions. Direction is ignored; magnitude is the signal.",
  },
  oga: {
    shortLabel: "OGA",
    label: "Geometry Alignment",
    help: "OGA percentile similarity from DGA geometry. Independent of monthly frequency analysis.",
  },
};

const cloneDefaultRdyWeights = (): ReadinessWeights => ({ ...DEFAULT_RDY_WEIGHTS });
const cloneDefaultRdyWeightOffState = (): RdyWeightOffState => ({ ...DEFAULT_RDY_WEIGHT_OFF_STATE });

const normalizeRdyWeights = (input: unknown): ReadinessWeights => {
  const source = input && typeof input === "object" ? input as Partial<Record<RdyWeightKey, unknown>> : {};
  return RDY_WEIGHT_KEYS.reduce<ReadinessWeights>((next, key) => {
    const numeric = Number(source[key] ?? DEFAULT_RDY_WEIGHTS[key]);
    next[key] = Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : DEFAULT_RDY_WEIGHTS[key];
    return next;
  }, cloneDefaultRdyWeights());
};

const normalizeRdyWeightOffState = (input: unknown): RdyWeightOffState => {
  const source = input && typeof input === "object" ? input as Partial<Record<RdyWeightKey, unknown>> : {};
  return RDY_WEIGHT_KEYS.reduce<RdyWeightOffState>((next, key) => {
    next[key] = typeof source[key] === "boolean" ? !!source[key] : DEFAULT_RDY_WEIGHT_OFF_STATE[key];
    return next;
  }, cloneDefaultRdyWeightOffState());
};

const READINESS_HARD_FILTER_KEYS = ["idm", "conv", "oga"] as const;
type ReadinessHardFilterKey = typeof READINESS_HARD_FILTER_KEYS[number];

interface ReadinessHardFilterRule {
  enabled: boolean;
  thresholdPercent: number;
}

type ReadinessHardFilterState = Record<ReadinessHardFilterKey, ReadinessHardFilterRule>;
type ReadinessHardFilterRejects = Record<ReadinessHardFilterKey, number>;

const DEFAULT_READINESS_HARD_FILTERS: ReadinessHardFilterState = {
  idm: { enabled: false, thresholdPercent: 0 },
  conv: { enabled: false, thresholdPercent: 0 },
  oga: { enabled: false, thresholdPercent: 0 },
};

const READINESS_HARD_FILTER_LABELS: Record<ReadinessHardFilterKey, string> = {
  idm: "IDM",
  conv: "Conv",
  oga: "OGA",
};

const READINESS_HARD_FILTER_COPY: Record<ReadinessHardFilterKey, {
  label: string;
  help: string;
}> = {
  idm: {
    label: "IDM minimum",
    help: "Rejects candidates below this Ideal Draw Match percentage. IDM is descriptive bucket alignment, not a win probability.",
  },
  conv: {
    label: "Conv impact minimum",
    help: "Rejects candidates below this pool-normalised absolute Conv impact. Direction is ignored because Conv direction is not predictive.",
  },
  oga: {
    label: "OGA component minimum",
    help: "Rejects candidates below this Rdy-normalised OGA component. This is OGA similarity, not raw OGA percentile.",
  },
};

const cloneDefaultReadinessHardFilters = (): ReadinessHardFilterState => ({
  idm: { ...DEFAULT_READINESS_HARD_FILTERS.idm },
  conv: { ...DEFAULT_READINESS_HARD_FILTERS.conv },
  oga: { ...DEFAULT_READINESS_HARD_FILTERS.oga },
});

const clampPercent = (value: unknown, fallback = 0): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const clampDgaMonthlyBucketStateOpacity = (value: unknown): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(0.25, Math.min(1, Math.round(numeric * 20) / 20));
};

const normalizeReadinessHardFilters = (input: unknown): ReadinessHardFilterState => {
  const defaults = cloneDefaultReadinessHardFilters();
  if (!input || typeof input !== "object") return defaults;
  const source = input as Partial<Record<ReadinessHardFilterKey, Partial<ReadinessHardFilterRule>>>;
  READINESS_HARD_FILTER_KEYS.forEach((key) => {
    const rule = source[key];
    if (!rule || typeof rule !== "object") return;
    const enabled = !!rule.enabled;
    defaults[key] = {
      enabled,
      thresholdPercent: enabled ? clampPercent(rule.thresholdPercent, 0) : 0,
    };
  });
  return defaults;
};

const formatReadinessHardFilterSummary = (filters: ReadinessHardFilterState): string => {
  const active = READINESS_HARD_FILTER_KEYS
    .filter((key) => filters[key].enabled)
    .map((key) => `${READINESS_HARD_FILTER_LABELS[key]}>=${filters[key].thresholdPercent}%`);
  return active.length ? active.join(" · ") : "off";
};

const emptyReadinessHardFilterRejects = (): ReadinessHardFilterRejects => ({
  idm: 0,
  conv: 0,
  oga: 0,
});

const totalReadinessHardFilterRejects = (rejects: ReadinessHardFilterRejects): number => (
  READINESS_HARD_FILTER_KEYS.reduce((sum, key) => sum + rejects[key], 0)
);

const toNineBucketDistribution = (values: readonly number[] | null | undefined): number[] | null => {
  if (!Array.isArray(values) || values.length === 0) return null;
  const next = Array(9).fill(0);
  values.slice(0, 9).forEach((value, index) => {
    next[index] = Number.isFinite(value) ? Math.max(0, value) : 0;
  });
  return next;
};

const buildNumberToMonthlyBucketMap = (bucketSets: MonthlyBucketSets | null | undefined): Map<number, number> | null => {
  if (!bucketSets) return null;
  const numberToBucket = new Map<number, number>();
  const sets = [
    bucketSets.undrawn,
    bucketSets.times1,
    bucketSets.times2,
    bucketSets.times3,
    bucketSets.times4,
    bucketSets.times5,
    bucketSets.times6,
    bucketSets.times7,
    bucketSets.times8,
  ];
  sets.forEach((set, bucketIndex) => {
    set.forEach((number) => numberToBucket.set(number, bucketIndex));
  });
  return numberToBucket;
};

const distributionFromBucketMap = (numberToBucket: Map<number, number> | null): number[] | null => {
  if (!numberToBucket) return null;
  const distribution = Array(9).fill(0);
  numberToBucket.forEach((bucket) => {
    if (bucket >= 0 && bucket <= 8) distribution[bucket] += 1;
  });
  return distribution;
};

const targetDistributionFromMonthlyAverages = (monthlyAvgBuckets: { times: number; avg: number }[]): number[] | null => {
  if (!monthlyAvgBuckets.length) return null;
  const rawDistribution = Array(9).fill(0);
  monthlyAvgBuckets.forEach((bucket) => {
    const bucketIndex = Math.min(Math.max(0, Math.floor(bucket.times)), 8);
    if (bucketIndex > 0 && Number.isFinite(bucket.avg)) rawDistribution[bucketIndex] += bucket.avg;
  });
  const distribution = rawDistribution.map((value, index) => (index > 0 ? Math.round(value) : 0));
  const drawnTotal = distribution.slice(1).reduce((sum, value) => sum + value, 0);
  distribution[0] = Math.max(0, 45 - drawnTotal);
  return distribution;
};

const sumSquaredDistance = (left: number[], right: number[]): number => {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    sum += delta * delta;
  }
  return sum;
};

const scoreCandidateIdealDrawMatch = (
  numbers: number[],
  numberToBucket: Map<number, number>,
  idealDrawComposition: number[],
): number | null => {
  const candidateComposition = Array(9).fill(0);
  numbers.forEach((number) => {
    const bucket = numberToBucket.get(number);
    if (bucket !== undefined) candidateComposition[bucket] += 1;
  });
  let totalDiff = 0;
  for (let index = 0; index < 9; index += 1) {
    totalDiff += Math.abs(candidateComposition[index] - (idealDrawComposition[index] ?? 0));
  }
  return Math.max(0, 1 - totalDiff / 16);
};

const scoreCandidateConvergence = (
  numbers: number[],
  numberToBucket: Map<number, number>,
  currentDistribution: number[],
  targetDistribution: number[],
  preDrawDistance: number,
): number | null => {
  const postDistribution = [...currentDistribution];
  numbers.forEach((number) => {
    const bucket = numberToBucket.get(number);
    if (bucket === undefined) return;
    postDistribution[bucket] -= 1;
    postDistribution[Math.min(bucket + 1, 8)] += 1;
  });
  return preDrawDistance - sumSquaredDistance(postDistribution, targetDistribution);
};

interface ApplyReadinessHardFiltersContext {
  monthlyBuckets: MonthlyBucketSets | null | undefined;
  monthlyIdealDrawState: MonthlyIdealDrawState | null;
  monthlyAvgBuckets: { times: number; avg: number }[];
  historyForOga: Draw[];
  ogaRefScores: number[];
  ogaSpokeCount: number;
  trustCandidateOgaScores?: boolean;
}

interface ApplyReadinessHardFiltersResult {
  candidates: CandidateSet[];
  rejects: ReadinessHardFilterRejects;
  skipped: string[];
}

const applyReadinessHardFiltersToCandidates = (
  candidates: CandidateSet[],
  filters: ReadinessHardFilterState,
  context: ApplyReadinessHardFiltersContext,
): ApplyReadinessHardFiltersResult => {
  const activeKeys = READINESS_HARD_FILTER_KEYS.filter((key) => filters[key].enabled);
  if (!activeKeys.length || !candidates.length) {
    return { candidates, rejects: emptyReadinessHardFilterRejects(), skipped: [] };
  }

  const rejects = emptyReadinessHardFilterRejects();
  const skipped: string[] = [];
  const bucketSets = context.monthlyIdealDrawState?.bucketSets ?? context.monthlyBuckets ?? null;
  const numberToBucket = buildNumberToMonthlyBucketMap(bucketSets);
  const currentDistribution = distributionFromBucketMap(numberToBucket);
  const targetDistribution = toNineBucketDistribution(context.monthlyIdealDrawState?.targetDistribution)
    ?? targetDistributionFromMonthlyAverages(context.monthlyAvgBuckets);
  const idealDrawComposition = toNineBucketDistribution(context.monthlyIdealDrawState?.idealDrawBucketCounts)
    ?? (currentDistribution && targetDistribution
      ? computeIdealMonthlyDraw({
        currentDistribution,
        targetDistribution,
        drawSize: 8,
      }).bucketCounts.map(({ count }) => count)
      : null);

  const needsMonthlyScores = filters.idm.enabled || filters.conv.enabled;
  const monthlyScoresAvailable = !needsMonthlyScores || !!(numberToBucket && currentDistribution && targetDistribution && idealDrawComposition);
  if (!monthlyScoresAvailable) {
    if (filters.idm.enabled) skipped.push("IDM skipped: monthly bucket ideal state unavailable");
    if (filters.conv.enabled) skipped.push("Conv skipped: monthly bucket target state unavailable");
  }

  const idmScores = new Map<number, number>();
  const convRawScores = new Map<number, number>();
  let maxAbsConv = 0;
  if (monthlyScoresAvailable && numberToBucket && currentDistribution && targetDistribution && idealDrawComposition) {
    const preDrawDistance = sumSquaredDistance(currentDistribution, targetDistribution);
    candidates.forEach((candidate, index) => {
      const numbers = [...candidate.main, ...candidate.supp];
      if (filters.idm.enabled) {
        const idmScore = scoreCandidateIdealDrawMatch(numbers, numberToBucket, idealDrawComposition);
        if (idmScore !== null) idmScores.set(index, idmScore);
      }
      if (filters.conv.enabled) {
        const convScore = scoreCandidateConvergence(numbers, numberToBucket, currentDistribution, targetDistribution, preDrawDistance);
        if (convScore !== null) {
          convRawScores.set(index, convScore);
          maxAbsConv = Math.max(maxAbsConv, Math.abs(convScore));
        }
      }
    });
  }

  const ogaReferenceScores = context.ogaRefScores.filter((score) => Number.isFinite(score));
  const ogaScoresAvailable = !filters.oga.enabled || (context.historyForOga.length > 0 && ogaReferenceScores.length > 0);
  if (!ogaScoresAvailable) {
    skipped.push("OGA skipped: OGA reference history unavailable");
  }

  const ogaSimilarityScores = new Map<number, number>();
  if (filters.oga.enabled && ogaScoresAvailable) {
    candidates.forEach((candidate, index) => {
      const numbers = [...candidate.main, ...candidate.supp];
      const candidateOga = context.trustCandidateOgaScores && Number.isFinite(candidate.ogaScore)
        ? candidate.ogaScore as number
        : computeOGA(numbers, context.historyForOga, context.ogaSpokeCount);
      const candidatePercentile = context.trustCandidateOgaScores && Number.isFinite(candidate.ogaPercentile)
        ? candidate.ogaPercentile as number
        : getOGAPercentile(candidateOga, ogaReferenceScores);
      ogaSimilarityScores.set(index, ogaPercentileToSimilarity(candidatePercentile));
    });
  }

  const filtered = candidates.filter((_candidate, index) => {
    if (filters.idm.enabled && monthlyScoresAvailable) {
      const idmScore = idmScores.get(index);
      if (idmScore === undefined || idmScore * 100 < filters.idm.thresholdPercent) {
        rejects.idm += 1;
        return false;
      }
    }
    if (filters.conv.enabled && monthlyScoresAvailable) {
      const rawConv = convRawScores.get(index);
      const convPercent = maxAbsConv > 0 && rawConv !== undefined ? (Math.abs(rawConv) / maxAbsConv) * 100 : 0;
      if (rawConv === undefined || convPercent < filters.conv.thresholdPercent) {
        rejects.conv += 1;
        return false;
      }
    }
    if (filters.oga.enabled && ogaScoresAvailable) {
      const ogaSimilarity = ogaSimilarityScores.get(index);
      if (ogaSimilarity === undefined || ogaSimilarity * 100 < filters.oga.thresholdPercent) {
        rejects.oga += 1;
        return false;
      }
    }
    return true;
  });

  return { candidates: filtered, rejects, skipped };
};

type GenerationRejectionStats = GenerateCandidatesResult["rejectionStats"];

const FULL_GENERATED_CANDIDATE_NUMBER_COUNT = 8;
const USER_SELECTION_GENERATION_BLOCK_MESSAGE =
  "Can't create an 8-number candidate from the user selection. Select at least 8 numbers, or turn off Exclude unselected.";
const ACTIVE_SETUP_PROVENANCE_TARGET_IDS = {
  historySource: "panel-windowed-draw-filtering",
  filtersDistance: "windfall-generation-hard-filters",
  recencyLatestDraw: "windfall-generation-recency-latest-draw",
  geometryPattern: "windfall-generation-engine-ranking",
  endingBuckets: "windfall-generation-ending-digits-buckets",
  monthlyCarryOver: "windfall-generation-monthly-timing-bias",
} as const;
type ActiveSetupProvenanceTarget = keyof typeof ACTIVE_SETUP_PROVENANCE_TARGET_IDS;
const ACTIVE_SETUP_SHAPE_BUCKET_CARD_ID = "windfall-generation-shape-bucket-quotas";

const formatTracePairs = (pairs: Array<[string, number | string]>): string => (
  pairs.map(([label, value]) => `${label}:${value}`).join(" · ")
);

const formatTraceNumberPreview = (numbers: readonly number[], limit = 18): string => {
  if (!numbers.length) return "none";
  const sorted = Array.from(new Set(numbers)).sort((a, b) => a - b);
  const preview = sorted.slice(0, limit).join(", ");
  return sorted.length > limit ? `${preview}, +${sorted.length - limit} more` : preview;
};

const formatMonthlyConstraintCountsForTrace = (counts: MonthlyFrequencyConstraints): string => (
  `0x>=${counts.undrawn} 1x>=${counts.times1} 2x>=${counts.times2} 3x>=${counts.times3} 4x>=${counts.times4} 5x>=${counts.times5} 6x>=${counts.times6} 7x>=${counts.times7} 8x+>=${counts.times8}`
);

const formatGenerationTraceLines = (options: {
  label: string;
  requested: number;
  kept: number;
  elapsedMs: number;
  stats: GenerationRejectionStats;
  monthlyRejects: number;
  prizeRejects: number;
  capRejects: number;
  readinessRejects?: number;
  poolSize?: number;
  overgenFactor?: number;
  filteredCount?: number;
  budget?: number;
}): string[] => {
  const {
    label,
    requested,
    kept,
    elapsedMs,
    stats,
    monthlyRejects,
    prizeRejects,
    capRejects,
    readinessRejects,
    poolSize,
    overgenFactor,
    filteredCount,
    budget,
  } = options;
  const poolSummary = poolSize !== undefined
    ? `, pool ${poolSize}${overgenFactor !== undefined ? ` (overgen ${overgenFactor}x)` : ""}${filteredCount !== undefined ? ` -> filtered ${filteredCount}` : ""}`
    : "";
  const budgetSummary = budget !== undefined ? `, budget ${budget}` : "";

  return [
    `[TRACE] ${label}: requested ${requested}${poolSummary} -> kept ${kept} (accepted ${stats.accepted}/${stats.totalAttempts} attempts${budgetSummary}) in ${elapsedMs}ms`,
    `[TRACE] ${label} Rejects · hard filters: ${formatTracePairs([
      ["exclusions", stats.exclusions],
      ["sum", stats.sumRange],
      ["div5", stats.div5],
      ["entropy", stats.entropy],
      ["hamming", stats.hamming],
      ["jaccard", stats.jaccard],
    ])}`,
    `[TRACE] ${label} Rejects · digit buckets: ${formatTracePairs([
      ["end0", stats.mainZeroSet],
      ["end1", stats.mainOneSet],
      ["end2", stats.mainTwoSet],
      ["end3", stats.mainThreeSet],
      ["end4", stats.mainFourSet],
      ["end5", stats.mainFiveSet],
      ["end6", stats.mainSixSet],
      ["end7", stats.mainSevenSet],
      ["end8", stats.mainEightSet],
      ["end9", stats.mainNineSet],
      ["digitWidth", stats.digitWidth],
    ])}`,
    `[TRACE] ${label} Rejects · shape/recency: ${formatTracePairs([
      ["oddEven", stats.oddEven],
      ["tricky", stats.tricky],
      ["repeat", stats.repeatUnion],
      ["ld±1", stats.latestNeighbourSupport],
      ["strictDrought", stats.strictDroughtQuota],
      ["recMin", stats.minRecent],
      ["recMax", stats.maxLastDraw],
      ["recBias", stats.recentBias],
      ["trend", stats.trendRatio],
      ["pattern", stats.patternConstraint],
      ["ogaBias", stats.ogaBias],
    ])}`,
    `[TRACE] ${label} Rejects · post filters: ${formatTracePairs([
      ["monthly", monthlyRejects],
      ["readiness", readinessRejects ?? 0],
      ["prize", prizeRejects],
      ["ogaCap", capRejects],
    ])}`,
  ];
};


const custom: ZoneGroups = [
  [1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10],
  [11, 12, 13, 14, 15],
  [16, 17, 18, 19, 20],
  [21, 22, 23, 24, 25],
  [26, 27, 28, 29, 30],
  [31, 32, 33, 34, 35],
  [36, 37, 38, 39, 40],
  [41, 42, 43, 44, 45],
];

const WINDOW_OPTIONS = [
  { key: "W", label: "Weekly (3 draws)", size: 3 },
  { key: "F", label: "Fortnight (6 draws)", size: 6 },
  { key: "M", label: "Month (13 draws)", size: 13 },
  { key: "Q", label: "Quarter (36 draws)", size: 36 },
  { key: "Y", label: "Year (156 draws)", size: 156 },
  { key: "H", label: "History (all draws)", size: null },
  { key: "Custom", label: "Custom", size: null },
];

const NUM_MAINS = 6;
const MAIN_MIN = 1;
const MAIN_MAX = 45;
const MIN_VALID_DRAWS = 45;
const API_URL =
  "https://api.thelott.com/sales/vmax/web/data/lotto/results?companyId=Tatts&productId=WeekdayWindfall&maxDrawCount=50";
const DEFAULT_ATTEMPT_MULTIPLIER = 400;
const MAX_DROUGHT_BREAK_FORCED_NUMBERS = 3;
const STRICT_DROUGHT_QUOTA_TOP_K = 8;

const zeroMonthlyFrequencyConstraints = (): MonthlyFrequencyConstraints => ({
  undrawn: 0,
  times1: 0,
  times2: 0,
  times3: 0,
  times4: 0,
  times5: 0,
  times6: 0,
  times7: 0,
  times8: 0,
});

const MONTHLY_FREQUENCY_KEYS: (keyof MonthlyFrequencyConstraints)[] = [
  "undrawn",
  "times1",
  "times2",
  "times3",
  "times4",
  "times5",
  "times6",
  "times7",
  "times8",
];

const MONTHLY_FREQUENCY_SHORT_LABELS: Record<keyof MonthlyFrequencyConstraints, string> = {
  undrawn: "0x",
  times1: "1x",
  times2: "2x",
  times3: "3x",
  times4: "4x",
  times5: "5x",
  times6: "6x",
  times7: "7x",
  times8: "8x+",
};

const maxMonthlyFrequencyConstraints = (
  ...constraints: (MonthlyFrequencyConstraints | null | undefined)[]
): MonthlyFrequencyConstraints => {
  const merged = zeroMonthlyFrequencyConstraints();
  for (const constraint of constraints) {
    if (!constraint) continue;
    for (const key of MONTHLY_FREQUENCY_KEYS) {
      merged[key] = Math.max(merged[key], Math.max(0, constraint[key] ?? 0));
    }
  }
  return merged;
};

const monthlyFrequencyConstraintsSignature = (constraints: MonthlyFrequencyConstraints | null | undefined): string => (
  constraints ? MONTHLY_FREQUENCY_KEYS.map((key) => `${key}:${constraints[key]}`).join("|") : "null"
);

const monthlyBucketSetsSignature = (sets: MonthlyBucketSets | null | undefined): string => (
  sets
    ? MONTHLY_FREQUENCY_KEYS
      .map((key) => `${key}:${Array.from(sets[key]).sort((a, b) => a - b).join(",")}`)
      .join("|")
    : "null"
);

const sameNumberList = (
  left: readonly number[] | null | undefined,
  right: readonly number[] | null | undefined,
): boolean => {
  const leftValues = left ?? [];
  const rightValues = right ?? [];
  return leftValues.length === rightValues.length && leftValues.every((value, index) => value === rightValues[index]);
};

const keepExistingNumberListWhenEqual = (current: number[], next: number[]): number[] => (
  sameNumberList(current, next) ? current : next
);

const hasActiveTerminalCoordinationRuleForTrace = (
  options?: { maxCount?: number; boost?: number; singleDigitBoost?: number; twoDigitBoost?: number },
): boolean => (
  typeof options?.maxCount === "number" ||
  [options?.boost, options?.singleDigitBoost, options?.twoDigitBoost].some((value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0;
  })
);

const monthlyBucketLabelsSignature = (labels: Record<number, string>): string => (
  Object.entries(labels)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([number, label]) => `${number}:${label}`)
    .join("|")
);

const monthlyNumberListSignature = (numbers: readonly number[] | null | undefined): string => (
  numbers ? numbers.join(",") : "null"
);

const monthlySelectionSignature = (
  selections: MonthlyConstraintPayload["selectedNumbersByBucket"] | null | undefined,
): string => (
  selections
    ? MONTHLY_FREQUENCY_KEYS.map((key) => `${key}:${selections[key].join(",")}`).join("|")
    : "null"
);

const monthlyConstraintPayloadAppSignature = (payload: MonthlyConstraintPayload | null | undefined): string => (
  payload
    ? [
      monthlyFrequencyConstraintsSignature(payload.constraints),
      monthlyBucketSetsSignature(payload.buckets),
      monthlySelectionSignature(payload.selectedNumbersByBucket),
      payload.selectedNumberBiasEnabled ? "bias-on" : "bias-off",
    ].join("::")
    : "null"
);

const monthlyAvgBucketsSignature = (rows: { times: number; avg: number }[] | null | undefined): string => (
  rows ? rows.map((row) => `${row.times}:${row.avg}`).join("|") : "null"
);

const monthlyIdealDrawStateAppSignature = (state: MonthlyIdealDrawState | null | undefined): string => (
  state
    ? [
      state.effectiveMonthLabel,
      state.effectiveMonthIsSynthetic ? "synthetic" : "observed",
      monthlyNumberListSignature(state.targetDistribution),
      monthlyNumberListSignature(state.idealDrawBucketCounts),
      monthlyBucketSetsSignature(state.bucketSets),
    ].join("::")
    : "null"
);

const stageIdealDrawStateAppSignature = (state: StageIdealDrawState | null | undefined): string => (
  state
    ? [
      state.workingMonthLabel,
      state.expectedDrawCount,
      state.targetStageDrawCount,
      state.completedDrawCount,
      state.comparableMonthCount,
      state.expectedDrawCountSource,
      monthlyNumberListSignature(state.currentDistribution),
      monthlyNumberListSignature(state.targetDistribution),
      monthlyNumberListSignature(state.idealDrawBucketCounts),
      state.warnings.join("|"),
      monthlyBucketSetsSignature(state.bucketSets),
    ].join("::")
    : "null"
);

const generationConstraintNumberBuckets = {
  main0: [10, 20, 30, 40],
  main1: [1, 11, 21, 31, 41],
  main2: [2, 12, 22, 32, 42],
  main3: [3, 13, 23, 33, 43],
  main4: [4, 14, 24, 34, 44],
  main5: [5, 15, 25, 35, 45],
  main6: [6, 16, 26, 36],
  main7: [7, 17, 27, 37],
  main8: [8, 18, 28, 38],
  main9: [9, 19, 29, 39],
} as const;

const generationConstraintDecadeBuckets = {
  decade0x: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  decade1x: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  decade2x: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
  decade3x: [30, 31, 32, 33, 34, 35, 36, 37, 38, 39],
  decade4x: [40, 41, 42, 43, 44, 45],
} as const;

type GenerationConstraintBucketKey = keyof typeof generationConstraintNumberBuckets;
type GenerationConstraintDecadeKey = keyof typeof generationConstraintDecadeBuckets;

type MainBucketBoostKind = "singleDigit" | "twoDigit";
type MainBucketBoostState = Record<GenerationConstraintBucketKey, {
  singleDigit: number;
  twoDigit: number;
}>;

const defaultMainBucketBoosts: MainBucketBoostState = {
  main0: { singleDigit: 0, twoDigit: 0 },
  main1: { singleDigit: 0, twoDigit: 0 },
  main2: { singleDigit: 0, twoDigit: 0 },
  main3: { singleDigit: 0, twoDigit: 0 },
  main4: { singleDigit: 0, twoDigit: 0 },
  main5: { singleDigit: 0, twoDigit: 0 },
  main6: { singleDigit: 0, twoDigit: 0 },
  main7: { singleDigit: 0, twoDigit: 0 },
  main8: { singleDigit: 0, twoDigit: 0 },
  main9: { singleDigit: 0, twoDigit: 0 },
};

const defaultMainDecadeBiases: Record<GenerationConstraintDecadeKey, number> = {
  decade0x: 0,
  decade1x: 0,
  decade2x: 0,
  decade3x: 0,
  decade4x: 0,
};

const defaultKnobs: Knobs = {
  enableSDE1: false,
  enableHC3: false,
  enableOGA: false,
  enableGPWF: false,
  enableEntropy: false,
  enableHamming: false,
  enableJaccard: false,
  F: 0.03,
  M: 0.8,
  Q: 0.4,
  Y: 0.1,
  Historical_Weight: 0.05,
  gpwf_window_size: 27,
  gpwf_bias_factor: 0.05,
  gpwf_floor: 0.5,
  gpwf_scale_multiplier: 0.7,
  lambda: 0.85,
  octagonal_top: 9,
  exact_set_override: false,
  hamming_relax: false,
  gpwf_targeted_mode: false,
};

function computeNumberTrends(history: Draw[]): NumberTrend[] {
  const spans = {
    d3: 3, d9: 9, d15: 15, fortnight: 6, month: NUMBER_TREND_MONTH_DRAW_WINDOW, quarter: 36, year: 156, all: history.length,
  };
  const result: NumberTrend[] = [];
  for (let n = 1; n <= 45; n++) {
    const trend: NumberTrend = { number: n, d3: 0, d9: 0, d15: 0, fortnight: 0, month: 0, quarter: 0, year: 0, all: 0 };
    for (const [spanName, spanLen] of Object.entries(spans)) {
      const draws = history.slice(-spanLen);
      let count = 0;
      for (const draw of draws) {
        if (draw.main.includes(n) || draw.supp.includes(n)) count++;
      }
      (trend as any)[spanName] = count;
    }
    result.push(trend);
  }
  return result;
}
function computeOddEvenRatios(history: Draw[]): { ratio: string; count: number; percent: number }[] {
  const ratioCount = new Map<string, number>();
  let total = 0;
  for (const draw of history) {
    const nums = [...draw.main, ...draw.supp];
    const odd = nums.filter((n) => n % 2 === 1).length;
    const even = nums.length - odd;
    const ratio = `${odd}:${even}`;
    ratioCount.set(ratio, (ratioCount.get(ratio) || 0) + 1);
    total += 1;
  }
  return Array.from(ratioCount.entries())
    .map(([ratio, count]) => ({ ratio, count, percent: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count || a.ratio.localeCompare(b.ratio));
}
function parseCsvDateToEpoch(s: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  const parts = s.split("/");
  if (parts.length >= 3) {
    const m = Number(parts[0]);
    const d = Number(parts[1]);
    let y = Number(parts[2]);
    if (y < 100) y = 2000 + y;
    return new Date(y, m - 1, d).getTime();
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

function monthLabelForHistoryScope(draw: Draw): string | null {
  const epoch = parseCsvDateToEpoch(draw.date);
  if (!Number.isFinite(epoch) || epoch <= 0) return null;
  const date = new Date(epoch);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function AppInner(): JSX.Element {
  const { runGenerate, cancelGenerate } = useGenerateWorker();
  const [history, setHistory] = useState<Draw[]>([]);
  const [startupHistoryChoice, setStartupHistoryChoice] = useState<InitialDrawHistoryChoice | null>(null);
  const realHistoryResult = useMemo(
    () => filterRealDrawHistory(history, "app-wide evidence panels and generation weights"),
    [history],
  );
  const realHistory = realHistoryResult.history;
  const planningDrawContext = usePlanningDrawContext(realHistory);
  const sde1Hc3ContextBacktest = useMemo(
    () => analyzeSde1Hc3ContextBacktest(realHistory, {
      targetDrawOrdinal: planningDrawContext.targetDrawOrdinal,
    }),
    [realHistory, planningDrawContext.targetDrawOrdinal],
  );
  const baselineHistoryScope = useMemo(() => {
    const rows = realHistory
      .map((draw) => ({ draw, monthLabel: monthLabelForHistoryScope(draw) }))
      .filter((row): row is { draw: Draw; monthLabel: string } => Boolean(row.monthLabel));
    const excludedMonthLabels = getExcludedMonthLabelsForHistoryBaselines(rows, (row) => row.monthLabel);
    const historyForBaselines = filterRowsForHistoryBaselines(rows, (row) => row.monthLabel).map((row) => row.draw);
    return {
      history: historyForBaselines,
      excludedMonthLabels,
    };
  }, [realHistory]);
  const baselineHistory = baselineHistoryScope.history;
  const baselineHistoryScopeLabel = baselineHistoryScope.excludedMonthLabels.length
    ? `Windfall baseline history (${baselineHistory.length} real draws; excludes ${baselineHistoryScope.excludedMonthLabels.join(", ")})`
    : `Windfall baseline history (${baselineHistory.length} real draws)`;
  const [windowMode, setWindowMode] = useState<"W" | "F" | "M" | "Q" | "Y" | "H" | "Custom">("H");
  const [customDrawCount, setCustomDrawCount] = useState<number>(1);
  const [windowEnabled, setWindowEnabled] = useState<boolean>(true);

  const [drawWindowMode, setDrawWindowMode] = useState<"lastN" | "range">("lastN");
  const [rangeFrom, setRangeFrom] = useState<number>(1);
  const [rangeTo, setRangeTo] = useState<number>(history.length);

  useEffect(() => {
    if (!history.length) return;
    setRangeFrom((v) => Math.max(1, Math.min(v, history.length)));
    setRangeTo((v) => Math.max(rangeFrom, Math.min(v, history.length)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length]);

  const [knobs, setKnobs] = useState<Knobs>(defaultKnobs);
  const [gpwf_window_size, setGPWFWindowSize] = useState<number>(defaultKnobs.gpwf_window_size);
  const [gpwf_bias_factor, setGPWFBiasFactor] = useState<number>(defaultKnobs.gpwf_bias_factor);
  const [gpwf_floor, setGPWFFloor] = useState<number>(defaultKnobs.gpwf_floor);
  const [gpwf_scale_multiplier, setGPWFScaleMultiplier] = useState<number>(defaultKnobs.gpwf_scale_multiplier);

  const [rankingWeights, setRankingWeights] = useState<RankingWeights>({
      oga: 0.7,
      selHitsEnabled: false,
      sel: 0.2,
      recentHitsEnabled: false,
      recent: 0.1,
      selBonusThreshold: 3,
      selBonusWeight: 0,
    });
  const [selectedBoostEnabled, setSelectedBoostEnabled] = useState<boolean>(false);
  const [selectedBoostFactor, setSelectedBoostFactor] = useState<number>(2);
  const [weightedTargets, setWeightedTargets] = useState<Record<number, number>>({});
  const [batesParams, setBatesParams] = useState<Partial<BatesParameterSet>>({});
  const [probOverlay, setProbOverlay] = useState<{ pAtLeastRaw: number; pAtLeastWeighted: number; targetRaw: number; targetWeighted: number } | null>(null);

  const [entropyEnabled, setEntropyEnabled] = useState<boolean>(defaultKnobs.enableEntropy);
  const [hammingEnabled, setHammingEnabled] = useState<boolean>(defaultKnobs.enableHamming);
  const [jaccardEnabled, setJaccardEnabled] = useState<boolean>(defaultKnobs.enableJaccard);
  const [gpwfEnabled, setGPWFEnabled] = useState<boolean>(defaultKnobs.enableGPWF);
  const [entropyThreshold, setEntropyThreshold] = useState<number>(1.0);
  const [hammingThreshold, setHammingThreshold] = useState<number>(3);
  const [jaccardThreshold, setJaccardThreshold] = useState<number>(0.5);
  const [mainZeroSetEnabled, setMainZeroSetEnabled] = useState<boolean>(false);
  const [maxMainZeroSetCount, setMaxMainZeroSetCount] = useState<number>(0);
  const [mainFiveSetEnabled, setMainFiveSetEnabled] = useState<boolean>(false);
  const [maxMainFiveSetCount, setMaxMainFiveSetCount] = useState<number>(0);
  const [mainOneSetEnabled, setMainOneSetEnabled] = useState<boolean>(false);
  const [maxMainOneSetCount, setMaxMainOneSetCount] = useState<number>(0);
  const [mainTwoSetEnabled, setMainTwoSetEnabled] = useState<boolean>(false);
  const [maxMainTwoSetCount, setMaxMainTwoSetCount] = useState<number>(0);
  const [mainThreeSetEnabled, setMainThreeSetEnabled] = useState<boolean>(false);
  const [maxMainThreeSetCount, setMaxMainThreeSetCount] = useState<number>(0);
  const [mainFourSetEnabled, setMainFourSetEnabled] = useState<boolean>(false);
  const [maxMainFourSetCount, setMaxMainFourSetCount] = useState<number>(0);
  const [mainSixSetEnabled, setMainSixSetEnabled] = useState<boolean>(false);
  const [maxMainSixSetCount, setMaxMainSixSetCount] = useState<number>(0);
  const [mainSevenSetEnabled, setMainSevenSetEnabled] = useState<boolean>(false);
  const [maxMainSevenSetCount, setMaxMainSevenSetCount] = useState<number>(0);
  const [mainEightSetEnabled, setMainEightSetEnabled] = useState<boolean>(false);
  const [maxMainEightSetCount, setMaxMainEightSetCount] = useState<number>(0);
  const [mainNineSetEnabled, setMainNineSetEnabled] = useState<boolean>(false);
  const [maxMainNineSetCount, setMaxMainNineSetCount] = useState<number>(0);
  const [mainBucketBoosts, setMainBucketBoosts] = useState<MainBucketBoostState>(defaultMainBucketBoosts);
  const [mainDecadeBiases, setMainDecadeBiases] = useState<Record<GenerationConstraintDecadeKey, number>>(defaultMainDecadeBiases);
  const [digitWidthConstraintEnabled, setDigitWidthConstraintEnabled] = useState<boolean>(false);
  const [digitWidthSingleDigitPercent, setDigitWidthSingleDigitPercent] = useState<number>(0);
  const [digitWidthConstraintScope, setDigitWidthConstraintScope] = useState<DigitWidthConstraintScope>("main");
  const [acceptanceNeedsEnabled, setAcceptanceNeedsEnabled] = useState<boolean>(false);
  const [acceptanceNeedsCounts, setAcceptanceNeedsCounts] = useState<MonthlyFrequencyConstraints>(() => zeroMonthlyFrequencyConstraints());
  const [acceptanceNeedsHardExclude, setAcceptanceNeedsHardExclude] = useState<boolean>(false);
  const [attemptMultiplier, setAttemptMultiplier] = useState<number>(DEFAULT_ATTEMPT_MULTIPLIER);
  const [overgenFactor, setOvergenFactor] = useState<number>(50);
  const [scoringGenerationInfluence, setScoringGenerationInfluence] = useState<ScoringGenerationInfluence>("off");
  const [d1TerminalMomentumSgiEnabled, setD1TerminalMomentumSgiEnabled] = useState<boolean>(false);

  // Sum range filter state used in Candidate Generation Influences
  const [sumFilter, setSumFilter] = useState<{ enabled: boolean; min: number; max: number; includeSupp: boolean }>({
    enabled: false,
    min: 0,
    max: 0,
    includeSupp: true,
  });

  const [lambdaEnabled, setLambdaEnabled] = useState<boolean>(false);
  const [lambda, setLambda] = useState<number>(0.85);

  const updateMainBucketBoost = useCallback((bucketKey: GenerationConstraintBucketKey, boostKind: MainBucketBoostKind, nextBoost: number) => {
    const safeBoost = Math.max(0, Math.min(5, Number.isFinite(nextBoost) ? nextBoost : 0));
    setMainBucketBoosts((prev) => ({
      ...prev,
      [bucketKey]: {
        ...prev[bucketKey],
        [boostKind]: safeBoost,
      },
    }));
  }, []);

  const updateMainDecadeBias = useCallback((bucketKey: GenerationConstraintDecadeKey, nextBias: number) => {
    const safeBias = Math.max(-5, Math.min(5, Number.isFinite(nextBias) ? nextBias : 0));
    setMainDecadeBiases((prev) => ({
      ...prev,
      [bucketKey]: safeBias,
    }));
  }, []);

  const exactConstraintRows = useMemo(() => [
    {
      key: "main0",
      label: "0-ending numbers max allowed",
      helper: "at most this many candidate numbers ending in 0 (main + supp)",
      badge: "(10, 20, 30, 40)",
      max: 4,
      enabled: mainZeroSetEnabled,
      setEnabled: setMainZeroSetEnabled,
      count: maxMainZeroSetCount,
      setCount: setMaxMainZeroSetCount,
      singleDigitBoost: mainBucketBoosts.main0.singleDigit,
      twoDigitBoost: mainBucketBoosts.main0.twoDigit,
      setSingleDigitBoost: (nextBoost: number) => updateMainBucketBoost("main0", "singleDigit", nextBoost),
      setTwoDigitBoost: (nextBoost: number) => updateMainBucketBoost("main0", "twoDigit", nextBoost),
      title: "Allow at most this many candidate numbers from the set 10, 20, 30, 40 across main and supplementary picks.",
      bucketKey: "main0" as const,
    },
    {
      key: "main1",
      label: "1-ending numbers max allowed",
      helper: "at most this many candidate numbers ending in 1 (main + supp)",
      badge: "(1, 11, 21, 31, 41)",
      max: 5,
      enabled: mainOneSetEnabled,
      setEnabled: setMainOneSetEnabled,
      count: maxMainOneSetCount,
      setCount: setMaxMainOneSetCount,
      singleDigitBoost: mainBucketBoosts.main1.singleDigit,
      twoDigitBoost: mainBucketBoosts.main1.twoDigit,
      setSingleDigitBoost: (nextBoost: number) => updateMainBucketBoost("main1", "singleDigit", nextBoost),
      setTwoDigitBoost: (nextBoost: number) => updateMainBucketBoost("main1", "twoDigit", nextBoost),
      title: "Allow at most this many candidate numbers from the set 1, 11, 21, 31, 41 across main and supplementary picks.",
      bucketKey: "main1" as const,
    },
    {
      key: "main2",
      label: "2-ending numbers max allowed",
      helper: "at most this many candidate numbers ending in 2 (main + supp)",
      badge: "(2, 12, 22, 32, 42)",
      max: 5,
      enabled: mainTwoSetEnabled,
      setEnabled: setMainTwoSetEnabled,
      count: maxMainTwoSetCount,
      setCount: setMaxMainTwoSetCount,
      singleDigitBoost: mainBucketBoosts.main2.singleDigit,
      twoDigitBoost: mainBucketBoosts.main2.twoDigit,
      setSingleDigitBoost: (nextBoost: number) => updateMainBucketBoost("main2", "singleDigit", nextBoost),
      setTwoDigitBoost: (nextBoost: number) => updateMainBucketBoost("main2", "twoDigit", nextBoost),
      title: "Allow at most this many candidate numbers from the set 2, 12, 22, 32, 42 across main and supplementary picks.",
      bucketKey: "main2" as const,
    },
    {
      key: "main3",
      label: "3-ending numbers max allowed",
      helper: "at most this many candidate numbers ending in 3 (main + supp)",
      badge: "(3, 13, 23, 33, 43)",
      max: 5,
      enabled: mainThreeSetEnabled,
      setEnabled: setMainThreeSetEnabled,
      count: maxMainThreeSetCount,
      setCount: setMaxMainThreeSetCount,
      singleDigitBoost: mainBucketBoosts.main3.singleDigit,
      twoDigitBoost: mainBucketBoosts.main3.twoDigit,
      setSingleDigitBoost: (nextBoost: number) => updateMainBucketBoost("main3", "singleDigit", nextBoost),
      setTwoDigitBoost: (nextBoost: number) => updateMainBucketBoost("main3", "twoDigit", nextBoost),
      title: "Allow at most this many candidate numbers from the set 3, 13, 23, 33, 43 across main and supplementary picks.",
      bucketKey: "main3" as const,
    },
    {
      key: "main4",
      label: "4-ending numbers max allowed",
      helper: "at most this many candidate numbers ending in 4 (main + supp)",
      badge: "(4, 14, 24, 34, 44)",
      max: 5,
      enabled: mainFourSetEnabled,
      setEnabled: setMainFourSetEnabled,
      count: maxMainFourSetCount,
      setCount: setMaxMainFourSetCount,
      singleDigitBoost: mainBucketBoosts.main4.singleDigit,
      twoDigitBoost: mainBucketBoosts.main4.twoDigit,
      setSingleDigitBoost: (nextBoost: number) => updateMainBucketBoost("main4", "singleDigit", nextBoost),
      setTwoDigitBoost: (nextBoost: number) => updateMainBucketBoost("main4", "twoDigit", nextBoost),
      title: "Allow at most this many candidate numbers from the set 4, 14, 24, 34, 44 across main and supplementary picks.",
      bucketKey: "main4" as const,
    },
    {
      key: "main5",
      label: "5-ending numbers max allowed",
      helper: "at most this many candidate numbers ending in 5 (main + supp)",
      badge: "(5, 15, 25, 35, 45)",
      max: 5,
      enabled: mainFiveSetEnabled,
      setEnabled: setMainFiveSetEnabled,
      count: maxMainFiveSetCount,
      setCount: setMaxMainFiveSetCount,
      singleDigitBoost: mainBucketBoosts.main5.singleDigit,
      twoDigitBoost: mainBucketBoosts.main5.twoDigit,
      setSingleDigitBoost: (nextBoost: number) => updateMainBucketBoost("main5", "singleDigit", nextBoost),
      setTwoDigitBoost: (nextBoost: number) => updateMainBucketBoost("main5", "twoDigit", nextBoost),
      title: "Allow at most this many candidate numbers from the set 5, 15, 25, 35, 45 across main and supplementary picks.",
      bucketKey: "main5" as const,
    },
    {
      key: "main6",
      label: "6-ending numbers max allowed",
      helper: "at most this many candidate numbers ending in 6 (main + supp)",
      badge: "(6, 16, 26, 36)",
      max: 4,
      enabled: mainSixSetEnabled,
      setEnabled: setMainSixSetEnabled,
      count: maxMainSixSetCount,
      setCount: setMaxMainSixSetCount,
      singleDigitBoost: mainBucketBoosts.main6.singleDigit,
      twoDigitBoost: mainBucketBoosts.main6.twoDigit,
      setSingleDigitBoost: (nextBoost: number) => updateMainBucketBoost("main6", "singleDigit", nextBoost),
      setTwoDigitBoost: (nextBoost: number) => updateMainBucketBoost("main6", "twoDigit", nextBoost),
      title: "Allow at most this many candidate numbers from the set 6, 16, 26, 36 across main and supplementary picks.",
      bucketKey: "main6" as const,
    },
    {
      key: "main7",
      label: "7-ending numbers max allowed",
      helper: "at most this many candidate numbers ending in 7 (main + supp)",
      badge: "(7, 17, 27, 37)",
      max: 4,
      enabled: mainSevenSetEnabled,
      setEnabled: setMainSevenSetEnabled,
      count: maxMainSevenSetCount,
      setCount: setMaxMainSevenSetCount,
      singleDigitBoost: mainBucketBoosts.main7.singleDigit,
      twoDigitBoost: mainBucketBoosts.main7.twoDigit,
      setSingleDigitBoost: (nextBoost: number) => updateMainBucketBoost("main7", "singleDigit", nextBoost),
      setTwoDigitBoost: (nextBoost: number) => updateMainBucketBoost("main7", "twoDigit", nextBoost),
      title: "Allow at most this many candidate numbers from the set 7, 17, 27, 37 across main and supplementary picks.",
      bucketKey: "main7" as const,
    },
    {
      key: "main8",
      label: "8-ending numbers max allowed",
      helper: "at most this many candidate numbers ending in 8 (main + supp)",
      badge: "(8, 18, 28, 38)",
      max: 4,
      enabled: mainEightSetEnabled,
      setEnabled: setMainEightSetEnabled,
      count: maxMainEightSetCount,
      setCount: setMaxMainEightSetCount,
      singleDigitBoost: mainBucketBoosts.main8.singleDigit,
      twoDigitBoost: mainBucketBoosts.main8.twoDigit,
      setSingleDigitBoost: (nextBoost: number) => updateMainBucketBoost("main8", "singleDigit", nextBoost),
      setTwoDigitBoost: (nextBoost: number) => updateMainBucketBoost("main8", "twoDigit", nextBoost),
      title: "Allow at most this many candidate numbers from the set 8, 18, 28, 38 across main and supplementary picks.",
      bucketKey: "main8" as const,
    },
    {
      key: "main9",
      label: "9-ending numbers max allowed",
      helper: "at most this many candidate numbers ending in 9 (main + supp)",
      badge: "(9, 19, 29, 39)",
      max: 4,
      enabled: mainNineSetEnabled,
      setEnabled: setMainNineSetEnabled,
      count: maxMainNineSetCount,
      setCount: setMaxMainNineSetCount,
      singleDigitBoost: mainBucketBoosts.main9.singleDigit,
      twoDigitBoost: mainBucketBoosts.main9.twoDigit,
      setSingleDigitBoost: (nextBoost: number) => updateMainBucketBoost("main9", "singleDigit", nextBoost),
      setTwoDigitBoost: (nextBoost: number) => updateMainBucketBoost("main9", "twoDigit", nextBoost),
      title: "Allow at most this many candidate numbers from the set 9, 19, 29, 39 across main and supplementary picks.",
      bucketKey: "main9" as const,
    },
  ] as const, [
    mainBucketBoosts,
    mainEightSetEnabled,
    mainFiveSetEnabled,
    mainFourSetEnabled,
    mainNineSetEnabled,
    mainOneSetEnabled,
    mainSevenSetEnabled,
    mainSixSetEnabled,
    mainThreeSetEnabled,
    mainTwoSetEnabled,
    mainZeroSetEnabled,
    maxMainEightSetCount,
    maxMainFiveSetCount,
    maxMainFourSetCount,
    maxMainNineSetCount,
    maxMainOneSetCount,
    maxMainSevenSetCount,
    maxMainSixSetCount,
    maxMainThreeSetCount,
    maxMainTwoSetCount,
    maxMainZeroSetCount,
    updateMainBucketBoost,
  ]);

  const mainDecadeConstraintRows = useMemo(() => [
    {
      key: "decade0x",
      label: "0x decade (1–9)",
      helper: "boost or punish candidate numbers from 1 to 9",
      badge: "(1, 2, 3, 4, 5, 6, 7, 8, 9)",
      bias: mainDecadeBiases.decade0x,
      setBias: (nextBias: number) => updateMainDecadeBias("decade0x", nextBias),
      title: "Adjust generation weighting for candidate numbers 1 through 9 across main and supplementary picks.",
      bucketKey: "decade0x" as const,
    },
    {
      key: "decade1x",
      label: "1x decade (10–19)",
      helper: "boost or punish candidate numbers from 10 to 19",
      badge: "(10, 11, 12, 13, 14, 15, 16, 17, 18, 19)",
      bias: mainDecadeBiases.decade1x,
      setBias: (nextBias: number) => updateMainDecadeBias("decade1x", nextBias),
      title: "Adjust generation weighting for candidate numbers 10 through 19 across main and supplementary picks.",
      bucketKey: "decade1x" as const,
    },
    {
      key: "decade2x",
      label: "2x decade (20–29)",
      helper: "boost or punish candidate numbers from 20 to 29",
      badge: "(20, 21, 22, 23, 24, 25, 26, 27, 28, 29)",
      bias: mainDecadeBiases.decade2x,
      setBias: (nextBias: number) => updateMainDecadeBias("decade2x", nextBias),
      title: "Adjust generation weighting for candidate numbers 20 through 29 across main and supplementary picks.",
      bucketKey: "decade2x" as const,
    },
    {
      key: "decade3x",
      label: "3x decade (30–39)",
      helper: "boost or punish candidate numbers from 30 to 39",
      badge: "(30, 31, 32, 33, 34, 35, 36, 37, 38, 39)",
      bias: mainDecadeBiases.decade3x,
      setBias: (nextBias: number) => updateMainDecadeBias("decade3x", nextBias),
      title: "Adjust generation weighting for candidate numbers 30 through 39 across main and supplementary picks.",
      bucketKey: "decade3x" as const,
    },
    {
      key: "decade4x",
      label: "4x decade (40–45)",
      helper: "boost or punish candidate numbers from 40 to 45",
      badge: "(40, 41, 42, 43, 44, 45)",
      bias: mainDecadeBiases.decade4x,
      setBias: (nextBias: number) => updateMainDecadeBias("decade4x", nextBias),
      title: "Adjust generation weighting for candidate numbers 40 through 45 across main and supplementary picks.",
      bucketKey: "decade4x" as const,
    },
  ] as const, [mainDecadeBiases, updateMainDecadeBias]);

  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [candidates, setCandidates] = useState<CandidateSet[]>([]);
  const [pasteWeightedPortfolioCandidates, setPasteWeightedPortfolioCandidates] = useState<CandidateSet[]>([]);
  const [keptGeneratedCandidateRows, setKeptGeneratedCandidateRows] = useState<KeptGeneratedCandidateRow[]>([]);
  const [generationSessionActive, setGenerationSessionActive] = useState<boolean>(false);
  const [generationSessionRows, setGenerationSessionRows] = useState<KeptGeneratedCandidateRow[]>([]);
  const keptGeneratedCandidateSequenceRef = useRef(0);
  const generationSessionSequenceRef = useRef(0);
  const [ratioSummary, setRatioSummary] = useState<any>(null);
  const [quotaWarning, setQuotaWarning] = useState<string | undefined>(undefined);
  const [trace, setTrace] = useState<string[]>([]);
  // Trace verbosity toggle (default ON)
  const [traceVerbose, setTraceVerbose] = useState<boolean>(true);
  // Conditional trace dispatcher passed to helpers
  const setTraceMaybe = useCallback<React.Dispatch<React.SetStateAction<string[]>>>((updater) => {
    if (!traceVerbose) return;
    // Forward either function or direct array value
    // @ts-ignore
    setTrace(updater);
  }, [traceVerbose]);
  useEffect(() => {
    if (!scoringGenerationInfluenceTraceReadyRef.current) {
      scoringGenerationInfluenceTraceReadyRef.current = true;
      return;
    }
    if (!traceVerbose) return;
    const label = formatScoringInfluenceLabel(scoringGenerationInfluence);
    const detail = scoringGenerationInfluence === "off"
      ? "diagnostic evidence weighting off; generation is no longer weighted by Scoring Diagnostics."
      : `${label} diagnostic evidence weighting affects generation weighting; legal filters and selected quotas still apply.`;
    setTrace((t) => [...t, `[TRACE] Scoring Diagnostics influence changed: ${detail}`]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoringGenerationInfluence]);
  const [numCandidates, setNumCandidatesState] = useState<number>(DEFAULT_GENERATED_CANDIDATE_COUNT);
  const [rwr45Enabled, setRwr45Enabled] = useState<boolean>(false);
  const lastWindowDefaultNumCandidatesRef = useRef<number>(DEFAULT_GENERATED_CANDIDATE_COUNT);
  const setNumCandidates = useCallback((nextCount: number) => {
    setNumCandidatesState(
      normalizeGeneratedCandidateCount(nextCount, lastWindowDefaultNumCandidatesRef.current),
    );
  }, []);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const generationStopRequestedRef = useRef(false);
  const [octagonalTop, setOctagonalTop] = useState<number>(defaultKnobs.octagonal_top);
  const [ogaSpokeCount, setOgaSpokeCount] = useState<number>(9);
  // Batch frequency debug
  const [batchSize, setBatchSize] = useState<number>(200);
  const [batchFreq, setBatchFreq] = useState<{ n: number; count: number }[]>([]);
  const [isBatching, setIsBatching] = useState<boolean>(false);
  const [batchSummary, setBatchSummary] = useState<string>("");
  const [batchSessionRuns, setBatchSessionRuns] = useState<number>(10);
  const [isBatchSessionRunning, setIsBatchSessionRunning] = useState<boolean>(false);
  const [batchSessionProgress, setBatchSessionProgress] = useState<number>(0);
  const [batchSessionTopSeries, setBatchSessionTopSeries] = useState<{ run: number; tops: { n: number; count: number }[] }[]>([]);
  const [batchSessionAggregate, setBatchSessionAggregate] = useState<{ n: number; count: number }[]>([]);
  // Panel-driven avg buckets — updated whenever MonthlyDrawsSummaryPanel's avgFrequencyCounts changes
  // (respects the panel's "Draws per month" setting).
  const [monthlyAvgBuckets, setMonthlyAvgBuckets] = useState<{ times: number; avg: number }[]>([]);
  const [monthlyBucketLabels, setMonthlyBucketLabels] = useState<Record<number, string>>({});
  const [monthlyConstraintPayload, setMonthlyConstraintPayload] = useState<MonthlyConstraintPayload | null>(null);
  const [monthlyConstructiveEnabled, setMonthlyConstructiveEnabled] = useState<boolean>(false);
  const [monthlyBucketSetsAlways, setMonthlyBucketSetsAlways] = useState<MonthlyBucketSets | null>(null);
  const [monthlyIdealDrawState, setMonthlyIdealDrawState] = useState<MonthlyIdealDrawState | null>(null);
  const [stageIdealDrawState, setStageIdealDrawState] = useState<StageIdealDrawState | null>(null);

  const handleMonthlyConstraintsChange = useCallback((payload: MonthlyConstraintPayload | null) => {
    setMonthlyConstraintPayload((previous) => (
      monthlyConstraintPayloadAppSignature(previous) === monthlyConstraintPayloadAppSignature(payload)
        ? previous
        : payload
    ));
  }, []);

  const handleMonthlyBucketInfoChange = useCallback((info: { labels: Record<number, string> }) => {
    setMonthlyBucketLabels((previous) => (
      monthlyBucketLabelsSignature(previous) === monthlyBucketLabelsSignature(info.labels)
        ? previous
        : info.labels
    ));
  }, []);

  const handleMonthlyBucketSetsChange = useCallback((sets: MonthlyBucketSets | null) => {
    setMonthlyBucketSetsAlways((previous) => (
      monthlyBucketSetsSignature(previous) === monthlyBucketSetsSignature(sets)
        ? previous
        : sets
    ));
  }, []);

  const handleMonthlyAvgBucketsChange = useCallback((rows: { times: number; avg: number }[]) => {
    setMonthlyAvgBuckets((previous) => (
      monthlyAvgBucketsSignature(previous) === monthlyAvgBucketsSignature(rows)
        ? previous
        : rows
    ));
  }, []);

  const handleMonthlyIdealDrawStateChange = useCallback((state: MonthlyIdealDrawState | null) => {
    setMonthlyIdealDrawState((previous) => (
      monthlyIdealDrawStateAppSignature(previous) === monthlyIdealDrawStateAppSignature(state)
        ? previous
        : state
    ));
  }, []);

  const handleStageIdealDrawStateChange = useCallback((state: StageIdealDrawState | null) => {
    setStageIdealDrawState((previous) => (
      stageIdealDrawStateAppSignature(previous) === stageIdealDrawStateAppSignature(state)
        ? previous
        : state
    ));
  }, []);

  // Readiness (Rdy) score weights — user-configurable in Candidate Generation Influences.
  // Defaults are deliberately neutral; users must opt in before Rdy weighting can influence diagnostics.
  const [rdyWeights, setRdyWeights] = useState<ReadinessWeights>(cloneDefaultRdyWeights);
  const [rdyWeightOffState, setRdyWeightOffState] = useState<RdyWeightOffState>(cloneDefaultRdyWeightOffState);
  const effectiveRdyWeights = useMemo<ReadinessWeights>(() => ({
    idm: rdyWeightOffState.idm ? 0 : rdyWeights.idm,
    conv: rdyWeightOffState.conv ? 0 : rdyWeights.conv,
    oga: rdyWeightOffState.oga ? 0 : rdyWeights.oga,
  }), [rdyWeightOffState, rdyWeights]);
  const effectiveRdyPercentages = useMemo(
    () => normalizeReadinessWeights(effectiveRdyWeights),
    [effectiveRdyWeights],
  );
  const [readinessHardFilters, setReadinessHardFilters] = useState<ReadinessHardFilterState>(cloneDefaultReadinessHardFilters);

  // Monthly Repeat Bias — boost numbers drawn exactly once in the current month
  const [mrbEnabled, setMrbEnabled] = useState<boolean>(false);
  const [mrbIncludeSupp, setMrbIncludeSupp] = useState<boolean>(true);
  const [mrbBucketBoosts, setMrbBucketBoosts] = useState<import("./lib/numberBiases").MRBBucketBoosts>({
    undrawn: 1, times1: 1, times2: 1, times3: 1, times4: 1, times5: 1, times6: 1, times7: 1, times8: 1,
  });
  const [monthEndCarryOverBiasEnabled, setMonthEndCarryOverBiasEnabled] = useState<boolean>(false);
  const [monthEndCarryOverStrength, setMonthEndCarryOverStrength] = useState<MonthEndCarryOverStrength>("normal");
  const [monthEndCarryOverIncludeMonthEndUndrawn, setMonthEndCarryOverIncludeMonthEndUndrawn] = useState<boolean>(true);
  const [monthEndCarryOverIncludeBoundaryRepeats, setMonthEndCarryOverIncludeBoundaryRepeats] = useState<boolean>(true);
  const [selectedCarryOverBoostNumbers, setSelectedCarryOverBoostNumbers] = useState<number[]>([]);
  const [selectedCarryOverBoostMode, setSelectedCarryOverBoostMode] = useState<SelectedCarryOverBoostMode>("strong");
  const monthEndCarryOverBiasTouchedRef = useRef(false);
  const scoringGenerationInfluenceTraceReadyRef = useRef(false);

  // Keep MiAN tied to the user's selected Acceptance needs only. When MiAN is
  // off, its hidden counts stay zero so stale bucket demands cannot reject all candidates later.
  useEffect(() => {
    if (!acceptanceNeedsEnabled) {
      setAcceptanceNeedsCounts((previous) => (
        monthlyFrequencyConstraintsSignature(previous) === monthlyFrequencyConstraintsSignature(zeroMonthlyFrequencyConstraints())
          ? previous
          : zeroMonthlyFrequencyConstraints()
      ));
      return;
    }
    if (monthlyConstructiveEnabled && monthlyConstraintPayload) {
      setAcceptanceNeedsCounts((previous) => (
        monthlyFrequencyConstraintsSignature(previous) === monthlyFrequencyConstraintsSignature(monthlyConstraintPayload.constraints)
          ? previous
          : monthlyConstraintPayload.constraints
      ));
    }
  }, [acceptanceNeedsEnabled, monthlyConstructiveEnabled, monthlyConstraintPayload]);

  /** Effective MiAN counts — disabled MiAN is always zero. When Monthly Draws Summary
   *  constructive counts are active, MiAN mirrors the selected Acceptance needs, not
   *  the full bucket sizes. */
  const effectiveMianCounts: MonthlyFrequencyConstraints = useMemo(() => (
    !acceptanceNeedsEnabled
      ? zeroMonthlyFrequencyConstraints()
      : (monthlyConstructiveEnabled && monthlyConstraintPayload)
        ? monthlyConstraintPayload.constraints
        : acceptanceNeedsCounts
  ), [acceptanceNeedsCounts, acceptanceNeedsEnabled, monthlyConstructiveEnabled, monthlyConstraintPayload]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dgaGrid, setDgaGrid] = useState<number[][]>([]);
  const [dgaDiamonds, setDgaDiamonds] = useState<any[]>([]);
  const [dgaPredictions, setDgaPredictions] = useState<number[]>([]);
  const [dgaDrawLabels, setDgaDrawLabels] = useState<string[]>([]);
  const [dgaWfmqyhStart, setDgaWfmqyhStart] = useState<number>(0);

  // Compute current-month bucket sets directly from history so colour coding on the
  // Simulate Next strip is always available — even when Monthly Draws Summary panel
  // has never been opened (it mounts lazily inside a collapsed section).
  const dgaLiveMonthlyBuckets = useMemo((): MonthlyBucketSets => {
    const empty: MonthlyBucketSets = {
      undrawn: new Set<number>(), times1: new Set<number>(), times2: new Set<number>(),
      times3: new Set<number>(), times4: new Set<number>(), times5: new Set<number>(),
      times6: new Set<number>(), times7: new Set<number>(), times8: new Set<number>(),
    };
    if (!realHistory.length) return empty;
    const currentMonthKey = planningDrawContext.targetMonthLabel;
    const counts = new Array<number>(45).fill(0);
    realHistory.forEach((draw) => {
      const t = Date.parse(draw.date || "");
      if (Number.isNaN(t)) return;
      const dt = new Date(t);
      const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      if (k !== currentMonthKey) return;
      [...draw.main, ...draw.supp].forEach((n) => { if (n >= 1 && n <= 45) counts[n - 1] += 1; });
    });
    const sets = { ...empty } as MonthlyBucketSets;
    // Numbers not drawn this month → undrawn bucket
    for (let i = 0; i < 45; i++) {
      const n = i + 1;
      const c = counts[i];
      if (c === 0) sets.undrawn.add(n);
      else if (c === 1) sets.times1.add(n);
      else if (c === 2) sets.times2.add(n);
      else if (c === 3) sets.times3.add(n);
      else if (c === 4) sets.times4.add(n);
      else if (c === 5) sets.times5.add(n);
      else if (c === 6) sets.times6.add(n);
      else if (c === 7) sets.times7.add(n);
      else sets.times8.add(n);
    }
    return sets;
  }, [planningDrawContext.targetMonthLabel, realHistory]);

  const dgaPlanningMonthLabel = planningDrawContext.targetMonthLabel;

  const dgaEffectiveMonthlyBuckets = useMemo(
    () => monthlyBucketSetsAlways ?? monthlyConstraintPayload?.buckets ?? dgaLiveMonthlyBuckets,
    [dgaLiveMonthlyBuckets, monthlyBucketSetsAlways, monthlyConstraintPayload],
  );

  const [numberCounts, setNumberCounts] = useState<number[]>([]);
  const [minCount, setMinCount] = useState<number>(0);
  const [maxCount, setMaxCount] = useState<number>(0);
  const [focusedDgaCol, setFocusedDgaCol] = useState<number | null>(null);
  const [dgaHoveredNumber, setDgaHoveredNumber] = useState<number | null>(null);
  const [engineRankingExpanded, setEngineRankingExpanded] = useState<boolean>(true);
  const [shapeBucketQuotasExpanded, setShapeBucketQuotasExpanded] = useState<boolean>(false);
  const [recencyLatestDrawExpanded, setRecencyLatestDrawExpanded] = useState<boolean>(false);
  const [hardFiltersExpanded, setHardFiltersExpanded] = useState<boolean>(false);
  const [minRecentMatches, setMinRecentMatches] = useState<number>(0);
  const [maxLastDrawMatchesEnabled, setMaxLastDrawMatchesEnabled] = useState<boolean>(false);
  const [maxLastDrawMatchesValue, setMaxLastDrawMatchesValue] = useState<number>(3);
  const [previousNeighbourConstraintNumbers, setPreviousNeighbourConstraintNumbers] = useState<number[]>([]);
  const [latestNeighbourSupportEnabled, setLatestNeighbourSupportEnabled] = useState<boolean>(false);
  const [strictDroughtQuotaMode, setStrictDroughtQuotaMode] = useState<StrictDroughtQuotaControlMode>("off");
  const [strictDroughtQuotaManualMin, setStrictDroughtQuotaManualMin] = useState<number>(1);
  const [recentMatchBias, setRecentMatchBias] = useState<number>(0);
  const [highlightMsg, setHighlightMsg] = useState<string>("");
  const [highlights, setHighlights] = useState<any[]>([]);
  const [dgaHeatmapExpanded, setDgaHeatmapExpanded] = useState<boolean>(true);
  const [dgaSectionOpen, setDgaSectionOpen] = useState<boolean>(true);
  const dgaWorkflowBodyId = "workflow-dga-body";
  const [dgaGridExpanded, setDgaGridExpanded] = useState<boolean>(true);

  const [excludedNumbers, setExcludedNumbers] = useState<number[]>([]);
  const [hotColdForcedNumbers, setHotColdForcedNumbers] = useState<number[]>([]);
  const [hotColdExcludedNumbers, setHotColdExcludedNumbers] = useState<number[]>([]);
  const [droughtBreakSelectedNumbers, setDroughtBreakSelectedNumbers] = useState<number[]>([]);
  const [pasteWeightedForcedNumbers, setPasteWeightedForcedNumbers] = useState<number[]>([]);
  const [userSelectedNumbers, setUserSelectedNumbers] = useState<number[]>([]);
  const [autoExcludeUnselected, setAutoExcludeUnselected] = useState<boolean>(false);
  const normalizedUserSelectedNumbersForGeneration = useMemo(
    () => normalizeUserExclusionLocks(userSelectedNumbers),
    [userSelectedNumbers],
  );
  const autoExcludedFromSelection = useMemo(() => {
    if (!autoExcludeUnselected) return [] as number[];
    const picked = new Set(normalizedUserSelectedNumbersForGeneration);
    return Array.from({ length: 45 }, (_, i) => i + 1).filter((n) => !picked.has(n));
  }, [autoExcludeUnselected, normalizedUserSelectedNumbersForGeneration]);
  const effectiveExcludedNumbers = useMemo(
    () => normalizeUserExclusionLocks([...excludedNumbers, ...hotColdExcludedNumbers, ...autoExcludedFromSelection]),
    [excludedNumbers, hotColdExcludedNumbers, autoExcludedFromSelection]
  );
  const userExclusionLocks = useMemo(() => normalizeUserExclusionLocks(excludedNumbers), [excludedNumbers]);
  const manualExcludedSet = useMemo(() => new Set(userExclusionLocks), [userExclusionLocks]);
  const userExclusionReminder = useMemo(
    () => formatUserExclusionReminder(userExclusionLocks),
    [userExclusionLocks],
  );
  const [ratioOptions, setRatioOptions] = useState<{ ratio: string; count: number; percent: number }[]>([]);
  const [selectedRatios, setSelectedRatios] = useState<string[]>([]);
  const [useTrickyRule, setUseTrickyRule] = useState<boolean>(false);
  const [trendLookback, setTrendLookback] = useState<number>(4);
  const [trendThreshold, setTrendThreshold] = useState<number>(0.02);
  const [allowedTrendRatios, setAllowedTrendRatios] = useState<string[]>([]);
  const [trendSelectedNumbers, setTrendSelectedNumbers] = useState<number[]>([]);
  const [focusNumber, setFocusNumber] = useState<number | null>(null);
  const [showHeatmapLetters, setShowHeatmapLetters] = useState(false);
  const [showMbsHoverSparkline, setShowMbsHoverSparkline] = useState(true);
  const [tempMetric, setTempMetric] = useState<"ema" | "recency" | "hybrid">("hybrid");
  const [dgaHeatmapView, setDgaHeatmapView] = useState<DgaHeatmapViewMode>("temperature");
  const [dgaMonthlyBucketStateOpacity, setDgaMonthlyBucketStateOpacity] = useState<number>(1);
  const [repeatWindowSizeW, setRepeatWindowSizeW] = useState<number>(12);
  const [minFromRecentUnionM, setMinFromRecentUnionM] = useState<number>(0);
  const [presets, setPresets] = useState<AppPreset[]>(() => listPresets());
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [newPresetName, setNewPresetName] = useState<string>("");
  const [favoritePanelIds, setFavoritePanelIds] = useState<string[]>(() => loadFavoritePanelIds());
  const [includePanelFavoritesInPreset, setIncludePanelFavoritesInPreset] = useState<boolean>(true);
  const [zpaReloadKey, setZpaReloadKey] = useState<number>(0);
  const [selectedWindowPatterns, setSelectedWindowPatterns] = useState<WindowPattern[]>([]);
  const [patternConstraintMode, setPatternConstraintModeode] = useState<'boost' | 'restrict'>('boost');
  const [patternBoostFactor, setPatternBoostFactor] = useState<number>(0.15);
  const [patternSumTolerance, setPatternSumTolerance] = useState<number>(0);
  const toggleTrendRatio = useCallback((tag: string) => {
    setAllowedTrendRatios((current) => (
      current.includes(tag)
        ? current.filter((value) => value !== tag)
        : [...current, tag]
    ));
  }, []);

  // NEW: OGA bias UI state
  const [enableOGAForecastBias, setEnableOGAForecastBias] = useState<boolean>(false);
  const [ogaBaselineMode, setOGABaselineMode] = useState<"window" | "all">("window");
  const [ogaPreferredBand, setOGAPreferredBand] = useState<"auto" | "low" | "mid" | "high">("auto");
  const [ogaPreferredDeciles, setOGAPreferredDeciles] = useState<{ index: number; weight: number }[]>([]);

  const { zoneGamma, setZoneGamma } = useZPASettings();

  useEffect(() => {
    saveFavoritePanelIds(favoritePanelIds);
  }, [favoritePanelIds]);

  const toggleFavoritePanel = useCallback((panelId: string) => {
    setFavoritePanelIds((current) => {
      const normalized = normalizeFavoritePanelIds(current);
      return normalized.includes(panelId)
        ? normalized.filter((id) => id !== panelId)
        : normalizeFavoritePanelIds([...normalized, panelId]);
    });
  }, []);

  // ──── Auto-save / auto-restore settings ────
  // Restore saved settings on mount (before first render with defaults)
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    try {
      const raw = localStorage.getItem("app:autosave:v1");
      if (!raw) return;
      const snapshot = JSON.parse(raw) as AppPresetSnapshot;
      // Defer apply so all state initializers finish first
      setTimeout(() => applySnapshot(snapshot), 0);
    } catch {
      // Silently ignore corrupt autosave
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save dirty flag ref (used by the interval below)

  const [survivalOut, setSurvivalOut] = useState<{ number: number; baseProb?: number; biasedProb?: number }[] | undefined>(undefined);
  const [churnOut, setChurnOut] = useState<{ number: number; pChurn: number }[] | undefined>(undefined);
  const [returnOut, setReturnOut] = useState<{ number: number; pReturn: number }[] | undefined>(undefined);
  const [insightsEnabled, setInsightsEnabled] = useState<boolean>(false); // default OFF
  // OGA band state for panel (optional)
  const [activeOGABand, setActiveOGABand] = useState<{ lower: number; upper: number } | null>(null);

  // Once-per-toggle trace for Selection Insights
  useEffect(() => {
    setTraceMaybe(t => [...t, insightsEnabled ? "[TRACE] Selection Insights: ON" : "[TRACE] Selection Insights: OFF"]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insightsEnabled]);

  // ──── Debounced auto-save: persist settings to localStorage ────
  // Uses an interval that checks a dirty flag. Any state change marks dirty,
  // and the next interval tick saves the snapshot.
  const autoSaveDirtyRef = useRef(false);
  // Mark dirty on every render (cheap – just a ref assignment)
  autoSaveDirtyRef.current = true;
  useEffect(() => {
    const id = setInterval(() => {
      if (!autoSaveDirtyRef.current) return;
      autoSaveDirtyRef.current = false;
      try {
        const snapshot = buildSnapshot();
        localStorage.setItem("app:autosave:v1", JSON.stringify(snapshot));
      } catch {
        // Silently ignore quota errors
      }
    }, 2000); // check every 2 seconds
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitHistory = useCallback((nextHistory: Draw[]) => {
    setHistory(nextHistory);
    setStartupHistoryChoice(null);
    setHighlights([]);
    if (nextHistory.some((draw) => !draw.isSimulated)) {
      saveCachedDrawHistory(rowsFromDraws(nextHistory));
    } else {
      clearCachedDrawHistory();
    }
  }, [setHighlights]);

  useEffect(() => {
    const cachedRows = loadCachedDrawHistory();
    const cachedHistory = cachedRows && cachedRows.length > 0 ? drawsFromRows(cachedRows) : null;
    const bundledHistory = loadCsvFallbackDraws(strictValidateDraws);
    const choice = chooseInitialDrawHistory(cachedHistory, bundledHistory);

    if (choice.history.length > 0) {
      commitHistory(choice.history);
      setTraceMaybe((t) => [...t,
        choice.source === "cache"
          ? `[TRACE] Loaded ${choice.history.length} draws from saved local draw history state. ${choice.reason}`
          : `[TRACE] Loaded ${choice.history.length} draws from default bundled CSV (src/windfall_history_lottolyzer.csv). ${choice.reason}`
      ]);
      return;
    }

    setHistory([]);
    setHighlights([]);
    setStartupHistoryChoice(choice);
    setTraceMaybe((t) => [...t, `[TRACE] No startup draw history loaded. ${choice.reason}`]);
  }, [commitHistory]);

  useEffect(() => {
    if (history.length > 0) setCustomDrawCount(history.length);
  }, [history]);

  function getActiveWindowSize() {
    if (!windowEnabled) return history.length;
    if (windowMode === "Custom") return customDrawCount;
    const windowOption = WINDOW_OPTIONS.find((opt) => opt.key === windowMode);
    if (!windowOption || windowOption.size === null) return history.length;
    return Math.min(windowOption.size, history.length);
  }

  const filteredHistory = useMemo<Draw[]>(() => {
    if (!history.length) return [];
    if (drawWindowMode === "lastN") {
      const n = getActiveWindowSize();
      return history.slice(-n);
    } else {
      const fromIdx = Math.max(1, Math.min(rangeFrom, history.length));
      const toIdx = Math.max(fromIdx, Math.min(rangeTo, history.length));
      return history.slice(fromIdx - 1, toIdx);
    }
  }, [history, drawWindowMode, rangeFrom, rangeTo, windowEnabled, windowMode, customDrawCount]);

  const customWindowDateRangeLabel = useMemo(
    () => formatWfmqyhDateRange(filteredHistory),
    [filteredHistory],
  );

  const realFilteredHistoryResult = useMemo(
    () => filterRealDrawHistory(filteredHistory, "active-window evidence panels and generation weights"),
    [filteredHistory],
  );
  const realFilteredHistory = realFilteredHistoryResult.history;
  const scoringGenerationProfile = useMemo(
    () => buildScoringGenerationProfile(realHistory, realFilteredHistory, {
      scope: "mains-plus-supps",
      influence: scoringGenerationInfluence,
    }),
    [realHistory, realFilteredHistory, scoringGenerationInfluence],
  );
  const activeScoringGenerationProfile = scoringGenerationProfile.enabled ? scoringGenerationProfile : undefined;
  const d1TerminalMomentumGenerationAnalysis = useMemo(() => {
    if (!realHistory.length || planningDrawContext.completedDrawsInTargetMonth <= 0) return null;
    const targetMonthOption = buildEndingDigitMonthOptions(realHistory, { includeSupp: true })
      .find((option) => option.monthKey === planningDrawContext.targetMonthLabel);
    if (!targetMonthOption) return null;
    return analyzeD1TerminalMomentum(realHistory, {
      includeSupp: true,
      monthKey: targetMonthOption.monthKey,
      drawCount: planningDrawContext.completedDrawsInTargetMonth,
      expectedDrawCount: planningDrawContext.targetMonthExpectedDrawCount,
    });
  }, [
    planningDrawContext.completedDrawsInTargetMonth,
    planningDrawContext.targetMonthExpectedDrawCount,
    planningDrawContext.targetMonthLabel,
    realHistory,
  ]);
  const d1TerminalMomentumGenerationProfile = useMemo(
    () => buildD1TerminalMomentumGenerationProfile(
      d1TerminalMomentumGenerationAnalysis,
      d1TerminalMomentumSgiEnabled,
    ),
    [d1TerminalMomentumGenerationAnalysis, d1TerminalMomentumSgiEnabled],
  );
  const dgaScoringNumberDiagnostics = useMemo<Record<number, DGAScoringNumberDiagnostic>>(() => {
    const rankedRows = Array.from({ length: 45 }, (_, index) => {
      const number = index + 1;
      return {
        number,
        score: scoringGenerationProfile.numberScores[number] ?? 0,
      };
    }).sort((left, right) => right.score - left.score || left.number - right.number);

    return rankedRows.reduce<Record<number, DGAScoringNumberDiagnostic>>((next, row, index) => {
      next[row.number] = { rank: index + 1, score: row.score };
      return next;
    }, {});
  }, [scoringGenerationProfile.numberScores]);

  const drawHistoryProvenance = useMemo(
    () => summarizeDrawHistoryProvenance(history),
    [history],
  );

  const activeWindowProvenance = useMemo(
    () => summarizeDrawHistoryProvenance(filteredHistory),
    [filteredHistory],
  );

  const previousNeighbourLatestDraw = useMemo(
    () => getMostRecentDraw(realFilteredHistory),
    [realFilteredHistory],
  );

  const previousNeighbourConstraintRows = useMemo(
    () => buildPreviousNeighbourConstraintRows(previousNeighbourLatestDraw, "mains-plus-supps"),
    [previousNeighbourLatestDraw],
  );

  const previousNeighbourConstraintTargetNumbers = useMemo(
    () => normalizePreviousNeighbourConstraintNumbers(previousNeighbourConstraintRows.flatMap((row) => row.targets)),
    [previousNeighbourConstraintRows],
  );

  useEffect(() => {
    setPreviousNeighbourConstraintNumbers((current) => {
      const targetSet = new Set(previousNeighbourConstraintTargetNumbers);
      const next = current.filter((number) => targetSet.has(number));
      return next.length === current.length ? current : next;
    });
  }, [previousNeighbourConstraintTargetNumbers]);

  const generationForcedNumbers = useMemo(() => {
    const seen = new Set<number>();
    const excluded = new Set(effectiveExcludedNumbers);
    const output: number[] = [];
    for (const number of [
      ...trendSelectedNumbers,
      ...previousNeighbourConstraintNumbers,
      ...hotColdForcedNumbers,
      ...droughtBreakSelectedNumbers,
      ...pasteWeightedForcedNumbers,
    ]) {
      if (!Number.isInteger(number) || number < 1 || number > 45 || seen.has(number) || excluded.has(number)) continue;
      seen.add(number);
      output.push(number);
    }
    return output;
  }, [
    droughtBreakSelectedNumbers,
    effectiveExcludedNumbers,
    hotColdForcedNumbers,
    pasteWeightedForcedNumbers,
    previousNeighbourConstraintNumbers,
    trendSelectedNumbers,
  ]);

  const sortedGenerationForcedNumbers = useMemo(
    () => generationForcedNumbers.slice().sort((left, right) => left - right),
    [generationForcedNumbers],
  );

  const previousNeighbourConstraintNumberSet = useMemo(
    () => new Set(previousNeighbourConstraintNumbers),
    [previousNeighbourConstraintNumbers],
  );

  const numberTrendExternalSelectedNumbers = useMemo(
    () => normalizeHotColdGenerationNumbers([
      ...droughtBreakSelectedNumbers,
      ...pasteWeightedForcedNumbers,
    ]),
    [droughtBreakSelectedNumbers, pasteWeightedForcedNumbers],
  );

  const generationForcedOverflow = generationForcedNumbers.length > 8;

  const togglePreviousNeighbourTarget = useCallback((target: number) => {
    if (manualExcludedSet.has(target)) return;
    setPreviousNeighbourConstraintNumbers((current) => togglePreviousNeighbourConstraintTarget(current, target));
  }, [manualExcludedSet]);

  const toggleHotColdForcedNumber = useCallback((number: number) => {
    if (manualExcludedSet.has(number)) return;
    const next = toggleHotColdIncludeSelection({
      forcedNumbers: hotColdForcedNumbers,
      excludedNumbers: hotColdExcludedNumbers,
    }, number);
    setHotColdForcedNumbers(next.forcedNumbers);
    setHotColdExcludedNumbers(next.excludedNumbers);
    if (next.forcedNumbers.includes(number)) {
      setExcludedNumbers((current) => current.filter((value) => value !== number));
    }
  }, [hotColdExcludedNumbers, hotColdForcedNumbers, manualExcludedSet]);

  const toggleHotColdExcludedNumber = useCallback((number: number) => {
    const next = toggleHotColdExcludeSelection({
      forcedNumbers: hotColdForcedNumbers,
      excludedNumbers: hotColdExcludedNumbers,
    }, number);
    setHotColdForcedNumbers(next.forcedNumbers);
    setHotColdExcludedNumbers(next.excludedNumbers);
  }, [hotColdExcludedNumbers, hotColdForcedNumbers]);

  const toggleDroughtBreakSelectedNumber = useCallback((number: number) => {
    if (!Number.isInteger(number) || number < 1 || number > 45) return;
    if (manualExcludedSet.has(number)) return;
    const normalizedCurrent = normalizeHotColdGenerationNumbers(droughtBreakSelectedNumbers);
    const alreadySelected = normalizedCurrent.includes(number);
    if (alreadySelected) {
      setDroughtBreakSelectedNumbers(normalizedCurrent.filter((value) => value !== number));
      return;
    }
    if (normalizedCurrent.length >= MAX_DROUGHT_BREAK_FORCED_NUMBERS) return;
    setDroughtBreakSelectedNumbers(normalizeHotColdGenerationNumbers([...normalizedCurrent, number]));
    setExcludedNumbers((current) => current.filter((value) => value !== number));
  }, [droughtBreakSelectedNumbers, manualExcludedSet]);

  const togglePasteWeightedForcedNumber = useCallback((number: number) => {
    if (!Number.isInteger(number) || number < 1 || number > 45) return;
    if (manualExcludedSet.has(number)) return;
    setPasteWeightedForcedNumbers((current) => {
      const normalized = normalizeHotColdGenerationNumbers(current);
      return normalized.includes(number)
        ? normalized.filter((value) => value !== number)
        : normalizeHotColdGenerationNumbers([...normalized, number]);
    });
  }, [manualExcludedSet]);

  const wfmqyhMainNumberCounts = useMemo(
    () => buildWfmqyhNumberCounts(realFilteredHistory),
    [realFilteredHistory],
  );

  const generationConstraintBucketSummaries = useMemo(() => {
    return (Object.keys(generationConstraintNumberBuckets) as GenerationConstraintBucketKey[]).reduce<Record<GenerationConstraintBucketKey, {
      numberCounts: { number: number; count: number }[];
      drawResultCounts: { hits: number; count: number }[];
    }>>((acc, bucketKey) => {
      const bucketNumbers = generationConstraintNumberBuckets[bucketKey];
      const bucketSet = new Set<number>(bucketNumbers);
      const drawHitCounts = new Map<number, number>();

      realFilteredHistory.forEach((draw) => {
        const hits = draw.main.filter((n) => bucketSet.has(n)).length;
        drawHitCounts.set(hits, (drawHitCounts.get(hits) ?? 0) + 1);
      });

      acc[bucketKey] = {
        numberCounts: bucketNumbers.map((number) => ({ number, count: wfmqyhMainNumberCounts.get(number) ?? 0 })),
        drawResultCounts: Array.from({ length: Math.min(bucketNumbers.length, 6) + 1 }, (_, hits) => ({
          hits,
          count: drawHitCounts.get(hits) ?? 0,
        })),
      };

      return acc;
    }, {} as Record<GenerationConstraintBucketKey, {
      numberCounts: { number: number; count: number }[];
      drawResultCounts: { hits: number; count: number }[];
    }>);
  }, [realFilteredHistory, wfmqyhMainNumberCounts]);

  const generationConstraintDecadeSummaries = useMemo(() => {
    return (Object.keys(generationConstraintDecadeBuckets) as GenerationConstraintDecadeKey[]).reduce<Record<GenerationConstraintDecadeKey, {
      numberCounts: { number: number; count: number }[];
      drawResultCounts: { hits: number; count: number }[];
    }>>((acc, bucketKey) => {
      const bucketNumbers = generationConstraintDecadeBuckets[bucketKey];
      const bucketSet = new Set<number>(bucketNumbers);
      const drawHitCounts = new Map<number, number>();

      realFilteredHistory.forEach((draw) => {
        const hits = draw.main.filter((n) => bucketSet.has(n)).length;
        drawHitCounts.set(hits, (drawHitCounts.get(hits) ?? 0) + 1);
      });

      acc[bucketKey] = {
        numberCounts: bucketNumbers.map((number) => ({ number, count: wfmqyhMainNumberCounts.get(number) ?? 0 })),
        drawResultCounts: Array.from({ length: Math.min(bucketNumbers.length, 6) + 1 }, (_, hits) => ({
          hits,
          count: drawHitCounts.get(hits) ?? 0,
        })),
      };

      return acc;
    }, {} as Record<GenerationConstraintDecadeKey, {
      numberCounts: { number: number; count: number }[];
      drawResultCounts: { hits: number; count: number }[];
    }>);
  }, [realFilteredHistory, wfmqyhMainNumberCounts]);

  const mainConstraintAutoExclusions = useMemo(() => {
    return deriveMainConstraintExclusions(
      exactConstraintRows.map(({ bucketKey, enabled, count, singleDigitBoost, twoDigitBoost }) => ({
        bucketKey,
        enabled,
        count,
        singleDigitBoost,
        twoDigitBoost,
      })),
      generationConstraintNumberBuckets,
      8
    );
  }, [exactConstraintRows]);

  const generationExcludedNumbers = useMemo(
    () => Array.from(new Set([...effectiveExcludedNumbers, ...mainConstraintAutoExclusions.excludedNumbers])).sort((a, b) => a - b),
    [effectiveExcludedNumbers, mainConstraintAutoExclusions.excludedNumbers]
  );
  const autoSelectionExcludedSet = useMemo(() => new Set(autoExcludedFromSelection), [autoExcludedFromSelection]);
  const bucketAutoExcludedSet = useMemo(
    () => new Set(mainConstraintAutoExclusions.excludedNumbers),
    [mainConstraintAutoExclusions.excludedNumbers]
  );

  const pruneManualExcludedNumbers = useCallback((current: number[], limit?: number): number[] => {
    const pruned = removeUserExcludedNumbers(current, excludedNumbers);
    const next = typeof limit === "number" ? pruned.slice(0, limit) : pruned;
    return keepExistingNumberListWhenEqual(current, next);
  }, [excludedNumbers]);

  useEffect(() => {
    setTrendSelectedNumbers((current) => pruneManualExcludedNumbers(current));
    setPreviousNeighbourConstraintNumbers((current) => pruneManualExcludedNumbers(current));
    setHotColdForcedNumbers((current) => pruneManualExcludedNumbers(current));
    setDroughtBreakSelectedNumbers((current) => pruneManualExcludedNumbers(current, MAX_DROUGHT_BREAK_FORCED_NUMBERS));
    setPasteWeightedForcedNumbers((current) => pruneManualExcludedNumbers(current));
    setUserSelectedNumbers((current) => pruneManualExcludedNumbers(current));
    setManualSimSelected((current) => keepExistingNumberListWhenEqual(
      current,
      normalizeManualPrizeCheckNumbers(current, excludedNumbers),
    ));
    setSelectedCarryOverBoostNumbers((current) => pruneManualExcludedNumbers(current));
  }, [excludedNumbers, pruneManualExcludedNumbers]);

  const mainConstraintAutoExcludedLabel = useMemo(() => {
    if (!mainConstraintAutoExclusions.shouldApply) return "";
    const bucketLabelMap = new Map(exactConstraintRows.map(({ bucketKey, label }) => [bucketKey, label]));
    return mainConstraintAutoExclusions.excludedBucketKeys
      .map((bucketKey) => bucketLabelMap.get(bucketKey) ?? bucketKey)
      .join("; ");
  }, [exactConstraintRows, mainConstraintAutoExclusions]);

  const activeMainDigitBoostSummary = useMemo(() => {
    return exactConstraintRows
      .flatMap(({ bucketKey, singleDigitBoost, twoDigitBoost }) => {
        const bucketLabel = `bucket ${bucketKey.replace("main", "")}`;
        const parts: string[] = [];
        if (singleDigitBoost > 0) parts.push(`single-digit +${singleDigitBoost}`);
        if (twoDigitBoost > 0) parts.push(`two-digit +${twoDigitBoost}`);
        return parts.length > 0 ? [`${bucketLabel} (${parts.join(", ")})`] : [];
      })
      .join(", ");
  }, [exactConstraintRows]);

  const activeMainDecadeBiasSummary = useMemo(() => {
    return mainDecadeConstraintRows
      .filter(({ bias }) => bias !== 0)
      .map(({ bucketKey, bias }) => `${bucketKey.replace("decade", "")}:${bias > 0 ? `+${bias}` : bias}`)
      .join(", ");
  }, [mainDecadeConstraintRows]);

  const digitWidthConstraintTargets = useMemo(() => deriveDigitWidthTargets({
    enabled: digitWidthConstraintEnabled,
    singleDigitPercent: digitWidthSingleDigitPercent,
    scope: digitWidthConstraintScope,
  }), [digitWidthConstraintEnabled, digitWidthSingleDigitPercent, digitWidthConstraintScope]);

  const mainDigitGenerationOptions = useMemo(() => ({
    main0: { maxCount: mainZeroSetEnabled ? maxMainZeroSetCount : undefined, singleDigitBoost: mainBucketBoosts.main0.singleDigit, twoDigitBoost: mainBucketBoosts.main0.twoDigit },
    main1: { maxCount: mainOneSetEnabled ? maxMainOneSetCount : undefined, singleDigitBoost: mainBucketBoosts.main1.singleDigit, twoDigitBoost: mainBucketBoosts.main1.twoDigit },
    main2: { maxCount: mainTwoSetEnabled ? maxMainTwoSetCount : undefined, singleDigitBoost: mainBucketBoosts.main2.singleDigit, twoDigitBoost: mainBucketBoosts.main2.twoDigit },
    main3: { maxCount: mainThreeSetEnabled ? maxMainThreeSetCount : undefined, singleDigitBoost: mainBucketBoosts.main3.singleDigit, twoDigitBoost: mainBucketBoosts.main3.twoDigit },
    main4: { maxCount: mainFourSetEnabled ? maxMainFourSetCount : undefined, singleDigitBoost: mainBucketBoosts.main4.singleDigit, twoDigitBoost: mainBucketBoosts.main4.twoDigit },
    main5: { maxCount: mainFiveSetEnabled ? maxMainFiveSetCount : undefined, singleDigitBoost: mainBucketBoosts.main5.singleDigit, twoDigitBoost: mainBucketBoosts.main5.twoDigit },
    main6: { maxCount: mainSixSetEnabled ? maxMainSixSetCount : undefined, singleDigitBoost: mainBucketBoosts.main6.singleDigit, twoDigitBoost: mainBucketBoosts.main6.twoDigit },
    main7: { maxCount: mainSevenSetEnabled ? maxMainSevenSetCount : undefined, singleDigitBoost: mainBucketBoosts.main7.singleDigit, twoDigitBoost: mainBucketBoosts.main7.twoDigit },
    main8: { maxCount: mainEightSetEnabled ? maxMainEightSetCount : undefined, singleDigitBoost: mainBucketBoosts.main8.singleDigit, twoDigitBoost: mainBucketBoosts.main8.twoDigit },
    main9: { maxCount: mainNineSetEnabled ? maxMainNineSetCount : undefined, singleDigitBoost: mainBucketBoosts.main9.singleDigit, twoDigitBoost: mainBucketBoosts.main9.twoDigit },
  }), [
    mainZeroSetEnabled,
    maxMainZeroSetCount,
    mainOneSetEnabled,
    maxMainOneSetCount,
    mainTwoSetEnabled,
    maxMainTwoSetCount,
    mainThreeSetEnabled,
    maxMainThreeSetCount,
    mainFourSetEnabled,
    maxMainFourSetCount,
    mainFiveSetEnabled,
    maxMainFiveSetCount,
    mainSixSetEnabled,
    maxMainSixSetCount,
    mainSevenSetEnabled,
    maxMainSevenSetCount,
    mainEightSetEnabled,
    maxMainEightSetCount,
    mainNineSetEnabled,
    maxMainNineSetCount,
    mainBucketBoosts,
  ]);

  const mainDecadeGenerationBiases = useMemo(() => ({ ...mainDecadeBiases }), [mainDecadeBiases]);

  const activeWindowSize = realFilteredHistory.length;
  const latestObservedMonthDrawCount = useMemo(
    () => getLatestObservedMonthDrawCount(realHistory),
    [realHistory],
  );
  const repeatWindowDefaultFromLatestMonth = latestObservedMonthDrawCount
    ? Math.min(latestObservedMonthDrawCount.drawCount, activeWindowSize || latestObservedMonthDrawCount.drawCount)
    : activeWindowSize;
  const effectiveRepeatWindowSizeW = Math.min(Math.max(0, repeatWindowSizeW), activeWindowSize);
  const repeatUnionNumbers = useMemo(() => {
    const union = new Set<number>();
    if (effectiveRepeatWindowSizeW <= 0) return union;
    realFilteredHistory.slice(realFilteredHistory.length - effectiveRepeatWindowSizeW).forEach((draw) => {
      [...draw.main, ...draw.supp].forEach((number) => union.add(number));
    });
    return union;
  }, [effectiveRepeatWindowSizeW, realFilteredHistory]);
  const repeatUnionUniqueCount = repeatUnionNumbers.size;
  const activeRepeatMonthlyConstraints = useMemo(() => (
    maxMonthlyFrequencyConstraints(
      monthlyConstraintPayload?.constraints,
      acceptanceNeedsEnabled ? effectiveMianCounts : null,
    )
  ), [acceptanceNeedsEnabled, effectiveMianCounts, monthlyConstraintPayload]);
  const activeRepeatMonthlyBuckets = monthlyConstraintPayload?.buckets ?? monthlyBucketSetsAlways ?? null;
  const repeatUnionMonthlyFeasibility = useMemo(() => {
    if (repeatUnionNumbers.size === 0 || !activeRepeatMonthlyBuckets) return null;
    const activeRequirements = MONTHLY_FREQUENCY_KEYS
      .map((key) => ({ key, required: Math.max(0, Math.trunc(activeRepeatMonthlyConstraints[key] ?? 0)) }))
      .filter((entry) => entry.required > 0);
    if (activeRequirements.length === 0) return null;

    let requiredOutsideRepeat = 0;
    let totalRequired = 0;
    const shortageDetails: string[] = [];
    const impossibleDetails: string[] = [];

    for (const { key, required } of activeRequirements) {
      totalRequired += required;
      const bucket = activeRepeatMonthlyBuckets[key];
      const inRepeatPool = Array.from(bucket).filter((number) => repeatUnionNumbers.has(number)).length;
      const shortage = Math.max(0, required - inRepeatPool);
      if (shortage > 0) {
        requiredOutsideRepeat += shortage;
        shortageDetails.push(`${MONTHLY_FREQUENCY_SHORT_LABELS[key]} needs ${required}, repeat-pool has ${inRepeatPool}`);
      }
      if (bucket.size < required) {
        impossibleDetails.push(`${MONTHLY_FREQUENCY_SHORT_LABELS[key]} needs ${required}, bucket has ${bucket.size}`);
      }
    }

    return {
      maxFeasibleHits: Math.max(0, Math.min(8, 8 - requiredOutsideRepeat)),
      requiredOutsideRepeat,
      totalRequired,
      shortageDetails,
      impossibleDetails,
    };
  }, [activeRepeatMonthlyBuckets, activeRepeatMonthlyConstraints, repeatUnionNumbers]);
  const repeatUnionRawCandidateMax = Math.min(8, repeatUnionUniqueCount);
  const repeatUnionCandidateMax = Math.min(
    repeatUnionRawCandidateMax,
    repeatUnionMonthlyFeasibility?.maxFeasibleHits ?? repeatUnionRawCandidateMax,
  );
  const repeatUnionEnabled = repeatWindowSizeW > 0 && minFromRecentUnionM > 0 && activeWindowSize > 0;
  const repeatUnionSummary = repeatUnionEnabled
    ? `W ${repeatWindowSizeW}${effectiveRepeatWindowSizeW !== repeatWindowSizeW ? ` (${effectiveRepeatWindowSizeW} effective)` : ""} · M ${minFromRecentUnionM}`
    : `off (W ${repeatWindowSizeW} · M ${minFromRecentUnionM})`;
  const repeatUnionMonthlyCompatibilityTrace = repeatUnionEnabled && repeatUnionMonthlyFeasibility
    ? [
      `Repeat + monthly bucket compatibility: M=${minFromRecentUnionM}, feasible repeat-pool max=${repeatUnionMonthlyFeasibility.maxFeasibleHits}`,
      repeatUnionMonthlyFeasibility.requiredOutsideRepeat > 0
        ? `because at least ${repeatUnionMonthlyFeasibility.requiredOutsideRepeat} required bucket number${repeatUnionMonthlyFeasibility.requiredOutsideRepeat === 1 ? "" : "s"} must come from outside the newest-draw pool (${repeatUnionMonthlyFeasibility.shortageDetails.join("; ")})`
        : "all active bucket minimums can be satisfied inside the repeat pool",
      repeatUnionMonthlyFeasibility.totalRequired > 8
        ? `total active bucket minimums sum to ${repeatUnionMonthlyFeasibility.totalRequired}, above the 8-number candidate size`
        : null,
      repeatUnionMonthlyFeasibility.impossibleDetails.length > 0
        ? `bucket-size conflict: ${repeatUnionMonthlyFeasibility.impossibleDetails.join("; ")}`
        : null,
      minFromRecentUnionM > repeatUnionMonthlyFeasibility.maxFeasibleHits
        ? "INCOMPATIBLE: lower the repeat-pool minimum or loosen the monthly/stage bucket counts."
        : "compatible.",
    ].filter(Boolean).join(" · ")
    : null;
  const generatedCandidateCountWindowDefault = useMemo(
    () => getGeneratedCandidateCountWindowDefault(activeWindowSize, DEFAULT_GENERATED_CANDIDATE_COUNT),
    [activeWindowSize],
  );
  const mostRecentDrawDateLabel = useMemo(() => {
    if (realHistory.length === 0) return "no real draws yet";
    const latestDraw = realHistory.reduce((latest, draw) => {
      return parseCsvDateToEpoch(draw.date) >= parseCsvDateToEpoch(latest.date) ? draw : latest;
    }, realHistory[0]);
    return latestDraw.date || "unknown date";
  }, [realHistory]);

  // Default the repeat pool to the latest observed month, capped by the active WFMQYH window.
  useEffect(() => {
    if (activeWindowSize > 0) {
      setRepeatWindowSizeW(repeatWindowDefaultFromLatestMonth);
    }
  }, [activeWindowSize, repeatWindowDefaultFromLatestMonth]);

  useEffect(() => {
    setMinFromRecentUnionM((previous) => {
      const safePrevious = Number.isFinite(previous) ? Math.max(0, Math.trunc(previous)) : 0;
      const next = Math.min(safePrevious, repeatUnionCandidateMax);
      return next === previous ? previous : next;
    });
  }, [repeatUnionCandidateMax]);

  useEffect(() => {
    const previousWindowDefault = lastWindowDefaultNumCandidatesRef.current;
    setNumCandidatesState((previousCount) => (
      previousCount === previousWindowDefault
        ? generatedCandidateCountWindowDefault
        : previousCount
    ));
    lastWindowDefaultNumCandidatesRef.current = generatedCandidateCountWindowDefault;
  }, [generatedCandidateCountWindowDefault]);

  const sde1Exclusions = useMemo(
    () => (knobs.enableSDE1 ? getSDE1FilteredPool(realFilteredHistory).excludedNumbers : []),
    [knobs.enableSDE1, realFilteredHistory],
  );
  const hc3Exclusions = useMemo(
    () => (knobs.enableHC3 ? getHC3OverlapNumbers(realFilteredHistory) : []),
    [knobs.enableHC3, realFilteredHistory],
  );
  const allExclusions = useMemo(
    () => Array.from(new Set([...generationExcludedNumbers, ...sde1Exclusions, ...hc3Exclusions])).sort((a, b) => a - b),
    [generationExcludedNumbers, hc3Exclusions, sde1Exclusions]
  );
  const selectionUnavailableNumbers = allExclusions;
  const selectionUnavailableSet = useMemo(
    () => new Set(selectionUnavailableNumbers),
    [selectionUnavailableNumbers],
  );
  const toggleSharedUserSelectedNumber = useCallback((number: number) => {
    if (!Number.isInteger(number) || number < 1 || number > 45) return;
    if (selectionUnavailableSet.has(number)) return;
    setUserSelectedNumbers((current) => toggleUserSelectedNumber(current, number));
  }, [selectionUnavailableSet]);
  const strictDroughtQuotaShortlist = useMemo(
    () => buildStrictDroughtQuotaShortlist(realFilteredHistory, realHistory, {
      threshold: STRICT_DROUGHT_DEFAULT_THRESHOLD,
      topK: STRICT_DROUGHT_QUOTA_TOP_K,
    }),
    [realFilteredHistory, realHistory],
  );
  const strictDroughtQuotaEligibleNumbers = useMemo(
    () => strictDroughtQuotaShortlist.numbers.filter((number) => !selectionUnavailableSet.has(number)),
    [selectionUnavailableSet, strictDroughtQuotaShortlist.numbers],
  );
  const strictDroughtQuotaAdvice = useMemo(
    () => buildStrictDroughtQuotaAdvice(baselineHistory, {
      targetDrawOrdinal: planningDrawContext.targetDrawOrdinal,
      targetMonthExpectedDrawCount: planningDrawContext.targetMonthExpectedDrawCount,
      currentShortlistSize: strictDroughtQuotaEligibleNumbers.length,
      threshold: strictDroughtQuotaShortlist.threshold,
      topK: strictDroughtQuotaShortlist.topK,
    }),
    [
      baselineHistory,
      planningDrawContext.targetDrawOrdinal,
      planningDrawContext.targetMonthExpectedDrawCount,
      strictDroughtQuotaEligibleNumbers.length,
      strictDroughtQuotaShortlist.threshold,
      strictDroughtQuotaShortlist.topK,
    ],
  );
  const strictDroughtQuotaEffectiveMin = useMemo(() => {
    if (strictDroughtQuotaMode === "off") return 0;
    const raw = strictDroughtQuotaMode === "advised"
      ? strictDroughtQuotaAdvice.recommendedMinCount
      : strictDroughtQuotaManualMin;
    return Math.max(0, Math.min(8, strictDroughtQuotaEligibleNumbers.length, Math.floor(raw)));
  }, [
    strictDroughtQuotaAdvice.recommendedMinCount,
    strictDroughtQuotaEligibleNumbers.length,
    strictDroughtQuotaManualMin,
    strictDroughtQuotaMode,
  ]);
  const strictDroughtQuotaActive = strictDroughtQuotaMode !== "off" && strictDroughtQuotaEffectiveMin > 0;
  const strictDroughtQuotaSummary = strictDroughtQuotaMode === "off"
    ? "off"
    : `${strictDroughtQuotaMode === "advised" ? "SDSR" : "manual"} min ${strictDroughtQuotaEffectiveMin}`;
  const strictDroughtQuotaGenerationOptions = useMemo<GenerateWorkerArgs["strictDroughtQuotaOptions"] | undefined>(() => {
    if (strictDroughtQuotaMode === "off") return undefined;
    return {
      enabled: true,
      minCount: strictDroughtQuotaEffectiveMin,
      shortlist: strictDroughtQuotaShortlist.numbers,
      rankMultipliers: strictDroughtQuotaShortlist.rankMultipliers,
      sourceLabel: strictDroughtQuotaMode === "advised"
        ? `SDSR-advised · ${strictDroughtQuotaAdvice.sourceLabel}`
        : "manual",
    };
  }, [
    strictDroughtQuotaAdvice.sourceLabel,
    strictDroughtQuotaEffectiveMin,
    strictDroughtQuotaMode,
    strictDroughtQuotaShortlist.numbers,
    strictDroughtQuotaShortlist.rankMultipliers,
  ]);
  const strictDroughtQuotaTraceLine = useCallback((label: string): string | null => {
    if (strictDroughtQuotaMode === "off") return null;
    const current = strictDroughtQuotaEligibleNumbers.length
      ? `current eligible top ${strictDroughtQuotaEligibleNumbers.length}: ${strictDroughtQuotaEligibleNumbers.join(", ")}`
      : "current eligible top shortlist is empty";
    if (strictDroughtQuotaMode === "advised") {
      return `[TRACE] ${label}: Strict drought quota SDSR-advised ${strictDroughtQuotaAdvice.shouldApplyQuota ? "ON" : "observe-only"}; effective minimum ${strictDroughtQuotaEffectiveMin}; ${current}; ${strictDroughtQuotaAdvice.reason}`;
    }
    return `[TRACE] ${label}: Strict drought quota manual ON; effective minimum ${strictDroughtQuotaEffectiveMin}; ${current}.`;
  }, [
    strictDroughtQuotaAdvice.reason,
    strictDroughtQuotaAdvice.shouldApplyQuota,
    strictDroughtQuotaEffectiveMin,
    strictDroughtQuotaEligibleNumbers,
    strictDroughtQuotaMode,
  ]);
  useEffect(() => {
    setStrictDroughtQuotaManualMin((previous) => {
      const safePrevious = Number.isFinite(previous) ? Math.max(0, Math.trunc(previous)) : 0;
      const next = Math.min(safePrevious, Math.min(8, strictDroughtQuotaEligibleNumbers.length));
      return next === previous ? previous : next;
    });
  }, [strictDroughtQuotaEligibleNumbers.length]);
  const hotColdExcludedSet = useMemo(
    () => new Set(hotColdExcludedNumbers),
    [hotColdExcludedNumbers],
  );
  const sde1ExcludedSet = useMemo(
    () => new Set(sde1Exclusions),
    [sde1Exclusions],
  );
  const hc3ExcludedSet = useMemo(
    () => new Set(hc3Exclusions),
    [hc3Exclusions],
  );
  const pruneSelectionUnavailableNumbers = useCallback((current: number[], limit?: number): number[] => {
    const pruned = removeUserExcludedNumbers(current, selectionUnavailableNumbers);
    const next = typeof limit === "number" ? pruned.slice(0, limit) : pruned;
    return current.length === next.length && current.every((value, index) => value === next[index])
      ? current
      : next;
  }, [selectionUnavailableNumbers]);

  useEffect(() => {
    setTrendSelectedNumbers((current) => pruneSelectionUnavailableNumbers(current));
    setPreviousNeighbourConstraintNumbers((current) => pruneSelectionUnavailableNumbers(current));
    setHotColdForcedNumbers((current) => pruneSelectionUnavailableNumbers(current));
    setDroughtBreakSelectedNumbers((current) => pruneSelectionUnavailableNumbers(current, MAX_DROUGHT_BREAK_FORCED_NUMBERS));
    setPasteWeightedForcedNumbers((current) => pruneSelectionUnavailableNumbers(current));
    setUserSelectedNumbers((current) => pruneSelectionUnavailableNumbers(current));
    setManualSimSelected((current) => keepExistingNumberListWhenEqual(
      current,
      normalizeManualPrizeCheckNumbers(current, selectionUnavailableNumbers),
    ));
    setSelectedCarryOverBoostNumbers((current) => pruneSelectionUnavailableNumbers(current));
  }, [pruneSelectionUnavailableNumbers]);

  const temperatureSignal = useMemo(
    () => computeTemperatureSignal(realFilteredHistory, {
      alpha: 0.25,
      hybridWeight: 0.6,
      emaNormalize: "per-number",
      enforcePeaks: true,
      metric: "hybrid",
      heightNumbers: 45
    }),
    [realFilteredHistory]
  );

  const portfolioHotColdRows = useMemo<PortfolioHotColdEvidenceRow[]>(() => {
    if (realFilteredHistory.length === 0) return [];
    const summary = analyzeHotColdRanking(realFilteredHistory, {
      includeSupp: true,
      recentWindow: Math.min(20, Math.max(1, realFilteredHistory.length)),
      halfLife: Math.min(10, Math.max(1, realFilteredHistory.length)),
    });
    return summary.rows.map((row) => ({
      number: row.number,
      status: row.status,
      hotScore: row.hotScore,
      hotRank: row.hotRank,
      recentRank: row.recentRank,
      recentCount: row.recentCount,
      weightedRank: row.weightedRank,
    }));
  }, [realFilteredHistory]);

  const portfolioWindowShapeRows = useMemo(
    () => buildPortfolioWindowShapeEvidence(realFilteredHistory, { includeSupp: false }).rows,
    [realFilteredHistory],
  );

  // Row simulation
  const [simulatedDraw, setSimulatedDraw] = useState<Draw | null>(null);
  const [simSource, setSimSource] = useState<'none' | 'user' | 'candidate' | 'dga-strip'>('none');
  const [simCandidateIdx, setSimCandidateIdx] = useState<number | null>(null);
  const [predictionJournalOpen, setPredictionJournalOpen] = useState<boolean>(false);
  const [predictionJournalDraftRequest, setPredictionJournalDraftRequest] = useState<PredictionJournalDraftRequest | null>(null);
  const [predictionJournalEntriesRequestId, setPredictionJournalEntriesRequestId] = useState(0);
  const predictionJournalDraftIdRef = useRef(0);
  const predictionJournalEntriesRequestIdRef = useRef(0);

  const selectionInsightsWindowAnalytics = useMemo(
    () => buildSelectionInsightsAnalytics(realFilteredHistory, userSelectedNumbers, { topKTriplets: 10 }),
    [realFilteredHistory, userSelectedNumbers],
  );
  const selectionInsightsAllHistoryAnalytics = useMemo(
    () => buildSelectionInsightsAnalytics(realHistory, userSelectedNumbers, { topKTriplets: 10 }),
    [realHistory, userSelectedNumbers],
  );

  // DGA grid strips mirror the shared user-selected numbers; DGA simulation uses the first 8.
  const [mirrorDgaStripToPreviousNeighbour, setMirrorDgaStripToPreviousNeighbour] = useState<boolean>(false);

  const dgaStripSelectedNumbers = useMemo(
    () => removeUserExcludedNumbers(normalizeDgaSelectedNumbers(userSelectedNumbers), selectionUnavailableNumbers),
    [selectionUnavailableNumbers, userSelectedNumbers],
  );
  const dgaSuppSuggestion = useMemo(
    () => buildDgaSuppSuggestion(dgaStripSelectedNumbers, realFilteredHistory, realHistory),
    [dgaStripSelectedNumbers, realFilteredHistory, realHistory],
  );
  const buildDgaStripSimulationDraw = useCallback((simulationNumbers: number[]): Draw => {
    const suggestion = buildDgaSuppSuggestion(simulationNumbers, realFilteredHistory, realHistory);
    return {
      main: suggestion?.main ?? simulationNumbers.slice(0, 6),
      supp: suggestion?.supp ?? simulationNumbers.slice(6, 8),
      date: "DGAStrip",
      isSimulated: true,
    };
  }, [realFilteredHistory, realHistory]);
  const dgaStripSelectedKey = useMemo(
    () => dgaStripSelectedNumbers.slice(0, 8).join(","),
    [dgaStripSelectedNumbers],
  );
  const activeSimulatedDgaSelectionKey = useMemo(() => {
    if (!simulatedDraw) return "";
    return normalizeDgaSelectedNumbers([
      ...(simulatedDraw.main ?? []),
      ...(simulatedDraw.supp ?? []),
    ]).slice(0, 8).join(",");
  }, [simulatedDraw]);
  const activeSimulatedDgaRoleKey = useMemo(() => {
    if (!simulatedDraw) return "";
    return `${(simulatedDraw.main ?? []).join(",")}|${(simulatedDraw.supp ?? []).join(",")}`;
  }, [simulatedDraw]);
  const desiredDgaStripSimulationRoleKey = useMemo(() => {
    const simulationNumbers = dgaStripSelectedNumbers.slice(0, 8);
    if (simulationNumbers.length === 0) return "";
    const draw = buildDgaStripSimulationDraw(simulationNumbers);
    return `${draw.main.join(",")}|${draw.supp.join(",")}`;
  }, [buildDgaStripSimulationDraw, dgaStripSelectedNumbers]);
  const dgaStripSimulationRefreshKey = useMemo(
    () => `${dgaStripSelectedKey}::${desiredDgaStripSimulationRoleKey}`,
    [desiredDgaStripSimulationRoleKey, dgaStripSelectedKey],
  );
  const lastDgaStripSimulationRefreshKeyRef = useRef(dgaStripSimulationRefreshKey);

  const dgaStripPreviousNeighbourMatches = useMemo(() => {
    const targetSet = new Set(previousNeighbourConstraintTargetNumbers);
    return normalizePreviousNeighbourConstraintNumbers(
      dgaStripSelectedNumbers.filter((number) => targetSet.has(number))
    );
  }, [dgaStripSelectedNumbers, previousNeighbourConstraintTargetNumbers]);

  const applyDgaStripMirrorToPreviousNeighbour = useCallback((numbers: readonly number[]) => {
    const targetSet = new Set(previousNeighbourConstraintTargetNumbers);
    setPreviousNeighbourConstraintNumbers(
      normalizePreviousNeighbourConstraintNumbers(numbers.filter((number) => targetSet.has(number)))
    );
  }, [previousNeighbourConstraintTargetNumbers]);

  useEffect(() => {
    if (!mirrorDgaStripToPreviousNeighbour) return;
    applyDgaStripMirrorToPreviousNeighbour(dgaStripSelectedNumbers);
  }, [applyDgaStripMirrorToPreviousNeighbour, dgaStripSelectedNumbers, mirrorDgaStripToPreviousNeighbour]);

  // Ref for scrolling to DGA grid after simulate, and back-navigation
  const dgaGridRef = useRef<HTMLDivElement>(null);
  const [simScrollOriginY, setSimScrollOriginY] = useState<number | null>(null);
  const scrollToDGA = useCallback(() => {
    setDgaGridExpanded(true);
    setSimScrollOriginY(window.scrollY);
    requestAnimationFrame(() => {
      dgaGridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);
  const scrollBackToOrigin = useCallback(() => {
    if (simScrollOriginY !== null) {
      window.scrollTo({ top: simScrollOriginY, behavior: "smooth" });
      setSimScrollOriginY(null);
    }
  }, [simScrollOriginY]);
  const navigateToActiveSetupProvenanceTarget = useCallback((target: ActiveSetupProvenanceTarget) => {
    const targetId = ACTIVE_SETUP_PROVENANCE_TARGET_IDS[target];

    if (target === "filtersDistance") setHardFiltersExpanded(true);
    if (target === "recencyLatestDraw") setRecencyLatestDrawExpanded(true);
    if (target === "geometryPattern") setEngineRankingExpanded(true);
    if (target === "endingBuckets" || target === "monthlyCarryOver") setShapeBucketQuotasExpanded(true);

    if (typeof window === "undefined") return;

    const openDetailsPanel = (id: string): void => {
      const panel = document.getElementById(id);
      if (!(panel instanceof HTMLDetailsElement) || panel.open) return;
      const summary = panel.querySelector("summary");
      if (summary instanceof HTMLElement) {
        summary.click();
      } else {
        panel.open = true;
      }
    };

    if (target === "historySource") {
      openDetailsPanel(targetId);
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const element = document.getElementById(targetId)
          ?? ((target === "endingBuckets" || target === "monthlyCarryOver")
            ? document.getElementById(ACTIVE_SETUP_SHAPE_BUCKET_CARD_ID)
            : null);
        if (!(element instanceof HTMLElement)) return;

        const details = element.closest("details");
        if (details instanceof HTMLDetailsElement && !details.open) {
          const summary = details.querySelector("summary");
          if (summary instanceof HTMLElement) summary.click();
          else details.open = true;
        }

        element.scrollIntoView({ behavior: "smooth", block: "start" });
        element.focus({ preventScroll: true });
        element.classList.add("windfall-provenance-target-pulse");
        window.setTimeout(() => {
          element.classList.remove("windfall-provenance-target-pulse");
        }, 1200);
      });
    });
  }, []);

  const handleDgaStripChange = useCallback((nums: number[]) => {
    const sorted = removeUserExcludedNumbers(normalizeDgaSelectedNumbers(nums), selectionUnavailableNumbers);
    const simulationNumbers = sorted.slice(0, 8);
    setUserSelectedNumbers(sorted);
    if (mirrorDgaStripToPreviousNeighbour) {
      applyDgaStripMirrorToPreviousNeighbour(sorted);
    }

    if (simulationNumbers.length === 0) {
      setSimulatedDraw(null);
      setSimSource("none");
      setSimCandidateIdx(null);
      return;
    }

    setSimulatedDraw(buildDgaStripSimulationDraw(simulationNumbers));
    setSimSource("dga-strip");
    setSimCandidateIdx(null);
  }, [applyDgaStripMirrorToPreviousNeighbour, buildDgaStripSimulationDraw, mirrorDgaStripToPreviousNeighbour, selectionUnavailableNumbers]);

  useEffect(() => {
    if (lastDgaStripSimulationRefreshKeyRef.current === dgaStripSimulationRefreshKey) return;
    lastDgaStripSimulationRefreshKeyRef.current = dgaStripSimulationRefreshKey;

    const simulationNumbers = dgaStripSelectedNumbers.slice(0, 8);
    if (simulationNumbers.length === 0) {
      setSimulatedDraw(null);
      setSimSource("none");
      setSimCandidateIdx(null);
      return;
    }

    if (
      activeSimulatedDgaSelectionKey === dgaStripSelectedKey &&
      (simSource !== "dga-strip" || activeSimulatedDgaRoleKey === desiredDgaStripSimulationRoleKey)
    ) return;

    setSimulatedDraw(buildDgaStripSimulationDraw(simulationNumbers));
    setSimSource("dga-strip");
    setSimCandidateIdx(null);
  }, [
    activeSimulatedDgaRoleKey,
    activeSimulatedDgaSelectionKey,
    buildDgaStripSimulationDraw,
    desiredDgaStripSimulationRoleKey,
    dgaStripSelectedKey,
    dgaStripSimulationRefreshKey,
    dgaStripSelectedNumbers,
    simSource,
  ]);

  // Manual simulation is a prize-worthiness scratchpad for the generated-candidate table.
  const [manualSimSelected, setManualSimSelected] = useState<number[]>([]);
  const [pickSixSource, setPickSixSource] = useState<PickSixSource>("manual");
  const [pickSixManual, setPickSixManual] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8]);

  const numberConflictLedger = useMemo(
    () => buildNumberConflictLedger([
      { kind: "hardInclude", label: "Number Trends selections", numbers: trendSelectedNumbers },
      { kind: "hardInclude", label: "Latest +/-1/+/-2 constraint", numbers: previousNeighbourConstraintNumbers },
      { kind: "hardInclude", label: "Hot/Cold include rows", numbers: hotColdForcedNumbers },
      { kind: "hardInclude", label: "Drought-break shortlist", numbers: droughtBreakSelectedNumbers },
      { kind: "hardInclude", label: "Paste-Weighted missing-number selections", numbers: pasteWeightedForcedNumbers },
      { kind: "hardExclude", label: "User Exclusions", numbers: excludedNumbers },
      { kind: "hardExclude", label: "Hot/Cold exclude rows", numbers: hotColdExcludedNumbers },
      { kind: "hardExclude", label: "Auto-exclude unselected user numbers", numbers: autoExcludedFromSelection },
      { kind: "hardExclude", label: "Main bucket auto-exclusions", numbers: mainConstraintAutoExclusions.excludedNumbers },
      { kind: "hardExclude", label: "SDE1", numbers: sde1Exclusions },
      { kind: "hardExclude", label: "HC3", numbers: hc3Exclusions },
      { kind: "softInclude", label: "User selected boost", numbers: selectedBoostEnabled ? userSelectedNumbers : [] },
      {
        kind: "softInclude",
        label: `Month-end carry-over ${SELECTED_CARRY_OVER_BOOSTS[selectedCarryOverBoostMode].label} boost`,
        numbers: selectedCarryOverBoostNumbers,
      },
      { kind: "simulation", label: "DGA simulation strip", numbers: dgaStripSelectedNumbers },
    ]),
    [
      autoExcludedFromSelection,
      dgaStripSelectedNumbers,
      droughtBreakSelectedNumbers,
      excludedNumbers,
      hc3Exclusions,
      hotColdExcludedNumbers,
      hotColdForcedNumbers,
      mainConstraintAutoExclusions.excludedNumbers,
      pasteWeightedForcedNumbers,
      previousNeighbourConstraintNumbers,
      selectedBoostEnabled,
      selectedCarryOverBoostMode,
      selectedCarryOverBoostNumbers,
      sde1Exclusions,
      trendSelectedNumbers,
      userSelectedNumbers,
    ],
  );

  const buildKeptGeneratedCandidateRow = useCallback((
    candidate: CandidateSet,
    sourceIndex: number,
    id: string,
  ): KeptGeneratedCandidateRow | null => {
    const main = candidate.main
      .filter((number) => Number.isInteger(number) && number >= 1 && number <= 45)
      .slice(0, 6);
    const supp = candidate.supp
      .filter((number) => Number.isInteger(number) && number >= 1 && number <= 45)
      .slice(0, 2);

    if (main.length !== 6) return null;

    return {
      id,
      sourceIndex,
      main,
      supp,
    };
  }, []);

  const syncUserSelectionForExternalSimulation = useCallback((numbers: number[]) => {
    if (autoExcludeUnselected) return;
    setUserSelectedNumbers(numbers);
  }, [autoExcludeUnselected]);

  const handleSimulateCandidate = (idx: number) => {
    const cand = candidates[idx];
    if (!cand) return;
    const simulatedNumbers = [...cand.main, ...cand.supp].slice(0, 8);
    setSelectedCandidateIdx(idx);
    syncUserSelectionForExternalSimulation(simulatedNumbers);
    setSimulatedDraw({
      main: cand.main.slice(),
      supp: cand.supp.slice(),
      date: "Simulated",
      isSimulated: true,
    } as any);
    setSimSource('candidate');
    setSimCandidateIdx(idx);
    scrollToDGA();
  };

  const handleStartGenerationSession = useCallback(() => {
    setGenerationSessionActive(true);
    setTraceMaybe((traceLines) => [
      ...traceLines,
      `[TRACE] Generation session started: ${generationSessionRows.length} stored mains-unique candidate${generationSessionRows.length === 1 ? "" : "s"} protected against duplicate mains while active.`,
    ]);
  }, [generationSessionRows.length, setTraceMaybe]);

  const handleEndGenerationSession = useCallback(() => {
    setGenerationSessionActive(false);
    setTraceMaybe((traceLines) => [
      ...traceLines,
      `[TRACE] Generation session ended: ${generationSessionRows.length} stored candidate${generationSessionRows.length === 1 ? "" : "s"} remain available for export or clearing.`,
    ]);
  }, [generationSessionRows.length, setTraceMaybe]);

  const handleClearGenerationSession = useCallback(() => {
    const clearedCount = generationSessionRows.length;
    setGenerationSessionRows([]);
    setTraceMaybe((traceLines) => [
      ...traceLines,
      `[TRACE] Generation session cleared: removed ${clearedCount} stored candidate${clearedCount === 1 ? "" : "s"}.`,
    ]);
  }, [generationSessionRows.length, setTraceMaybe]);

  const handleExportGenerationSession = useCallback(() => {
    if (generationSessionRows.length === 0) {
      setTraceMaybe((traceLines) => [
        ...traceLines,
        "[TRACE] Generation session export skipped: no stored candidates to export.",
      ]);
      return;
    }

    const exportedRows = generationSessionRows.map((row, index) => ({
      ...row,
      id: `generation-session-export-${Date.now()}-${index + 1}`,
    }));
    setKeptGeneratedCandidateRows((current) => [...current, ...exportedRows]);
    setGenerationSessionRows([]);
    setTraceMaybe((traceLines) => [
      ...traceLines,
      `[TRACE] Generation session exported: ${exportedRows.length} candidate${exportedRows.length === 1 ? "" : "s"} appended to Portfolio Compression as mains+supps and Paste-Weighted as mains-only rows; session storage cleared${generationSessionActive ? " and capture remains active" : ""}.`,
    ]);
  }, [generationSessionActive, generationSessionRows, setTraceMaybe]);

  const handleKeepGeneratedCandidate = useCallback((idx: number) => {
    const candidate = candidates[idx];
    if (!candidate) return;

    keptGeneratedCandidateSequenceRef.current += 1;
    const keptRow = buildKeptGeneratedCandidateRow(
      candidate,
      idx,
      `generated-${Date.now()}-${keptGeneratedCandidateSequenceRef.current}`,
    );

    if (!keptRow) {
      setTraceMaybe((traceLines) => [
        ...traceLines,
        `[TRACE] Keep candidate #${idx + 1} skipped: candidate does not contain six valid main numbers.`,
      ]);
      return;
    }

    setKeptGeneratedCandidateRows((current) => [...current, keptRow]);
    setTraceMaybe((traceLines) => [
      ...traceLines,
      `[TRACE] Kept generated candidate #${idx + 1}: mains [${keptRow.main.join(", ")}]${keptRow.supp.length ? ` supps [${keptRow.supp.join(", ")}]` : ""} appended to Portfolio Compression and Paste-Weighted rows.`,
    ]);
  }, [buildKeptGeneratedCandidateRow, candidates, setTraceMaybe]);

  const handleSimulatePickSixManual = (nums: number[]) => {
    if (nums.length !== 8 || nums.some((n) => !Number.isFinite(n))) return;
    const simulatedNumbers = nums.slice(0, 8);
    const main = simulatedNumbers.slice(0, 6).sort((a, b) => a - b);
    const supp = simulatedNumbers.slice(6, 8).sort((a, b) => a - b);
    syncUserSelectionForExternalSimulation(simulatedNumbers);
    setSimulatedDraw({ main, supp, date: "PickSixManual", isSimulated: true } as any);
    setSimSource('user');
    setSimCandidateIdx(null);
    scrollToDGA();
  };

  const activeSimulatedDraw = simulatedDraw;
  const activeSimulatedMainKey = useMemo(() => {
    const mainNumbers = Array.isArray(simulatedDraw?.main)
      ? simulatedDraw.main.filter((value) => Number.isFinite(value))
      : [];
    if (mainNumbers.length === 0) return null;
    return [...mainNumbers].sort((left, right) => left - right).join(",");
  }, [simulatedDraw]);
  const dgaSimNumbers = useMemo(() => {
    if (!simulatedDraw) return [];
    const nums = [...(simulatedDraw.main || []), ...(simulatedDraw.supp || [])].filter((n) => Number.isFinite(n));
    return nums.length === 8 ? nums : [];
  }, [simulatedDraw]);
  
  const historyWindowName = useMemo(() => {
    if (drawWindowMode === "range") return `Range ${rangeFrom}-${rangeTo}`;
    switch (windowMode) {
      case "W": return "Weekly";
      case "F": return "Fortnight";
      case "M": return "Month";
      case "Q": return "Quarter";
      case "Y": return "Year";
      case "H": return "Full History";
      case "Custom": return `Custom (${filteredHistory.length})`;
      default: return "";
    }
  }, [windowMode, filteredHistory.length, drawWindowMode, rangeFrom, rangeTo]);

  const handleSimulateAcceptanceNeeds = useCallback((numbers: number[]) => {
    const simulatedNumbers = numbers
      .filter((value) => Number.isFinite(value))
      .slice(0, 8);

    if (simulatedNumbers.length < 6) return;

    const main = simulatedNumbers.slice(0, 6).sort((a, b) => a - b);
    const supp = simulatedNumbers.slice(6, 8).sort((a, b) => a - b);

    syncUserSelectionForExternalSimulation(simulatedNumbers);
    setSelectedCandidateIdx(-1);
    setSimulatedDraw({ main, supp, date: "AcceptanceNeeds", isSimulated: true } as any);
    setSimSource('user');
    setSimCandidateIdx(null);
    scrollToDGA();
  }, [scrollToDGA, syncUserSelectionForExternalSimulation]);

  const handleSimulatePasteWeightedCandidate = useCallback((numbers: number[]) => {
    const main = numbers
      .filter((value) => Number.isFinite(value))
      .slice(0, 6)
      .sort((left, right) => left - right);

    if (main.length < 6) return;

    setSelectedCandidateIdx(-1);
    syncUserSelectionForExternalSimulation(main);
    setSimulatedDraw({ main, supp: [], date: "PasteWeighted", isSimulated: true } as any);
    setSimSource('candidate');
    setSimCandidateIdx(null);
    scrollToDGA();
  }, [scrollToDGA, syncUserSelectionForExternalSimulation]);

  const handleSimulatePortfolioCore = useCallback((numbers: number[]) => {
    const main = numbers
      .filter((value) => Number.isFinite(value))
      .slice(0, 6)
      .sort((left, right) => left - right);

    if (main.length !== 6) return;

    setSelectedCandidateIdx(-1);
    setSimulatedDraw({ main, supp: [], date: "PortfolioCore", isSimulated: true } as any);
    setSimSource('candidate');
    setSimCandidateIdx(null);
    scrollToDGA();
  }, [scrollToDGA]);
  

  // Trend series for panels
  const trendValueSeries = useMemo(() => {
    return buildTrendValueSeries(realFilteredHistory);
  }, [realFilteredHistory]);

  const activeTrendMap = useMemo(
    () => computeTrendMap(trendValueSeries, { lookback: trendLookback, threshold: trendThreshold }),
    [trendValueSeries, trendLookback, trendThreshold],
  );

  const historicalTrendRatioStats = useMemo(
    () => computeHistoricalTrendRatios({
      lookback: trendLookback,
      threshold: trendThreshold,
      valueSeries: trendValueSeries,
      historyDraws: realFilteredHistory.map((d) => ({ main: d.main, supp: d.supp })),
    }),
    [realFilteredHistory, trendLookback, trendThreshold, trendValueSeries],
  );

  const trendRatioEligibleDraws = useMemo(
    () => historicalTrendRatioStats.reduce((sum, row) => sum + row.count, 0),
    [historicalTrendRatioStats],
  );

  const trendRatioCoveragePercent = useMemo(() => {
    if (!allowedTrendRatios.length || trendRatioEligibleDraws <= 0) return 100;
    const allowed = new Set(allowedTrendRatios);
    const selectedDraws = historicalTrendRatioStats
      .filter((row) => allowed.has(row.tag))
      .reduce((sum, row) => sum + row.count, 0);
    return +(100 * selectedDraws / trendRatioEligibleDraws).toFixed(2);
  }, [allowedTrendRatios, historicalTrendRatioStats, trendRatioEligibleDraws]);

  useEffect(() => {
    setKnobs((prev) => ({
      ...prev,
      gpwf_window_size,
      gpwf_bias_factor,
      gpwf_floor,
      gpwf_scale_multiplier,
      lambda: lambda,
      octagonal_top: octagonalTop,
    }));
  }, [gpwf_window_size, gpwf_bias_factor, gpwf_floor, gpwf_scale_multiplier, lambda, octagonalTop]);

  // Build DGA grid with a synthetic column only when simulatedDraw is set.
  // The grid always covers the FULL history so the user-exclusion strip on the
  // right never leaves blank space.  Columns before wfmqyhStart are shown at
  // reduced opacity by DGAVisualizer (those draws are outside the WFMQYH window).
  useEffect(() => {
    const allDraws = realHistory.length;
    const winSize = realFilteredHistory.length;
    if (winSize < 2) {
      setDgaDiamonds([]); setDgaPredictions([]); setDgaGrid([]); setDgaDrawLabels([]);
      setDgaWfmqyhStart(0);
      setNumberCounts([]); setMinCount(0); setMaxCount(0);
      setHighlightMsg("Insufficient valid draws for visualization.");
      return;
    }
    // wfmqyhStart is the first 0-based column index that belongs to the
    // WFMQYH window; everything before it is "full-history dim" context.
    const winStart = Math.max(0, allDraws - winSize);
    let grid = buildDrawGrid(realHistory, 45, allDraws).map((row) => [...row, 0]);
    // drawLabels only covers the actual historical draws; the synthetic column
    // at grid index `allDraws` is exposed as the "Next" column inside DGAVisualizer.
    const drawLabels = Array.from({ length: allDraws }, (_, i) => (i + 1).toString());
    if (simulatedDraw) {
      for (const n of simulatedDraw.main) if (n >= 1 && n <= 45) grid[n - 1][grid[0].length - 1] = 1;
      for (const n of simulatedDraw.supp) if (n >= 1 && n <= 45) grid[n - 1][grid[0].length - 1] = 2;
    }
    const diamonds = findDiamondsAllRadii(grid, 1, 4);
    const predictions = getPredictedNumbers(diamonds, grid[0].length - 1);
    setDgaGrid(grid); setDgaDiamonds(diamonds); setDgaPredictions(predictions); setDgaDrawLabels(drawLabels);
    setDgaWfmqyhStart(winStart);

    // Heatmap counts are still based on the real windowed filteredHistory so they
    // reflect analysis-relevant recency rather than all-time frequency.
    const counts: number[] = Array(45).fill(0);
    realFilteredHistory.forEach((draw) => {
      draw.main.forEach((n) => (n >= 1 && n <= 45 ? counts[n - 1]++ : null));
      draw.supp.forEach((n) => (n >= 1 && n <= 45 ? counts[n - 1]++ : null));
    });
    setNumberCounts(counts);
    setMinCount(Math.min(...counts));
    setMaxCount(Math.max(...counts));
    setHighlightMsg("");
  }, [realHistory, realFilteredHistory, simulatedDraw]);

  useEffect(() => {
    const nextRatioOptions = computeOddEvenRatios(realFilteredHistory);
    setRatioOptions(nextRatioOptions);
    setSelectedRatios((ratios) => ratios.filter((r) => nextRatioOptions.some((opt) => opt.ratio === r)));
  }, [realFilteredHistory]);

  const numberTrends = useMemo(() => computeNumberTrends(realFilteredHistory), [realFilteredHistory]);
  const shortTrends = useMemo(() => numberTrends.map((t) => ({ number: t.number, fortnight: t.fortnight, month: t.month })), [numberTrends]);
  const trendWeights = useMemo(() => buildTrendWeights(shortTrends, { method: "exp", beta: 3.0 }), [shortTrends]);

  const conditionalProb = useMemo(
    () => buildConditionalProb(realFilteredHistory, temperatureSignal, 0.5, 0.3),
    [realFilteredHistory, temperatureSignal]
  );
  const ratioOptionValues = useMemo(() => ratioOptions.map((option) => option.ratio), [ratioOptions]);
  const allVisibleRatiosSelected = ratioOptionValues.length > 0
    && ratioOptionValues.every((ratio) => selectedRatios.includes(ratio));

  // Minimum number of prior draws required for a stable OGA baseline.
  // Draws computed against fewer than this many draws produce unreliable scores
  // that pollute the percentile distribution — especially under small WFMQYH windows.
  const MIN_OGA_BASELINE = 10;

  const pastOGAScores = useMemo(
    () =>
      realFilteredHistory.map((draw, idx, arr) =>
        computeOGA([...draw.main, ...draw.supp], arr.slice(0, idx) || [], ogaSpokeCount)
      ),
    [realFilteredHistory, ogaSpokeCount]
  );

  // Stable subset: only scores computed with >= MIN_OGA_BASELINE draws of history.
  // Used for percentile calculations so early unreliable scores don't skew the distribution.
  // Falls back to all scores when the window is too small for the baseline threshold.
  const stableOGAScores = useMemo(
    () => {
      const stable = pastOGAScores.slice(MIN_OGA_BASELINE);
      return stable.length > 0 ? stable : pastOGAScores;
    },
    [pastOGAScores]
  );

  /** Monthly Repeat Bias: compute per-number weights for once-drawn numbers this month.
   *
   * mrbEffectiveDate: resolves which calendar month to treat as "current".
   * - Uses the shared next-draw planning context rather than max observed month
   *   length, so completed 12/13-draw months advance correctly even when the
   *   history also contains 14-draw months.
   */
  const mrbEffectiveDate = useMemo(
    (): Date => dateFromMonthLabel(planningDrawContext.targetMonthLabel) ?? planningDrawContext.today,
    [planningDrawContext.targetMonthLabel, planningDrawContext.todayIso, planningDrawContext.today],
  );

  const monthlyRepeatBiasResult = useMemo(() => {
    if (!mrbEnabled || !realFilteredHistory.length) return null;
    return buildMonthlyRepeatBiasWeights(realFilteredHistory, mrbBucketBoosts, mrbIncludeSupp, mrbEffectiveDate);
  }, [mrbEnabled, realFilteredHistory, mrbBucketBoosts, mrbIncludeSupp, mrbEffectiveDate]);

  const monthEndCarryOverStrengthSettings = MONTH_END_CARRY_OVER_STRENGTHS[monthEndCarryOverStrength];
  const selectedCarryOverBoostSettings = SELECTED_CARRY_OVER_BOOSTS[selectedCarryOverBoostMode];
  const selectedCarryOverBoostFactor = selectedCarryOverBoostSettings.factor;

  const monthEndCarryOverWeighting = useMemo(() => {
    return buildMonthEndCarryOverWeighting(realHistory, {
      includeSupp: true,
      earlyDrawLimit: 3,
      referenceDate: mrbEffectiveDate,
      factorScale: monthEndCarryOverStrengthSettings.factorScale,
      includeMonthEndUndrawn: monthEndCarryOverIncludeMonthEndUndrawn,
      includeBoundaryRepeats: monthEndCarryOverIncludeBoundaryRepeats,
    });
  }, [
    realHistory,
    mrbEffectiveDate,
    monthEndCarryOverStrengthSettings.factorScale,
    monthEndCarryOverIncludeMonthEndUndrawn,
    monthEndCarryOverIncludeBoundaryRepeats,
  ]);

  useEffect(() => {
    if (monthEndCarryOverBiasTouchedRef.current) return;
    setMonthEndCarryOverBiasEnabled(monthEndCarryOverWeighting.defaultEnabled);
  }, [monthEndCarryOverWeighting.defaultEnabled]);

  const setMonthEndCarryOverBiasEnabledManual = useCallback((enabled: boolean) => {
    monthEndCarryOverBiasTouchedRef.current = true;
    setMonthEndCarryOverBiasEnabled(enabled);
  }, []);

  const setMonthEndCarryOverStrengthManual = useCallback((value: MonthEndCarryOverStrength) => {
    monthEndCarryOverBiasTouchedRef.current = true;
    setMonthEndCarryOverStrength(value);
  }, []);

  const setMonthEndCarryOverIncludeMonthEndUndrawnManual = useCallback((enabled: boolean) => {
    monthEndCarryOverBiasTouchedRef.current = true;
    setMonthEndCarryOverIncludeMonthEndUndrawn(enabled);
  }, []);

  const setMonthEndCarryOverIncludeBoundaryRepeatsManual = useCallback((enabled: boolean) => {
    monthEndCarryOverBiasTouchedRef.current = true;
    setMonthEndCarryOverIncludeBoundaryRepeats(enabled);
  }, []);

  const setSelectedCarryOverBoostModeManual = useCallback((value: SelectedCarryOverBoostMode) => {
    monthEndCarryOverBiasTouchedRef.current = true;
    setSelectedCarryOverBoostMode(value);
  }, []);

  const toggleSelectedCarryOverBoostNumber = useCallback((number: number) => {
    if (!Number.isInteger(number) || number < 1 || number > 45) return;
    if (selectionUnavailableSet.has(number)) return;
    monthEndCarryOverBiasTouchedRef.current = true;
    setMonthEndCarryOverBiasEnabled(true);
    setSelectedCarryOverBoostNumbers((previous) => (
      previous.includes(number)
        ? previous.filter((item) => item !== number)
        : [...previous, number].sort((left, right) => left - right)
    ));
  }, [selectionUnavailableSet]);

  const monthEndCarryOverWeightsForGeneration = useMemo(() => {
    if (!monthEndCarryOverBiasEnabled) return undefined;
    return buildEffectiveMonthEndCarryOverWeights(
      monthEndCarryOverWeighting.weights,
      selectedCarryOverBoostNumbers,
      selectedCarryOverBoostFactor,
    );
  }, [monthEndCarryOverBiasEnabled, monthEndCarryOverWeighting.weights, selectedCarryOverBoostNumbers, selectedCarryOverBoostFactor]);

  const formatMonthEndCarryOverWeight = useCallback((number: number, factor: number): string => {
    const direction = factor > 1 + 1e-9
      ? "boost"
      : factor < 1 - 1e-9
        ? "penalty"
        : "neutral";
    const formattedFactor = factor >= 100
      ? factor.toFixed(0)
      : factor.toFixed(2);
    return `${number}×${formattedFactor} ${direction}`;
  }, []);

  const monthEndCarryOverTopWeightSummary = useMemo(() => {
    if (monthEndCarryOverWeightsForGeneration) {
      return Object.entries(monthEndCarryOverWeightsForGeneration)
        .map(([number, factor]) => ({ number: Number(number), factor }))
        .filter(({ number, factor }) => number >= 1 && number <= 45 && Math.abs(factor - 1) > 1e-9)
        .sort((left, right) => Math.abs(right.factor - 1) - Math.abs(left.factor - 1) || left.number - right.number)
        .slice(0, 8)
        .map(({ number, factor }) => formatMonthEndCarryOverWeight(number, factor))
        .join(", ");
    }
    return monthEndCarryOverWeighting.weightedNumbers
      .slice(0, 8)
      .map((item) => formatMonthEndCarryOverWeight(item.number, item.factor))
      .join(", ");
  }, [formatMonthEndCarryOverWeight, monthEndCarryOverWeighting.weightedNumbers, monthEndCarryOverWeightsForGeneration]);

  const monthEndCarryOverDirectionSummary = useMemo(() => {
    const boosted = monthEndCarryOverWeighting.weightedNumbers.filter((item) => item.factor > 1 + 1e-9).length;
    const penalized = monthEndCarryOverWeighting.weightedNumbers.filter((item) => item.factor < 1 - 1e-9).length;
    if (boosted === 0 && penalized === 0) return "all active weights are neutral";
    return `${boosted} boost${boosted === 1 ? "" : "s"} · ${penalized} penalt${penalized === 1 ? "y" : "ies"}`;
  }, [monthEndCarryOverWeighting.weightedNumbers]);

  const selectedCarryOverBoostSummary = useMemo(() => (
    selectedCarryOverBoostNumbers.length > 0 ? selectedCarryOverBoostNumbers.join(", ") : ""
  ), [selectedCarryOverBoostNumbers]);

  const monthEndCarryOverPoolBreakdown = useMemo(() => {
    const parts: string[] = [];
    const monthEndUndrawnCount = monthEndCarryOverWeighting.monthEndUndrawnNumbers.length;
    const boundaryRepeatCount = monthEndCarryOverWeighting.boundaryRepeatNumbers.length;
    if (monthEndUndrawnCount > 0) {
      parts.push(`${monthEndUndrawnCount} month-end undrawn`);
    }
    if (boundaryRepeatCount > 0) {
      parts.push(`${boundaryRepeatCount} last→first repeat${boundaryRepeatCount === 1 ? "" : "s"}`);
    }
    return parts.join(" + ");
  }, [monthEndCarryOverWeighting.boundaryRepeatNumbers, monthEndCarryOverWeighting.monthEndUndrawnNumbers]);

  const monthEndCarryOverDefaultLabel = useMemo(() => {
    const nextDrawOrdinal = monthEndCarryOverWeighting.drawsSoFarThisMonth + 1;
    if (monthEndCarryOverWeighting.defaultEnabled) {
      return `Default ON • next draw is D${nextDrawOrdinal} of ${monthEndCarryOverWeighting.targetMonthLabel}`;
    }
    if (monthEndCarryOverWeighting.drawsSoFarThisMonth < monthEndCarryOverWeighting.earlyDrawLimit) {
      return `Default OFF • no positive active signal for D${nextDrawOrdinal} of ${monthEndCarryOverWeighting.targetMonthLabel}`;
    }
    return `Default OFF • first ${monthEndCarryOverWeighting.earlyDrawLimit} draws of ${monthEndCarryOverWeighting.targetMonthLabel} are already recorded`;
  }, [monthEndCarryOverWeighting.defaultEnabled, monthEndCarryOverWeighting.drawsSoFarThisMonth, monthEndCarryOverWeighting.earlyDrawLimit, monthEndCarryOverWeighting.targetMonthLabel]);

  // Reference mode for OGA percentiles and histogram
  const [ogaRefMode, setOgaRefMode] = useState<"window" | "all">("window");

  // Windowed reference distribution computed against current window baseline
  const pastOGAScoresRefWindow = useMemo(
    () => realFilteredHistory.map((draw) => computeOGA([...draw.main, ...draw.supp], realFilteredHistory, ogaSpokeCount)),
    [realFilteredHistory, ogaSpokeCount]
  );
  // Full-history reference distribution computed against full history baseline
  const pastOGAScoresRefAll = useMemo(
    () => realHistory.map((draw) => computeOGA([...draw.main, ...draw.supp], realHistory, ogaSpokeCount)),
    [realHistory, ogaSpokeCount]
  );
  // Active reference based on toggle
  const pastOGAScoresRef = useMemo(
    () => (ogaRefMode === "window" ? pastOGAScoresRefWindow : pastOGAScoresRefAll),
    [ogaRefMode, pastOGAScoresRefWindow, pastOGAScoresRefAll]
  );
  
  const baseScores: Record<number, number> = useMemo(() => {
    const src =
      (Array.isArray(conditionalProb) && conditionalProb.length === 45 ? conditionalProb :
        Array.isArray(temperatureSignal) && temperatureSignal.length === 45 ? temperatureSignal :
          Array(45).fill(0)) as number[];
    const map: Record<number, number> = {};
    for (let n = 1; n <= 45; n++) map[n] = src[n - 1] ?? 0;
    return map;
  }, [conditionalProb, temperatureSignal]);

  const savedZoneWeights = useMemo(() => {
    try { return getSavedZoneWeights(); } catch { return null; }
  }, []);

  const [applyZoneBias, setApplyZoneBias] = useState<boolean>(false);

  const finalScores: Record<number, number> = useMemo(() => {
    if (!applyZoneBias) return baseScores;
    return applyZoneWeightBiasToScores(baseScores, savedZoneWeights, zoneGamma);
  }, [applyZoneBias, baseScores, savedZoneWeights, zoneGamma]);

  const rankedNumbers = useMemo(() => {
    return Object.entries(finalScores)
      .map(([n, s]) => ({ n: Number(n), s }))
      .sort((a, b) => b.s - a.s || a.n - b.n);
  }, [finalScores]);

  function getSurvivorSelectionState() {
    const hasRecentDraw = realFilteredHistory.length > 0;
    const carryOverWeight = monthEndCarryOverBiasEnabled ? monthEndCarryOverStrengthSettings.rankingWeight : 0;
    return {
      oga: knobs.enableOGA && rankingWeights.oga > 0,
      selected: rankingWeights.selHitsEnabled && userSelectedNumbers.length > 0 && rankingWeights.sel > 0,
      recent: rankingWeights.recentHitsEnabled && hasRecentDraw && rankingWeights.recent > 0,
      carryOver: monthEndCarryOverBiasEnabled && carryOverWeight > 0,
      scoring: Boolean(activeScoringGenerationProfile),
      carryOverWeight,
    };
  }

  function compareFinalSurvivorCandidates(a: CandidateSet, b: CandidateSet): number {
    const survivorState = getSurvivorSelectionState();
    if ((b.finalCompositeAdj ?? 0) !== (a.finalCompositeAdj ?? 0)) {
      return (b.finalCompositeAdj ?? 0) - (a.finalCompositeAdj ?? 0);
    }
    if (survivorState.scoring && (b.scoreEvidence ?? 0) !== (a.scoreEvidence ?? 0)) {
      return (b.scoreEvidence ?? 0) - (a.scoreEvidence ?? 0);
    }
    if (survivorState.oga && (b.ogaPercentile ?? 0) !== (a.ogaPercentile ?? 0)) {
      return (b.ogaPercentile ?? 0) - (a.ogaPercentile ?? 0);
    }
    return 0;
  }

  function buildSurvivorSelectionTrace(label: string, poolBeforeSlice: number, kept: number, requested: number): string {
    const survivorState = getSurvivorSelectionState();
    const activeSignals: string[] = [];
    if (survivorState.oga) activeSignals.push(`OGA weight ${rankingWeights.oga}`);
    if (survivorState.selected) activeSignals.push(`SelHits weight ${rankingWeights.sel}`);
    if (survivorState.recent) activeSignals.push(`RecentHits weight ${rankingWeights.recent}`);
    if (survivorState.carryOver) activeSignals.push(`carry-over weight ${survivorState.carryOverWeight}`);
    if (survivorState.scoring && activeScoringGenerationProfile) {
      activeSignals.push(`Scoring Diagnostics ${activeScoringGenerationProfile.influence}`);
    }
    if (selectedRatios.length > 0) activeSignals.push(`odd/even quota ${selectedRatios.join(", ")}`);

    const sliceSummary = poolBeforeSlice > requested
      ? `pool ${poolBeforeSlice} -> kept ${kept}`
      : `pool ${poolBeforeSlice}; no final overgen slice needed`;
    const signalSummary = activeSignals.length
      ? `chosen by ${activeSignals.join(" · ")}`
      : "no active survivor-ranking signals; generated order preserved";
    return `[TRACE] ${label} survivor selection: ${sliceSummary}; ${signalSummary}.`;
  }

  function recomputeCompositeRanking(base: CandidateSet[]): CandidateSet[] {
    if (!base.length) return base;
    const manualMainSet = new Set(manualSimSelected.slice(0, 6));
    const manualSuppSet = new Set(manualSimSelected.slice(6, 8));
    const computePrize = (main: number[], supp: number[]) => {
      const label = computeWeekdayWindfallPrizeDivision(main, supp, manualMainSet, manualSuppSet);
      return { label, rank: rankWeekdayWindfallPrizeDivision(label) };
    };
     const recentDraw = realFilteredHistory[realFilteredHistory.length - 1];
     const recentSet = recentDraw ? new Set([...recentDraw.main, ...recentDraw.supp]) : null;
     const selectedSet = new Set(userSelectedNumbers);
      const carryOverWeight = monthEndCarryOverBiasEnabled ? monthEndCarryOverStrengthSettings.rankingWeight : 0;
      const carryOverWeights = monthEndCarryOverBiasEnabled ? monthEndCarryOverWeightsForGeneration : undefined;
     const survivorState = getSurvivorSelectionState();
      const sumW =
        (survivorState.oga ? rankingWeights.oga : 0) +
        (survivorState.selected ? rankingWeights.sel : 0) +
        (survivorState.recent ? rankingWeights.recent : 0) +
        (survivorState.carryOver ? carryOverWeight : 0) ||
        1;
     const wOGA = rankingWeights.oga / sumW;
     const wSel = rankingWeights.sel / sumW;
     const wRecent = rankingWeights.recent / sumW;
      const wCarryOver = carryOverWeight / sumW;

    return base
      .map((c: any) => {
        const nums = [...c.main, ...c.supp];
        // Skip expensive OGA computation when OGA is toggled off
        const ogaScore = knobs.enableOGA
          ? (c.ogaScore ?? computeOGA(nums, realFilteredHistory, ogaSpokeCount))
          : 0;
        const ogaPercentile = knobs.enableOGA
          ? (c.ogaPercentile ?? getOGAPercentile(ogaScore, stableOGAScores))
          : 0;
        const selHits = nums.filter(n => selectedSet.has(n)).length;
        const recentHits = recentSet ? nums.filter(n => recentSet.has(n)).length : 0;
        const carryOver = scoreMonthEndCarryOverCandidate(nums, carryOverWeights);
        const ogaNorm = knobs.enableOGA ? Math.max(0, Math.min(1, ogaPercentile / 100)) : 0;
        const finalComposite =
          (survivorState.oga ? wOGA * ogaNorm : 0) +
          (survivorState.selected ? wSel * (selHits / 8) : 0) +
          (survivorState.recent ? wRecent * (recentHits / 8) : 0) +
          (survivorState.carryOver ? wCarryOver * carryOver.normalizedScore : 0);
        const { label: prizeLabel, rank: prizeRank } = computePrize(c.main, c.supp);
        return {
          ...c,
          ogaScore,
          ogaPercentile,
          selHits,
          recentHits,
          carryOverHits: carryOver.hits,
          carryOverScore: carryOver.normalizedScore,
          finalCompositeAdj: finalComposite,
          prizeLabel,
          prizeRank,
        };
      })
      .sort((a: any, b: any) => {
        // Sort by statistical quality only. Prize is a display/evaluation metric
        // and must NOT influence pool ranking (otherwise Manual Prize Check
        // changes which candidates survive the over-generation slice).
        if (b.finalCompositeAdj !== a.finalCompositeAdj) return b.finalCompositeAdj - a.finalCompositeAdj;
        if (survivorState.carryOver && b.carryOverScore !== a.carryOverScore) return b.carryOverScore - a.carryOverScore;
        if (survivorState.carryOver && b.carryOverHits !== a.carryOverHits) return b.carryOverHits - a.carryOverHits;
        if (survivorState.selected && b.selHits !== a.selHits) return b.selHits - a.selHits;
        if (survivorState.recent && b.recentHits !== a.recentHits) return b.recentHits - a.recentHits;
        // Skip OGA tiebreaker when disabled
        if (survivorState.oga && b.ogaPercentile !== a.ogaPercentile) return b.ogaPercentile - a.ogaPercentile;
        return 0;
      });
   }

  function applyConfiguredReadinessHardFilters(pool: CandidateSet[]): ApplyReadinessHardFiltersResult {
    return applyReadinessHardFiltersToCandidates(pool, readinessHardFilters, {
      monthlyBuckets: monthlyBucketSetsAlways ?? monthlyConstraintPayload?.buckets ?? null,
      monthlyIdealDrawState,
      monthlyAvgBuckets,
      historyForOga: realFilteredHistory.length ? realFilteredHistory : realHistory,
      ogaRefScores: pastOGAScoresRef,
      ogaSpokeCount,
      trustCandidateOgaScores: knobs.enableOGA,
    });
  }

  function emitReadinessHardFilterTrace(label: string, result: ApplyReadinessHardFiltersResult): void {
    const rejectTotal = totalReadinessHardFilterRejects(result.rejects);
    if (readinessHardFiltersActive || rejectTotal > 0 || result.skipped.length > 0) {
      setTraceMaybe((traceLines) => [
        ...traceLines,
        `[TRACE] ${label}: Rdy component hard filters ${readinessHardFilterSummary}; rejected IDM:${result.rejects.idm} Conv:${result.rejects.conv} OGA:${result.rejects.oga}`,
        ...result.skipped.map((message) => `[TRACE] ${label}: ${message}`),
      ]);
    }
  }

  function meetsMonthlyConstraints(candidate: CandidateSet): boolean {
    if (!monthlyConstraintPayload) return true;
    const { constraints, buckets } = monthlyConstraintPayload;
    const nums = [...candidate.main, ...candidate.supp];
    let undrawn = 0, times1 = 0, times2 = 0, times3 = 0, times4 = 0, times5 = 0, times6 = 0, times7 = 0, times8 = 0;
    for (const n of nums) {
      if (buckets.undrawn.has(n)) undrawn += 1;
      if (buckets.times1.has(n)) times1 += 1;
      if (buckets.times2.has(n)) times2 += 1;
      if (buckets.times3.has(n)) times3 += 1;
      if (buckets.times4.has(n)) times4 += 1;
      if (buckets.times5.has(n)) times5 += 1;
      if (buckets.times6.has(n)) times6 += 1;
      if (buckets.times7.has(n)) times7 += 1;
      if (buckets.times8.has(n)) times8 += 1;
    }
    return (
      undrawn >= constraints.undrawn &&
      times1 >= constraints.times1 &&
      times2 >= constraints.times2 &&
      times3 >= constraints.times3 &&
      times4 >= constraints.times4 &&
      times5 >= constraints.times5 &&
      times6 >= constraints.times6 &&
      times7 >= constraints.times7 &&
      times8 >= constraints.times8
    );
  }

  function meetsAcceptanceNeeds(candidate: CandidateSet): boolean {
    if (!acceptanceNeedsEnabled) return true;
    const buckets = monthlyBucketSetsAlways ?? monthlyConstraintPayload?.buckets ?? null;
    if (!buckets) return true; // no bucket data available — skip filter
    const nums = [...candidate.main, ...candidate.supp];
    const counts = { undrawn: 0, times1: 0, times2: 0, times3: 0, times4: 0, times5: 0, times6: 0, times7: 0, times8: 0 };
    for (const n of nums) {
      if (buckets.undrawn.has(n)) counts.undrawn += 1;
      if (buckets.times1.has(n)) counts.times1 += 1;
      if (buckets.times2.has(n)) counts.times2 += 1;
      if (buckets.times3.has(n)) counts.times3 += 1;
      if (buckets.times4.has(n)) counts.times4 += 1;
      if (buckets.times5.has(n)) counts.times5 += 1;
      if (buckets.times6.has(n)) counts.times6 += 1;
      if (buckets.times7.has(n)) counts.times7 += 1;
      if (buckets.times8.has(n)) counts.times8 += 1;
    }
    return (
      counts.undrawn >= effectiveMianCounts.undrawn &&
      counts.times1 >= effectiveMianCounts.times1 &&
      counts.times2 >= effectiveMianCounts.times2 &&
      counts.times3 >= effectiveMianCounts.times3 &&
      counts.times4 >= effectiveMianCounts.times4 &&
      counts.times5 >= effectiveMianCounts.times5 &&
      counts.times6 >= effectiveMianCounts.times6 &&
      counts.times7 >= effectiveMianCounts.times7 &&
      counts.times8 >= effectiveMianCounts.times8
    );
  }

  /** Compute hard-exclusion numbers for MiAN: numbers in buckets where required count is 0 */
  function getMianHardExclusions(): number[] {
    if (!acceptanceNeedsEnabled || !acceptanceNeedsHardExclude) return [];
    const buckets = monthlyBucketSetsAlways ?? monthlyConstraintPayload?.buckets ?? null;
    if (!buckets) return [];
    const excluded: number[] = [];
    const bucketKeys: (keyof typeof buckets)[] = ['undrawn', 'times1', 'times2', 'times3', 'times4', 'times5', 'times6', 'times7', 'times8'];
    const countKeys: (keyof MonthlyFrequencyConstraints)[] = ['undrawn', 'times1', 'times2', 'times3', 'times4', 'times5', 'times6', 'times7', 'times8'];
    for (let i = 0; i < bucketKeys.length; i++) {
      if (effectiveMianCounts[countKeys[i]] === 0) {
        for (const n of buckets[bucketKeys[i]]) excluded.push(n);
      }
    }
    return excluded;
  }

  function buildLatestNeighbourStageMatchCompatibilityLine(excludedForRun: readonly number[]): string | null {
    if (!latestNeighbourSupportEnabled) return null;
    const hasMonthlyDrawSummaryCounts = !!monthlyConstraintPayload;
    const hasMianCounts = acceptanceNeedsEnabled;
    if (!hasMonthlyDrawSummaryCounts && !hasMianCounts) return null;

    const counts = maxMonthlyFrequencyConstraints(
      monthlyConstraintPayload?.constraints,
      hasMianCounts ? effectiveMianCounts : null,
    );
    const countSourceLabel = [
      hasMonthlyDrawSummaryCounts
        ? monthlyConstructiveEnabled
          ? "Stage-Match constructive + Monthly Draws Summary post-filter counts"
          : "Monthly Draws Summary post-filter counts"
        : null,
      hasMianCounts ? "MiAN post-filter counts" : null,
    ].filter(Boolean).join(" + ");
    const analysisBuckets = monthlyConstructiveEnabled && monthlyConstraintPayload
      ? monthlyConstraintPayload!.buckets
      : monthlyBucketSetsAlways ?? monthlyConstraintPayload?.buckets ?? dgaLiveMonthlyBuckets;
    const compatibilityBuckets = monthlyConstraintPayload?.buckets
      ?? (hasMianCounts ? monthlyBucketSetsAlways ?? null : null);

    return buildLatestNeighbourStageMatchCompatibilityTrace({
      enabled: latestNeighbourSupportEnabled,
      history: realFilteredHistory,
      analysisBuckets,
      compatibilityBuckets,
      counts,
      countSourceLabel,
      excludedNumbers: excludedForRun,
      planningLastDrawOverride: planningDrawContext.isPlanningLastDraw,
      terminalRuleActive: {
        0: hasActiveTerminalCoordinationRuleForTrace(mainDigitGenerationOptions.main0),
        5: hasActiveTerminalCoordinationRuleForTrace(mainDigitGenerationOptions.main5),
      },
    }).traceLine;
  }

  const buildMonthlyTrace = () => {
    if (!monthlyConstraintPayload) return null;
    const { buckets, constraints } = monthlyConstraintPayload;
    const sizes = {
      undrawn: buckets.undrawn.size,
      times1: buckets.times1.size,
      times2: buckets.times2.size,
      times3: buckets.times3.size,
      times4: buckets.times4.size,
      times5: buckets.times5.size,
      times6: buckets.times6.size,
      times7: buckets.times7.size,
      times8: buckets.times8.size,
    };
    const req = constraints;
    return `Monthly buckets — sizes und:${sizes.undrawn} 1x:${sizes.times1} 2x:${sizes.times2} 3x:${sizes.times3} 4x:${sizes.times4} 5x:${sizes.times5} 6x:${sizes.times6} 7x:${sizes.times7} 8x+:${sizes.times8}; required ≥ und:${req.undrawn} 1x:${req.times1} 2x:${req.times2} 3x:${req.times3} 4x:${req.times4} 5x:${req.times5} 6x:${req.times6} 7x:${req.times7} 8x+:${req.times8}`;
  };

  function buildGenerationActiveSetupTraceLines(options: {
    label: string;
    mode: "standard" | "rwr45" | "batch";
    requested: number;
    poolSize?: number;
    overgen?: number;
    attemptBudget?: number;
    emitFullSnapshot?: boolean;
  }): string[] {
    const modeLabel = options.mode === "rwr45"
      ? "RwR45 / PNUaRW45"
      : options.mode === "batch"
        ? "batch"
        : "standard";
    const requestParts = [
      `mode ${modeLabel}`,
      `requested ${options.requested}`,
      options.poolSize !== undefined ? `pool ${options.poolSize}` : null,
      options.overgen !== undefined ? `overgen ${options.overgen}x` : null,
      options.attemptBudget !== undefined ? `budget ${options.attemptBudget}` : null,
    ].filter(Boolean).join(" · ");
    const ratioSummaryForTrace = selectedRatios.length
      ? selectedRatios.map((ratio) => {
        const option = ratioOptions.find((row) => row.ratio === ratio);
        return option ? `${ratio} ${option.percent}%` : ratio;
      }).join(", ")
      : "off";
    const survivorSignalsForTrace = [
      knobs.enableOGA && rankingWeights.oga > 0 ? `OGA ${rankingWeights.oga}` : null,
      rankingWeights.selHitsEnabled && rankingWeights.sel > 0 ? `SelHits ${rankingWeights.sel}` : null,
      rankingWeights.recentHitsEnabled && rankingWeights.recent > 0 ? `RecentHits ${rankingWeights.recent}` : null,
      monthEndCarryOverBiasEnabled ? `carry-over ${monthEndCarryOverStrengthSettings.label}` : null,
      activeScoringGenerationProfile ? `Numbers diagnostic ${formatScoringInfluenceLabel(scoringGenerationInfluence)}` : null,
    ].filter(Boolean).join(", ") || "none";
    const hardFilterSummaryForTrace = [
      entropyEnabled ? `Entropy>=${entropyThreshold}` : null,
      hammingEnabled ? `Hamming>=${hammingThreshold}` : null,
      jaccardEnabled ? `Jaccard<=${Math.round(jaccardThreshold * 100)}%` : null,
      readinessHardFiltersActive ? `Rdy ${readinessHardFilterSummary}` : null,
      sumFilter.enabled ? `Sum ${sumFilter.min}-${sumFilter.max}${sumFilter.includeSupp ? "+supp" : ""}` : null,
      maxLastDrawMatchesEnabled ? `last-draw max ${maxLastDrawMatchesValue}` : null,
      minRecentMatches > 0 ? `last-draw min ${minRecentMatches}` : null,
      repeatUnionEnabled ? `repeat pool ${repeatUnionSummary}` : null,
    ].filter(Boolean).join(", ") || "none";
    const weightingSummaryForTrace = [
      lambdaEnabled ? `lambda ${lambda.toFixed(2)}` : "lambda off",
      gpwfEnabled ? "GPWF on" : "GPWF off",
      selectedBoostEnabled ? `selected boost x${selectedBoostFactor}` : "selected boost off",
      recentMatchBias > 0 ? `last-draw bias ${recentMatchBias}` : "last-draw bias off",
      d1TerminalMomentumSgiEnabled ? `D1 SGI ${formatD1TerminalMomentumStrength(d1TerminalMomentumGenerationProfile.internalStrength)}` : "D1 SGI off",
      activeMainDigitBoostSummary ? `ending boosts ${activeMainDigitBoostSummary}` : null,
      activeMainDecadeBiasSummary ? `decade bias ${activeMainDecadeBiasSummary}` : null,
      digitWidthConstraintTargets.enabled ? `digit-width ${digitWidthConstraintTargets.singleDigitPercent}/${digitWidthConstraintTargets.twoDigitPercent}` : null,
      enableOGAForecastBias ? `OGA KDE ${ogaPreferredBand}@${ogaBaselineMode}` : null,
      mrbEnabled ? "MRB on" : null,
    ].filter(Boolean).join(" · ");
    const monthlySummaryForTrace = [
      monthlyConstraintPayload ? `Stage-Match ON` : "Stage-Match off",
      monthlyConstructiveEnabled ? "constructive fill ON" : "constructive fill off",
      acceptanceNeedsEnabled ? `MiAN ON ${formatMonthlyConstraintCountsForTrace(effectiveMianCounts)}${acceptanceNeedsHardExclude ? " hard-exclude" : ""}` : "MiAN off",
    ].join(" · ");
    const forcedAndExcludedSummary = [
      `forced ${generationForcedNumbers.length} [${formatTraceNumberPreview(generationForcedNumbers)}]`,
      `excluded ${allExclusions.length} [${formatTraceNumberPreview(allExclusions)}]`,
      knobs.enableSDE1 ? `SDE1 ${sde1Exclusions.length}` : "SDE1 off",
      knobs.enableHC3 ? `HC3 ${hc3Exclusions.length}` : "HC3 off",
      autoExcludeUnselected ? `exclude-unselected ON (${autoExcludedFromSelection.length})` : "exclude-unselected off",
    ].join(" · ");

    const lines = [
      `[TRACE] ${options.label} active setup · ${requestParts} · WFMQYH real ${realFilteredHistory.length}/${filteredHistory.length} · all real ${realHistory.length} · latest ${mostRecentDrawDateLabel}`,
      `[TRACE] ${options.label} active filters · hard ${hardFilterSummaryForTrace} · odd/even ${useTrickyRule ? "Tricky ON; ratio choices ignored" : ratioSummaryForTrace} · trend ${allowedTrendRatios.length ? allowedTrendRatios.join(", ") : "off"}`,
      `[TRACE] ${options.label} active recency · LD±1 ${latestNeighbourSupportEnabled ? "ON" : "off"} · latest ±1/±2 forced ${previousNeighbourConstraintNumbers.length ? previousNeighbourConstraintNumbers.join(", ") : "off"} · strict drought ${strictDroughtQuotaSummary}`,
      `[TRACE] ${options.label} active weighting · ${weightingSummaryForTrace} · survivor ranking ${survivorSignalsForTrace}`,
      `[TRACE] ${options.label} active monthly/provenance · ${monthlySummaryForTrace} · ${forcedAndExcludedSummary}`,
    ];

	    if (options.emitFullSnapshot) {
	      lines.push(`[TRACE] ${options.label} active setup detail · user selected ${userSelectedNumbers.length} [${formatTraceNumberPreview(userSelectedNumbers)}] · manual exclusions ${excludedNumbers.length} [${formatTraceNumberPreview(excludedNumbers)}] · hot/cold exclusions ${hotColdExcludedNumbers.length} [${formatTraceNumberPreview(hotColdExcludedNumbers)}]`);
	    }
	    if (repeatUnionMonthlyCompatibilityTrace) {
	      lines.push(`[TRACE] ${repeatUnionMonthlyCompatibilityTrace}`);
	    }

	    return lines;
	  }

  useEffect(() => {
    setCandidates(prev => {
      // Clear stale cached OGA values so recomputeCompositeRanking recomputes them
      const cleared = prev.map(c => ({ ...c, ogaScore: undefined, ogaPercentile: undefined }));
      return recomputeCompositeRanking(cleared);
    });
  }, [rankingWeights, userSelectedNumbers, realFilteredHistory, stableOGAScores, ogaSpokeCount, monthEndCarryOverBiasEnabled, monthEndCarryOverWeightsForGeneration, monthEndCarryOverStrengthSettings.rankingWeight]);

  function withinSumRange(candidate: CandidateSet): boolean {
    // Hook for sum filter if you enable it later
    return true;
  }

  const captureGenerationSessionCandidates = useCallback((nextCandidates: CandidateSet[]): CandidateSet[] => {
    if (!generationSessionActive) return nextCandidates;

    const existingKeys = buildGenerationSessionMainKeySet(generationSessionRows);
    const sessionResult = filterCandidatesForGenerationSession(nextCandidates, existingKeys);
    const capturedRows: KeptGeneratedCandidateRow[] = [];

    sessionResult.candidates.forEach((candidate, index) => {
      generationSessionSequenceRef.current += 1;
      const row = buildKeptGeneratedCandidateRow(
        candidate,
        generationSessionRows.length + index,
        `generation-session-${Date.now()}-${generationSessionSequenceRef.current}`,
      );
      if (row) capturedRows.push(row);
    });

    if (capturedRows.length > 0) {
      setGenerationSessionRows((current) => [...current, ...capturedRows]);
    }

    setTraceMaybe((traceLines) => [
      ...traceLines,
      `[TRACE] Generation session active: captured ${capturedRows.length} mains-unique candidate${capturedRows.length === 1 ? "" : "s"}; rejected duplicates ${sessionResult.duplicateRejects}; rejected invalid rows ${sessionResult.invalidRejects}; ledger now ${generationSessionRows.length + capturedRows.length}.`,
    ]);

    return sessionResult.candidates;
  }, [
    buildKeptGeneratedCandidateRow,
    generationSessionActive,
    generationSessionRows,
    setTraceMaybe,
  ]);

  const buildAutoExcludeUnselectedTraceLine = useCallback((label: string): string | null => {
    if (!autoExcludeUnselected) return null;
    const eligible = normalizedUserSelectedNumbersForGeneration;
    const insufficient = eligible.length < FULL_GENERATED_CANDIDATE_NUMBER_COUNT
      ? ` Warning: ${USER_SELECTION_GENERATION_BLOCK_MESSAGE}`
      : "";
    return `[TRACE] ${label}: Exclude unselected ON - eligible selected numbers=${eligible.length}${eligible.length ? ` [${eligible.join(", ")}]` : ""}; auto-excluded ${autoExcludedFromSelection.length} unselected numbers.${insufficient}`;
  }, [autoExcludeUnselected, autoExcludedFromSelection.length, normalizedUserSelectedNumbersForGeneration]);

  const buildAutoExcludeUnselectedBlockMessage = useCallback((): string | null => {
    if (!autoExcludeUnselected) return null;
    return normalizedUserSelectedNumbersForGeneration.length < FULL_GENERATED_CANDIDATE_NUMBER_COUNT
      ? USER_SELECTION_GENERATION_BLOCK_MESSAGE
      : null;
  }, [autoExcludeUnselected, normalizedUserSelectedNumbersForGeneration.length]);

  const handleGenerate = () => {
    generationStopRequestedRef.current = false;
    setIsGenerating(true);
    setTrace([]);

    const autoExcludeBlockMessage = buildAutoExcludeUnselectedBlockMessage();
    if (autoExcludeBlockMessage) {
      const autoExcludeTrace = buildAutoExcludeUnselectedTraceLine("Generation pre-flight");
      setCandidates([]);
      setRatioSummary(summarizeOddEvenRatios([], rwr45Enabled ? RWR45_CANDIDATE_COUNT : numCandidates, 0));
      setQuotaWarning(autoExcludeBlockMessage);
      setSelectedCandidateIdx(0);
      setTrace([
        ...buildGenerationActiveSetupTraceLines({
          label: "Generation pre-flight",
          mode: rwr45Enabled ? "rwr45" : "standard",
          requested: rwr45Enabled ? RWR45_CANDIDATE_COUNT : numCandidates,
          emitFullSnapshot: true,
        }),
        `[TRACE] ${autoExcludeBlockMessage}`,
        ...(autoExcludeTrace ? [autoExcludeTrace] : []),
      ]);
      generationStopRequestedRef.current = false;
      setIsGenerating(false);
      return;
    }

    if (rwr45Enabled) {
      const t0 = performance.now();
      const rwr45MianExcl = getMianHardExclusions();
      const rwr45ExcludedNumbers = Array.from(new Set([...allExclusions, ...rwr45MianExcl])).sort((a, b) => a - b);
      setTraceMaybe((t) => [
        ...t,
        ...buildGenerationActiveSetupTraceLines({
          label: "Generation pre-flight",
          mode: "rwr45",
          requested: RWR45_CANDIDATE_COUNT,
          emitFullSnapshot: true,
        }),
      ]);
      const autoExcludeTrace = buildAutoExcludeUnselectedTraceLine("RwR45 / PNUaRW45");
      if (autoExcludeTrace) {
        setTraceMaybe((t) => [...t, autoExcludeTrace]);
      }
      if (rwr45MianExcl.length > 0) {
        setTraceMaybe((t) => [...t, `[TRACE] MiAN hard-exclude applied to RwR45: removed ${rwr45MianExcl.length} numbers from zero-count buckets`]);
      }
      if (generationForcedNumbers.length > 0) {
        setTraceMaybe((t) => [...t,
          `[TRACE] RwR45 forced generation numbers active: ${generationForcedNumbers.join(", ")} (trend selections ${trendSelectedNumbers.length}; latest ±1/±2 targets ${previousNeighbourConstraintNumbers.length}; hot/cold row selections ${hotColdForcedNumbers.length}; drought-break selections ${droughtBreakSelectedNumbers.length}; paste-weighted missing selections ${pasteWeightedForcedNumbers.length})`
        ]);
      }
      if (latestNeighbourSupportEnabled) {
        setTraceMaybe((t) => [...t, "[TRACE] LD±1 is ON but RwR45/PNUaRW45 bypasses evidence filters; LD±1 was not applied to this random-coverage run."]);
      }
      if (strictDroughtQuotaMode !== "off") {
        setTraceMaybe((t) => [...t, "[TRACE] Strict drought quota is ON but RwR45/PNUaRW45 bypasses evidence quotas; strict drought quota was not applied to this random-coverage run."]);
      }
      if (d1TerminalMomentumSgiEnabled) {
        setTraceMaybe((t) => [...t, "[TRACE] D1 Terminal Momentum SGI is ON but RwR45/PNUaRW45 bypasses evidence weighting; D1 SGI was not applied to this random-coverage run."]);
      }
      const result = generateRwR45Candidates(Math.random, {
        forcedNumbers: generationForcedNumbers,
        excludedNumbers: rwr45ExcludedNumbers,
        debug: traceVerbose,
        monthlyAcceptanceNeeds: monthlyConstructiveEnabled && monthlyConstraintPayload
          ? {
            constraints: monthlyConstraintPayload.constraints,
            buckets: monthlyConstraintPayload.buckets,
          }
          : undefined,
      });
      let processedCandidates = recomputeCompositeRanking(annotateCandidatesWithPreviousNeighbourShape(
        [...result.candidates],
        previousNeighbourLatestDraw,
        "mains-plus-supps",
      ));
      const readinessFilterResult = applyConfiguredReadinessHardFilters(processedCandidates);
      processedCandidates = readinessFilterResult.candidates;
      const dt = Math.round(performance.now() - t0);
      processedCandidates = captureGenerationSessionCandidates(processedCandidates);

      setCandidates(processedCandidates);
      setRatioSummary(summarizeOddEvenRatios(
        processedCandidates,
        RWR45_CANDIDATE_COUNT,
        RWR45_CANDIDATE_COUNT,
      ));
      setQuotaWarning(undefined);
      setSelectedCandidateIdx(0);
      setTraceMaybe((t) => [
        ...t,
        ...result.traceLines,
        ...(readinessHardFiltersActive || totalReadinessHardFilterRejects(readinessFilterResult.rejects) > 0 || readinessFilterResult.skipped.length > 0
          ? [
            `[TRACE] RwR45 / PNUaRW45: Rdy component hard filters ${readinessHardFilterSummary}; rejected IDM:${readinessFilterResult.rejects.idm} Conv:${readinessFilterResult.rejects.conv} OGA:${readinessFilterResult.rejects.oga}`,
            ...readinessFilterResult.skipped.map((message) => `[TRACE] RwR45 / PNUaRW45: ${message}`),
          ]
          : []),
        `[TRACE] RwR45 / PNUaRW45 completed: displayed ${processedCandidates.length} candidates in ${dt}ms.`,
      ]);
      setIsGenerating(false);
      return;
    }

    const entropyThresholdEff = entropyEnabled ? entropyThreshold : 0;
    const hammingThresholdEff = hammingEnabled ? hammingThreshold : 0;
    const jaccardThresholdEff = jaccardEnabled ? jaccardThreshold : 1;

    const effectiveKnobsForGen: Knobs = {
      ...knobs,
      enableEntropy: entropyEnabled,
      enableHamming: hammingEnabled,
      enableJaccard: jaccardEnabled,
      enableGPWF: gpwfEnabled,
      lambda: lambdaEnabled ? lambda : 0.0,
    };

    // OGA forecast bands (KDE) based on selected baseline
    const baselineForOGAForecast = ogaBaselineMode === "window" ? realFilteredHistory : realHistory;
    const ogaStats = forecastOGA(realFilteredHistory, baselineForOGAForecast, ogaSpokeCount);
    const monthEndCarryOverWeights = monthEndCarryOverBiasEnabled ? monthEndCarryOverWeightsForGeneration : undefined;
    const latestNeighbourMonthlyBuckets = monthlyBucketSetsAlways ?? monthlyConstraintPayload?.buckets ?? dgaLiveMonthlyBuckets;
    const monthlyBucketOptions = monthlyConstructiveEnabled && monthlyConstraintPayload ? {
      constraints: monthlyConstraintPayload.constraints,
      buckets: monthlyConstraintPayload.buckets,
      allowShortfall: true,
      boostPenalize: monthlyConstraintPayload.boostPenalize ?? false,
    } : latestNeighbourSupportEnabled ? {
      constraints: zeroMonthlyFrequencyConstraints(),
      buckets: latestNeighbourMonthlyBuckets,
      allowShortfall: true,
      boostPenalize: false,
    } : undefined;

    // Over-generate: request a larger pool so post-generation filters (MiAN, monthly, prize, OGA)
    // have more candidates to work with. Controlled by user-configurable overgenFactor.
    const poolSize = numCandidates * Math.max(1, overgenFactor);
    setTraceMaybe((t) => [
      ...t,
      ...buildGenerationActiveSetupTraceLines({
        label: "Generation pre-flight",
        mode: "standard",
        requested: numCandidates,
        poolSize,
        overgen: overgenFactor,
        attemptBudget: poolSize * attemptMultiplier,
        emitFullSnapshot: true,
      }),
    ]);

    // MiAN hard exclusions: exclude numbers from zero-count MiAN buckets
    const mianExcl = getMianHardExclusions();
    const excludedWithMiAN = mianExcl.length > 0
      ? Array.from(new Set([...generationExcludedNumbers, ...mianExcl]))
      : generationExcludedNumbers;
    if (mianExcl.length > 0) {
      setTraceMaybe((t) => [...t, `[TRACE] MiAN hard-exclude: removed ${mianExcl.length} numbers from zero-count buckets`]);
    }
    if (mainConstraintAutoExclusions.shouldApply && mainConstraintAutoExclusions.excludedNumbers.length > 0) {
      setTraceMaybe((t) => [...t,
        `[TRACE] Generation bucket auto-exclude: enabled maxima sum=${mainConstraintAutoExclusions.totalSelectedMax} (>8); excluded ${mainConstraintAutoExclusions.excludedNumbers.length} numbers from zero/off buckets${mainConstraintAutoExcludedLabel ? ` [${mainConstraintAutoExcludedLabel}]` : ""}`
      ]);
    }
    if (activeMainDigitBoostSummary) {
      setTraceMaybe((t) => [...t, `[TRACE] Ending-digit boosts active: ${activeMainDigitBoostSummary} (split 1-digit / 2-digit boosts; applies even when Max is Off; affects main + supp picks)`]);
    }
    if (activeMainDecadeBiasSummary) {
      setTraceMaybe((t) => [...t, `[TRACE] Digit decade bias active: ${activeMainDecadeBiasSummary} (positive = boost, negative = punish; affects main + supp picks)`]);
    }
    if (digitWidthConstraintTargets.enabled) {
      setTraceMaybe((t) => [...t,
        `[TRACE] Digit-width share active: ${digitWidthConstraintTargets.singleDigitPercent}% single-digit / ${digitWidthConstraintTargets.twoDigitPercent}% two-digit | ${formatDigitWidthScopeLabel(digitWidthConstraintTargets.scope)} | strict target ${digitWidthConstraintTargets.singleDigitCount} single-digit + ${digitWidthConstraintTargets.twoDigitCount} two-digit`
      ]);
    }
    if (allowedTrendRatios.length > 0) {
      setTraceMaybe((t) => [...t,
        `[TRACE] Trend ratio filter active: ${allowedTrendRatios.join(", ")} (trend-ratio filter active; U/D/F over mains + supps; lookback=${trendLookback}; threshold=${trendThreshold}; historical coverage=${trendRatioCoveragePercent.toFixed(2)}%)`
      ]);
    }
    if (monthEndCarryOverBiasEnabled) {
      setTraceMaybe((t) => [...t,
        `[TRACE] Month-end carry-over bias active: ${monthEndCarryOverStrengthSettings.label} strength; ${monthEndCarryOverWeighting.targetMonthLabel} (${monthEndCarryOverWeighting.drawsSoFarThisMonth} draw${monthEndCarryOverWeighting.drawsSoFarThisMonth === 1 ? "" : "s"} so far) ← ${monthEndCarryOverWeighting.sourceMonthLabel ?? "no previous month"}; sources undrawn=${monthEndCarryOverIncludeMonthEndUndrawn ? "on" : "off"} boundary=${monthEndCarryOverIncludeBoundaryRepeats ? "on" : "off"}; active pool ${monthEndCarryOverWeighting.activeNumbers.length}${monthEndCarryOverPoolBreakdown ? ` (${monthEndCarryOverPoolBreakdown})` : ""}${selectedCarryOverBoostSummary ? ` | selected boost ${selectedCarryOverBoostSummary} ×${selectedCarryOverBoostFactor}` : ""}${monthEndCarryOverTopWeightSummary ? ` | active weights ${monthEndCarryOverTopWeightSummary}` : ""}`
      ]);
    }
    if (generationForcedNumbers.length > 0) {
      setTraceMaybe((t) => [...t,
        `[TRACE] Forced generation numbers active: ${generationForcedNumbers.join(", ")} (trend selections ${trendSelectedNumbers.length}; latest ±1/±2 targets ${previousNeighbourConstraintNumbers.length}; hot/cold row selections ${hotColdForcedNumbers.length}; drought-break selections ${droughtBreakSelectedNumbers.length}; paste-weighted missing selections ${pasteWeightedForcedNumbers.length})`
      ]);
    }
    const autoExcludeTrace = buildAutoExcludeUnselectedTraceLine("Generation");
    if (autoExcludeTrace) {
      setTraceMaybe((t) => [...t, autoExcludeTrace]);
    }
    const strictDroughtTrace = strictDroughtQuotaTraceLine("Generation");
    if (strictDroughtTrace) {
      setTraceMaybe((t) => [...t, strictDroughtTrace]);
    }
    const latestNeighbourStageMatchTrace = buildLatestNeighbourStageMatchCompatibilityLine(
      Array.from(new Set([...excludedWithMiAN, ...sde1Exclusions, ...hc3Exclusions])).sort((a, b) => a - b),
    );
    if (latestNeighbourStageMatchTrace) {
      setTraceMaybe((t) => [...t, latestNeighbourStageMatchTrace]);
    }

    const t0 = performance.now();

    // Build worker-serializable args
    const workerArgs: GenerateWorkerArgs = {
      num: poolSize,
      history: realFilteredHistory,
      knobs: effectiveKnobsForGen,
      excludedNumbers: excludedWithMiAN,
      selectedOddEvenRatios: selectedRatios,
      useTrickyRule,
      minOGAPercentile: 0,
      pastOGAScores: stableOGAScores as any,
      forcedNumbers: generationForcedNumbers,
      selectedNumbersForBoost: userSelectedNumbers,
      selectedBoostOptions: { enabled: selectedBoostEnabled, factor: selectedBoostFactor },
      entropyThreshold: entropyThresholdEff,
      hammingThreshold: hammingThresholdEff,
      jaccardThreshold: jaccardThresholdEff,
      lambda: lambdaEnabled ? lambda : 0.0,
      ratioOptions,
      minRecentMatches,
      recentMatchBias,
      repeatWindowSizeW,
      minFromRecentUnionM,
      trendMapEntries: allowedTrendRatios.length ? serializeTrendMap(activeTrendMap) : undefined,
      allowedTrendRatios: allowedTrendRatios.length ? allowedTrendRatios : undefined,
      sumFilter: { enabled: false, min: 0, max: 0, includeSupp: true },
      patternOptions: {
        constraints: selectedWindowPatterns,
        mode: patternConstraintMode,
        boostFactor: patternBoostFactor,
        sumTolerance: patternSumTolerance,
      },
      ogaBiasOptions: {
        enabled: enableOGAForecastBias,
        preferredBand: ogaPreferredBand,
        bands: ogaStats.bands,
        deciles: ogaStats.deciles,
        preferredDeciles: ogaPreferredDeciles,
      },
      mainZeroOptions: mainDigitGenerationOptions.main0,
      mainFiveOptions: mainDigitGenerationOptions.main5,
      mainOneOptions: mainDigitGenerationOptions.main1,
      mainTwoOptions: mainDigitGenerationOptions.main2,
      mainThreeOptions: mainDigitGenerationOptions.main3,
      mainFourOptions: mainDigitGenerationOptions.main4,
      mainSixOptions: mainDigitGenerationOptions.main6,
      mainSevenOptions: mainDigitGenerationOptions.main7,
      mainEightOptions: mainDigitGenerationOptions.main8,
      mainNineOptions: mainDigitGenerationOptions.main9,
      mainDecadeBiases: mainDecadeGenerationBiases,
      digitWidthConstraint: {
        enabled: digitWidthConstraintTargets.enabled,
        singleDigitPercent: digitWidthConstraintTargets.singleDigitPercent,
        scope: digitWidthConstraintTargets.scope,
      },
      monthlyBucketOptions: serializeMonthlyBuckets(monthlyBucketOptions),
      attemptMultiplier,
      ogaSpokeCount,
      maxLastDrawMatches: maxLastDrawMatchesEnabled ? maxLastDrawMatchesValue : undefined,
      monthlyRepeatBiasWeights: monthlyRepeatBiasResult?.weights,
      monthEndCarryOverWeights,
      scoringGenerationProfile: activeScoringGenerationProfile,
      d1TerminalMomentumProfile: d1TerminalMomentumGenerationProfile,
      latestNeighbourSupportOptions: {
        enabled: latestNeighbourSupportEnabled,
        planningLastDrawOverride: planningDrawContext.isPlanningLastDraw,
      },
      strictDroughtQuotaOptions: strictDroughtQuotaGenerationOptions,
    };

    // Trace callback: appends messages as they arrive from the worker
    const onTrace = (msg: string) => setTraceMaybe((t) => [...t, msg]);

    // MRB trace
    if (mrbEnabled && monthlyRepeatBiasResult) {
      const usedBudget = MRB_BUCKET_KEYS.reduce((s, k) => s + Math.max(0, (mrbBucketBoosts[k] ?? 1) - 1), 0);
      const activeEntries = MRB_BUCKET_KEYS
        .filter((k) => (mrbBucketBoosts[k] ?? 1) > 1 && monthlyRepeatBiasResult.bucketNums[k].length > 0)
        .map((k) => `${MRB_BUCKET_LABELS[k]}(n=${monthlyRepeatBiasResult.bucketNums[k].length})×${mrbBucketBoosts[k].toFixed(1)}`)
        .join(" ");
      setTraceMaybe((t) => [...t,
        `[TRACE] MRB active: budget ${usedBudget.toFixed(1)}/${MRB_BUDGET} | supp:${mrbIncludeSupp ? "ON" : "OFF"} | draws-this-month:${monthlyRepeatBiasResult.drawsSoFarThisMonth} | ${activeEntries || "no active boosts"}`
      ]);
    }

    // Result callback: post-processing on main thread (fast)
    const onResult = (result: import("./generateCandidates").GenerateCandidatesResult) => {
      const stoppedByUser = generationStopRequestedRef.current;
      const monthlyTrace = buildMonthlyTrace();
      setTraceMaybe((t) => [
        ...t,
        `[TRACE] Monthly acceptance toggle: ${monthlyConstraintPayload ? "ON" : "OFF"} (constructive fill: ${monthlyConstructiveEnabled ? "ON" : "OFF"})`,
      ]);
      if (monthlyTrace) {
        setTraceMaybe((t) => [...t, `[TRACE] ${monthlyTrace}`]);
      }

      let processedCandidates = annotateCandidatesWithPreviousNeighbourShape(
        [...result.candidates],
        previousNeighbourLatestDraw,
        "mains-plus-supps",
      );
      let monthlyRejects = 0;
      if (monthlyConstraintPayload) {
        processedCandidates = processedCandidates.filter((c) => {
          const ok = meetsMonthlyConstraints(c);
          if (!ok) monthlyRejects += 1;
          return ok;
        });
      }
      let acceptanceNeedsRejects = 0;
      const mianBuckets = monthlyBucketSetsAlways ?? monthlyConstraintPayload?.buckets ?? null;
      if (acceptanceNeedsEnabled) {
        if (!mianBuckets) {
          setTraceMaybe((t) => [...t, `[TRACE] ⚠️ MiAN enabled but no monthly bucket data available — filter skipped. Open Monthly Draws Summary panel to populate bucket data.`]);
        } else {
          const beforeMiAN = processedCandidates.length;
          processedCandidates = processedCandidates.filter((c) => {
            const ok = meetsAcceptanceNeeds(c);
            if (!ok) acceptanceNeedsRejects += 1;
            return ok;
          });
          const ac = effectiveMianCounts;
          const mianTotal = ac.undrawn + ac.times1 + ac.times2 + ac.times3 + ac.times4 + ac.times5 + ac.times6 + ac.times7 + ac.times8;
          if (mianTotal > 8) {
            setTraceMaybe((t) => [...t, `[TRACE] ⚠️ MiAN impossible: requirements sum to ${mianTotal} but a candidate only has 8 main numbers — reduce counts so they total ≤ 8`]);
          }
          setTraceMaybe((t) => [...t, `[TRACE] MiAN required: 0x≥${ac.undrawn} 1x≥${ac.times1} 2x≥${ac.times2} 3x≥${ac.times3} 4x≥${ac.times4} 5x≥${ac.times5} 6x≥${ac.times6} 7x≥${ac.times7} 8x+≥${ac.times8} | rejected ${acceptanceNeedsRejects} of ${beforeMiAN} candidates${acceptanceNeedsHardExclude ? " (hard-exclude ON)" : ""}`]);
        }
      }
      // Score candidates (OGA, selHits, composite) but WITHOUT prize-based sorting.
      // Prize ranking must not influence which candidates survive the pool slice,
      // otherwise Manual Prize Check numbers would change the final candidate set.
      processedCandidates = recomputeCompositeRanking(processedCandidates);
      const readinessFilterResult = applyConfiguredReadinessHardFilters(processedCandidates);
      processedCandidates = readinessFilterResult.candidates;
      emitReadinessHardFilterTrace("Generation", readinessFilterResult);
      const prizeRejects = 0;
      let capRejects = 0;
      if (knobs.enableOGA && typeof knobs.octagonal_top === "number" && processedCandidates.length > 0) {
        const cap = Math.max(1, Math.floor(knobs.octagonal_top));
        const before = processedCandidates.length;
        processedCandidates = applyOctagonalPostProcess(
          processedCandidates,
          realFilteredHistory.length ? realFilteredHistory : realHistory,
          cap,
          ogaSpokeCount
        );
        capRejects = before - processedCandidates.length;
        processedCandidates = recomputeCompositeRanking(processedCandidates);
      }
      processedCandidates = processedCandidates.filter(withinSumRange);

      // Slice over-generated pool down to the requested count.
      // Sort by composite score ONLY (prize-agnostic) so Manual Prize Check
      // does not influence which candidates are kept.
      const poolBeforeSlice = processedCandidates.length;
      let finalRatioTargets = result.ratioSummary.targetRatios;
      let finalRatioQuotaWarning: string | undefined;
      if (processedCandidates.length > numCandidates) {
        processedCandidates.sort(compareFinalSurvivorCandidates);
        if (selectedRatios.length > 0) {
          const quotaResult = applyOddEvenRatioQuotas(processedCandidates, numCandidates, selectedRatios, ratioOptions);
          processedCandidates = quotaResult.candidates;
          finalRatioTargets = quotaResult.quotas;
          if (Object.keys(quotaResult.shortfalls).length > 0) {
            finalRatioQuotaWarning = `Final odd/even ratio quotas short by ${Object.entries(quotaResult.shortfalls).map(([ratio, missing]) => `${ratio}:${missing}`).join(", ")} after post-filters. Increase over-generation or loosen filters to preserve the selected percentage split.`;
          }
        } else {
          processedCandidates = processedCandidates.slice(0, numCandidates);
        }
      }

      // Now apply final ranking with prize labels for display
      processedCandidates = recomputeCompositeRanking(processedCandidates);
      processedCandidates = captureGenerationSessionCandidates(processedCandidates);
      const finalRatioSummary = summarizeOddEvenRatios(
        processedCandidates,
        numCandidates,
        result.ratioSummary.totalAttempts,
        finalRatioTargets
      );
      const finalQuotaWarning = [result.quotaWarning, finalRatioQuotaWarning].filter(Boolean).join(" ");

      setCandidates(processedCandidates);
      setRatioSummary(finalRatioSummary);
      setQuotaWarning(finalQuotaWarning || undefined);
      setSelectedCandidateIdx(0);

      const dt = Math.round(performance.now() - t0);
      const st = result.rejectionStats;
      setTraceMaybe((t) => [
        ...t,
        ...(stoppedByUser
          ? [`[TRACE] ⏹ Generation stopped by user: using latest accepted partial pool (${result.candidates.length}/${poolSize} generated before post-filters; attempts ${st.totalAttempts}).`]
          : []),
        ...formatGenerationTraceLines({
          label: stoppedByUser ? "Stopped generation" : "Generation",
          requested: numCandidates,
          poolSize,
          overgenFactor,
          filteredCount: poolBeforeSlice,
          kept: processedCandidates.length,
          budget: poolSize * attemptMultiplier,
          elapsedMs: dt,
          stats: st,
          monthlyRejects,
          prizeRejects,
          capRejects,
          readinessRejects: totalReadinessHardFilterRejects(readinessFilterResult.rejects),
        }),
        buildSurvivorSelectionTrace(
          stoppedByUser ? "Stopped generation" : "Generation",
          poolBeforeSlice,
          processedCandidates.length,
          numCandidates
        ),
      ]);

      generationStopRequestedRef.current = false;
      setIsGenerating(false);
    };

    const onError = (err: string) => {
      setTraceMaybe((t) => [...t, `[TRACE] ❌ Generation failed: ${err}`]);
      generationStopRequestedRef.current = false;
      setIsGenerating(false);
    };

    // Dispatch to Web Worker (or fallback to async main-thread)
    runGenerate(workerArgs, onTrace, onResult, onError);
  };

  const handleStopGenerate = () => {
    if (!isGenerating) return;
    generationStopRequestedRef.current = true;
    const stopped = cancelGenerate();
    if (!stopped.cancelled) return;
    if (!stopped.hadPartial) {
      setTraceMaybe((t) => [
        ...t,
        "[TRACE] ⏹ Generation stopped by user before any accepted partial candidates were available.",
      ]);
      generationStopRequestedRef.current = false;
      setIsGenerating(false);
    }
  };

  const runBatch = (target: number, traceLabel: string, options: { emitPreflight?: boolean } = {}) => {
    const emitPreflight = options.emitPreflight ?? true;
    const entropyThresholdEff = entropyEnabled ? entropyThreshold : 0;
    const hammingThresholdEff = hammingEnabled ? hammingThreshold : 0;
    const jaccardThresholdEff = jaccardEnabled ? jaccardThreshold : 1;

    const effectiveKnobsForGen: Knobs = {
      ...knobs,
      enableEntropy: entropyEnabled,
      enableHamming: hammingEnabled,
      enableJaccard: jaccardEnabled,
      enableGPWF: gpwfEnabled,
      lambda: lambdaEnabled ? lambda : 0.0,
    };

    const baselineForOGAForecast = ogaBaselineMode === "window" ? realFilteredHistory : realHistory;
    const ogaStats = forecastOGA(realFilteredHistory, baselineForOGAForecast, ogaSpokeCount);
    const monthEndCarryOverWeights = monthEndCarryOverBiasEnabled ? monthEndCarryOverWeightsForGeneration : undefined;
    const latestNeighbourMonthlyBuckets = monthlyBucketSetsAlways ?? monthlyConstraintPayload?.buckets ?? dgaLiveMonthlyBuckets;
    const monthlyBucketOptions = monthlyConstructiveEnabled && monthlyConstraintPayload ? {
      constraints: monthlyConstraintPayload.constraints,
      buckets: monthlyConstraintPayload.buckets,
      allowShortfall: true,
      boostPenalize: monthlyConstraintPayload.boostPenalize ?? false,
    } : latestNeighbourSupportEnabled ? {
      constraints: zeroMonthlyFrequencyConstraints(),
      buckets: latestNeighbourMonthlyBuckets,
      allowShortfall: true,
      boostPenalize: false,
    } : undefined;

    if (emitPreflight) {
      setTraceMaybe((t) => [
        ...t,
        ...buildGenerationActiveSetupTraceLines({
          label: `${traceLabel} pre-flight`,
          mode: "batch",
          requested: target,
          emitFullSnapshot: false,
        }),
      ]);
    }

    // MiAN hard exclusions for batch
    const mianExclBatch = getMianHardExclusions();
    const excludedWithMiANBatch = mianExclBatch.length > 0
      ? Array.from(new Set([...generationExcludedNumbers, ...mianExclBatch]))
      : generationExcludedNumbers;
    if (mianExclBatch.length > 0) {
      setTraceMaybe((t) => [...t, `[TRACE] MiAN hard-exclude: removed ${mianExclBatch.length} numbers from zero-count buckets`]);
    }
    if (mainConstraintAutoExclusions.shouldApply && mainConstraintAutoExclusions.excludedNumbers.length > 0) {
      setTraceMaybe((t) => [...t,
        `[TRACE] Generation bucket auto-exclude: enabled maxima sum=${mainConstraintAutoExclusions.totalSelectedMax} (>8); excluded ${mainConstraintAutoExclusions.excludedNumbers.length} numbers from zero/off buckets${mainConstraintAutoExcludedLabel ? ` [${mainConstraintAutoExcludedLabel}]` : ""}`
      ]);
    }
    if (activeMainDigitBoostSummary) {
      setTraceMaybe((t) => [...t, `[TRACE] Ending-digit boosts active: ${activeMainDigitBoostSummary} (split 1-digit / 2-digit boosts; applies even when Max is Off; affects main + supp picks)`]);
    }
    if (activeMainDecadeBiasSummary) {
      setTraceMaybe((t) => [...t, `[TRACE] Digit decade bias active: ${activeMainDecadeBiasSummary} (positive = boost, negative = punish; affects main + supp picks)`]);
    }
    if (digitWidthConstraintTargets.enabled) {
      setTraceMaybe((t) => [...t,
        `[TRACE] Digit-width share active: ${digitWidthConstraintTargets.singleDigitPercent}% single-digit / ${digitWidthConstraintTargets.twoDigitPercent}% two-digit | ${formatDigitWidthScopeLabel(digitWidthConstraintTargets.scope)} | strict target ${digitWidthConstraintTargets.singleDigitCount} single-digit + ${digitWidthConstraintTargets.twoDigitCount} two-digit`
      ]);
    }
    if (allowedTrendRatios.length > 0) {
      setTraceMaybe((t) => [...t,
        `[TRACE] ${traceLabel}: Trend ratio filter active: ${allowedTrendRatios.join(", ")} (trend-ratio filter active; U/D/F over mains + supps; lookback=${trendLookback}; threshold=${trendThreshold}; historical coverage=${trendRatioCoveragePercent.toFixed(2)}%)`
      ]);
    }
    if (monthEndCarryOverBiasEnabled) {
      setTraceMaybe((t) => [...t,
        `[TRACE] Month-end carry-over bias active: ${monthEndCarryOverStrengthSettings.label} strength; ${monthEndCarryOverWeighting.targetMonthLabel} (${monthEndCarryOverWeighting.drawsSoFarThisMonth} draw${monthEndCarryOverWeighting.drawsSoFarThisMonth === 1 ? "" : "s"} so far) ← ${monthEndCarryOverWeighting.sourceMonthLabel ?? "no previous month"}; sources undrawn=${monthEndCarryOverIncludeMonthEndUndrawn ? "on" : "off"} boundary=${monthEndCarryOverIncludeBoundaryRepeats ? "on" : "off"}; active pool ${monthEndCarryOverWeighting.activeNumbers.length}${monthEndCarryOverPoolBreakdown ? ` (${monthEndCarryOverPoolBreakdown})` : ""}${selectedCarryOverBoostSummary ? ` | selected boost ${selectedCarryOverBoostSummary} ×${selectedCarryOverBoostFactor}` : ""}${monthEndCarryOverTopWeightSummary ? ` | active weights ${monthEndCarryOverTopWeightSummary}` : ""}`
      ]);
    }
    if (generationForcedNumbers.length > 0) {
      setTraceMaybe((t) => [...t,
        `[TRACE] ${traceLabel}: forced generation numbers active ${generationForcedNumbers.join(", ")} (trend selections ${trendSelectedNumbers.length}; latest ±1/±2 targets ${previousNeighbourConstraintNumbers.length}; hot/cold row selections ${hotColdForcedNumbers.length}; drought-break selections ${droughtBreakSelectedNumbers.length}; paste-weighted missing selections ${pasteWeightedForcedNumbers.length})`
      ]);
    }
    const autoExcludeTrace = buildAutoExcludeUnselectedTraceLine(traceLabel);
    if (autoExcludeTrace) {
      setTraceMaybe((t) => [...t, autoExcludeTrace]);
    }
    const strictDroughtTrace = strictDroughtQuotaTraceLine(traceLabel);
    if (strictDroughtTrace) {
      setTraceMaybe((t) => [...t, strictDroughtTrace]);
    }
    const latestNeighbourStageMatchTrace = buildLatestNeighbourStageMatchCompatibilityLine(
      Array.from(new Set([...excludedWithMiANBatch, ...sde1Exclusions, ...hc3Exclusions])).sort((a, b) => a - b),
    );
    if (latestNeighbourStageMatchTrace) {
      setTraceMaybe((t) => [...t, latestNeighbourStageMatchTrace]);
    }

    const t0 = performance.now();
    const result = generateCandidates(
      target,
      realFilteredHistory,
      effectiveKnobsForGen,
      (msg: string) => setTraceMaybe((t) => [...t, msg]),
      excludedWithMiANBatch,
      selectedRatios,
      useTrickyRule,
      0,
      stableOGAScores as any,
      generationForcedNumbers,
      userSelectedNumbers,
      { enabled: selectedBoostEnabled, factor: selectedBoostFactor },
      entropyThresholdEff,
      hammingThresholdEff,
      jaccardThresholdEff,
      lambdaEnabled ? lambda : 0.0,
      ratioOptions,
      minRecentMatches,
      recentMatchBias,
      repeatWindowSizeW,
      minFromRecentUnionM,
      allowedTrendRatios.length ? activeTrendMap : undefined,
      allowedTrendRatios.length ? allowedTrendRatios : undefined,
      { enabled: false, min: 0, max: 0, includeSupp: true },
      {
        constraints: selectedWindowPatterns,
        mode: patternConstraintMode,
        boostFactor: patternBoostFactor,
        sumTolerance: patternSumTolerance,
      },
      {
        enabled: enableOGAForecastBias,
        preferredBand: ogaPreferredBand,
        bands: ogaStats.bands,
        deciles: ogaStats.deciles,
        preferredDeciles: ogaPreferredDeciles,
      },
      undefined,
      mainDigitGenerationOptions.main0,
      mainDigitGenerationOptions.main5,
      mainDigitGenerationOptions.main1,
      mainDigitGenerationOptions.main2,
      mainDigitGenerationOptions.main3,
      mainDigitGenerationOptions.main4,
      mainDigitGenerationOptions.main6,
      mainDigitGenerationOptions.main7,
      mainDigitGenerationOptions.main8,
      mainDigitGenerationOptions.main9,
      {
        enabled: digitWidthConstraintTargets.enabled,
        singleDigitPercent: digitWidthConstraintTargets.singleDigitPercent,
        scope: digitWidthConstraintTargets.scope,
      },
      monthlyBucketOptions,
      attemptMultiplier,
      ogaSpokeCount,
      maxLastDrawMatchesEnabled ? maxLastDrawMatchesValue : undefined,
      monthlyRepeatBiasResult?.weights,
      mainDecadeGenerationBiases,
      monthEndCarryOverWeights,
      activeScoringGenerationProfile,
      d1TerminalMomentumGenerationProfile,
      undefined,
      {
        enabled: latestNeighbourSupportEnabled,
        planningLastDrawOverride: planningDrawContext.isPlanningLastDraw,
      },
      strictDroughtQuotaGenerationOptions
    );

    const monthlyTrace = buildMonthlyTrace();
    setTraceMaybe((t) => [
      ...t,
      `[TRACE] Monthly acceptance toggle: ${monthlyConstraintPayload ? "ON" : "OFF"} (constructive fill: ${monthlyConstructiveEnabled ? "ON" : "OFF"})`,
    ]);
    if (monthlyTrace) {
      setTraceMaybe((t) => [...t, `[TRACE] ${monthlyTrace}`]);
    }

    let processed = recomputeCompositeRanking(annotateCandidatesWithPreviousNeighbourShape(
      [...result.candidates],
      previousNeighbourLatestDraw,
      "mains-plus-supps",
    ));
    let monthlyRejects = 0;
    if (monthlyConstraintPayload) {
      processed = processed.filter((c) => {
        const ok = meetsMonthlyConstraints(c);
        if (!ok) monthlyRejects += 1;
        return ok;
      });
    }
    let acceptanceNeedsRejects2 = 0;
    const mianBuckets2 = monthlyBucketSetsAlways ?? monthlyConstraintPayload?.buckets ?? null;
    if (acceptanceNeedsEnabled) {
      if (!mianBuckets2) {
        setTraceMaybe((t) => [...t, `[TRACE] ⚠️ MiAN enabled but no monthly bucket data available — filter skipped. Open Monthly Draws Summary panel to populate bucket data.`]);
      } else {
        const beforeMiAN2 = processed.length;
        processed = processed.filter((c) => {
          const ok = meetsAcceptanceNeeds(c);
          if (!ok) acceptanceNeedsRejects2 += 1;
          return ok;
        });
        const ac = effectiveMianCounts;
        const mianTotal2 = ac.undrawn + ac.times1 + ac.times2 + ac.times3 + ac.times4 + ac.times5 + ac.times6 + ac.times7 + ac.times8;
        if (mianTotal2 > 8) {
          setTraceMaybe((t) => [...t, `[TRACE] ⚠️ MiAN impossible: requirements sum to ${mianTotal2} but a candidate only has 8 main numbers — reduce counts so they total ≤ 8`]);
        }
        setTraceMaybe((t) => [...t, `[TRACE] MiAN required: 0x≥${ac.undrawn} 1x≥${ac.times1} 2x≥${ac.times2} 3x≥${ac.times3} 4x≥${ac.times4} 5x≥${ac.times5} 6x≥${ac.times6} 7x≥${ac.times7} 8x+≥${ac.times8} | rejected ${acceptanceNeedsRejects2} of ${beforeMiAN2} candidates${acceptanceNeedsHardExclude ? " (hard-exclude ON)" : ""}`]);
      }
    }
    const readinessFilterResult = applyConfiguredReadinessHardFilters(processed);
    processed = readinessFilterResult.candidates;
    emitReadinessHardFilterTrace(traceLabel, readinessFilterResult);
    processed = processed.filter(withinSumRange);

    const prizeRejects = 0;

    let capRejects = 0;
    if (knobs.enableOGA && typeof knobs.octagonal_top === "number" && processed.length > 0) {
      const cap = Math.max(1, Math.floor(knobs.octagonal_top));
      const before = processed.length;
      processed = applyOctagonalPostProcess(
        processed,
        realFilteredHistory.length ? realFilteredHistory : realHistory,
        cap,
        ogaSpokeCount
      );
      capRejects = before - processed.length;
      processed = recomputeCompositeRanking(processed);
    }
    const poolBeforeSlice = processed.length;
    if (processed.length > target) {
      processed.sort(compareFinalSurvivorCandidates);
      if (selectedRatios.length > 0) {
        const quotaResult = applyOddEvenRatioQuotas(processed, target, selectedRatios, ratioOptions);
        processed = quotaResult.candidates;
        if (Object.keys(quotaResult.shortfalls).length > 0) {
          setTraceMaybe((t) => [...t, `[TRACE] ${traceLabel}: odd/even quota shortfall after post-filters ${Object.entries(quotaResult.shortfalls).map(([ratio, missing]) => `${ratio}:${missing}`).join(", ")}`]);
        }
      } else {
        processed = processed.slice(0, target);
      }
    }

    const freq = new Map<number, number>();
    processed.forEach((c) => {
      [...c.main, ...c.supp].forEach((n) => freq.set(n, (freq.get(n) || 0) + 1));
    });
    const freqArr: Array<{ n: number; count: number }> = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 8)
      .map(([n, count]) => ({ n, count }));

    const dt = Math.round(performance.now() - t0);
    const st = result.rejectionStats;
    setTraceMaybe((t) => [
      ...t,
      ...formatGenerationTraceLines({
        label: traceLabel,
        requested: target,
        kept: processed.length,
        elapsedMs: dt,
        stats: st,
        monthlyRejects,
        prizeRejects,
        capRejects,
        readinessRejects: totalReadinessHardFilterRejects(readinessFilterResult.rejects),
      }),
      buildSurvivorSelectionTrace(traceLabel, poolBeforeSlice, processed.length, target),
    ]);

    return { processed, prizeRejects, capRejects, freqArr, dt, st };
  };

  const handleRunBatchFrequencies = () => {
    if (isBatching) return;
    setIsBatching(true);
    try {
      const target = Math.max(1, Math.min(1_000_000, batchSize));
      const { processed, prizeRejects, capRejects, freqArr, dt, st } = runBatch(target, "BatchFreq");

      setBatchFreq(freqArr.map(({ n, count }) => ({ n, count })));
      setBatchSummary(
        `Batch ${target}: kept ${processed.length} (accepted ${st.accepted}/${st.totalAttempts}) in ${dt}ms; rejects prize:${prizeRejects} cap:${capRejects}`
      );
    } catch (err) {
      setTraceMaybe((t) => [...t, `[TRACE] BatchFreq error: ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      setIsBatching(false);
    }
   };

   const handleRunBatchSession = () => {
     if (isBatching || isBatchSessionRunning) return;
     const runs = Math.max(1, Math.min(200, batchSessionRuns));
     setIsBatchSessionRunning(true);
     setBatchSessionProgress(0);
     setBatchSessionTopSeries([]);
     setBatchSessionAggregate([]);

	     try {
	       const agg = new Map<number, number>();
	       setTraceMaybe((t) => [
	         ...t,
	         ...buildGenerationActiveSetupTraceLines({
	           label: "BatchSession pre-flight",
	           mode: "batch",
	           requested: Math.max(1, Math.min(1_000_000, batchSize)),
	           emitFullSnapshot: false,
	         }),
	         `[TRACE] BatchSession will run ${runs} batch replay${runs === 1 ? "" : "s"}; per-run setup lines are suppressed to keep Trace readable.`,
	       ]);
	       for (let i = 0; i < runs; i++) {
	         const { freqArr } = runBatch(Math.max(1, Math.min(1_000_000, batchSize)), `BatchSession run ${i + 1}/${runs}`, { emitPreflight: false });
	         const tops = freqArr.slice(0, 8).map(({ n, count }) => ({ n, count }));
         tops.forEach(({ n, count }) => agg.set(n, (agg.get(n) || 0) + count));
         setBatchSessionTopSeries((prev) => [...prev, { run: i + 1, tops }]);
         const aggArr = Array.from(agg.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 8).map(([n, count]) => ({ n, count }));
         setBatchSessionAggregate(aggArr);
         setBatchSessionProgress(i + 1);
       }
     } catch (err) {
       setTraceMaybe((t) => [...t, `[TRACE] BatchSession error: ${err instanceof Error ? err.message : String(err)}`]);
     } finally {
       setIsBatchSessionRunning(false);
     }
   };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const content = evt.target?.result as string;
        const parsed = parseCSVorJSON(content);
        const validDraws = strictValidateDraws(parsed);
        if (parsed.length !== validDraws.length) {
          setTrace((t) => [...t, `[TRACE] Warning: ${parsed.length - validDraws.length} draws were discarded due to invalid format/range/duplicates.`]);
        }
        const reviewRows = rowsFromDraws(validDraws);
        const review = analyzeDrawHistoryRows(reviewRows);
        const correctedRows = applyAutomaticHistoryCorrections(reviewRows, review);
        const correctedDraws = drawsFromRows(correctedRows);
        if (review.autoDropIndices.length > 0) {
          setTrace((t) => [...t, `[TRACE] Smart review removed ${review.autoDropIndices.length} exact duplicate draw${review.autoDropIndices.length === 1 ? "" : "s"} during import.`]);
        }
        if (review.sameDateConflictIssues.length > 0) {
          setTrace((t) => [...t, `[TRACE] Smart review found ${review.sameDateConflictIssues.length} same-date conflict group${review.sameDateConflictIssues.length === 1 ? "" : "s"}. Use Smart History Review to pick the correct row.`]);
        }
        if (review.sameNumbersDifferentDateIssues.length > 0) {
          setTrace((t) => [...t, `[TRACE] Smart review flagged ${review.sameNumbersDifferentDateIssues.length} repeated number set${review.sameNumbersDifferentDateIssues.length === 1 ? "" : "s"} across different dates.`]);
        }
        if (correctedDraws.length >= MIN_VALID_DRAWS) {
          const isNewestFirst = new Date(correctedDraws[0].date) > new Date(correctedDraws[correctedDraws.length - 1].date);
          const ordered = isNewestFirst ? correctedDraws.slice().reverse() : correctedDraws.slice();
          commitHistory(ordered);
          setTrace((t) => [...t, `[TRACE] Imported ${correctedDraws.length} valid draws from file.`]);
          if (review.issues.length > 0) {
            showToast("Imported with Smart History Review findings. Open Draw History Manager to review conflicts.");
          }
        } else {
          setTrace((t) => [...t, `[TRACE] Imported file has insufficient valid draws (${correctedDraws.length}).`]);
        }
      } catch (err) {
        setTrace((t) => [...t, "[TRACE] Failed to parse uploaded file."]);
      }
    };
    reader.readAsText(file);
  };

  const handleUseSimulatedStartupHistory = useCallback(() => {
    const demoRows = buildDemoDrawHistory(MIN_VALID_DRAWS, NUM_MAINS, MAIN_MIN, MAIN_MAX, getUniqueRandomNumbers);
    commitHistory(demoRows);
    setTraceMaybe((t) => [...t, `[TRACE] DEMO MODE: user explicitly loaded ${demoRows.length} simulated rows into Draw History Manager because no default real history was available.`]);
    showToast("Loaded simulated demo rows. Replace them with verified CSV history before analysis.");
  }, [commitHistory, setTraceMaybe]);

  const handleRatioToggle = (ratio: string) => {
    setSelectedRatios((prev) => (prev.includes(ratio) ? prev.filter((r) => r !== ratio) : [...prev, ratio]));
    setUseTrickyRule(false);
  };
  const handleSelectAllRatios = useCallback(() => {
    setSelectedRatios(ratioOptionValues);
    setUseTrickyRule(false);
  }, [ratioOptionValues]);

  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState<number>(-1);
  const currentCandidate = candidates[selectedCandidateIdx];

  const previewStats = useMemo(() => {
    const candidate = currentCandidate;
    return {
      hamming: candidate ? minHamming(candidate, realFilteredHistory) : 0,
      entropy: candidate ? entropy(candidate) : 0,
      jaccard: candidate ? maxJaccard(candidate, realFilteredHistory) : 0,
    };
  }, [currentCandidate, realFilteredHistory]);

  const maxGPWFWindow = realFilteredHistory.length > 0 ? realFilteredHistory.length : 45;

  const churnDataset = useMemo(
    () => (realFilteredHistory ? buildChurnDataset(realFilteredHistory, { churnWindowK: 12, returnHorizon: 6 }) : []),
    [realFilteredHistory]
  );

  // Candidate simulation: adds synthetic column to DGA only (does not clear manual checkboxes)

  // Legend counts for heatmap (from trendValueSeries)
  const bucketStops = [0.01, 0.08, 0.14, 0.20, 0.31, 0.43, 0.50, 0.70, 0.86, 0.96];
  const bucketLabels = ["prehistoric","frozen","permafrost","cold","cool","temperate","warm","hot","tropical","volcanic"];
  const bucketColors = ["#0b1020","#1b2733","#244963","#2c75a0","#3ca0c7","#66c2a5","#a6d854","#fdd835","#fb8c00","#e53935"];
  function bucketIndex(v: number): number { for (let i = 0; i < bucketStops.length; i++) if (v < bucketStops[i]) return i; return bucketStops.length; }
  const [legendCounts, setLegendCounts] = useState<number[]>(() => Array(bucketLabels.length).fill(0));
  const [legendTotal, setLegendTotal] = useState<number>(0);
  const dgaMonthlyBucketDrawSeries = useMemo(
    () => buildMonthlyBucketDrawSeries(realFilteredHistory),
    [realFilteredHistory],
  );
  const dgaMonthlyBucketHeatmapHistory = useMemo(() => {
    if (!simulatedDraw) return realHistory;
    return [...realHistory, buildSimulatedNextDraw(realHistory, simulatedDraw)];
  }, [realHistory, simulatedDraw]);
  const dgaMonthlyBucketTimelineBase = useMemo(
    () => buildMonthlyBucketTimeline(dgaMonthlyBucketHeatmapHistory),
    [dgaMonthlyBucketHeatmapHistory],
  );
  const dgaEffectiveMonthLabel = useMemo(() => {
    if (monthlyBucketSetsAlways || monthlyConstraintPayload?.buckets || simulatedDraw) {
      return dgaMonthlyBucketTimelineBase[dgaMonthlyBucketTimelineBase.length - 1]?.monthLabel ?? dgaPlanningMonthLabel;
    }
    return dgaPlanningMonthLabel;
  }, [dgaPlanningMonthLabel, dgaMonthlyBucketTimelineBase, monthlyBucketSetsAlways, monthlyConstraintPayload, simulatedDraw]);
  const dgaMonthlyBucketTimeline = useMemo(() => {
    const next = dgaMonthlyBucketTimelineBase.slice();
    const latestTimelineBuckets = simulatedDraw && next.length
      ? next[next.length - 1].bucketSets
      : dgaEffectiveMonthlyBuckets;

    if (next.length === 0) {
      return [{
        monthLabel: dgaEffectiveMonthLabel,
        bucketSets: latestTimelineBuckets,
        drawCount: 0,
        totalDrawCount: 0,
        drawStates: [],
      }];
    }
    const last = next[next.length - 1];
    if (last.monthLabel === dgaEffectiveMonthLabel) {
      next[next.length - 1] = { ...last, bucketSets: latestTimelineBuckets };
      return next;
    }
    return [...next, {
      monthLabel: dgaEffectiveMonthLabel,
      bucketSets: latestTimelineBuckets,
      drawCount: 0,
      totalDrawCount: 0,
      drawStates: [],
    }];
  }, [dgaEffectiveMonthLabel, dgaEffectiveMonthlyBuckets, dgaMonthlyBucketTimelineBase, simulatedDraw]);
  const dgaMonthlyBucketDrawSeriesFull = useMemo(
    () => buildMonthlyBucketDrawSeries(dgaMonthlyBucketHeatmapHistory),
    [dgaMonthlyBucketHeatmapHistory],
  );
  const isMonthlyBucketHeatmapView = dgaHeatmapView === "monthlyBucketState";
  const dgaHeatmapHighlightedColumns = useMemo(() => {
    if (!isMonthlyBucketHeatmapView || !simulatedDraw || dgaMonthlyBucketHeatmapHistory.length <= realHistory.length) {
      return [] as number[];
    }
    return [dgaMonthlyBucketHeatmapHistory.length - 1];
  }, [dgaMonthlyBucketHeatmapHistory.length, realHistory.length, isMonthlyBucketHeatmapView, simulatedDraw]);
  const dgaHeatmapActiveWindow = useMemo(() => {
    if (!realHistory.length || !realFilteredHistory.length) return null;

    const start = Math.max(0, realHistory.length - realFilteredHistory.length);
    if (start === 0) return null;
    return { start, end: realHistory.length - 1 };
  }, [realHistory.length, realFilteredHistory.length]);
  const dgaHeatmapBucketLabels = isMonthlyBucketHeatmapView ? [...MONTHLY_BUCKET_HEATMAP_LABELS] : bucketLabels;
  const dgaHeatmapBucketColors = isMonthlyBucketHeatmapView ? [...MONTHLY_BUCKET_HEATMAP_COLORS] : bucketColors;
  const dgaHeatmapBucketLetters = isMonthlyBucketHeatmapView
    ? [...MONTHLY_BUCKET_HEATMAP_LETTERS]
    : ["pR","F","pF","<C","C>","tT","W","H","tR","V"];
  const dgaHeatmapLegendCounts = isMonthlyBucketHeatmapView
    ? dgaMonthlyBucketDrawSeries.bucketCounts
    : legendCounts;
  const dgaHeatmapLegendTotal = isMonthlyBucketHeatmapView
    ? dgaMonthlyBucketDrawSeries.totalCells
    : legendTotal;
  const dgaHeatmapBucketIndexSeries = isMonthlyBucketHeatmapView
    ? dgaMonthlyBucketDrawSeriesFull.bucketIndexSeries
    : undefined;
  const dgaHeatmapTitle = isMonthlyBucketHeatmapView
    ? "Monthly Bucket State Heatmap"
    : "Temperature Heatmap";
  const dgaHeatmapSubtitle = isMonthlyBucketHeatmapView
    ? dgaHeatmapActiveWindow
      ? `${simulatedDraw ? "Appends the simulated next draw on the right and " : ""}shows each number’s running calendar-month bucket after every draw across all history. Columns outside the active WFMQYH window are dimmed; legend and drought summaries stay scoped to the active window.`
      : `${simulatedDraw ? "Appends the simulated next draw on the right. " : ""}Shows each number’s running calendar-month bucket after every draw (Undrawn → 8x+).`
    : dgaHeatmapActiveWindow
      ? "Shows each number’s temperature bucket across all history using the selected metric. Columns outside the active WFMQYH window are dimmed; legend and drought summaries stay scoped to the active window."
      : "Shows the temperature bucket of each number through time using the selected metric.";
  useEffect(() => {
    const values: number[] = [];
    for (let n = 0; n < trendValueSeries.length; n++) {
      const series = trendValueSeries[n] || [];
      for (let t = 0; t < series.length; t++) {
        const v = series[t];
        if (typeof v === "number" && isFinite(v) && v >= 0 && v <= 1) values.push(v);
      }
    }
    const counts = Array(bucketLabels.length).fill(0);
    for (const v of values) counts[bucketIndex(v)]++;
    setLegendCounts(counts);
    setLegendTotal(values.length);
  }, [trendValueSeries]);

  const readinessHardFilterSummary = formatReadinessHardFilterSummary(readinessHardFilters);
  const readinessHardFiltersActive = readinessHardFilterSummary !== "off";

  const endDigitSetSummary = [
    `0=${mainZeroSetEnabled ? `max ${maxMainZeroSetCount}` : "off"}`,
    `1=${mainOneSetEnabled ? `max ${maxMainOneSetCount}` : "off"}`,
    `2=${mainTwoSetEnabled ? `max ${maxMainTwoSetCount}` : "off"}`,
    `3=${mainThreeSetEnabled ? `max ${maxMainThreeSetCount}` : "off"}`,
    `4=${mainFourSetEnabled ? `max ${maxMainFourSetCount}` : "off"}`,
    `5=${mainFiveSetEnabled ? `max ${maxMainFiveSetCount}` : "off"}`,
    `6=${mainSixSetEnabled ? `max ${maxMainSixSetCount}` : "off"}`,
    `7=${mainSevenSetEnabled ? `max ${maxMainSevenSetCount}` : "off"}`,
    `8=${mainEightSetEnabled ? `max ${maxMainEightSetCount}` : "off"}`,
    `9=${mainNineSetEnabled ? `max ${maxMainNineSetCount}` : "off"}`,
  ].join(" · ");
  const activeSetupProvenanceGroups: Array<{
    title: string;
    target: ActiveSetupProvenanceTarget;
    targetLabel: string;
    items: Array<{ label: string; value: React.ReactNode }>;
  }> = [
    {
      title: "History & Source",
      target: "historySource",
      targetLabel: "Go to Windowed Draw Filtering",
      items: [
        { label: "Real window", value: `${realFilteredHistory.length}/${filteredHistory.length} loaded` },
        { label: "Ratios", value: selectedRatios.length ? selectedRatios.join(" ") : "none" },
        { label: "Tricky", value: useTrickyRule ? "on" : "off" },
      ],
    },
    {
      title: "Filters & Distance",
      target: "filtersDistance",
      targetLabel: "Go to Hard Filters",
      items: [
        { label: "Entropy", value: entropyEnabled ? entropyThreshold : "off" },
        { label: "Hamming", value: hammingEnabled ? hammingThreshold : "off" },
        { label: "Jaccard", value: jaccardEnabled ? jaccardThreshold : "off" },
        { label: "Rdy hard filters", value: readinessHardFilterSummary },
        { label: "Sum", value: sumFilter.enabled ? `${sumFilter.min}-${sumFilter.max}${sumFilter.includeSupp ? "+supp" : ""}` : "off" },
      ],
    },
    {
      title: "Recency & Latest Draw",
      target: "recencyLatestDraw",
      targetLabel: "Go to Recency & Latest Draw Rules",
      items: [
        { label: "RecMin", value: minRecentMatches },
        { label: "RecBias", value: recentMatchBias },
        { label: "LD±1", value: latestNeighbourSupportEnabled ? "on" : "off" },
        { label: "Strict drought quota", value: strictDroughtQuotaSummary },
        { label: "Prev ±1/±2", value: previousNeighbourConstraintNumbers.length ? previousNeighbourConstraintNumbers.join(", ") : "off" },
        { label: "Drought-break", value: droughtBreakSelectedNumbers.length ? droughtBreakSelectedNumbers.join(", ") : "off" },
        { label: "Repeat", value: repeatUnionSummary },
        { label: "GPWF", value: gpwfEnabled ? "on" : "off" },
        { label: "Lambda", value: lambdaEnabled ? lambda.toFixed(2) : "off" },
      ],
    },
    {
      title: "Geometry & Pattern",
      target: "geometryPattern",
      targetLabel: "Go to Engine & Ranking",
      items: [
        { label: "Pattern", value: `${patternConstraintMode} · tol ${patternSumTolerance} · boost ${patternBoostFactor}` },
        { label: "OGA bias", value: enableOGAForecastBias ? `${ogaPreferredBand} @ ${ogaBaselineMode}` : "off" },
      ],
    },
    {
      title: "Ending Digits & Buckets",
      target: "endingBuckets",
      targetLabel: "Go to Shape & Bucket Quotas",
      items: [
        { label: "End limits", value: endDigitSetSummary },
        { label: "Digit width", value: digitWidthConstraintTargets.enabled ? `${digitWidthConstraintTargets.singleDigitPercent}/${digitWidthConstraintTargets.twoDigitPercent} ${formatDigitWidthScopeLabel(digitWidthConstraintTargets.scope)} => ${digitWidthConstraintTargets.singleDigitCount}/${digitWidthConstraintTargets.twoDigitCount}` : "off" },
        { label: "End boosts", value: activeMainDigitBoostSummary || "none" },
        { label: "Decade bias", value: activeMainDecadeBiasSummary || "none" },
      ],
    },
    {
      title: "Monthly & Carry-over",
      target: "monthlyCarryOver",
      targetLabel: "Go to Monthly Timing Bias",
      items: [
        { label: "MRB", value: mrbEnabled ? `on · budget ${MRB_BUCKET_KEYS.reduce((s, k) => s + Math.max(0, (mrbBucketBoosts[k] ?? 1) - 1), 0).toFixed(1)}/${MRB_BUDGET}` : "off" },
        {
          label: "Carry-over",
          value: monthEndCarryOverBiasEnabled
            ? `${monthEndCarryOverStrengthSettings.label} · ${monthEndCarryOverWeighting.targetMonthLabel} · active ${monthEndCarryOverWeighting.activeNumbers.length}${monthEndCarryOverPoolBreakdown ? ` (${monthEndCarryOverPoolBreakdown})` : ""} · undrawn ${monthEndCarryOverIncludeMonthEndUndrawn ? "on" : "off"} · boundary ${monthEndCarryOverIncludeBoundaryRepeats ? "on" : "off"}${selectedCarryOverBoostSummary ? ` · selected ${selectedCarryOverBoostSummary} x${selectedCarryOverBoostFactor}` : ""}`
            : `off · default ${monthEndCarryOverWeighting.defaultEnabled ? "on" : "off"}`,
        },
      ],
    },
  ];

  const handleNewPredictionDraft = () => {
    predictionJournalDraftIdRef.current += 1;
    setPredictionJournalDraftRequest({
      id: predictionJournalDraftIdRef.current,
      setupSnapshot: buildSnapshot({ includePanelFavorites: true, includeDerivedPredictionEvidence: true }),
    });
    setPredictionJournalOpen(true);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        document.getElementById("panel-prediction-journal")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const handleViewPredictionEntries = () => {
    predictionJournalEntriesRequestIdRef.current += 1;
    setPredictionJournalEntriesRequestId(predictionJournalEntriesRequestIdRef.current);
    setPredictionJournalOpen(true);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        document.getElementById("panel-prediction-journal")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  return (
    <PanelFavoritesProvider favoritePanelIds={favoritePanelIds} onToggleFavorite={toggleFavoritePanel}>
    <div className="windfall-app-shell">
      <ToastContainer position="top-right" duration={1600} />
      <header className="windfall-app-header">
        <div>
          <h1 className="windfall-app-title">Weekday Windfall</h1>
          <div className="windfall-app-subtitle">Set Generator · for entertainment use only</div>
        </div>
        <div className="windfall-app-actions">
          <label className="windfall-trace-toggle">
            <input type="checkbox" checked={traceVerbose} onChange={(e) => setTraceVerbose(e.target.checked)} />
            Trace verbose
          </label>
        <a
          href="/user-manual.html"
          target="_blank"
          rel="noopener noreferrer"
          className="windfall-primary-button"
          aria-label="Open user manual in a new tab"
        >
          Manual
        </a>
        </div>
      </header>

      <div
        data-testid="draw-history-provenance"
        role="status"
        className={`windfall-provenance-strip ${drawHistoryProvenance.analysisReady ? "windfall-provenance-strip--ready" : "windfall-provenance-strip--warning"}`}
      >
        <b>Data provenance:</b> {drawHistoryProvenance.headline}. {drawHistoryProvenance.detail}{" "}
        Active window: {activeWindowProvenance.realDraws} real / {activeWindowProvenance.totalDraws} loaded.
        {drawHistoryProvenance.warning ? <> <b>Warning:</b> {drawHistoryProvenance.warning}</> : null}
      </div>

      {history.length === 0 && startupHistoryChoice?.source === "none" && (
        <section
          data-testid="startup-history-choice"
          role="alert"
          style={{
            display: "grid",
            gap: 10,
            margin: "12px 0",
            padding: 14,
            border: "1px solid #f0c36d",
            borderRadius: 8,
            background: "#fff8e6",
            color: "#4a3410",
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>No draw history loaded</div>
            <div style={{ marginTop: 3, fontSize: 13, lineHeight: 1.45 }}>
              The default history file <code>src/windfall_history_lottolyzer.csv</code> could not be loaded with valid real draws. {startupHistoryChoice.reason}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{ minHeight: 34, padding: "7px 12px", fontWeight: 700 }}
            >
              Use another CSV/JSON file
            </button>
            <button
              type="button"
              onClick={handleUseSimulatedStartupHistory}
              style={{ minHeight: 34, padding: "7px 12px" }}
            >
              Load simulated demo rows
            </button>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.45, color: "#6f531e" }}>
            Simulated rows are marked as simulated and are not treated as real historical evidence by the app’s real-history diagnostics.
          </div>
        </section>
      )}

      <AppWorkflowNav />
      <PanelFavoritesStrip
        favoritePanelIds={favoritePanelIds}
        onClearFavorites={() => setFavoritePanelIds([])}
      />

      <WorkflowAnchor
        id="workflow-history"
        title="History & Window"
        summary="Load, validate, and choose the active draw window before interpreting any downstream signal."
      />

      {/* [ORDER-ANCHOR] 01 Number Trends Table */}
      <CollapsibleSection panelId="number-trends" title={<b>Number Trends Table</b>} summaryHint="Click a number to mark for forced inclusion" defaultOpen={false}>
        <NumberTrendsTable
          trends={numberTrends}
          onToggle={(n) => {
            if (selectionUnavailableSet.has(n)) return;
            setTrendSelectedNumbers(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);
          }}
          selected={trendSelectedNumbers}
          externalSelectedNumbers={numberTrendExternalSelectedNumbers}
          externalSelectedLabel="other forced selections"
          excludedNumbers={selectionUnavailableNumbers}
        />
        <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
          Colored rows indicate numbers you have selected for forced inclusion.
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 02 Draw History Manager */}
      <CollapsibleSection panelId="draw-history-manager" title={<b>Draw History Manager ({history.length} draws • latest {mostRecentDrawDateLabel})</b>} defaultOpen={false}>
        {/* In-app CSV updater */}
        <DrawHistoryManager
          csvPathHint="Bundled fallback: src/windfall_history_lottolyzer.csv"
          currentRows={rowsFromDraws(history)}
          mainCount={6}
          suppCount={2}
          minNumber={1}
          maxNumber={45}
          onDrawsUpdated={(rows, summaryMessage) => {
            const ordered = drawsFromRows(rows);
            commitHistory(ordered);
            setTrace(t => [...t, `[TRACE] ${summaryMessage ?? "Added/updated draw via CSV panel."} History now ${ordered.length} draws.`]);
          }}
        />
        <DrawHistoryIntegrityPanel
          rows={rowsFromDraws(history)}
          onApplyRows={(rows, summaryMessage) => {
            const ordered = drawsFromRows(rows);
            commitHistory(ordered);
            setTrace((t) => [...t, `[TRACE] ${summaryMessage} History now ${ordered.length} draws.`]);
          }}
          mainCount={6}
          suppCount={2}
          minNumber={1}
          maxNumber={45}
        />
        <pre style={{ maxHeight: 160, overflow: "auto", fontSize: 12 }}>
        {filteredHistory.map((d, idx) => {
          const numsAll = [...d.main, ...d.supp];
          const odd = numsAll.filter((n) => n % 2 === 1).length;
          const even = numsAll.length - odd;
          const oga = pastOGAScores[idx] ?? null;
          return `${d.date}: [${d.main.join(", ")}] | Sup: [${d.supp.join(", ")}]${oga !== null ? ` | OGA=${oga.toFixed(2)}` : ""} | Odd/Even=${odd}:${even}`;
        }).join("\n")}
        {filteredHistory.length === 0 ? "\nNo draws loaded yet. Check network or click \"Re-fetch Draws\"." : ""}
        </pre>
        <div style={{ marginTop: 8 }}>
          <button onClick={() => fileInputRef.current?.click()} style={{ marginRight: 8, marginBottom: 5 }}>
            Import Draws (CSV/JSON)
          </button>
          <button
            onClick={() =>
              fetchDraws({
                apiUrl: API_URL,
                minValidDraws: MIN_VALID_DRAWS,
                numMains: NUM_MAINS,
                mainMin: MAIN_MIN,
                mainMax: MAIN_MAX,
                setHistory: commitHistory,
                setTrace: setTraceMaybe,
                setHighlights,
                rng: getUniqueRandomNumbers,
                strictValidateDraws,
              })
            }
            style={{ marginRight: 8, marginBottom: 5 }}
          >
            Re-fetch Draws
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json"
            style={{ display: "none" }}
            onChange={handleFileUpload}
          />
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 02.1 Next Draw Empirical Diagnostics */}
      <CollapsibleSection panelId="next-draw-probabilities" title={<b>Next Draw Empirical Diagnostics</b>} defaultOpen={false}>
        <NextDrawProbabilitiesPanel history={realFilteredHistory} allHistory={realHistory} title={`Next Draw Empirical Diagnostics (${historyWindowName})`} />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 03 Windowed Draw Filtering (WFMQYH) */}
      <CollapsibleSection panelId="windowed-draw-filtering" title={<b>Windowed Draw Filtering (WFMQYH)</b>} defaultOpen={false}>
        {(() => (
          <>
            <div
              style={{
                marginBottom: 12,
                border: "1px solid #eee",
                padding: 14,
                borderRadius: 7,
                background: "#f4f9ff",
                display: "flex",
                flexWrap: "wrap",
                gap: 16,
                alignItems: "center",
              }}
            >
              {/* NEW MODE TOGGLE */}
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <label>
                  <input type="radio" checked={drawWindowMode === "lastN"} onChange={() => setDrawWindowMode("lastN")} />
                  Last N draws
                </label>
                <label>
                  <input type="radio" checked={drawWindowMode === "range"} onChange={() => setDrawWindowMode("range")} />
                  Range (x to y)
                </label>
                {drawWindowMode === "range" && (
                  <>
                    <span>From</span>
                    <input type="number" min={1} max={history.length} value={rangeFrom} onChange={e => setRangeFrom(Number(e.target.value))} style={{ width: 60 }} />
                    <span>to</span>
                    <input type="number" min={1} max={history.length} value={rangeTo} onChange={e => setRangeTo(Number(e.target.value))} style={{ width: 60 }} />
                    <span>(inclusive)</span>
                  </>
                )}
              </div>

              {drawWindowMode === "lastN" && (
                <>
                  <label style={{ fontWeight: "bold", marginRight: 16 }}>
                    <input type="checkbox" checked={windowEnabled} onChange={(e) => setWindowEnabled(e.target.checked)} style={{ marginRight: 7 }} />
                    Enable windowed filtering
                  </label>
                  <span>
                    {WINDOW_OPTIONS.map((opt) => (
                      <label key={opt.key} style={{ marginRight: 14 }}>
                        <input
                          type="radio"
                          name="windowMode"
                          value={opt.key}
                          checked={windowMode === opt.key}
                          disabled={!windowEnabled}
                          onChange={(e) => setWindowMode(e.target.value as any)}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </span>
                  {windowMode === "Custom" && (
                    <span style={{ display: "inline-flex", flexDirection: "column", gap: 3, verticalAlign: "top" }}>
                      <input
                        type="number"
                        min={1}
                        max={history.length}
                        value={customDrawCount}
                        disabled={!windowEnabled}
                        onChange={(e) => setCustomDrawCount(Number(e.target.value))}
                        style={{ width: 70 }}
                        placeholder="Draw count"
                      />
                      <span
                        aria-live="polite"
                        style={{
                          color: "#526070",
                          fontSize: 12,
                          lineHeight: 1.35,
                          maxWidth: 260,
                        }}
                      >
                        {windowEnabled ? customWindowDateRangeLabel : "Custom date range: windowed filtering is off"}
                      </span>
                    </span>
                  )}
                </>
              )}

              <div style={{ marginBottom: 8, fontSize: 15, color: "#1976d2" }}>
                {drawWindowMode === "lastN"
                  ? <>Using last <b>{filteredHistory.length}</b> draws ({history.length - filteredHistory.length + 1} to {history.length})</>
                  : <>Using draws <b>{rangeFrom}</b> to <b>{rangeTo}</b> ({filteredHistory.length} draws)</>
                }
              </div>

              {/* Unified toggles */}
              <span style={{ marginLeft: 12 }}>
                <label style={{ marginRight: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={knobs.enableSDE1} onChange={(e) => setKnobs((prev) => ({ ...prev, enableSDE1: e.target.checked }))} />
                  <span>
                    SDE1
                    <span style={{ fontSize: 11, color: "#555", marginLeft: 6 }}>
                      {sde1Exclusions.length
                        ? `excl ${sde1Exclusions.length}: ${sde1Exclusions.slice().sort((a, b) => a - b).join(", ")}`
                        : "no excl"}
                    </span>
                  </span>
                </label>
                <label style={{ marginRight: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={knobs.enableHC3} onChange={(e) => setKnobs((prev) => ({ ...prev, enableHC3: e.target.checked }))} />
                  <span>
                    HC3
                    <span style={{ fontSize: 11, color: "#555", marginLeft: 6 }}>
                      {hc3Exclusions.length
                        ? `excl ${hc3Exclusions.length}: ${hc3Exclusions.slice().sort((a, b) => a - b).join(", ")}`
                        : "no excl"}
                    </span>
                  </span>
                </label>
                <label>
                  <input type="checkbox" checked={knobs.enableOGA} onChange={(e) => setKnobs((prev) => ({ ...prev, enableOGA: e.target.checked }))} style={{ marginRight: 6 }} />
                  OGA
                </label>
              </span>
            </div>

            {/* Status badges */}
            <div style={{ marginBottom: 8, fontSize: 15, color: "#1976d2", display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span>
                {drawWindowMode === "lastN"
                  ? <>Using last <b>{activeWindowSize}</b> draws</>
                  : <>Using draws <b>{rangeFrom}</b> to <b>{rangeTo}</b> ({activeWindowSize} draws)</>
                }
              </span>
              <span>{knobs.enableSDE1 ? (<span style={{ background: "#ffe6cc", color: "#a04c00", padding: "1px 6px", borderRadius: 4 }}>SDE1 Active</span>) : (<span style={{ background: "#f2f2f2", color: "#555", padding: "1px 6px", borderRadius: 4 }}>SDE1 Off</span>)}</span>
              <span>{knobs.enableHC3 ? (<span style={{ background: "#e8f5e9", color: "#2e7d32", padding: "1px 6px", borderRadius: 4 }}>HC3 Active</span>) : (<span style={{ background: "#f2f2f2", color: "#555", padding: "1px 6px", borderRadius: 4 }}>HC3 Off</span>)}</span>
              <span>{knobs.enableOGA ? (<span style={{ background: "#e8eefc", color: "#1a4fa3", padding: "1px 6px", borderRadius: 4 }}>OGA On</span>) : (<span style={{ background: "#f2f2f2", color: "#555", padding: "1px 6px", borderRadius: 4 }}>OGA Off</span>)}</span>
            </div>

            {windowEnabled && activeWindowSize < 10 && (
              <div style={{ color: "#d32f2f", fontWeight: "bold", fontSize: 14 }}>
                Warning: Too few draws selected. Increase window for reliability.
              </div>
            )}

            {/* User Exclusions */}
            <div style={{ marginTop: 8 }}>
              <b>User Exclusions:</b>
              <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, color: "#555" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 999, border: "1px solid #90caf9", background: "#e8f0fe", color: "#1565c0" }}>
                  <span style={{ fontWeight: 700 }}>M</span>
                  Manual
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 999, border: "1px dashed #f9a825", background: "#fff8e1", color: "#8d6e00" }}>
                  <span style={{ fontWeight: 700 }}>B</span>
                  Main bucket derived
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 999, border: "1px solid #f9a8d4", background: "#fdf2f8", color: "#9d174d" }}>
                  <span style={{ fontWeight: 700 }}>H</span>
                  Hot/Cold excluded
                </span>
                {autoExcludeUnselected && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 999, border: "1px solid #bdbdbd", background: "#f5f5f5", color: "#616161" }}>
                    <span style={{ fontWeight: 700 }}>A</span>
                    Auto from unselected
                  </span>
                )}
                {knobs.enableSDE1 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 999, border: "1px solid #fdba74", background: "#fff7ed", color: "#9a3412" }}>
                    <span style={{ fontWeight: 700 }}>S</span>
                    SDE1
                  </span>
                )}
                {knobs.enableHC3 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 999, border: "1px solid #86efac", background: "#f0fdf4", color: "#166534" }}>
                    <span style={{ fontWeight: 700 }}>C</span>
                    HC3
                  </span>
                )}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 999, border: "1px solid #ce93d8", background: "#f3e5f5", color: "#7b1fa2" }}>
                  <span aria-hidden="true">🔒</span>
                  Locked while another exclusion rule is active
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  overflowX: "auto",
                  whiteSpace: "nowrap",
                  paddingTop: 6,
                  paddingBottom: 4,
                  borderTop: "1px dashed #ddd",
                  marginTop: 6,
                }}
              >
                {Array.from({ length: 45 }, (_, i) => i + 1).map((n) => {
                  const isManualExcluded = manualExcludedSet.has(n);
                  const isHotColdExcluded = hotColdExcludedSet.has(n);
                  const isBucketDerivedExcluded = bucketAutoExcludedSet.has(n);
                  const isAutoSelectionExcluded = autoSelectionExcludedSet.has(n);
                  const isSde1Excluded = sde1ExcludedSet.has(n);
                  const isHc3Excluded = hc3ExcludedSet.has(n);
                  const isLockedByActiveRule = selectionUnavailableSet.has(n) && !isManualExcluded;
                  const checked = selectionUnavailableSet.has(n);
                  const sourceBadges = [
                    isManualExcluded ? { label: "M", title: "Manual exclusion", color: "#1565c0", background: "#e8f0fe", border: "#90caf9" } : null,
                    isHotColdExcluded ? { label: "H", title: "Excluded from Hot/Cold row selection", color: "#9d174d", background: "#fdf2f8", border: "#f9a8d4" } : null,
                    isBucketDerivedExcluded ? { label: "B", title: "Derived from main bucket constraints", color: "#8d6e00", background: "#fff8e1", border: "#f9a825" } : null,
                    isAutoSelectionExcluded ? { label: "A", title: "Auto excluded because unselected numbers are being excluded", color: "#616161", background: "#f5f5f5", border: "#bdbdbd" } : null,
                    isSde1Excluded ? { label: "S", title: "Excluded by active SDE1", color: "#9a3412", background: "#fff7ed", border: "#fdba74" } : null,
                    isHc3Excluded ? { label: "C", title: "Excluded by active HC3", color: "#166534", background: "#f0fdf4", border: "#86efac" } : null,
                  ].filter((badge): badge is { label: string; title: string; color: string; background: string; border: string } => badge !== null);
                  const hasRuleSource = sourceBadges.some((badge) => badge.label !== "M");
                  const cellBorder = isManualExcluded && hasRuleSource
                    ? "1px solid #8e24aa"
                    : isManualExcluded
                      ? "1px solid #90caf9"
                      : isBucketDerivedExcluded
                        ? "1px dashed #f9a825"
                        : isSde1Excluded
                          ? "1px solid #fdba74"
                          : isHc3Excluded
                            ? "1px solid #86efac"
                            : isHotColdExcluded
                              ? "1px solid #f9a8d4"
                        : isAutoSelectionExcluded
                          ? "1px solid #bdbdbd"
                          : "1px solid transparent";
                  const cellBackground = isManualExcluded && hasRuleSource
                    ? "#f3e5f5"
                    : isManualExcluded
                      ? "#e8f0fe"
                      : isBucketDerivedExcluded
                        ? "#fff8e1"
                        : isSde1Excluded
                          ? "#fff7ed"
                          : isHc3Excluded
                            ? "#f0fdf4"
                            : isHotColdExcluded
                              ? "#fdf2f8"
                        : isAutoSelectionExcluded
                          ? "#f5f5f5"
                          : "transparent";
                  const titleParts = [
                    `Exclude ${n}`,
                    isManualExcluded ? "Manual" : null,
                    isHotColdExcluded ? "Hot/Cold excluded" : null,
                    isBucketDerivedExcluded ? "Main bucket derived" : null,
                    isAutoSelectionExcluded ? "Auto from unselected" : null,
                    isSde1Excluded ? "SDE1" : null,
                    isHc3Excluded ? "HC3" : null,
                    isLockedByActiveRule ? "Locked while another active exclusion rule is enforcing this number" : null,
                  ].filter(Boolean);
                  return (
                    <label
                      key={n}
                      style={{
                        display: "inline-flex",
                        flexDirection: "column",
                        alignItems: "center",
                        minWidth: 32,
                        padding: "4px 3px",
                        borderRadius: 6,
                        border: cellBorder,
                        background: cellBackground,
                        cursor: isLockedByActiveRule ? "not-allowed" : "pointer",
                        opacity: isLockedByActiveRule ? 0.9 : 1,
                      }}
                      title={titleParts.join(" • ")}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isLockedByActiveRule}
                        aria-label={isLockedByActiveRule ? `Exclude ${n} (locked by active exclusion rule)` : `Exclude ${n}`}
                        style={{ accentColor: isBucketDerivedExcluded && !isManualExcluded ? "#f9a825" : "#1976d2", cursor: isLockedByActiveRule ? "not-allowed" : "pointer" }}
                        onChange={() => {
                          if (isLockedByActiveRule) return;
                          setExcludedNumbers((prev) =>
                            prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
                          );
                        }}
                      />
                      <span style={{ fontSize: 11, marginTop: 2, display: "inline-flex", alignItems: "center", gap: 3 }}>
                        {n}
                        {isLockedByActiveRule && <span aria-hidden="true" title="Locked by active exclusion rule" style={{ fontSize: 10 }}>🔒</span>}
                      </span>
                      {sourceBadges.length > 0 && (
                        <span style={{ display: "flex", gap: 2, marginTop: 2, flexWrap: "wrap", justifyContent: "center" }}>
                          {sourceBadges.map((badge) => (
                            <span
                              key={`${n}-${badge.label}`}
                              title={badge.title}
                              style={{
                                minWidth: 14,
                                height: 14,
                                padding: "0 3px",
                                borderRadius: 999,
                                fontSize: 9,
                                lineHeight: "14px",
                                textAlign: "center",
                                fontWeight: 700,
                                color: badge.color,
                                background: badge.background,
                                border: `1px solid ${badge.border}`,
                              }}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>

              {(knobs.enableSDE1 || knobs.enableHC3) && (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: "#333",
                    background: "#f8f9fb",
                    border: "1px solid #eee",
                    borderRadius: 6,
                    padding: 8,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Auto exclusions</div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ color: knobs.enableSDE1 ? "#a04c00" : "#888" }}>
                        SDE1 {knobs.enableSDE1 ? `(${sde1Exclusions.length})` : "(off)"}
                      </div>

              {mainConstraintAutoExclusions.shouldApply && (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: "#333",
                    background: "#f8f9fb",
                    border: "1px solid #eee",
                    borderRadius: 6,
                    padding: 8,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    Main bucket auto exclusions ({mainConstraintAutoExclusions.excludedNumbers.length})
                  </div>
                  <div style={{ color: "#555", marginBottom: 4 }}>
                    Enabled main-bucket maxima sum to {mainConstraintAutoExclusions.totalSelectedMax}, so zero/off buckets are treated as exclusions during generation.
                  </div>
                  <div style={{ maxWidth: 720 }}>
                    {mainConstraintAutoExcludedLabel || "— none —"}
                  </div>
                  <div style={{ maxWidth: 720, marginTop: 4 }}>
                    {mainConstraintAutoExclusions.excludedNumbers.length
                      ? mainConstraintAutoExclusions.excludedNumbers.join(", ")
                      : "— none —"}
                  </div>
                </div>
              )}
                      <div style={{ maxWidth: 360 }}>
                        {sde1Exclusions.length
                          ? sde1Exclusions.slice().sort((a, b) => a - b).join(", ")
                          : "— none —"}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: knobs.enableHC3 ? "#2e7d32" : "#888" }}>
                        HC3 {knobs.enableHC3 ? `(${hc3Exclusions.length})` : "(off)"}
                      </div>
                      <div style={{ maxWidth: 360 }}>
                        {hc3Exclusions.length
                          ? hc3Exclusions.slice().sort((a, b) => a - b).join(", ")
                          : "— none —"}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 4, color: "#666" }}>
                    These numbers are automatically excluded when the respective toggles are on.
                  </div>
                </div>
              )}
            </div>
          </>
        ))()}
      </CollapsibleSection>

      <WorkflowAnchor
        id="workflow-signals"
        title="Signals"
        summary="Review observed history, diagnostic rankings, and model evidence before using those signals in generation."
      />

      {/* [ORDER-ANCHOR] 04 Odd/Even Ratio Filters */}
      <CollapsibleSection panelId="odd-even-ratio-filters" title={<b>Odd/Even Ratio Filters</b>} summaryHint="Select one or more ratios, or use Tricky Rule" defaultOpen={false}>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontWeight: "bold", display: "inline-block", marginRight: 16 }}>
            <input
              type="radio"
              checked={drawWindowMode === "lastN"}
              onChange={() => setDrawWindowMode("lastN")}
            />
            Last N draws
          </label>
          <label style={{ fontWeight: "bold", display: "inline-block", marginRight: 16 }}>
            <input
              type="radio"
              checked={drawWindowMode === "range"}
              onChange={() => setDrawWindowMode("range")}
            />
            Range (x to y)
          </label>
          {drawWindowMode === "range" && (
            <>
              <span>From</span>
              <input type="number" min={1} max={history.length} value={rangeFrom} onChange={e => setRangeFrom(Number(e.target.value))} style={{ width: 60 }} />
              <span>to</span>
              <input type="number" min={1} max={history.length} value={rangeTo} onChange={e => setRangeTo(Number(e.target.value))} style={{ width: 60 }} />
              <span>(inclusive)</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <button
            type="button"
            onClick={handleSelectAllRatios}
            disabled={useTrickyRule || ratioOptionValues.length === 0 || allVisibleRatiosSelected}
            title={useTrickyRule ? "Turn off Tricky Rule before selecting odd/even ratios" : "Select all odd/even ratios currently observed in the active window"}
            style={{
              minHeight: 32,
              padding: "6px 11px",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              background: useTrickyRule || ratioOptionValues.length === 0 || allVisibleRatiosSelected ? "#f1f5f9" : "#fff",
              color: useTrickyRule || ratioOptionValues.length === 0 || allVisibleRatiosSelected ? "#94a3b8" : "#174ea6",
              fontWeight: 800,
              cursor: useTrickyRule || ratioOptionValues.length === 0 || allVisibleRatiosSelected ? "not-allowed" : "pointer",
            }}
          >
            Select all observed
          </button>
          <span style={{ fontSize: 12, color: "#64748b" }}>
            {selectedRatios.length}/{ratioOptionValues.length} ratios selected
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
          {ratioOptions.map(({ ratio, count, percent }) => (
            <label key={ratio} style={{ marginRight: 16, opacity: useTrickyRule ? 0.4 : 1 }}>
              <input
                type="checkbox"
                checked={selectedRatios.includes(ratio)}
                onChange={() => handleRatioToggle(ratio)}
                disabled={useTrickyRule}
                style={{ marginRight: 6 }}
              />
              {ratio} ({count} draws, {percent}%)
            </label>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
          Ratios apply to all 8 numbers. Only ratios observed in selected window are shown.
        </div>
      </CollapsibleSection>

      <CollapsibleSection panelId="odd-even-ratio-cadence" title={<b>Odd/Even Ratio Cadence</b>} summaryHint="Observed ratio timeline and intervals" defaultOpen={false}>
        <OddEvenRatioCadencePanel draws={realFilteredHistory} />
      </CollapsibleSection>

      <CollapsibleSection
        panelId="scoring-system-diagnostics"
        title={<b>Scoring System Diagnostics</b>}
        summaryHint={scoringGenerationInfluence === "off"
          ? "observe-only base, full-history, and WFMQYH scores"
          : `generation influence: ${formatScoringInfluenceLabel(scoringGenerationInfluence)}`}
        defaultOpen={false}
      >
        <ScoringSystemDiagnosticsPanel
          realHistory={realHistory}
          realFilteredHistory={realFilteredHistory}
          generationInfluence={scoringGenerationInfluence}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 05 Survival Analyzer */}
      <CollapsibleSection panelId="survival-analyzer" title={<b>Survival Analyzer</b>} defaultOpen={false}>
        <SurvivalAnalyzer
          history={baselineHistory}
          excludedNumbers={allExclusions}
          probabilityHeading="Probability of Appearance in Next Draw (Per Number):"
          externalWindowSize={baselineHistory.length}
          historyScopeLabel={baselineHistoryScopeLabel}
          enableSDE1Global={knobs.enableSDE1}
          enableHC3Global={knobs.enableHC3}
          hideBiasToggles={true}
          forcedNumbers={generationForcedNumbers}
          selectedCheckNumbers={selectedNumbers}
          focusNumber={focusNumber}
          highlightColor="#3BD759"
          onSelectionChange={setSelectedNumbers}
          patternsSelected={selectedWindowPatterns}
          onStats={(rows) => setSurvivalOut(rows)}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 06 Temperature Transition */}
      <CollapsibleSection panelId="temperature-transition" title={<b>Temperature Transition</b>} defaultOpen={false}>
        <TemperatureTransitionPanel
          history={baselineHistory}
          historyScopeLabel={baselineHistoryScopeLabel}
          alpha={0.25}
          metric={tempMetric}
          buckets={10}
          bucketStops={[0.05, 0.12, 0.20, 0.30, 0.42, 0.55, 0.68, 0.82, 0.92]}
          hybridWeight={0.6}
          emaNormalize="per-number"
          enforcePeaks={true}
          trendLookback={4}
          trendDelta={0.02}
          trendReversal={true}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 07 Monte Carlo Analyzer */}
      <CollapsibleSection panelId="monte-carlo-analyzer" title={<b>Monte Carlo Analyzer</b>} defaultOpen={false}>
        <MonteCarloPanel
          history={realFilteredHistory}
          historyScopeLabel={`Current WFMQYH window (${realFilteredHistory.length} real draws)`}
          enableSDE1={knobs.enableSDE1}
          excludedNumbers={allExclusions}
          trendWeights={trendWeights}
          defaultWindow={activeWindowSize}
          showSimulation={true}
          forcedNumbers={generationForcedNumbers}
          selectedCheckNumbers={selectedNumbers}
          externalFocusNumber={focusNumber}
          onFocusChange={setFocusNumber}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 07.05 Drought-break shortlist */}
      <CollapsibleSection
        panelId="drought-break-shortlist"
        title={<b>Drought-break shortlist (mains + supps)</b>}
        summaryHint={`Strict drought support · forced selections ${droughtBreakSelectedNumbers.length}/${MAX_DROUGHT_BREAK_FORCED_NUMBERS}`}
        defaultOpen={false}
      >
        <DroughtHazardPanel
          history={realFilteredHistory}
          fullHistory={realHistory}
          top={8}
          title="Drought-break shortlist (mains + supps)"
          bucketLabels={monthlyBucketLabels}
          forcedNumbers={droughtBreakSelectedNumbers}
          excludedNumbers={selectionUnavailableNumbers}
          maxForcedSelections={MAX_DROUGHT_BREAK_FORCED_NUMBERS}
          onToggleNumber={toggleDroughtBreakSelectedNumber}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 07.1 Most Likely NOT Drawn */}
      <CollapsibleSection panelId="most-likely-not-drawn" title={<b>Most Likely NOT Drawn</b>} defaultOpen={false}>
        <MostLikelyNotDrawnPanel history={realFilteredHistory} allHistory={realHistory} title="Most Likely NOT Drawn" />
      </CollapsibleSection>

      <WorkflowAnchor
        id="workflow-validation"
        title="Validation"
        summary="Use backtests and diagnostics to separate promising evidence from pattern noise before trusting a workflow."
      />

      {/* [ORDER-ANCHOR] 07.16 Research Diary & Draw Reminders */}
      <CollapsibleSection panelId="research-diary" title={<b>Research Diary & Draw Reminders</b>} summaryHint="observe-only recurring draw-context reminders" defaultOpen={false}>
        <ResearchDiaryPanel
          history={realHistory}
          getSetupSnapshot={() => buildSnapshot({ includePanelFavorites: true })}
          sde1Hc3Backtest={sde1Hc3ContextBacktest}
          showTitle={false}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 07.2 Backtest Validation Dashboard */}
      <CollapsibleSection panelId="backtest-validation" title={<b>Backtest Validation</b>} defaultOpen={false}>
        <BacktestPanel history={baselineHistory} historyScopeLabel={baselineHistoryScopeLabel} />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 07.21 Strict Drought Shortlist Replay */}
      <CollapsibleSection
        panelId="strict-drought-shortlist-replay"
        title={<b>Strict Drought Shortlist Replay</b>}
        summaryHint="no-lookahead drought-break validation"
        defaultOpen={false}
      >
        <DroughtBacktestPanel history={baselineHistory} historyScopeLabel={baselineHistoryScopeLabel} />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 07.22 Settings Sensitivity Replay */}
      <CollapsibleSection
        panelId="settings-sensitivity-replay"
        title={<b>Settings Sensitivity Replay</b>}
        summaryHint="Retrospective target-draw scoring without changing generation"
        defaultOpen={false}
      >
        <SettingsSensitivityReplayPanel
          history={realHistory}
          activeHistory={realFilteredHistory}
          generatedCandidates={candidates}
          pasteWeightedCandidates={pasteWeightedPortfolioCandidates}
          historyScopeLabel={`Current WFMQYH window (${realFilteredHistory.length} real draw${realFilteredHistory.length === 1 ? "" : "s"})`}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 07.25 Previous ±1/±2 Neighbour Diagnostics */}
      <CollapsibleSection panelId="previous-neighbour-backtest" title={<b>Previous ±1/±2 Neighbour Diagnostics</b>} summaryHint="observe-only adjacent-neighbour diagnostics" defaultOpen={false}>
        <PreviousNeighbourBacktestPanel
          draws={realFilteredHistory}
          userSelectedNumbers={userSelectedNumbers}
          excludedNumbers={selectionUnavailableNumbers}
          onToggleUserSelectedNumber={toggleSharedUserSelectedNumber}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 08 Trend Ratio Diagnostics */}
      <CollapsibleSection panelId="trend-ratio-history" title={<b>Trend Ratio Diagnostics (Up / Down / Flat, mains + supps)</b>} defaultOpen={false}>
        <TrendRatioHistoryPanel
          stats={historicalTrendRatioStats}
          allowedTrendRatios={allowedTrendRatios}
          toggleTrendRatio={toggleTrendRatio}
          lookback={trendLookback}
          threshold={trendThreshold}
          drawsConsidered={trendRatioEligibleDraws}
          windowDraws={realFilteredHistory.length}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 09 Group Pattern Analyzer */}
      <CollapsibleSection panelId="group-pattern-analyzer" title={<b>Group Pattern Analyzer</b>} defaultOpen={false}>
        <GroupPatternPanel key={zpaReloadKey} history={realFilteredHistory} groups={custom} />
        <GlobalZoneWeighting />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 10 Pattern Stats */}
      <CollapsibleSection panelId="pattern-stats" title={<b>Pattern Stats</b>} summaryHint="collapsed" defaultOpen={false}>
        <div style={{ overflowX: "auto", fontSize: 12, marginTop: 8, background: "#fff", border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
          <PatternStatsPanel draws={realFilteredHistory} numBins={10} />
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 11 Number Frequency */}
      <CollapsibleSection panelId="number-frequency" title={<b>Number Frequency</b>} summaryHint="compact, collapsed" defaultOpen={false}>
        <div style={{ overflowX: "auto", fontSize: 12, marginTop: 8 }}>
          <NumberFrequencyPanel draws={realFilteredHistory} allDraws={realHistory} />
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 11.25 Draw Bucket Patterns */}
      <CollapsibleSection panelId="draw-bucket-patterns" title={<b>Draw Bucket Patterns</b>} summaryHint="terminal digits, main+supp" defaultOpen={false}>
        <div style={{ marginTop: 8 }}>
          <DrawBucketPatternPanel
            draws={realFilteredHistory}
            allDraws={realHistory}
            planningMonthLabel={planningDrawContext.targetMonthLabel}
            planningMonthExpectedDrawCount={planningDrawContext.targetMonthExpectedDrawCount}
            planningMonthIsReset={planningDrawContext.isPlanningReset}
          />
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 11.35 Ending Digit Sequences */}
      <CollapsibleSection panelId="ending-digit-sequences" title={<b>Ending Digit Sequences</b>} summaryHint="consecutive ending-digit runs" defaultOpen={false}>
        <div style={{ marginTop: 8 }}>
          <EndingDigitSequencePanel draws={realFilteredHistory} allDraws={realHistory} />
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 11.5 Adjacent Combos (Pairs/Triples) */}
      <CollapsibleSection panelId="adjacent-combos" title={<b>Adjacent Combos (Pairs / Triples)</b>} summaryHint="Runs, gaps, recent streaks" defaultOpen={false}>
        <AdjacentCombosPanel history={realFilteredHistory} allHistory={realHistory} />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 12 Window Stats (Low/Mid/High, Odd/Even, Sum) */}
      <CollapsibleSection panelId="window-stats" title={<b>Window Stats (Low/Mid/High, Odd/Even, Sum)</b>} summaryHint="WFMQYH" defaultOpen={false}>
        <div style={{ marginTop: 8 }}>
          <WindowStatsPanel
            draws={realFilteredHistory}
            sumMin={0}
            sumMax={999}
            includeSupp={true}
            onSumFilterChange={() => {}}
            patternsSelected={selectedWindowPatterns}
            constraintMode={patternConstraintMode}
            patternBoostFactor={patternBoostFactor}
            sumTolerance={patternSumTolerance}
            onTogglePattern={(p) => {
              setSelectedWindowPatterns(prev => {
                const exists = prev.some(x => (
                  x.low === p.low && x.high === p.high &&
                  x.odd === p.odd && x.even === p.even && x.sum === p.sum
                ));
                return exists
                  ? prev.filter(x => !(
                    x.low === p.low && x.high === p.high &&
                    x.odd === p.odd && x.even === p.even && x.sum === p.sum
                  ))
                  : [...prev, p];
              });
            }}
          />
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 13 Target Set Quick Stats */}
      <CollapsibleSection panelId="target-set-quick-stats" title={<b>Target Set Quick Stats</b>} defaultOpen={false}>
        <TargetSetQuickStatsPanel forcedNumbers={generationForcedNumbers} selectedNumbers={userSelectedNumbers} />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 14 Advanced Survival Analysis & Churn/Return Diagnostic Models */}
      <CollapsibleSection panelId="survival-churn-diagnostic-models" title={<b>Advanced Survival Analysis & Churn/Return Diagnostic Models</b>} defaultOpen={false}>
        <div style={{ marginTop: 12 }}>
          <ChurnPredictor dataset={churnDataset} totalDraws={activeWindowProvenance.realDraws} minDraws={36} modelType="rf" onPredictions={setChurnOut} />
          <ReturnPredictor dataset={churnDataset} totalDraws={activeWindowProvenance.realDraws} minDraws={36} modelType="rf" onPredictions={setReturnOut} />

          <UserExclusionsStrip
            title="User Exclusions"
            excludedNumbers={excludedNumbers}
            setExcludedNumbers={setExcludedNumbers}
            orientation="horizontal"
            labelPosition="bottom"
            showClearButton={true}
            monthlyBuckets={monthlyBucketSetsAlways ?? monthlyConstraintPayload?.buckets}
          />

          <MultiStateChurnPanel history={realFilteredHistory} excludedNumbers={allExclusions} churnThreshold={15} />
          <SurvivalCoxPanel history={realFilteredHistory} excludedNumbers={allExclusions} />
          <SurvivalFrailtyPanel
            history={realFilteredHistory}
            excludedNumbers={allExclusions}
            exclusionsSlot={
              <UserExclusionsStrip
                title="User Exclusions"
                excludedNumbers={excludedNumbers}
                setExcludedNumbers={setExcludedNumbers}
                orientation="horizontal"
                labelPosition="bottom"
                showClearButton={true}
                monthlyBuckets={monthlyBucketSetsAlways ?? monthlyConstraintPayload?.buckets}
              />
            }
          />
          <ConsensusPanel survival={survivalOut} churn={churnOut} reactivate={returnOut} />
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 16 State Presets */}
      <CollapsibleSection panelId="state-presets" title={<b>State Presets</b>} summaryHint="Save and recall all current options" defaultOpen={false}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", background: "#f7fafe", border: "1px solid #e3f2fd", padding: 10, borderRadius: 6, marginTop: 8 }}>
          <label>
            Preset:
            <select value={selectedPresetId} onChange={(e) => setSelectedPresetId(e.target.value)} style={{ marginLeft: 6, minWidth: 220 }}>
              <option value="">— select —</option>
              {presets.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </label>
          <button onClick={() => { if (!selectedPresetId) return; const p = getPreset(selectedPresetId); if (!p) return; applySnapshot(p.state); }} disabled={!selectedPresetId}>Load</button>
          <button onClick={() => { if (!selectedPresetId) return; const snap = buildSnapshot({ includePanelFavorites: includePanelFavoritesInPreset }); updatePreset(selectedPresetId, snap); setPresets(listPresets()); }} disabled={!selectedPresetId}>Update from current</button>
          <button onClick={() => { if (!selectedPresetId) return; deletePresetLS(selectedPresetId); setPresets(listPresets()); setSelectedPresetId(""); }} disabled={!selectedPresetId}>Delete</button>
          <button onClick={async () => { if (!selectedPresetId) return; const json = exportPresetJSON(selectedPresetId); if (!json) return; const blob = new Blob([json], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "windfall-preset.json"; a.click(); URL.revokeObjectURL(url); }} disabled={!selectedPresetId}>Export</button>
          <span style={{ marginLeft: 12 }}>
            <label>
              New name:
              <input type="text" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} placeholder="e.g., Quarter+ZPA-G7" style={{ marginLeft: 6, width: 200 }} />
            </label>
            <button onClick={() => { const name = newPresetName.trim() || `Preset ${presets.length + 1}`; const snap = buildSnapshot({ includePanelFavorites: includePanelFavoritesInPreset }); const created = saveNewPreset(name, snap); setPresets(listPresets()); setSelectedPresetId(created.id); setNewPresetName(""); }} style={{ marginLeft: 8 }}>Save Current</button>
          </span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={includePanelFavoritesInPreset}
              onChange={(e) => setIncludePanelFavoritesInPreset(e.target.checked)}
            />
            Include panel favorites in preset
          </label>
          <span style={{ marginLeft: "auto" }}>
            <label style={{ marginRight: 6 }}>
              Import:
              <input type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const reader = new FileReader(); reader.onload = (evt) => { const text = String(evt.target?.result || ""); const imported = importPresetJSON(text); if (imported) { setPresets(listPresets()); setSelectedPresetId(imported.id); } }; reader.readAsText(f); e.currentTarget.value = ""; }} style={{ marginLeft: 6 }} />
            </label>
          </span>
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 17 Trend Ratio Filter (UP / DOWN / FLAT) */}
      <CollapsibleSection panelId="trend-ratio-filter" title={<b>Trend Ratio Filter (UP / DOWN / FLAT)</b>} defaultOpen={false}>
        <div style={{ marginTop: 6, fontSize: 11, color: "#555" }}>
          Use the Add/On controls in Trend Ratio Diagnostics to toggle active U/D/F ratio filtering. Default state is off; selected ratios are passed into generation and shown in Trace.
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 18 Parameter Search */}
      <CollapsibleSection panelId="parameter-search" title={<b>Parameter Search</b>} defaultOpen={false}>
        <ParameterSearchPanel
          userSelectedNumbers={userSelectedNumbers}
          weightedTargets={weightedTargets}
          forcedNumbers={generationForcedNumbers}
          excludedNumbers={effectiveExcludedNumbers}
          recentSignal={temperatureSignal}
          conditionalProb={ conditionalProb}
          onAdoptParameters={p => setBatesParams(p)}
          onProbabilityUpdate={p => setProbOverlay(p)}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 19 Bates Weighting Panel */}
      <CollapsibleSection panelId="bates-weighting" title={<b>Bates Weighting Panel</b>} defaultOpen={false}>
        <BatesPanel
          excludedNumbers={effectiveExcludedNumbers}
          forcedNumbers={generationForcedNumbers}
          recentSignal={temperatureSignal}
          conditionalProb={conditionalProb}
          controlledParams={batesParams}
          onParamsChange={p => setBatesParams(p)}
          probabilityOverlay={probOverlay}
          onDiagnostics={() => {}}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 20 Weighted Target List */}
      <CollapsibleSection panelId="weighted-target-list" title={<b>Weighted Target List</b>} defaultOpen={false}>
        <WeightedTargetListPanel userSelectedNumbers={userSelectedNumbers} weightedTargets={weightedTargets} setWeightedTargets={setWeightedTargets} />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 21 Modulation Diagnostics */}
      <CollapsibleSection panelId="modulation-diagnostics" title={<b>Modulation Diagnostics</b>} defaultOpen={false}>
        <ModulationDiagnosticsPanel diagnostics={null} currentBatesParams={batesParams as any} />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 21.5 Monthly Panels (relocated) */}
      <CollapsibleSection panelId="monthly-overlap" title={<b>Monthly Numbers Overlap</b>} defaultOpen={false} summaryHint="Selected draw vs earlier draws each month">
        <MonthlyOverlapPanel history={realHistory} today={planningDrawContext.today} />
      </CollapsibleSection>

      <CollapsibleSection panelId="monthly-first-last-hits" title={<b>Monthly First ↔ Last Draw Hits</b>} defaultOpen={false} summaryHint="Hits between first & last draw within / across months">
        <MonthlyFirstLastPanel history={realHistory} />
      </CollapsibleSection>

      <CollapsibleSection panelId="monthly-draws-summary" title={<b>Monthly Draws Summary</b>} defaultOpen={false} summaryHint="All drawn numbers per month with counts">
        <MonthlyDrawsSummaryPanel
          history={realHistory}
          today={planningDrawContext.today}
          sde1Hc3Advice={sde1Hc3ContextBacktest.advice}
          onConstraintsChange={handleMonthlyConstraintsChange}
          onUseSelectedNumbers={(nums) => setUserSelectedNumbers(removeUserExcludedNumbers(nums, selectionUnavailableNumbers))}
          excludedNumbers={selectionUnavailableNumbers}
          constructiveFillEnabled={monthlyConstructiveEnabled}
          onConstructiveFillChange={setMonthlyConstructiveEnabled}
          onBucketInfoChange={handleMonthlyBucketInfoChange}
          onBucketSetsChange={handleMonthlyBucketSetsChange}
          onAvgBucketsChange={handleMonthlyAvgBucketsChange}
          onIdealDrawStateChange={handleMonthlyIdealDrawStateChange}
          onStageIdealDrawStateChange={handleStageIdealDrawStateChange}
          onSimulateNumbers={handleSimulateAcceptanceNeeds}
        />
      </CollapsibleSection>

      <CollapsibleSection panelId="monthly-bucket-transition-lab" title={<b>Monthly Bucket Transition Lab</b>} defaultOpen={false} summaryHint="Observe bucket movement, survival, and month-length differences">
        <MonthlyBucketTransitionLabPanel history={realHistory} />
      </CollapsibleSection>

      <CollapsibleSection panelId="month-end-carry-over-buckets" title={<b>Month-End Carry-Over Buckets</b>} defaultOpen={false} summaryHint="Last draw → first draw by monthly frequency bucket">
        <MonthEndCarryOverBucketsPanel
          history={realHistory}
          selectedBoostNumbers={selectedCarryOverBoostNumbers}
          excludedNumbers={selectionUnavailableNumbers}
          onToggleBoostNumber={toggleSelectedCarryOverBoostNumber}
        />
      </CollapsibleSection>

      <CollapsibleSection panelId="monthly-digit-occurrences" title={<b>Monthly 1-Digit vs 2-Digit Occurrences</b>} defaultOpen={false} summaryHint="Monthly counts for numbers 1–9 versus 10–45">
        <MonthlyDigitOccurrencePanel history={realHistory} />
      </CollapsibleSection>

      <CollapsibleSection panelId="hot-cold-ranking" title={<b>Hot vs Cold Ranking</b>} defaultOpen={false} summaryHint="Historical vs recent vs weighted number heat">
        <HotColdRankingPanel
          history={realHistory}
          wfmqyhWindowSize={activeWindowSize}
          forcedNumbers={hotColdForcedNumbers}
          excludedNumbers={hotColdExcludedNumbers}
          lockedExcludedNumbers={selectionUnavailableNumbers}
          onToggleForcedNumber={toggleHotColdForcedNumber}
          onToggleExcludedNumber={toggleHotColdExcludedNumber}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 21.95 Prediction Journal & Scorecard */}
      <CollapsibleSection
        panelId="prediction-journal"
        title={<b>Prediction Journal & Scorecard</b>}
        summaryHint="observe-only saved hypotheses and post-draw scorecard"
        defaultOpen={false}
        open={predictionJournalOpen}
        onOpenChange={setPredictionJournalOpen}
        headerActions={
          <>
            <HigButton
              size="compact"
              variant="secondary"
              onClick={handleViewPredictionEntries}
              title="Open saved prediction journal entries without opening the draft form"
            >
              View Entries
            </HigButton>
            <HigButton
              size="compact"
              variant="primary"
              onClick={handleNewPredictionDraft}
              title="Open the journal and prefill a new prediction from the current app setup"
            >
              New Prediction
            </HigButton>
          </>
        }
      >
        <PredictionJournalPanel
          history={realHistory}
          getSetupSnapshot={() => buildSnapshot({ includePanelFavorites: true, includeDerivedPredictionEvidence: true })}
          newPredictionDraft={predictionJournalDraftRequest}
          viewEntriesRequestId={predictionJournalEntriesRequestId || undefined}
        />
      </CollapsibleSection>

      <WorkflowAnchor
        id="workflow-generation"
        title="Generation"
        summary="Create, compare, compress, and simulate candidate sets while keeping generation rules visible."
      />

      {/* [ORDER-ANCHOR] 22 User Selected Numbers */}
      <CollapsibleSection panelId="user-selected-numbers" title={<b>User Selected Numbers</b>} defaultOpen={true}>
        <UserSelectedNumbersPanel
          userSelectedNumbers={userSelectedNumbers}
          setUserSelectedNumbers={setUserSelectedNumbers}
          excludedNumbers={selectionUnavailableNumbers}
          externalSelectedNumbers={droughtBreakSelectedNumbers}
          externalSelectedLabel="Drought-break shortlist"
          autoExcludeUnselected={autoExcludeUnselected}
          onToggleAutoExclude={setAutoExcludeUnselected}
          monthlyBuckets={monthlyBucketSetsAlways ?? monthlyConstraintPayload?.buckets ?? null}
          onSimulate={(nums) => {
            if (!nums || nums.length < 6) {
              setSimulatedDraw(null);
              setSimSource('none');
              setSimCandidateIdx(null);
              return;
            }
            const main = nums.slice(0, 6).sort((a, b) => a - b);
            const supp = nums.slice(6, 8).sort((a, b) => a - b);
            setSimulatedDraw({ main, supp, date: "UserSim", isSimulated: true } as any);
            setSimSource('user');
            setSimCandidateIdx(null);
            scrollToDGA();
          }}
          onClear={() => {
            setSimulatedDraw(null);
            setSimSource('none');
            setSimCandidateIdx(null);
          }}
          isSimulatingUser={simSource === 'user'}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 23 Selection Insights */}
      <CollapsibleSection panelId="selection-insights" title={<b>Selection Insights</b>} defaultOpen={false}>
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={insightsEnabled}
              onChange={(e) => setInsightsEnabled(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Show Selection Insights
          </label>
        </div>

        {insightsEnabled && (
          <div className="windfall-selection-insights-grid">
            {/* Windowed (WFMQYH) version */}
            <div className="windfall-selection-insights-card">
              <div className="windfall-selection-insights-card__title">Windowed (WFMQYH)</div>
              <SelectionInsightsPanel
                history={realFilteredHistory}
                selected={userSelectedNumbers}
                topKTriplets={10}
                historyWindowName={`${historyWindowName} (WFMQYH)`}
                ogaHistory={realFilteredHistory}
                autoComputeOGARaw={false}
                lazyThreshold={400}
                useIdleCallback={true}
              />
            </div>

            {/* All History version */}
            <div className="windfall-selection-insights-card">
              <div className="windfall-selection-insights-card__title">All History</div>
              <SelectionInsightsPanel
                history={realHistory}
                selected={userSelectedNumbers}
                topKTriplets={10}
                historyWindowName={`All History`}
                ogaHistory={realHistory}
                autoComputeOGARaw={false}
                lazyThreshold={400}
                useIdleCallback={true}
              />
            </div>

            <div className="windfall-selection-insights-card">
              <div className="windfall-selection-insights-card__title">Predicted</div>
              <SelectionInsightsPredictionPanel
                windowAnalytics={selectionInsightsWindowAnalytics}
                allHistoryAnalytics={selectionInsightsAllHistoryAnalytics}
                title="Predicted"
              />
            </div>
          </div>
        )}
      </CollapsibleSection>

          <CollapsibleSection
            panelId="candidate-generation-influences"
            title={<b>Candidate Generation Setup</b>}
            summaryHint="Configure filters, weighting, evidence, and forced/excluded numbers before generation"
            defaultOpen={true}
          >
            <div className="windfall-generation-setup-summary-strip" aria-label="Active generation setup summary">
              <span className="windfall-generation-setup-summary-chip">Forced {generationForcedNumbers.length}</span>
              <span className="windfall-generation-setup-summary-chip">Excluded {allExclusions.length}</span>
              <span className="windfall-generation-setup-summary-chip">Ratios {selectedRatios.length ? selectedRatios.join(" ") : "off"}</span>
              <span className="windfall-generation-setup-summary-chip">Scoring {formatScoringInfluenceLabel(scoringGenerationInfluence)}</span>
              <span className="windfall-generation-setup-summary-chip">D1 SGI {d1TerminalMomentumSgiEnabled ? formatD1TerminalMomentumStrength(d1TerminalMomentumGenerationProfile.internalStrength) : "off"}</span>
              <span className="windfall-generation-setup-summary-chip">LD±1 {latestNeighbourSupportEnabled ? "on" : "off"}</span>
              <span className="windfall-generation-setup-summary-chip">Rdy filters {readinessHardFilterSummary}</span>
              <span className="windfall-generation-setup-summary-chip">Carry-over {monthEndCarryOverBiasEnabled ? monthEndCarryOverStrengthSettings.label : "off"}</span>
              <span className="windfall-generation-setup-summary-chip">Stage IDM {stageIdealDrawState ? `${stageIdealDrawState.comparableMonthCount} comps` : "unavailable"}</span>
            </div>

            <div className="windfall-generation-setup-stack">
              <InlineCollapsibleCard
                id={ACTIVE_SETUP_PROVENANCE_TARGET_IDS.geometryPattern}
                title="Engine & Ranking"
                subtitle="Ranking references, OGA forecast bias, diagnostic influence, recency weighting, and GPWF controls."
                collapsedSummary={`Scoring ${formatScoringInfluenceLabel(scoringGenerationInfluence)} · D1 SGI ${d1TerminalMomentumSgiEnabled ? formatD1TerminalMomentumStrength(d1TerminalMomentumGenerationProfile.internalStrength) : "off"} · OGA ${ogaRefMode} · KDE ${enableOGAForecastBias ? "on" : "off"} · λ ${lambdaEnabled ? lambda.toFixed(2) : "off"} · GPWF ${gpwfEnabled ? "on" : "off"}`}
                defaultExpanded={true}
                expanded={engineRankingExpanded}
                onExpandedChange={setEngineRankingExpanded}
              >
                <div className="windfall-influences-grid">
              <div className="windfall-influence-card windfall-influence-card--wide">
                <h3 className="windfall-influence-card__title">OGA Reference And Ranking</h3>
                <p className="windfall-influence-card__subtitle">
                  Geometry reference settings and ranking weights used when candidates are scored, sorted, and explained.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
                  <HigField label="OGA reference" help="Windowed uses the active WFMQYH history. Full History uses every valid draw loaded in the app.">
                    <select
                      value={ogaRefMode}
                      onChange={(e) => setOgaRefMode(e.target.value as any)}
                      style={{ width: "100%" }}
                    >
                      <option value="window">Windowed</option>
                      <option value="all">Full History</option>
                    </select>
                  </HigField>
                  <HigField label="Windowed Spokes" help="Controls the number of spokes used by OGA geometry calculations and forecast bias diagnostics.">
                    <input
                      type="number"
                      min={3}
                      max={15}
                      step={1}
                      value={ogaSpokeCount}
                      onChange={(e) => setOgaSpokeCount(Math.max(1, Math.min(45, Number(e.target.value) || 9)))}
                      style={{ width: "100%" }}
                    />
                  </HigField>
                  <HigField label="OGA Top" help="Post-process count retained by OGA ranking when the OGA path is active.">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={octagonalTop}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (Number.isFinite(value) && value >= 1) setOctagonalTop(Math.floor(value));
                      }}
                      style={{ width: "100%" }}
                    />
                  </HigField>
                </div>
                <RankingWeightsPanel
                  weights={rankingWeights}
                  setWeights={setRankingWeights}
                  scope="oga"
                  title="OGA Survivor Weight"
                />

                {/* OGA Forecast Bias (KDE) */}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed #d7dde8" }}>
                  <div style={{ fontWeight: 800, marginBottom: 6, color: "#0f172a" }}>OGA Forecast Bias (KDE)</div>
                  <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: 12, lineHeight: 1.4 }}>
                    Optional generation acceptance bias from the OGA forecast distribution. This is diagnostic evidence, not a probability guarantee.
                  </p>
                  <label style={{ display: "block", marginBottom: 8, fontSize: 12, fontWeight: 800 }}>
                    <input type="checkbox" checked={enableOGAForecastBias} onChange={(e) => setEnableOGAForecastBias(e.target.checked)} style={{ marginRight: 6 }} />
                    Enable bias by Next Draw OGA forecast
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end", marginBottom: 8 }}>
                    <HigField label="Forecast baseline" help="Windowed uses the active WFMQYH history. Full History uses every valid real draw loaded in the app.">
                      <select value={ogaBaselineMode} onChange={(e) => setOGABaselineMode(e.target.value as any)} style={{ width: "100%" }}>
                        <option value="window">Windowed</option>
                        <option value="all">Full History</option>
                      </select>
                    </HigField>
                    <HigField label="Preferred band" help="Auto chooses the strongest KDE-supported band. Manual bands restrict candidates by low, mid, or high OGA region.">
                      <select value={ogaPreferredBand} onChange={(e) => setOGAPreferredBand(e.target.value as any)} style={{ width: "100%" }}>
                        <option value="auto">Auto</option>
                        <option value="low">Low (≤p10)</option>
                        <option value="mid">Mid (p10–p90)</option>
                        <option value="high">High (≥p90)</option>
                      </select>
                    </HigField>
                  </div>
                  {(() => {
                    const dec = forecastOGA(realFilteredHistory, ogaBaselineMode === 'window' ? realFilteredHistory : realHistory, ogaSpokeCount).deciles;
                    const thresholds = dec?.thresholds || [];
                    return (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#334155" }}>Preferred decile bands</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                          {Array.from({ length: 10 }, (_, i) => i).map((i) => (
                            <label key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 6px', background: "#fff", fontSize: 12 }}>
                              <input
                                type="checkbox"
                                checked={ogaPreferredDeciles.some(d => d.index === i)}
                                onChange={() => {
                                  setOGAPreferredDeciles(prev => {
                                    const exists = prev.some(d => d.index === i);
                                    if (exists) return prev.filter(d => d.index !== i);
                                    return [...prev, { index: i, weight: 1 }];
                                  });
                                }}
                                style={{ marginRight: 6 }}
                              />
                              D{i} {thresholds[i - 1] !== undefined ? `≥ ${thresholds[i - 1].toFixed(2)}` : '(min)'}
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={ogaPreferredDeciles.find(d => d.index === i)?.weight ?? 1}
                                onChange={(e) => {
                                  const w = Number(e.target.value);
                                  setOGAPreferredDeciles(prev => {
                                    const idx = prev.findIndex(d => d.index === i);
                                    if (idx >= 0) {
                                      const next = prev.slice();
                                      next[idx] = { ...next[idx], weight: w };
                                      return next;
                                    }
                                    return [...prev, { index: i, weight: w }];
                                  });
                                }}
                                style={{ width: 60, marginLeft: 6 }}
                                title="Weight"
                              />
                            </label>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 5, lineHeight: 1.4 }}>
                          Select one or more deciles and assign weights; candidates whose OGA falls in selected deciles are accepted with probability proportional to weight. If none are selected, low/mid/high is used.
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="windfall-influence-card">
                <h3 className="windfall-influence-card__title">Generation Engine Controls</h3>
                <p className="windfall-influence-card__subtitle">
                  Recency weighting and GPWF frequency weighting used inside the main generation engine.
                </p>
                <div className="windfall-influence-row-list">
                  <HigField
                    label="Scoring diagnostics influence"
                    help="Uses Scoring System Diagnostics as diagnostic evidence weighting during candidate construction. This is not a probability and does not override legal exclusions or selected quotas."
                  >
                    <select
                      name="scoringGenerationInfluence"
                      value={scoringGenerationInfluence}
                      onChange={(event) => setScoringGenerationInfluence(event.target.value as ScoringGenerationInfluence)}
                      style={{ width: "100%" }}
                    >
                      <option value="off">Off</option>
                      <option value="light">Light</option>
                      <option value="normal">Normal</option>
                      <option value="strong">Strong</option>
                    </select>
                  </HigField>
                  <p style={{ margin: 0, color: "#64748b", fontSize: 12, lineHeight: 1.4 }}>
                    Applies the Numbers diagnostic evidence weighting before candidate filters run; selected constraints still decide which candidates survive.
                  </p>
                  <div style={{ height: 1, background: "#e5e7eb", margin: "2px 0" }} aria-hidden="true" />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={d1TerminalMomentumSgiEnabled}
                      onChange={(event) => setD1TerminalMomentumSgiEnabled(event.target.checked)}
                    />
                    D1 terminal momentum SGI
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 8px", alignItems: "center", fontSize: 12, lineHeight: 1.4 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 999,
                        border: `1px solid ${d1TerminalMomentumGenerationProfile.enabled ? "#f0abfc" : "#dbe3ec"}`,
                        background: d1TerminalMomentumGenerationProfile.enabled ? "#fdf4ff" : "#f8fafc",
                        color: d1TerminalMomentumGenerationProfile.enabled ? "#86198f" : "#64748b",
                        fontWeight: 900,
                        padding: "2px 8px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Internal {d1TerminalMomentumSgiEnabled ? formatD1TerminalMomentumStrength(d1TerminalMomentumGenerationProfile.internalStrength) : "Off"}
                    </span>
                    <span style={{ color: "#64748b" }}>
                      {d1TerminalMomentumGenerationProfile.targetDrawNumber
                        ? `${d1TerminalMomentumGenerationProfile.monthLabel} target D${d1TerminalMomentumGenerationProfile.targetDrawNumber} · ${d1TerminalMomentumGenerationProfile.stageMode === "early-unique" ? "early unique expansion" : d1TerminalMomentumGenerationProfile.stageMode === "terminal-momentum" ? "terminal momentum" : d1TerminalMomentumGenerationProfile.stageMode === "closed-review" ? "closed-month review" : "unavailable"}`
                        : "No current-month D1 evidence yet. The switch can be on, but generation receives no D1 SGI weighting until D1 exists."}
                    </span>
                    <span aria-hidden="true" />
                    <span style={{ color: "#64748b" }}>
                      User control is ON/OFF only. Windfall chooses off/light/normal/strong internally from prior-month evidence; this is soft weighting, not a hard filter.
                    </span>
                  </div>
                  <div style={{ height: 1, background: "#e5e7eb", margin: "2px 0" }} aria-hidden="true" />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={lambdaEnabled}
                      onChange={(e) => setLambdaEnabled(e.target.checked)}
                    />
                    Lambda recency weighting
                  </label>
                  <HigField label={`Lambda ${lambda.toFixed(2)}`} help="Higher values shift more influence toward recent draws. Disabled means the generator receives no Lambda adjustment.">
                    <HigSlider
                      min={0.2}
                      max={0.99}
                      step={0.01}
                      value={lambda}
                      disabled={!lambdaEnabled}
                      onCommit={setLambda}
                    />
                  </HigField>
                  <div style={{ height: 1, background: "#e5e7eb", margin: "2px 0" }} aria-hidden="true" />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={gpwfEnabled}
                      onChange={(e) => setGPWFEnabled(e.target.checked)}
                    />
                    GPWF weighted frequency
                  </label>
                  {(() => {
                    const gpwfMaxWindow = Math.max(3, Math.min(maxGPWFWindow, realFilteredHistory.length || maxGPWFWindow));
                    return (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
                        <HigField label="Window" help={`Recent draws considered, capped at ${gpwfMaxWindow}.`}>
                          <input
                            type="number"
                            min={3}
                            max={gpwfMaxWindow}
                            step={1}
                            value={gpwf_window_size}
                            disabled={!gpwfEnabled}
                            onChange={(e) => setGPWFWindowSize(Math.max(3, Math.min(gpwfMaxWindow, Number(e.target.value) || 3)))}
                            style={{ width: "100%" }}
                          />
                        </HigField>
                        <HigField label="Bias" help="Strength of recent frequency weighting.">
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={gpwf_bias_factor}
                            disabled={!gpwfEnabled}
                            onChange={(e) => setGPWFBiasFactor(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
                            style={{ width: "100%" }}
                          />
                        </HigField>
                        <HigField label="Floor" help="Minimum baseline weight retained for numbers.">
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={gpwf_floor}
                            disabled={!gpwfEnabled}
                            onChange={(e) => setGPWFFloor(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
                            style={{ width: "100%" }}
                          />
                        </HigField>
                        <HigField label="Scale" help="Scales the effect of raw recent frequency.">
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={gpwf_scale_multiplier}
                            disabled={!gpwfEnabled}
                            onChange={(e) => setGPWFScaleMultiplier(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
                            style={{ width: "100%" }}
                          />
                        </HigField>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="windfall-influence-card">
                <h3 className="windfall-influence-card__title">Readiness (Rdy) Scoring</h3>
                <p className="windfall-influence-card__subtitle">
                  Ranking weights for the Generated Candidates Rdy column. These sliders change score emphasis only; hard rejection thresholds live in Hard Filters.
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginBottom: 10 }}>
                  {RDY_WEIGHT_KEYS.map((key) => {
                    const copy = RDY_WEIGHT_COPY[key];
                    const isOff = rdyWeightOffState[key];
                    const storedPercent = Math.round(rdyWeights[key] * 100);
                    const effectivePercent = effectiveRdyPercentages[key];
                    return (
                      <div
                        key={key}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: 8,
                          padding: "9px 10px",
                          background: isOff ? "#f8fafc" : "#fff",
                          display: "grid",
                          gap: 7,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: "#0f172a", fontSize: 12, fontWeight: 900 }}>{copy.shortLabel}</div>
                            <div style={{ color: "#475569", fontSize: 11, fontWeight: 700 }}>{copy.label}</div>
                          </div>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#475569", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>
                            <input
                              type="checkbox"
                              checked={isOff}
                              onChange={(event) => setRdyWeightOffState((previous) => ({
                                ...previous,
                                [key]: event.target.checked,
                              }))}
                            />
                            Off
                          </label>
                        </div>
                        <div style={{ fontSize: 12, color: isOff ? "#64748b" : "#1565c0", fontWeight: 800 }}>
                          Effective {effectivePercent}%
                          {isOff && storedPercent > 0 ? <span style={{ color: "#64748b", fontWeight: 700 }}> · stored {storedPercent}%</span> : null}
                        </div>
                        <HigSlider
                          min={0}
                          max={1}
                          step={0.05}
                          value={rdyWeights[key]}
                          disabled={isOff}
                          onCommit={(value) => setRdyWeights((previous) => ({
                            ...previous,
                            [key]: Math.max(0, Math.min(1, value)),
                          }))}
                        />
                        <div style={{ color: "#64748b", fontSize: 11, lineHeight: 1.35 }}>
                          {copy.help}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ fontSize: 12, color: "#1565c0", background: "#e3f2fd", borderRadius: 4, padding: 8 }}>
                  <b>Effective weights:</b> {effectiveRdyPercentages.idm + effectiveRdyPercentages.conv + effectiveRdyPercentages.oga === 0
                    ? "inactive, all Rdy components are Off or 0%"
                    : <>IDM {effectiveRdyPercentages.idm}% · Conv {effectiveRdyPercentages.conv}% · OGA {effectiveRdyPercentages.oga}%</>}
                </div>
              </div>

                </div>
              </InlineCollapsibleCard>

              <InlineCollapsibleCard
                title="Number Biases"
                subtitle="User-selected number boost controls."
                collapsedSummary={`Selected boost ${selectedBoostEnabled ? `x${selectedBoostFactor}` : "off"} · user selected ${userSelectedNumbers.length}`}
                defaultExpanded={false}
              >
                <div className="windfall-influences-grid">
                  <div className="windfall-influence-card">
                    <h3 className="windfall-influence-card__title">Selected Number Boost</h3>
                    <p className="windfall-influence-card__subtitle">
                      Biases candidate construction toward User Selected numbers without overriding exclusions or forced-number limits.
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={selectedBoostEnabled}
                          onChange={(e) => setSelectedBoostEnabled(e.target.checked)}
                        />
                        Boost User Selected numbers during generation
                        <InfoHelp label="Selected-number boost help">
                          Biases generation toward your User Selected numbers before constraints are applied.
                        </InfoHelp>
                      </label>
                      <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                        Factor
                        <input
                          type="number"
                          min={1}
                          max={5}
                          step={0.25}
                          value={selectedBoostFactor}
                          disabled={!selectedBoostEnabled}
                          onChange={(e) => setSelectedBoostFactor(Math.max(1, Number(e.target.value) || 1))}
                          style={{ width: 70 }}
                        />
                        <InfoHelp label="Selected boost factor help">
                          Higher values increase selected-number pick weight during generation, while exclusions and forced numbers still apply.
                        </InfoHelp>
                      </label>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>
                      Applies only to generation weighting, not candidate ranking; still respects exclusions and forced numbers.
                    </p>
                  </div>
                </div>
              </InlineCollapsibleCard>

              <InlineCollapsibleCard
                id={ACTIVE_SETUP_SHAPE_BUCKET_CARD_ID}
                title="Shape & Bucket Quotas"
                subtitle="Ending-digit, decade, monthly bucket, and carry-over composition controls."
                collapsedSummary={`Digit width ${digitWidthConstraintTargets.enabled ? `${digitWidthConstraintTargets.singleDigitCount}/${digitWidthConstraintTargets.twoDigitCount}` : "off"} · MiAN ${acceptanceNeedsEnabled ? "on" : "off"} · ending boosts ${activeMainDigitBoostSummary || "off"} · decade ${activeMainDecadeBiasSummary || "off"} · MRB ${mrbEnabled ? "on" : "off"}`}
                defaultExpanded={false}
                expanded={shapeBucketQuotasExpanded}
                onExpandedChange={setShapeBucketQuotasExpanded}
              >
                <div className="windfall-influences-grid">
              {/* Column 1: Generation Constraints */}
              <div className="windfall-influence-card windfall-influence-card--wide">
                <h3 className="windfall-influence-card__title">Generation Constraints</h3>
                <p className="windfall-influence-card__subtitle">
                  Ending-digit, decade, monthly bucket, and carry-over rules that affect generated candidates.
                </p>

                <div className="windfall-constraint-sections">
                  <section
                    id={ACTIVE_SETUP_PROVENANCE_TARGET_IDS.endingBuckets}
                    className="windfall-constraint-section"
                    aria-labelledby="ending-digit-limits-title"
                    tabIndex={-1}
                  >
                    <div className="windfall-constraint-section__header">
                      <div id="ending-digit-limits-title" className="windfall-constraint-section__title">Ending Digit Limits</div>
                      <div className="windfall-constraint-section__subtitle">
                        Cap ending buckets and add targeted 1-digit or 2-digit generation boosts.
                      </div>
                    </div>
                    <div className="windfall-influence-legend">
                      <span className="windfall-influence-legend__item">
                        <span aria-hidden="true" className="windfall-influence-legend__dot windfall-influence-legend__dot--boost" />
                        <span>Amber row = boosted during generation; any positive 1-digit or 2-digit boost keeps that bucket eligible even when Max is Off.</span>
                      </span>
                      <span className="windfall-influence-legend__item">
                        <span aria-hidden="true" className="windfall-influence-legend__dot windfall-influence-legend__dot--punish" />
                        <span>Blue row = punished during generation; negative values reduce candidate weighting without fully excluding that decade.</span>
                      </span>
                    </div>
                    <div className="windfall-constraint-section__grid windfall-constraint-section__grid--ending">
                  {exactConstraintRows.map(({ key, label, helper, badge, max, enabled, setEnabled, count, setCount, singleDigitBoost, twoDigitBoost, setSingleDigitBoost, setTwoDigitBoost, title, bucketKey }) => {
                    const bucketSummary = generationConstraintBucketSummaries[bucketKey];
                    const maxDrawResultCount = Math.max(...bucketSummary.drawResultCounts.map(({ count }) => count), 0);
                    const bucketNumbers = generationConstraintNumberBuckets[bucketKey];
                    const hasSingleDigitNumbers = bucketNumbers.some((n) => n >= 1 && n <= 9);
                    const hasTwoDigitNumbers = bucketNumbers.some((n) => n >= 10);
                    const isBoosted = singleDigitBoost > 0 || twoDigitBoost > 0;
                    const boostBadgeParts = [
                      singleDigitBoost > 0 ? `1d +${singleDigitBoost}` : null,
                      twoDigitBoost > 0 ? `2d +${twoDigitBoost}` : null,
                    ].filter(Boolean) as string[];
                    return (
                      <div
                        key={key}
                        title={title}
                        style={{
                          display: "grid",
                          gap: 8,
                          padding: "6px 8px",
                          border: `1px solid ${isBoosted ? "#fbbf24" : "#eee"}`,
                          boxShadow: isBoosted ? "inset 4px 0 0 #f59e0b" : undefined,
                          borderRadius: 6,
                          background: isBoosted
                            ? (enabled ? "#fffaf0" : "#fffdf7")
                            : (enabled ? "#fafcff" : "#fcfcfc"),
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>{label}</span>
                            {badge && <span style={{ fontSize: 11, color: "#666" }}>{badge}</span>}
                            {isBoosted && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: "#92400e",
                                  background: "#fef3c7",
                                  border: "1px solid #fbbf24",
                                  borderRadius: 999,
                                  padding: "1px 7px",
                                  whiteSpace: "nowrap",
                                }}
                                title={`${boostBadgeParts.join(" • ")}: this bucket stays active in generation weighting even if Max is Off.`}
                              >
                                Boosted {boostBadgeParts.join(" · ")}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: isBoosted ? "#8a5a00" : "#777", marginTop: 2 }}>
                            {helper}
                            {isBoosted ? " • boosted sub-buckets stay eligible for weighted candidate picks" : ""}
                          </div>
                        </div>
                        <div className="windfall-influence-control-grid">
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#555", whiteSpace: "nowrap" }}>
                            <input
                              type="checkbox"
                              checked={!enabled}
                              onChange={(e) => setEnabled(!e.target.checked)}
                            />
                            Off
                          </label>
                          <label style={{ display: "grid", gap: 2, fontSize: 10, color: "#666", fontWeight: 600 }}>
                            <span>Max</span>
                            <select
                              value={count}
                              disabled={!enabled}
                              onChange={(e) => setCount(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
                              style={{ minWidth: 64, opacity: enabled ? 1 : 0.55, fontWeight: 400 }}
                            >
                              {Array.from({ length: max + 1 }, (_, idx) => (
                                <option key={idx} value={idx}>{idx}</option>
                              ))}
                            </select>
                          </label>
                          <label style={{ display: "grid", gap: 2, fontSize: 10, color: "#666", fontWeight: 600 }} title="Generation weight boost for the single-digit members of this ending-digit bucket. Applies even when Off is checked.">
                            <span>1-digit</span>
                            <select
                              value={singleDigitBoost}
                              disabled={!hasSingleDigitNumbers}
                              onChange={(e) => setSingleDigitBoost(Math.max(0, Math.min(5, Number(e.target.value) || 0)))}
                              style={{
                                minWidth: 64,
                                fontWeight: 400,
                                opacity: hasSingleDigitNumbers ? 1 : 0.55,
                                background: singleDigitBoost > 0 ? "#fff8e1" : undefined,
                                borderColor: singleDigitBoost > 0 ? "#fbbf24" : undefined,
                              }}
                            >
                              {Array.from({ length: 6 }, (_, idx) => (
                                <option key={idx} value={idx}>{idx}</option>
                              ))}
                            </select>
                          </label>
                          <label style={{ display: "grid", gap: 2, fontSize: 10, color: "#666", fontWeight: 600 }} title="Generation weight boost for the two-digit members of this ending-digit bucket. Applies even when Off is checked.">
                            <span>2-digit</span>
                            <select
                              value={twoDigitBoost}
                              disabled={!hasTwoDigitNumbers}
                              onChange={(e) => setTwoDigitBoost(Math.max(0, Math.min(5, Number(e.target.value) || 0)))}
                              style={{
                                minWidth: 64,
                                fontWeight: 400,
                                opacity: hasTwoDigitNumbers ? 1 : 0.55,
                                background: twoDigitBoost > 0 ? "#fff8e1" : undefined,
                                borderColor: twoDigitBoost > 0 ? "#fbbf24" : undefined,
                              }}
                            >
                              {Array.from({ length: 6 }, (_, idx) => (
                                <option key={idx} value={idx}>{idx}</option>
                              ))}
                            </select>
                          </label>
                          <div className="windfall-influence-number-summary">
                            <div className="windfall-influence-chip-row">
                              {bucketSummary.numberCounts.map(({ number, count: numberCount }) => (
                                <span
                                  key={`${key}-n-${number}`}
                                  style={{
                                    padding: "1px 6px",
                                    borderRadius: 10,
                                    background: numberCount > 0 ? "#eef5ff" : "#f5f5f5",
                                    border: `1px solid ${numberCount > 0 ? "#c5d9f1" : "#e0e0e0"}`,
                                    color: numberCount > 0 ? "#1565c0" : "#888",
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                  title={`${number} drawn ${numberCount} time${numberCount === 1 ? "" : "s"} in WFMQYH mains`}
                                >
                                  {number}:{numberCount}
                                </span>
                              ))}
                            </div>
                            <div style={{ marginTop: 4, color: "#777", fontVariantNumeric: "tabular-nums" }}>
                              Draw results:&nbsp;
                              {bucketSummary.drawResultCounts.map(({ hits, count: drawCount }) => (
                                <span
                                  key={`${key}-hits-${hits}`}
                                  style={{
                                    ...drawResultTemperatureStyle(drawCount, maxDrawResultCount),
                                    display: "inline-flex",
                                    alignItems: "center",
                                    minHeight: 20,
                                    marginRight: 6,
                                    marginTop: 3,
                                    padding: "1px 6px",
                                    borderRadius: 999,
                                    fontSize: 11,
                                  }}
                                  title={`Observed WFMQYH draw-result count: ${hits} matching main number${hits === 1 ? "" : "s"} occurred ${drawCount} time${drawCount === 1 ? "" : "s"}.`}
                                >
                                  {hits}x={drawCount}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                    </div>
                  </section>

                  <section className="windfall-constraint-section" aria-labelledby="decade-bias-title">
                    <div className="windfall-constraint-section__header">
                      <div id="decade-bias-title" className="windfall-constraint-section__title">Decade Bias</div>
                      <div className="windfall-constraint-section__subtitle">
                        Boost or punish candidate-number decades without changing the hard ending limits above.
                      </div>
                    </div>
                    <div className="windfall-constraint-section__grid windfall-constraint-section__grid--decade">
                    {mainDecadeConstraintRows.map(({ key, label, helper, badge, bias, setBias, title, bucketKey }) => {
                      const bucketSummary = generationConstraintDecadeSummaries[bucketKey];
                      const maxDrawResultCount = Math.max(...bucketSummary.drawResultCounts.map(({ count }) => count), 0);
                      const isBoosted = bias > 0;
                      const isPunished = bias < 0;
                      return (
                        <div
                          key={key}
                          title={title}
                          style={{
                            display: "grid",
                            gap: 8,
                            padding: "6px 8px",
                            border: `1px solid ${isBoosted ? "#fbbf24" : isPunished ? "#93c5fd" : "#eee"}`,
                            boxShadow: isBoosted ? "inset 4px 0 0 #f59e0b" : isPunished ? "inset 4px 0 0 #2563eb" : undefined,
                            borderRadius: 6,
                            background: isBoosted ? "#fffaf0" : isPunished ? "#f8fbff" : "#fcfcfc",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>{label}</span>
                              {badge && <span style={{ fontSize: 11, color: "#666" }}>{badge}</span>}
                              {bias !== 0 && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: isBoosted ? "#92400e" : "#1d4ed8",
                                    background: isBoosted ? "#fef3c7" : "#dbeafe",
                                    border: `1px solid ${isBoosted ? "#fbbf24" : "#93c5fd"}`,
                                    borderRadius: 999,
                                    padding: "1px 7px",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={isBoosted ? `Boost ${bias}: this decade gets extra generation weight.` : `Punish ${bias}: this decade gets reduced generation weight.`}
                                >
                                  {isBoosted ? `Boost +${bias}` : `Punish ${bias}`}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: isBoosted ? "#8a5a00" : isPunished ? "#1d4ed8" : "#777", marginTop: 2 }}>
                              {helper}
                              {isBoosted ? " • boosted in candidate-number sampling" : isPunished ? " • punished in candidate-number sampling" : ""}
                            </div>
                          </div>
                          <div className="windfall-influence-bias-grid">
                            <label style={{ display: "grid", gap: 2, fontSize: 10, color: "#666", fontWeight: 600 }} title="Signed weight adjustment for this candidate-number decade. Positive boosts, negative punishes across main and supp picks.">
                              <span>Bias</span>
                              <select
                                value={bias}
                                onChange={(e) => setBias(Math.max(-5, Math.min(5, Number(e.target.value) || 0)))}
                                style={{
                                  minWidth: 74,
                                  fontWeight: 400,
                                  background: isBoosted ? "#fff8e1" : isPunished ? "#eff6ff" : undefined,
                                  borderColor: isBoosted ? "#fbbf24" : isPunished ? "#93c5fd" : undefined,
                                }}
                              >
                                {Array.from({ length: 11 }, (_, idx) => idx - 5).map((value) => (
                                  <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>
                                ))}
                              </select>
                            </label>
                            <div className="windfall-influence-number-summary">
                              <div className="windfall-influence-chip-row">
                                {bucketSummary.numberCounts.map(({ number, count: numberCount }) => (
                                  <span
                                    key={`${key}-n-${number}`}
                                    style={{
                                      padding: "1px 6px",
                                      borderRadius: 10,
                                      background: numberCount > 0 ? "#eef5ff" : "#f5f5f5",
                                      border: `1px solid ${numberCount > 0 ? "#c5d9f1" : "#e0e0e0"}`,
                                      color: numberCount > 0 ? "#1565c0" : "#888",
                                      fontVariantNumeric: "tabular-nums",
                                    }}
                                    title={`${number} drawn ${numberCount} time${numberCount === 1 ? "" : "s"} in WFMQYH mains`}
                                  >
                                    {number}:{numberCount}
                                  </span>
                                ))}
                              </div>
                              <div style={{ marginTop: 4, color: "#777", fontVariantNumeric: "tabular-nums" }}>
                                Draw results:&nbsp;
                                {bucketSummary.drawResultCounts.map(({ hits, count: drawCount }) => (
                                  <span
                                    key={`${key}-hits-${hits}`}
                                    style={{
                                      ...drawResultTemperatureStyle(drawCount, maxDrawResultCount),
                                      display: "inline-flex",
                                      alignItems: "center",
                                      minHeight: 20,
                                      marginRight: 6,
                                      marginTop: 3,
                                      padding: "1px 6px",
                                      borderRadius: 999,
                                      fontSize: 11,
                                    }}
                                    title={`Observed WFMQYH draw-result count: ${hits} matching main number${hits === 1 ? "" : "s"} occurred ${drawCount} time${drawCount === 1 ? "" : "s"}.`}
                                  >
                                    {hits}x={drawCount}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </section>

                  <section className="windfall-constraint-section" aria-labelledby="shape-bucket-quotas-title">
                    <div className="windfall-constraint-section__header">
                      <div id="shape-bucket-quotas-title" className="windfall-constraint-section__title">Shape / Bucket Quotas</div>
                      <div className="windfall-constraint-section__subtitle">
                        Enforce digit-width share and monthly bucket acceptance requirements.
                      </div>
                    </div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Single-digit / two-digit share</div>
                  <div
                    style={{
                      display: "grid",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: `1px solid ${digitWidthConstraintTargets.enabled ? "#86efac" : "#eee"}`,
                      background: digitWidthConstraintTargets.enabled ? "#f6fff7" : "#fcfcfc",
                    }}
                  >
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#333", fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={digitWidthConstraintEnabled}
                          onChange={(e) => setDigitWidthConstraintEnabled(e.target.checked)}
                        />
                        Enforce strict single-digit / two-digit share
                      </label>
                      <span style={{ fontSize: 11, color: "#666" }}>
                        Single-digit = 1–9 • Two-digit = 10–45
                      </span>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, max-content))",
                        gap: 10,
                        alignItems: "end",
                      }}
                    >
                      <label style={{ display: "grid", gap: 3, fontSize: 11, color: "#555", fontWeight: 600 }}>
                        <span>Count against</span>
                        <select
                          value={digitWidthConstraintScope}
                          onChange={(e) => setDigitWidthConstraintScope(e.target.value as DigitWidthConstraintScope)}
                          style={{ minWidth: 150, fontWeight: 400 }}
                        >
                          <option value="main">Mains only (6 numbers)</option>
                          <option value="mainAndSupp">Main + supps (8 numbers)</option>
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: 3, fontSize: 11, color: "#555", fontWeight: 600 }}>
                        <span>Single-digit %</span>
                        <select
                          value={digitWidthSingleDigitPercent}
                          onChange={(e) => setDigitWidthSingleDigitPercent(Number(e.target.value) || 0)}
                          style={{ minWidth: 120, fontWeight: 400 }}
                        >
                          {DIGIT_WIDTH_PERCENT_OPTIONS.map((value) => (
                            <option key={`single-${value}`} value={value}>{value}%</option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: 3, fontSize: 11, color: "#555", fontWeight: 600 }}>
                        <span>Two-digit %</span>
                        <select
                          value={digitWidthConstraintTargets.twoDigitPercent}
                          onChange={(e) => setDigitWidthSingleDigitPercent(100 - (Number(e.target.value) || 0))}
                          style={{ minWidth: 120, fontWeight: 400 }}
                        >
                          {DIGIT_WIDTH_PERCENT_OPTIONS.map((value) => (
                            <option key={`two-${value}`} value={value}>{value}%</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div style={{ fontSize: 11, color: digitWidthConstraintTargets.enabled ? "#166534" : "#666", lineHeight: 1.5 }}>
                      <div>
                        Exact target for {formatDigitWidthScopeLabel(digitWidthConstraintTargets.scope)}: <b>{digitWidthConstraintTargets.singleDigitCount}</b> single-digit number{digitWidthConstraintTargets.singleDigitCount === 1 ? "" : "s"} + <b>{digitWidthConstraintTargets.twoDigitCount}</b> two-digit number{digitWidthConstraintTargets.twoDigitCount === 1 ? "" : "s"}.
                      </div>
                      <div>
                        Counts are derived strictly from the selected share using floor(single-digit % × counted slots), with the remaining slots assigned to two-digit numbers.
                      </div>
                    </div>
                  </div>

                    <div className="windfall-constraint-subgroup">
                      <div className="windfall-constraint-subgroup__title">Monthly bucket construction</div>
                  <label title="Require generated candidates to include a minimum number of numbers from each monthly frequency bucket">
                    <input type="checkbox" checked={acceptanceNeedsEnabled} onChange={(e) => setAcceptanceNeedsEnabled(e.target.checked)} style={{ marginRight: 6 }} />
                    Must include from Acceptance needs
                  </label>
                  {acceptanceNeedsEnabled && (
                    <>
                      {monthlyConstructiveEnabled && monthlyConstraintPayload && (
                        <div style={{ marginLeft: 18, marginTop: 3, fontSize: 11, color: "#2e7d32", fontStyle: "italic" }}>
                          🔗 Synced from "Acceptance needs" in Monthly Draws Summary (read-only while "Use these counts when constructing candidates" is ON)
                        </div>
                      )}
                      <div className="windfall-influence-mini-grid" style={{ marginLeft: 18, marginTop: 4 }}>
                        {([
                          { key: "undrawn" as const, label: "Undrawn" },
                          { key: "times1" as const, label: "Drawn 1x" },
                          { key: "times2" as const, label: "Drawn 2x" },
                          { key: "times3" as const, label: "Drawn 3x" },
                          { key: "times4" as const, label: "Drawn 4x" },
                          { key: "times5" as const, label: "Drawn 5x" },
                          { key: "times6" as const, label: "Drawn 6x" },
                          { key: "times7" as const, label: "Drawn 7x" },
                          { key: "times8" as const, label: "Drawn 8x+" },
                        ]).map((item) => {
                          const isSynced = monthlyConstructiveEnabled && !!monthlyConstraintPayload;
                          const displayValue = effectiveMianCounts[item.key];
                          return (
                            <label key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3 }}>
                              {item.label}:
                              <input
                                type="number"
                                min={0}
                                max={8}
                                value={displayValue}
                                readOnly={isSynced}
                                onChange={isSynced ? undefined : (e) => setAcceptanceNeedsCounts(prev => ({ ...prev, [item.key]: Math.max(0, Number(e.target.value) || 0) }))}
                                style={{ width: 50, background: isSynced ? "#f0fdf4" : undefined, color: isSynced ? "#166534" : undefined, borderColor: isSynced ? "#86efac" : undefined }}
                                title={isSynced ? `Synced from Monthly Draws Summary Acceptance needs (${displayValue} selected in ${item.label.toLowerCase()} bucket)` : undefined}
                              />
                            </label>
                          );
                        })}
                      </div>
                      {(() => {
                        const mianSum = Object.values(effectiveMianCounts).reduce((s, v) => s + v, 0);
                        return mianSum > 8 ? (
                          <div style={{ marginLeft: 18, marginTop: 6, padding: "4px 8px", borderRadius: 6, background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", fontSize: 11, fontWeight: 600 }}>
                            ⚠️ Requirements sum to {mianSum} but candidates only have 8 numbers — all candidates will be rejected. Reduce counts to total ≤ 8.
                          </div>
                        ) : null;
                      })()}
                    </>
                  )}
                  {acceptanceNeedsEnabled && (
                    <div style={{ marginLeft: 18, marginTop: 6 }}>
                      <label title="When enabled, numbers from buckets with a required count of 0 are excluded from the candidate pool entirely">
                        <input type="checkbox" checked={acceptanceNeedsHardExclude} onChange={(e) => setAcceptanceNeedsHardExclude(e.target.checked)} style={{ marginRight: 6 }} />
                        Hard exclude zero-count buckets
                      </label>
                      {!monthlyBucketSetsAlways && !monthlyConstraintPayload && (
                        <div style={{ color: "#d32f2f", fontSize: 11, marginTop: 2 }}>
                          ⚠️ No monthly bucket data — open Monthly Draws Summary to populate.
                        </div>
                      )}
                    </div>
                  )}
                    </div>
                  </section>

                {/* Monthly Repeat Bias */}
                  <section
                    id={ACTIVE_SETUP_PROVENANCE_TARGET_IDS.monthlyCarryOver}
                    className="windfall-constraint-section windfall-constraint-section--timing"
                    aria-labelledby="monthly-timing-bias-title"
                    tabIndex={-1}
                  >
                    <div className="windfall-constraint-section__header">
                      <div id="monthly-timing-bias-title" className="windfall-constraint-section__title">Monthly Timing Bias</div>
                      <div className="windfall-constraint-section__subtitle">
                        Tune month-position signals that can weight generated candidates up or down.
                      </div>
                    </div>
                    <div className="windfall-constraint-subgroup">
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    Monthly Repeat Bias
                    {(() => {
                      const d = mrbEffectiveDate;
                      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                      const todayLabel = planningDrawContext.todayMonthLabel;
                      const isForward = label !== todayLabel;
                      return (
                        <span style={{
                          marginLeft: 8, fontSize: 11, fontWeight: 400,
                          color: isForward ? "#0369a1" : "#64748b",
                          background: isForward ? "#e0f2fe" : "#f1f5f9",
                          borderRadius: 4, padding: "1px 6px",
                        }}
                          title={isForward ? "Showing next month because the current month's draws are complete" : "Showing current calendar month"}
                        >
                          {label}{isForward ? " ↗ upcoming" : ""}
                        </span>
                      );
                    })()}
                  </div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={mrbEnabled}
                      onChange={(e) => setMrbEnabled(e.target.checked)}
                      style={{ marginRight: 6 }}
                    />
                    Enable per-bucket boost
                  </label>
                  {mrbEnabled && (() => {
                    const usedBudget = MRB_BUCKET_KEYS.reduce((s, k) => s + Math.max(0, (mrbBucketBoosts[k] ?? 1) - 1), 0);
                    const remainingBudget = Math.max(0, MRB_BUDGET - usedBudget);
                    const budgetPct = Math.min(100, (usedBudget / MRB_BUDGET) * 100);
                    const budgetColor = usedBudget > MRB_BUDGET ? "#dc2626" : usedBudget > MRB_BUDGET * 0.8 ? "#d97706" : "#166534";
                    return (
                      <div style={{ marginLeft: 4 }}>
                        {/* Budget meter */}
                        <div style={{ marginBottom: 8, fontSize: 11 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ color: budgetColor, fontWeight: 600 }}>
                              Boost budget used: {usedBudget.toFixed(1)} / {MRB_BUDGET}
                            </span>
                            <span style={{ color: "#64748b" }}>remaining: {remainingBudget.toFixed(1)}</span>
                          </div>
                          <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${budgetPct}%`, background: budgetColor, borderRadius: 3, transition: "width 0.2s" }} />
                          </div>
                        </div>
                        {/* Per-bucket grid */}
                        <div className="windfall-influence-boost-grid">
                           <span style={{ fontWeight: 600, color: "#475569", fontSize: 11 }}>
                             Bucket ({mrbEffectiveDate.getFullYear()}-{String(mrbEffectiveDate.getMonth() + 1).padStart(2, "0")})
                           </span>
                          <span style={{ fontWeight: 600, color: "#475569", fontSize: 11, textAlign: "center" }}>Nums</span>
                          <span style={{ fontWeight: 600, color: "#475569", fontSize: 11, textAlign: "center" }}>Boost ×</span>
                          {MRB_BUCKET_KEYS.map((k) => {
                            const count = monthlyRepeatBiasResult?.bucketNums[k].length ?? 0;
                            const isEmpty = count === 0;
                            const boost = mrbBucketBoosts[k] ?? 1;
                            const isActive = boost > 1;
                            return (
                              <React.Fragment key={k}>
                                <span style={{ color: isEmpty ? "#94a3b8" : isActive ? "#0d47a1" : "#374151", fontWeight: isActive ? 600 : 400 }}>
                                  {MRB_BUCKET_LABELS[k]}
                                </span>
                                <span style={{ textAlign: "center", color: isEmpty ? "#94a3b8" : "#374151", fontSize: 11 }}>
                                  {count}
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  step={0.5}
                                  disabled={isEmpty}
                                  value={boost}
                                  onChange={(e) => {
                                    const raw = parseFloat(e.target.value) || 1;
                                    const newBoost = Math.max(1, raw);
                                    const otherBudget = MRB_BUCKET_KEYS.reduce((s, ok) => ok === k ? s : s + Math.max(0, (mrbBucketBoosts[ok] ?? 1) - 1), 0);
                                    const maxForThis = 1 + Math.max(0, MRB_BUDGET - otherBudget);
                                    setMrbBucketBoosts(prev => ({ ...prev, [k]: Math.min(newBoost, maxForThis) }));
                                  }}
                                  style={{
                                    width: 60,
                                    background: isEmpty ? "#f1f5f9" : isActive ? "#eff6ff" : undefined,
                                    color: isEmpty ? "#94a3b8" : isActive ? "#0d47a1" : undefined,
                                    borderColor: isActive ? "#93c5fd" : undefined,
                                    cursor: isEmpty ? "not-allowed" : undefined,
                                  }}
                                  title={isEmpty ? "No numbers in this bucket this month" : `Boost multiplier for ${MRB_BUCKET_LABELS[k]} numbers`}
                                />
                              </React.Fragment>
                            );
                          })}
                        </div>
                        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <input
                            type="checkbox"
                            checked={mrbIncludeSupp}
                            onChange={(e) => setMrbIncludeSupp(e.target.checked)}
                          />
                          Include supplementary numbers
                        </label>
                        <button
                          type="button"
                          style={{ fontSize: 11, padding: "2px 8px", marginBottom: 4 }}
                          onClick={() => setMrbBucketBoosts({ undrawn: 1, times1: 1, times2: 1, times3: 1, times4: 1, times5: 1, times6: 1, times7: 1, times8: 1 })}
                        >
                          Reset all boosts
                        </button>
                        {monthlyRepeatBiasResult && (
                          <div style={{ fontSize: 11, color: "#2b6cb0", marginTop: 4, background: "#f0f9ff", borderRadius: 6, padding: "6px 8px" }}>
                            <div style={{ fontWeight: 600, marginBottom: 2 }}>
                              {`${mrbEffectiveDate.getFullYear()}-${String(mrbEffectiveDate.getMonth() + 1).padStart(2, "0")}`}
                              {" — "}
                              Draws this month: {monthlyRepeatBiasResult.drawsSoFarThisMonth}
                              {" | "}supp: {mrbIncludeSupp ? "ON" : "OFF"}
                            </div>
                            {MRB_BUCKET_KEYS.map((k) => {
                              const nums = monthlyRepeatBiasResult.bucketNums[k];
                              const boost = mrbBucketBoosts[k] ?? 1;
                              if (nums.length === 0) return null;
                              return (
                                <div key={k} style={{ color: boost > 1 ? "#0d47a1" : "#64748b" }}>
                                  <b>{MRB_BUCKET_LABELS[k]} ({nums.length})</b>
                                  {boost > 1 && <span style={{ color: "#c05621", fontWeight: 700 }}> ×{boost}</span>}
                                  {": "}{nums.join(", ")}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {!monthlyRepeatBiasResult && (
                          <div style={{ fontSize: 11, color: "#64748b" }}>No history data — run a generation to populate buckets.</div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                    <div className="windfall-constraint-subgroup">
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    Month-end carry-over bias
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        fontWeight: 400,
                        color: monthEndCarryOverWeighting.defaultEnabled ? "#166534" : "#92400e",
                        background: monthEndCarryOverWeighting.defaultEnabled ? "#dcfce7" : "#fef3c7",
                        borderRadius: 4,
                        padding: "1px 6px",
                      }}
                      title="Automatic default based on whether the planning month is still inside its first three draws."
                    >
                      {monthEndCarryOverDefaultLabel}
                    </span>
                  </div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={monthEndCarryOverBiasEnabled}
                      onChange={(e) => setMonthEndCarryOverBiasEnabledManual(e.target.checked)}
                      style={{ marginRight: 6 }}
                    />
                    Use month-end carry-over weighting in ranking and generation
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 6, fontSize: 12 }}>
                    <label title="Controls how far learned carry-over factors move away from neutral and how much ranking weight carry-over receives.">
                      Influence{" "}
                      <select
                        value={monthEndCarryOverStrength}
                        onChange={(e) => setMonthEndCarryOverStrengthManual(normalizeMonthEndCarryOverStrength(e.target.value))}
                        disabled={!monthEndCarryOverBiasEnabled}
                        style={{ marginLeft: 4, fontSize: 12 }}
                      >
                        {Object.entries(MONTH_END_CARRY_OVER_STRENGTHS).map(([value, settings]) => (
                          <option key={value} value={value}>
                            {settings.label} ({settings.rankingWeight.toFixed(2)} rank)
                          </option>
                        ))}
                      </select>
                    </label>
                    <label title="Use numbers that finished the source month undrawn and are still undrawn in the planning month.">
                      <input
                        type="checkbox"
                        checked={monthEndCarryOverIncludeMonthEndUndrawn}
                        onChange={(e) => setMonthEndCarryOverIncludeMonthEndUndrawnManual(e.target.checked)}
                        style={{ marginRight: 4 }}
                      />
                      Still-undrawn month-end
                    </label>
                    <label title="Use numbers that repeated from the source month's final draw into the planning month's first draw.">
                      <input
                        type="checkbox"
                        checked={monthEndCarryOverIncludeBoundaryRepeats}
                        onChange={(e) => setMonthEndCarryOverIncludeBoundaryRepeatsManual(e.target.checked)}
                        style={{ marginRight: 4 }}
                      />
                      Last-to-first repeats
                    </label>
                    <label title="Controls the extra multiplier when you click carry-over numbers in the Month-end carry-over bucket panel.">
                      Clicked boost{" "}
                      <select
                        value={selectedCarryOverBoostMode}
                        onChange={(e) => setSelectedCarryOverBoostModeManual(normalizeSelectedCarryOverBoostMode(e.target.value))}
                        disabled={!monthEndCarryOverBiasEnabled}
                        style={{ marginLeft: 4, fontSize: 12 }}
                      >
                        {Object.entries(SELECTED_CARRY_OVER_BOOSTS).map(([value, settings]) => (
                          <option key={value} value={value}>
                            {settings.label} (×{settings.factor})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>
                    Numbers left undrawn at the previous month-end and/or last-to-first month-boundary repeats can be weighted up or down early in the next month. The automatic default turns on only when the next draw is inside the first 3 draws and at least one active signal has a positive weight.
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: "#334155", background: "#f8fafc", borderRadius: 6, padding: "6px 8px" }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>
                      Planning month {monthEndCarryOverWeighting.targetMonthLabel}
                      {monthEndCarryOverWeighting.sourceMonthLabel ? ` ← source ${monthEndCarryOverWeighting.sourceMonthLabel}` : ""}
                    </div>
                    <div>
                      Draws so far: {monthEndCarryOverWeighting.drawsSoFarThisMonth} · Active carry-over numbers: {monthEndCarryOverWeighting.activeNumbers.length}{monthEndCarryOverPoolBreakdown ? ` (${monthEndCarryOverPoolBreakdown})` : ""}
                    </div>
                    <div style={{ marginTop: 2 }}>
                      Direction: {monthEndCarryOverDirectionSummary}
                    </div>
                    <div style={{ marginTop: 2 }}>
                      {monthEndCarryOverTopWeightSummary
                        ? `Active weights: ${monthEndCarryOverTopWeightSummary}`
                        : "No active carry-over numbers are available for the current planning month."}
                    </div>
                    {selectedCarryOverBoostNumbers.length > 0 && (
                      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ color: "#14532d", fontWeight: 700 }}>
                          Selected carry-over boost: {selectedCarryOverBoostSummary} ×{selectedCarryOverBoostFactor} ({selectedCarryOverBoostSettings.label})
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedCarryOverBoostNumbers([])}
                          style={{ border: "1px solid #bbf7d0", borderRadius: 5, background: "#f0fdf4", color: "#166534", fontSize: 11, fontWeight: 700, padding: "2px 7px", cursor: "pointer" }}
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                    </div>
                  </section>
                </div>
              </div>
                </div>
              </InlineCollapsibleCard>

              <InlineCollapsibleCard
                id={ACTIVE_SETUP_PROVENANCE_TARGET_IDS.recencyLatestDraw}
                title="Recency & Latest Draw Rules"
                subtitle="Odd/even, selected/recent survivor weights, last-draw overlap, latest ±1/±2 targets, and repeat-window rules."
                collapsedSummary={`Recent min ${minRecentMatches} · SelHits ${rankingWeights.selHitsEnabled ? "on" : "off"} · RecentHits ${rankingWeights.recentHitsEnabled ? "on" : "off"} · LD±1 ${latestNeighbourSupportEnabled ? "on" : "off"} · strict drought ${strictDroughtQuotaSummary} · latest ±1/±2 ${previousNeighbourConstraintNumbers.length || "off"} · repeat ${repeatUnionEnabled ? `last ${effectiveRepeatWindowSizeW}/M ${minFromRecentUnionM}` : "off"}`}
                defaultExpanded={false}
                expanded={recencyLatestDrawExpanded}
                onExpandedChange={setRecencyLatestDrawExpanded}
              >
                <div className="windfall-influences-grid">

              {/* Composition and recency-only generation controls */}
              <div className="windfall-influence-card">
                <h3 className="windfall-influence-card__title">Composition & Recency</h3>
                <p className="windfall-influence-card__subtitle">
                  Odd/even, last-draw overlap, latest-draw neighbour targets, and repeat-window rules.
                </p>
                <label>
                  <input type="checkbox" checked={useTrickyRule} onChange={(e) => setUseTrickyRule(e.target.checked)} style={{ marginRight: 6 }} />
                  Tricky Rule (reject 0:8 and 8:0)
                </label>
                <div style={{ marginTop: 6 }}>
                  <b>Odd/Even ratios</b> (disable Tricky to use):
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={handleSelectAllRatios}
                      disabled={useTrickyRule || ratioOptionValues.length === 0 || allVisibleRatiosSelected}
                      title={useTrickyRule ? "Turn off Tricky Rule before selecting odd/even ratios" : "Select all odd/even ratios currently observed in the active window"}
                      style={{
                        minHeight: 30,
                        padding: "4px 9px",
                        border: "1px solid #cbd5e1",
                        borderRadius: 8,
                        background: useTrickyRule || ratioOptionValues.length === 0 || allVisibleRatiosSelected ? "#f1f5f9" : "#fff",
                        color: useTrickyRule || ratioOptionValues.length === 0 || allVisibleRatiosSelected ? "#94a3b8" : "#174ea6",
                        fontWeight: 800,
                        cursor: useTrickyRule || ratioOptionValues.length === 0 || allVisibleRatiosSelected ? "not-allowed" : "pointer",
                        fontSize: 12,
                      }}
                    >
                      Select all observed
                    </button>
                    <span style={{ fontSize: 11, color: "#64748b" }}>{selectedRatios.length}/{ratioOptionValues.length} selected</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
                    {ratioOptions.map(({ ratio }) => (
                      <label key={ratio} style={{ opacity: useTrickyRule ? 0.4 : 1 }}>
                        <input type="checkbox" checked={selectedRatios.includes(ratio)} disabled={useTrickyRule} onChange={() => handleRatioToggle(ratio)} style={{ marginRight: 6 }} />
                        {ratio}
                      </label>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 10px",
                    border: `1px solid ${latestNeighbourSupportEnabled ? "#93c5fd" : "#e5e7eb"}`,
                    borderRadius: 6,
                    background: latestNeighbourSupportEnabled ? "#eff6ff" : "#fafafa",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={latestNeighbourSupportEnabled}
                      onChange={(event) => setLatestNeighbourSupportEnabled(event.target.checked)}
                    />
                    Latest ±1 Support (LD±1)
                    <InfoHelp label="Latest ±1 Support help">
                      Experimental default-off rule. When enabled, Windfall builds the +1/-1 neighbours of the latest real draw, removes targets that fail recent-streak, exclusion, and monthly terminal-family drought screens, then requires every generated candidate to contain at least one remaining eligible target. Trace records the eligible targets and rejections.
                    </InfoHelp>
                  </label>
                  <div style={{ color: "#64748b", fontSize: 11, lineHeight: 1.45 }}>
                    Uses the latest WFMQYH draw, recent 10-draw streak cap &gt;7, current monthly buckets when available, and existing 0/5 ending-digit rules as coordination checks. It is evidence-based filtering, not a probability claim.
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 10px",
                    border: `1px solid ${strictDroughtQuotaMode !== "off" ? "#c4b5fd" : "#e5e7eb"}`,
                    borderRadius: 6,
                    background: strictDroughtQuotaMode !== "off" ? "#f5f3ff" : "#fafafa",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800 }}>
                      Strict drought quota
                      <select
                        value={strictDroughtQuotaMode}
                        onChange={(event) => setStrictDroughtQuotaMode(event.target.value as StrictDroughtQuotaControlMode)}
                        style={{ minHeight: 30, borderRadius: 8, border: "1px solid #cbd5e1", padding: "3px 8px", fontWeight: 800 }}
                      >
                        <option value="off">Off</option>
                        <option value="advised">SDSR-advised</option>
                        <option value="manual">Manual minimum</option>
                      </select>
                    </label>
                    <InfoHelp label="Strict drought quota help">
                      Default-off generation rule. Manual mode requires each generated 8-number candidate to contain at least the chosen count from the current strict drought-break shortlist. SDSR-advised mode uses the no-lookahead Strict Drought Shortlist Replay to choose a cautious minimum when the current draw ordinal/month-stage has supportive evidence. This is a quota, not a win probability.
                    </InfoHelp>
                  </div>
                  {strictDroughtQuotaMode === "manual" && (
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700 }}>
                      Minimum from shortlist:
                      <input
                        type="number"
                        min={0}
                        max={Math.min(8, strictDroughtQuotaEligibleNumbers.length)}
                        value={strictDroughtQuotaManualMin}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          const safe = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
                          setStrictDroughtQuotaManualMin(Math.min(safe, Math.min(8, strictDroughtQuotaEligibleNumbers.length)));
                        }}
                        style={{ width: 60 }}
                      />
                      <span style={{ color: "#6b21a8", fontSize: 11, fontWeight: 800 }}>
                        max {Math.min(8, strictDroughtQuotaEligibleNumbers.length)}
                      </span>
                    </label>
                  )}
                  <div style={{ color: "#475569", fontSize: 11, lineHeight: 1.45 }}>
                    {strictDroughtQuotaMode === "off"
                      ? <>Off. Current strict drought shortlist top {STRICT_DROUGHT_QUOTA_TOP_K}: {strictDroughtQuotaEligibleNumbers.length ? strictDroughtQuotaEligibleNumbers.join(", ") : "none after active exclusions"}.</>
                      : strictDroughtQuotaMode === "advised"
                        ? <>{strictDroughtQuotaAdvice.traceLabel}. Effective minimum {strictDroughtQuotaEffectiveMin}. {strictDroughtQuotaAdvice.reason}</>
                        : <>Manual minimum {strictDroughtQuotaEffectiveMin}. Current eligible strict drought shortlist: {strictDroughtQuotaEligibleNumbers.length ? strictDroughtQuotaEligibleNumbers.join(", ") : "none after active exclusions"}.</>}
                  </div>
                  {strictDroughtQuotaMode === "advised" && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, color: "#334155", fontSize: 11 }}>
                      <span style={{ fontWeight: 800 }}>Replay slice</span>
                      <span>{strictDroughtQuotaAdvice.sourceLabel}</span>
                      <span>Trials {strictDroughtQuotaAdvice.trials}</span>
                      <span>1-3 hits {(strictDroughtQuotaAdvice.oneToThreeHitRate * 100).toFixed(1)}%</span>
                      <span>Random {(strictDroughtQuotaAdvice.expectedRandomOneToThreeHitRate * 100).toFixed(1)}%</span>
                      <span>Zero-hit {(strictDroughtQuotaAdvice.zeroHitRate * 100).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 10px",
                    border: `1px solid ${previousNeighbourConstraintNumbers.length ? "#86efac" : "#e5e7eb"}`,
                    borderRadius: 6,
                    background: previousNeighbourConstraintNumbers.length ? "#f0fdf4" : "#fafafa",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>Latest Draw ±1/±2 Constraint Builder</div>
                    <InfoHelp label="Latest draw ±1/±2 constraint builder help">
                      Shows the most recent draw in the active WFMQYH window and lets you choose exact -2, -1, +1, or +2 target numbers. Selected targets are passed into generation as required forced numbers. This is user-directed, not an automatic prediction.
                    </InfoHelp>
                  </div>
                  <div style={{ marginTop: 5, color: "#64748b", fontSize: 11, lineHeight: 1.45 }}>
                    Default off until one or more target numbers are selected. Selected targets are combined with Number Trends forced numbers before candidate generation.
                  </div>
                  {userExclusionReminder && (
                    <div role="status" style={{ marginTop: 6, color: "#475569", fontSize: 11, lineHeight: 1.45 }}>
                      {userExclusionReminder}. Excluded numbers cannot be selected as ±1/±2 required targets.
                    </div>
                  )}
                  <div
                    aria-label="Latest draw ±1/±2 legend"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 8,
                      marginTop: 8,
                      color: "#475569",
                      fontSize: 11,
                      lineHeight: 1.35,
                    }}
                  >
                    <span style={{ fontWeight: 800, color: "#334155" }}>Legend</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 4, border: "1px solid #d7dde8", background: "#fff" }} />
                      White = valid unselected target
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 4, border: "1px solid #f59e0b", background: "#fffbeb" }} />
                      Duplicate target
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 4, border: "1px solid #15803d", background: "#dcfce7" }} />
                      Selected required target
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span aria-hidden="true" className="windfall-previous-neighbour-target-value">17</span>
                      Magenta number = generated ± value
                    </span>
                    <span>Dash/grey = outside 1-45 or forced-number limit reached</span>
                  </div>
                  {previousNeighbourConstraintRows.length ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 6, marginTop: 8 }}>
                      {previousNeighbourConstraintRows.map((row) => (
                        <div key={row.source} style={{ display: "grid", gridTemplateColumns: "34px repeat(4, minmax(42px, 1fr))", gap: 4, alignItems: "center" }}>
                          <span style={{
                            display: "inline-flex",
                            justifyContent: "center",
                            alignItems: "center",
                            height: 28,
                            borderRadius: 999,
                            border: "1px solid #cbd5e1",
                            background: "#fff",
                            fontSize: 12,
                            fontWeight: 800,
                          }}>
                            {row.source}
                          </span>
                          {row.targetOptions.map((target) => {
                            const isSelected = target.value != null && previousNeighbourConstraintNumberSet.has(target.value);
                            const duplicate = target.value != null && row.duplicateTargets.includes(target.value);
                            const isUserExcluded = target.value != null && selectionUnavailableSet.has(target.value);
                            const wouldOverflow = target.value != null && !isSelected && !generationForcedNumbers.includes(target.value) && generationForcedNumbers.length >= 8;
                            const disabled = target.value == null || wouldOverflow || isUserExcluded;
                            return (
                              <button
                                key={target.label}
                                type="button"
                                disabled={disabled}
                                onClick={() => target.value != null && togglePreviousNeighbourTarget(target.value)}
                                aria-pressed={isSelected}
                                aria-label={isUserExcluded ? `Number ${target.value} is unavailable because it is excluded` : undefined}
                                title={isUserExcluded ? `Clear the active exclusion or turn off the rule before selecting ${target.value}.` : undefined}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: 3,
                                  minHeight: 30,
                                  borderRadius: 8,
                                  border: `1px solid ${isSelected ? "#15803d" : duplicate ? "#f59e0b" : "#d7dde8"}`,
                                  background: isSelected ? "#dcfce7" : duplicate ? "#fffbeb" : isUserExcluded ? "#f1f5f9" : "#fff",
                                  color: disabled ? "#94a3b8" : "#111827",
                                  fontSize: 12,
                                  fontWeight: 800,
                                  cursor: disabled ? "not-allowed" : "pointer",
                                }}
                              >
                                <span>{target.label}</span>
                                <span className={target.value != null ? "windfall-previous-neighbour-target-value" : undefined}>
                                  {target.value ?? "-"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, color: "#64748b", fontSize: 12 }}>
                      No valid latest draw is available for ±1/±2 target selection.
                    </div>
                  )}
                  <div style={{ marginTop: 8, color: "#334155", fontSize: 12 }}>
                    <b>Required ±1/±2 targets</b> ({previousNeighbourConstraintNumbers.length}): {previousNeighbourConstraintNumbers.length ? previousNeighbourConstraintNumbers.join(", ") : "none"}
                    {previousNeighbourConstraintNumbers.length ? (
                      <button
                        type="button"
                        onClick={() => setPreviousNeighbourConstraintNumbers([])}
                        style={{
                          marginLeft: 8,
                          minHeight: 28,
                          borderRadius: 8,
                          border: "1px solid #cfd6e2",
                          background: "#fff",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                  {previousNeighbourLatestDraw ? (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "8px 10px",
                        borderTop: "1px solid #e2e8f0",
                        background: "#fff",
                        borderRadius: 6,
                        color: "#334155",
                        fontSize: 12,
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: 0.4,
                          color: "#475569",
                        }}
                      >
                        Latest draw used
                      </div>
                      <div>
                        <b>Date</b>: {previousNeighbourLatestDraw.date || "Unknown"}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                        <b>Latest main numbers</b>
                        {previousNeighbourLatestDraw.main.map((number) => (
                          <span
                            key={`latest-main-${number}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 26,
                              minHeight: 24,
                              padding: "0 7px",
                              borderRadius: 999,
                              border: "1px solid #cbd5e1",
                              background: "#f8fafc",
                              color: "#0f172a",
                              fontWeight: 800,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {number}
                          </span>
                        ))}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                        <b>Latest supp numbers</b>
                        {previousNeighbourLatestDraw.supp.length ? previousNeighbourLatestDraw.supp.map((number) => (
                          <span
                            key={`latest-supp-${number}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 26,
                              minHeight: 24,
                              padding: "0 7px",
                              borderRadius: 999,
                              border: "1px solid #d7b955",
                              background: "#fffbeb",
                              color: "#713f12",
                              fontWeight: 800,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {number}
                          </span>
                        )) : (
                          <span style={{ color: "#64748b" }}>none</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, color: "#64748b", fontSize: 12 }}>
                      Latest draw used: none in active window.
                    </div>
                  )}
                  {generationForcedOverflow ? (
                    <div style={{ marginTop: 6, color: "#b91c1c", fontSize: 12, fontWeight: 700 }}>
                      Combined forced numbers total {generationForcedNumbers.length}; an 8-number candidate cannot contain more than 8.
                    </div>
                  ) : null}
                </div>
                <div
                  aria-label="Last draw match bias and repeat pool controls"
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    border: "1px solid rgba(239, 68, 68, 0.5)",
                    borderRadius: 8,
                    background: "rgba(254, 242, 242, 0.5)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#991b1b" }}>
                    Latest-draw overlap controls
                  </div>
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: "8px 14px", alignItems: "center" }}>
                    <label title="Strictly require each candidate to contain at least this many numbers from the most recent draw.">
                      Minimum matches to <span style={{ fontWeight: 900, textDecoration: "underline", textUnderlineOffset: "2px" }}>last draw</span>:
                      <input type="number" min={0} max={8} value={minRecentMatches} onChange={(e) => setMinRecentMatches(Number(e.target.value))} style={{ width: 60, marginLeft: 6 }} />
                    </label>
                    <label title="Reject candidates that share more than the chosen number of matches with the last draw">
                      <input
                        type="checkbox"
                        checked={maxLastDrawMatchesEnabled}
                        onChange={(e) => setMaxLastDrawMatchesEnabled(e.target.checked)}
                        style={{ marginRight: 6 }}
                      />
                      Maximum matches to <span style={{ fontWeight: 900, textDecoration: "underline", textUnderlineOffset: "2px" }}>last draw</span>:
                      <select
                        value={maxLastDrawMatchesValue}
                        onChange={(e) => setMaxLastDrawMatchesValue(Number(e.target.value))}
                        disabled={!maxLastDrawMatchesEnabled}
                        style={{ marginLeft: 6, opacity: maxLastDrawMatchesEnabled ? 1 : 0.4 }}
                      >
                        {[0,1,2,3,4,5,6,7,8].map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div style={{ marginTop: 4, color: "#64748b", fontSize: 11, lineHeight: 1.45 }}>
                    Minimum and maximum matches are strict filters. <span style={{ fontWeight: 900, textDecoration: "underline", textUnderlineOffset: "2px" }}>Last draw</span> match bias below is only a soft weighting strength.
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <label title="Soft last-draw overlap strength. With minimum matches at 0 it penalizes latest-draw numbers; with minimum matches above 0 it favours higher overlap among candidates that pass the minimum.">
                      <span style={{ fontWeight: 900, textDecoration: "underline", textUnderlineOffset: "2px" }}>Last draw</span> match bias:
                      <input type="number" min={0} max={5} step={0.1} value={recentMatchBias} onChange={(e) => setRecentMatchBias(Number(e.target.value))} style={{ width: 70, marginLeft: 6 }} />
                    </label>
                    <span style={{ marginLeft: 6, color: "#b91c1c", fontSize: 11, fontWeight: 700 }}>
                      max 5
                    </span>
                    <div style={{ marginTop: 4, color: "#64748b", fontSize: 11, lineHeight: 1.45 }}>
                      0 is off. This is a local generation bias, not a WFMQYH control.
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <label title="Within the active WFMQYH history, build a pool from every number seen in the newest W real draws.">
                      Look back over <span style={{ fontWeight: 900, textDecoration: "underline", textUnderlineOffset: "2px" }}>newest draws</span>:
                      <input type="number" min={0} max={realHistory.length} value={repeatWindowSizeW} onChange={(e) => setRepeatWindowSizeW(Number(e.target.value))} style={{ width: 70, marginLeft: 6 }} />
                    </label>
                    <label style={{ marginLeft: 10 }}>
                      Minimum candidate numbers from that pool:
                      <input
                        type="number"
                        min={0}
                        max={repeatUnionCandidateMax}
                        value={minFromRecentUnionM}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          const safeValue = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
                          setMinFromRecentUnionM(Math.min(safeValue, repeatUnionCandidateMax));
                        }}
                        style={{ width: 60, marginLeft: 6 }}
                      />
                    </label>
	                    <span style={{ color: "#991b1b", fontSize: 11, fontWeight: 800 }}>
	                      max {repeatUnionCandidateMax}
	                    </span>
	                    <div style={{ marginTop: 4, color: "#475569", fontSize: 11, lineHeight: 1.45 }}>
                      Default follows the latest observed month: {latestObservedMonthDrawCount
                        ? <>{latestObservedMonthDrawCount.monthLabel} has {latestObservedMonthDrawCount.drawCount} completed draw{latestObservedMonthDrawCount.drawCount === 1 ? "" : "s"}{repeatWindowDefaultFromLatestMonth !== latestObservedMonthDrawCount.drawCount ? `; active WFMQYH caps this to ${repeatWindowDefaultFromLatestMonth}` : ""}.</>
                        : <>no dated real month is available, so the active WFMQYH size is used.</>}
	                    </div>
	                    <div style={{ marginTop: 4, color: "#475569", fontSize: 11, lineHeight: 1.45 }}>
	                      Unique numbers in this newest-draw pool: <strong>{repeatUnionUniqueCount}</strong>. Raw usable range is <strong>0-{repeatUnionRawCandidateMax}</strong>; current monthly bucket requirements make the safe range <strong>0-{repeatUnionCandidateMax}</strong>.
	                    </div>
	                    {repeatUnionMonthlyFeasibility && repeatUnionMonthlyFeasibility.maxFeasibleHits < repeatUnionRawCandidateMax && (
	                      <div style={{ marginTop: 4, color: "#991b1b", fontSize: 11, fontWeight: 800, lineHeight: 1.45 }}>
	                        Monthly/stage bucket counts require at least {repeatUnionMonthlyFeasibility.requiredOutsideRepeat} number{repeatUnionMonthlyFeasibility.requiredOutsideRepeat === 1 ? "" : "s"} outside this newest-draw pool, so the repeat-pool minimum cannot be higher than {repeatUnionMonthlyFeasibility.maxFeasibleHits}.
	                      </div>
	                    )}
	                    <div style={{ marginTop: 4, color: "#64748b", fontSize: 11, lineHeight: 1.45 }}>
                      {repeatUnionEnabled
                        ? <>Builds a pool from every number seen in the newest {effectiveRepeatWindowSizeW} active WFMQYH draw{effectiveRepeatWindowSizeW === 1 ? "" : "s"}. Each candidate must contain at least {minFromRecentUnionM} number{minFromRecentUnionM === 1 ? "" : "s"} from that pool.</>
                        : <>Off because the minimum is 0. If the minimum is raised above 0, the pool will use the newest {effectiveRepeatWindowSizeW} active WFMQYH draw{effectiveRepeatWindowSizeW === 1 ? "" : "s"}.</>}
                      {" "}It never uses the oldest draws first and does not change WFMQYH.
                    </div>
                  </div>
                </div>
                <RankingWeightsPanel
                  weights={rankingWeights}
                  setWeights={setRankingWeights}
                  scope="recency"
                  title="SelHits / RecentHits Survivor Weights"
                />
              </div>
                </div>
              </InlineCollapsibleCard>

              <InlineCollapsibleCard
                id={ACTIVE_SETUP_PROVENANCE_TARGET_IDS.filtersDistance}
                title="Hard Filters"
                subtitle="Strict post-generation filters only."
                collapsedSummary={`Entropy ${entropyEnabled ? entropyThreshold : "off"} · Hamming ${hammingEnabled ? hammingThreshold : "off"} · Jaccard ${jaccardEnabled ? `${Math.round(jaccardThreshold * 100)}%` : "off"} · Rdy filters ${readinessHardFilterSummary}`}
                defaultExpanded={false}
                expanded={hardFiltersExpanded}
                onExpandedChange={setHardFiltersExpanded}
              >
                <div className="windfall-influences-grid">

              {/* Strict post-generation filters */}
              <div className="windfall-influence-card">
                {/* Entropy and distance filters */}
                <div>
                  <h3 className="windfall-influence-card__title">Entropy & Distance</h3>
                  <p className="windfall-influence-card__subtitle">
                    Strict filters applied after candidates are created.
                  </p>
                  <div style={{ display: "grid", gap: 4, marginBottom: 8, color: "#4b5563", fontSize: 12, lineHeight: 1.35 }}>
                    <span>Entropy preview: {previewStats.entropy}/100 candidates pass</span>
                    <span>Hamming preview: {previewStats.hamming}/100 candidates pass</span>
                    <span>Jaccard preview: {previewStats.jaccard}/100 candidates pass</span>
                  </div>
                  <div className="windfall-core-filter-grid">
                    <label className="windfall-core-filter-control">
                      <span className="windfall-core-filter-control__label">
                        <input type="checkbox" checked={entropyEnabled} onChange={(e) => setEntropyEnabled(e.target.checked)} />
                        Entropy (threshold {entropyThreshold})
                      </span>
                      <HigSlider className="windfall-core-filter-control__range" min={0} max={6} step={0.1} value={entropyThreshold} onCommit={setEntropyThreshold} />
                    </label>
                    <label className="windfall-core-filter-control">
                      <span className="windfall-core-filter-control__label">
                        <input type="checkbox" checked={hammingEnabled} onChange={(e) => setHammingEnabled(e.target.checked)} />
                        Hamming (min {hammingThreshold})
                      </span>
                      <HigSlider className="windfall-core-filter-control__range" min={0} max={8} step={1} value={hammingThreshold} onCommit={setHammingThreshold} />
                    </label>
                    <label className="windfall-core-filter-control">
                      <span className="windfall-core-filter-control__label">
                        <input type="checkbox" checked={jaccardEnabled} onChange={(e) => setJaccardEnabled(e.target.checked)} />
                        Jaccard (max {Math.round(jaccardThreshold * 100)}%)
                      </span>
                      <HigSlider className="windfall-core-filter-control__range" min={0} max={1} step={0.01} value={jaccardThreshold} onCommit={setJaccardThreshold} />
                    </label>
                  </div>

                  <div style={{ borderTop: "1px dashed #ddd", marginTop: 12, paddingTop: 10 }}>
                    <h4 style={{ margin: "0 0 4px", color: "#0f172a", fontSize: 13 }}>Readiness component hard filters</h4>
                    <p className="windfall-influence-card__subtitle" style={{ margin: "0 0 10px" }}>
                      Optional lower-bound filters for the same IDM, Conv, and OGA components used by Rdy. Defaults are OFF and 0%; turning a rule off resets its threshold to 0%.
                    </p>
                    <div className="windfall-core-filter-grid">
                      {READINESS_HARD_FILTER_KEYS.map((key) => {
                        const rule = readinessHardFilters[key];
                        const copy = READINESS_HARD_FILTER_COPY[key];
                        return (
                          <label key={key} className="windfall-core-filter-control">
                            <span className="windfall-core-filter-control__label" title={copy.help}>
                              <input
                                type="checkbox"
                                checked={rule.enabled}
                                onChange={(event) => setReadinessHardFilters((previous) => ({
                                  ...previous,
                                  [key]: {
                                    ...previous[key],
                                    enabled: event.target.checked,
                                    thresholdPercent: event.target.checked ? previous[key].thresholdPercent : 0,
                                  },
                                }))}
                              />
                              {copy.label} ({rule.thresholdPercent}%)
                            </span>
                            <HigSlider
                              className="windfall-core-filter-control__range"
                              min={0}
                              max={100}
                              step={5}
                              value={rule.thresholdPercent}
                              disabled={!rule.enabled}
                              onCommit={(value) => setReadinessHardFilters((previous) => ({
                                ...previous,
                                [key]: {
                                  ...previous[key],
                                  thresholdPercent: clampPercent(value, 0),
                                },
                              }))}
                            />
                            <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600, lineHeight: 1.35 }}>
                              {copy.help}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>{/* end core filters */}
                </div>
              </InlineCollapsibleCard>

              <InlineCollapsibleCard
                title="Active Setup Summary"
                subtitle="A plain-language audit trail of active forced numbers, exclusions, and generation inputs."
                collapsedSummary={`Forced ${generationForcedNumbers.length} · exclusions ${allExclusions.length} · SDE1 ${knobs.enableSDE1 ? "on" : "off"} · HC3 ${knobs.enableHC3 ? "on" : "off"}`}
                defaultExpanded={false}
              >
            <div className="windfall-influence-provenance" aria-label="Generation provenance summary">
              <div className="windfall-influence-provenance__header">Provenance</div>
              <div className="windfall-influence-provenance__grid">
                {activeSetupProvenanceGroups.map((group) => (
                  <section key={group.title} className="windfall-influence-provenance__group" aria-label={group.title}>
                    <button
                      type="button"
                      className="windfall-influence-provenance__title windfall-influence-provenance__title-button"
                      onClick={() => navigateToActiveSetupProvenanceTarget(group.target)}
                      aria-label={`${group.targetLabel} for ${group.title}`}
                      title={group.targetLabel}
                    >
                      <span>{group.title}</span>
                      <span className="windfall-influence-provenance__title-arrow" aria-hidden="true">›</span>
                    </button>
                    <dl className="windfall-influence-provenance__items">
                      {group.items.map((item) => (
                        <div key={item.label} className="windfall-influence-provenance__item">
                          <dt className="windfall-influence-provenance__label">{item.label}</dt>
                          <dd className="windfall-influence-provenance__value">{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            </div>
            {/* Forced and Excluded reporting */}
            <div className="windfall-influence-report">
              <div style={{ marginBottom: 6 }}>
                <b>Forced numbers</b> ({generationForcedNumbers.length}): {generationForcedNumbers.length ? sortedGenerationForcedNumbers.join(", ") : "— none —"}
                <span style={{ color: "#64748b" }}> Trend {trendSelectedNumbers.length}; latest ±1/±2 {previousNeighbourConstraintNumbers.length}; drought-break {droughtBreakSelectedNumbers.length}; paste-weighted {pasteWeightedForcedNumbers.length}.</span>
              </div>
              <div className="windfall-influence-report__grid">
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>User Exclusions</div>
                  <div>
                    Count: {effectiveExcludedNumbers.length}
                  </div>
                  <div>
                    List: {effectiveExcludedNumbers.length ? effectiveExcludedNumbers.slice().sort((a,b)=>a-b).join(", ") : "— none —"}
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>System Exclusions</div>
                  <div>
                    SDE1: {knobs.enableSDE1 ? "ON" : "OFF"} • Count: {sde1Exclusions.length}
                  </div>
                  <div>
                    HC3: {knobs.enableHC3 ? "ON" : "OFF"} • Count: {hc3Exclusions.length}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    Combined: {allExclusions.length ? allExclusions.slice().sort((a,b)=>a-b).join(", ") : "— none —"}
                  </div>
                </div>
              </div>
            </div>
              </InlineCollapsibleCard>
            </div>
          </CollapsibleSection>

      {/* [ORDER-ANCHOR] 23.5 Paste-Weighted Candidate Generator */}
      <CollapsibleSection
        panelId="paste-weighted-candidate-generator"
        title={<b>Paste-Weighted Candidate Generator</b>}
        summaryHint="Paste rows, weight numbers, generate six-number candidates"
        defaultOpen={true}
      >
        <div style={{ marginTop: 8 }}>
          <PasteWeightedCandidatesPanel
            onSimulateCandidate={handleSimulatePasteWeightedCandidate}
            onGeneratedCandidatesChange={setPasteWeightedPortfolioCandidates}
            keptGeneratedRows={keptGeneratedCandidateRows}
            forcedNumbers={pasteWeightedForcedNumbers}
            excludedNumbers={allExclusions}
            onToggleForcedNumber={togglePasteWeightedForcedNumber}
            activeSimulatedKey={activeSimulatedMainKey}
            initialCandidateCount={Math.max(4, Math.min(30, numCandidates || 12))}
            fullHistory={realHistory}
            activeHistory={realFilteredHistory}
            activeWindowLabel={historyWindowName}
            stageIdealDrawState={stageIdealDrawState}
            monthlyBucketSets={monthlyBucketSetsAlways ?? monthlyConstraintPayload?.buckets ?? null}
            monthlyAcceptanceNeeds={monthlyConstraintPayload?.constraints ?? null}
          />
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 23.75 Portfolio Compression / 12-Game Distiller */}
      <CollapsibleSection
        panelId="portfolio-compression"
        title={<b>Portfolio Compression / 12-Game Distiller</b>}
        summaryHint="Paste portfolio rows, count unique numbers, distil a top-six core"
        defaultOpen={true}
      >
        <div style={{ marginTop: 8 }}>
          <PortfolioCompressionPanel
            userSelectedNumbers={userSelectedNumbers}
            keptGeneratedRows={keptGeneratedCandidateRows}
            monthEndCarryOverBiasEnabled={monthEndCarryOverBiasEnabled}
            monthEndCarryOverWeights={monthEndCarryOverWeightsForGeneration}
            hotColdRows={portfolioHotColdRows}
            windowShapeRows={portfolioWindowShapeRows}
            adjacentComboHistory={realFilteredHistory}
            monthlyBuckets={dgaEffectiveMonthlyBuckets}
            backtestHistory={realHistory}
            onSimulateCore={handleSimulatePortfolioCore}
            activeSimulatedKey={activeSimulatedMainKey}
            candidateSources={[
              {
                id: "generated-candidates",
                label: "Generated Candidates",
                candidates: candidates.map((candidate) => ([
                  ...candidate.main,
                  ...candidate.supp,
                ])),
              },
              {
                id: "paste-weighted-candidates",
                label: "Paste-Weighted Candidates",
                candidates: pasteWeightedPortfolioCandidates.map((candidate) => ([
                  ...candidate.main,
                  ...candidate.supp,
                ])),
              },
            ]}
          />
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 24 Generated Candidates */}
      <CollapsibleSection panelId="generated-candidates" title={<b>Generated Candidates</b>} defaultOpen={true}>
        <div style={{ padding: 32, fontFamily: "sans-serif" }}>
          <GeneratedCandidatesPanel
            onGenerate={handleGenerate}
            onStopGenerate={handleStopGenerate}
            candidates={candidates}
            quotaWarning={quotaWarning}
            isGenerating={isGenerating}
            numCandidates={numCandidates}
            setNumCandidates={setNumCandidates}
            rwr45Enabled={rwr45Enabled}
            setRwr45Enabled={setRwr45Enabled}
            generationSessionActive={generationSessionActive}
            generationSessionCount={generationSessionRows.length}
            onStartGenerationSession={handleStartGenerationSession}
            onEndGenerationSession={handleEndGenerationSession}
            onClearGenerationSession={handleClearGenerationSession}
            onExportGenerationSession={handleExportGenerationSession}
            userSelectedNumbers={userSelectedNumbers}
            setUserSelectedNumbers={setUserSelectedNumbers}
            excludedNumbers={selectionUnavailableNumbers}
            onSelectCandidate={setSelectedCandidateIdx}
            onSimulateCandidate={handleSimulateCandidate}
            onKeepCandidate={handleKeepGeneratedCandidate}
            selectedCandidateIdx={selectedCandidateIdx}
            mostRecentDraw={realFilteredHistory[realFilteredHistory.length - 1] || null}
            manualSimSelected={manualSimSelected}
            setManualSimSelected={setManualSimSelected}
            activeOGABand={activeOGABand}
            forcedNumbers={generationForcedNumbers}
            activeSimCandidateIdx={simCandidateIdx ?? -1}
            simSourceKind={simSource}
            batchSize={batchSize}
            setBatchSize={setBatchSize}
            onRunBatch={handleRunBatchFrequencies}
            batchFreq={batchFreq}
            isBatching={isBatching}
            batchSummary={batchSummary}
            batchSessionRuns={batchSessionRuns}
            setBatchSessionRuns={setBatchSessionRuns}
            onRunBatchSession={handleRunBatchSession}
            isBatchSessionRunning={isBatchSessionRunning}
            batchSessionProgress={batchSessionProgress}
            batchSessionTopSeries={batchSessionTopSeries}
            batchSessionAggregate={batchSessionAggregate}
            onSimulateNumbers={handleSimulatePickSixManual}
            monthlyAvgBuckets={monthlyAvgBuckets}
            monthlyBuckets={monthlyBucketSetsAlways ?? monthlyConstraintPayload?.buckets}
            monthlyIdealDrawState={monthlyIdealDrawState}
            stageIdealDrawState={stageIdealDrawState}
            historyForOGA={realFilteredHistory}
            fullHistory={realHistory}
            ogaRefScores={pastOGAScoresRef}
            ogaSpokeCount={ogaSpokeCount}
            attemptMultiplier={attemptMultiplier}
            onAttemptMultiplierChange={setAttemptMultiplier}
            overgenFactor={overgenFactor}
            onOvergenFactorChange={setOvergenFactor}
            rdyWeights={effectiveRdyWeights}
            enableOGA={knobs.enableOGA}
            ratioOptions={ratioOptions}
            exportSettings={({
              rwr45Enabled,
              excludedNumbers: effectiveExcludedNumbers,
              hc3Exclusions,
              sde1Exclusions,
              enableHC3: knobs.enableHC3,
              enableSDE1: knobs.enableSDE1,
              selectedOddEvenRatios: selectedRatios,
              trendRatioFilter: {
                lookback: trendLookback,
                threshold: trendThreshold,
                allowedRatios: [...allowedTrendRatios],
                coveragePercent: trendRatioCoveragePercent,
              },
              lambdaEnabled,
              lambda,
              selectedBoostEnabled,
              selectedBoostFactor,
              monthlyBoostPenalize: monthlyConstraintPayload?.boostPenalize ?? false,
              monthlyConstructiveEnabled,
              monthlyConstructiveConstraints: monthlyConstraintPayload?.constraints,
              minRecentMatches,
              recentMatchBias,
              previousNeighbourConstraintNumbers: [...previousNeighbourConstraintNumbers],
              latestNeighbourSupportEnabled,
              entropyEnabled,
              entropyThreshold,
              hammingEnabled,
              hammingThreshold,
              jaccardEnabled,
              jaccardThreshold,
            } as ExportSettings)}
          />


          <div style={{ width: "100%", marginBottom: 68 }}>
            <OGAHistogram
              ogaScores={pastOGAScoresRef}
              candidateOGA={(currentCandidate as any)?.ogaScore}
              candidatePercentile={(currentCandidate as any)?.ogaPercentile}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            {/* [ORDER-ANCHOR] 24.5 Pick Six */}
            <CollapsibleSection panelId="pick-six" title={<b>Pick Six</b>} defaultOpen={false} summaryHint="28 combos of 6 from 8">
              <PickSixPanel
                source={pickSixSource}
                onSourceChange={setPickSixSource}
                manualValues={pickSixManual}
                onManualValuesChange={setPickSixManual}
                manualSimNumbers={manualSimSelected.slice(0, 8)}
                dgaSimNumbers={dgaSimNumbers}
                onSimulateManual={handleSimulatePickSixManual}
              />
            </CollapsibleSection>
          </div>
          
        </div>
        
      </CollapsibleSection>

      <WorkflowAnchor
        id="workflow-dga"
        title="Diamond Grid Analysis"
        summary="Inspect spatial, simulated, and monthly-bucket views without changing the source draw history."
        favoritePanelId="diamond-grid-analysis"
        collapsible={true}
        expanded={dgaSectionOpen}
        controlsId={dgaWorkflowBodyId}
        onExpandedChange={setDgaSectionOpen}
      />

      <CollapsibleSection
        panelId="next-hot-blocks"
        title={<b>Next Hot Blocks</b>}
        summaryHint="Observed block heat/drift and block exclusions"
        defaultOpen={true}
      >
        <div style={{ width: "100%", marginTop: 8, marginBottom: 10 }}>
          <NextHotBlocksPanel
            history={realFilteredHistory}
            excludedNumbers={effectiveExcludedNumbers}
            setExcludedNumbers={setExcludedNumbers}
            numberConflictLedger={numberConflictLedger}
            onClearAutoExclusions={() => setAutoExcludeUnselected(false)}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        panelId="tattslotto-ticket-grid-replay"
        title={<b>Tattslotto Ticket Grid Replay</b>}
        summaryHint="Observed 9x5 ticket-grid replay with pattern overlays"
        defaultOpen={false}
      >
        <div style={{ width: "100%", marginTop: 8, marginBottom: 10 }}>
          <TattslottoTicketGridReplayPanel
            history={realFilteredHistory}
            candidateSources={[
              {
                id: "generated-candidates",
                label: "Generated Candidates",
                candidates: candidates.map((candidate) => ({
                  main: candidate.main,
                  supp: candidate.supp,
                })),
              },
              {
                id: "paste-weighted-candidates",
                label: "Paste-Weighted Candidates",
                candidates: pasteWeightedPortfolioCandidates.map((candidate) => ({
                  main: candidate.main,
                  supp: candidate.supp,
                })),
              },
            ]}
          />
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 25 Diamond Grid Analysis (DGA) */}
      <CollapsibleSection
        title="Diamond Grid Analysis"
        defaultOpen={true}
        chrome="bodyOnly"
        favoriteable={false}
        open={dgaSectionOpen}
        bodyId={dgaWorkflowBodyId}
      >
        <div style={{ width: "100%", marginTop: 18, marginBottom: 10 }}>
          <InlineCollapsibleCard
            title="DGA heatmap"
            subtitle={`${realFilteredHistory.length} real draw${realFilteredHistory.length === 1 ? "" : "s"} in the active window · heatmap view and simulation strip`}
            collapsedSummary="Shows the DGA heatmap with a view selector for temperature or monthly bucket-state mode, plus legend controls and the aligned simulation strip."
            defaultExpanded={true}
            expanded={dgaHeatmapExpanded}
            onExpandedChange={setDgaHeatmapExpanded}
            keepMounted={true}
            collapsedLabel={`Show heatmap (${realFilteredHistory.length} real draw${realFilteredHistory.length === 1 ? "" : "s"}) ▼`}
          >
            <div style={{ padding: "10px 12px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
                <h4 style={{ margin: 0 }}>{dgaHeatmapTitle}</h4>
                <label style={{ fontSize: 13 }}>
                  View:
                  <select
                    value={dgaHeatmapView}
                    onChange={(e) => setDgaHeatmapView(e.target.value as DgaHeatmapViewMode)}
                    style={{ marginLeft: 6 }}
                    title="Switch between temperature and monthly bucket-state views"
                  >
                    <option value="temperature">Temperature</option>
                    <option value="monthlyBucketState">Monthly bucket state</option>
                  </select>
                </label>
                <label style={{ fontSize: 13 }}>
                  Metric:
                  <select
                    value={tempMetric}
                    onChange={(e) => setTempMetric(e.target.value as any)}
                    style={{ marginLeft: 6 }}
                    title="EMA • Recency • Hybrid"
                    disabled={isMonthlyBucketHeatmapView}
                  >
                    <option value="hybrid">Hybrid (EMA ⊕ Recency)</option>
                    <option value="ema">EMA only</option>
                    <option value="recency">Recency only</option>
                  </select>
                </label>
                <label style={{ fontSize: 13 }}>
                  Letters:
                  <input type="checkbox" checked={showHeatmapLetters} onChange={e => setShowHeatmapLetters(e.target.checked)} style={{ marginLeft: 6 }} title="Overlay letter codes" />
                </label>
                {isMonthlyBucketHeatmapView ? (
                  <label style={{ fontSize: 13 }}>
                    Heatmap hover spark-line:
                    <input
                      type="checkbox"
                      checked={showMbsHoverSparkline}
                      onChange={(e) => setShowMbsHoverSparkline(e.target.checked)}
                      style={{ marginLeft: 6 }}
                      title="Show or hide the small spark-line inside the Monthly Bucket State Heatmap hover card. This does not affect the lower Monthly Bucket State grid."
                    />
                  </label>
                ) : null}
                <span style={{ fontSize: 12, color: "#64748b" }}>{dgaHeatmapSubtitle}</span>
              </div>

              <div style={{ width: "100%", marginTop: 8, marginBottom: 6 }}>
                <HeatmapLegendBar labels={dgaHeatmapBucketLabels} counts={dgaHeatmapLegendCounts} total={dgaHeatmapLegendTotal} colors={dgaHeatmapBucketColors} />
              </div>

              <div style={{ width: "100%", overflowX: "auto" }}>
                <div style={{ display: "inline-flex", alignItems: "flex-start", gap: 12, position: "relative" }}>
                  <div style={{ display: "inline-block" }}>
                    <TemperatureHeatmap
                      history={realHistory}
                      displayHistory={isMonthlyBucketHeatmapView ? dgaMonthlyBucketHeatmapHistory : undefined}
                      alpha={0.25}
                      cellSize={DGA_CELL_SIZE}
                      gutter={DGA_HEATMAP_GUTTER}
                      showLegend={false}
                      metric={tempMetric}
                      buckets={dgaHeatmapBucketLabels.length}
                      bucketStops={isMonthlyBucketHeatmapView ? undefined : bucketStops}
                      bucketLabels={dgaHeatmapBucketLabels}
                      bucketColors={dgaHeatmapBucketColors}
                      bucketIndexSeries={dgaHeatmapBucketIndexSeries}
                      hybridWeight={0.6}
                      emaNormalize="per-number"
                      enforcePeaks={true}
                      onHoverNumber={setFocusNumber}
                      showLegendCounts={false}
                      hazardHistory={realFilteredHistory}
                      activeWindowStart={dgaHeatmapActiveWindow?.start}
                      activeWindowEnd={dgaHeatmapActiveWindow?.end}
                      highlightedColumns={dgaHeatmapHighlightedColumns}
                      showBucketLetters={showHeatmapLetters}
                      bucketLetters={dgaHeatmapBucketLetters}
                      showDrawSlotAxis={isMonthlyBucketHeatmapView}
                      showHoverSparkline={!isMonthlyBucketHeatmapView || showMbsHoverSparkline}
                    />
                  </div>
                  {/* Vertical simulation selections aligned to heatmap rows */}
                  <div style={{ position: "sticky", right: 0, top: 0 }}>
                    <DGASimulateStrip
                      selectedNumbers={dgaStripSelectedNumbers}
                      cellSize={DGA_CELL_SIZE}
                      monthlyBuckets={dgaEffectiveMonthlyBuckets}
                      scoringNumberDiagnostics={dgaScoringNumberDiagnostics}
                      suppSuggestion={dgaSuppSuggestion}
                      excludedNumbers={selectionUnavailableNumbers}
                      hoveredNumber={dgaHoveredNumber}
                      onHoverNumber={(value) => setDgaHoveredNumber(value)}
                      onChange={handleDgaStripChange}
                      includeHeaderSpacer={false}
                      topOffsetPx={DGA_HEATMAP_GUTTER}
                      testIdPrefix="dga-heatmap-sim-strip"
                    />
                  </div>
                </div>
              </div>
            </div>
          </InlineCollapsibleCard>

          <div ref={dgaGridRef} style={{ marginTop: 12 }}>
            <InlineCollapsibleCard
              title="DGA grid"
              subtitle={dgaGrid.length > 0
                ? `${dgaGrid.length} rows · ${dgaDrawLabels.length} historical draw${dgaDrawLabels.length === 1 ? "" : "s"} · simulate strip and DGA tools`
                : "No grid data loaded yet"}
              collapsedSummary="Shows the main DGA draw grid, simulate strip, and the grid’s highlight / diamond tools. Existing DGA grid settings stay in place while this panel is hidden."
              defaultExpanded={true}
              expanded={dgaGridExpanded}
              onExpandedChange={setDgaGridExpanded}
              keepMounted={true}
              collapsedLabel={`Show grid (${dgaDrawLabels.length} draw${dgaDrawLabels.length === 1 ? "" : "s"}) ▼`}
            >
              <div style={{ padding: "10px 12px 12px" }}>
                {highlightMsg && (
                  <div style={{ color: "#c00", marginTop: 2, marginBottom: 12 }}>{highlightMsg}</div>
                )}

                <div className="windfall-dga-mirror-control" aria-label="DGA strip to Latest Draw ±1/±2 mirror">
                  <button
                    type="button"
                    className={`windfall-dga-mirror-control__button${mirrorDgaStripToPreviousNeighbour ? " is-active" : ""}`}
                    aria-pressed={mirrorDgaStripToPreviousNeighbour}
                    onClick={() => setMirrorDgaStripToPreviousNeighbour((current) => !current)}
                  >
                    {mirrorDgaStripToPreviousNeighbour ? "Mirroring strip to ±1/±2 builder" : "Mirror strip to ±1/±2 builder"}
                  </button>
                  <div className="windfall-dga-mirror-control__status">
                    <b>{mirrorDgaStripToPreviousNeighbour ? "On" : "Off"}</b>
                    {" · "}
                    {mirrorDgaStripToPreviousNeighbour
                      ? dgaStripPreviousNeighbourMatches.length
                        ? `Mirroring ${dgaStripPreviousNeighbourMatches.length} valid target${dgaStripPreviousNeighbourMatches.length === 1 ? "" : "s"}: ${dgaStripPreviousNeighbourMatches.join(", ")}.`
                        : dgaStripSelectedNumbers.length
                          ? "No current strip selections are valid latest-draw ±1/±2 targets."
                          : "Select numbers in the DGA simulation strip to mirror matching ±1/±2 targets."
                      : "DGA strip simulates only. Turn on to copy only valid latest-draw ±1/±2 targets into the constraint builder."}
                  </div>
                </div>

                {dgaGrid.length > 0 ? (
                  <DGAVisualizer
                    grid={dgaGrid}
                    diamonds={dgaDiamonds}
                    predictions={dgaPredictions}
                    drawLabels={dgaDrawLabels}
                    numberLabels={Array.from({ length: 45 }, (_, i) => String(i + 1))}
                    numberCounts={numberCounts}
                    minCount={minCount}
                    maxCount={maxCount}
                    highlights={highlights}
                    setHighlights={setHighlights}
                    controlsPosition="above"
                    focusNumber={focusNumber}
                    focusedCol={focusedDgaCol}
                    onColumnClick={(col) => setFocusedDgaCol((prev) => (prev === col ? null : col))}
                    wfmqyhStart={dgaWfmqyhStart}
                    cellSize={DGA_CELL_SIZE}
                    gridToolbar={simScrollOriginY !== null ? (
                      <HigButton
                        size="compact"
                        variant="secondary"
                        onClick={scrollBackToOrigin}
                        title="Return to where you pressed Simulate"
                      >
                        ↑ Back
                      </HigButton>
                    ) : null}
                    gridSidecar={(
                      <DGASimulateStrip
                        selectedNumbers={dgaStripSelectedNumbers}
                        cellSize={DGA_CELL_SIZE}
                        monthlyBuckets={dgaEffectiveMonthlyBuckets}
                        scoringNumberDiagnostics={dgaScoringNumberDiagnostics}
                        suppSuggestion={dgaSuppSuggestion}
                        excludedNumbers={selectionUnavailableNumbers}
                        hoveredNumber={dgaHoveredNumber}
                        onHoverNumber={(value) => setDgaHoveredNumber(value)}
                        onChange={handleDgaStripChange}
                        includeHeaderSpacer={false}
                        topOffsetPx={DGA_CELL_SIZE}
                        testIdPrefix="dga-grid-sim-strip"
                      />
                    )}
                  />
                ) : (
                  <i>No grid data available.</i>
                )}
              </div>
            </InlineCollapsibleCard>
          </div>

          <div style={{ marginTop: 12 }}>
            <InlineCollapsibleCard
              title="DGA constellation diagnostic"
              subtitle="Observe-only local diagonal and orbit-cell density check"
              collapsedSummary="Measures whether a chosen DGA centre cell has unusually dense exact diagonals or nearby local cells against historical number baselines."
              defaultExpanded={false}
              keepMounted={true}
              collapsedLabel="Show constellation diagnostic ▼"
            >
              <div style={{ padding: "10px 12px 12px" }}>
                <DGAConstellationDiagnosticPanel history={realHistory} />
              </div>
            </InlineCollapsibleCard>
          </div>

          <DGAMonthlyBucketStateGrid
            timeline={dgaMonthlyBucketTimeline}
            currentMonthLabel={dgaEffectiveMonthLabel}
            cellSize={DGA_CELL_SIZE}
            hoveredNumber={dgaHoveredNumber}
            onHoverNumber={(value) => setDgaHoveredNumber(value)}
            selectedNumbers={dgaStripSelectedNumbers}
            cellOpacity={dgaMonthlyBucketStateOpacity}
            onCellOpacityChange={(value) => setDgaMonthlyBucketStateOpacity(clampDgaMonthlyBucketStateOpacity(value))}
          />
        </div>
      </CollapsibleSection>

      <WorkflowAnchor
        id="workflow-patterns"
        title="Patterns"
        summary="Explore empirical undrawn and carry-over behavior with explicit window and mains/supplementary context."
      />

      {/* [ORDER-ANCHOR] 26 Undrawn Patterns (Empirical) */}
      <CollapsibleSection panelId="undrawn-patterns" title={<b>Undrawn Patterns (Empirical)</b>} defaultOpen={false} summaryHint="Mains vs mains+supps toggle">
        <UndrawnPatternsPanel
          history={realFilteredHistory}
          windowLabel={historyWindowName}
          loadedDrawCount={realHistory.length}
        />
      </CollapsibleSection>

      <TracePanel lines={trace} onClear={() => setTrace([])} />
    </div>
    </PanelFavoritesProvider>
  );

  // Snapshot helpers used by Presets
  function buildSnapshot(options: { includePanelFavorites?: boolean; includeDerivedPredictionEvidence?: boolean } = {}): AppPresetSnapshot {
    const includePanelFavorites = options.includePanelFavorites ?? true;
    const includeDerivedPredictionEvidence = options.includeDerivedPredictionEvidence ?? false;
    const sortedSnapshotNumbers = (numbers: number[]) => numbers.slice().sort((left, right) => left - right);
    const zpaSelected = getSavedSelectedZones() ?? Array(9).fill(true);
    const zpaNorm = getSavedNormalizeMode() ?? "all";
    const zpaGroups = getSavedGroups() ?? custom;
    const snapshot: AppPresetSnapshot = {
      drawWindowMode,
      rangeFrom,
      rangeTo,
      windowEnabled,
      windowMode,
      customDrawCount,
      knobs: { ...knobs },
      entropyEnabled,
      entropyThreshold,
      hammingEnabled,
      hammingThreshold,
      jaccardEnabled,
      jaccardThreshold,
      lambdaEnabled,
      lambda,
      gpwfEnabled,
      gpwf_window_size,
      gpwf_bias_factor,
      gpwf_floor,
      gpwf_scale_multiplier,
      selectedRatios: [...selectedRatios],
      useTrickyRule,
      excludedNumbers: [...excludedNumbers],
      hotColdForcedNumbers: [...hotColdForcedNumbers],
      hotColdExcludedNumbers: [...hotColdExcludedNumbers],
      droughtBreakSelectedNumbers: [...droughtBreakSelectedNumbers],
      pasteWeightedForcedNumbers: [...pasteWeightedForcedNumbers],
      trendLookback,
      trendThreshold,
      allowedTrendRatios: [...allowedTrendRatios],
      trendSelectedNumbers: [...trendSelectedNumbers],
      rankingWeights: { ...rankingWeights },
      weightedTargets: { ...weightedTargets },
      applyZoneBias,
      zoneGamma,
      zpa: {
        selectedZones: [...zpaSelected],
        normalizeMode: zpaNorm,
        groups: zpaGroups,
      },
      ttp: {},
      mainZeroSetEnabled,
      mainZeroSetCount: maxMainZeroSetCount,
      mainOneSetEnabled,
      mainOneSetCount: maxMainOneSetCount,
      mainTwoSetEnabled,
      mainTwoSetCount: maxMainTwoSetCount,
      mainThreeSetEnabled,
      mainThreeSetCount: maxMainThreeSetCount,
      mainFourSetEnabled,
      mainFourSetCount: maxMainFourSetCount,
      mainFiveSetEnabled,
      mainFiveSetCount: maxMainFiveSetCount,
      mainSixSetEnabled,
      mainSixSetCount: maxMainSixSetCount,
      mainSevenSetEnabled,
      mainSevenSetCount: maxMainSevenSetCount,
      mainEightSetEnabled,
      mainEightSetCount: maxMainEightSetCount,
      mainNineSetEnabled,
      mainNineSetCount: maxMainNineSetCount,
      mainBucketBoosts: { ...mainBucketBoosts },
      mainDecadeBiases: { ...mainDecadeBiases },
      digitWidthConstraintEnabled,
      digitWidthSingleDigitPercent,
      digitWidthScope: digitWidthConstraintScope,
      attemptMultiplier,
      overgenFactor,
      scoringGenerationInfluence,
      d1TerminalMomentumSgiEnabled,
      d1TerminalMomentumInternalStrength: d1TerminalMomentumGenerationProfile.internalStrength,
      d1TerminalMomentumStageMode: d1TerminalMomentumGenerationProfile.stageMode,
      d1TerminalMomentumMonthLabel: d1TerminalMomentumGenerationProfile.monthLabel,
      d1TerminalMomentumTargetDrawNumber: d1TerminalMomentumGenerationProfile.targetDrawNumber,
      d1TerminalMomentumTraceLabel: d1TerminalMomentumGenerationProfile.traceLabel,
      d1TerminalMomentumActiveDigits: d1TerminalMomentumGenerationProfile.digits.map((digit) => digit.digit),
      monthlyConstructiveEnabled,
      acceptanceNeedsEnabled,
      acceptanceNeedsCounts: monthlyConstructiveEnabled && monthlyConstraintPayload
        ? monthlyConstraintPayload.constraints
        : acceptanceNeedsCounts,
      acceptanceNeedsHardExclude,
      selectedBoostEnabled,
      selectedBoostFactor,
      ogaSpokeCount,
      numCandidates,
      autoExcludeUnselected,
      userSelectedNumbers: [...userSelectedNumbers],
      manualSimSelected: [...manualSimSelected],
      minRecentMatches,
      recentMatchBias,
      previousNeighbourConstraintNumbers: [...previousNeighbourConstraintNumbers],
      latestNeighbourSupportEnabled,
      strictDroughtQuotaMode,
      strictDroughtQuotaManualMin,
      repeatWindowSizeW,
      minFromRecentUnionM,
      sumFilter: { ...sumFilter },
      patternConstraintMode,
      patternBoostFactor,
      patternSumTolerance,
      selectedWindowPatterns: [...selectedWindowPatterns],
      insightsEnabled,
      dgaHeatmapView,
      tempMetric,
      showHeatmapLetters,
      showMbsHoverSparkline,
      dgaMonthlyBucketStateOpacity,
      ogaRefMode,
      enableOGAForecastBias,
      ogaBaselineMode,
      ogaPreferredBand,
      ogaPreferredDeciles: [...ogaPreferredDeciles],
      traceVerbose,
      monthEndCarryOverBiasEnabled: monthEndCarryOverBiasTouchedRef.current ? monthEndCarryOverBiasEnabled : undefined,
      monthEndCarryOverStrength,
      monthEndCarryOverIncludeMonthEndUndrawn,
      monthEndCarryOverIncludeBoundaryRepeats,
      selectedCarryOverBoostNumbers: [...selectedCarryOverBoostNumbers],
      selectedCarryOverBoostMode,
      rdyWeights: normalizeRdyWeights(rdyWeights),
      rdyWeightOffState: { ...rdyWeightOffState },
      readinessHardFilters: normalizeReadinessHardFilters(readinessHardFilters),
    };

    if (includePanelFavorites) {
      snapshot.favoritePanelIds = [...favoritePanelIds];
    }

    if (includeDerivedPredictionEvidence) {
      const droughtBreakShortlistTop = 8;
      const strictDroughtShortlist = computeStrictDroughtShortlist(realFilteredHistory, realHistory, {
        threshold: STRICT_DROUGHT_DEFAULT_THRESHOLD,
      }).rows.slice(0, droughtBreakShortlistTop).map((row) => row.number);
      const empiricalDroughtHazardShortlist = computeDroughtHazard(realFilteredHistory)
        .byNumber
        .slice()
        .sort((left, right) => right.p - left.p || right.k - left.k || left.number - right.number)
        .slice(0, droughtBreakShortlistTop)
        .map((row) => row.number);
      snapshot.autoExcludedFromSelection = sortedSnapshotNumbers(autoExcludedFromSelection);
      snapshot.mainConstraintAutoExcludedNumbers = sortedSnapshotNumbers(mainConstraintAutoExclusions.excludedNumbers);
      snapshot.effectiveExcludedNumbers = sortedSnapshotNumbers(effectiveExcludedNumbers);
      snapshot.generationForcedNumbers = sortedSnapshotNumbers(generationForcedNumbers);
      snapshot.generationExcludedNumbers = sortedSnapshotNumbers(generationExcludedNumbers);
      snapshot.allExcludedNumbers = sortedSnapshotNumbers(allExclusions);
      if (dgaSuppSuggestion) {
        snapshot.dgaSuggestedMainNumbers = sortedSnapshotNumbers(dgaSuppSuggestion.main);
        snapshot.dgaSuggestedSuppNumbers = sortedSnapshotNumbers(dgaSuppSuggestion.supp);
        snapshot.dgaSuggestedSuppPair = sortedSnapshotNumbers(dgaSuppSuggestion.selectedPair);
        snapshot.dgaSuggestedSuppPairActiveCount = dgaSuppSuggestion.selectedPairEvidence.activePairSuppCount;
        snapshot.dgaSuggestedSuppPairFullCount = dgaSuppSuggestion.selectedPairEvidence.fullPairSuppCount;
        snapshot.dgaSuggestedSuppPairActiveDrawCount = dgaSuppSuggestion.selectedPairEvidence.activeDrawCount;
        snapshot.dgaSuggestedSuppPairFullDrawCount = dgaSuppSuggestion.selectedPairEvidence.fullDrawCount;
        snapshot.dgaSuggestedSuppPairActiveGap = dgaSuppSuggestion.selectedPairEvidence.activeLastPairSuppGap;
        snapshot.dgaSuggestedSuppPairFullGap = dgaSuppSuggestion.selectedPairEvidence.fullLastPairSuppGap;
        snapshot.dgaSuppPairActiveCoverage = dgaSuppSuggestion.pairCoverage.activeObservedPairs;
        snapshot.dgaSuppPairFullCoverage = dgaSuppSuggestion.pairCoverage.fullObservedPairs;
        snapshot.dgaSuppPairTotalCoverage = dgaSuppSuggestion.pairCoverage.totalPairs;
      }
      snapshot.sde1Exclusions = sortedSnapshotNumbers(sde1Exclusions);
      snapshot.hc3Exclusions = sortedSnapshotNumbers(hc3Exclusions);
      snapshot.droughtBreakStrictShortlistNumbers = sortedSnapshotNumbers(strictDroughtShortlist);
      snapshot.droughtBreakEmpiricalHazardNumbers = sortedSnapshotNumbers(empiricalDroughtHazardShortlist);
      snapshot.droughtBreakShortlistTop = droughtBreakShortlistTop;
      snapshot.droughtBreakStrictThreshold = STRICT_DROUGHT_DEFAULT_THRESHOLD;
      snapshot.strictDroughtQuotaEffectiveMin = strictDroughtQuotaEffectiveMin;
      snapshot.strictDroughtQuotaEligibleNumbers = sortedSnapshotNumbers(strictDroughtQuotaEligibleNumbers);
      snapshot.strictDroughtQuotaAdviceShouldApply = strictDroughtQuotaAdvice.shouldApplyQuota;
      snapshot.strictDroughtQuotaAdviceRecommendedMin = strictDroughtQuotaAdvice.recommendedMinCount;
      snapshot.strictDroughtQuotaAdviceConfidence = strictDroughtQuotaAdvice.confidence;
      snapshot.strictDroughtQuotaAdviceSource = strictDroughtQuotaAdvice.source;
      snapshot.strictDroughtQuotaAdviceSourceLabel = strictDroughtQuotaAdvice.sourceLabel;
      snapshot.strictDroughtQuotaAdviceReason = strictDroughtQuotaAdvice.reason;
      snapshot.strictDroughtQuotaAdviceTraceLabel = strictDroughtQuotaAdvice.traceLabel;
      snapshot.strictDroughtQuotaAdviceTrials = strictDroughtQuotaAdvice.trials;
      snapshot.strictDroughtQuotaAdviceAverageHits = strictDroughtQuotaAdvice.averageHits;
      snapshot.strictDroughtQuotaAdviceExpectedRandomAverageHits = strictDroughtQuotaAdvice.expectedRandomAverageHits;
      snapshot.strictDroughtQuotaAdviceOneToThreeHitRate = strictDroughtQuotaAdvice.oneToThreeHitRate;
      snapshot.strictDroughtQuotaAdviceExpectedRandomOneToThreeHitRate = strictDroughtQuotaAdvice.expectedRandomOneToThreeHitRate;
      snapshot.strictDroughtQuotaAdviceOneToThreeLift = strictDroughtQuotaAdvice.oneToThreeLift;
      snapshot.strictDroughtQuotaAdviceZeroHitRate = strictDroughtQuotaAdvice.zeroHitRate;
      snapshot.strictDroughtQuotaAdviceExpectedRandomZeroHitRate = strictDroughtQuotaAdvice.expectedRandomZeroHitRate;
      snapshot.selectionInsightsSnapshot = buildSelectionInsightsSnapshot({
        enabled: insightsEnabled,
        selected: userSelectedNumbers,
        windowLabel: historyWindowName,
        windowHistory: realFilteredHistory,
        allHistory: realHistory,
        maxRows: 12,
      });
    }

    return snapshot;
  }

  function applySnapshot(s: AppPresetSnapshot) {
    setDrawWindowMode(s.drawWindowMode);
    setRangeFrom(s.rangeFrom);
    setRangeTo(s.rangeTo);
    setWindowEnabled(s.windowEnabled);
    setWindowMode(s.windowMode as any);
    setCustomDrawCount(s.customDrawCount);
    setKnobs(prev => ({ ...prev, ...s.knobs }));
    setEntropyEnabled(s.entropyEnabled);
    setEntropyThreshold(s.entropyThreshold);
    setHammingEnabled(s.hammingEnabled);
    setHammingThreshold(s.hammingThreshold);
    setJaccardEnabled(s.jaccardEnabled);
    setJaccardThreshold(s.jaccardThreshold);
    setLambdaEnabled(s.lambdaEnabled);
    setLambda(s.lambda);
    setGPWFEnabled(s.gpwfEnabled);
    setGPWFWindowSize(s.gpwf_window_size);
    setGPWFBiasFactor(s.gpwf_bias_factor);
    setGPWFFloor(s.gpwf_floor);
    setGPWFScaleMultiplier(s.gpwf_scale_multiplier);
    setSelectedRatios(s.selectedRatios);
    setUseTrickyRule(s.useTrickyRule);
    setExcludedNumbers(s.excludedNumbers);
    setHotColdForcedNumbers(normalizeHotColdGenerationNumbers(s.hotColdForcedNumbers));
    setHotColdExcludedNumbers(normalizeHotColdGenerationNumbers(s.hotColdExcludedNumbers));
    setDroughtBreakSelectedNumbers(normalizeHotColdGenerationNumbers(s.droughtBreakSelectedNumbers).slice(0, MAX_DROUGHT_BREAK_FORCED_NUMBERS));
    setPasteWeightedForcedNumbers(normalizeHotColdGenerationNumbers(s.pasteWeightedForcedNumbers));
    setRankingWeights({
          oga: s.rankingWeights?.oga ?? 0.7,
          selHitsEnabled: s.rankingWeights?.selHitsEnabled ?? false,
          sel: s.rankingWeights?.sel ?? 0.2,
          recentHitsEnabled: s.rankingWeights?.recentHitsEnabled ?? false,
          recent: s.rankingWeights?.recent ?? 0.1,
          selBonusThreshold: s.rankingWeights?.selBonusThreshold ?? 3,
          selBonusWeight: s.rankingWeights?.selBonusWeight ?? 0,
    });
    setWeightedTargets(s.weightedTargets);
    setApplyZoneBias(s.applyZoneBias);
    setZoneGamma(s.zoneGamma);
    const legacyMainDiv5Enabled = s.mainDiv5Enabled ?? (typeof s.mainDiv5Count === "number" || s.requireDiv5 === true);
    const legacyMainDiv5Count = typeof s.mainDiv5Count === "number"
      ? s.mainDiv5Count
      : s.requireDiv5
        ? 1
        : 0;
    setMainZeroSetEnabled(s.mainZeroSetEnabled ?? legacyMainDiv5Enabled);
    setMaxMainZeroSetCount(Math.max(0, Math.min(4, s.mainZeroSetCount ?? legacyMainDiv5Count)));
    setMainOneSetEnabled(s.mainOneSetEnabled ?? typeof s.mainOneSetCount === "number");
    setMaxMainOneSetCount(Math.max(0, Math.min(5, s.mainOneSetCount ?? 0)));
    setMainTwoSetEnabled(s.mainTwoSetEnabled ?? typeof s.mainTwoSetCount === "number");
    setMaxMainTwoSetCount(Math.max(0, Math.min(5, s.mainTwoSetCount ?? 0)));
    setMainThreeSetEnabled(s.mainThreeSetEnabled ?? typeof s.mainThreeSetCount === "number");
    setMaxMainThreeSetCount(Math.max(0, Math.min(5, s.mainThreeSetCount ?? 0)));
    setMainFourSetEnabled(s.mainFourSetEnabled ?? typeof s.mainFourSetCount === "number");
    setMaxMainFourSetCount(Math.max(0, Math.min(5, s.mainFourSetCount ?? 0)));
    setMainFiveSetEnabled(s.mainFiveSetEnabled ?? legacyMainDiv5Enabled);
    setMaxMainFiveSetCount(Math.max(0, Math.min(5, s.mainFiveSetCount ?? legacyMainDiv5Count)));
    setMainSixSetEnabled(s.mainSixSetEnabled ?? typeof s.mainSixSetCount === "number");
    setMaxMainSixSetCount(Math.max(0, Math.min(4, s.mainSixSetCount ?? 0)));
    setMainSevenSetEnabled(s.mainSevenSetEnabled ?? typeof s.mainSevenSetCount === "number");
    setMaxMainSevenSetCount(Math.max(0, Math.min(4, s.mainSevenSetCount ?? 0)));
    setMainEightSetEnabled(s.mainEightSetEnabled ?? typeof s.mainEightSetCount === "number");
    setMaxMainEightSetCount(Math.max(0, Math.min(4, s.mainEightSetCount ?? 0)));
    setMainNineSetEnabled(s.mainNineSetEnabled ?? typeof s.mainNineSetCount === "number");
    setMaxMainNineSetCount(Math.max(0, Math.min(4, s.mainNineSetCount ?? 0)));
    const nextMainBucketBoosts: MainBucketBoostState = {
      main0: { ...defaultMainBucketBoosts.main0 },
      main1: { ...defaultMainBucketBoosts.main1 },
      main2: { ...defaultMainBucketBoosts.main2 },
      main3: { ...defaultMainBucketBoosts.main3 },
      main4: { ...defaultMainBucketBoosts.main4 },
      main5: { ...defaultMainBucketBoosts.main5 },
      main6: { ...defaultMainBucketBoosts.main6 },
      main7: { ...defaultMainBucketBoosts.main7 },
      main8: { ...defaultMainBucketBoosts.main8 },
      main9: { ...defaultMainBucketBoosts.main9 },
    };
    Object.entries(s.mainBucketBoosts ?? {}).forEach(([bucketKey, boost]) => {
      if (!(bucketKey in nextMainBucketBoosts)) return;
      const bucketNumbers = generationConstraintNumberBuckets[bucketKey as GenerationConstraintBucketKey] ?? [];
      const hasSingleDigitNumbers = bucketNumbers.some((n) => n >= 1 && n <= 9);
      const hasTwoDigitNumbers = bucketNumbers.some((n) => n >= 10 && n <= 45);
      if (typeof boost === "number") {
        const numericBoost = Number.isFinite(boost) ? boost : Number(boost);
        const safeBoost = Math.max(0, Math.min(5, Number.isFinite(numericBoost) ? numericBoost : 0));
        nextMainBucketBoosts[bucketKey as GenerationConstraintBucketKey] = {
          singleDigit: hasSingleDigitNumbers ? safeBoost : 0,
          twoDigit: hasTwoDigitNumbers ? safeBoost : 0,
        };
        return;
      }
      if (!boost || typeof boost !== "object") return;
      const singleDigitBoost = typeof boost.singleDigit === "number" ? boost.singleDigit : Number(boost.singleDigit);
      const twoDigitBoost = typeof boost.twoDigit === "number" ? boost.twoDigit : Number(boost.twoDigit);
      nextMainBucketBoosts[bucketKey as GenerationConstraintBucketKey] = {
        singleDigit: hasSingleDigitNumbers ? Math.max(0, Math.min(5, Number.isFinite(singleDigitBoost) ? singleDigitBoost : 0)) : 0,
        twoDigit: hasTwoDigitNumbers ? Math.max(0, Math.min(5, Number.isFinite(twoDigitBoost) ? twoDigitBoost : 0)) : 0,
      };
    });
    setMainBucketBoosts(nextMainBucketBoosts);
    const nextMainDecadeBiases: Record<GenerationConstraintDecadeKey, number> = { ...defaultMainDecadeBiases };
    Object.entries(s.mainDecadeBiases ?? {}).forEach(([bucketKey, bias]) => {
      if (!(bucketKey in nextMainDecadeBiases)) return;
      const numericBias = typeof bias === "number" ? bias : Number(bias);
      nextMainDecadeBiases[bucketKey as GenerationConstraintDecadeKey] = Math.max(-5, Math.min(5, Number.isFinite(numericBias) ? numericBias : 0));
    });
    setMainDecadeBiases(nextMainDecadeBiases);
    setDigitWidthConstraintEnabled(!!s.digitWidthConstraintEnabled);
    setDigitWidthSingleDigitPercent(Math.max(0, Math.min(100, Math.round((s.digitWidthSingleDigitPercent ?? 0) / 5) * 5)));
    setDigitWidthConstraintScope(s.digitWidthScope === "mainAndSupp" ? "mainAndSupp" : "main");
    setAttemptMultiplier(s.attemptMultiplier ?? DEFAULT_ATTEMPT_MULTIPLIER);
    setOvergenFactor((s as any).overgenFactor ?? 50);
    setScoringGenerationInfluence(
      s.scoringGenerationInfluence === "light" || s.scoringGenerationInfluence === "normal" || s.scoringGenerationInfluence === "strong"
        ? s.scoringGenerationInfluence
        : "off",
    );
    setD1TerminalMomentumSgiEnabled(!!s.d1TerminalMomentumSgiEnabled);
    setAcceptanceNeedsHardExclude(!!(s as any).acceptanceNeedsHardExclude);
    setSelectedBoostEnabled(s.selectedBoostEnabled ?? false);
    setSelectedBoostFactor(s.selectedBoostFactor ?? 2);
    setOgaSpokeCount(s.ogaSpokeCount ?? 9);
    setNumCandidatesState(
      typeof s.numCandidates === "number"
        ? normalizeGeneratedCandidateCount(s.numCandidates, lastWindowDefaultNumCandidatesRef.current)
        : lastWindowDefaultNumCandidatesRef.current,
    );
    setAutoExcludeUnselected(!!s.autoExcludeUnselected);
    setUserSelectedNumbers(s.userSelectedNumbers ?? []);
    setManualSimSelected(s.manualSimSelected ?? []);
    setMinRecentMatches(s.minRecentMatches ?? 0);
    setRecentMatchBias(s.recentMatchBias ?? 0);
    setTrendLookback(Math.max(1, Math.min(52, Math.round(s.trendLookback ?? 4))));
    setTrendThreshold(Math.max(0, Math.min(1, Number.isFinite(s.trendThreshold) ? s.trendThreshold : 0.02)));
    setAllowedTrendRatios(Array.from(new Set((s.allowedTrendRatios ?? []).filter((tag) => /^\d+-\d+-\d+$/.test(tag)))));
    setPreviousNeighbourConstraintNumbers(normalizePreviousNeighbourConstraintNumbers(s.previousNeighbourConstraintNumbers ?? []));
    setLatestNeighbourSupportEnabled(!!s.latestNeighbourSupportEnabled);
    setStrictDroughtQuotaMode(
      s.strictDroughtQuotaMode === "manual" || s.strictDroughtQuotaMode === "advised"
        ? s.strictDroughtQuotaMode
        : "off",
    );
    setStrictDroughtQuotaManualMin(Math.max(0, Math.min(8, Math.round(s.strictDroughtQuotaManualMin ?? 1))));
    setRepeatWindowSizeW(s.repeatWindowSizeW ?? 12);
    setMinFromRecentUnionM(s.minFromRecentUnionM ?? 0);
    setSumFilter(s.sumFilter ?? { enabled: false, min: 0, max: 0, includeSupp: true });
    setPatternConstraintModeode(s.patternConstraintMode ?? 'boost');
    setPatternBoostFactor(s.patternBoostFactor ?? 0.15);
    setPatternSumTolerance(s.patternSumTolerance ?? 0);
    setSelectedWindowPatterns(s.selectedWindowPatterns ?? []);
    setInsightsEnabled(s.insightsEnabled ?? false);
    setDgaHeatmapView(s.dgaHeatmapView === 'monthlyBucketState' ? 'monthlyBucketState' : 'temperature');
    setTempMetric(s.tempMetric ?? 'hybrid');
    setShowHeatmapLetters(s.showHeatmapLetters ?? false);
    setShowMbsHoverSparkline(s.showMbsHoverSparkline ?? true);
    setDgaMonthlyBucketStateOpacity(clampDgaMonthlyBucketStateOpacity(s.dgaMonthlyBucketStateOpacity ?? 1));
    setOgaRefMode(s.ogaRefMode ?? 'window');
    setEnableOGAForecastBias(s.enableOGAForecastBias ?? false);
    setOGABaselineMode(s.ogaBaselineMode ?? 'window');
    setOGAPreferredBand(s.ogaPreferredBand ?? 'auto');
    setOGAPreferredDeciles(s.ogaPreferredDeciles ?? []);
    setTraceVerbose(s.traceVerbose ?? true);
    setMonthEndCarryOverStrength(normalizeMonthEndCarryOverStrength(s.monthEndCarryOverStrength));
    setMonthEndCarryOverIncludeMonthEndUndrawn(s.monthEndCarryOverIncludeMonthEndUndrawn ?? true);
    setMonthEndCarryOverIncludeBoundaryRepeats(s.monthEndCarryOverIncludeBoundaryRepeats ?? true);
    if (typeof s.monthEndCarryOverBiasEnabled === "boolean") {
      monthEndCarryOverBiasTouchedRef.current = true;
      setMonthEndCarryOverBiasEnabled(s.monthEndCarryOverBiasEnabled);
    } else {
      monthEndCarryOverBiasTouchedRef.current = false;
      setMonthEndCarryOverBiasEnabled(monthEndCarryOverWeighting.defaultEnabled);
    }
    setSelectedCarryOverBoostNumbers(
      Array.from(new Set((s.selectedCarryOverBoostNumbers ?? []).filter((number) => Number.isInteger(number) && number >= 1 && number <= 45)))
        .sort((left, right) => left - right)
    );
    setSelectedCarryOverBoostMode(normalizeSelectedCarryOverBoostMode(s.selectedCarryOverBoostMode));
    setRdyWeights(normalizeRdyWeights(s.rdyWeights));
    setRdyWeightOffState(normalizeRdyWeightOffState(s.rdyWeightOffState));
    setReadinessHardFilters(normalizeReadinessHardFilters(s.readinessHardFilters));
    if (Array.isArray(s.favoritePanelIds)) {
      setFavoritePanelIds(normalizeFavoritePanelIds(s.favoritePanelIds));
    }
  }
}

// Bucket color palette – matches Monthly Draw Summary frequency chips
const _stripColorForTimes = (times: number): string => {
  const palette: Record<number, string> = {
    0: "rgba(117,117,117,0.70)",
    1: "rgba(66,165,245,0.70)",
    2: "rgba(102,187,106,0.70)",
    3: "rgba(38,198,218,0.70)",
    4: "rgba(251,192,45,0.70)",
    5: "rgba(251,140,0,0.72)",
    6: "rgba(244,81,30,0.72)",
    7: "rgba(229,57,53,0.74)",
  };
  return palette[times] ?? "rgba(142,36,170,0.74)";
};
const _stripBucketColor = (n: number, buckets: MonthlyBucketSets | null | undefined): string | undefined => {
  if (!buckets) return undefined;
  if (buckets.undrawn.has(n)) return _stripColorForTimes(0);
  if (buckets.times1.has(n)) return _stripColorForTimes(1);
  if (buckets.times2.has(n)) return _stripColorForTimes(2);
  if (buckets.times3.has(n)) return _stripColorForTimes(3);
  if (buckets.times4.has(n)) return _stripColorForTimes(4);
  if (buckets.times5.has(n)) return _stripColorForTimes(5);
  if (buckets.times6.has(n)) return _stripColorForTimes(6);
  if (buckets.times7.has(n)) return _stripColorForTimes(7);
  if (buckets.times8.has(n)) return _stripColorForTimes(8);
  return undefined;
};

const _formatDgaScoringScore = (score: number): string => (
  Number.isFinite(score) ? score.toFixed(1).replace(/\.0$/, "") : "0"
);

const _formatDgaSuppSuggestionTitle = (suggestion: DgaSuppSuggestion): string => {
  const suppSet = new Set(suggestion.supp);
  const rows = suggestion.evidence
    .filter((row) => suppSet.has(row.number))
    .map((row) => `${row.number}: WFMQYH supp ${row.activeSuppCount}/${row.activeDrawCount}, all-history supp ${row.fullSuppCount}/${row.fullDrawCount}`);
  const pair = suggestion.selectedPairEvidence;
  const activeGap = pair.activeLastPairSuppGap === null ? "never in WFMQYH" : `last exact pair gap ${pair.activeLastPairSuppGap}`;
  const fullGap = pair.fullLastPairSuppGap === null ? "never in all history" : `last exact pair gap ${pair.fullLastPairSuppGap}`;
  return [
    `Suggested supplementary numbers: ${suggestion.supp.join(", ")}`,
    ...rows,
    `Exact pair evidence: ${pair.pair.join("-")} · WFMQYH ${pair.activePairSuppCount}/${pair.activeDrawCount} (${activeGap}) · all-history ${pair.fullPairSuppCount}/${pair.fullDrawCount} (${fullGap})`,
    `Selected-8 pair coverage: WFMQYH ${suggestion.pairCoverage.activeObservedPairs}/${suggestion.pairCoverage.totalPairs}, all-history ${suggestion.pairCoverage.fullObservedPairs}/${suggestion.pairCoverage.totalPairs}.`,
    suggestion.reason,
  ].join("\n");
};

// DGASimulateStrip – select numbers to simulate in the Next column of the DGA grid
interface DGASimulateStripProps {
  selectedNumbers: number[];
  onChange: (nums: number[]) => void;
  cellSize?: number;
  monthlyBuckets?: MonthlyBucketSets | null;
  scoringNumberDiagnostics?: Record<number, DGAScoringNumberDiagnostic>;
  suppSuggestion?: DgaSuppSuggestion | null;
  excludedNumbers?: number[];
  hoveredNumber?: number | null;
  onHoverNumber?: (value: number | null) => void;
  includeHeaderSpacer?: boolean;
  topOffsetPx?: number;
  testIdPrefix?: string;
}
const DGASimulateStrip: React.FC<DGASimulateStripProps> = ({
  selectedNumbers,
  onChange,
  cellSize,
  monthlyBuckets,
  scoringNumberDiagnostics,
  suppSuggestion,
  excludedNumbers = [],
  hoveredNumber,
  onHoverNumber,
  includeHeaderSpacer = true,
  topOffsetPx = 0,
  testIdPrefix = "dga-simulate-strip",
}) => {
  const SIMULATION_NUMBER_LIMIT = 8;
  const userExcludedNumbers = useMemo(() => normalizeUserExclusionLocks(excludedNumbers), [excludedNumbers]);
  const userExcludedSet = useMemo(() => new Set(userExcludedNumbers), [userExcludedNumbers]);
  const activeSelectedNumbers = useMemo(
    () => removeUserExcludedNumbers(selectedNumbers, userExcludedNumbers),
    [selectedNumbers, userExcludedNumbers],
  );
  const selectionCountLabel = activeSelectedNumbers.length > SIMULATION_NUMBER_LIMIT
    ? `${activeSelectedNumbers.length} selected · first ${SIMULATION_NUMBER_LIMIT} simulate`
    : `${activeSelectedNumbers.length}/${SIMULATION_NUMBER_LIMIT}`;
  const suppSuggestionTitle = suppSuggestion ? _formatDgaSuppSuggestionTitle(suppSuggestion) : "";
  const userExclusionReminder = useMemo(
    () => formatUserExclusionReminder(userExcludedNumbers),
    [userExcludedNumbers],
  );
  const tableCellSize = Math.max(18, Math.floor(cellSize ?? 20));
  const tableCellLineHeight = `${tableCellSize}px`;

  const handleToggle = (n: number) => {
    if (userExcludedSet.has(n)) return;
    if (activeSelectedNumbers.includes(n)) {
      onChange(activeSelectedNumbers.filter((x) => x !== n));
    } else {
      onChange([...activeSelectedNumbers, n]);
    }
  };

  return (
    <div style={{ marginTop: 0 }} data-testid={testIdPrefix}>
      <div style={{ display: "flex", flexDirection: "column", gap: 0, paddingTop: 0, paddingBottom: 0, alignItems: "flex-start" }}>
        <div style={{ border: 0, background: "transparent", paddingTop: topOffsetPx }}>
          <table style={{ borderCollapse: "collapse", borderSpacing: 0, fontSize: 11 }}>
            {includeHeaderSpacer && (
              <thead>
                <tr>
                  <th
                    style={{
                      height: tableCellSize,
                      minHeight: tableCellSize,
                      lineHeight: tableCellLineHeight,
                      padding: 0,
                      border: 0,
                      boxSizing: "border-box",
                      background: "transparent",
                    }}
                  ></th>
                </tr>
              </thead>
            )}
            <tbody>
              {Array.from({ length: 45 }, (_, i) => i + 1).map((n) => {
                const isUserExcluded = userExcludedSet.has(n);
                const checked = !isUserExcluded && activeSelectedNumbers.includes(n);
                const disabled = isUserExcluded;
                const isHovered = hoveredNumber === n;
                const bucketColor = _stripBucketColor(n, monthlyBuckets);
                const bgColor = checked ? "#1565c0" : (bucketColor ?? "transparent");
                const textColor = checked || bucketColor ? "#fff" : "#333";
                const diagnostic = scoringNumberDiagnostics?.[n];
                const diagnosticTitle = diagnostic
                  ? `Numbers diagnostic rank #${diagnostic.rank}/45 · score ${_formatDgaScoringScore(diagnostic.score)} (mains + supps; diagnostic support, not probability).`
                  : "Numbers diagnostic rank unavailable.";
                const actionTitle = isUserExcluded
                  ? `Number ${n} is unavailable because it is excluded. Clear the active exclusion or turn off the rule before selecting it here.`
                  : checked
                    ? `Remove ${n} from user-selected numbers`
                    : `Add ${n} to user-selected numbers`;

                return (
                  <tr key={n}>
                    <td
                      style={{
                        height: tableCellSize,
                        minHeight: tableCellSize,
                        lineHeight: tableCellLineHeight,
                        padding: 0,
                        border: 0,
                        boxSizing: "border-box",
                        background: "transparent",
                      }}
                    >
                      <label
                        onMouseEnter={() => onHoverNumber?.(n)}
                        onMouseLeave={() => onHoverNumber?.(null)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          minWidth: 28,
                          height: tableCellSize,
                          boxSizing: "border-box",
                          cursor: disabled ? "not-allowed" : "pointer",
                          opacity: disabled ? 0.4 : 1,
                          background: isHovered ? "rgba(21,101,192,0.10)" : "transparent",
                          borderRadius: 6,
                          boxShadow: isHovered ? "inset 0 0 0 1px rgba(21,101,192,0.30)" : "none",
                          padding: "0 4px 0 2px",
                        }}
                        title={`${actionTitle}\n${diagnosticTitle}`}
                      >
                        <input
                          data-testid={`${testIdPrefix}-number-${n}`}
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          aria-label={isUserExcluded
                            ? `Number ${n} is unavailable because it is excluded`
                            : diagnostic
                              ? `${checked ? "Remove" : "Add"} ${n} to user-selected numbers; Numbers diagnostic rank ${diagnostic.rank} of 45`
                              : undefined}
                          onChange={() => handleToggle(n)}
                          style={{ margin: 0 }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            minWidth: 20,
                            textAlign: "center",
                            display: "inline-block",
                            background: bgColor,
                            color: textColor,
                            borderRadius: 3,
                            padding: (checked || bucketColor) ? "0 3px" : undefined,
                            boxShadow: isHovered ? "0 0 0 2px rgba(13,71,161,0.35)" : undefined,
                            fontWeight: isHovered ? 800 : 600,
                          }}
                        >
                          {n}
                        </span>
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {selectedNumbers.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => onChange([])}
              style={{ marginTop: 4, fontSize: 10, lineHeight: 1.1, padding: "1px 5px", cursor: "pointer", alignSelf: "flex-start" }}
              title="Clear user-selected numbers"
            >
              Clear
            </button>
          </>
        )}
        {userExclusionReminder && (
          <span
            style={{ marginTop: 4, maxWidth: 92, color: "#64748b", fontSize: 10, lineHeight: 1.25 }}
            title={`${userExclusionReminder}. Clear the manual exclusion or turn off the rule that excludes them before selecting them here.`}
          >
            exclusions active
          </span>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginTop: 4,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: activeSelectedNumbers.length > SIMULATION_NUMBER_LIMIT ? "#9a3412" : "#546e7a",
              background: activeSelectedNumbers.length > SIMULATION_NUMBER_LIMIT ? "#fff7ed" : "#f3f7fb",
              border: `1px solid ${activeSelectedNumbers.length > SIMULATION_NUMBER_LIMIT ? "#fed7aa" : "#d8e3ef"}`,
              borderRadius: 999,
              padding: "1px 6px",
              fontVariantNumeric: "tabular-nums",
            }}
            title={activeSelectedNumbers.length > SIMULATION_NUMBER_LIMIT ? `Shared user selection has ${activeSelectedNumbers.length} numbers; DGA simulation uses the first ${SIMULATION_NUMBER_LIMIT}.` : `${activeSelectedNumbers.length} of ${SIMULATION_NUMBER_LIMIT} selected for DGA simulation`}
            aria-label={`${selectionCountLabel} selected`}
          >
            {selectionCountLabel}
          </span>
        </div>
        {activeSelectedNumbers.length === SIMULATION_NUMBER_LIMIT && (
          <div
            data-testid={`${testIdPrefix}-supp-suggestion`}
            style={{
              marginTop: 4,
              maxWidth: 118,
              border: `1px solid ${suppSuggestion ? "#b7e4c7" : "#e2e8f0"}`,
              background: suppSuggestion ? "#f0fdf4" : "#f8fafc",
              color: suppSuggestion ? "#14532d" : "#64748b",
              borderRadius: 7,
              padding: "4px 5px",
              fontSize: 10,
              lineHeight: 1.2,
            }}
            title={suppSuggestion ? suppSuggestionTitle : "No supplementary-role count signal was found for these eight selected numbers. DGA uses the existing first-six main, next-two supplementary order."}
          >
            <b style={{ display: "block", fontSize: 10 }}>
              {suppSuggestion ? "Auto supps" : "Supps"}
            </b>
            {suppSuggestion
              ? `${suppSuggestion.supp.join(", ")}`
              : "no count signal"}
          </div>
        )}
      </div>
    </div>
  );
};

// UserExclusionsStrip component (kept local)
type Orientation = "horizontal" | "vertical";
type LabelPosition = "bottom" | "right";
interface UserExclusionsStripProps {
  excludedNumbers: number[];
  setExcludedNumbers: (updater: (prev: number[]) => number[]) => void;
  title?: string;
  orientation?: Orientation;
  labelPosition?: LabelPosition;
  showClearButton?: boolean;
  cellSize?: number;
  monthlyBuckets?: MonthlyBucketSets | null;
}
const UserExclusionsStrip: React.FC<UserExclusionsStripProps> = ({
  excludedNumbers, setExcludedNumbers, title, orientation = "horizontal", labelPosition = "bottom", showClearButton = false, cellSize, monthlyBuckets,
}) => {
  const containerStyle: React.CSSProperties =
    orientation === "horizontal"
      ? { display: "flex", gap: 8, overflowX: "auto", whiteSpace: "nowrap", paddingTop: 6, paddingBottom: 4, borderTop: "1px dashed #ddd", marginTop: title ? 6 : 0 }
      : { display: "flex", flexDirection: "column", gap: 0, paddingTop: 7, paddingBottom: 0, marginTop: cellSize ? 2 : 0 };
  const labelStyleColumnBase: React.CSSProperties = { display: "inline-flex", flexDirection: "column", alignItems: "center", minWidth: 28 };
  const labelStyleRowBase: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, minWidth: 28 };
  const sizeStyles: React.CSSProperties = orientation === "vertical" && cellSize ? { height: cellSize, lineHeight: `${cellSize}px`, justifyContent: "center" } : {};
  return (
    <div style={{ marginTop: 8 }}>
      {title && <b>{title}</b>}
      <div style={containerStyle}>
        {Array.from({ length: 45 }, (_, i) => i + 1).map((n) => {
          const checked = excludedNumbers.includes(n);
          const bucketColor = _stripBucketColor(n, monthlyBuckets);
          const handleToggle = () => {
            setExcludedNumbers((prev) =>
              prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
            );
          };
          const numSpan = (
            <span style={{
              fontSize: 11,
              lineHeight: "normal",
              background: bucketColor ?? "transparent",
              color: bucketColor ? "#fff" : "#333",
              borderRadius: 3,
              padding: bucketColor ? "0 3px" : undefined,
              minWidth: 20,
              textAlign: "center",
              display: "inline-block",
            }}>
              {n}
            </span>
          );
          if (labelPosition === "bottom") {
            return (
              <label key={n} style={{ ...labelStyleColumnBase, ...sizeStyles }} title={`Exclude ${n}`}>
                <input type="checkbox" checked={checked} onChange={handleToggle} style={{ margin: 0 }} />
                {numSpan}
              </label>
            );
          } else {
            return (
              <label key={n} style={{ ...labelStyleRowBase, ...sizeStyles }} title={`Exclude ${n}`}>
                <input type="checkbox" checked={checked} onChange={handleToggle} style={{ margin: 0 }} />
                {numSpan}
              </label>
            );
          }
        })}
        {showClearButton && (
          <div style={{ display: "flex", alignItems: "center", marginLeft: orientation === "horizontal" ? 8 : 0 }}>
            <button type="button" onClick={() => setExcludedNumbers(() => [])} title="Clear user exclusions" style={{ padding: "4px 8px", fontSize: 12, marginLeft: 8 }}>Clear</button>
          </div>
        )}
      </div>
    </div>
  );
};

function WindfallApp(): JSX.Element {
  return (
    <ForcedNumbersProvider>
      <ZPASettingsProvider>
        <ErrorBoundary>
          <AppInner />
        </ErrorBoundary>
      </ZPASettingsProvider>
    </ForcedNumbersProvider>
  );
}

export default function App() {
  return <LotteryPlatformShell windfallExperience={<WindfallApp />} />;
}

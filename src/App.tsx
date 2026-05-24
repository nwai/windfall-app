// NOTE: Step-3 consolidated updates and fixes:
// - Pass only user exclusions to generator (fix trace "User excluded").
// - WFMQY: add user exclusion checkboxes (1–45) in a single horizontal line.
// - Unified status badges (adds OGA + core threshold switches).
// - Lambda enable/disable toggle (disables slider when off, reflected in badges/trace).
// - Trace: append a concise block for factors affecting generation.
//
// Keep existing imports; removed unused ones previously.
import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import "./App.css";

import { ForcedNumbersProvider } from "./context/ForcedNumbersContext";
import { ZPASettingsProvider, useZPASettings } from "./context/ZPASettingsContext";
import { ErrorBoundary } from "./components/ErrorBoundary";

import { MonteCarloPanel } from "./components/candidates/MonteCarloPanel";
import { OperatorsPanel } from "./components/OperatorsPanel";
import { NumberTrendsTable, NumberTrend } from "./components/NumberTrendsTable";
import { entropy, minHamming, maxJaccard } from "./analytics";
import { fetchDraws } from "./lib/fetchDraws";
import { getUniqueRandomNumbers } from "./lib/random";
import { parseCSVorJSON } from "./parseCSVorJSON";
import { getSDE1FilteredPool } from "./sde1";
import { buildDrawGrid, findDiamondsAllRadii, getPredictedNumbers } from "./dga";
import { DGAVisualizer } from "./components/DGAVisualizer";
import { computeOGA, getOGAPercentile } from "./utils/oga";
import { Draw, Knobs, CandidateSet } from "./types";
import { GeneratedCandidatesPanel, ExportSettings } from "./components/candidates/GeneratedCandidatesPanel";
import { buildTrendWeights } from "./lib/trendBias";
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
import { BatesPanel } from "./components/BatesPanel";
import { computeTemperatureSignal } from "./lib/temperatureSignal";
import { buildConditionalProb } from "./lib/conditionalProbability";
import { computeHistoricalTrendRatios } from "./lib/computeHistoricalTrendRatios";
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
import { DrawRow } from "./lib/drawHistory";
import { buildChurnDataset } from "./lib/churnFeatures";
import { HeatmapLegendBar } from "./components/HeatmapLegendBar";
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
import { generateCandidates } from "./generateCandidates";
import { useGenerateWorker, serializeMonthlyBuckets, serializeTrendMap } from "./hooks/useGenerateWorker";
import type { GenerateWorkerArgs } from "./workers/generateWorker";
import { ModulationDiagnosticsPanel } from "./components/ModulationDiagnosticsPanel";
import { SelectionInsightsPanel } from "./components/SelectionInsightsPanel";
import { CollapsibleSection } from "./components/shared/CollapsibleSection";
import { NextDrawProbabilitiesPanel } from "./components/NextDrawProbabilitiesPanel";
import { forecastOGA } from "./lib/ogaForecast";
import { MostLikelyNotDrawnPanel } from "./components/MostLikelyNotDrawnPanel";
import { BacktestPanel } from "./components/BacktestPanel";
import { NextHotBlocksPanel } from "./components/NextHotBlocksPanel";
import UndrawnPatternsPanel from "./components/UndrawnPatternsPanel";
import MonthlyOverlapPanel from "./components/MonthlyOverlapPanel";
import MonthlyDrawsSummaryPanel, { type MonthlyConstraintPayload, type MonthlyFrequencyConstraints, type MonthlyBucketSets } from "./components/MonthlyDrawsSummaryPanel";
import MonthlyFirstLastPanel from "./components/MonthlyFirstLastPanel";
import MonthlyDigitOccurrencePanel from "./components/MonthlyDigitOccurrencePanel";
import HotColdRankingPanel from "./components/HotColdRankingPanel";
import { AdjacentCombosPanel } from "./components/AdjacentCombosPanel";
import { applyOctagonalPostProcess } from "./octagonal";
import { PickSixPanel, type PickSixSource } from "./components/PickSixPanel";
import { buildWfmqyhNumberCounts } from "./lib/wfmqyhNumberCounts";
import { DrawBucketPatternPanel } from "./components/DrawBucketPatternPanel";
import { EndingDigitSequencePanel } from "./components/EndingDigitSequencePanel";
import { deriveMainConstraintExclusions } from "./lib/mainConstraintExclusions";
import {
  analyzeDrawHistoryRows,
  applyAutomaticHistoryCorrections,
  drawsFromRows,
  rowsFromDraws,
} from "./lib/drawHistoryReview";
import { loadCachedDrawHistory, saveCachedDrawHistory } from "./lib/historyPersistence";
import {
  DIGIT_WIDTH_PERCENT_OPTIONS,
  deriveDigitWidthTargets,
  formatDigitWidthScopeLabel,
  type DigitWidthConstraintScope,
} from "./lib/digitWidthConstraint";


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
  { key: "M", label: "Month (12 draws)", size: 12 },
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
  enableSDE1: true,
  enableHC3: true,
  enableOGA: true,
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

// Utilities
function strictValidateDraws(draws: Draw[]): Draw[] {
  return draws.filter((draw) => {
    if (!Array.isArray(draw.main) || !Array.isArray(draw.supp)) return false;
    if (draw.main.length !== 6 || draw.supp.length !== 2) return false;
    const allNumbers = [...draw.main, ...draw.supp];
    if (!allNumbers.every((n) => Number.isInteger(n) && n >= 1 && n <= 45)) return false;
    const hasDupes = (arr: number[]) => new Set(arr).size !== arr.length;
    if (hasDupes(draw.main) || hasDupes(draw.supp)) return false;
    if (draw.supp.some((n) => draw.main.includes(n))) return false;
    if (!draw.date) draw.date = "unknown";
    return true;
  });
}
function computeNumberTrends(history: Draw[]): NumberTrend[] {
  const spans = {
    d3: 3, d9: 9, d15: 15, fortnight: 6, month: 12, quarter: 36, year: 156, all: history.length,
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
function rowsToDraws(rows: DrawRow[]): Draw[] {
  const ordered = rows.slice().sort((a, b) => parseCsvDateToEpoch(a.date) - parseCsvDateToEpoch(b.date));
  return ordered.map(r => ({ date: r.date, main: r.mains, supp: r.supps }));
}

function AppInner(): JSX.Element {
  const { runGenerate } = useGenerateWorker();
  const [history, setHistory] = useState<Draw[]>([]);
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
      sel: 0.2,
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
  const [acceptanceNeedsCounts, setAcceptanceNeedsCounts] = useState<MonthlyFrequencyConstraints>({
    undrawn: 0, times1: 0, times2: 0, times3: 0, times4: 0, times5: 0, times6: 0, times7: 0, times8: 0,
  });
  const [acceptanceNeedsHardExclude, setAcceptanceNeedsHardExclude] = useState<boolean>(false);
  const [attemptMultiplier, setAttemptMultiplier] = useState<number>(DEFAULT_ATTEMPT_MULTIPLIER);
  const [overgenFactor, setOvergenFactor] = useState<number>(50);

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

  const exactConstraintRows = [
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
  ] as const;

  const mainDecadeConstraintRows = [
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
  ] as const;

  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [candidates, setCandidates] = useState<CandidateSet[]>([]);
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
  const [numCandidates, setNumCandidates] = useState<number>(8);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
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

  // Readiness (Rdy) score weights — user-configurable in Candidate Generation Influences
  const [rdyWeights, setRdyWeights] = useState<{ idm: number; conv: number; oga: number }>({ idm: 0.70, conv: 0.10, oga: 0.20 });

  // Monthly Repeat Bias — boost numbers drawn exactly once in the current month
  const [mrbEnabled, setMrbEnabled] = useState<boolean>(false);
  const [mrbIncludeSupp, setMrbIncludeSupp] = useState<boolean>(true);
  const [mrbBucketBoosts, setMrbBucketBoosts] = useState<import("./lib/numberBiases").MRBBucketBoosts>({
    undrawn: 1, times1: 1, times2: 1, times3: 1, times4: 1, times5: 1, times6: 1, times7: 1, times8: 1,
  });

  // Sync acceptance-needs defaults from the bucket sizes in the payload
  useEffect(() => {
    if (!monthlyConstraintPayload) return;
    const b = monthlyConstraintPayload.buckets;
    setAcceptanceNeedsCounts({
      undrawn: b.undrawn.size,
      times1: b.times1.size,
      times2: b.times2.size,
      times3: b.times3.size,
      times4: b.times4.size,
      times5: b.times5.size,
      times6: b.times6.size,
      times7: b.times7.size,
      times8: b.times8.size,
    });
  }, [monthlyConstraintPayload]);

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
    if (!history.length) return empty;
    const currentMonthKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
    const counts = new Array<number>(45).fill(0);
    history.forEach((draw) => {
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
  }, [history]);

  const [numberCounts, setNumberCounts] = useState<number[]>([]);
  const [minCount, setMinCount] = useState<number>(0);
  const [maxCount, setMaxCount] = useState<number>(0);
  const [focusedDgaCol, setFocusedDgaCol] = useState<number | null>(null);
  const [minRecentMatches, setMinRecentMatches] = useState<number>(0);
  const [maxLastDrawMatchesEnabled, setMaxLastDrawMatchesEnabled] = useState<boolean>(false);
  const [maxLastDrawMatchesValue, setMaxLastDrawMatchesValue] = useState<number>(3);
  const [recentMatchBias, setRecentMatchBias] = useState<number>(0);
  const [highlightMsg, setHighlightMsg] = useState<string>("");
  const [highlights, setHighlights] = useState<any[]>([]);

  const [excludedNumbers, setExcludedNumbers] = useState<number[]>([]);
  const [userSelectedNumbers, setUserSelectedNumbers] = useState<number[]>([]);
  const [autoExcludeUnselected, setAutoExcludeUnselected] = useState<boolean>(false);
  const autoExcludedFromSelection = useMemo(() => {
    if (!autoExcludeUnselected) return [] as number[];
    const picked = new Set(userSelectedNumbers);
    return Array.from({ length: 45 }, (_, i) => i + 1).filter((n) => !picked.has(n));
  }, [autoExcludeUnselected, userSelectedNumbers]);
  const effectiveExcludedNumbers = useMemo(
    () => Array.from(new Set([...excludedNumbers, ...autoExcludedFromSelection])),
    [excludedNumbers, autoExcludedFromSelection]
  );
  const [ratioOptions, setRatioOptions] = useState<{ ratio: string; count: number; percent: number }[]>([]);
  const [selectedRatios, setSelectedRatios] = useState<string[]>([]);
  const [useTrickyRule, setUseTrickyRule] = useState<boolean>(false);
  const [trendSelectedNumbers, setTrendSelectedNumbers] = useState<number[]>([]);
  const [focusNumber, setFocusNumber] = useState<number | null>(null);
  const [showHeatmapLetters, setShowHeatmapLetters] = useState(false);
  const [tempMetric, setTempMetric] = useState<"ema" | "recency" | "hybrid">("hybrid");
  const [repeatWindowSizeW, setRepeatWindowSizeW] = useState<number>(12);
  const [minFromRecentUnionM, setMinFromRecentUnionM] = useState<number>(0);
  const [presets, setPresets] = useState<AppPreset[]>(() => listPresets());
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [newPresetName, setNewPresetName] = useState<string>("");
  const [zpaReloadKey, setZpaReloadKey] = useState<number>(0);
  const [selectedWindowPatterns, setSelectedWindowPatterns] = useState<WindowPattern[]>([]);
  const [patternConstraintMode, setPatternConstraintModeode] = useState<'boost' | 'restrict'>('boost');
  const [patternBoostFactor, setPatternBoostFactor] = useState<number>(0.15);
  const [patternSumTolerance, setPatternSumTolerance] = useState<number>(0);

  // NEW: OGA bias UI state
  const [enableOGAForecastBias, setEnableOGAForecastBias] = useState<boolean>(false);
  const [ogaBaselineMode, setOGABaselineMode] = useState<"window" | "all">("window");
  const [ogaPreferredBand, setOGAPreferredBand] = useState<"auto" | "low" | "mid" | "high">("auto");
  const [ogaPreferredDeciles, setOGAPreferredDeciles] = useState<{ index: number; weight: number }[]>([]);

  const { zoneGamma, setZoneGamma } = useZPASettings();

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
    setHighlights([]);
    saveCachedDrawHistory(rowsFromDraws(nextHistory));
  }, [setHighlights]);

  useEffect(() => {
    const cachedRows = loadCachedDrawHistory();
    if (cachedRows && cachedRows.length > 0) {
      const ordered = rowsToDraws(cachedRows);
      commitHistory(ordered);
      setTraceMaybe((t) => [...t, `[TRACE] Loaded ${ordered.length} draws from saved local draw history state.`]);
      return;
    }

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
    });
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

  const wfmqyhMainNumberCounts = useMemo(
    () => buildWfmqyhNumberCounts(filteredHistory),
    [filteredHistory],
  );

  const generationConstraintBucketSummaries = useMemo(() => {
    return (Object.keys(generationConstraintNumberBuckets) as GenerationConstraintBucketKey[]).reduce<Record<GenerationConstraintBucketKey, {
      numberCounts: { number: number; count: number }[];
      drawResultCounts: { hits: number; count: number }[];
    }>>((acc, bucketKey) => {
      const bucketNumbers = generationConstraintNumberBuckets[bucketKey];
      const bucketSet = new Set<number>(bucketNumbers);
      const drawHitCounts = new Map<number, number>();

      filteredHistory.forEach((draw) => {
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
  }, [filteredHistory, wfmqyhMainNumberCounts]);

  const generationConstraintDecadeSummaries = useMemo(() => {
    return (Object.keys(generationConstraintDecadeBuckets) as GenerationConstraintDecadeKey[]).reduce<Record<GenerationConstraintDecadeKey, {
      numberCounts: { number: number; count: number }[];
      drawResultCounts: { hits: number; count: number }[];
    }>>((acc, bucketKey) => {
      const bucketNumbers = generationConstraintDecadeBuckets[bucketKey];
      const bucketSet = new Set<number>(bucketNumbers);
      const drawHitCounts = new Map<number, number>();

      filteredHistory.forEach((draw) => {
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
  }, [filteredHistory, wfmqyhMainNumberCounts]);

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
  const generationExcludedSet = useMemo(() => new Set(generationExcludedNumbers), [generationExcludedNumbers]);
  const manualExcludedSet = useMemo(() => new Set(excludedNumbers), [excludedNumbers]);
  const autoSelectionExcludedSet = useMemo(() => new Set(autoExcludedFromSelection), [autoExcludedFromSelection]);
  const bucketAutoExcludedSet = useMemo(
    () => new Set(mainConstraintAutoExclusions.excludedNumbers),
    [mainConstraintAutoExclusions.excludedNumbers]
  );

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

  const activeWindowSize = filteredHistory.length;
  const mostRecentDrawDateLabel = useMemo(() => {
    if (history.length === 0) return "no draws yet";
    const latestDraw = history.reduce((latest, draw) => {
      return parseCsvDateToEpoch(draw.date) >= parseCsvDateToEpoch(latest.date) ? draw : latest;
    }, history[0]);
    return latestDraw.date || "unknown date";
  }, [history]);

  // Sync repeat window W to the WFMQYH window size when it changes
  useEffect(() => {
    if (activeWindowSize > 0) {
      setRepeatWindowSizeW(activeWindowSize);
    }
  }, [activeWindowSize]);

  const sde1Exclusions = knobs.enableSDE1 ? getSDE1FilteredPool(filteredHistory).excludedNumbers : [];
  let hc3Exclusions: number[] = [];
  if (knobs.enableHC3 && filteredHistory.length >= 2) {
    const last = filteredHistory[filteredHistory.length - 1];
    const prev = filteredHistory[filteredHistory.length - 2];
    hc3Exclusions = [...last.main, ...last.supp].filter((n) =>
      [...prev.main, ...prev.supp].includes(n)
    );
  }
  const allExclusions = useMemo(
    () => Array.from(new Set([...generationExcludedNumbers, ...sde1Exclusions, ...hc3Exclusions])),
    [generationExcludedNumbers, knobs.enableSDE1, knobs.enableHC3, filteredHistory]
  );

  const temperatureSignal = useMemo(
    () => computeTemperatureSignal(filteredHistory, {
      alpha: 0.25,
      hybridWeight: 0.6,
      emaNormalize: "per-number",
      enforcePeaks: true,
      metric: "hybrid",
      heightNumbers: 45
    }),
    [filteredHistory]
  );

  // Row simulation
  const [simulatedDraw, setSimulatedDraw] = useState<Draw | null>(null);
  const [simNumbers, setSimNumbers] = useState<number[]>([]);
  const [simSource, setSimSource] = useState<'none' | 'user' | 'candidate' | 'dga-strip'>('none');
  const [simCandidateIdx, setSimCandidateIdx] = useState<number | null>(null);

  // DGA grid simulate strip selections
  const [dgaStripSelected, setDgaStripSelected] = useState<number[]>([]);

  // Ref for scrolling to DGA grid after simulate, and back-navigation
  const dgaGridRef = useRef<HTMLDivElement>(null);
  const [simScrollOriginY, setSimScrollOriginY] = useState<number | null>(null);
  const scrollToDGA = useCallback(() => {
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

  // Manual simulation (heatmap/NextHotBlocks overlay only)
  const [manualSimSelected, setManualSimSelected] = useState<number[]>([]);
  const [pickSixSource, setPickSixSource] = useState<PickSixSource>("manual");
  const [pickSixManual, setPickSixManual] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8]);

  useEffect(() => {
    // manual simulation drives heatmap/NextHotBlocks overlays only
    setSimNumbers(manualSimSelected.length >= 6 ? manualSimSelected.slice(0, 8) : []);
  }, [manualSimSelected]);

  const handleSimulateCandidate = (idx: number) => {
    const cand = candidates[idx];
    if (!cand) return;
    setSelectedCandidateIdx(idx);
    setSimulatedDraw({
      main: cand.main.slice(),
      supp: cand.supp.slice(),
      date: "Simulated",
      isSimulated: true,
    } as any);
    setSimSource('candidate');
    setSimCandidateIdx(idx);
    setDgaStripSelected([]); // clear strip selections when external simulate fires
    scrollToDGA();
  };

  const handleSimulatePickSixManual = (nums: number[]) => {
    if (nums.length !== 8 || nums.some((n) => !Number.isFinite(n))) return;
    const main = nums.slice(0, 6).sort((a, b) => a - b);
    const supp = nums.slice(6, 8).sort((a, b) => a - b);
    setSimulatedDraw({ main, supp, date: "PickSixManual", isSimulated: true } as any);
    setSimSource('user');
    setSimCandidateIdx(null);
    setDgaStripSelected([]); // clear strip selections when external simulate fires
    scrollToDGA();
  };

  const activeSimulatedDraw = simulatedDraw;
  // Heatmap overlay only from manual checkboxes (manualSimSelected)
  const overlayNumbers = useMemo(() => simNumbers.slice(0, 8), [simNumbers]);
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
  

  // Trend series for panels
  const trendValueSeries = useMemo(() => {
    const draws = filteredHistory;
    const alpha = 0.25, wHybrid = 0.6, N = 45;
    const series: number[][] = Array.from({ length: N }, () => []);
    const ema = Array(N).fill(0);
    const lastAge = Array(N).fill(Infinity);
    for (let t = 0; t < draws.length; t++) {
      const d = draws[t];
      const present = new Set<number>([...d.main, ...d.supp]);
      for (let n = 1; n <= N; n++) {
        const i = n - 1;
        const hit = present.has(n) ? 1 : 0;
        ema[i] = alpha * hit + (1 - alpha) * ema[i];
        lastAge[i] = hit ? 0 : Math.min(lastAge[i] + 1, 9999);
        const rec = draws.length > 1 ? 1 - Math.min(1, lastAge[i] / (draws.length - 1)) : 0;
        let hybrid = wHybrid * ema[i] + (1 - wHybrid) * rec;
        if (hit) hybrid = 1;
        series[i].push(hybrid);
      }
    }
    return series;
  }, [filteredHistory]);

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
    const allDraws = history.length;
    const winSize = filteredHistory.length;
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
    let grid = buildDrawGrid(history, 45, allDraws).map((row) => [...row, 0]);
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

    // Heatmap counts are still based on the windowed filteredHistory so they
    // reflect analysis-relevant recency rather than all-time frequency.
    const counts: number[] = Array(45).fill(0);
    filteredHistory.forEach((draw) => {
      draw.main.forEach((n) => (n >= 1 && n <= 45 ? counts[n - 1]++ : null));
      draw.supp.forEach((n) => (n >= 1 && n <= 45 ? counts[n - 1]++ : null));
    });
    setNumberCounts(counts);
    setMinCount(Math.min(...counts));
    setMaxCount(Math.max(...counts));
    setHighlightMsg("");
  }, [history, filteredHistory, simulatedDraw]);

  useEffect(() => {
    setRatioOptions(computeOddEvenRatios(filteredHistory));
    setSelectedRatios((ratios) => ratios.filter((r) => ratioOptions.some((opt) => opt.ratio === r)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredHistory]);

  const numberTrends = useMemo(() => computeNumberTrends(filteredHistory), [filteredHistory]);
  const shortTrends = useMemo(() => numberTrends.map((t) => ({ number: t.number, fortnight: t.fortnight, month: t.month })), [numberTrends]);
  const trendWeights = useMemo(() => buildTrendWeights(shortTrends, { method: "exp", beta: 3.0 }), [shortTrends]);

  const conditionalProb = useMemo(
    () => buildConditionalProb(filteredHistory, temperatureSignal, 0.5, 0.3),
    [filteredHistory, temperatureSignal]
  );

  // Minimum number of prior draws required for a stable OGA baseline.
  // Draws computed against fewer than this many draws produce unreliable scores
  // that pollute the percentile distribution — especially under small WFMQYH windows.
  const MIN_OGA_BASELINE = 10;

  const pastOGAScores = useMemo(
    () =>
      filteredHistory.map((draw, idx, arr) =>
        computeOGA([...draw.main, ...draw.supp], arr.slice(0, idx) || [], ogaSpokeCount)
      ),
    [filteredHistory, ogaSpokeCount]
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
   * - Normally today's date.
   * - Forwarded to next month when today is still in the same month as the last
   *   draw AND that month's draw count has already reached maxDrawsPerMonth
   *   (i.e. the month is complete and the user is planning ahead).
   */
  const mrbEffectiveDate = useMemo((): Date => {
    const today = new Date();
    if (!history.length) return today;
    // Count draws per month across full history
    const monthlyCounts = new Map<string, number>();
    history.forEach(d => {
      const t = Date.parse(d.date || '');
      if (isNaN(t)) return;
      const dt = new Date(t);
      const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      monthlyCounts.set(k, (monthlyCounts.get(k) || 0) + 1);
    });
    const maxDraws = Math.max(...Array.from(monthlyCounts.values()));
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const currentCount = monthlyCounts.get(todayKey) ?? 0;
    // If the current calendar month is complete and has more than one month
    // of history, forward the reference to the 1st of next month.
    if (monthlyCounts.size > 1 && currentCount >= maxDraws) {
      return new Date(today.getFullYear(), today.getMonth() + 1, 1);
    }
    return today;
  }, [history]);

  const monthlyRepeatBiasResult = useMemo(() => {
    if (!mrbEnabled || !filteredHistory.length) return null;
    return buildMonthlyRepeatBiasWeights(filteredHistory, mrbBucketBoosts, mrbIncludeSupp, mrbEffectiveDate);
  }, [mrbEnabled, filteredHistory, mrbBucketBoosts, mrbIncludeSupp, mrbEffectiveDate]);

  // Reference mode for OGA percentiles and histogram
  const [ogaRefMode, setOgaRefMode] = useState<"window" | "all">("window");

  // Windowed reference distribution computed against current window baseline
  const pastOGAScoresRefWindow = useMemo(
    () => filteredHistory.map((draw) => computeOGA([...draw.main, ...draw.supp], filteredHistory, ogaSpokeCount)),
    [filteredHistory, ogaSpokeCount]
  );
  // Full-history reference distribution computed against full history baseline
  const pastOGAScoresRefAll = useMemo(
    () => history.map((draw) => computeOGA([...draw.main, ...draw.supp], history, ogaSpokeCount)),
    [history, ogaSpokeCount]
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

  function recomputeCompositeRanking(base: CandidateSet[]): CandidateSet[] {
    if (!base.length) return base;
    const manualMainSet = new Set(manualSimSelected.slice(0, 6));
    const manualSuppSet = new Set(manualSimSelected.slice(6, 8));
    const computePrize = (main: number[], supp: number[]) => {
      if (manualMainSet.size < 6 || manualSuppSet.size < 2) return { label: "—", rank: 99 };
      const mainHits = main.filter((n) => manualMainSet.has(n)).length;
      const suppHits = supp.filter((n) => manualSuppSet.has(n)).length;
      if (mainHits === 6) return { label: "Div1", rank: 1 };
      if (mainHits === 5 && suppHits >= 1) return { label: "Div2", rank: 2 };
      if (mainHits === 5) return { label: "Div3", rank: 3 };
      if (mainHits === 4) return { label: "Div4", rank: 4 };
      if (mainHits === 3 && suppHits >= 1) return { label: "Div5", rank: 5 };
      if (mainHits >= 1 && suppHits >= 2) return { label: "Div6", rank: 6 };
      return { label: "—", rank: 99 };
    };
     const recentDraw = filteredHistory[filteredHistory.length - 1];
     const recentSet = recentDraw ? new Set([...recentDraw.main, ...recentDraw.supp]) : null;
     const selectedSet = new Set(userSelectedNumbers);
     const sumW = rankingWeights.oga + rankingWeights.sel + rankingWeights.recent || 1;
     const wOGA = rankingWeights.oga / sumW;
     const wSel = rankingWeights.sel / sumW;
     const wRecent = rankingWeights.recent / sumW;
     const hasUserSelected = userSelectedNumbers && userSelectedNumbers.length > 0;
     const applySelBoost = hasUserSelected && rankingWeights.sel > 0;

    return base
      .map((c: any) => {
        const nums = [...c.main, ...c.supp];
        // Skip expensive OGA computation when OGA is toggled off
        const ogaScore = knobs.enableOGA
          ? (c.ogaScore ?? computeOGA(nums, filteredHistory, ogaSpokeCount))
          : 0;
        const ogaPercentile = knobs.enableOGA
          ? (c.ogaPercentile ?? getOGAPercentile(ogaScore, stableOGAScores))
          : 0;
        const selHits = nums.filter(n => selectedSet.has(n)).length;
        const recentHits = recentSet ? nums.filter(n => recentSet.has(n)).length : 0;
        const ogaNorm = knobs.enableOGA ? Math.max(0, Math.min(1, ogaPercentile / 100)) : 0;
        const finalComposite = wOGA * ogaNorm + wSel * (selHits / 8) + wRecent * (recentHits / 8);
        const { label: prizeLabel, rank: prizeRank } = computePrize(c.main, c.supp);
        return { ...c, ogaScore, ogaPercentile, selHits, recentHits, finalCompositeAdj: finalComposite, prizeLabel, prizeRank };
      })
      .sort((a: any, b: any) => {
        // Sort by statistical quality only. Prize is a display/evaluation metric
        // and must NOT influence pool ranking (otherwise Manual Simulation
        // changes which candidates survive the over-generation slice).
        if (b.finalCompositeAdj !== a.finalCompositeAdj) return b.finalCompositeAdj - a.finalCompositeAdj;
        if (b.selHits !== a.selHits) return b.selHits - a.selHits;
        if (b.recentHits !== a.recentHits) return b.recentHits - a.recentHits;
        // Skip OGA tiebreaker when disabled
        if (knobs.enableOGA && b.ogaPercentile !== a.ogaPercentile) return b.ogaPercentile - a.ogaPercentile;
        return 0;
      });
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

  /** Effective MiAN counts — when "Use these counts when constructing candidates" is ON and
   *  Monthly Draws Summary has constraints, mirror those selections automatically so the
   *  "Must include from Acceptance needs" always tracks the Acceptance needs values. */
  const effectiveMianCounts: MonthlyFrequencyConstraints = (monthlyConstructiveEnabled && monthlyConstraintPayload)
    ? monthlyConstraintPayload.constraints
    : acceptanceNeedsCounts;

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

  useEffect(() => {
    setCandidates(prev => {
      // Clear stale cached OGA values so recomputeCompositeRanking recomputes them
      const cleared = prev.map(c => ({ ...c, ogaScore: undefined, ogaPercentile: undefined }));
      return recomputeCompositeRanking(cleared);
    });
  }, [rankingWeights, userSelectedNumbers, filteredHistory, stableOGAScores, ogaSpokeCount]);

  function withinSumRange(candidate: CandidateSet): boolean {
    // Hook for sum filter if you enable it later
    return true;
  }

  const handleGenerate = () => {
    setIsGenerating(true);
    setTrace([]);

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
    const baselineForOGAForecast = ogaBaselineMode === "window" ? filteredHistory : history;
    const ogaStats = forecastOGA(filteredHistory, baselineForOGAForecast, ogaSpokeCount);
    const monthlyBucketOptions = monthlyConstructiveEnabled && monthlyConstraintPayload ? {
      constraints: monthlyConstraintPayload.constraints,
      buckets: monthlyConstraintPayload.buckets,
      allowShortfall: true,
      boostPenalize: monthlyConstraintPayload.boostPenalize ?? false,
    } : undefined;

    // Over-generate: request a larger pool so post-generation filters (MiAN, monthly, prize, OGA)
    // have more candidates to work with. Controlled by user-configurable overgenFactor.
    const poolSize = numCandidates * Math.max(1, overgenFactor);

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

    const t0 = performance.now();

    // Build worker-serializable args
    const workerArgs: GenerateWorkerArgs = {
      num: poolSize,
      history: filteredHistory,
      knobs: effectiveKnobsForGen,
      excludedNumbers: excludedWithMiAN,
      selectedOddEvenRatios: selectedRatios,
      useTrickyRule,
      minOGAPercentile: 0,
      pastOGAScores: stableOGAScores as any,
      forcedNumbers: trendSelectedNumbers,
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
      trendMapEntries: undefined,
      allowedTrendRatios: undefined,
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
      const monthlyTrace = buildMonthlyTrace();
      setTraceMaybe((t) => [
        ...t,
        `[TRACE] Monthly acceptance toggle: ${monthlyConstraintPayload ? "ON" : "OFF"} (constructive fill: ${monthlyConstructiveEnabled ? "ON" : "OFF"})`,
      ]);
      if (monthlyTrace) {
        setTraceMaybe((t) => [...t, `[TRACE] ${monthlyTrace}`]);
      }

      let processedCandidates = [...result.candidates];
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
      // otherwise Manual Simulation numbers would change the final candidate set.
      processedCandidates = recomputeCompositeRanking(processedCandidates);
      const prizeRejects = 0;
      let capRejects = 0;
      if (knobs.enableOGA && typeof knobs.octagonal_top === "number" && processedCandidates.length > 0) {
        const cap = Math.max(1, Math.floor(knobs.octagonal_top));
        const before = processedCandidates.length;
        processedCandidates = applyOctagonalPostProcess(
          processedCandidates,
          filteredHistory.length ? filteredHistory : history,
          cap,
          ogaSpokeCount
        );
        capRejects = before - processedCandidates.length;
        processedCandidates = recomputeCompositeRanking(processedCandidates);
      }
      processedCandidates = processedCandidates.filter(withinSumRange);

      // Slice over-generated pool down to the requested count.
      // Sort by composite score ONLY (prize-agnostic) so Manual Simulation
      // does not influence which candidates are kept.
      const poolBeforeSlice = processedCandidates.length;
      if (processedCandidates.length > numCandidates) {
        processedCandidates.sort((a: any, b: any) => {
          if (b.finalCompositeAdj !== a.finalCompositeAdj) return b.finalCompositeAdj - a.finalCompositeAdj;
          if (knobs.enableOGA && b.ogaPercentile !== a.ogaPercentile) return b.ogaPercentile - a.ogaPercentile;
          return 0;
        });
        processedCandidates = processedCandidates.slice(0, numCandidates);
      }

      // Now apply final ranking with prize labels for display
      processedCandidates = recomputeCompositeRanking(processedCandidates);

      setCandidates(processedCandidates);
      setRatioSummary(result.ratioSummary);
      setQuotaWarning(result.quotaWarning);
      setSelectedCandidateIdx(0);

      const dt = Math.round(performance.now() - t0);
      const st = result.rejectionStats;
      setTraceMaybe((t) => [
        ...t,
        `[TRACE] Generation: requested ${numCandidates}, pool ${poolSize} (overgen ${overgenFactor}×) → filtered ${poolBeforeSlice} → kept ${processedCandidates.length} (accepted ${st.accepted}/${st.totalAttempts} attempts, budget ${poolSize * attemptMultiplier}) in ${dt}ms; rejects — excl:${st.exclusions} sum:${st.sumRange} div5:${st.div5} main0:${st.mainZeroSet} main1:${st.mainOneSet} main2:${st.mainTwoSet} main3:${st.mainThreeSet} main4:${st.mainFourSet} main5:${st.mainFiveSet} main6:${st.mainSixSet} main7:${st.mainSevenSet} main8:${st.mainEightSet} main9:${st.mainNineSet} digitWidth:${st.digitWidth} oddEven:${st.oddEven} tricky:${st.tricky} repeat:${st.repeatUnion} recMin:${st.minRecent} recMax:${st.maxLastDraw} recBias:${st.recentBias} trend:${st.trendRatio} pattern:${st.patternConstraint} ent:${st.entropy} ham:${st.hamming} jac:${st.jaccard} ogaBias:${st.ogaBias} monthly:${monthlyRejects} prize:${prizeRejects} cap:${capRejects}`,
      ]);

      setIsGenerating(false);
    };

    const onError = (err: string) => {
      setTraceMaybe((t) => [...t, `[TRACE] ❌ Generation failed: ${err}`]);
      setIsGenerating(false);
    };

    // Dispatch to Web Worker (or fallback to async main-thread)
    runGenerate(workerArgs, onTrace, onResult, onError);
  };

  const runBatch = (target: number, traceLabel: string) => {
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

    const baselineForOGAForecast = ogaBaselineMode === "window" ? filteredHistory : history;
    const ogaStats = forecastOGA(filteredHistory, baselineForOGAForecast, ogaSpokeCount);
    const monthlyBucketOptions = monthlyConstructiveEnabled && monthlyConstraintPayload ? {
      constraints: monthlyConstraintPayload.constraints,
      buckets: monthlyConstraintPayload.buckets,
      allowShortfall: true,
      boostPenalize: monthlyConstraintPayload.boostPenalize ?? false,
    } : undefined;

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

    const t0 = performance.now();
    const result = generateCandidates(
      target,
      filteredHistory,
      effectiveKnobsForGen,
      (msg: string) => setTraceMaybe((t) => [...t, msg]),
      excludedWithMiANBatch,
      selectedRatios,
      useTrickyRule,
      0,
      stableOGAScores as any,
      trendSelectedNumbers,
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
      undefined,
      undefined,
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
      mainDecadeGenerationBiases
    );

    const monthlyTrace = buildMonthlyTrace();
    setTraceMaybe((t) => [
      ...t,
      `[TRACE] Monthly acceptance toggle: ${monthlyConstraintPayload ? "ON" : "OFF"} (constructive fill: ${monthlyConstructiveEnabled ? "ON" : "OFF"})`,
    ]);
    if (monthlyTrace) {
      setTraceMaybe((t) => [...t, `[TRACE] ${monthlyTrace}`]);
    }

    let processed = recomputeCompositeRanking([...result.candidates]);
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
    processed = processed.filter(withinSumRange);

    const prizeRejects = 0;

    let capRejects = 0;
    if (knobs.enableOGA && typeof knobs.octagonal_top === "number" && processed.length > 0) {
      const cap = Math.max(1, Math.floor(knobs.octagonal_top));
      const before = processed.length;
      processed = applyOctagonalPostProcess(
        processed,
        filteredHistory.length ? filteredHistory : history,
        cap,
        ogaSpokeCount
      );
      capRejects = before - processed.length;
      processed = recomputeCompositeRanking(processed);
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
    const msg = `[TRACE] ${traceLabel}: requested ${target}, kept ${processed.length} (accepted ${st.accepted}/${st.totalAttempts}) in ${dt}ms; rejects — excl:${st.exclusions} sum:${st.sumRange} div5:${st.div5} main0:${st.mainZeroSet} main1:${st.mainOneSet} main2:${st.mainTwoSet} main3:${st.mainThreeSet} main4:${st.mainFourSet} main5:${st.mainFiveSet} main6:${st.mainSixSet} main7:${st.mainSevenSet} main8:${st.mainEightSet} main9:${st.mainNineSet} digitWidth:${st.digitWidth} oddEven:${st.oddEven} tricky:${st.tricky} repeat:${st.repeatUnion} recMin:${st.minRecent} recBias:${st.recentBias} trend:${st.trendRatio} pattern:${st.patternConstraint} ent:${st.entropy} ham:${st.hamming} jac:${st.jaccard} ogaBias:${st.ogaBias} monthly:${monthlyRejects} prize:${prizeRejects} cap:${capRejects}`;
    setTraceMaybe((t) => [...t, msg]);

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
       for (let i = 0; i < runs; i++) {
         const { freqArr } = runBatch(Math.max(1, Math.min(1_000_000, batchSize)), `BatchSession run ${i + 1}/${runs}`);
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

  const handleRatioToggle = (ratio: string) => {
    setSelectedRatios((prev) => (prev.includes(ratio) ? prev.filter((r) => r !== ratio) : [...prev, ratio]));
    setUseTrickyRule(false);
  };

  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState<number>(-1);
  const currentCandidate = candidates[selectedCandidateIdx];

  const previewStats = useMemo(() => {
    const candidate = currentCandidate;
    return {
      hamming: candidate ? minHamming(candidate, filteredHistory) : 0,
      entropy: candidate ? entropy(candidate) : 0,
      jaccard: candidate ? maxJaccard(candidate, filteredHistory) : 0,
    };
  }, [currentCandidate, filteredHistory]);

  const maxGPWFWindow = filteredHistory.length > 0 ? filteredHistory.length : 45;

  const churnDataset = useMemo(
    () => (filteredHistory ? buildChurnDataset(filteredHistory, { churnWindowK: 12, returnHorizon: 6 }) : []),
    [filteredHistory]
  );

  // Candidate simulation: adds synthetic column to DGA only (does not clear manual checkboxes)

  // Legend counts for heatmap (from trendValueSeries)
  const bucketStops = [0.01, 0.08, 0.14, 0.20, 0.31, 0.43, 0.50, 0.70, 0.86, 0.96];
  const bucketLabels = ["prehistoric","frozen","permafrost","cold","cool","temperate","warm","hot","tropical","volcanic"];
  const bucketColors = ["#0b1020","#1b2733","#244963","#2c75a0","#3ca0c7","#66c2a5","#a6d854","#fdd835","#fb8c00","#e53935"];
  function bucketIndex(v: number): number { for (let i = 0; i < bucketStops.length; i++) if (v < bucketStops[i]) return i; return bucketStops.length; }
  const [legendCounts, setLegendCounts] = useState<number[]>(() => Array(bucketLabels.length).fill(0));
  const [legendTotal, setLegendTotal] = useState<number>(0);
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

  return (
    <div style={{ fontFamily: "monospace", padding: 20, maxWidth: 1700 }}>
      <ToastContainer position="top-right" duration={1600} />
      <h2>
        🇦🇺 Weekday Windfall – Set Generator{" "}
        <span style={{ fontSize: 16, color: "#666" }}>for entertainment use only</span>
        <label style={{ marginLeft: 12, fontSize: 12 }} title="Toggle verbose trace logging">
          <input type="checkbox" checked={traceVerbose} onChange={(e) => setTraceVerbose(e.target.checked)} style={{ marginRight: 6 }} />
          Trace verbose
        </label>
        <a
          href="/user-manual.html"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            marginLeft: 16,
            display: "inline-block",
            padding: "4px 14px",
            borderRadius: 20,
            background: "#1a237e",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
            fontFamily: "sans-serif",
            letterSpacing: "0.3px",
          }}
          title="Open User Manual in a new tab (also downloadable from there)"
        >
          📖 Manual
        </a>
      </h2>

      {/* [ORDER-ANCHOR] 01 Number Trends Table */}
      <CollapsibleSection title={<b>Number Trends Table</b>} summaryHint="Click a number to mark for forced inclusion" defaultOpen={false}>
        <NumberTrendsTable trends={numberTrends} onToggle={(n) => setTrendSelectedNumbers(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n])} selected={trendSelectedNumbers} />
        <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
          Colored rows indicate numbers you have selected for forced inclusion.
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 02 Draw History Manager */}
      <CollapsibleSection title={<b>Draw History Manager ({history.length} draws • latest {mostRecentDrawDateLabel})</b>} defaultOpen={false}>
        {/* In-app CSV updater */}
        <DrawHistoryManager
          csvPathHint="file:///Users/admin/Weekly_Windfall/windfall-app-clean/windfall_history_lottolyzer.csv"
          currentRows={rowsFromDraws(history)}
          mainCount={6}
          suppCount={2}
          minNumber={1}
          maxNumber={45}
          onDrawsUpdated={(rows, summaryMessage) => {
            const ordered = rowsToDraws(rows);
            commitHistory(ordered);
            setTrace(t => [...t, `[TRACE] ${summaryMessage ?? "Added/updated draw via CSV panel."} History now ${ordered.length} draws.`]);
          }}
        />
        <DrawHistoryIntegrityPanel
          rows={rowsFromDraws(history)}
          onApplyRows={(rows, summaryMessage) => {
            const ordered = rowsToDraws(rows);
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

      {/* [ORDER-ANCHOR] 02.1 Next Draw Probabilities */}
      <CollapsibleSection title={<b>Next Draw Probabilities</b>} defaultOpen={false}>
        <NextDrawProbabilitiesPanel history={filteredHistory} allHistory={history} title={`Next Draw Probabilities (${historyWindowName})`} />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 03 Odd/Even Ratio Filters */}
      <CollapsibleSection title={<b>Odd/Even Ratio Filters</b>} summaryHint="Select one or more ratios, or use Tricky Rule" defaultOpen={false}>
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

      {/* [ORDER-ANCHOR] 04 Windowed Draw Filtering (WFMQYH) */}
      <CollapsibleSection title={<b>Windowed Draw Filtering (WFMQYH)</b>} defaultOpen={false}>
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
                {autoExcludeUnselected && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 999, border: "1px solid #bdbdbd", background: "#f5f5f5", color: "#616161" }}>
                    <span style={{ fontWeight: 700 }}>A</span>
                    Auto from unselected
                  </span>
                )}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 999, border: "1px solid #ce93d8", background: "#f3e5f5", color: "#7b1fa2" }}>
                  <span aria-hidden="true">🔒</span>
                  Bucket-enforced while rule is active
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
                  const isBucketDerivedExcluded = bucketAutoExcludedSet.has(n);
                  const isAutoSelectionExcluded = autoSelectionExcludedSet.has(n);
                  const isBucketLocked = isBucketDerivedExcluded && !isManualExcluded;
                  const checked = generationExcludedSet.has(n);
                  const sourceBadges = [
                    isManualExcluded ? { label: "M", title: "Manual exclusion", color: "#1565c0", background: "#e8f0fe", border: "#90caf9" } : null,
                    isBucketDerivedExcluded ? { label: "B", title: "Derived from main bucket constraints", color: "#8d6e00", background: "#fff8e1", border: "#f9a825" } : null,
                    isAutoSelectionExcluded ? { label: "A", title: "Auto excluded because unselected numbers are being excluded", color: "#616161", background: "#f5f5f5", border: "#bdbdbd" } : null,
                  ].filter((badge): badge is { label: string; title: string; color: string; background: string; border: string } => badge !== null);
                  const cellBorder = isManualExcluded && isBucketDerivedExcluded
                    ? "1px solid #8e24aa"
                    : isManualExcluded
                      ? "1px solid #90caf9"
                      : isBucketDerivedExcluded
                        ? "1px dashed #f9a825"
                        : isAutoSelectionExcluded
                          ? "1px solid #bdbdbd"
                          : "1px solid transparent";
                  const cellBackground = isManualExcluded && isBucketDerivedExcluded
                    ? "#f3e5f5"
                    : isManualExcluded
                      ? "#e8f0fe"
                      : isBucketDerivedExcluded
                        ? "#fff8e1"
                        : isAutoSelectionExcluded
                          ? "#f5f5f5"
                          : "transparent";
                  const titleParts = [
                    `Exclude ${n}`,
                    isManualExcluded ? "Manual" : null,
                    isBucketDerivedExcluded ? "Main bucket derived" : null,
                    isAutoSelectionExcluded ? "Auto from unselected" : null,
                    isBucketLocked ? "Locked while active main-bucket rule is enforcing this exclusion" : null,
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
                        cursor: isBucketLocked ? "not-allowed" : "pointer",
                        opacity: isBucketLocked ? 0.9 : 1,
                      }}
                      title={titleParts.join(" • ")}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isBucketLocked}
                        aria-label={isBucketLocked ? `Exclude ${n} (locked by active main bucket rule)` : `Exclude ${n}`}
                        style={{ accentColor: isBucketDerivedExcluded && !isManualExcluded ? "#f9a825" : "#1976d2", cursor: isBucketLocked ? "not-allowed" : "pointer" }}
                        onChange={() => {
                          if (isBucketLocked) return;
                          setExcludedNumbers((prev) =>
                            prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
                          );
                        }}
                      />
                      <span style={{ fontSize: 11, marginTop: 2, display: "inline-flex", alignItems: "center", gap: 3 }}>
                        {n}
                        {isBucketLocked && <span aria-hidden="true" title="Locked by active main bucket rule" style={{ fontSize: 10 }}>🔒</span>}
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

      {/* [ORDER-ANCHOR] 05 Survival Analyzer */}
      <CollapsibleSection title={<b>Survival Analyzer</b>} defaultOpen={false}>
        <SurvivalAnalyzer
          history={filteredHistory}
          excludedNumbers={allExclusions}
          probabilityHeading="Probability of Appearance in Next Draw (Per Number):"
          trendWeights={trendWeights}
          externalWindowSize={activeWindowSize}
          enableSDE1Global={knobs.enableSDE1}
          enableHC3Global={knobs.enableHC3}
          hideBiasToggles={true}
          forcedNumbers={trendSelectedNumbers}
          selectedCheckNumbers={selectedNumbers}
          focusNumber={focusNumber}
          highlightColor="#3BD759"
          onSelectionChange={setSelectedNumbers}
          patternsSelected={selectedWindowPatterns}
          onStats={(rows) => setSurvivalOut(rows)}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 06 Temperature Transition */}
      <CollapsibleSection title={<b>Temperature Transition</b>} defaultOpen={false}>
        <TemperatureTransitionPanel
          history={filteredHistory}
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
      <CollapsibleSection title={<b>Monte Carlo Analyzer</b>} defaultOpen={false}>
        <MonteCarloPanel
          history={filteredHistory}
          enableSDE1={knobs.enableSDE1}
          excludedNumbers={allExclusions}
          trendWeights={trendWeights}
          defaultWindow={activeWindowSize}
          showSimulation={true}
          forcedNumbers={trendSelectedNumbers}
          selectedCheckNumbers={selectedNumbers}
          externalFocusNumber={focusNumber}
          onFocusChange={setFocusNumber}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 07.1 Most Likely NOT Drawn */}
      <CollapsibleSection title={<b>Most Likely NOT Drawn</b>} defaultOpen={false}>
        <MostLikelyNotDrawnPanel history={filteredHistory} title="Most Likely NOT Drawn" />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 07.2 Backtest Validation Dashboard */}
      <CollapsibleSection title={<b>Backtest Validation</b>} defaultOpen={false}>
        <BacktestPanel history={filteredHistory} />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 08 Trend Ratio History */}
      <CollapsibleSection title={<b>Trend Ratio History</b>} defaultOpen={false}>
        <TrendRatioHistoryPanel
          stats={computeHistoricalTrendRatios({
            lookback: 4,
            threshold: 0.02,
            valueSeries: trendValueSeries,
            historyDraws: filteredHistory.map(d => ({ main: d.main, supp: d.supp }))
          })}
          allowedTrendRatios={[]}
          toggleTrendRatio={() => {}}
          lookback={4}
          threshold={0.02}
          drawsConsidered={Math.max(0, activeWindowSize - 4)}
          windowDraws={activeWindowSize}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 09 Group Pattern Analyzer */}
      <CollapsibleSection title={<b>Group Pattern Analyzer</b>} defaultOpen={false}>
        <GroupPatternPanel key={zpaReloadKey} history={filteredHistory} groups={custom} />
        <GlobalZoneWeighting />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 10 Pattern Stats */}
      <CollapsibleSection title={<b>Pattern Stats</b>} summaryHint="collapsed" defaultOpen={false}>
        <div style={{ overflowX: "auto", fontSize: 12, marginTop: 8, background: "#fff", border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
          <PatternStatsPanel draws={filteredHistory} numBins={10} />
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 11 Number Frequency */}
      <CollapsibleSection title={<b>Number Frequency</b>} summaryHint="compact, collapsed" defaultOpen={false}>
        <div style={{ overflowX: "auto", fontSize: 12, marginTop: 8 }}>
          <NumberFrequencyPanel draws={filteredHistory} allDraws={history} />
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 11.25 Draw Bucket Patterns */}
      <CollapsibleSection title={<b>Draw Bucket Patterns</b>} summaryHint="div5, ending digits, main+supp" defaultOpen={false}>
        <div style={{ marginTop: 8 }}>
          <DrawBucketPatternPanel draws={filteredHistory} allDraws={history} />
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 11.35 Ending Digit Sequences */}
      <CollapsibleSection title={<b>Ending Digit Sequences</b>} summaryHint="consecutive ending-digit runs" defaultOpen={false}>
        <div style={{ marginTop: 8 }}>
          <EndingDigitSequencePanel draws={filteredHistory} />
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 11.5 Adjacent Combos (Pairs/Triples) */}
      <CollapsibleSection title={<b>Adjacent Combos (Pairs / Triples)</b>} summaryHint="Runs, gaps, recent streaks" defaultOpen={false}>
        <AdjacentCombosPanel history={filteredHistory} allHistory={history} />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 12 Window Stats (Low/Mid/High, Even/Odd, Sum) */}
      <CollapsibleSection title={<b>Window Stats (Low/Mid/High, Even/Odd, Sum)</b>} summaryHint="WFMQY" defaultOpen={false}>
        <div style={{ marginTop: 8 }}>
          <WindowStatsPanel
            draws={filteredHistory}
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
                  x.even === p.even && x.odd === p.odd && x.sum === p.sum
                ));
                return exists
                  ? prev.filter(x => !(
                    x.low === p.low && x.high === p.high &&
                    x.even === p.even && x.odd === p.odd && x.sum === p.sum
                  ))
                  : [...prev, p];
              });
            }}
          />
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 13 Target Set Quick Stats */}
      <CollapsibleSection title={<b>Target Set Quick Stats</b>} defaultOpen={false}>
        <TargetSetQuickStatsPanel forcedNumbers={trendSelectedNumbers} selectedNumbers={userSelectedNumbers} />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 14 Advanced Survival Analysis & Churn/Return Prediction Models */}
      <CollapsibleSection title={<b>Advanced Survival Analysis & Churn/Return Prediction Models</b>} defaultOpen={false}>
        <div style={{ marginTop: 12 }}>
          <ChurnPredictor dataset={churnDataset} totalDraws={activeWindowSize} minDraws={36} modelType="rf" onPredictions={setChurnOut} />
          <ReturnPredictor dataset={churnDataset} totalDraws={activeWindowSize} minDraws={36} modelType="rf" onPredictions={setReturnOut} />

          <UserExclusionsStrip
            title="User Exclusions"
            excludedNumbers={excludedNumbers}
            setExcludedNumbers={setExcludedNumbers}
            orientation="horizontal"
            labelPosition="bottom"
            showClearButton={true}
            monthlyBuckets={monthlyBucketSetsAlways ?? monthlyConstraintPayload?.buckets}
          />

          <MultiStateChurnPanel history={filteredHistory} excludedNumbers={allExclusions} churnThreshold={15} />
          <SurvivalCoxPanel history={filteredHistory} excludedNumbers={allExclusions} />
          <SurvivalFrailtyPanel
            history={filteredHistory}
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

      {/* [ORDER-ANCHOR] 15 Operator’s Panel – Candidate Generation Controls */}
      <CollapsibleSection title={<b>Operator’s Panel – Candidate Generation Controls</b>} defaultOpen={true}>
         <OperatorsPanel
           entropy={entropyThreshold} setEntropy={setEntropyThreshold}
           entropyEnabled={entropyEnabled} setEntropyEnabled={setEntropyEnabled}
           hamming={hammingThreshold} setHamming={setHammingThreshold}
           hammingEnabled={hammingEnabled} setHammingEnabled={setHammingEnabled}
           jaccard={jaccardThreshold} setJaccard={setJaccardThreshold}
           jaccardEnabled={jaccardEnabled} setJaccardEnabled={setJaccardEnabled}
           lambdaEnabled={lambdaEnabled} setLambdaEnabled={setLambdaEnabled}
           lambda={lambda} setLambda={setLambda}
           minRecentMatches={minRecentMatches} setMinRecentMatches={setMinRecentMatches}
           recentMatchBias={recentMatchBias} setRecentMatchBias={setRecentMatchBias}
           previewStats={previewStats}
           gpwfEnabled={gpwfEnabled} setGPWFEnabled={setGPWFEnabled}
           gpwf_window_size={gpwf_window_size} setGPWFWindowSize={setGPWFWindowSize}
           maxGPWFWindow={Math.min(maxGPWFWindow, filteredHistory.length)}
           gpwf_bias_factor={gpwf_bias_factor} setGPWFBiasFactor={setGPWFBiasFactor}
           gpwf_floor={gpwf_floor} setGPWFFloor={setGPWFFloor}
           gpwf_scale_multiplier={gpwf_scale_multiplier} setGPWFScaleMultiplier={setGPWFScaleMultiplier}
           octagonal_top={octagonalTop} setOctagonalTop={setOctagonalTop}
         />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 16 State Presets */}
      <CollapsibleSection title={<b>State Presets</b>} summaryHint="Save and recall all current options" defaultOpen={false}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", background: "#f7fafe", border: "1px solid #e3f2fd", padding: 10, borderRadius: 6, marginTop: 8 }}>
          <label>
            Preset:
            <select value={selectedPresetId} onChange={(e) => setSelectedPresetId(e.target.value)} style={{ marginLeft: 6, minWidth: 220 }}>
              <option value="">— select —</option>
              {presets.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </label>
          <button onClick={() => { if (!selectedPresetId) return; const p = getPreset(selectedPresetId); if (!p) return; applySnapshot(p.state); }} disabled={!selectedPresetId}>Load</button>
          <button onClick={() => { if (!selectedPresetId) return; const snap = buildSnapshot(); updatePreset(selectedPresetId, snap); setPresets(listPresets()); }} disabled={!selectedPresetId}>Update from current</button>
          <button onClick={() => { if (!selectedPresetId) return; deletePresetLS(selectedPresetId); setPresets(listPresets()); setSelectedPresetId(""); }} disabled={!selectedPresetId}>Delete</button>
          <button onClick={async () => { if (!selectedPresetId) return; const json = exportPresetJSON(selectedPresetId); if (!json) return; const blob = new Blob([json], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "windfall-preset.json"; a.click(); URL.revokeObjectURL(url); }} disabled={!selectedPresetId}>Export</button>
          <span style={{ marginLeft: 12 }}>
            <label>
              New name:
              <input type="text" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} placeholder="e.g., Quarter+ZPA-G7" style={{ marginLeft: 6, width: 200 }} />
            </label>
            <button onClick={() => { const name = newPresetName.trim() || `Preset ${presets.length + 1}`; const snap = buildSnapshot(); const created = saveNewPreset(name, snap); setPresets(listPresets()); setSelectedPresetId(created.id); setNewPresetName(""); }} style={{ marginLeft: 8 }}>Save Current</button>
          </span>
          <span style={{ marginLeft: "auto" }}>
            <label style={{ marginRight: 6 }}>
              Import:
              <input type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const reader = new FileReader(); reader.onload = (evt) => { const text = String(evt.target?.result || ""); const imported = importPresetJSON(text); if (imported) { setPresets(listPresets()); setSelectedPresetId(imported.id); } }; reader.readAsText(f); e.currentTarget.value = ""; }} style={{ marginLeft: 6 }} />
            </label>
          </span>
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 17 Trend Ratio Filter (UP / DOWN / FLAT) */}
      <CollapsibleSection title={<b>Trend Ratio Filter (UP / DOWN / FLAT)</b>} defaultOpen={false}>
        <div style={{ marginTop: 6, fontSize: 11, color: "#555" }}>
          Configure trend ratio filters in dedicated panel (omitted for brevity).
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 18 Parameter Search */}
      <CollapsibleSection title={<b>Parameter Search</b>} defaultOpen={false}>
        <ParameterSearchPanel
          userSelectedNumbers={userSelectedNumbers}
          weightedTargets={weightedTargets}
          forcedNumbers={trendSelectedNumbers}
          excludedNumbers={effectiveExcludedNumbers}
          recentSignal={temperatureSignal}
          conditionalProb={ conditionalProb}
          onAdoptParameters={p => setBatesParams(p)}
          onProbabilityUpdate={p => setProbOverlay(p)}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 19 Bates Weighting Panel */}
      <CollapsibleSection title={<b>Bates Weighting Panel</b>} defaultOpen={false}>
        <BatesPanel
          excludedNumbers={effectiveExcludedNumbers}
          forcedNumbers={trendSelectedNumbers}
          recentSignal={temperatureSignal}
          conditionalProb={conditionalProb}
          controlledParams={batesParams}
          onParamsChange={p => setBatesParams(p)}
          probabilityOverlay={probOverlay}
          onDiagnostics={() => {}}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 20 Weighted Target List */}
      <CollapsibleSection title={<b>Weighted Target List</b>} defaultOpen={false}>
        <WeightedTargetListPanel userSelectedNumbers={userSelectedNumbers} weightedTargets={weightedTargets} setWeightedTargets={setWeightedTargets} />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 21 Modulation Diagnostics */}
      <CollapsibleSection title={<b>Modulation Diagnostics</b>} defaultOpen={false}>
        <ModulationDiagnosticsPanel diagnostics={null} currentBatesParams={batesParams as any} />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 21.5 Monthly Panels (relocated) */}
      <CollapsibleSection title={<b>Monthly Numbers Overlap</b>} defaultOpen={false} summaryHint="Selected draw vs earlier draws each month">
        <MonthlyOverlapPanel history={history} />
      </CollapsibleSection>

      <CollapsibleSection title={<b>Monthly First ↔ Last Draw Hits</b>} defaultOpen={false} summaryHint="Hits between first & last draw within / across months">
        <MonthlyFirstLastPanel history={history} />
      </CollapsibleSection>

      <CollapsibleSection title={<b>Monthly Draws Summary</b>} defaultOpen={false} summaryHint="All drawn numbers per month with counts">
        <MonthlyDrawsSummaryPanel
          history={history}
          onConstraintsChange={setMonthlyConstraintPayload}
          onUseSelectedNumbers={(nums) => setUserSelectedNumbers(nums)}
          constructiveFillEnabled={monthlyConstructiveEnabled}
          onConstructiveFillChange={setMonthlyConstructiveEnabled}
          onBucketInfoChange={(info) => setMonthlyBucketLabels(info.labels)}
          onBucketSetsChange={setMonthlyBucketSetsAlways}
          onAvgBucketsChange={setMonthlyAvgBuckets}
        />
      </CollapsibleSection>

      <CollapsibleSection title={<b>Monthly 1-Digit vs 2-Digit Occurrences</b>} defaultOpen={false} summaryHint="Monthly counts for numbers 1–9 versus 10–45">
        <MonthlyDigitOccurrencePanel history={history} />
      </CollapsibleSection>

      <CollapsibleSection title={<b>Hot vs Cold Ranking</b>} defaultOpen={false} summaryHint="Historical vs recent vs weighted number heat">
        <HotColdRankingPanel history={history} wfmqyhWindowSize={activeWindowSize} />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 22 User Selected Numbers */}
      <CollapsibleSection title={<b>User Selected Numbers</b>} defaultOpen={true}>
        <UserSelectedNumbersPanel
          userSelectedNumbers={userSelectedNumbers}
          setUserSelectedNumbers={setUserSelectedNumbers}
          autoExcludeUnselected={autoExcludeUnselected}
          onToggleAutoExclude={setAutoExcludeUnselected}
          onSimulate={(nums) => {
            if (!nums || nums.length < 6) {
              setSimulatedDraw(null);
              setSimSource('none');
              setSimCandidateIdx(null);
              setDgaStripSelected([]);
              return;
            }
            const main = nums.slice(0, 6).sort((a, b) => a - b);
            const supp = nums.slice(6, 8).sort((a, b) => a - b);
            setSimulatedDraw({ main, supp, date: "UserSim", isSimulated: true } as any);
            setSimSource('user');
            setSimCandidateIdx(null);
            setDgaStripSelected([]);
            scrollToDGA();
          }}
          onClear={() => {
            setSimulatedDraw(null);
            setSimSource('none');
            setSimCandidateIdx(null);
            setDgaStripSelected([]);
          }}
          isSimulatingUser={simSource === 'user'}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 23 Selection Insights */}
      <CollapsibleSection title={<b>Selection Insights</b>} defaultOpen={false}>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
            {/* Windowed (WFMQY) version */}
            <div>
              <div style={{ fontSize: 12, color: "#1a4fa3", fontWeight: 700, marginBottom: 4 }}>Windowed (WFMQY)</div>
              <SelectionInsightsPanel
                history={filteredHistory}
                selected={userSelectedNumbers}
                topKTriplets={10}
                historyWindowName={`${historyWindowName} (WFMQY)`}
                ogaHistory={filteredHistory}
                autoComputeOGARaw={true}
                lazyThreshold={400}
                useIdleCallback={true}
                onComputedOGARaw={(map) => {
                  setTrace(t => [...t, `[TRACE] OGA raw computed (Windowed) for ${Object.keys(map).length} numbers.`]);
                }}
              />
            </div>

            {/* All History version */}
            <div>
              <div style={{ fontSize: 12, color: "#1a4fa3", fontWeight: 700, marginBottom: 4 }}>All History</div>
              <SelectionInsightsPanel
                history={history}
                selected={userSelectedNumbers}
                topKTriplets={10}
                historyWindowName={`All History`}
                ogaHistory={history}
                autoComputeOGARaw={true}
                lazyThreshold={400}
                useIdleCallback={true}
                onComputedOGARaw={(map) => {
                  setTrace(t => [...t, `[TRACE] OGA raw computed (All) for ${Object.keys(map).length} numbers.`]);
                }}
              />
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 24 Generated Candidates */}
      <CollapsibleSection title={<b>Generated Candidates</b>} defaultOpen={true}>
        <div style={{ padding: 32, fontFamily: "sans-serif" }}>
          {/* OGA reference toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <label style={{ fontSize: 12 }}>
              OGA reference:
              <select value={ogaRefMode} onChange={(e) => setOgaRefMode(e.target.value as any)} style={{ marginLeft: 6 }}>
                <option value="window">Windowed</option>
                <option value="all">Full History</option>
              </select>
            </label>
            <label style={{ fontSize: 12 }}>
              Spokes:
              <input
                type="number"
                min={3}
                max={15}
                step={1}
                value={ogaSpokeCount}
                onChange={(e) => setOgaSpokeCount(Math.max(1, Math.min(45, Number(e.target.value) || 9)))}
                style={{ width: 70, marginLeft: 6 }}
              />
            </label>
          </div>

          <RankingWeightsPanel weights={rankingWeights} setWeights={setRankingWeights} />

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "12px 0 18px" }}>
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }} title="Bias the generator to draw from your User Selected numbers more often">
              <input
                type="checkbox"
                checked={selectedBoostEnabled}
                onChange={(e) => setSelectedBoostEnabled(e.target.checked)}
              />
              Boost User Selected numbers during generation
            </label>
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }} title="Higher factor increases the odds of picking a selected number (applied before constraints).">
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
            </label>
            <span style={{ fontSize: 12, color: "#555" }}>
              Applies only to generation (not ranking); still respects exclusions/forced numbers.
            </span>
          </div>

          <GeneratedCandidatesPanel
            onGenerate={handleGenerate}
            candidates={candidates}
            quotaWarning={quotaWarning}
            isGenerating={isGenerating}
            numCandidates={numCandidates}
            setNumCandidates={setNumCandidates}
            userSelectedNumbers={userSelectedNumbers}
            setUserSelectedNumbers={setUserSelectedNumbers}
            onSelectCandidate={setSelectedCandidateIdx}
            onSimulateCandidate={handleSimulateCandidate}
            selectedCandidateIdx={selectedCandidateIdx}
            mostRecentDraw={filteredHistory[filteredHistory.length - 1] || null}
            manualSimSelected={manualSimSelected}
            setManualSimSelected={setManualSimSelected}
            activeOGABand={activeOGABand}
            forcedNumbers={trendSelectedNumbers}
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
            historyForOGA={filteredHistory}
            fullHistory={history}
            ogaRefScores={pastOGAScoresRef}
            ogaSpokeCount={ogaSpokeCount}
            attemptMultiplier={attemptMultiplier}
            onAttemptMultiplierChange={setAttemptMultiplier}
            overgenFactor={overgenFactor}
            onOvergenFactorChange={setOvergenFactor}
            rdyWeights={rdyWeights}
            enableOGA={knobs.enableOGA}
            ratioOptions={ratioOptions}
            exportSettings={({
              excludedNumbers: effectiveExcludedNumbers,
              hc3Exclusions,
              sde1Exclusions,
              enableHC3: knobs.enableHC3,
              enableSDE1: knobs.enableSDE1,
              selectedOddEvenRatios: selectedRatios,
              lambdaEnabled,
              lambda,
              selectedBoostEnabled,
              selectedBoostFactor,
              monthlyBoostPenalize: monthlyConstraintPayload?.boostPenalize ?? false,
              monthlyConstructiveEnabled,
              monthlyConstructiveConstraints: monthlyConstraintPayload?.constraints,
              minRecentMatches,
              recentMatchBias,
              entropyEnabled,
              entropyThreshold,
              hammingEnabled,
              hammingThreshold,
              jaccardEnabled,
              jaccardThreshold,
            } as ExportSettings)}
          />
          <CollapsibleSection title={<b>Candidate Generation Influences</b>} summaryHint="Toggle filters and boosts that affect generation" defaultOpen={true}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(260px, 1fr))", gap: 12 }}>
              {/* Column 1: Generation Constraints */}
              <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Generation Constraints</div>

                <div style={{
                  marginTop: 8,
                  display: "grid",
                  gap: 6,
                }}>
                  <div style={{ fontSize: 11, color: "#666", lineHeight: 1.5 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: "#f59e0b",
                          border: "1px solid #d97706",
                          display: "inline-block",
                        }}
                      />
                      <span>Amber row = boosted during generation; any positive 1-digit or 2-digit boost keeps that bucket eligible even when Max is Off.</span>
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginLeft: 10 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: "#60a5fa",
                          border: "1px solid #2563eb",
                          display: "inline-block",
                        }}
                      />
                      <span>Blue row = punished during generation; negative values reduce candidate weighting without fully excluding that decade.</span>
                    </span>
                  </div>
                  {exactConstraintRows.map(({ key, label, helper, badge, max, enabled, setEnabled, count, setCount, singleDigitBoost, twoDigitBoost, setSingleDigitBoost, setTwoDigitBoost, title, bucketKey }) => {
                    const bucketSummary = generationConstraintBucketSummaries[bucketKey];
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
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "auto auto auto auto minmax(260px, 1fr)",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
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
                          <div style={{ minWidth: 0, fontSize: 11, color: "#555", lineHeight: 1.4 }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                                <span key={`${key}-hits-${hits}`} style={{ marginRight: 8 }}>
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

                <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed #ddd" }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Digit decade boost / punish</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {mainDecadeConstraintRows.map(({ key, label, helper, badge, bias, setBias, title, bucketKey }) => {
                      const bucketSummary = generationConstraintDecadeSummaries[bucketKey];
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
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "auto minmax(260px, 1fr)",
                              gap: 8,
                              alignItems: "center",
                            }}
                          >
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
                            <div style={{ minWidth: 0, fontSize: 11, color: "#555", lineHeight: 1.4 }}>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                                  <span key={`${key}-hits-${hits}`} style={{ marginRight: 8 }}>
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
                </div>

                <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed #ddd" }}>
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
                </div>

                <div style={{ marginTop: 8 }}>
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
                      <div style={{ marginLeft: 18, marginTop: 4, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px 10px", fontSize: 12 }}>
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

                {/* Monthly Repeat Bias */}
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed #ddd" }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    Monthly Repeat Bias
                    {(() => {
                      const d = mrbEffectiveDate;
                      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                      const today = new Date();
                      const todayLabel = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
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
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "3px 8px", alignItems: "center", fontSize: 12, marginBottom: 8 }}>
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
              </div>

              {/* Column 2: Composition & Recency + OGA Bias */}
              <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Composition & Recency</div>
                <label>
                  <input type="checkbox" checked={useTrickyRule} onChange={(e) => setUseTrickyRule(e.target.checked)} style={{ marginRight: 6 }} />
                  Tricky Rule (reject 0:8 and 8:0)
                </label>
                <div style={{ marginTop: 6 }}>
                  <b>Odd/Even ratios</b> (disable Tricky to use):
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
                    {ratioOptions.map(({ ratio }) => (
                      <label key={ratio} style={{ opacity: useTrickyRule ? 0.4 : 1 }}>
                        <input type="checkbox" checked={selectedRatios.includes(ratio)} disabled={useTrickyRule} onChange={() => handleRatioToggle(ratio)} style={{ marginRight: 6 }} />
                        {ratio}
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 6 }}>
                  <label>
                    Minimum matches to last draw:
                    <input type="number" min={0} max={8} value={minRecentMatches} onChange={(e) => setMinRecentMatches(Number(e.target.value))} style={{ width: 60, marginLeft: 6 }} />
                  </label>
                </div>
                <div style={{ marginTop: 6 }}>
                  <label title="Reject candidates that share more than the chosen number of matches with the last draw">
                    <input
                      type="checkbox"
                      checked={maxLastDrawMatchesEnabled}
                      onChange={(e) => setMaxLastDrawMatchesEnabled(e.target.checked)}
                      style={{ marginRight: 6 }}
                    />
                    Maximum matches to last draw:
                    <select
                      value={maxLastDrawMatchesValue}
                      onChange={(e) => setMaxLastDrawMatchesValue(Number(e.target.value))}
                      disabled={!maxLastDrawMatchesEnabled}
                      style={{ marginLeft: 6, opacity: maxLastDrawMatchesEnabled ? 1 : 0.4 }}
                    >
                      {[1,2,3,4,5,6,7,8].map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div style={{ marginTop: 6 }}>
                  <label title="Bias acceptance probability by overlap with last draw">
                    Recent-match bias:
                    <input type="number" min={0} max={5} step={0.1} value={recentMatchBias} onChange={(e) => setRecentMatchBias(Number(e.target.value))} style={{ width: 70, marginLeft: 6 }} />
                  </label>
                </div>
                <div style={{ marginTop: 6 }}>
                  <label title="Require at least M numbers from union of last W draws">
                    Repeat window W:
                    <input type="number" min={0} max={history.length} value={repeatWindowSizeW} onChange={(e) => setRepeatWindowSizeW(Number(e.target.value))} style={{ width: 70, marginLeft: 6 }} />
                  </label>
                  <label style={{ marginLeft: 10 }}>
                    Min from union M:
                    <input type="number" min={0} max={8} value={minFromRecentUnionM} onChange={(e) => setMinFromRecentUnionM(Number(e.target.value))} style={{ width: 60, marginLeft: 6 }} />
                  </label>
                </div>

                {/* OGA Forecast Bias (KDE) */}
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed #ddd" }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>OGA Forecast Bias (KDE)</div>
                  <label style={{ display: "block", marginBottom: 6 }}>
                    <input type="checkbox" checked={enableOGAForecastBias} onChange={(e) => setEnableOGAForecastBias(e.target.checked)} style={{ marginRight: 6 }} />
                    Enable bias by Next Draw OGA forecast
                  </label>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 6 }}>
                    <label style={{ fontSize: 12 }}>
                      Baseline:
                      <select value={ogaBaselineMode} onChange={(e) => setOGABaselineMode(e.target.value as any)} style={{ marginLeft: 6 }}>
                        <option value="window">Windowed</option>
                        <option value="all">Full History</option>
                      </select>
                    </label>
                    <label style={{ fontSize: 12 }}>
                      Preferred band:
                      <select value={ogaPreferredBand} onChange={(e) => setOGAPreferredBand(e.target.value as any)} style={{ marginLeft: 6 }}>
                        <option value="auto">Auto</option>
                        <option value="low">Low (≤p10)</option>
                        <option value="mid">Mid (p10–p90)</option>
                        <option value="high">High (≥p90)</option>
                      </select>
                    </label>
                  </div>
                  {/* NEW: Decile selector */}
                  {(() => {
                    const dec = forecastOGA(filteredHistory, ogaBaselineMode === 'window' ? filteredHistory : history, ogaSpokeCount).deciles;
                    const thresholds = dec?.thresholds || [];
                    return (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>Preferred decile bands:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                          {Array.from({ length: 10 }, (_, i) => i).map((i) => (
                            <label key={i} style={{ border: '1px solid #eee', borderRadius: 4, padding: '4px 6px' }}>
                              <input
                                type="checkbox"
                                checked={ogaPreferredDeciles.some(d => d.index === i)}
                                onChange={(e) => {
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
                        <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Select one or more deciles and assign weights; candidates whose OGA falls in selected deciles are accepted with probability proportional to weight. If none are selected, low/mid/high is used.</div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Column 3: Core Filters + Readiness Scoring */}
              <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Core Filters */}
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Core Filters</div>
                  <label>
                    <input type="checkbox" checked={entropyEnabled} onChange={(e) => setEntropyEnabled(e.target.checked)} style={{ marginRight: 6 }} />
                    Entropy (threshold {entropyThreshold})
                  </label>
                  <div style={{ marginLeft: 18, marginTop: 4 }}>
                    <input type="range" min={0} max={6} step={0.1} value={entropyThreshold} onChange={(e) => setEntropyThreshold(Number(e.target.value))} style={{ width: 200 }} />
                  </div>
                  <label>
                    <input type="checkbox" checked={hammingEnabled} onChange={(e) => setHammingEnabled(e.target.checked)} style={{ marginRight: 6 }} />
                    Hamming (min {hammingThreshold})
                  </label>
                  <div style={{ marginLeft: 18, marginTop: 4 }}>
                    <input type="range" min={0} max={8} step={1} value={hammingThreshold} onChange={(e) => setHammingThreshold(Number(e.target.value))} style={{ width: 200 }} />
                  </div>
                  <label>
                    <input type="checkbox" checked={jaccardEnabled} onChange={(e) => setJaccardEnabled(e.target.checked)} style={{ marginRight: 6 }} />
                    Jaccard (max {Math.round(jaccardThreshold * 100)}%)
                  </label>
                  <div style={{ marginLeft: 18, marginTop: 4 }}>
                    <input type="range" min={0} max={1} step={0.01} value={jaccardThreshold} onChange={(e) => setJaccardThreshold(Number(e.target.value))} style={{ width: 200 }} />
                  </div>
                </div>

                <div style={{ borderTop: "1px dashed #ddd", paddingTop: 10 }}>
                {/* Readiness Scoring */}
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Readiness (Rdy) Scoring</div>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 10, lineHeight: 1.5 }}>
                  The <b>Rdy</b> column in Generated Candidates ranks each candidate by a weighted composite of three signals.
                  Use these sliders to emphasise the factors most important to your strategy. Weights are normalised (they always sum to 100%).
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", marginBottom: 2, fontSize: 12 }} title="Ideal Draw Match: How closely the candidate's bucket composition (0x, 1x, 2x…) matches the statistically optimal draw from the Ideal draw row in Monthly Draws Summary. High IDM = numbers drawn from the right frequency buckets.">
                    <b>IDM</b> — Ideal Draw Match: <b>{Math.round(rdyWeights.idm / ( rdyWeights.idm + rdyWeights.conv + rdyWeights.oga || 1) * 100)}%</b>
                  </label>
                  <input type="range" min={0} max={1} step={0.05} value={rdyWeights.idm}
                    onChange={(e) => setRdyWeights(prev => ({ ...prev, idm: Number(e.target.value) }))}
                    style={{ width: "100%" }} />
                  <div style={{ fontSize: 11, color: "#888" }}>
                    Measures bucket composition similarity to the optimal draw. Higher = candidate draws from the "right" frequency buckets to bring the month closer to the historical average.
                  </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", marginBottom: 2, fontSize: 12 }} title="Convergence: How much this candidate moves the current month's frequency distribution toward the historical average (SSD reduction). High Conv = more convergent toward balance.">
                    <b>Conv</b> — Convergence: <b>{Math.round(rdyWeights.conv / (rdyWeights.idm + rdyWeights.conv + rdyWeights.oga || 1) * 100)}%</b>
                  </label>
                  <input type="range" min={0} max={1} step={0.05} value={rdyWeights.conv}
                    onChange={(e) => setRdyWeights(prev => ({ ...prev, conv: Number(e.target.value) }))}
                    style={{ width: "100%" }} />
                  <div style={{ fontSize: 11, color: "#888" }}>
                    Measures the SSD (sum of squared differences) reduction between the current and target distributions. Related to IDM but accounts for the magnitude of each bucket's over/under-representation.
                  </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", marginBottom: 2, fontSize: 12 }} title="OGA (Octagonal Geometry Alignment): The candidate's OGA percentile relative to all historical draws. High OGA% = numbers that form geometrically balanced patterns on the DGA grid.">
                    <b>OGA</b> — Geometry Alignment: <b>{Math.round(rdyWeights.oga / (rdyWeights.idm + rdyWeights.conv + rdyWeights.oga || 1) * 100)}%</b>
                  </label>
                  <input type="range" min={0} max={1} step={0.05} value={rdyWeights.oga}
                    onChange={(e) => setRdyWeights(prev => ({ ...prev, oga: Number(e.target.value) }))}
                    style={{ width: "100%" }} />
                  <div style={{ fontSize: 11, color: "#888" }}>
                    Uses the OGA percentile to favour candidates whose numbers form geometrically aligned patterns. Independent of monthly frequency analysis.
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "#1565c0", background: "#e3f2fd", borderRadius: 4, padding: 8 }}>
                  <b>Effective weights:</b> IDM {Math.round(rdyWeights.idm / (rdyWeights.idm + rdyWeights.conv + rdyWeights.oga || 1) * 100)}% · Conv {Math.round(rdyWeights.conv / (rdyWeights.idm + rdyWeights.conv + rdyWeights.oga || 1) * 100)}% · OGA {Math.round(rdyWeights.oga / (rdyWeights.idm + rdyWeights.conv + rdyWeights.oga || 1) * 100)}%
                </div>
                </div>{/* end readiness wrapper */}
              </div>{/* end column 3 */}
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: "#555" }}>
              <b>Provenance:</b> Window={filteredHistory.length}; Entropy={entropyEnabled ? entropyThreshold : "off"}; Hamming={hammingEnabled ? hammingThreshold : "off"}; Jaccard={jaccardEnabled ? jaccardThreshold : "off"}; Tricky={useTrickyRule ? "on" : "off"}; Ratios={selectedRatios.length ? selectedRatios.join(" ") : "none"}; RecMin={minRecentMatches}; RecBias={recentMatchBias}; Repeat W={repeatWindowSizeW} M={minFromRecentUnionM}; GPWF={gpwfEnabled ? "on" : "off"}; λ={lambdaEnabled ? lambda.toFixed(2) : "off"}; Sum={sumFilter.enabled ? `${sumFilter.min}–${sumFilter.max}${sumFilter.includeSupp ? "+supp" : ""}` : "off"}; PatternMode={patternConstraintMode} Tol={patternSumTolerance} Boost={patternBoostFactor}; OGABias={enableOGAForecastBias ? `${ogaPreferredBand} @ ${ogaBaselineMode}` : "off"}; End0Set=${mainZeroSetEnabled ? `max ${maxMainZeroSetCount}` : "off"}; End1Set=${mainOneSetEnabled ? `max ${maxMainOneSetCount}` : "off"}; End2Set=${mainTwoSetEnabled ? `max ${maxMainTwoSetCount}` : "off"}; End3Set=${mainThreeSetEnabled ? `max ${maxMainThreeSetCount}` : "off"}; End4Set=${mainFourSetEnabled ? `max ${maxMainFourSetCount}` : "off"}; End5Set=${mainFiveSetEnabled ? `max ${maxMainFiveSetCount}` : "off"}; End6Set=${mainSixSetEnabled ? `max ${maxMainSixSetCount}` : "off"}; End7Set=${mainSevenSetEnabled ? `max ${maxMainSevenSetCount}` : "off"}; End8Set=${mainEightSetEnabled ? `max ${maxMainEightSetCount}` : "off"}; End9Set=${mainNineSetEnabled ? `max ${maxMainNineSetCount}` : "off"}; DigitWidth=${digitWidthConstraintTargets.enabled ? `${digitWidthConstraintTargets.singleDigitPercent}/${digitWidthConstraintTargets.twoDigitPercent} ${formatDigitWidthScopeLabel(digitWidthConstraintTargets.scope)} => ${digitWidthConstraintTargets.singleDigitCount}/${digitWidthConstraintTargets.twoDigitCount}` : "off"}; EndDigitBoosts={activeMainDigitBoostSummary || "none"}; DecadeBias={activeMainDecadeBiasSummary || "none"}; MRB={mrbEnabled ? `ON budget:${MRB_BUCKET_KEYS.reduce((s,k)=>s+Math.max(0,(mrbBucketBoosts[k]??1)-1),0).toFixed(1)}/${MRB_BUDGET}` : "off"}
            </div>
            {/* Forced and Excluded reporting */}
            <div style={{ marginTop: 8, fontSize: 12, color: "#333", background: "#fafafa", border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
              <div style={{ marginBottom: 6 }}>
                <b>Forced numbers</b> ({trendSelectedNumbers.length}): {trendSelectedNumbers.length ? trendSelectedNumbers.slice().sort((a,b)=>a-b).join(", ") : "— none —"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
          </CollapsibleSection>

          <div style={{ width: "100%", marginBottom: 68 }}>
            <OGAHistogram
              ogaScores={pastOGAScoresRef}
              candidateOGA={(currentCandidate as any)?.ogaScore}
              candidatePercentile={(currentCandidate as any)?.ogaPercentile}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            {/* [ORDER-ANCHOR] 24.5 Pick Six */}
            <CollapsibleSection title={<b>Pick Six</b>} defaultOpen={false} summaryHint="28 combos of 6 from 8">
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

      {/* [ORDER-ANCHOR] 25 Diamond Grid Analysis (DGA) */}
      <CollapsibleSection title={<b>Diamond Grid Analysis (DGA)</b>} defaultOpen={true}>
        <div style={{ width: "100%", marginTop: 18, marginBottom: 10 }}>
          {/* Next Hot Blocks above Temperature Heatmap */}
          <div style={{ marginBottom: 12 }}>
            <NextHotBlocksPanel
              history={filteredHistory}
              excludedNumbers={effectiveExcludedNumbers}
              setExcludedNumbers={setExcludedNumbers}
              onClearAutoExclusions={() => setAutoExcludeUnselected(false)}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <h4 style={{ margin: 0 }}>Temperature Heatmap</h4>
            <label style={{ fontSize: 13 }}>
              Metric:
              <select value={tempMetric} onChange={(e) => setTempMetric(e.target.value as any)} style={{ marginLeft: 6 }} title="EMA • Recency • Hybrid">
                <option value="hybrid">Hybrid (EMA ⊕ Recency)</option>
                <option value="ema">EMA only</option>
                <option value="recency">Recency only</option>
              </select>
            </label>
            <label style={{ fontSize: 13, marginLeft: 12 }}>
              Letters:
              <input type="checkbox" checked={showHeatmapLetters} onChange={e => setShowHeatmapLetters(e.target.checked)} style={{ marginLeft: 6 }} title="Overlay letter codes" />
            </label>
          </div>

          <div style={{ width: "100%", marginBottom: 8 }}>
            <DroughtHazardPanel
              history={filteredHistory}
              top={8}
              title="Most likely to break a drought next draw"
              bucketLabels={monthlyBucketLabels}
            />
          </div>

          <div style={{ width: "100%", marginTop: 8, marginBottom: 6 }}>
            <HeatmapLegendBar labels={bucketLabels} counts={legendCounts} total={legendTotal} colors={bucketColors} />
          </div>

          <div style={{ width: "100%", overflowX: "auto" }}>
            <div style={{ display: "inline-flex", alignItems: "flex-start", gap: 12, position: "relative" }}>
              <div style={{ display: "inline-block" }}>
                <TemperatureHeatmap
                  history={filteredHistory}
                  alpha={0.25}
                  cellSize={DGA_CELL_SIZE}
                  metric={tempMetric}
                  buckets={10}
                  bucketStops={bucketStops}
                  bucketLabels={bucketLabels}
                  hybridWeight={0.6}
                  emaNormalize="per-number"
                  enforcePeaks={true}
                  onHoverNumber={setFocusNumber}
                  showLegendCounts={false}
                  overlayNumbers={overlayNumbers}
                  showBucketLetters={showHeatmapLetters}
                  bucketLetters={["pR","F","pF","<C","C>","tT","W","H","tR","V"]}
                />
              </div>
              {/* Vertical user exclusions aligned to rows for Heatmap */}
              <div style={{ position: "sticky", right: 0, top: 0 }}>
                <UserExclusionsStrip
                  title={undefined}
                  excludedNumbers={effectiveExcludedNumbers}
                  setExcludedNumbers={setExcludedNumbers as any}
                  orientation="vertical"
                  labelPosition="right"
                  cellSize={DGA_CELL_SIZE}
                  monthlyBuckets={monthlyBucketSetsAlways ?? monthlyConstraintPayload?.buckets}
                />
              </div>
            </div>
          </div>

          {highlightMsg && (
            <div style={{ color: "#c00", marginTop: 10, marginBottom: 12 }}>{highlightMsg}</div>
          )}

          <div ref={dgaGridRef} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            {simScrollOriginY !== null && (
              <button
                type="button"
                onClick={scrollBackToOrigin}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "1px solid #1976d2",
                  background: "#e3f2fd",
                  color: "#1976d2",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
                title="Return to where you pressed Simulate"
              >
                ↑ Back
              </button>
            )}
          </div>

          {dgaGrid.length > 0 ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              {/* Grid takes all available width */}
              <div style={{ flex: 1, minWidth: 0 }}>
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
                  controlsPosition="below"
                  focusNumber={focusNumber}
                  focusedCol={focusedDgaCol}
                  onColumnClick={(col) => setFocusedDgaCol((prev) => (prev === col ? null : col))}
                  wfmqyhStart={dgaWfmqyhStart}
                />
              </div>
              {/* Simulate strip sits to the right of the grid — no overlap */}
              <div style={{ flexShrink: 0, paddingTop: DGA_CELL_SIZE - 3 }}>
                <DGASimulateStrip
                  selectedNumbers={dgaStripSelected}
                  cellSize={DGA_CELL_SIZE}
                  monthlyBuckets={monthlyBucketSetsAlways ?? monthlyConstraintPayload?.buckets ?? dgaLiveMonthlyBuckets}
                  onChange={(nums) => {
                    setDgaStripSelected(nums);
                    // Simulate in the Next column when at least 1 number is selected
                    if (nums.length === 0) {
                      setSimulatedDraw(null);
                      setSimSource('none');
                      setSimCandidateIdx(null);
                    } else {
                      const sorted = [...nums].sort((a, b) => a - b);
                      const main = sorted.slice(0, 6);
                      const supp = sorted.slice(6, 8);
                      setSimulatedDraw({ main, supp, date: "DGAStrip", isSimulated: true } as any);
                      setSimSource('dga-strip');
                      setSimCandidateIdx(null);
                    }
                  }}
                />
              </div>
            </div>
          ) : (
            <i>No grid data available.</i>
          )}
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 26 Undrawn Patterns (Empirical) */}
      <CollapsibleSection title={<b>Undrawn Patterns (Empirical)</b>} defaultOpen={false} summaryHint="Mains vs mains+supps toggle">
        <UndrawnPatternsPanel history={history} />
      </CollapsibleSection>

      <TracePanel lines={trace} onClear={() => setTrace([])} />
    </div>
  );

  // Snapshot helpers used by Presets
  function buildSnapshot(): AppPresetSnapshot {
    const zpaSelected = getSavedSelectedZones() ?? Array(9).fill(true);
    const zpaNorm = getSavedNormalizeMode() ?? "all";
    const zpaGroups = getSavedGroups() ?? custom;
    return {
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
      trendLookback: 4,
      trendThreshold: 0.02,
      allowedTrendRatios: [],
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
      acceptanceNeedsHardExclude,
      selectedBoostEnabled,
      selectedBoostFactor,
      ogaSpokeCount,
      autoExcludeUnselected,
      userSelectedNumbers: [...userSelectedNumbers],
      manualSimSelected: [...manualSimSelected],
      minRecentMatches,
      recentMatchBias,
      repeatWindowSizeW,
      minFromRecentUnionM,
      sumFilter: { ...sumFilter },
      patternConstraintMode,
      patternBoostFactor,
      patternSumTolerance,
      selectedWindowPatterns: [...selectedWindowPatterns],
      insightsEnabled,
      tempMetric,
      showHeatmapLetters,
      ogaRefMode,
      enableOGAForecastBias,
      ogaBaselineMode,
      ogaPreferredBand,
      ogaPreferredDeciles: [...ogaPreferredDeciles],
      traceVerbose,
      rdyWeights: { ...rdyWeights },
    };
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
    setRankingWeights({
          oga: s.rankingWeights?.oga ?? 0.7,
          sel: s.rankingWeights?.sel ?? 0.2,
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
    setAcceptanceNeedsHardExclude(!!(s as any).acceptanceNeedsHardExclude);
    setSelectedBoostEnabled(s.selectedBoostEnabled ?? false);
    setSelectedBoostFactor(s.selectedBoostFactor ?? 2);
    setOgaSpokeCount(s.ogaSpokeCount ?? 9);
    setAutoExcludeUnselected(!!s.autoExcludeUnselected);
    setUserSelectedNumbers(s.userSelectedNumbers ?? []);
    setManualSimSelected(s.manualSimSelected ?? []);
    setMinRecentMatches(s.minRecentMatches ?? 0);
    setRecentMatchBias(s.recentMatchBias ?? 0);
    setRepeatWindowSizeW(s.repeatWindowSizeW ?? 12);
    setMinFromRecentUnionM(s.minFromRecentUnionM ?? 0);
    setSumFilter(s.sumFilter ?? { enabled: false, min: 0, max: 0, includeSupp: true });
    setPatternConstraintModeode(s.patternConstraintMode ?? 'boost');
    setPatternBoostFactor(s.patternBoostFactor ?? 0.15);
    setPatternSumTolerance(s.patternSumTolerance ?? 0);
    setSelectedWindowPatterns(s.selectedWindowPatterns ?? []);
    setInsightsEnabled(s.insightsEnabled ?? false);
    setTempMetric(s.tempMetric ?? 'hybrid');
    setShowHeatmapLetters(s.showHeatmapLetters ?? false);
    setOgaRefMode(s.ogaRefMode ?? 'window');
    setEnableOGAForecastBias(s.enableOGAForecastBias ?? false);
    setOGABaselineMode(s.ogaBaselineMode ?? 'window');
    setOGAPreferredBand(s.ogaPreferredBand ?? 'auto');
    setOGAPreferredDeciles(s.ogaPreferredDeciles ?? []);
    setTraceVerbose(s.traceVerbose ?? true);
    setRdyWeights(s.rdyWeights ?? { idm: 0.70, conv: 0.10, oga: 0.20 });
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

// DGASimulateStrip – select numbers to simulate in the Next column of the DGA grid
interface DGASimulateStripProps {
  selectedNumbers: number[];
  onChange: (nums: number[]) => void;
  cellSize?: number;
  monthlyBuckets?: MonthlyBucketSets | null;
}
const DGASimulateStrip: React.FC<DGASimulateStripProps> = ({ selectedNumbers, onChange, cellSize, monthlyBuckets }) => {
  const MAX_SELECT = 8;
  const atMax = selectedNumbers.length >= MAX_SELECT;
  const selectionCountLabel = `${selectedNumbers.length}/${MAX_SELECT}`;
  const sizeStyles: React.CSSProperties = cellSize
    ? { height: cellSize, lineHeight: `${cellSize}px`, justifyContent: "center" }
    : {};

  const handleToggle = (n: number) => {
    if (selectedNumbers.includes(n)) {
      onChange(selectedNumbers.filter((x) => x !== n));
    } else if (!atMax) {
      onChange([...selectedNumbers, n]);
    }
  };

  return (
    <div style={{ marginTop: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 0, paddingTop: 0, paddingBottom: 0, alignItems: "flex-start" }}>
        {Array.from({ length: 45 }, (_, i) => i + 1).map((n) => {
          const checked = selectedNumbers.includes(n);
          const disabled = !checked && atMax;
          // When selected: blue; when unselected: monthly bucket colour (if available) or transparent
          const bucketColor = _stripBucketColor(n, monthlyBuckets);
          const bgColor = checked ? "#1565c0" : (bucketColor ?? "transparent");
          const textColor = checked || bucketColor ? "#fff" : "#333";
          return (
            <label
              key={n}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                minWidth: 28,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.4 : 1,
                ...sizeStyles,
              }}
              title={checked ? `Remove ${n} from simulation` : disabled ? "Max 8 numbers" : `Simulate ${n} in Next column`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
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
                }}
              >
                {n}
              </span>
            </label>
          );
        })}
        {selectedNumbers.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => onChange([])}
              style={{ marginTop: 4, fontSize: 10, lineHeight: 1.1, padding: "1px 5px", cursor: "pointer", alignSelf: "flex-start" }}
              title="Clear all simulated selections"
            >
              Clear
            </button>
          </>
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
              color: atMax ? "#b71c1c" : "#546e7a",
              background: atMax ? "#ffebee" : "#f3f7fb",
              border: `1px solid ${atMax ? "#ef9a9a" : "#d8e3ef"}`,
              borderRadius: 999,
              padding: "1px 6px",
              fontVariantNumeric: "tabular-nums",
            }}
            title={atMax ? "Maximum reached — unselect one number to choose another" : `${selectedNumbers.length} of ${MAX_SELECT} selected`}
            aria-label={atMax ? `${selectionCountLabel} selected, maximum reached` : `${selectionCountLabel} selected`}
          >
            {selectionCountLabel}
          </span>
          {atMax && (
            <span
              style={{ fontSize: 10, color: "#b71c1c", fontWeight: 600 }}
              title="You already have the maximum 8 selections for DGA simulation"
            >
              max
            </span>
          )}
        </div>
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

export default function App() {
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

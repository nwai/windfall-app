1// NOTE: Step-3 consolidated updates and fixes:
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
import { GeneratedCandidatesPanel } from "./components/candidates/GeneratedCandidatesPanel";
import { buildTrendWeights } from "./lib/trendBias";
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
import { AdjacentCombosPanel } from "./components/AdjacentCombosPanel";
import { applyOctagonalPostProcess } from "./octagonal";
import { PickSixPanel, type PickSixSource } from "./components/PickSixPanel";


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
  const [requireDiv5, setRequireDiv5] = useState<boolean>(false);
  const [maxDiv5, setMaxDiv5] = useState<number>(8);
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
  const [rdyWeights, setRdyWeights] = useState<{ idm: number; conv: number; oga: number }>({ idm: 0.50, conv: 0.30, oga: 0.20 });

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
  const [numberCounts, setNumberCounts] = useState<number[]>([]);
  const [minCount, setMinCount] = useState<number>(0);
  const [maxCount, setMaxCount] = useState<number>(0);
  const [focusedDgaCol, setFocusedDgaCol] = useState<number | null>(null);
  const [minRecentMatches, setMinRecentMatches] = useState<number>(0);
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

  useEffect(() => {
    fetchDraws({
      apiUrl: API_URL,
      minValidDraws: MIN_VALID_DRAWS,
      numMains: NUM_MAINS,
      mainMin: MAIN_MIN,
      mainMax: MAIN_MAX,
      setHistory,
      setTrace: setTraceMaybe,
      setHighlights,
      rng: getUniqueRandomNumbers,
      strictValidateDraws,
    });
  }, []);

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

  const activeWindowSize = filteredHistory.length;

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
    () => Array.from(new Set([...effectiveExcludedNumbers, ...sde1Exclusions, ...hc3Exclusions])),
    [effectiveExcludedNumbers, knobs.enableSDE1, knobs.enableHC3, filteredHistory]
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
  const [simSource, setSimSource] = useState<'none' | 'user' | 'candidate'>('none');
  const [simCandidateIdx, setSimCandidateIdx] = useState<number | null>(null);

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
    scrollToDGA();
  };

  const handleSimulatePickSixManual = (nums: number[]) => {
    if (nums.length !== 8 || nums.some((n) => !Number.isFinite(n))) return;
    const main = nums.slice(0, 6).sort((a, b) => a - b);
    const supp = nums.slice(6, 8).sort((a, b) => a - b);
    setSimulatedDraw({ main, supp, date: "PickSixManual", isSimulated: true } as any);
    setSimSource('user');
    setSimCandidateIdx(null);
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

  // Build DGA grid with a synthetic column only when simulatedDraw is set
  useEffect(() => {
    const draws = filteredHistory.length;
    if (draws < 2) {
      setDgaDiamonds([]); setDgaPredictions([]); setDgaGrid([]); setDgaDrawLabels([]);
      setNumberCounts([]); setMinCount(0); setMaxCount(0);
      setHighlightMsg("Insufficient valid draws for visualization.");
      return;
    }
    let grid = buildDrawGrid(filteredHistory, 45, draws).map((row) => [...row, 0]);
    let drawLabels = Array.from({ length: draws }, (_, i) => (i + 1).toString());
    drawLabels = [...drawLabels, (draws + 1).toString() + (simulatedDraw ? "*" : "")];
    if (simulatedDraw) {
      for (const n of simulatedDraw.main) if (n >= 1 && n <= 45) grid[n - 1][grid[0].length - 1] = 1;
      for (const n of simulatedDraw.supp) if (n >= 1 && n <= 45) grid[n - 1][grid[0].length - 1] = 2;
    }
    const diamonds = findDiamondsAllRadii(grid, 1, 4);
    const predictions = getPredictedNumbers(diamonds, grid[0].length - 1);
    setDgaGrid(grid); setDgaDiamonds(diamonds); setDgaPredictions(predictions); setDgaDrawLabels(drawLabels);

    const counts: number[] = Array(45).fill(0);
    filteredHistory.forEach((draw) => {
      draw.main.forEach((n) => (n >= 1 && n <= 45 ? counts[n - 1]++ : null));
      draw.supp.forEach((n) => (n >= 1 && n <= 45 ? counts[n - 1]++ : null));
    });
    setNumberCounts(counts);
    setMinCount(Math.min(...counts));
    setMaxCount(Math.max(...counts));
    setHighlightMsg("");
  }, [filteredHistory, simulatedDraw]);

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
      counts.undrawn >= acceptanceNeedsCounts.undrawn &&
      counts.times1 >= acceptanceNeedsCounts.times1 &&
      counts.times2 >= acceptanceNeedsCounts.times2 &&
      counts.times3 >= acceptanceNeedsCounts.times3 &&
      counts.times4 >= acceptanceNeedsCounts.times4 &&
      counts.times5 >= acceptanceNeedsCounts.times5 &&
      counts.times6 >= acceptanceNeedsCounts.times6 &&
      counts.times7 >= acceptanceNeedsCounts.times7 &&
      counts.times8 >= acceptanceNeedsCounts.times8
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
      if (acceptanceNeedsCounts[countKeys[i]] === 0) {
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
      ? Array.from(new Set([...effectiveExcludedNumbers, ...mianExcl]))
      : effectiveExcludedNumbers;
    if (mianExcl.length > 0) {
      setTraceMaybe((t) => [...t, `[TRACE] MiAN hard-exclude: removed ${mianExcl.length} numbers from zero-count buckets`]);
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
      div5Options: { requireOne: requireDiv5, maxAllowed: maxDiv5 },
      monthlyBucketOptions: serializeMonthlyBuckets(monthlyBucketOptions),
      attemptMultiplier,
      ogaSpokeCount,
    };

    // Trace callback: appends messages as they arrive from the worker
    const onTrace = (msg: string) => setTraceMaybe((t) => [...t, msg]);

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
          const ac = acceptanceNeedsCounts;
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
        `[TRACE] Generation: requested ${numCandidates}, pool ${poolSize} (overgen ${overgenFactor}×) → filtered ${poolBeforeSlice} → kept ${processedCandidates.length} (accepted ${st.accepted}/${st.totalAttempts} attempts, budget ${poolSize * attemptMultiplier}) in ${dt}ms; rejects — excl:${st.exclusions} sum:${st.sumRange} div5:${st.div5} oddEven:${st.oddEven} tricky:${st.tricky} repeat:${st.repeatUnion} recMin:${st.minRecent} recBias:${st.recentBias} trend:${st.trendRatio} pattern:${st.patternConstraint} ent:${st.entropy} ham:${st.hamming} jac:${st.jaccard} ogaBias:${st.ogaBias} monthly:${monthlyRejects} prize:${prizeRejects} cap:${capRejects}`,
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
      ? Array.from(new Set([...effectiveExcludedNumbers, ...mianExclBatch]))
      : effectiveExcludedNumbers;
    if (mianExclBatch.length > 0) {
      setTraceMaybe((t) => [...t, `[TRACE] MiAN hard-exclude: removed ${mianExclBatch.length} numbers from zero-count buckets`]);
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
      {
        requireOne: requireDiv5,
        maxAllowed: maxDiv5,
      },
      monthlyBucketOptions,
      attemptMultiplier,
      ogaSpokeCount
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
        const ac = acceptanceNeedsCounts;
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
    const msg = `[TRACE] ${traceLabel}: requested ${target}, kept ${processed.length} (accepted ${st.accepted}/${st.totalAttempts}) in ${dt}ms; rejects — excl:${st.exclusions} sum:${st.sumRange} div5:${st.div5} oddEven:${st.oddEven} tricky:${st.tricky} repeat:${st.repeatUnion} recMin:${st.minRecent} recBias:${st.recentBias} trend:${st.trendRatio} pattern:${st.patternConstraint} ent:${st.entropy} ham:${st.hamming} jac:${st.jaccard} ogaBias:${st.ogaBias} monthly:${monthlyRejects} prize:${prizeRejects} cap:${capRejects}`;
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
        if (validDraws.length >= MIN_VALID_DRAWS) {
          const isNewestFirst = new Date(validDraws[0].date) > new Date(validDraws[validDraws.length - 1].date);
          const ordered = isNewestFirst ? validDraws.slice().reverse() : validDraws.slice();
          setHistory(ordered);
          setHighlights([]);
          setTrace((t) => [...t, `[TRACE] Imported ${validDraws.length} valid draws from file.`]);
        } else {
          setTrace((t) => [...t, `[TRACE] Imported file has insufficient valid draws (${validDraws.length}).`]);
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
      </h2>

      {/* [ORDER-ANCHOR] 01 Number Trends Table */}
      <CollapsibleSection title={<b>Number Trends Table</b>} summaryHint="Click a number to mark for forced inclusion" defaultOpen={false}>
        <NumberTrendsTable trends={numberTrends} onToggle={(n) => setTrendSelectedNumbers(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n])} selected={trendSelectedNumbers} />
        <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
          Colored rows indicate numbers you have selected for forced inclusion.
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 02 Phase 0: Draw History */}
      <CollapsibleSection title={<b>Phase 0: Draw History ({history.length} draws)</b>} defaultOpen={false}>
        {/* In-app CSV updater */}
        <DrawHistoryManager
          csvPathHint="file:///Users/admin/Weekly_Windfall/windfall-app-clean/windfall_history_lottolyzer.csv"
          mainCount={6}
          suppCount={2}
          minNumber={1}
          maxNumber={45}
          onDrawsUpdated={(rows) => {
            const ordered = rowsToDraws(rows);
            setHistory(ordered);
            setHighlights([]);
            setTrace(t => [...t, `[TRACE] Added/updated draw via CSV panel. History now ${ordered.length} draws.`]);
          }}
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
                setHistory,
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
              type="checkbox"
              checked={useTrickyRule}
              onChange={() => setUseTrickyRule(prev => !prev)}
              disabled={selectedRatios.length > 0}
              style={{ marginRight: 6 }}
            />
            Apply Tricky Rule
          </label>
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
                  const checked = effectiveExcludedNumbers.includes(n);
                  return (
                    <label
                      key={n}
                      style={{
                        display: "inline-flex",
                        flexDirection: "column",
                        alignItems: "center",
                        minWidth: 28,
                      }}
                      title={`Exclude ${n}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setExcludedNumbers((prev) =>
                            prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
                          );
                        }}
                      />
                      <span style={{ fontSize: 11, marginTop: 2 }}>{n}</span>
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
      <CollapsibleSection title={<b>Monthly 4th-Draw Overlap</b>} defaultOpen={false} summaryHint="4th draw vs first 3 each month">
        <MonthlyOverlapPanel history={history} />
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
            forcedNumbers={trendSelectedNumbers}   // pass forced (trend) picks here
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
            ogaRefScores={pastOGAScoresRef}
            ogaSpokeCount={ogaSpokeCount}
            attemptMultiplier={attemptMultiplier}
            onAttemptMultiplierChange={setAttemptMultiplier}
            overgenFactor={overgenFactor}
            onOvergenFactorChange={setOvergenFactor}
            rdyWeights={rdyWeights}
            enableOGA={knobs.enableOGA}
          />

          {/* Candidate Generation Influences moved here */}
          <CollapsibleSection title={<b>Candidate Generation Influences</b>} summaryHint="Toggle filters and boosts that affect generation" defaultOpen={true}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(260px, 1fr))", gap: 12 }}>
              {/* Column 1: Core Filters */}
              <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 10 }}>
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

                <div style={{ marginTop: 8 }}>
                  <label title="Require at least one number divisible by 5">
                    <input type="checkbox" checked={requireDiv5} onChange={(e) => setRequireDiv5(e.target.checked)} style={{ marginRight: 6 }} />
                    Must include a multiple of 5
                  </label>
                  <div style={{ marginLeft: 18, marginTop: 4 }}>
                    <label title="Reject if more than this many numbers are divisible by 5">
                      Max multiples of 5:
                      <input type="number" min={0} max={8} value={maxDiv5} onChange={(e) => setMaxDiv5(Number(e.target.value))} style={{ width: 70, marginLeft: 6 }} />
                    </label>
                  </div>
                </div>

                <div style={{ marginTop: 8 }}>
                  <label title="Require generated candidates to include a minimum number of numbers from each monthly frequency bucket">
                    <input type="checkbox" checked={acceptanceNeedsEnabled} onChange={(e) => setAcceptanceNeedsEnabled(e.target.checked)} style={{ marginRight: 6 }} />
                    Must include from Acceptance needs
                  </label>
                  {acceptanceNeedsEnabled && (
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
                      ]).map((item) => (
                        <label key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3 }}>
                          {item.label}:
                          <input
                            type="number"
                            min={0}
                            max={8}
                            value={acceptanceNeedsCounts[item.key]}
                            onChange={(e) => setAcceptanceNeedsCounts(prev => ({ ...prev, [item.key]: Math.max(0, Number(e.target.value) || 0) }))}
                            style={{ width: 50 }}
                          />
                        </label>
                      ))}
                    </div>
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
                        <option value="all">All History</option>
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

              {/* Column 3: Readiness Scoring */}
              <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Readiness (Rdy) Scoring</div>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 10, lineHeight: 1.5 }}>
                  The <b>Rdy</b> column in Generated Candidates ranks each candidate by a weighted composite of three signals.
                  Use these sliders to emphasise the factors most important to your strategy. Weights are normalised (they always sum to 100%).
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", marginBottom: 2, fontSize: 12 }} title="Ideal Draw Match: How closely the candidate's bucket composition (0x, 1x, 2x…) matches the statistically optimal draw from the Ideal draw row in Monthly Draws Summary. High IDM = numbers drawn from the right frequency buckets.">
                    <b>IDM</b> — Ideal Draw Match: <b>{Math.round(rdyWeights.idm / (rdyWeights.idm + rdyWeights.conv + rdyWeights.oga || 1) * 100)}%</b>
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
              </div>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: "#555" }}>
              <b>Provenance:</b> Window={filteredHistory.length}; Entropy={entropyEnabled ? entropyThreshold : "off"}; Hamming={hammingEnabled ? hammingThreshold : "off"}; Jaccard={jaccardEnabled ? jaccardThreshold : "off"}; Tricky={useTrickyRule ? "on" : "off"}; Ratios={selectedRatios.length ? selectedRatios.join(" ") : "none"}; RecMin={minRecentMatches}; RecBias={recentMatchBias}; Repeat W={repeatWindowSizeW} M={minFromRecentUnionM}; GPWF={gpwfEnabled ? "on" : "off"}; λ={lambdaEnabled ? lambda.toFixed(2) : "off"}; Sum={sumFilter.enabled ? `${sumFilter.min}–${sumFilter.max}${sumFilter.includeSupp ? "+supp" : ""}` : "off"}; PatternMode={patternConstraintMode} Tol={patternSumTolerance} Boost={patternBoostFactor}; OGABias={enableOGAForecastBias ? `${ogaPreferredBand} @ ${ogaBaselineMode}` : "off"}; Div5={requireDiv5 ? `min1 max${maxDiv5}` : "off"}
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
            <div style={{ position: "relative", width: "100%" }}>
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
              />
              {/* Vertical user exclusions aligned to rows for DGA grid; placed at right edge near last column including simulation column */}
              <div style={{ position: "absolute", right: 0, top: 0, paddingLeft: 8 }}>
                <UserExclusionsStrip
                  title={undefined}
                  excludedNumbers={effectiveExcludedNumbers}
                  setExcludedNumbers={setExcludedNumbers as any}
                  orientation="vertical"
                  labelPosition="right"
                  cellSize={DGA_CELL_SIZE}
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
      requireDiv5,
      maxDiv5,
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
    setRequireDiv5(s.requireDiv5 ?? false);
    setMaxDiv5(s.maxDiv5 ?? 8);
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
    setRdyWeights(s.rdyWeights ?? { idm: 0.50, conv: 0.30, oga: 0.20 });
  }
}

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
}
const UserExclusionsStrip: React.FC<UserExclusionsStripProps> = ({
  excludedNumbers, setExcludedNumbers, title, orientation = "horizontal", labelPosition = "bottom", showClearButton = false, cellSize,
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
          const handleToggle = () => {
            setExcludedNumbers((prev) =>
              prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
            );
          };
          if (labelPosition === "bottom") {
            return (
              <label key={n} style={{ ...labelStyleColumnBase, ...sizeStyles }} title={`Exclude ${n}`}>
                <input type="checkbox" checked={checked} onChange={handleToggle} style={{ margin: 0 }} />
                <span style={{ fontSize: 11, marginTop: 2, lineHeight: "normal" }}>{n}</span>
              </label>
            );
          } else {
            return (
              <label key={n} style={{ ...labelStyleRowBase, ...sizeStyles }} title={`Exclude ${n}`}>
                <input type="checkbox" checked={checked} onChange={handleToggle} style={{ margin: 0 }} />
                <span style={{ fontSize: 11, lineHeight: "normal" }}>{n}</span>
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

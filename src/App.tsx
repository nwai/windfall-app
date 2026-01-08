// NOTE: Step-3 consolidated updates and fixes:
// - Pass only user exclusions to generator (fix trace "User excluded").
// - WFMQY: add user exclusion checkboxes (1–45) in a single horizontal line.
// - Unified status badges (adds OGA + core threshold switches).
// - Lambda enable/disable toggle (disables slider when off, reflected in badges/trace).
// - Trace: append a concise block for factors affecting generation.
//
// Keep existing imports; removed unused ones previously.
import React, { useState, useRef, useEffect, useMemo } from "react";
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
import { RankingWeightsPanel } from "./components/RankingWeightsPanel";
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
import { ModulationDiagnosticsPanel } from "./components/ModulationDiagnosticsPanel";
import { SelectionInsightsPanel } from "./components/SelectionInsightsPanel";
import { CollapsibleSection } from "./components/shared/CollapsibleSection";
import { NextDrawProbabilitiesPanel } from "./components/NextDrawProbabilitiesPanel";
import { forecastOGA } from "./lib/ogaForecast";
import { MostLikelyNotDrawnPanel } from "./components/MostLikelyNotDrawnPanel";
import { NextHotBlocksPanel } from "./components/NextHotBlocksPanel";


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

const defaultKnobs: Knobs = {
  enableSDE1: true,
  enableHC3: true,
  enableOGA: true,
  enableGPWF: true,
  enableEntropy: true,
  enableHamming: true,
  enableJaccard: true,
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

  const [rankingWeights, setRankingWeights] = useState({ oga: 0.7, sel: 0.2, recent: 0.1 });
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

  // Sum range filter state used in Candidate Generation Influences
  const [sumFilter, setSumFilter] = useState<{ enabled: boolean; min: number; max: number; includeSupp: boolean }>({
    enabled: false,
    min: 0,
    max: 0,
    includeSupp: true,
  });

  const [lambdaEnabled, setLambdaEnabled] = useState<boolean>(true);
  const [lambda, setLambda] = useState<number>(0.85);

  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [candidates, setCandidates] = useState<CandidateSet[]>([]);
  const [ratioSummary, setRatioSummary] = useState<any>(null);
  const [quotaWarning, setQuotaWarning] = useState<string | undefined>(undefined);
  const [trace, setTrace] = useState<string[]>([]);
  // Trace verbosity toggle (default ON)
  const [traceVerbose, setTraceVerbose] = useState<boolean>(true);
  // Conditional trace dispatcher passed to helpers
  const setTraceMaybe: React.Dispatch<React.SetStateAction<string[]>> = (updater) => {
    if (!traceVerbose) return;
    // Forward either function or direct array value
    // @ts-ignore
    setTrace(updater);
  };
  const [numCandidates, setNumCandidates] = useState<number>(8);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [octagonalTop, setOctagonalTop] = useState<number>(defaultKnobs.octagonal_top);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dgaGrid, setDgaGrid] = useState<number[][]>([]);
  const [dgaDiamonds, setDgaDiamonds] = useState<any[]>([]);
  const [dgaPredictions, setDgaPredictions] = useState<number[]>([]);
  const [dgaDrawLabels, setDgaDrawLabels] = useState<string[]>([]);
  const [numberCounts, setNumberCounts] = useState<number[]>([]);
  const [minCount, setMinCount] = useState<number>(0);
  const [maxCount, setMaxCount] = useState<number>(0);
  const [minRecentMatches, setMinRecentMatches] = useState<number>(0);
  const [recentMatchBias, setRecentMatchBias] = useState<number>(0);
  const [highlightMsg, setHighlightMsg] = useState<string>("");
  const [highlights, setHighlights] = useState<any[]>([]);

  const [excludedNumbers, setExcludedNumbers] = useState<number[]>([]);
  const [ratioOptions, setRatioOptions] = useState<{ ratio: string; count: number; percent: number }[]>([]);
  const [selectedRatios, setSelectedRatios] = useState<string[]>([]);
  const [useTrickyRule, setUseTrickyRule] = useState<boolean>(false);
  const [trendSelectedNumbers, setTrendSelectedNumbers] = useState<number[]>([]);
  const [focusNumber, setFocusNumber] = useState<number | null>(null);
  const [showHeatmapLetters, setShowHeatmapLetters] = useState(false);
  const [tempMetric, setTempMetric] = useState<"ema" | "recency" | "hybrid">("hybrid");
  const [repeatWindowSizeW, setRepeatWindowSizeW] = useState<number>(12);
  const [minFromRecentUnionM, setMinFromRecentUnionM] = useState<number>(0);
  const [userSelectedNumbers, setUserSelectedNumbers] = useState<number[]>([]);
  const [presets, setPresets] = useState<AppPreset[]>(() => listPresets());
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [newPresetName, setNewPresetName] = useState<string>("");
  const [zpaReloadKey, setZpaReloadKey] = useState<number>(0);
  const [selectedWindowPatterns, setSelectedWindowPatterns] = useState<WindowPattern[]>([]);
  const [patternConstraintMode, setPatternConstraintMode] = useState<'boost' | 'restrict'>('boost');
  const [patternBoostFactor, setPatternBoostFactor] = useState<number>(0.15);
  const [patternSumTolerance, setPatternSumTolerance] = useState<number>(0);

  // NEW: OGA bias UI state
  const [enableOGAForecastBias, setEnableOGAForecastBias] = useState<boolean>(false);
  const [ogaBaselineMode, setOGABaselineMode] = useState<"window" | "all">("window");
  const [ogaPreferredBand, setOGAPreferredBand] = useState<"auto" | "low" | "mid" | "high">("auto");
  const [ogaPreferredDeciles, setOGAPreferredDeciles] = useState<{ index: number; weight: number }[]>([]);

  const { zoneGamma, setZoneGamma } = useZPASettings();

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
    () => Array.from(new Set([...excludedNumbers, ...sde1Exclusions, ...hc3Exclusions])),
    [excludedNumbers, knobs.enableSDE1, knobs.enableHC3, filteredHistory]
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

  // Manual simulation
  const [manualSimSelected, setManualSimSelected] = useState<number[]>([]);
  const manualSimDraw = useMemo(() => {
    if (!manualSimSelected.length) return null;
    const capped = manualSimSelected.slice(0, 8);
    const main = capped.slice(0, 6).sort((a, b) => a - b);
    const supp = capped.slice(6, 8).sort((a, b) => a - b);
    return { main, supp, date: "ManualSim", isSimulated: true } as any;
  }, [manualSimSelected]);

  const handleManualSimChanged = (next?: number[]) => {
    // We don't need next here because GeneratedCandidatesPanel already passes it
    // This callback is used to ensure DGA sim column is cleared when manual sim changes
    setSimulatedDraw(null); // clear DGA synthetic column
  };

  const activeSimulatedDraw = manualSimDraw || simulatedDraw;
  // Heatmap overlay only from manual checkboxes (manualSimSelected)
  const overlayNumbers = useMemo(() => {
    if (manualSimSelected.length) return manualSimSelected.slice(0, 8);
    return [];
  }, [manualSimSelected]);
  
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

  const pastOGAScores = useMemo(
    () =>
      filteredHistory.map((draw, idx, arr) =>
        computeOGA([...draw.main, ...draw.supp], arr.slice(0, idx) || [])
      ),
    [filteredHistory]
  );

  // Reference mode for OGA percentiles and histogram
  const [ogaRefMode, setOgaRefMode] = useState<"window" | "all">("window");

  // Windowed reference distribution computed against current window baseline
  const pastOGAScoresRefWindow = useMemo(
    () => filteredHistory.map((draw) => computeOGA([...draw.main, ...draw.supp], filteredHistory)),
    [filteredHistory]
  );
  // Full-history reference distribution computed against full history baseline
  const pastOGAScoresRefAll = useMemo(
    () => history.map((draw) => computeOGA([...draw.main, ...draw.supp], history)),
    [history]
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
        const ogaScore = c.ogaScore ?? computeOGA(nums, filteredHistory);
        const ogaPercentile = c.ogaPercentile ?? getOGAPercentile(ogaScore, pastOGAScores);
        const selHits = nums.filter(n => selectedSet.has(n)).length;
        const recentHits = recentSet ? nums.filter(n => recentSet.has(n)).length : 0;
        const ogaNorm = Math.max(0, Math.min(1, ogaPercentile / 100));
        const finalComposite = wOGA * ogaNorm + wSel * (selHits / 8) + wRecent * (recentHits / 8);
        return { ...c, ogaScore, ogaPercentile, selHits, recentHits, finalCompositeAdj: finalComposite };
      })
      .sort((a: any, b: any) => {
        if (applySelBoost) {
          if (b.selHits !== a.selHits) return b.selHits - a.selHits;
          if (b.recentHits !== a.recentHits) return b.recentHits - a.recentHits;
          if (b.ogaPercentile !== a.ogaPercentile) return b.ogaPercentile - a.ogaPercentile;
          return b.finalCompositeAdj - a.finalCompositeAdj;
        }
        if (b.finalCompositeAdj !== a.finalCompositeAdj) return b.finalCompositeAdj - a.finalCompositeAdj;
        if (b.recentHits !== a.recentHits) return b.recentHits - a.recentHits;
        if (b.ogaPercentile !== a.ogaPercentile) return b.ogaPercentile - a.ogaPercentile;
        return 0;
      });
  }

  useEffect(() => {
    setCandidates(prev => recomputeCompositeRanking(prev));
  }, [rankingWeights, userSelectedNumbers, filteredHistory, pastOGAScores]);

  useEffect(() => {
    if (!candidates.length || !filteredHistory.length) return;
    setCandidates((prev) =>
      prev.map((c) => {
        const nums = [...c.main, ...c.supp];
        const score = computeOGA(nums, filteredHistory);
        const percentile = getOGAPercentile(score, pastOGAScores);
        return { ...c, ogaScore: score, ogaPercentile: percentile };
      })
    );
  }, [candidates, pastOGAScores, filteredHistory]);

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
    const ogaStats = forecastOGA(filteredHistory, baselineForOGAForecast);

    // Route traces through the verbose-aware dispatcher
    const traceDispatch: React.Dispatch<React.SetStateAction<string[]>> = setTraceMaybe;

    const t0 = performance.now();
    const result = generateCandidates(
      numCandidates,
      filteredHistory,
      effectiveKnobsForGen,
      traceDispatch,
      excludedNumbers,
      selectedRatios,
      useTrickyRule,
      0, // minOGAPercentile not used here
      pastOGAScores as any,
      trendSelectedNumbers,
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
      }
    );

    let processedCandidates = [...result.candidates];
    processedCandidates = recomputeCompositeRanking(processedCandidates);
    processedCandidates = processedCandidates.filter(withinSumRange);

    setCandidates(processedCandidates);
    setRatioSummary(result.ratioSummary);
    setQuotaWarning(result.quotaWarning);
    setSelectedCandidateIdx(0);

    const dt = Math.round(performance.now() - t0);
    const st = result.rejectionStats;
    setTraceMaybe((t) => [
      ...t,
      `[TRACE] Generation: requested ${numCandidates}, generated ${processedCandidates.length} (accepted ${st.accepted}/${st.totalAttempts} attempts) in ${dt}ms; rejects — ent:${st.entropy} ham:${st.hamming} jac:${st.jaccard} oddEven:${st.oddEven} tricky:${st.tricky} recMin:${st.minRecent} recBias:${st.recentBias} repeat:${st.repeatUnion} trend:${st.trendRatio} sum:${st.sumRange} pattern:${st.patternConstraint} ogaBias:${st.ogaBias} excl:${st.exclusions}`,
    ]);

    setIsGenerating(false);
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
  };

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
      <CollapsibleSection title={<b>Number Trends Table</b>} summaryHint="Click a number to mark for forced inclusion" defaultOpen={true}>
        <NumberTrendsTable trends={numberTrends} onToggle={(n) => setTrendSelectedNumbers(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n])} selected={trendSelectedNumbers} />
        <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
          Colored rows indicate numbers you have selected for forced inclusion.
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 02 Phase 0: Draw History */}
      <CollapsibleSection title={<b>Phase 0: Draw History ({history.length} draws)</b>} defaultOpen={true}>
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
  const oga = pastOGAScores[idx] ?? null;
  return `${d.date}: [${d.main.join(", ")}] | Sup: [${d.supp.join(", ")}]${oga !== null ? ` | OGA=${oga.toFixed(2)}` : ""}`;
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
      <CollapsibleSection title={<b>Next Draw Probabilities</b>} defaultOpen={true}>
        <NextDrawProbabilitiesPanel history={filteredHistory} allHistory={history} title={`Next Draw Probabilities (${historyWindowName})`} />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 03 Odd/Even Ratio Filters */}
      <CollapsibleSection title={<b>Odd/Even Ratio Filters</b>} summaryHint="Select one or more ratios, or use Tricky Rule" defaultOpen={true}>
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
      <CollapsibleSection title={<b>Windowed Draw Filtering (WFMQYH)</b>} defaultOpen={true}>
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
                <label style={{ marginRight: 12 }}>
                  <input type="checkbox" checked={knobs.enableSDE1} onChange={(e) => setKnobs((prev) => ({ ...prev, enableSDE1: e.target.checked }))} style={{ marginRight: 6 }} />
                  SDE1
                </label>
                <label style={{ marginRight: 12 }}>
                  <input type="checkbox" checked={knobs.enableHC3} onChange={(e) => setKnobs((prev) => ({ ...prev, enableHC3: e.target.checked }))} style={{ marginRight: 6 }} />
                  HC3
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
                  marginTop: 6
                }}
              >
                {Array.from({ length: 45 }, (_, i) => i + 1).map((n) => {
                  const checked = excludedNumbers.includes(n);
                  return (
                    <label
                      key={n}
                      style={{
                        display: "inline-flex",
                        flexDirection: "column",
                        alignItems: "center",
                        minWidth: 28
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
            </div>
          </>
        ))()}
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 05 Survival Analyzer */}
      <CollapsibleSection title={<b>Survival Analyzer</b>} defaultOpen={true}>
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
      <CollapsibleSection title={<b>Temperature Transition</b>} defaultOpen={true}>
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
      <CollapsibleSection title={<b>Monte Carlo Analyzer</b>} defaultOpen={true}>
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
      <CollapsibleSection title={<b>Most Likely NOT Drawn</b>} defaultOpen={true}>
        <MostLikelyNotDrawnPanel history={filteredHistory} title="Most Likely NOT Drawn" />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 08 Trend Ratio History */}
      <CollapsibleSection title={<b>Trend Ratio History</b>} defaultOpen={true}>
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
      <CollapsibleSection title={<b>Group Pattern Analyzer</b>} defaultOpen={true}>
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

      {/* [ORDER-ANCHOR] 12 Window Stats (Low/Mid/High, Even/Odd, Sum) */}
      <CollapsibleSection title={<b>Window Stats (Low/Mid/High, Even/Odd, Sum)</b>} summaryHint="WFMQY" defaultOpen={true}>
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
      <CollapsibleSection title={<b>Target Set Quick Stats</b>} defaultOpen={true}>
        <TargetSetQuickStatsPanel forcedNumbers={trendSelectedNumbers} selectedNumbers={userSelectedNumbers} />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 14 Advanced Survival Analysis & Churn/Return Prediction Models */}
      <CollapsibleSection title={<b>Advanced Survival Analysis & Churn/Return Prediction Models</b>} defaultOpen={true}>
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
        <div style={{ margin: "6px 0 10px 0", fontSize: 13 }}>
          <label>
            <input type="checkbox" checked={lambdaEnabled} onChange={(e) => setLambdaEnabled(e.target.checked)} style={{ marginRight: 6 }} />
            Enable Lambda (Recency Weight)
          </label>
        </div>
        <OperatorsPanel
          entropy={entropyThreshold} setEntropy={setEntropyThreshold}
          entropyEnabled={entropyEnabled} setEntropyEnabled={setEntropyEnabled}
          hamming={hammingThreshold} setHamming={setHammingThreshold}
          hammingEnabled={hammingEnabled} setHammingEnabled={setHammingEnabled}
          jaccard={jaccardThreshold} setJaccard={setJaccardThreshold}
          jaccardEnabled={jaccardEnabled} setJaccardEnabled={setJaccardEnabled}
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
      <CollapsibleSection title={<b>State Presets</b>} summaryHint="Save and recall all current options" defaultOpen={true}>
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
      <CollapsibleSection title={<b>Trend Ratio Filter (UP / DOWN / FLAT)</b>} defaultOpen={true}>
        <div style={{ marginTop: 6, fontSize: 11, color: "#555" }}>
          Configure trend ratio filters in dedicated panel (omitted for brevity).
        </div>
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 18 Parameter Search */}
      <CollapsibleSection title={<b>Parameter Search</b>} defaultOpen={true}>
        <ParameterSearchPanel
          userSelectedNumbers={userSelectedNumbers}
          weightedTargets={weightedTargets}
          forcedNumbers={trendSelectedNumbers}
          excludedNumbers={excludedNumbers}
          recentSignal={temperatureSignal}
          conditionalProb={conditionalProb}
          onAdoptParameters={p => setBatesParams(p)}
          onProbabilityUpdate={p => setProbOverlay(p)}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 19 Bates Weighting Panel */}
      <CollapsibleSection title={<b>Bates Weighting Panel</b>} defaultOpen={true}>
        <BatesPanel
          excludedNumbers={excludedNumbers}
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
      <CollapsibleSection title={<b>Weighted Target List</b>} defaultOpen={true}>
        <WeightedTargetListPanel userSelectedNumbers={userSelectedNumbers} weightedTargets={weightedTargets} setWeightedTargets={setWeightedTargets} />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 21 Modulation Diagnostics */}
      <CollapsibleSection title={<b>Modulation Diagnostics</b>} defaultOpen={true}>
        <ModulationDiagnosticsPanel diagnostics={null} currentBatesParams={batesParams as any} />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 22 User Selected Numbers */}
      <CollapsibleSection title={<b>User Selected Numbers</b>} defaultOpen={true}>
        <UserSelectedNumbersPanel
          userSelectedNumbers={userSelectedNumbers}
          setUserSelectedNumbers={setUserSelectedNumbers}
          onSimulate={(nums) => {
            // If insufficient selection, clear any existing simulation
            if (!nums || nums.length < 6) {
              setSimulatedDraw(null);
              setManualSimSelected([]);
              return;
            }
            // Apply manual simulation from user selections; clear DGA synthetic draw to avoid dual overlay
            setSimulatedDraw(null);
            setManualSimSelected(nums.slice(0, 8));
          }}
          onClear={() => {
            // Clear DGA synthetic column and manual overlay
            setSimulatedDraw(null);
            setManualSimSelected([]);
          }}
          isSimulatingUser={(() => {
            const a = manualSimSelected.slice(0, 8);
            const b = userSelectedNumbers.slice(0, 8);
            if (a.length !== b.length) return false;
            const sa = a.slice().sort((x,y)=>x-y);
            const sb = b.slice().sort((x,y)=>x-y);
            for (let i=0;i<sa.length;i++) if (sa[i] !== sb[i]) return false;
            return sa.length >= 6;
          })()}
        />
      </CollapsibleSection>

      {/* [ORDER-ANCHOR] 23 Selection Insights */}
      <CollapsibleSection title={<b>Selection Insights</b>} defaultOpen={true}>
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
          </div>

          <RankingWeightsPanel weights={rankingWeights} setWeights={setRankingWeights} />

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
                    const dec = forecastOGA(filteredHistory, ogaBaselineMode === 'window' ? filteredHistory : history).deciles;
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

              {/* Column 3: Biases & Pattern Constraints (restored) */}
              <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Biases & Pattern Constraints</div>
                <label style={{ display: 'block', marginBottom: 6 }}>
                  <input type="checkbox" checked={patternConstraintMode === 'restrict'} onChange={(e) => setPatternConstraintMode(e.target.checked ? 'restrict' : 'boost')} style={{ marginRight: 6 }} />
                  Restrict to selected patterns (otherwise Boost in ranking)
                </label>
                <label style={{ display: 'block', marginBottom: 6 }}>
                  Sum tolerance:
                  <input type="number" value={patternSumTolerance} onChange={(e) => setPatternSumTolerance(Number(e.target.value))} style={{ marginLeft: 6, width: 80 }} />
                </label>
                <label style={{ display: 'block', marginBottom: 6 }}>
                  Boost factor:
                  <input type="number" step={0.05} value={patternBoostFactor} onChange={(e) => setPatternBoostFactor(Number(e.target.value))} style={{ marginLeft: 6, width: 80 }} />
                </label>
                <div style={{ fontSize: 11, color: '#888' }}>Pattern constraints use the selections from Window Stats. Restrict filters during generation; Boost increases ranking weight post-generation.</div>
              </div>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: "#555" }}>
              <b>Provenance:</b> Window={filteredHistory.length}; Entropy={entropyEnabled ? entropyThreshold : "off"}; Hamming={hammingEnabled ? hammingThreshold : "off"}; Jaccard={jaccardEnabled ? jaccardThreshold : "off"}; Tricky={useTrickyRule ? "on" : "off"}; Ratios={selectedRatios.length ? selectedRatios.join(" ") : "none"}; RecMin={minRecentMatches}; RecBias={recentMatchBias}; Repeat W={repeatWindowSizeW} M={minFromRecentUnionM}; GPWF={gpwfEnabled ? "on" : "off"}; λ={lambdaEnabled ? lambda.toFixed(2) : "off"}; Sum={sumFilter.enabled ? `${sumFilter.min}–${sumFilter.max}${sumFilter.includeSupp ? "+supp" : ""}` : "off"}; PatternMode={patternConstraintMode} Tol={patternSumTolerance} Boost={patternBoostFactor}; OGABias={enableOGAForecastBias ? `${ogaPreferredBand} @ ${ogaBaselineMode}` : "off"}
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
                    Count: {excludedNumbers.length}
                  </div>
                  <div>
                    List: {excludedNumbers.length ? excludedNumbers.slice().sort((a,b)=>a-b).join(", ") : "— none —"}
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

          <div style={{ width: "100%", marginBottom: 18 }}>
            <OGAHistogram
              ogaScores={pastOGAScoresRef}
              candidateOGA={(currentCandidate as any)?.ogaScore}
              candidatePercentile={(currentCandidate as any)?.ogaPercentile}
            />
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
              excludedNumbers={excludedNumbers}
              setExcludedNumbers={setExcludedNumbers}
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
            <DroughtHazardPanel history={filteredHistory} top={8} title="Most likely to break a drought next draw" />
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
                  excludedNumbers={excludedNumbers}
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
              />
              {/* Vertical user exclusions aligned to rows for DGA grid; placed at right edge near last column including simulation column */}
              <div style={{ position: "absolute", right: 0, top: 0, paddingLeft: 8 }}>
                <UserExclusionsStrip
                  title={undefined}
                  excludedNumbers={excludedNumbers}
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
    setRankingWeights(s.rankingWeights);
    setWeightedTargets(s.weightedTargets);
    setApplyZoneBias(s.applyZoneBias);
    setZoneGamma(s.zoneGamma);
    try {
      if (s.zpa?.groups) setSavedGroups(s.zpa.groups);
      if (s.zpa?.selectedZones) setSavedSelectedZones(s.zpa.selectedZones);
      if (s.zpa?.normalizeMode) setSavedNormalizeMode(s.zpa.normalizeMode);
      setZpaReloadKey(k => k + 1);
    } catch {}
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

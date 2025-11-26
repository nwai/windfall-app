// NOTE: Step-3 consolidated updates and fixes:
// - Pass only user exclusions to generator (fix trace "User excluded").
// - WFMQY: add user exclusion checkboxes (1–45) in a single horizontal line.
// - Unified status badges (adds OGA + core threshold switches).
// - Lambda enable/disable toggle (disables slider when off, reflected in badges/trace).
// - Trace: append a concise block for factors affecting generation.
//
// Keep existing imports; removed unused ones previously.
import React, { useState, useRef, useEffect, useMemo } from "react";
import { OperatorsPanel } from "./components/OperatorsPanel";
import { NumberTrendsTable, NumberTrend } from "./components/NumberTrendsTable";
import { entropy, minHamming, maxJaccard } from "./analytics";
import { fetchDraws } from './lib/fetchDraws';
import { getUniqueRandomNumbers } from './lib/random';
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
import { MonteCarloPanel } from "./components/candidates/MonteCarloPanel";
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
import { computeTrendMap, trendRatioTag, TrendClass } from "./lib/trend";
import { generateCandidates } from "./generateCandidates";
import { ModulationDiagnosticsPanel } from "./components/ModulationDiagnosticsPanel";
import { BatesDiagnostics } from "./lib/batesDiagnostics";
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
import { getSavedZoneWeights } from "./lib/zpaStorage";
import { WindowStatsPanel } from "./components/WindowStatsPanel";
import { ZPASettingsProvider, useZPASettings } from "./context/ZPASettingsContext";
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
import {
  getSavedGroups,
  setSavedGroups,
  getSavedSelectedZones,
  setSavedSelectedZones,
  getSavedNormalizeMode,
  setSavedNormalizeMode,
} from "./lib/zpaStorage";
import type { WindowPattern } from "./components/WindowStatsPanel";
import { generateCandidates } from "./generateCandidates";
import { ModulationDiagnosticsPanel } from "./components/ModulationDiagnosticsPanel";

const custom: ZoneGroups = [
  [1,2,3,4,5],
  [6,7,8,9,10],
  [11,12,13,14,15],
  [16,17,18,19,20],
  [21,22,23,24,25],
  [26,27,28,29,30],
  [31,32,33,34,35],
  [36,37,38,39,40],
  [41,42,43,44,45],
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

// Count draws safely (works even if filteredHistory is temporarily undefined)
const totalDraws = filteredHistory?.length ?? 0;


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

function getNumberFrequencies(history: Draw[]): Map<number, number> {
  const freq = new Map<number, number>();
  for (const draw of history) {
    for (const n of [...draw.main, ...draw.supp]) {
      freq.set(n, (freq.get(n) || 0) + 1);
    }
  }
  return freq;
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
function computeOddEvenRatios(
  history: Draw[]
): { ratio: string; count: number; percent: number }[] {
  const ratioCount = new Map<string, number>();
  let total = 0;
  for (const draw of history) {
    const nums = [...draw.main, ...draw.supp];
    const ratio = getOddEvenRatio(nums);
    ratioCount.set(ratio, (ratioCount.get(ratio) || 0) + 1);
    total += 1;
  }
  return Array.from(ratioCount.entries())
    .map(([ratio, count]) => ({
      ratio,
      count,
      percent: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count || a.ratio.localeCompare(b.ratio));
}
function getOddEvenRatio(nums: number[]): string {
  const odd = nums.filter((n) => n % 2 === 1).length;
  const even = nums.length - odd;
  return `${odd}:${even}`;
}
// Trace formatter (append per-candidate analytics)
function traceFormat(
  history: Draw[],
  effectiveKnobs: Knobs, // IMPORTANT: pass the effective flags/values you actually used for generation
  candidates: CandidateSet[],
  flags: {
    enableOGA: boolean;
    entropyEnabled: boolean;
    hammingEnabled: boolean;
    jaccardEnabled: boolean;
    gpwfEnabled: boolean;
    lambdaEnabled: boolean;
  }
): string {
  const last = history[history.length - 1];

  const header = [
    "[TRACE START]",
    `History size: ${history.length} draws`,
    // Show EFFECTIVE flags actually used for generation (not the raw defaults)
    `Effective Flags: OGA=${flags.enableOGA ? "on" : "off"}, Entropy=${flags.entropyEnabled ? "on" : "off"}, Hamming=${flags.hammingEnabled ? "on" : "off"}, Jaccard=${flags.jaccardEnabled ? "on" : "off"}, GPWF=${flags.gpwfEnabled ? "on" : "off"}, Lambda=${flags.lambdaEnabled ? "on" : "off"}`,
    // Also show the effective knobs you used
    `Effective Knobs: ${Object.entries(effectiveKnobs).map(([k, v]) => `${k}=${v}`).join(", ")}`,
  ];

  const perCandidate: string[] = candidates.map((c, idx) => {
    const nums = [...c.main, ...c.supp];

    // Always compute scores for visibility
    const ent = entropy(c).toFixed(3);
    const ham = minHamming(c, history);
    const jac = maxJaccard(c, history).toFixed(3);

    const oga = (c as any).ogaScore !== undefined ? (c as any).ogaScore.toFixed(2) : "";
    const ogaPct = (c as any).ogaPercentile !== undefined ? (c as any).ogaPercentile.toFixed(1) : "";

    const oddEven = getOddEvenRatio(nums);

    let matchesRecent = 0;
    if (last) {
      const setLast = new Set([...last.main, ...last.supp]);
      matchesRecent = nums.filter(n => setLast.has(n)).length;
    }

    // Tag [on]/[off] to show whether each score affected generation
    const entTag = flags.entropyEnabled ? "[on]" : "[off]";
    const hamTag = flags.hammingEnabled ? "[on]" : "[off]";
    const jacTag = flags.jaccardEnabled ? "[on]" : "[off]";
    const gpwfTag = flags.gpwfEnabled ? "[on]" : "[off]";
    const lambdaTag = flags.lambdaEnabled ? "[on]" : "[off]";
    const ogaTag = flags.enableOGA ? "[on]" : "[off]";

    return [
      `Candidate ${String.fromCharCode(65 + idx)}:`,
      `Main=[${c.main.join(", ")}]`,
      `Supp=[${c.supp.join(", ")}]`,
      `OGA=${oga} OGA%=${ogaPct} ${ogaTag}`,
      `OddEven=${oddEven}`,
      `Entropy=${ent} ${entTag}`,
      `Hamming=${ham} ${hamTag}`,
      `Jaccard=${jac} ${jacTag}`,
      `GPWF=${gpwfTag}`,
      `Lambda=${(effectiveKnobs as any).lambda ?? ""} ${lambdaTag}`,
      `MatchesRecent=${matchesRecent}`,
    ].join(" | ");
  });

  return [...header, ...perCandidate, "[TRACE END]"].join("\n");
}



interface UserExclusionsStripProps {
  excludedNumbers: number[];
  setExcludedNumbers: (updater: (prev: number[]) => number[]) => void;
  title?: string;
  orientation?: Orientation;      // horizontal (default) or vertical
  labelPosition?: LabelPosition;  // bottom (stacked) or right
  showClearButton?: boolean;
}

// Adjusted UserExclusionsStrip for exact row alignment
type Orientation = "horizontal" | "vertical";
type LabelPosition = "bottom" | "right";

interface UserExclusionsStripProps {
  excludedNumbers: number[];
  setExcludedNumbers: (updater: (prev: number[]) => number[]) => void;
  title?: string;
  orientation?: Orientation;      // horizontal (default) or vertical
  labelPosition?: LabelPosition;  // bottom (stacked) or right
  showClearButton?: boolean;
  cellSize?: number;              // for vertical alignment with heatmap rows
}

const UserExclusionsStrip: React.FC<UserExclusionsStripProps> = ({
  excludedNumbers,
  setExcludedNumbers,
  title,
  orientation = "horizontal",
  labelPosition = "bottom",
  showClearButton = false,
  cellSize,
}) => {
  const containerStyle: React.CSSProperties =
    orientation === "horizontal"
      ? {
          display: "flex",
          gap: 8,
          overflowX: "auto",
          whiteSpace: "nowrap",
          paddingTop: 6,
          paddingBottom: 4,
          borderTop: "1px dashed #ddd",
          marginTop: title ? 6 : 0,
        }
      : {
        display: "flex",
        flexDirection: "column",
        gap: 0,
        paddingTop: 7,
        paddingBottom: 0,
        marginTop: cellSize ? 2 : 0,
      };

  const labelStyleColumnBase: React.CSSProperties = {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    minWidth: 28,
  };
  const labelStyleRowBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minWidth: 28,
  };

  // For vertical alignment: exact cell height + centered content
  const sizeStyles: React.CSSProperties =
    orientation === "vertical" && cellSize
      ? { height: cellSize, lineHeight: `${cellSize}px`, justifyContent: "center" }
      : {};

  return (
    <div style={{ marginTop: 8 }}>
      {/* For vertical alignment, prefer no title here; render title outside if needed */}
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginLeft: orientation === "horizontal" ? 8 : 0,
            }}
          >
            <button
              type="button"
              onClick={() => setExcludedNumbers(() => [])}
              title="Clear user exclusions"
              style={{ padding: "4px 8px", fontSize: 12, marginLeft: 8 }}
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
};



function AppInner() {


const [sumFilterEnabled, setSumFilterEnabled] = useState<boolean>(false);
const [sumMin, setSumMin] = useState<number>(0);
const [sumMax, setSumMax] = useState<number>(999);
const [sumIncludeSupp, setSumIncludeSupp] = useState<boolean>(true);
const [rankingWeights, setRankingWeights] = useState({ oga: 0.7, sel: 0.2, recent: 0.1 });
const [weightedTargets, setWeightedTargets] = useState<Record<number, number>>({});
const [batesParams, setBatesParams] = useState<Partial<BatesParameterSet>>({});
const [probOverlay, setProbOverlay] = useState<{
  pAtLeastRaw: number;
  pAtLeastWeighted: number;
  targetRaw: number;
  targetWeighted: number;
} | null>(null);
const [traceVerbose, setTraceVerbose] = useState<boolean>(false);
  const [entropyEnabled, setEntropyEnabled] = useState<boolean>(defaultKnobs.enableEntropy);
  const [hammingEnabled, setHammingEnabled] = useState<boolean>(defaultKnobs.enableHamming);
  const [jaccardEnabled, setJaccardEnabled] = useState<boolean>(defaultKnobs.enableJaccard);
  const [gpwfEnabled, setGPWFEnabled] = useState<boolean>(defaultKnobs.enableGPWF);

  const [entropyThreshold, setEntropyThreshold] = useState<number>(1.0);
  const [hammingThreshold, setHammingThreshold] = useState<number>(3);
  const [jaccardThreshold, setJaccardThreshold] = useState<number>(0.5);

  // Lambda enable/disable + value (lambda not heavily used right now but tracked)
  const [lambdaEnabled, setLambdaEnabled] = useState<boolean>(true);
  const [lambda, setLambda] = useState<number>(0.85);

const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [history, setHistory] = useState<Draw[]>([]);
  const [windowMode, setWindowMode] = useState<"W" | "F" | "M" | "Q" | "Y" | "H" | "Custom">("H");
  const [customDrawCount, setCustomDrawCount] = useState<number>(1);
  const [windowEnabled, setWindowEnabled] = useState<boolean>(true);

const [applyZoneBias, setApplyZoneBias] = useState<boolean>(false); // default OFF


const [drawWindowMode, setDrawWindowMode] = useState<"lastN" | "range">("lastN");
  const [rangeFrom, setRangeFrom] = useState<number>(1);
  const [rangeTo, setRangeTo] = useState<number>(history.length);
// Keep range clamped when history changes
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

  const [candidates, setCandidates] = useState<CandidateSet[]>([]);
  const [ratioSummary, setRatioSummary] = useState<any>(null);
  const [quotaWarning, setQuotaWarning] = useState<string | undefined>(undefined);
  const [trace, setTrace] = useState<string[]>([]);
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
  // User-only exclusions (SDE1/HC3 are added separately)
  const [excludedNumbers, setExcludedNumbers] = useState<number[]>([]);
  const [ratioOptions, setRatioOptions] = useState<{ ratio: string; count: number; percent: number }[]>([]);
  const [selectedRatios, setSelectedRatios] = useState<string[]>([]);
  const [useTrickyRule, setUseTrickyRule] = useState<boolean>(false);
  const [minOGAPercentile, setMinOGAPercentile] = useState<number>(0);
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
const [zpaReloadKey, setZpaReloadKey] = useState<number>(0); // force ZPA remount on load
// Global ZPA zone weighting (single source of truth)


// Moved here from top-level:
const [selectedWindowPatterns, setSelectedWindowPatterns] = useState<WindowPattern[]>([]);
const [patternConstraintMode, setPatternConstraintMode] = useState<'boost' | 'restrict'>('boost');
const [patternBoostFactor, setPatternBoostFactor] = useState<number>(0.15);
const [patternSumTolerance, setPatternSumTolerance] = useState<number>(0);
const { zoneWeightingEnabled, zoneGamma, setZoneWeightingEnabled, setZoneGamma } = useZPASettings();

const [survivalOut, setSurvivalOut] = useState<{ number: number; baseProb?: number; biasedProb?: number }[] | undefined>(undefined);
const [churnOut, setChurnOut] = useState<{ number: number; pChurn: number }[] | undefined>(undefined);
const [returnOut, setReturnOut] = useState<{ number: number; pReturn: number }[] | undefined>(undefined);




  useEffect(() => {
    fetchDraws({
      apiUrl: API_URL,
      minValidDraws: MIN_VALID_DRAWS,
      numMains: NUM_MAINS,
      mainMin: MAIN_MIN,
      mainMax: MAIN_MAX,
      setHistory,
      setTrace,
      setHighlights,
      rng: getUniqueRandomNumbers,
      strictValidateDraws,
    });
  }, []);

  useEffect(() => {
    if (history.length > 0) setCustomDrawCount(history.length);
  }, [history]);

// Helper: apply sum constraint to a candidate
  function withinSumRange(candidate: CandidateSet): boolean {
    if (!sumFilterEnabled) return true;
    const nums = sumIncludeSupp ? [...candidate.main, ...candidate.supp] : candidate.main;
    const s = nums.reduce((a, b) => a + b, 0);
    return s >= sumMin && s <= sumMax;
  }

// Build a snapshot of current state (v1)
  function buildSnapshot(): AppPresetSnapshot {
    // Read ZPA persisted settings (panels read these on mount)
    const zpaSelected = getSavedSelectedZones() ?? Array(9).fill(true);
    const zpaNorm = getSavedNormalizeMode() ?? "all";
    const zpaGroups = getSavedGroups() ?? [
      [1,2,3,4,5],[6,7,8,9,10],[11,12,13,14,15],
      [16,17,18,19,20],[21,22,23,24,25],
      [26,27,28,29,30],[31,32,33,34,35],
      [36,37,38,39,40],[41,42,43,44,45]
    ];

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

      ttp: {
        // reserved for future if TemperatureTransitionPanel persists to localStorage
        // applyZoneWeights: ..., gamma: ..., metric: ...,
      },
    };
  }

  // Apply a snapshot back to App + ZPA storages
  function applySnapshot(s: AppPresetSnapshot) {
    // Window / range
    setDrawWindowMode(s.drawWindowMode);
    setRangeFrom(s.rangeFrom);
    setRangeTo(s.rangeTo);
    setWindowEnabled(s.windowEnabled);
    setWindowMode(s.windowMode as any);
    setCustomDrawCount(s.customDrawCount);

    // Knobs and thresholds
    setKnobs(prev => ({ ...prev, ...s.knobs }));
    setEntropyEnabled(s.entropyEnabled);
    setEntropyThreshold(s.entropyThreshold);
    setHammingEnabled(s.hammingEnabled);
    setHammingThreshold(s.hammingThreshold);
    setJaccardEnabled(s.jaccardEnabled);
    setJaccardThreshold(s.jaccardThreshold);

    // Lambda
    setLambdaEnabled(s.lambdaEnabled);
    setLambda(s.lambda);

    // GPWF
    setGPWFEnabled(s.gpwfEnabled);
    setGPWFWindowSize(s.gpwf_window_size);
    setGPWFBiasFactor(s.gpwf_bias_factor);
    setGPWFFloor(s.gpwf_floor);
    setGPWFScaleMultiplier(s.gpwf_scale_multiplier);

    // Ratios / exclusions
    setSelectedRatios(s.selectedRatios);
    setUseTrickyRule(s.useTrickyRule);
    setExcludedNumbers(s.excludedNumbers);

    // Trend
    setTrendLookback(s.trendLookback);
    setTrendThreshold(s.trendThreshold);
    setAllowedTrendRatios(s.allowedTrendRatios);
    setTrendSelectedNumbers(s.trendSelectedNumbers);

    // Ranking/targets
    setRankingWeights(s.rankingWeights);
    setWeightedTargets(s.weightedTargets);

    // Candidate zone bias
    setApplyZoneBias(s.applyZoneBias);
    setZoneGamma(s.zoneGamma);

    // ZPA storages: write, then force remount so panel re-reads on mount
    try {
      if (s.zpa?.groups) setSavedGroups(s.zpa.groups);
      if (s.zpa?.selectedZones) setSavedSelectedZones(s.zpa.selectedZones);
      if (s.zpa?.normalizeMode) setSavedNormalizeMode(s.zpa.normalizeMode);
      setZpaReloadKey(k => k + 1);
    } catch {}

    // TTP: reserved — if/when panel persists to storage, set keys here similarly and remount it with a key
  }

  // Preset actions
  function doSaveNewPreset() {
    const name = newPresetName.trim() || `Preset ${presets.length + 1}`;
    const snap = buildSnapshot();
    const created = saveNewPreset(name, snap);
    setPresets(listPresets());
    setSelectedPresetId(created.id);
    setNewPresetName("");
  }

  function doUpdatePreset() {
    if (!selectedPresetId) return;
    const snap = buildSnapshot();
    updatePreset(selectedPresetId, snap);
    setPresets(listPresets());
  }

  function doLoadPreset() {
    if (!selectedPresetId) return;
    const p = getPreset(selectedPresetId);
    if (!p) return;
    applySnapshot(p.state);
  }

  function doDeletePreset() {
    if (!selectedPresetId) return;
    deletePresetLS(selectedPresetId);
    setPresets(listPresets());
    setSelectedPresetId("");
  }

  async function doExportPreset() {
    if (!selectedPresetId) return;
    const json = exportPresetJSON(selectedPresetId);
    if (!json) return;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "windfall-preset.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function doImportPreset(file: File) {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = String(evt.target?.result || "");
      const imported = importPresetJSON(text);
      if (imported) {
        setPresets(listPresets());
        setSelectedPresetId(imported.id);
      }
    };
    reader.readAsText(file);
  }

function getActiveWindowSize() {
    if (!windowEnabled) return history.length;
    if (windowMode === "Custom") return customDrawCount;
    const windowOption = WINDOW_OPTIONS.find((opt) => opt.key === windowMode);
    if (!windowOption || windowOption.size === null) return history.length;
    return Math.min(windowOption.size, history.length);
  }

  // Read weights once (or whenever you want to refresh). This is from ZPA “Copy JSON”.
  const savedZoneWeights = useMemo(() => {
    try { return getSavedZoneWeights(); } catch { return null; }
  }, []);

  // Compute filteredHistory based on mode
  const filteredHistory = useMemo<Draw[]>(() => {
    if (!history.length) return [];
    if (drawWindowMode === "lastN") {
      const n = getActiveWindowSize();
      return history.slice(-n);
    } else {
      const fromIdx = Math.max(1, Math.min(rangeFrom, history.length));
      const toIdx = Math.max(fromIdx, Math.min(rangeTo, history.length));
      return history.slice(fromIdx - 1, toIdx); // inclusive range (1-based UI)
    }
  }, [history, drawWindowMode, rangeFrom, rangeTo, windowEnabled, windowMode, customDrawCount]);

const totalDraws = filteredHistory.length;

  // Make activeWindowSize always defined
  const activeWindowSize = useMemo(() => {
    return filteredHistory.length;
  }, [filteredHistory]);

// Unified exclusions for panels (display only) — RESPECT global toggles
const sde1Exclusions = knobs.enableSDE1
  ? getSDE1FilteredPool(filteredHistory).excludedNumbers
  : [];

let hc3Exclusions: number[] = [];
if (knobs.enableHC3 && filteredHistory.length >= 2) {
  const last = filteredHistory[filteredHistory.length - 1];
  const prev = filteredHistory[filteredHistory.length - 2];
  hc3Exclusions = [...last.main, ...last.supp].filter((n) =>
    [...prev.main, ...prev.supp].includes(n)
  );
}

const allExclusions = Array.from(
  new Set([...excludedNumbers, ...sde1Exclusions, ...hc3Exclusions])
);

  useEffect(() => {
    setRatioOptions(computeOddEvenRatios(filteredHistory));
    setSelectedRatios((ratios) => ratios.filter((r) => ratioOptions.some((opt) => opt.ratio === r)));
  }, [filteredHistory]);



  // Row simulation
  const [simulatedDraw, setSimulatedDraw] = useState<any>(null);

useEffect(() => {
  setKnobs((prev) => ({
    ...prev,
    gpwf_window_size,
    gpwf_bias_factor,
    gpwf_floor,
    gpwf_scale_multiplier,
    lambda: lambda,
    octagonal_top: octagonalTop, // NEW
  }));
}, [gpwf_window_size, gpwf_bias_factor, gpwf_floor, gpwf_scale_multiplier, lambda, octagonalTop]);

useEffect(() => {
  const draws = filteredHistory.length;
  if (draws < 2) { // CHANGED: was 10
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

 // Manual simulation state
 // ---- TREND + MANUAL SIM ADDITIONS START ----
  const [manualSimSelected, setManualSimSelected] = useState<number[]>([]);
  const [trendLookback, setTrendLookback] = useState(4);
  const [trendThreshold, setTrendThreshold] = useState(0.02);
  const [allowedTrendRatios, setAllowedTrendRatios] = useState<string[]>([]);
  const toggleTrendRatio = (tag: string) => {
    setAllowedTrendRatios(prev => prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag]);
  };
  const allTrendRatioOptions = useMemo(() => {
    const list: string[] = [];
    for (let u = 0; u <= 8; u++) {
      for (let d = 0; d <= 8 - u; d++) {
        const f = 8 - u - d;
        list.push(`${u}-${d}-${f}`);
      }
    }
    return list;
  }, []);
  const handleManualSimChanged = () => {
    setSimulatedDraw(null);
    setSelectedCandidateIdx(-1);
  };
  const manualSimDraw = useMemo(() => {
    if (!manualSimSelected.length) return null;
    const capped = manualSimSelected.slice(0, 8);
    const main = capped.slice(0, 6).sort((a, b) => a - b);
    const supp = capped.slice(6, 8).sort((a, b) => a - b);
    return { main, supp, date: "ManualSim", isSimulated: true };
  }, [manualSimSelected]);
  const activeSimulatedDraw = manualSimDraw || simulatedDraw;
  const overlayNumbers = useMemo(
    () => activeSimulatedDraw ? [...activeSimulatedDraw.main, ...activeSimulatedDraw.supp] : [],
    [activeSimulatedDraw]
  );

/* ========== TREND / TEMPERATURE BLOCK (BEGIN) ========== */

  /* 1. Temperature signal (next-draw weighting signal) */
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

  /* 2. Per-number time series (oldest -> newest) for trend deltas */
  const trendValueSeries = useMemo(() => {
    const draws = filteredHistory;
    const alpha = 0.25;
    const wHybrid = 0.6;
    const N = 45;

    const series: number[][] = Array.from({ length: N }, () => []);
    const ema = Array(N).fill(0);
    const lastAge = Array(N).fill(Infinity);

    for (let t = 0; t < draws.length; t++) {
      const d = draws[t];
      const present = new Set<number>([...d.main, ...d.supp]);
      for (let n = 1; n <= N; n++) {
        const i = n - 1;
        const hit = present.has(n) ? 1 : 0;

        // Update EMA
        ema[i] = alpha * hit + (1 - alpha) * ema[i];

        // Update age
        if (hit) lastAge[i] = 0;
        else lastAge[i] = Math.min(lastAge[i] + 1, 9999);

        // Recency component (0..1)
        const rec = draws.length > 1
          ? 1 - Math.min(1, lastAge[i] / (draws.length - 1))
          : 0;

        // Hybrid
        let hybrid = wHybrid * ema[i] + (1 - wHybrid) * rec;
        if (hit) hybrid = 1; // enforce peak
        series[i].push(hybrid);
      }
    }
    return series;
  }, [filteredHistory]);

  /* 3. Current trend classification (optional) */
  const trendMap = useMemo(() => {
    const map = new Map<number, 'UP' | 'DOWN' | 'FLAT'>();
    const L = trendLookback;
    const thresh = trendThreshold;

    if (!trendValueSeries.length || !trendValueSeries[0].length) {
      for (let n = 1; n <= 45; n++) map.set(n, 'FLAT');
      return map;
    }

    const latestIndex = trendValueSeries[0].length - 1;
    const prevIndex = latestIndex - L;
    if (prevIndex < 0) {
      for (let n = 1; n <= 45; n++) map.set(n, 'FLAT');
      return map;
    }

    for (let n = 1; n <= 45; n++) {
      const arr = trendValueSeries[n - 1];
      if (arr.length <= latestIndex || arr.length <= prevIndex) {
        map.set(n, 'FLAT');
        continue;
      }
      const delta = arr[latestIndex] - arr[prevIndex];
      if (delta >= thresh) map.set(n, 'UP');
      else if (delta <= -thresh) map.set(n, 'DOWN');
      else map.set(n, 'FLAT');
    }
    return map;
  }, [trendValueSeries, trendLookback, trendThreshold]);

  /* 4. Historical trend ratio stats */
  const historicalTrendRatioStats = useMemo(() => {
    return computeHistoricalTrendRatios({
      lookback: trendLookback,
      threshold: trendThreshold,
      valueSeries: trendValueSeries,
      historyDraws: filteredHistory.map(d => ({ main: d.main, supp: d.supp }))
    });
  }, [trendLookback, trendThreshold, trendValueSeries, filteredHistory]);

  /* 5. Draws considered (sum of counts) */
const trendRatioDrawsConsidered = useMemo(
    () => Math.max(0, activeWindowSize - trendLookback),
    [activeWindowSize, trendLookback]
  );

// Soft candidate-level zone bias using geometric mean of per-number weights^gamma
  function computeCandidateZoneBias(
    nums: number[],
    weightsByNumber: Record<number, number> | null | undefined,
    gamma: number
  ): number {
    if (!weightsByNumber) return 1;
    const g = Math.max(0, Math.min(1, gamma));
    if (g === 0) return 1;

    let logSum = 0;
    let count = 0;
    for (const n of nums) {
      const w = Math.max(0.000001, weightsByNumber[n] ?? 1.0); // guard tiny
      logSum += g * Math.log(w);
      count++;
    }
    if (count === 0) return 1;
    // geometric mean of w^g over the candidate’s numbers
    return Math.exp(logSum / count);
  }

 // HELPER: enrichment & resort (place above component return, after computeOGA utilities are available)
 function recomputeCompositeRanking(base: CandidateSet[]): CandidateSet[] {
   if (!base.length) return base;
   const recentDraw = filteredHistory[filteredHistory.length - 1];
   const recentSet = recentDraw ? new Set([...recentDraw.main, ...recentDraw.supp]) : null;
   const selectedSet = new Set(userSelectedNumbers);

   // Normalize weights
   const sum = rankingWeights.oga + rankingWeights.sel + rankingWeights.recent || 1;
   const wOGA = rankingWeights.oga / sum;
   const wSel = rankingWeights.sel / sum;
   const wRecent = rankingWeights.recent / sum;

   const hasUserSelected = userSelectedNumbers && userSelectedNumbers.length > 0;

   return base
     .map((c: any) => {
       const nums = [...c.main, ...c.supp];
       const ogaScore = c.ogaScore ?? computeOGA(nums, filteredHistory);
       const ogaPercentile = c.ogaPercentile ?? getOGAPercentile(ogaScore, pastOGAScores);
       const selHits = nums.filter(n => selectedSet.has(n)).length;
       const recentHits = recentSet ? nums.filter(n => recentSet.has(n)).length : 0;
       const ogaNorm = Math.max(0, Math.min(1, ogaPercentile / 100));
       const finalComposite = wOGA * ogaNorm + wSel * (selHits / 8) + wRecent * (recentHits / 8);

       const zBias = applyZoneBias
         ? computeCandidateZoneBias(nums, savedZoneWeights || null, zoneGamma)
         : 1;

       let finalCompositeAdj = finalComposite * zBias;

       if (patternConstraintMode === 'boost' && patternBoostFactor > 0) {
         const pmRaw = (c as any).patternMatches;
         const matches = typeof pmRaw === 'number' && pmRaw > 0 ? pmRaw : 0;
         if (matches) {
           const capped = Math.min(matches, 5);
           finalCompositeAdj *= (1 + capped * patternBoostFactor);
         }
       }

       return {
         ...c,
         ogaScore,
         ogaPercentile,
         selHits,
         recentHits,
         finalComposite,
         finalCompositeAdj,
         zoneBias: zBias,
       };
     })
     .sort((a: any, b: any) => {
       if (hasUserSelected) {
         // Primary: selHits desc, Secondary: finalCompositeAdj desc, Tertiary: recentHits desc, Quaternary: OGA%
         if (b.selHits !== a.selHits) return b.selHits - a.selHits;
         if (b.finalCompositeAdj !== a.finalCompositeAdj) return b.finalCompositeAdj - a.finalCompositeAdj;
         if (b.recentHits !== a.recentHits) return b.recentHits - a.recentHits;
         return b.ogaPercentile - a.ogaPercentile;
       } else {
         // Primary: recentHits desc, Secondary: finalCompositeAdj desc, Tertiary: selHits desc, Quaternary: OGA%
         if (b.recentHits !== a.recentHits) return b.recentHits - a.recentHits;
         if (b.finalCompositeAdj !== a.finalCompositeAdj) return b.finalCompositeAdj - a.finalCompositeAdj;
         if (b.selHits !== a.selHits) return b.selHits - a.selHits;
         return b.ogaPercentile - a.ogaPercentile;
       }
     });
}

  /* ========== TREND / TEMPERATURE BLOCK (END) ========== */

// Same stops/labels you already pass to TemperatureHeatmap
  const bucketStops = [0.05, 0.12, 0.20, 0.30, 0.42, 0.55, 0.68, 0.82, 0.92];
  const bucketLabels = [
    "prehistoric","frozen","permafrost","cold","cool",
    "temperate","warm","hot","tropical","volcanic"
  ];
  // Optional colors for chips (align to your heatmap palette if needed)
  const bucketColors = [
    "#0b1020","#1b2733","#244963","#2c75a0","#3ca0c7",
    "#66c2a5","#a6d854","#fdd835","#fb8c00","#e53935"
  ];

  // Bucket index helper: returns 0..9 (10 buckets)
  function bucketIndex(v: number): number {
    for (let i = 0; i < bucketStops.length; i++) {
      if (v < bucketStops[i]) return i;
    }
    return bucketStops.length;
  }

  // Legend counts derived from your trendValueSeries (hybrid/EMA+recency per-number time series)
  const [legendCounts, setLegendCounts] = useState<number[]>(() => Array(bucketLabels.length).fill(0));
  const [legendTotal, setLegendTotal] = useState<number>(0);

  useEffect(() => {
    // Flatten all values currently in the visible window
    const values: number[] = [];
    for (let n = 0; n < trendValueSeries.length; n++) {
      const series = trendValueSeries[n] || [];
      for (let t = 0; t < series.length; t++) {
        const v = series[t];
        // Guard expected range
        if (typeof v === "number" && isFinite(v) && v >= 0 && v <= 1) {
          values.push(v);
        }
      }
    }
    const counts = Array(bucketLabels.length).fill(0);
    for (const v of values) counts[bucketIndex(v)]++;
    setLegendCounts(counts);
    setLegendTotal(values.length);
  }, [trendValueSeries]); // updates whenever the window/series updates

  // Active candidate index (row selection)
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState<number>(-1);

  // Bates diagnostics
  const [batesDiagnostics, setBatesDiagnostics] = useState<BatesDiagnostics | null>(null);

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

  /* ----- Historical Trend Ratio Distribution ----- */

  const numberTrends = useMemo(() => computeNumberTrends(filteredHistory), [filteredHistory]);
  const shortTrends = useMemo(
    () => numberTrends.map((t) => ({ number: t.number, fortnight: t.fortnight, month: t.month })),
    [numberTrends]
  );
  const trendWeights = useMemo(
    () => buildTrendWeights(shortTrends, { method: "exp", beta: 3.0 }),
    [shortTrends]
  );

  // --- wherever you compute base per-number scores for candidate generation ---
   // Base scores for numbers 1..45 (pick a signal you prefer)
   // Priority: conditionalProb (if present) -> temperatureSignal -> zeros
   const baseScores: Record<number, number> = useMemo(() => {
     const src =
       (Array.isArray(conditionalProb) && conditionalProb.length === 45 ? conditionalProb :
        Array.isArray(temperatureSignal) && temperatureSignal.length === 45 ? temperatureSignal :
        Array(45).fill(0)) as number[];

     const map: Record<number, number> = {};
     for (let n = 1; n <= 45; n++) map[n] = src[n - 1] ?? 0;
     return map;
   }, [conditionalProb, temperatureSignal]);

   // Apply zone bias conditionally just before ranking/selection
   const finalScores: Record<number, number> = useMemo(() => {
     if (!applyZoneBias) return baseScores;
     return applyZoneWeightBiasToScores(baseScores, savedZoneWeights, zoneGamma);
   }, [applyZoneBias, baseScores, savedZoneWeights, zoneGamma]);

   // Apply zone bias conditionally just before ranking/selection
   const zoneBiasedScores: Record<number, number> = useMemo(() => {
     if (!applyZoneBias) return baseScores;
     // If you’re already importing getSavedZoneWeights and applyZoneWeightBiasToScores:
     const saved = getSavedZoneWeights();
     return applyZoneWeightBiasToScores(baseScores, saved, zoneGamma);
   }, [applyZoneBias, baseScores, zoneGamma]);

   // Use `zoneBiasedScores` wherever you previously used the placeholder result

   // Use finalScores (not baseScores) for downstream ranking/selection
   const rankedNumbers = useMemo(() => {
     return Object.entries(finalScores)
       .map(([n, s]) => ({ n: Number(n), s }))
       .sort((a, b) => b.s - a.s || a.n - b.n);
   }, [finalScores]);

  function getMatchCount(candidate: CandidateSet, selected: number[]): number {
    const set = new Set([...candidate.main, ...candidate.supp]);
    return selected.filter((n) => set.has(n)).length;
  }
// EFFECT: when weights or user selections change, re-enrich & resort
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

// EFFECT: when weights or user selections change, re-enrich & resort
  useEffect(() => {
    setCandidates(prev => recomputeCompositeRanking(prev));
  }, [rankingWeights, userSelectedNumbers, filteredHistory, pastOGAScores]);

  // Explicit simulate handler
  const handleSimulateCandidate = (idx: number) => {
    const cand = candidates[idx];
    if (!cand) return;
    setSelectedCandidateIdx(idx);
    setSimulatedDraw({
      main: cand.main.slice(),
      supp: cand.supp.slice(),
      date: "Simulated",
      isSimulated: true,
    });
  };

 // Inside handleGenerate (replace the block that builds args and logs to Trace):

const handleGenerate = () => {
  setIsGenerating(true);
  setTrace([]); // keep if you like a fresh panel

  // EFFECTIVE toggles and thresholds – these are what generation will actually use
  const entropyThresholdEff = entropyEnabled ? entropyThreshold : 0;   // ≥0 always passes
  const hammingThresholdEff = hammingEnabled ? hammingThreshold : 0;   // ≥0 always passes
  const jaccardThresholdEff = jaccardEnabled ? jaccardThreshold : 1;   // ≤1 always passes

  const effectiveKnobsForGen: Knobs = {
    ...knobs,
    enableEntropy: entropyEnabled,
    enableHamming: hammingEnabled,
    enableJaccard: jaccardEnabled,
    enableGPWF: gpwfEnabled,
    lambda: lambdaEnabled ? lambda : 0.0, // already neutralized when off
  };

  // FIX: define a typed no-op and use it instead of a typed inline arrow in a ternary
  const noopTrace: React.Dispatch<React.SetStateAction<string[]>> = () => {};
  const traceDispatch = traceVerbose ? setTrace : noopTrace;

  const result = generateCandidates(
    numCandidates,
    filteredHistory,
    effectiveKnobsForGen,
    traceDispatch,
    excludedNumbers,
    selectedRatios,
    useTrickyRule,
    minOGAPercentile,
    pastOGAScores as any,
    trendSelectedNumbers,
    // thresholds
    entropyThresholdEff,
    hammingThresholdEff,
    jaccardThresholdEff,
    // lambda
    lambdaEnabled ? lambda : 0.0,
    // ratioOptions
    ratioOptions,
    // recent constraints
    minRecentMatches,
    recentMatchBias,
    // repeat/union
    repeatWindowSizeW,
    minFromRecentUnionM,
    // trend ratio
    undefined,
    undefined,
    // NEW: sum filter
 { enabled: sumFilterEnabled, min: sumMin, max: sumMax, includeSupp: sumIncludeSupp },
   {
     constraints: selectedWindowPatterns,
     mode: patternConstraintMode,
     boostFactor: patternBoostFactor,
     sumTolerance: patternSumTolerance,
   }
 );

  let processedCandidates = [...result.candidates];

  // Enrich and rank
  processedCandidates = recomputeCompositeRanking(processedCandidates);

  // Optional: still ok to post-filter by sum (harmless if already enforced)
  if (sumFilterEnabled) {
    processedCandidates = processedCandidates.filter(withinSumRange);
  }

  setCandidates(processedCandidates);
  setRatioSummary(result.ratioSummary);
  setQuotaWarning(result.quotaWarning);
  setSelectedCandidateIdx(0);

  if (traceVerbose) {
    const stateLines = [
      `[TRACE] Window: ${activeWindowSize} draws`,
      `[TRACE] OGA: ${knobs.enableOGA ? "on" : "off"}`,
      `[TRACE] Entropy: ${entropyEnabled ? `on (>=${entropyThresholdEff})` : "off"}`,
      `[TRACE] Hamming: ${hammingEnabled ? `on (>=${hammingThresholdEff})` : "off"}`,
      `[TRACE] Jaccard: ${jaccardEnabled ? `on (<=${jaccardThresholdEff})` : "off"}`,
      `[TRACE] GPWF: ${gpwfEnabled ? `on (win=${gpwf_window_size}, bias=${gpwf_bias_factor}, floor=${gpwf_floor}, scale=${gpwf_scale_multiplier})` : "off"}`,
      `[TRACE] Lambda: ${lambdaEnabled ? lambda : "off"}`,
      `[TRACE] ZoneBias (candidates): ${applyZoneBias ? `on (γ=${zoneGamma})` : "off"}`,
      `[TRACE] MinRecentMatches: ${minRecentMatches}, RecentMatchBias: ${recentMatchBias}`,
      `[TRACE] Ratios selected: ${selectedRatios.length ? selectedRatios.join(", ") : "none"}${useTrickyRule ? " (Tricky Rule)" : ""}`,
      `[TRACE] Sum filter: ${sumFilterEnabled ? `${sumIncludeSupp ? "main+supp" : "main-only"} in [${sumMin}, ${sumMax}]` : "off"}`,
      `[TRACE] User excluded: [${excludedNumbers.join(", ")}]`,
      `[TRACE] Forced inclusion: [${trendSelectedNumbers.join(", ")}]`,
      `[TRACE] Patterns: mode=${patternConstraintMode}, selected=${selectedWindowPatterns.length}, boost=${patternBoostFactor}, sumTol=±${patternSumTolerance}`,
    ];

    const s = result.rejectionStats;
    const rejSummary = `[TRACE] Rejections: Entropy=${s.entropy}, Hamming=${s.hamming}, Jaccard=${s.jaccard}, OddEven=${s.oddEven}, Tricky=${s.tricky}, MinRecent=${s.minRecent}, RecentBias=${s.recentBias}, RepeatUnion=${s.repeatUnion}, TrendRatio=${s.trendRatio}, SumRange=${(s as any).sumRange ?? 0} | Attempts=${s.totalAttempts}, Accepted=${s.accepted}`;

    setTrace((t) => [
      ...t,
      ...stateLines,
      rejSummary,
      traceFormat(
        filteredHistory,
        effectiveKnobsForGen,
        processedCandidates,
        {
          enableOGA: knobs.enableOGA,
          entropyEnabled,
          hammingEnabled,
          jaccardEnabled,
          gpwfEnabled,
          lambdaEnabled,
        }
      ),
    ]);
  }

  setIsGenerating(false);
}; // END handleGenerate

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
          setTrace((t) => [
            ...t,
            `[TRACE] Warning: ${parsed.length - validDraws.length} draws were discarded due to invalid format/range/duplicates.`,
          ]);
        }
        if (validDraws.length >= MIN_VALID_DRAWS) {
          const isNewestFirst =
            new Date(validDraws[0].date) > new Date(validDraws[validDraws.length - 1].date);
          const ordered = isNewestFirst ? validDraws.slice().reverse() : validDraws.slice();
          setHistory(ordered);
          setHighlights([]);
          setTrace((t) => [...t, `[TRACE] Imported ${validDraws.length} valid draws from file.`]);
        } else {
          setTrace((t) => [
            ...t,
            `[TRACE] Imported file has insufficient valid draws (${validDraws.length}).`,
          ]);
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
  const handleTrickyToggle = () => {
    setUseTrickyRule((prev) => !prev);
    if (!useTrickyRule) setSelectedRatios([]);
  };
  const handleTrendNumberToggle = (n: number) => {
    setTrendSelectedNumbers((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  };

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

// Convert "M/D/YY" or "YYYY-MM-DD" to a Date for sorting ascending (oldest -> newest)
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
      if (y < 100) y = 2000 + y; // "25" -> 2025
      return new Date(y, m - 1, d).getTime();
    }
    const t = Date.parse(s);
    return Number.isNaN(t) ? 0 : t;
  }

  // Turn DrawRow[] into your Draw[] and ensure ascending order (oldest -> newest)
  function rowsToDraws(rows: DrawRow[]): Draw[] {
    const ordered = rows.slice().sort((a, b) => parseCsvDateToEpoch(a.date) - parseCsvDateToEpoch(b.date));
    return ordered.map(r => ({
      date: r.date,
      main: r.mains,
      supp: r.supps,
    }));
  }

  return (
    <div style={{ fontFamily: "monospace", padding: 20, maxWidth: 1700 }}>
      {/* Global Toast Notification Container */}
      <ToastContainer position="top-right" duration={1600} />

      <h2>
        🇦🇺 Weekday Windfall – Maximum Validated Set Generator{" "}
        <span style={{ fontSize: 16, color: "#666" }}>TypeScript Demo</span>
      </h2>

      {/* Number Trends */}
      <details open>
        <summary>
          <b>Number Trends Table</b>
          <span style={{ fontWeight: 400, fontSize: 13, marginLeft: 10 }}>
            (Click a number to mark for forced inclusion)
          </span>
        </summary>
        <NumberTrendsTable trends={numberTrends} onToggle={handleTrendNumberToggle} selected={trendSelectedNumbers} />
        <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
          Colored rows indicate numbers you have selected for forced inclusion.
        </div>
      </details>

      {/* Phase 0 History */}
      <details open>
        <summary>
          <b>Phase 0: Draw History ({history.length} draws)</b>
        </summary>
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
              setTrace,
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
+        {/* New: in-app CSV updater */}
               <DrawHistoryManager
                  csvPathHint="file:///Users/admin/Weekly_Windfall/windfall-app/windfall_history_lottolyzer.csv"
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
                  {filteredHistory.length === 0 && (
                    <div style={{ fontSize: 12, color: "#c00", marginBottom: 8 }}>
                      No draws loaded yet. Check network or click "Re-fetch Draws".
                    </div>
                  )}
                </pre>
      </details>
<DrawHistoryManager
        csvPathHint="file:///Users/admin/Weekly_Windfall/windfall-app/windfall_history_lottolyzer.csv"
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
      {/* Odd/Even Ratios (add small space below) */}
      <details open style={{ marginBottom: 10 }}>
        <summary>
          <b>Odd/Even Ratio Filters</b>
          <span style={{ fontWeight: 400, fontSize: 13, marginLeft: 10 }}>
            (Select one or more ratios, or use Tricky Rule)
          </span>
        </summary>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontWeight: "bold", display: "inline-block", marginRight: 16 }}>
            <input
              type="checkbox"
              checked={useTrickyRule}
              onChange={handleTrickyToggle}
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
      </details>

      {/* WFMQY + Unified Toggles + User Exclusions */}
     <details open>
       <summary>
         <b>Windowed Draw Filtering (WFMQYH)</b>
       </summary>
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
         {/* --- NEW MODE TOGGLE --- */}
         <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
           <label>
             <input
               type="radio"
               checked={drawWindowMode === "lastN"}
               onChange={() => setDrawWindowMode("lastN")}
             />
             Last N draws
           </label>
           <label>
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
               <input
                 type="number"
                 min={1}
                 max={history.length}
                 value={rangeFrom}
                 onChange={e => setRangeFrom(Number(e.target.value))}
                 style={{ width: 60 }}
               />
               <span>to</span>
               <input
                 type="number"
                 min={1}
                 max={history.length}
                 value={rangeTo}
                 onChange={e => setRangeTo(Number(e.target.value))}
                 style={{ width: 60 }}
               />
               <span>(inclusive)</span>
             </>
           )}
         </div>
         {/* --- EXISTING WFMQY UI, ONLY ENABLED IF LAST N DRAWS --- */}
         {drawWindowMode === "lastN" && (
           <>
             <label style={{ fontWeight: "bold", marginRight: 16 }}>
               <input
                 type="checkbox"
                 checked={windowEnabled}
                 onChange={(e) => setWindowEnabled(e.target.checked)}
                 style={{ marginRight: 7 }}
               />
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
         {/* --- CURRENT WINDOW/RANGE DISPLAY --- */}
         <div style={{ marginBottom: 8, fontSize: 15, color: "#1976d2" }}>
           {drawWindowMode === "lastN"
             ? <>Using last <b>{filteredHistory.length}</b> draws ({history.length - filteredHistory.length + 1} to {history.length})</>
             : <>Using draws <b>{rangeFrom}</b> to <b>{rangeTo}</b> ({filteredHistory.length} draws)</>
           }
         </div>
         {/* NOTE: Zone-weight UI here can be removed if you’re adopting a global control; keeping as-is per v184 */}
        {/* ---  <div style={{ display: "inline-flex", gap: 12, alignItems: "center", padding: "4px 8px", background: "#eef5ff", borderRadius: 6 }}>
           <label title="Apply Zone Weights (from Zone Pattern Analysis) to candidate scoring">
             <input
               type="checkbox"
               checked={applyZoneBias}
               onChange={(e) => setApplyZoneBias(e.target.checked)}
             /> Apply zone weights
           </label>
           <label title="Strength of the zone bias (exponent on weights). 0=no effect, 1=full">
             γ: <input
               type="number"
               min={0}
               max={1}
               step={0.05}
               value={zoneGamma}
               onChange={(e) => setZoneGamma(Number(e.target.value))}
               style={{ width: 70 }}
             />
           </label>
         </div> --- */}

         {/* Unified toggles */}
         <span style={{ marginLeft: 12 }}>
           <label style={{ marginRight: 12 }}>
             <input
               type="checkbox"
               checked={knobs.enableSDE1}
               onChange={(e) => setKnobs((prev) => ({ ...prev, enableSDE1: e.target.checked }))}
               style={{ marginRight: 6 }}
             />
             SDE1
           </label>
           <label style={{ marginRight: 12 }}>
             <input
               type="checkbox"
               checked={knobs.enableHC3}
               onChange={(e) => setKnobs((prev) => ({ ...prev, enableHC3: e.target.checked }))}
               style={{ marginRight: 6 }}
             />
             HC3
           </label>
           <label>
             <input
               type="checkbox"
               checked={knobs.enableOGA}
               onChange={(e) => setKnobs((prev) => ({ ...prev, enableOGA: e.target.checked }))}
               style={{ marginRight: 6 }}
             />
             OGA
           </label>
           <label style={{ marginLeft: 16 }}>
             <input
               type="checkbox"
               checked={traceVerbose}
               onChange={(e) => setTraceVerbose(e.target.checked)}
               style={{ marginRight: 6 }}
             />
             Trace Verbose
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
          <span>
            {knobs.enableSDE1 ? (
              <span style={{ background: "#ffe6cc", color: "#a04c00", padding: "1px 6px", borderRadius: 4 }}>SDE1 Active</span>
            ) : (
              <span style={{ background: "#f2f2f2", color: "#555", padding: "1px 6px", borderRadius: 4 }}>SDE1 Off</span>
            )}
          </span>
          <span>
            {knobs.enableHC3 ? (
              <span style={{ background: "#e8f5e9", color: "#2e7d32", padding: "1px 6px", borderRadius: 4 }}>HC3 Active</span>
            ) : (
              <span style={{ background: "#f2f2f2", color: "#555", padding: "1px 6px", borderRadius: 4 }}>HC3 Off</span>
            )}
          </span>
          <span>
            {knobs.enableOGA ? (
              <span style={{ background: "#e8eefc", color: "#1a4fa3", padding: "1px 6px", borderRadius: 4 }}>OGA On</span>
            ) : (
              <span style={{ background: "#f2f2f2", color: "#555", padding: "1px 6px", borderRadius: 4 }}>OGA Off</span>
            )}
          </span>
          <span>
            {entropyEnabled ? (
              <span style={{ background: "#eceff1", color: "#37474f", padding: "1px 6px", borderRadius: 4 }}>Entropy ≥ {entropyThreshold}</span>
            ) : (
              <span style={{ background: "#f2f2f2", color: "#555", padding: "1px 6px", borderRadius: 4 }}>Entropy Off</span>
            )}
          </span>
          <span>
            {hammingEnabled ? (
              <span style={{ background: "#eceff1", color: "#37474f", padding: "1px 6px", borderRadius: 4 }}>Hamming ≥ {hammingThreshold}</span>
            ) : (
              <span style={{ background: "#f2f2f2", color: "#555", padding: "1px 6px", borderRadius: 4 }}>Hamming Off</span>
            )}
          </span>
          <span>
            {jaccardEnabled ? (
              <span style={{ background: "#eceff1", color: "#37474f", padding: "1px 6px", borderRadius: 4 }}>Jaccard ≤ {jaccardThreshold}</span>
            ) : (
              <span style={{ background: "#f2f2f2", color: "#555", padding: "1px 6px", borderRadius: 4 }}>Jaccard Off</span>
            )}
          </span>
          <span>
            {gpwfEnabled ? (
              <span style={{ background: "#e3f2fd", color: "#1565c0", padding: "1px 6px", borderRadius: 4 }}>
                GPWF (win {gpwf_window_size})
              </span>
            ) : (
              <span style={{ background: "#f2f2f2", color: "#555", padding: "1px 6px", borderRadius: 4 }}>GPWF Off</span>
            )}
          </span>
          <span>
            {lambdaEnabled ? (
              <span style={{ background: "#fff3e0", color: "#e65100", padding: "1px 6px", borderRadius: 4 }}>
                Lambda {lambda}
              </span>
            ) : (
              <span style={{ background: "#f2f2f2", color: "#555", padding: "1px 6px", borderRadius: 4 }}>Lambda Off</span>
            )}
          </span>
        </div>

        {windowEnabled && activeWindowSize < 10 && (
          <div style={{ color: "#d32f2f", fontWeight: "bold", fontSize: 14 }}>
            Warning: Too few draws selected. Increase window for reliability.
          </div>
        )}

        {/* User exclusions (single line, numbers under checkboxes) */}
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
      </details>

      
      
// Survival (WFMQY window, badges reflect global) — toggles hidden, show forced/selected
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
        
<TemperatureTransitionPanel
        history={filteredHistory}
        alpha={0.25}
        metric={tempMetric}                   // same as your heatmap
        buckets={10}
        bucketStops={[0.05, 0.12, 0.20, 0.30, 0.42, 0.55, 0.68, 0.82, 0.92]}
        hybridWeight={0.6}
        emaNormalize="per-number"
        enforcePeaks={true}
        trendLookback={4}                     // tune these to match your intuition
        trendDelta={0.02}
        trendReversal={true}
      />

{/* Monte Carlo @copilot DO NOT REMOVE temporarily disabled */}
{/* // Monte Carlo (WFMQY window, unified exclusions)
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
/>*/}

<TrendRatioHistoryPanel
  stats={historicalTrendRatioStats}
  allowedTrendRatios={allowedTrendRatios}
  toggleTrendRatio={toggleTrendRatio}
  lookback={trendLookback}
  threshold={trendThreshold}
  drawsConsidered={trendRatioDrawsConsidered}
  windowDraws={activeWindowSize}
/>

<GroupPatternPanel key={zpaReloadKey} history={filteredHistory} groups={custom} />
<GlobalZoneWeighting />

{/* Pattern Stats: collapsed with short legend/help */}
<details style={{ marginTop: 10 }}>
  <summary style={{ cursor: "pointer" }}>
    <b>Pattern Stats</b> <span style={{ fontWeight: 400, color: "#666" }}>(collapsed)</span>
  </summary>
  <div style={{ overflowX: "auto", fontSize: 12, marginTop: 8, background: "#fff", border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
    <PatternStatsPanel draws={filteredHistory} numBins={10} />
    <div style={{ fontSize: 12, color: "#555", marginTop: 8, lineHeight: 1.6 }}>
      <b>How to read Pattern Stats</b>
      <ul style={{ margin: "6px 0 0 16px" }}>
        <li>Shows distributions of observed patterns over the selected window.</li>
        <li>Use this to spot dominant bins and outliers; combine with your filters to either align with or avoid dominant patterns.</li>
        <li>Adjust the window above to see how patterns shift over different spans.</li>
      </ul>
    </div>
  </div>
</details>

{/* Number Frequency: compact and collapsed, with “Last drawn (ago)” column inside the panel */}
<details style={{ marginTop: 10 }}>
  <summary style={{ cursor: "pointer" }}>
    <b>Number Frequency</b> <span style={{ fontWeight: 400, color: "#666" }}>(compact, collapsed)</span>
  </summary>
  <div style={{ overflowX: "auto", fontSize: 12, marginTop: 8 }}>
    <NumberFrequencyPanel draws={filteredHistory} />
  </div>
</details>
<details style={{ marginTop: 10 }}>
  <summary style={{ cursor: "pointer" }}>
    <b>Window Stats (Low/Mid/High, Even/Odd, Sum)</b> <span style={{ fontWeight: 400, color: "#666" }}>(WFMQY)</span>
  </summary>
  <div style={{ marginTop: 8 }}>
<WindowStatsPanel
    draws={filteredHistory}
    sumMin={sumMin}
    sumMax={sumMax}
    includeSupp={sumIncludeSupp}
    onSumFilterChange={({ min, max, includeSupp }) => {
      setSumMin(min);
      setSumMax(max);
      setSumIncludeSupp(includeSupp);
      setSumFilterEnabled(true);
    }}
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
</details>

<div style={{ marginTop: 6, fontSize: 12, display: "flex", flexWrap: "wrap", gap: 16 }}>
  <label>
    Pattern mode:
    <select
      value={patternConstraintMode}
      onChange={e => setPatternConstraintMode(e.target.value as any)}
      style={{ marginLeft: 6 }}
    >
      <option value="boost">Boost (soft)</option>
      <option value="restrict">Restrict (hard)</option>
    </select>
  </label>
  {patternConstraintMode === 'boost' && (
    <label>
      Boost factor:
      <input
        type="number"
        step={0.05}
        min={0}
        max={2}
        value={patternBoostFactor}
        onChange={e => setPatternBoostFactor(Number(e.target.value))}
        style={{ width: 70, marginLeft: 6 }}
      />
    </label>
  )}
  {patternConstraintMode === 'restrict' && (
    <label title="Sum exact match tolerance when enforcing patterns">
      Sum tolerance ±
      <input
        type="number"
        min={0}
        max={20}
        value={patternSumTolerance}
        onChange={e => setPatternSumTolerance(Number(e.target.value))}
        style={{ width: 60, marginLeft: 4 }}
      />
    </label>
  )}
  <span>Selected patterns: {selectedWindowPatterns.length}</span>
</div>

<TargetSetQuickStatsPanel
  forcedNumbers={trendSelectedNumbers}
  selectedNumbers={userSelectedNumbers}
/>

// Survival (WFMQY window, badges reflect global) — toggles hidden, show forced/selected
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
  onStats={(rows: any[]) =>
    setSurvivalOut(
      rows.map((r: any) => ({
        number: r.number,
        baseProb: r.baseProb,
        biasedProb: r.biasedProb,
      }))
            )
          }
        />


{/* Advanced Survival Analysis and Churn/Return Prediction Models */}
<details open style={{ marginBottom: 16 }}>
  <summary>
    <b>Advanced Survival Analysis &amp; Churn/Return Prediction Models</b>
  </summary>
  <div style={{ marginTop: 12 }}>
    {/* Phase 1: ML-based Churn & Return Predictors */}
// Churn predictor (min draws = 36)
    <ChurnPredictor
      dataset={churnDataset}
      totalDraws={totalDraws}
      minDraws={36}
      modelType="rf" // or "rf" if scikitjs is available
      onPredictions={setChurnOut}
    />

    // Return predictor (min draws = 36)
    <ReturnPredictor
      dataset={churnDataset}
      totalDraws={totalDraws}
      minDraws={36}
      modelType="rf" // or "rf"
      onPredictions={setReturnOut}
    />

<UserExclusionsStrip
      title="User Exclusions"
      excludedNumbers={excludedNumbers}
      setExcludedNumbers={setExcludedNumbers}
      orientation="horizontal"
      labelPosition="bottom"
      showClearButton={true}
    />


    <MultiStateChurnPanel
      history={filteredHistory}
      excludedNumbers={allExclusions}
      churnThreshold={15}
    />

    {/* Phase 2: Classic Survival Models */}
    <SurvivalCoxPanel
      history={filteredHistory}
      excludedNumbers={allExclusions}
    />


<SurvivalFrailtyPanel
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

    {/* Phase 3: Consensus Panel */}
// Consensus combines the three signals
    <ConsensusPanel
      survival={survivalOut}
      churn={churnOut}
      reactivate={returnOut}
    />
  </div>
</details>

      {/* Operators + Lambda enable, GPWF, thresholds */}
      <div style={{ padding: 32, fontFamily: "sans-serif" }}>
        <details open>
          <summary>
            <b>Operator’s Panel – Candidate Generation Controls</b>
          </summary>
          {/* Lambda enable next to slider label row */}
          <div style={{ margin: "6px 0 10px 0", fontSize: 13 }}>
            <label>
              <input
                type="checkbox"
                checked={lambdaEnabled}
                onChange={(e) => setLambdaEnabled(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Enable Lambda (Recency Weight)
            </label>
          </div>
<OperatorsPanel
  entropy={entropyThreshold}
  setEntropy={setEntropyThreshold}
  entropyEnabled={entropyEnabled}
  setEntropyEnabled={setEntropyEnabled}
  hamming={hammingThreshold}
  setHamming={setHammingThreshold}
  hammingEnabled={hammingEnabled}
  setHammingEnabled={setHammingEnabled}
  jaccard={jaccardThreshold}
  setJaccard={setJaccardThreshold}
  jaccardEnabled={jaccardEnabled}
  setJaccardEnabled={setJaccardEnabled}
  lambda={lambda}
  setLambda={setLambda}
  minRecentMatches={minRecentMatches}
  setMinRecentMatches={setMinRecentMatches}
  recentMatchBias={recentMatchBias}
  setRecentMatchBias={setRecentMatchBias}
  previewStats={previewStats}
  gpwfEnabled={gpwfEnabled}
  setGPWFEnabled={setGPWFEnabled}
  gpwf_window_size={gpwf_window_size}
  setGPWFWindowSize={setGPWFWindowSize}
  maxGPWFWindow={Math.min(maxGPWFWindow, filteredHistory.length)}
  gpwf_bias_factor={gpwf_bias_factor}
  setGPWFBiasFactor={setGPWFBiasFactor}
  gpwf_floor={gpwf_floor}
  setGPWFFloor={setGPWFFloor}
  gpwf_scale_multiplier={gpwf_scale_multiplier}
  setGPWFScaleMultiplier={setGPWFScaleMultiplier}
  octagonal_top={octagonalTop}
  setOctagonalTop={setOctagonalTop}
/>
        </details>

{/* Presets bar */}
        <details open style={{ marginTop: 10, marginBottom: 10 }}>
          <summary><b>State Presets</b> <span style={{ fontWeight: 400, fontSize: 12, color: "#555" }}>Save and recall all current options</span></summary>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", background: "#f7fafe", border: "1px solid #e3f2fd", padding: 10, borderRadius: 6, marginTop: 8 }}>
            <label>
              Preset:
              <select
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
                style={{ marginLeft: 6, minWidth: 220 }}
              >
                <option value="">— select —</option>
                {presets.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <button onClick={doLoadPreset} disabled={!selectedPresetId}>Load</button>
            <button onClick={doUpdatePreset} disabled={!selectedPresetId}>Update from current</button>
            <button onClick={doDeletePreset} disabled={!selectedPresetId}>Delete</button>
            <button onClick={doExportPreset} disabled={!selectedPresetId}>Export</button>
            <span style={{ marginLeft: 12 }}>
              <label>
                New name:
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="e.g., Quarter+ZPA-G7"
                  style={{ marginLeft: 6, width: 200 }}
                />
              </label>
              <button onClick={doSaveNewPreset} style={{ marginLeft: 8 }}>Save Current</button>
            </span>
            <span style={{ marginLeft: "auto" }}>
              <label style={{ marginRight: 6 }}>
                Import:
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) doImportPreset(f); e.currentTarget.value = ""; }}
                  style={{ marginLeft: 6 }}
                />
              </label>
            </span>
          </div>
        </details>

  {/* Trend Filter UI */}
        <details open style={{ marginTop: 18 }}>
          <summary><b>Trend Ratio Filter (UP / DOWN / FLAT)</b></summary>
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 20, fontSize: 13 }}>
            <label title="Lookback L draws">
              Lookback L:
              <input
                type="number"
                min={1}
                max={20}
                value={trendLookback}
                onChange={e => setTrendLookback(Math.max(1, Number(e.target.value) || 1))}
                style={{ width: 70, marginLeft: 6 }}
              />
            </label>
              <label title="Slope threshold θ">
              Threshold θ:
              <input
                type="number"
                step={0.005}
                min={0.001}
                max={0.2}
                value={trendThreshold}
                onChange={e => setTrendThreshold(Math.max(0.0001, Number(e.target.value) || 0.02))}
                style={{ width: 80, marginLeft: 6 }}
              />
            </label>
            <button
              type="button"
              onClick={() => setAllowedTrendRatios([])}
              style={{ padding: "4px 10px", border: "1px solid #ccc", borderRadius: 4, background: "#fff", cursor: "pointer" }}
              title="Clear all allowed ratios"
            >
              Clear Ratios
            </button>
          </div>
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {allTrendRatioOptions.map(tag => {
              const sel = allowedTrendRatios.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTrendRatio(tag)}
                  style={{
                    padding: "4px 8px",
                    fontSize: 11,
                    borderRadius: 4,
                    border: sel ? "1px solid #1976d2" : "1px solid #bbb",
                    background: sel ? "#1976d2" : "#fff",
                    color: sel ? "#fff" : "#222",
                    cursor: "pointer"
                  }}
                  title="Toggle allow ratio"
                >
                  {tag}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: "#555" }}>
            If no ratios are selected, trend filtering is disabled. A ratio is (#UP-#DOWN-#FLAT).
          </div>
        </details>

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

        {/* Bates Panel with diagnostics hook  // When rendering BatesPanel, pass onDiagnostics: */}

 <BatesPanel
   excludedNumbers={excludedNumbers}
   forcedNumbers={trendSelectedNumbers}
   recentSignal={temperatureSignal}
   conditionalProb={conditionalProb}
   controlledParams={batesParams}
   onParamsChange={p => setBatesParams(p)}
   probabilityOverlay={probOverlay}
   onDiagnostics={(d) => setBatesDiagnostics(d)}
 />

<WeightedTargetListPanel
          userSelectedNumbers={userSelectedNumbers}
          weightedTargets={weightedTargets}
          setWeightedTargets={setWeightedTargets}
        />

        <ModulationDiagnosticsPanel
          diagnostics={batesDiagnostics}
          currentBatesParams={batesParams as any}
        />

        <UserSelectedNumbersPanel
          userSelectedNumbers={userSelectedNumbers}
          setUserSelectedNumbers={setUserSelectedNumbers}
        />

        <div style={{ padding: 32, fontFamily: "sans-serif" }}>
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
            onManualSimulationChanged={handleManualSimChanged}
            activeOGABand={activeOGABand}
          />

          <div style={{ width: "100%", marginBottom: 18 }}>
            <OGAHistogram
              ogaScores={pastOGAScores}
              candidateOGA={(currentCandidate as any)?.ogaScore}
              candidatePercentile={(currentCandidate as any)?.ogaPercentile}
            />
          </div>
        </div>

        <TracePanel lines={trace} onClear={() => setTrace([])} />
      </div>
    );
  }
{/* DGA */}
      <details open style={{ marginTop: 18 }}>
        <summary>
          <b>Diamond Grid Analysis (DGA)</b>
        </summary>

        {/* Controls row above the heatmap */}
        <div style={{ width: "100%", marginTop: 18, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <h4 style={{ margin: 0 }}>Temperature Heatmap</h4>
            <label style={{ fontSize: 13 }}>
              Metric:
              <select
                value={tempMetric}
                onChange={(e) => setTempMetric(e.target.value as any)}
                style={{ marginLeft: 6 }}
                title="EMA (momentum) • Recency (time since hit) • Hybrid (max of both)"
              >
                <option value="hybrid">Hybrid (EMA ⊕ Recency)</option>
                <option value="ema">EMA only</option>
                <option value="recency">Recency only</option>
              </select>
            </label>
            <label style={{ fontSize: 13, marginLeft: 12 }}>
              Letters:
              <input
                type="checkbox"
                checked={showHeatmapLetters}
                onChange={e => setShowHeatmapLetters(e.target.checked)}
                style={{ marginLeft: 6 }}
                title="Overlay a letter code on each cell (V, T, …)"
              />
            </label>
          </div>

          {/* Drought hazard panel above legend */}
          <div style={{ width: "100%", marginBottom: 8 }}>
            <DroughtHazardPanel history={filteredHistory} top={8} title="Most likely to break a drought next draw" />
          </div>

          {/* Static legend/info bar for the heatmap (outside horizontal scroll) */}
          <div style={{ width: "100%", marginTop: 8, marginBottom: 6 }}>
            <HeatmapLegendBar
              labels={bucketLabels}
              counts={legendCounts}
              total={legendTotal}
              colors={bucketColors}
            />
          </div>

          {/* Single horizontally scrollable region:
              Heatmap + vertical exclusions inside to keep them aligned & scrolling together */}
          <div style={{ width: "100%", overflowX: "auto" }}>
            <div style={{ display: "inline-flex", alignItems: "flex-start", gap: 12 }}>
              {/* Heatmap */}
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
                  showLegendCounts={false}  // legend handled separately
                  overlayNumbers={overlayNumbers}
                  showBucketLetters={showHeatmapLetters}
                  bucketLetters={["pR","F","pF","<C","C>","tT","W","H","tR","V"]}
                />
              </div>

              {/* Vertical User Exclusions aligned with cellSize */}
              <div style={{ flex: "0 0 auto" }}>
                <UserExclusionsStrip

                  excludedNumbers={excludedNumbers}
                  setExcludedNumbers={setExcludedNumbers}
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

          {/* Quick-access user exclusions (horizontal) */}
          <UserExclusionsStrip
            title="User Exclusions (quick access)"
            excludedNumbers={excludedNumbers}
            setExcludedNumbers={setExcludedNumbers}
            orientation="horizontal"
            labelPosition="bottom"
            showClearButton={true}
          />

          {/* DGA visualizer (unchanged) */}
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
              controlsPosition="below"
              focusNumber={focusNumber}
            />
          ) : (
            <i>No grid data available.</i>
          )}
        </div>
      </details>
<TracePanel lines={trace} onClear={() => setTrace([])} />
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

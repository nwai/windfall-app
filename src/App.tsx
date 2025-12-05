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

function AppInner(): JSX.Element {
  // Key states used below
  const [history, setHistory] = useState<Draw[]>([]);
  const [windowMode, setWindowMode] = useState<"W" | "F" | "M" | "Q" | "Y" | "H" | "Custom">("H");
  const [customDrawCount, setCustomDrawCount] = useState<number>(1);
  const [windowEnabled, setWindowEnabled] = useState<boolean>(true);
  const [drawWindowMode, setDrawWindowMode] = useState<"lastN" | "range">("lastN");
  const [rangeFrom, setRangeFrom] = useState<number>(1);
  const [rangeTo, setRangeTo] = useState<number>(history.length);
  const [knobs, setKnobs] = useState<Knobs>({
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
  });
  const [excludedNumbers, setExcludedNumbers] = useState<number[]>([]);
  const [trendSelectedNumbers, setTrendSelectedNumbers] = useState<number[]>([]);
  const [allowedTrendRatios, setAllowedTrendRatios] = useState<string[]>([]);
  const [trace, setTrace] = useState<string[]>([]);
  const [traceVerbose, setTraceVerbose] = useState<boolean>(true);
  const setTraceMaybe: React.Dispatch<React.SetStateAction<string[]>> = (updater) => { if (!traceVerbose) return; /* @ts-ignore */ setTrace(updater); };
  const [numCandidates, setNumCandidates] = useState<number>(8);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [octagonalTop, setOctagonalTop] = useState<number>(knobs.octagonal_top);

  const [entropyEnabled, setEntropyEnabled] = useState<boolean>(true);
  const [entropyThreshold, setEntropyThreshold] = useState<number>(1.0);
  const [hammingEnabled, setHammingEnabled] = useState<boolean>(true);
  const [hammingThreshold, setHammingThreshold] = useState<number>(3);
  const [jaccardEnabled, setJaccardEnabled] = useState<boolean>(true);
  const [jaccardThreshold, setJaccardThreshold] = useState<number>(0.5);
  const [lambdaEnabled, setLambdaEnabled] = useState<boolean>(true);
  const [lambda, setLambda] = useState<number>(0.85);
  const [gpwfEnabled, setGPWFEnabled] = useState<boolean>(true);
  const [gpwf_window_size, setGPWFWindowSize] = useState<number>(27);
  const [gpwf_bias_factor, setGPWFBiasFactor] = useState<number>(0.05);
  const [gpwf_floor, setGPWFFloor] = useState<number>(0.5);
  const [gpwf_scale_multiplier, setGPWFScaleMultiplier] = useState<number>(0.7);
  // Declare weightedTargets early so it’s in scope for JSX below
  const [weightedTargets, setWeightedTargets] = useState<Record<number, number>>({});

  const [userSelectedNumbers, setUserSelectedNumbers] = useState<number[]>([]);
  const [candidates, setCandidates] = useState<CandidateSet[]>([]);
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState<number>(-1);
  const currentCandidate = candidates[selectedCandidateIdx] || null;

  const [ratioOptions, setRatioOptions] = useState<{ ratio: string; count: number; percent: number }[]>([]);
  const [selectedRatios, setSelectedRatios] = useState<string[]>([]);
  const handleRatioToggle = (ratio: string) => {
    setSelectedRatios(prev => (prev.includes(ratio) ? prev.filter(r => r !== ratio) : [...prev, ratio]));
  };

  // New state for TemperatureHeatmap metric selector
  const [heatmapMetric, setHeatmapMetric] = useState<'ema' | 'recency' | 'hybrid' | 'x-only'>('hybrid');

  // Helper: current active window size for lastN mode
  const getActiveWindowSize = (): number => {
    if (!windowEnabled) return history.length;
    if (windowMode === "Custom") return customDrawCount;
    const WINDOW_OPTIONS: Array<{ key: string; size: number | null }> = [
      { key: "W", size: 3 },
      { key: "F", size: 6 },
      { key: "M", size: 12 },
      { key: "Q", size: 36 },
      { key: "Y", size: 156 },
      { key: "H", size: null },
      { key: "Custom", size: null },
    ];
    const opt = WINDOW_OPTIONS.find((o) => o.key === windowMode);
    if (!opt || opt.size === null) return history.length;
    return Math.min(opt.size, history.length);
  };

  // Move filteredHistory definition earlier (already done above in file)
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

  // Now previewStats can safely reference filteredHistory
  const previewStats = useMemo(() => ({
    hamming: currentCandidate ? minHamming(currentCandidate, filteredHistory) : 0,
    entropy: currentCandidate ? entropy(currentCandidate) : 0,
    jaccard: currentCandidate ? maxJaccard(currentCandidate, filteredHistory) : 0,
  }), [currentCandidate, filteredHistory]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-load default CSV on mount if no history yet
  useEffect(() => {
    let cancelled = false;
    async function tryLoadDefaultCSV() {
      if (history.length > 0) return;
      try {
        const url = new URL("./windfall_history_lottolyzer.csv", import.meta.url).toString();
        const resp = await fetch(url, { cache: "no-store" });
        if (!resp.ok) return;
        const text = await resp.text();
        const parsed = parseCSVorJSON(text);
        // Expect rows like { date, mains, supps } or similar; normalize
        const rows = Array.isArray(parsed) ? parsed : [];
        const ordered: Draw[] = rows
          .map((r: any) => ({
            date: r.date ?? r.Date ?? r.draw_date ?? "",
            main: (r.mains ?? r.main ?? r.Main ?? r.MAIN ?? r.numbers ?? r.Numbers ?? []).map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n)),
            supp: (r.supps ?? r.supp ?? r.Supp ?? r.SUPP ?? r.bonus ?? r.Bonus ?? []).map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n)),
          }))
          .filter((d: Draw) => d.main?.length >= 6)
          .sort((a: Draw, b: Draw) => Date.parse(a.date) - Date.parse(b.date));
        if (!cancelled && ordered.length) {
          setHistory(ordered);
          setTrace(t => [...t, `[TRACE] Loaded default CSV history: ${ordered.length} draws`]);
        }
      } catch (err) {
        // Silent fallback; Phase 0 UI remains available
        setTrace(t => [...t, `[TRACE] Default CSV load failed: ${String(err).slice(0,120)}`]);
      }
    }
    tryLoadDefaultCSV();
    return () => { cancelled = true; };
  }, []);

  // Chronological window (oldest -> newest)
  const chrono = useMemo(() => {
    if (filteredHistory.length <= 1) return filteredHistory.slice();
    const first = new Date(filteredHistory[0].date).getTime();
    const last = new Date(filteredHistory[filteredHistory.length - 1].date).getTime();
    const newestFirst = filteredHistory.length > 1 && first > last;
    return newestFirst ? filteredHistory.slice().reverse() : filteredHistory.slice();
  }, [filteredHistory]);

  // Build occurSeries, EMA, recency, and hybrid valueSeries (numbers 1..45)
  const trendValueSeries = useMemo(() => {
    const T = chrono.length;
    const N = 45;
    const occur: number[][] = Array.from({ length: N }, () => Array(T).fill(0));
    const ema: number[][] = Array.from({ length: N }, () => Array(T).fill(0));
    const prev: number[] = Array(N).fill(0);
    const alpha = 0.25;
    for (let t = 0; t < T; t++) {
      const present = new Set<number>([...(chrono[t]?.main || []), ...(chrono[t]?.supp || [])]);
      for (let n = 1; n <= N; n++) {
        const o = present.has(n) ? 1 : 0;
        occur[n - 1][t] = o;
        const cur = alpha * o + (1 - alpha) * prev[n - 1];
        ema[n - 1][t] = cur;
        prev[n - 1] = cur;
      }
    }
    // Normalize EMA per-number
    const emaNorm: number[][] = Array.from({ length: N }, () => Array(T).fill(0));
    for (let n = 0; n < N; n++) {
      let minV = Number.POSITIVE_INFINITY, maxV = Number.NEGATIVE_INFINITY;
      for (let t = 0; t < T; t++) { const v = ema[n][t]; if (v < minV) minV = v; if (v > maxV) maxV = v; }
      const denom = (maxV - minV) || 1;
      for (let t = 0; t < T; t++) emaNorm[n][t] = (ema[n][t] - minV) / denom;
    }
    // Recency: 1 when just drawn, decays with age
    const recency: number[][] = Array.from({ length: N }, () => Array(T).fill(0));
    for (let n = 0; n < N; n++) {
      let age = T;
      for (let t = 0; t < T; t++) {
        if (occur[n][t] === 1) age = 0; else age = Math.min(T, age + 1);
        const normAge = T > 1 ? Math.min(1, age / (T - 1)) : 1;
        recency[n][t] = 1 - normAge;
      }
    }
    const w = 0.6; // hybrid weight
    const value: number[][] = Array.from({ length: N }, () => Array(T).fill(0));
    for (let n = 0; n < N; n++) {
      for (let t = 0; t < T; t++) {
        let v = w * emaNorm[n][t] + (1 - w) * recency[n][t];
        // enforce peaks
        if (occur[n][t] === 1) v = 1;
        value[n][t] = v;
      }
    }
    return value;
  }, [chrono]);

  // Build Trend Ratio stats for history window using Options
  const trendRatioStats = useMemo(() => {
    try {
      const options = {
        lookback: 1,
        threshold: 0.02,
        valueSeries: trendValueSeries,
        historyDraws: chrono.map(d => ({ main: d.main, supp: d.supp }))
      };
      return computeHistoricalTrendRatios(options);
    } catch {
      return [] as any[];
    }
  }, [trendValueSeries, chrono]);

  // Generate handler: pass allowedTrendRatios and trendMap
  const handleGenerate = () => {
    setIsGenerating(true);
    setTrace([]);
    const effectiveKnobsForGen: Knobs = { ...knobs };
    const entropyThresholdEff = 0, hammingThresholdEff = 0, jaccardThresholdEff = 1, lambdaEff = 0;
    const t0 = performance.now();
    const result = generateCandidates(
      numCandidates,
      filteredHistory,
      effectiveKnobsForGen,
      setTraceMaybe,
      excludedNumbers,
      [],
      false,
      0,
      [],
      trendSelectedNumbers,
      entropyThresholdEff,
      hammingThresholdEff,
      jaccardThresholdEff,
      lambdaEff,
      [],
      0,
      0,
      0,
      0,
      trendMap,
      allowedTrendRatios,
      { enabled: false, min: 0, max: 0, includeSupp: true },
      { constraints: [], mode: 'boost', boostFactor: 0, sumTolerance: 0 }
    );
    const dt = Math.round(performance.now() - t0);
    setTraceMaybe(t => [...t, `[TRACE] Generation completed in ${dt}ms; accepted=${result.rejectionStats.accepted}/${result.rejectionStats.totalAttempts}`]);
    setIsGenerating(false);
  };

  // Reposition ratioOptions effect to occur after filteredHistory is declared
  useEffect(() => {
    // Build simple odd/even ratios from filteredHistory
    const counts = new Map<string, number>(); let total = 0;
    for (const d of filteredHistory) {
      const nums = [...d.main, ...d.supp]; const odd = nums.filter(n => n % 2 === 1).length; const even = nums.length - odd;
      const r = `${odd}:${even}`; counts.set(r, (counts.get(r) || 0) + 1); total += 1;
    }
    setRatioOptions(Array.from(counts.entries()).map(([ratio, count]) => ({ ratio, count, percent: total ? Math.round((count/total)*100) : 0 })).sort((a,b)=>b.count-a.count || a.ratio.localeCompare(b.ratio)));
  }, [filteredHistory]);

  // Build simple finalScores and trendMap for Trend Ratio filtering
  const finalScores: Record<number, number> = useMemo(() => {
    const map: Record<number, number> = {};
    for (let n = 1; n <= 45; n++) map[n] = 0.5;
    return map;
  }, []);
  const trendMap = useMemo(() => new Map<number, ('UP'|'DOWN'|'FLAT')>(
    Array.from({ length: 45 }, (_, i) => {
      const n = i + 1; const s = Math.max(0, Math.min(1, finalScores[n] ?? 0));
      return [n, s >= 0.66 ? 'UP' : s <= 0.33 ? 'DOWN' : 'FLAT'] as const;
    })
  ), [finalScores]);

  return (
    <div style={{ fontFamily: "monospace", padding: 20, maxWidth: 1700 }}>
      <ToastContainer position="top-right" duration={1600} />
      <h2>
        🇦🇺 Weekday Windfall – Maximum Validated Set Generator{" "}
        <span style={{ fontSize: 16, color: "#666" }}>TypeScript Demo</span>
        <label style={{ marginLeft: 12, fontSize: 12 }} title="Toggle verbose trace logging">
          <input type="checkbox" checked={traceVerbose} onChange={(e) => setTraceVerbose(e.target.checked)} style={{ marginRight: 6 }} />
          Trace verbose
        </label>
      </h2>

      {/* Trend Ratio selector UI */}
      <CollapsibleSection title={<b>Trend Ratio Filter (UP / DOWN / FLAT)</b>} defaultOpen={true}>
        <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
          Allowed compositions (U-D-F):
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            {(["2-0-6","3-0-5","4-0-4","2-1-5","3-1-4"] as const).map(tag => (
              <label key={tag} style={{ border: "1px solid #eee", borderRadius: 4, padding: "2px 6px" }}>
                <input type="checkbox" checked={allowedTrendRatios.includes(tag)} onChange={(e) => setAllowedTrendRatios(prev => e.target.checked ? [...prev, tag] : prev.filter(x => x !== tag))} style={{ marginRight: 6 }} />
                {tag}
              </label>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      {/* Operators Panel */}
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
          minRecentMatches={0} setMinRecentMatches={() => {}}
          recentMatchBias={0} setRecentMatchBias={() => {}}
          previewStats={previewStats}
          gpwfEnabled={gpwfEnabled} setGPWFEnabled={setGPWFEnabled}
          gpwf_window_size={gpwf_window_size} setGPWFWindowSize={setGPWFWindowSize}
          maxGPWFWindow={Math.min(filteredHistory.length || 0, filteredHistory.length || 0)}
          gpwf_bias_factor={gpwf_bias_factor} setGPWFBiasFactor={setGPWFBiasFactor}
          gpwf_floor={gpwf_floor} setGPWFFloor={setGPWFFloor}
          gpwf_scale_multiplier={gpwf_scale_multiplier} setGPWFScaleMultiplier={setGPWFScaleMultiplier}
          octagonal_top={octagonalTop} setOctagonalTop={setOctagonalTop}
        />
      </CollapsibleSection>

      {/* [ANCHOR] Number Trends Table */}
      <CollapsibleSection title={<b>Number Trends Table</b>} summaryHint="Click a number to mark for forced inclusion" defaultOpen={true}>
        <NumberTrendsTable
          history={filteredHistory}
          excludedNumbers={excludedNumbers}
          trendSelectedNumbers={trendSelectedNumbers}
          onExcludeToggle={(n) => setExcludedNumbers(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n])}
          onTrendSelectToggle={(n) => setTrendSelectedNumbers(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n])}
          onTrace={(line) => setTraceMaybe(t => [...t, line])}
        />
      </CollapsibleSection>

      {/* [ANCHOR] Phase 0: Draw History */}
      <CollapsibleSection title={<b>Phase 0: Draw History ({history.length} draws)</b>} defaultOpen={true}>
        <DrawHistoryManager
          csvPathHint="windfall_history_lottolyzer.csv"
          mainCount={6}
          suppCount={2}
          minNumber={1}
          maxNumber={45}
          onDrawsUpdated={(rows) => {
            const ordered = rows.slice().sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).map(r=>({ date:r.date, main:r.mains, supp:r.supps }));
            setHistory(ordered);
            setTrace(t=>[...t, `[TRACE] Draws updated via Phase 0 manager: ${ordered.length}`]);
          }}
        />
      </CollapsibleSection>

      {/* [ANCHOR] Windowed Draw Filtering (WFMQYH) */}
      <CollapsibleSection title={<b>Windowed Draw Filtering (WFMQYH)</b>} defaultOpen={true}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: "#1a4fa3", fontWeight: 700, marginBottom: 4 }}>Last N Draws (windowed)</div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13 }}>Window:</span>
                <select value={windowMode} onChange={(e) => setWindowMode(e.target.value as any)} style={{ fontSize: 13 }}>
                  {["W", "F", "M", "Q", "Y", "H", "Custom"].map((key) => (
                    <option key={key} value={key}>{key === "Custom" ? "Custom (set below)" : key}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13 }}>Size:</span>
                <input
                  type="number"
                  min={1}
                  value={windowMode === "Custom" ? customDrawCount : getActiveWindowSize()}
                  onChange={(e) => {
                    const v = Math.max(1, Number(e.target.value));
                    if (windowMode === "Custom") setCustomDrawCount(v);
                    else if (windowMode !== "H") setWindowMode("Custom");
                  }}
                  style={{ fontSize: 13, width: 60 }}
                />
              </div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#1a4fa3", fontWeight: 700, marginBottom: 4 }}>Date Range (all draws)</div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13 }}>From:</span>
                <input
                  type="number"
                  min={1}
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(Math.max(1, Math.min(Number(e.target.value), history.length)))}
                  style={{ fontSize: 13, width: 60 }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13 }}>To:</span>
                <input
                  type="number"
                  min={1}
                  value={rangeTo}
                  onChange={(e) => setRangeTo(Math.max(1, Math.min(Number(e.target.value), history.length)))}
                  style={{ fontSize: 13, width: 60 }}
                />
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* [ANCHOR] User Selected Numbers */}
      <CollapsibleSection title={<b>User Selected Numbers</b>} defaultOpen={true}>
        <UserSelectedNumbersPanel
          userSelectedNumbers={userSelectedNumbers}
          setUserSelectedNumbers={setUserSelectedNumbers}
        />
      </CollapsibleSection>

      {/* [ANCHOR] Selection Insights (Windowed + All History) */}
      <CollapsibleSection title={<b>Selection Insights</b>} defaultOpen={true}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: "#1a4fa3", fontWeight: 700, marginBottom: 4 }}>Windowed (WFMQY)</div>
            <SelectionInsightsPanel
              history={filteredHistory}
              selected={userSelectedNumbers}
              topKTriplets={10}
              historyWindowName={`Windowed (${filteredHistory.length})`}
              ogaHistory={filteredHistory}
              autoComputeOGARaw={true}
              lazyThreshold={400}
              useIdleCallback={true}
              onTrace={(line) => setTraceMaybe(t => [...t, line])}
            />
          </div>
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
              onTrace={(line) => setTraceMaybe(t => [...t, line])}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* [ANCHOR] Diamond Grid Analysis (DGA) */}
      <CollapsibleSection title={<b>Diamond Grid Analysis (DGA)</b>} defaultOpen={true}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <label style={{ fontSize: 12 }}>
            Metric:
            <select value={heatmapMetric} onChange={(e) => setHeatmapMetric(e.target.value as any)} style={{ marginLeft: 6, fontSize: 12 }}>
              <option value="ema">EMA</option>
              <option value="recency">Recency</option>
              <option value="hybrid">Hybrid</option>
              <option value="x-only">X only</option>
            </select>
          </label>
        </div>
        <div style={{ width: "100%", marginBottom: 8 }}>
          <DroughtHazardPanel history={filteredHistory} top={8} title="Most likely to break a drought next draw" onToggleNumber={(n) => setTrendSelectedNumbers(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n])} forcedNumbers={trendSelectedNumbers} />
        </div>
        <div style={{ width: "100%", overflowX: "auto", marginTop: 8 }}>
          <TemperatureHeatmap
            history={filteredHistory}
            alpha={0.25}
            cellSize={DGA_CELL_SIZE}
            metric={heatmapMetric}
            buckets={10}
            bucketStops={[0.05, 0.12, 0.20, 0.30, 0.42, 0.55, 0.68, 0.82, 0.92]}
            bucketLabels={["prehistoric","frozen","permafrost","cold","cool","temperate","warm","hot","tropical","volcanic"]}
            hybridWeight={0.6}
            emaNormalize="per-number"
            enforcePeaks={true}
            overlayNumbers={userSelectedNumbers.slice(0, 8)}
            showBucketLetters={false}
          />
        </div>
      </CollapsibleSection>

      {/* [ANCHOR] Generated Candidates */}
      <CollapsibleSection title={<b>Generated Candidates</b>} defaultOpen={true}>
        <GeneratedCandidatesPanel
          onGenerate={handleGenerate}
          candidates={candidates}
          quotaWarning={undefined}
          isGenerating={isGenerating}
          numCandidates={numCandidates}
          setNumCandidates={setNumCandidates}
          userSelectedNumbers={userSelectedNumbers}
          setUserSelectedNumbers={setUserSelectedNumbers}
          onSelectCandidate={setSelectedCandidateIdx}
          onSimulateCandidate={() => {}}
          selectedCandidateIdx={selectedCandidateIdx}
          mostRecentDraw={filteredHistory[filteredHistory.length - 1] || null}
          manualSimSelected={[]}
          setManualSimSelected={() => {}}
          onManualSimulationChanged={() => {}}
          activeOGABand={null}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
          <b>Provenance:</b> Window={filteredHistory.length}; Ratios={selectedRatios.length ? selectedRatios.join(" ") : "none"}; Forced={trendSelectedNumbers.length}
        </div>
      </CollapsibleSection>

      {/* [ANCHOR] Trend Ratio History */}
      <CollapsibleSection title={<b>Trend Ratio History</b>} defaultOpen={false}>
        <TrendRatioHistoryPanel
          stats={trendRatioStats}
          allowedTrendRatios={allowedTrendRatios}
          toggleTrendRatio={handleRatioToggle}
          lookback={1}
          threshold={0}
          drawsConsidered={Math.max(0, filteredHistory.length - 1)}
          windowDraws={filteredHistory.length}
          minExpectedForZ={3}
          showExpected={true}
        />
      </CollapsibleSection>

      {/* [ANCHOR] Group Pattern Analyzer + Global Zone Weighting */}
      <CollapsibleSection title={<b>Group Pattern Analyzer</b>} defaultOpen={false}>
        <GroupPatternPanel history={filteredHistory} />
        <div style={{ marginTop: 8 }}>
          <GlobalZoneWeighting />
        </div>
      </CollapsibleSection>

      {/* [ANCHOR] Pattern Stats & Frequency */}
      <CollapsibleSection title={<b>Pattern Stats & Frequency</b>} defaultOpen={false}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <PatternStatsPanel draws={filteredHistory} />
          <NumberFrequencyPanel draws={filteredHistory} />
        </div>
      </CollapsibleSection>
      {/* [ANCHOR] Window Stats */}
      <CollapsibleSection title={<b>Window Stats</b>} defaultOpen={false}>
        <WindowStatsPanel draws={filteredHistory} />
      </CollapsibleSection>
      {/* [ANCHOR] Target Set Quick Stats */}
      <CollapsibleSection title={<b>Target Set Quick Stats</b>} defaultOpen={false}>
        <TargetSetQuickStatsPanel forcedNumbers={trendSelectedNumbers} selectedNumbers={userSelectedNumbers} />
      </CollapsibleSection>

      {/* [ANCHOR] Presets & Parameter Search */}
      <CollapsibleSection title={<b>Presets & Parameter Search</b>} defaultOpen={false}>
        <ParameterSearchPanel userSelectedNumbers={userSelectedNumbers} forcedNumbers={trendSelectedNumbers} excludedNumbers={excludedNumbers} />
      </CollapsibleSection>
      {/* [ANCHOR] Bates Weights */}
      <CollapsibleSection title={<b>Bates Weights</b>} defaultOpen={false}>
        <BatesPanel excludedNumbers={excludedNumbers} forcedNumbers={trendSelectedNumbers} />
      </CollapsibleSection>
      {/* [ANCHOR] Weighted Targets */}
      <CollapsibleSection title={<b>Weighted Targets</b>} defaultOpen={false}>
        <WeightedTargetListPanel userSelectedNumbers={userSelectedNumbers} weightedTargets={weightedTargets} setWeightedTargets={setWeightedTargets} />
      </CollapsibleSection>
      {/* [ANCHOR] Modulation Diagnostics */}
      <CollapsibleSection title={<b>Modulation Diagnostics</b>} defaultOpen={false}>
        <ModulationDiagnosticsPanel diagnostics={null} />
      </CollapsibleSection>

      {/* [ANCHOR] Candidate Generation Influences */}
      <CollapsibleSection title={<b>Candidate Generation Influences</b>} defaultOpen={false}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <span title="Entropy threshold and enable toggle">Entropy: {entropyEnabled ? `${entropyThreshold}` : "off"}</span>
          <span title="Hamming distance filter">Hamming: {hammingEnabled ? `${hammingThreshold}` : "off"}</span>
          <span title="Jaccard similarity filter">Jaccard: {jaccardEnabled ? `${jaccardThreshold}` : "off"}</span>
          <span title="Recency lambda weighting">λ: {lambdaEnabled ? `${lambda.toFixed(2)}` : "off"}</span>
          <span title="GPWF global weighting window">GPWF: {gpwfEnabled ? `W=${gpwf_window_size}, bias=${gpwf_bias_factor}` : "off"}</span>
          <span title="Trend ratio composition constraint">Trend Ratio: {allowedTrendRatios.length ? allowedTrendRatios.join(", ") : "none"}</span>
          <span title="User forced inclusions">Forced: {trendSelectedNumbers.length}</span>
          <span title="User exclusions">Excluded: {excludedNumbers.length}</span>
        </div>
      </CollapsibleSection>

      {/* Generate and Trace */}
      <div style={{ marginTop: 12 }}>
        <button onClick={handleGenerate} disabled={isGenerating}>Generate Candidates</button>
      </div>
      <TracePanel lines={trace} onClear={() => setTrace([])} />
    </div>
  );
}

// [ANCHOR] ROOT: App layout ends
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

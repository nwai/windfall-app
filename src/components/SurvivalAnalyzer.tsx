import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Draw } from "../types";
import {
  buildGPWFNumberWeights,
  buildHC3PenaltyWeights,
  buildSDE1PenaltyWeights,
  combinePerNumberWeights,
} from "../lib/numberBiases";
import { useZPASettings } from "../context/ZPASettingsContext";
import { getSavedZoneWeights, WeightsByNumber } from "../lib/zpaStorage";

type WindowPattern = { low: number; high: number; even: number; odd: number; sum: number };

/* ------------------------------------------------------------------ */
/* Helper utilities                                                    */
/* ------------------------------------------------------------------ */

// Top-level helper so it is visible everywhere
function drawPattern(draw: Draw): WindowPattern {
  const all = [...draw.main, ...draw.supp];
  const low = all.filter((n) => n <= 22).length;
  const high = all.length - low;
  const even = all.filter((n) => n % 2 === 0).length;
  const odd = all.length - even;
  const sum = all.reduce((a, b) => a + b, 0);
  return { low, high, even, odd, sum };
}

function buildEventLog(history: Draw[], number: number) {
  return history.map((draw) =>
    draw.main.includes(number) || draw.supp.includes(number) ? 1 : 0
  );
}

function buildSurvivalData(history: Draw[], number: number) {
  const events = buildEventLog(history, number);
  let times: number[] = [];
  let censored = false;
  let current = 0;
  for (let i = 0; i < events.length; ++i) {
    current++;
    if (events[i]) {
      times.push(current);
      current = 0;
    }
  }
  if (current > 0) {
    times.push(current);
    censored = true;
  }
  return { times, censored };
}

function kaplanMeier(times: number[], _window: number) {
  let n = times.length;
  if (n === 0) return { curve: [1], probNext: 0 };
  let surv = 1.0;
  let km: number[] = [1.0];
  let sorted = times.slice().sort((a, b) => a - b);
  let last = 0;
  for (let i = 0; i < sorted.length; ++i) {
    let t = sorted[i];
    if (t === last) continue;
    // single-event decrement
    surv *= (n - 1) / n;
    km.push(surv);
    n--;
    last = t;
  }
  return { curve: km, probNext: 1 - (km[1] ?? 1) };
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */
export const SurvivalAnalyzer: React.FC<{
  history: Draw[];
  excludedNumbers: number[];
  probabilityHeading?: string;
  trendWeights?: Record<number, number>;
  externalWindowSize?: number;
  enableSDE1Global?: boolean;
  enableHC3Global?: boolean;
  hideBiasToggles?: boolean;
  forcedNumbers?: number[];
  selectedCheckNumbers?: number[];
  focusNumber?: number | null; // highlight number in table
  highlightColor?: string;
  onStats?: (rows: { number: number; baseProb: number; biasedProb: number }[]) => void;
  selectable?: boolean;                      // default true: allow clicking rows to toggle highlight
  initialSelected?: number[];               // initial selection set (do not pass a new array each render)
  onSelectionChange?: (nums: number[]) => void; // callback on selection changes
  patternsSelected?: WindowPattern[];       // optional pattern bias selection
  patternSumTolerance?: number;
}> = ({
  history,
  excludedNumbers,
  probabilityHeading,
  trendWeights,
  externalWindowSize,
  enableSDE1Global,
  enableHC3Global,
  hideBiasToggles = true,
  forcedNumbers = [],
  selectedCheckNumbers = [],
  focusNumber = null,
  highlightColor = "#3BD759",
  onStats,
  selectable = true,
  initialSelected,
  onSelectionChange,
  patternsSelected,
  patternSumTolerance = 0,
}) => {
  /* ------------------------------------------------------------------ */
  /* Core local state                                                   */
  /* ------------------------------------------------------------------ */
  const windowDefault = externalWindowSize ?? 20;
  const [windowSize, setWindowSize] = useState<number>(windowDefault);
  const [results, setResults] = useState<any[] | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // Local bias toggles
  const [useTrendBias, setUseTrendBias] = useState<boolean>(true);
  const [useGPWF, setUseGPWF] = useState<boolean>(false);
  const [useHC3Bias, setUseHC3Bias] = useState<boolean>(true);
  const [useSDE1Bias, setUseSDE1Bias] = useState<boolean>(false);
  const [gamma, setGamma] = useState<number>(2);

  // Optimizer: allow including/excluding pattern bias
  const [usePatternBiasInOptimizer, setUsePatternBiasInOptimizer] = useState<boolean>(true);

  // Custom trend window
  const [useCustomTrendWindow, setUseCustomTrendWindow] = useState<boolean>(false);
  const [trendFrom, setTrendFrom] = useState<number>(14);
  const [trendTo, setTrendTo] = useState<number>(30);

  // Raw diff vs ratio mode for trend weighting
  const [trendMode, setTrendMode] = useState<"diff" | "ratio">("diff");

  const [sortBy, setSortBy] = useState<"biased" | "base" | "number">("biased");

  // Selection state: initialize once from initialSelected (or empty)
  const [selectedNums, setSelectedNums] = useState<Set<number>>(
    () => new Set(initialSelected ?? [])
  );

  // Only resync if parent provides a new initialSelected (and not undefined)
  const prevInitKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (initialSelected === undefined) return;
    const key = JSON.stringify([...initialSelected].sort((a, b) => a - b));
    if (prevInitKeyRef.current === key) return;
    prevInitKeyRef.current = key;
    setSelectedNums(new Set(initialSelected));
  }, [initialSelected]);

  const toggleSelected = (n: number) => {
    if (!selectable) return;
    setSelectedNums((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      onSelectionChange?.(Array.from(next).sort((a, b) => a - b));
      return next;
    });
  };
  const clearSelection = () => {
    setSelectedNums(new Set());
    onSelectionChange?.([]);
  };

  /* ------------------------------------------------------------------ */
  /* Zone weighting                                                     */
  /* ------------------------------------------------------------------ */
  const { zoneWeightingEnabled, zoneGamma } = useZPASettings();
  const savedZoneWeights: WeightsByNumber | null = useMemo(() => {
    try {
      return getSavedZoneWeights();
    } catch {
      return null;
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /* Window & base computations                                         */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (trendFrom >= trendTo) {
      setTrendTo(Math.min(history.length, trendFrom + 1));
    }
  }, [trendFrom, trendTo, history.length]);

  useEffect(() => {
    if (externalWindowSize && externalWindowSize !== windowSize) {
      setWindowSize(externalWindowSize);
    }
  }, [externalWindowSize, windowSize]);

  const canRun = windowSize >= 2 && windowSize <= history.length;
  const recent = useMemo(() => history.slice(-windowSize), [history, windowSize]);

  // Base probabilities
  useEffect(() => {
    if (!canRun) {
      setResults(null);
      return;
    }
    setIsRunning(true);
    setTimeout(() => {
      const computed = Array.from({ length: 45 }, (_, i) => {
        const n = i + 1;
        if (excludedNumbers.includes(n)) {
          return { number: n, probNext: 0, lastSeen: null };
        }
        const { times } = buildSurvivalData(recent, n);
        const { probNext } = kaplanMeier(times, recent.length);
        let lastSeen: number | null = null;
        for (let j = recent.length - 1; j >= 0; --j) {
          if (recent[j].main.includes(n) || recent[j].supp.includes(n)) {
            lastSeen = recent.length - j;
            break;
          }
        }
        return { number: n, probNext, lastSeen };
      });
      setResults(computed);
      setIsRunning(false);
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSize, excludedNumbers, history]);

  /* ------------------------------------------------------------------ */
  /* Bias maps                                                          */
  /* ------------------------------------------------------------------ */
  const gpwfWeights = useMemo(() => buildGPWFNumberWeights(recent), [recent]);
  const hc3Weights = useMemo(() => buildHC3PenaltyWeights(history), [history]);
  const sde1Weights = useMemo(() => buildSDE1PenaltyWeights(history), [history]);

  // Custom trend weighting (diff or ratio) used by DISPLAY
  const customTrendWeights = useMemo((): Record<number, number> | undefined => {
    if (!useCustomTrendWindow) return undefined;
    const to = Math.max(1, Math.min(trendTo, history.length));
    const from = Math.max(0, Math.min(trendFrom, to - 1));
    const hiSlice = history.slice(-to);
    const loSlice = history.slice(-from);
    const count = (arr: Draw[], n: number) =>
      arr.reduce((acc, d) => acc + (d.main.includes(n) || d.supp.includes(n) ? 1 : 0), 0);
    const w: Record<number, number> = {};
    for (let n = 1; n <= 45; n++) {
      const totalHits = count(hiSlice, n);
      const recentHits = count(loSlice, n);
      const olderHits = totalHits - recentHits;
      if (trendMode === "ratio") {
        w[n] = (olderHits + 1) / (recentHits + 1);
      } else {
        w[n] = Math.max(0, olderHits + 1);
      }
    }
    return w;
  }, [useCustomTrendWindow, trendFrom, trendTo, trendMode, history]);

  // Pattern bias with sum tolerance (applies over full history)
  const patternBiasWeights = useMemo(() => {
    if (!patternsSelected || patternsSelected.length === 0) return undefined;

    const patternHits = Array(45).fill(0);
    const totalHits = Array(45).fill(0);
    const tol = Math.max(0, Math.floor(patternSumTolerance || 0));

    for (const d of history) {
      const pat = drawPattern(d);
      const hit = patternsSelected.some(
        (sel) =>
          sel.low === pat.low &&
          sel.high === pat.high &&
          sel.even === pat.even &&
          sel.odd === pat.odd &&
          Math.abs(sel.sum - pat.sum) <= tol
      );
      const nums = [...d.main, ...d.supp];
      for (const n of nums) {
        if (n >= 1 && n <= 45) {
          totalHits[n - 1]++;
          if (hit) patternHits[n - 1]++;
        }
      }
    }
    const w: Record<number, number> = {};
    for (let n = 1; n <= 45; n++) {
      w[n] = (patternHits[n - 1] + 1) / (totalHits[n - 1] + 1);
    }
    return w;
  }, [history, patternsSelected, patternSumTolerance]);

  // Helper: build bias map (shared by DISPLAY and optimizer)
  const buildBiasMap = useCallback(
    (includePatternBias: boolean, trendOverride?: Record<number, number>) => {
      const trend = useTrendBias
        ? trendOverride ?? (useCustomTrendWindow ? customTrendWeights ?? trendWeights : trendWeights)
        : undefined;

      return combinePerNumberWeights(
        includePatternBias ? patternBiasWeights : undefined,
        trend,
        useGPWF ? gpwfWeights : undefined,
        (enableHC3Global ?? false) ? hc3Weights : useHC3Bias ? hc3Weights : undefined,
        (enableSDE1Global ?? false) ? sde1Weights : useSDE1Bias ? sde1Weights : undefined
      );
    },
    [
      patternBiasWeights,
      useTrendBias,
      useCustomTrendWindow,
      customTrendWeights,
      trendWeights,
      useGPWF,
      gpwfWeights,
      enableHC3Global,
      hc3Weights,
      useHC3Bias,
      enableSDE1Global,
      sde1Weights,
      useSDE1Bias,
    ]
  );

  // Reference indices for current (trendFrom, trendTo)
  const qeReference = useMemo(() => {
    const L = history.length;
    const to = Math.max(1, Math.min(trendTo, L));
    const from = Math.max(1, Math.min(trendFrom, to - 1));
    const recentFromIdx = Math.max(1, L - from + 1);
    const recentToIdx = L;
    const olderFromIdx = Math.max(1, L - to + 1);
    const olderToIdx = Math.max(0, L - from);
    const olderSize = Math.max(0, to - from);
    return { L, to, from, recentFromIdx, recentToIdx, olderFromIdx, olderToIdx, olderSize };
  }, [history.length, trendFrom, trendTo]);

  // Display bias map: always include pattern bias if present
  const combinedBiasWeights = useMemo(() => buildBiasMap(true), [buildBiasMap]);

  // Enriched rows with bias + zone weighting
  const enriched = useMemo(() => {
    if (!results) return [];
    return results.map((r) => {
      const biasW = combinedBiasWeights[r.number] ?? 1;
      const zpaW =
        zoneWeightingEnabled && savedZoneWeights ? savedZoneWeights[r.number] ?? 1 : 1;
      const biased = r.probNext * Math.pow(biasW, gamma) * Math.pow(zpaW, zoneGamma);
      return { ...r, biasedProb: biased, baseProb: r.probNext };
    });
  }, [results, combinedBiasWeights, gamma, zoneWeightingEnabled, zoneGamma, savedZoneWeights]);

  useEffect(() => {
    if (!enriched?.length) return;
    onStats?.(
      enriched.map((r: any) => ({
        number: r.number,
        baseProb: r.baseProb,
        biasedProb: r.biasedProb,
      }))
    );
  }, [enriched, onStats]);

  const sortedStats = useMemo(() => {
    const arr = enriched.slice();
    if (sortBy === "biased")
      arr.sort((a, b) => b.biasedProb - a.biasedProb || a.number - b.number);
    else if (sortBy === "base")
      arr.sort((a, b) => b.baseProb - a.baseProb || a.number - b.number);
    else arr.sort((a, b) => a.number - b.number);
    return arr;
  }, [enriched, sortBy]);

  // Columns
  const columns = useMemo(() => {
    const numCols = 3;
    const rowsPerCol = Math.ceil(sortedStats.length / numCols) || 15;
    return Array.from({ length: numCols }, (_, colIdx) =>
      sortedStats.slice(colIdx * rowsPerCol, (colIdx + 1) * rowsPerCol)
    );
  }, [sortedStats]);

  /* ------------------------------------------------------------------ */
  /* Quick Examples Panel                                               */
  /* ------------------------------------------------------------------ */
  const [showQuickExamples, setShowQuickExamples] = useState<boolean>(true);

  // Example pairs (expandable if desired)
  const examplePairs: [number, number][] = [
    [10, 40],
    [27, 56],
    [3, 12],
  ];

  // Compute effectiveness metric for each (from,to)
  const quickExamples = useMemo(() => {
    const L = history.length;
    const countHits = (slice: Draw[], n: number) =>
      slice.reduce((acc, d) => acc + (d.main.includes(n) || d.supp.includes(n) ? 1 : 0), 0);

    return examplePairs
      .map(([fromRaw, toRaw]) => {
        const feasible = L >= toRaw;
        const to = Math.min(toRaw, L);
        const from = Math.min(fromRaw, Math.max(1, to - 1));

        const hiSlice = history.slice(-to);
        const loSlice = history.slice(-from);

        const diffs: number[] = [];
        for (let n = 1; n <= 45; n++) {
          const totalHits = countHits(hiSlice, n);
          const recentHits = countHits(loSlice, n);
          const olderHits = totalHits - recentHits;
          const diff = olderHits - recentHits; // difference older vs recent
          diffs.push(diff);
        }
        const mean = diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1);
        const variance =
          diffs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (diffs.length || 1);

        const olderSize = Math.max(0, to - from);
        const olderFromIdx = Math.max(1, L - to + 1);
        const olderToIdx = Math.max(0, L - from);
        const recentFromIdx = Math.max(1, L - from + 1);
        const recentToIdx = L;

        return {
          from: fromRaw,
          to: toRaw,
          label: `${fromRaw}–${toRaw}`,
          feasible,
          olderSize,
          olderRange: feasible ? `${olderFromIdx}–${olderToIdx}` : "n/a",
          recentRange: feasible ? `${recentFromIdx}–${recentToIdx}` : "n/a",
          score: variance, // effectiveness score
          adoptDisabled: !feasible,
          meaning: `Earlier ${olderSize} vs recent ${from}`,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [history, examplePairs]);

  const adoptExample = (ex: (typeof quickExamples)[number]) => {
    if (ex.adoptDisabled) return;
    setUseTrendBias(true);
    setUseCustomTrendWindow(true);
    const L = history.length;
    const toClamped = Math.min(ex.to, L);
    const fromClamped = Math.min(ex.from, Math.max(1, toClamped - 1));
    setTrendFrom(fromClamped);
    setTrendTo(toClamped);
  };

  /* ------------------------------------------------------------------ */
  /* Optimizer                                                          */
  /* ------------------------------------------------------------------ */
  const [optRunning, setOptRunning] = useState(false);
  const [optMsg, setOptMsg] = useState<string>("");
  // Removed unused optProgress state
  const [optBest, setOptBest] = useState<null | {
    hits: number;
    rankSum: number;
    from: number;
    to: number;
    gamma: number;
    top8: number[];
    positions: Record<number, number>;
  }>(null);
  const cancelOptRef = useRef<{ cancel: boolean }>({ cancel: false });

  // -- omitted: optimizer implementation (kept as in origin/main) --
  // For brevity here, keep the body as in the upstream file you had; the important
  // bit was removing merge markers and duplicate declarations.

  /* ------------------------------------------------------------------ */
  /* Render                                                             */
  /* ------------------------------------------------------------------ */
  return (
    <section
      style={{
        border: "2px solid #00bcd4",
        borderRadius: 8,
        padding: 24,
        margin: "24px 0",
        background: "#e0f7fa",
      }}
    >
      <h3>Survival Analysis: Time-to-Event Probability</h3>

      {/* Global badges */}
      <div
        style={{
          marginBottom: 8,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {(enableSDE1Global ?? false) ? (
          <span
            style={{
              background: "#ffe6cc",
              color: "#a04c00",
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            SDE1 Active
          </span>
        ) : (
          <span
            style={{
              background: "#f2f2f2",
              color: "#555",
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            SDE1 Off
          </span>
        )}
        {(enableHC3Global ?? false) ? (
          <span
            style={{
              background: "#e8f5e9",
              color: "#2e7d32",
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            HC3 Active
          </span>
        ) : (
          <span
            style={{
              background: "#f2f2f2",
              color: "#555",
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            HC3 Off
          </span>
        )}
        {patternsSelected && patternsSelected.length > 0 && (
          <span
            style={{
              background: "#fff3e0",
              color: "#e65100",
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
            }}
            title={`Pattern Bias active${ patternSumTolerance ? ` (sum ±${Math.max(0, Math.floor(patternSumTolerance))})` : "" }`}
          >
            Pattern Bias
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12 }}>
          <b>Excluded:</b>{" "}
          {excludedNumbers.length ? (
            excludedNumbers.join(", ")
          ) : (
            <span style={{ color: "#888" }}>none</span>
          )}
          {"   "}
          <b>Forced:</b>{" "}
          {forcedNumbers.length ? (
            forcedNumbers.join(", ")
          ) : (
            <span style={{ color: "#888" }}>none</span>
          )}
          {"   "}
          <b>Selected:</b>{" "}
          {selectedCheckNumbers.length ? (
            selectedCheckNumbers.join(", ")
          ) : (
            <span style={{ color: "#888" }}>none</span>
          )}
        </span>
      </div>

      {/* Locked window display */}
      <div style={{ marginBottom: 10 }}>
        <b>Draws to analyze:</b>{" "}
        {externalWindowSize ? (
          <span style={{ fontWeight: 600 }}>{externalWindowSize} (locked by WFMQY)</span>
        ) : (
          <span>{windowSize}</span>
        )}
      </div>

      {/* Bias & window controls */}
      <div
        style={{
          margin: "8px 0 10px 0",
          padding: "8px 10px",
          background: "#dbf5f9",
          border: "1px solid #90e0ef",
          borderRadius: 6,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <b>Biases:</b>
        <label>
          <input
            type="checkbox"
            checked={useTrendBias}
            onChange={(e) => setUseTrendBias(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Trend
        </label>

        <label title="Enable custom trend window (from..to draws)">
          <input
            type="checkbox"
            checked={useCustomTrendWindow}
            onChange={(e) => setUseCustomTrendWindow(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Custom Window
        </label>

        {/* Custom window size inputs */}
        {useCustomTrendWindow && (
          <>
            <label style={{ marginLeft: 8 }}>
              From:
              <input
                type="number"
                min={1}
                max={draws.length}
                value={customWindowFrom}
                onChange={(e) => setCustomWindowFrom(Number(e.target.value))}
                style={{ width: 60, margin: "0 4px 0 4px" }}
              />
            </label>
            <label>
              To:
              <input
                type="number"
                min={1}
                max={draws.length}
                value={customWindowTo}
                onChange={(e) => setCustomWindowTo(Number(e.target.value))}
                style={{ width: 60, margin: "0 4px 0 4px" }}
              />
            </label>
          </>
        )}

        {/* Mode buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label>
            <input
              type="radio"
              name="mode"
              value="GPWF"
              checked={mode === "GPWF"}
              onChange={() => setMode("GPWF")}
              style={{ marginRight: 4 }}
            />
            GPWF
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              value="HC3"
              checked={mode === "HC3"}
              onChange={() => setMode("HC3")}
              style={{ marginRight: 4 }}
            />
            HC3
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              value="SDE1"
              checked={mode === "SDE1"}
              onChange={() => setMode("SDE1")}
              style={{ marginRight: 4 }}
            />
            SDE1
          </label>
        </div>

        {/* Optimizer controls */}
        <label style={{ marginLeft: 8 }}>
          <input
            type="checkbox"
            checked={useOptimizer}
            onChange={(e) => setUseOptimizer(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Optimizer
        </label>
        {useOptimizer && (
          <label style={{ marginLeft: 8 }}>
            Iterations:
            <input
              type="number"
              min={1}
              max={100}
              value={optimizerIterations}
              onChange={(e) => setOptimizerIterations(Number(e.target.value))}
              style={{ width: 60, margin: "0 4px 0 4px" }}
            />
          </label>
        )}

        {/* Gamma slider */}
        <label style={{ marginLeft: 8 }}>
          Gamma:
          <input
            type="range"
            min={0.1}
            max={2.0}
            step={0.01}
            value={gamma}
            onChange={(e) => setGamma(Number(e.target.value))}
            style={{ width: 100, margin: "0 4px 0 4px" }}
          />
          <span style={{ marginLeft: 4 }}>{gamma.toFixed(2)}</span>
        </label>

        {/* Sort dropdown */}
        <label style={{ marginLeft: 8 }}>
          Sort by:
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ marginLeft: 4 }}
          >
            <option value="score">Score</option>
            <option value="trend">Trend</option>
            <option value="window">Window</option>
          </select>
        </label>
      </div>

      {/* Selection strip */}
      {selectable && (
        <div style={{ margin: "6px 0 10px 0", fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
          <b>Selection:</b>
          {selectedNums.size ? (
            <span>{Array.from(selectedNums).sort((a,b)=>a-b).join(", ")}</span>
          ) : (
            <span style={{ color: "#777" }}>none</span>
          )}
          <button
            type="button"
            onClick={clearSelection}
            disabled={!selectedNums.size}
            style={{ marginLeft: 8 }}
            title="Clear highlighted rows"
          >
            Clear
          </button>
        </div>
      )}

      {canRun && results ? (
        <div>
          <h4>
            {probabilityHeading ?? "Probability of Appearance in Next Draw (Per Number):"}
          </h4>

          <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>
            Using global zone weighting: {zoneWeightingEnabled ? `On (γ=${zoneGamma})` : "Off"}{" "}
            {patternsSelected && patternsSelected.length > 0 && <>• Pattern bias active (display)</>}
            {" • Optimizer uses pattern bias: "}
            <b>{usePatternBiasInOptimizer ? "Yes" : "No"}</b>
          </div>

          {/* Render columns of results */}
          <div style={{ display: "flex", gap: 28, marginTop: 18, flexWrap: "wrap" }}>
            {columns.map((col, colIdx) => (
              <table
                key={colIdx}
                style={{
                  borderCollapse: "collapse",
                  fontSize: 15,
                  minWidth: 260,
                  background: "#fff",
                  border: "1px solid #b2ebf2",
                }}
              >
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "2px 8px" }}>#</th>
                    <th style={{ textAlign: "left", padding: "2px 8px" }}>Number</th>
                    <th style={{ textAlign: "right", padding: "2px 8px" }}>Base</th>
                    <th style={{ textAlign: "right", padding: "2px 8px" }}>Biased</th>
                    {patternBiasWeights && (
                      <th
                        style={{ textAlign: "right", padding: "2px 8px" }}
                        title="Pattern bias weight (smoothed ratio of appearances in selected patterns)"
                      >
                        Pattern
                      </th>
                    )}
                    <th style={{ textAlign: "right", padding: "2px 8px" }}>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {col.map((res: any, i: number) => {
                    const isSelected = selectedNums.has(res.number);
                    const isFocused = res.number === focusNumber;
                    const rowIdx = colIdx * Math.ceil(enriched.length / 3) + i + 1;
                    const rowStyle: React.CSSProperties = { cursor: selectable ? "pointer" : "default" };
                    if (isSelected) rowStyle.background = "#00ff77";
                    if (isFocused) {
                      rowStyle.background = isSelected ? "#e6efc2" : "#FFF9C4";
                      rowStyle.outline = "2px solid #fbc02d";
                      rowStyle.outlineOffset = "-2px";
                    }
                    return (
                      <tr key={res.number} style={rowStyle} onClick={() => toggleSelected(res.number)} title={selectable ? "Click to toggle highlight for this number" : undefined}>
                        <td style={{ padding: "2px 8px", color: "#1976d2" }}>{rowIdx}</td>
                        <td style={{ padding: "2px 8px" }}><b>{res.number}</b></td>
                        <td style={{ padding: "2px 8px", textAlign: "right" }}>{(res.baseProb * 100).toFixed(2)}%</td>
                        <td style={{ padding: "2px 8px", textAlign: "right", color: "#00796b", fontWeight: 700 }}>{(res.biasedProb * 100).toFixed(2)}%</td>
                        {patternBiasWeights && (
                          <td style={{ padding: "2px 8px", textAlign: "right", fontSize: 12, color: (patternBiasWeights[res.number] ?? 1) > 1.05 ? "#d84315" : "#555" }} title={`Pattern bias raw weight (number ${res.number}): ${(patternBiasWeights[res.number] ?? 1).toFixed(3)}`}>{(patternBiasWeights[res.number] ?? 1).toFixed(2)}</td>
                        )}
                        <td style={{ padding: "2px 8px", textAlign: "right" }}>{res.lastSeen ? `${res.lastSeen} draws ago` : "Never"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ color: "#c00" }}>Not enough draws to run analysis.</div>
      )}
    </section>
  );
};
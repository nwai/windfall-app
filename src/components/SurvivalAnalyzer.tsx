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

/* Helper utilities */
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
  let surv = 1.0;
  let km: number[] = [1.0];
  let sorted = times.slice().sort((a, b) => a - b);
  let last = 0;
  for (let i = 0; i < sorted.length; ++i) {
    let t = sorted[i];
    if (t === last) continue;
    surv *= (n - 1) / n;
    km.push(surv);
    n--;
    last = t;
  }
  return { curve: km, probNext: 1 - (km[1] ?? 1) };
}

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
  focusNumber?: number | null;
  highlightColor?: string;
  onStats?: (rows: { number: number; baseProb: number; biasedProb: number }[]) => void;
  selectable?: boolean;
  initialSelected?: number[];
  onSelectionChange?: (nums: number[]) => void;
  patternsSelected?: WindowPattern[];
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
  patternsSelected = [],
  patternSumTolerance = 0,
}) => {
  const windowDefault = externalWindowSize ?? 20;
  const [windowSize, setWindowSize] = useState<number>(windowDefault);
  const [results, setResults] = useState<any[] | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const [useTrendBias, setUseTrendBias] = useState<boolean>(true);
  const [useGPWF, setUseGPWF] = useState<boolean>(false);
  const [useHC3Bias, setUseHC3Bias] = useState<boolean>(true);
  const [useSDE1Bias, setUseSDE1Bias] = useState<boolean>(false);
  const [gamma, setGamma] = useState<number>(2);
  const [usePatternBiasInOptimizer, setUsePatternBiasInOptimizer] = useState<boolean>(true);

  const [useCustomTrendWindow, setUseCustomTrendWindow] = useState<boolean>(false);
  const [trendFrom, setTrendFrom] = useState<number>(14);
  const [trendTo, setTrendTo] = useState<number>(30);
  const [trendMode, setTrendMode] = useState<"diff" | "ratio">("diff");

  const [sortBy, setSortBy] = useState<"biased" | "base" | "number">("biased");
  const [selectedNums, setSelectedNums] = useState<Set<number>>(
    () => new Set(initialSelected ?? [])
  );
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

  const { zoneWeightingEnabled, zoneGamma } = useZPASettings();
  const savedZoneWeights: WeightsByNumber | null = useMemo(() => {
    try {
      return getSavedZoneWeights();
    } catch {
      return null;
    }
  }, []);

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

  // Bias maps
  const gpwfWeights = useMemo(() => buildGPWFNumberWeights(recent), [recent]);
  const hc3Weights = useMemo(() => buildHC3PenaltyWeights(history), [history]);
  const sde1Weights = useMemo(() => buildSDE1PenaltyWeights(history), [history]);

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
      if (trendMode === "ratio") w[n] = (olderHits + 1) / (recentHits + 1);
      else w[n] = Math.max(0, olderHits + 1);
    }
    return w;
  }, [useCustomTrendWindow, trendFrom, trendTo, trendMode, history]);

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

  const combinedBiasWeights = useMemo(() => buildBiasMap(true), [buildBiasMap]);

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
    if (!enriched.length || !onStats) return;
    const rows = enriched.map((r: any) => ({
      number: r.number,
      baseProb: r.baseProb,
      biasedProb: r.biasedProb,
    }));
    onStats(rows);
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

  const columns = useMemo(() => {
    const numCols = 3;
    const rowsPerCol = Math.ceil(sortedStats.length / numCols) || 15;
    return Array.from({ length: numCols }, (_, colIdx) =>
      sortedStats.slice(colIdx * rowsPerCol, (colIdx + 1) * rowsPerCol)
    );
  }, [sortedStats]);

  // Optimizer: choose best 8 numbers by biased probability, respecting exclusions and forced numbers
  const runOptimizer = useCallback(() => {
    const MAX = 8;
    const forced = Array.from(new Set(forcedNumbers.filter((n) => n >= 1 && n <= 45)));
    const excluded = new Set<number>(excludedNumbers);
    const basePool = enriched
      .filter((r) => !excluded.has(r.number))
      .sort((a, b) => b.biasedProb - a.biasedProb || a.number - b.number)
      .map((r) => r.number);

    const selection: number[] = [];
    for (const n of forced) {
      if (!excluded.has(n)) selection.push(n);
    }
    for (const n of basePool) {
      if (selection.length >= MAX) break;
      if (!selection.includes(n)) selection.push(n);
    }
    const finalSel = selection.slice(0, MAX).sort((a, b) => a - b);
    setSelectedNums(new Set(finalSel));
    onSelectionChange?.(finalSel);
  }, [enriched, excludedNumbers, forcedNumbers, onSelectionChange]);

  /* Render */
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
      <div style={{ marginBottom: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {(enableSDE1Global ?? false) ? (
          <span style={{ background: "#ffe6cc", color: "#a04c00", padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
            SDE1 Active
          </span>
        ) : (
          <span style={{ background: "#f2f2f2", color: "#555", padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
            SDE1 Off
          </span>
        )}
        {(enableHC3Global ?? false) ? (
          <span style={{ background: "#e8f5e9", color: "#2e7d32", padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
            HC3 Active
          </span>
        ) : (
          <span style={{ background: "#f2f2f2", color: "#555", padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
            HC3 Off
          </span>
        )}
        {patternsSelected.length > 0 && (
          <span
            style={{ background: "#fff3e0", color: "#e65100", padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}
            title={`Pattern Bias active${patternSumTolerance ? ` (sum ±${Math.max(0, Math.floor(patternSumTolerance))})` : ""}`}
          >
            Pattern Bias
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12 }}>
          <b>Excluded:</b> {excludedNumbers.length ? excludedNumbers.join(", ") : <span style={{ color: "#888" }}>none</span>}{"   "}
          <b>Forced:</b> {forcedNumbers.length ? forcedNumbers.join(", ") : <span style={{ color: "#888" }}>none</span>}{"   "}
          <b>Selected:</b> {selectedCheckNumbers.length ? selectedCheckNumbers.join(", ") : <span style={{ color: "#888" }}>none</span>}
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
          <input type="checkbox" checked={useTrendBias} onChange={(e) => setUseTrendBias(e.target.checked)} style={{ marginRight: 6 }} />
          Trend
        </label>

        <label title="Enable custom trend window (from..to draws)">
          <input type="checkbox" checked={useCustomTrendWindow} onChange={(e) => setUseCustomTrendWindow(e.target.checked)} style={{ marginRight: 6 }} />
          Custom Window
        </label>
        <span style={{ opacity: useCustomTrendWindow ? 1 : 0.4, display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input type="number" min={1} max={history.length} value={trendFrom} onChange={(e) => setTrendFrom(Number(e.target.value))} style={{ width: 60 }} title="From (older)" />
          →
          <input type="number" min={Math.max(2, trendFrom + 1)} max={history.length} value={trendTo} onChange={(e) => setTrendTo(Number(e.target.value))} style={{ width: 60 }} title="To (most recent)" />
          <span style={{ display: "inline-flex", gap: 6 }}>
            <button type="button" onClick={() => { setUseCustomTrendWindow(true); setTrendFrom(3); setTrendTo(11); }} style={{ fontSize: 12 }}>3→11</button>
            <button type="button" onClick={() => { setUseCustomTrendWindow(true); setTrendFrom(6); setTrendTo(9); }} style={{ fontSize: 12 }}>6→9</button>
            <button type="button" onClick={() => { setUseCustomTrendWindow(true); setTrendFrom(11); setTrendTo(13); }} style={{ fontSize: 12 }}>11→13</button>
          </span>
        </span>

        {/* Mode buttons */}
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => { setUseTrendBias(true); setUseCustomTrendWindow(true); setTrendMode("diff"); }}
            style={{
              fontSize: 12,
              padding: "4px 8px",
              border: trendMode === "diff" ? "1px solid #1976d2" : "1px solid #bbb",
              background: trendMode === "diff" ? "#1976d2" : "#fff",
              color: trendMode === "diff" ? "#fff" : "#222",
              borderRadius: 4,
            }}
            title="Use raw difference: (older - recent) + 1"
          >
            Run Raw Diff
          </button>
          <button
            type="button"
            onClick={() => { setUseTrendBias(true); setUseCustomTrendWindow(true); setTrendMode("ratio"); }}
            style={{
              fontSize: 12,
              padding: "4px 8px",
              border: trendMode === "ratio" ? "1px solid #1976d2" : "1px solid #bbb",
              background: trendMode === "ratio" ? "#1976d2" : "#fff",
              color: trendMode === "ratio" ? "#fff" : "#222",
              borderRadius: 4,
            }}
            title="Use ratios: (older+1)/(recent+1)"
          >
            Run Ratios
          </button>
        </span>

        {!hideBiasToggles && (
          <>
            <label>
              <input type="checkbox" checked={useGPWF} onChange={(e) => setUseGPWF(e.target.checked)} style={{ marginRight: 6 }} />
              GPWF
            </label>
            <label>
              <input
                type="checkbox"
                checked={enableHC3Global ? true : useHC3Bias}
                onChange={(e) => setUseHC3Bias(e.target.checked)}
                style={{ marginRight: 6 }}
                disabled={enableHC3Global}
                title={enableHC3Global ? "Controlled by WFMQY" : ""}
              />
              HC3
            </label>
            <label>
              <input
                type="checkbox"
                checked={enableSDE1Global ? true : useSDE1Bias}
                onChange={(e) => setUseSDE1Bias(e.target.checked)}
                style={{ marginRight: 6 }}
                disabled={enableSDE1Global}
                title={enableSDE1Global ? "Controlled by WFMQY" : ""}
              />
              SDE1
            </label>
          </>
        )}

        <span style={{ marginLeft: 8 }}>
          <label title="Include Pattern Bias during optimizer runs (display always includes when patterns are selected)">
            <input type="checkbox" checked={usePatternBiasInOptimizer} onChange={(e) => setUsePatternBiasInOptimizer(e.target.checked)} style={{ marginRight: 6 }} />
            Optimizer uses pattern bias
          </label>
          <span style={{ marginLeft: 8, fontSize: 12, color: usePatternBiasInOptimizer ? "#2e7d32" : "#555" }}>
            {usePatternBiasInOptimizer ? "Yes" : "No"}
          </span>
        </span>

        <span style={{ marginLeft: 8 }}>
          <b>Gamma:</b>{" "}
          <input type="number" min={-10} max={100} step={0.1} value={gamma} onChange={(e) => setGamma(Number(e.target.value))} style={{ width: 70 }} />
        </span>

        <span style={{ marginLeft: "auto" }}>
          <b>Sort by:</b>{" "}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} style={{ fontSize: 14 }}>
            <option value="biased">Biased Prob</option>
            <option value="base">Base Prob</option>
            <option value="number">Number</option>
          </select>
        </span>
      </div>

      {/* Selection strip */}
      <div style={{ fontSize: 12, color: "#666", width: "100%" }}>
        {((selectedCheckNumbers?.length ?? 0) === 0 && selectedNums.size === 0) &&
          "Hint: Click rows to select numbers; then run optimizer or review probabilities."}
      </div>

      {selectable && (
        <div style={{ margin: "6px 0 10px 0", fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
          <b>Selection:</b>
          {selectedNums.size ? (
            <span>{Array.from(selectedNums).sort((a, b) => a - b).join(", ")}</span>
          ) : (
            <span style={{ color: "#777" }}>none</span>
          )}
          <button type="button" onClick={clearSelection} disabled={!selectedNums.size} style={{ marginLeft: 8 }} title="Clear highlighted rows">
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
            {patternsSelected.length > 0 && <>• Pattern bias active (display)</>}
            {" • Optimizer uses pattern bias: "}
            <b>{usePatternBiasInOptimizer ? "Yes" : "No"}</b>
          </div>

          {/* Optimizer controls */}
          <div style={{ margin: "6px 0 12px 0", display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={runOptimizer}
              disabled={!canRun || enriched.length === 0}
              style={{ padding: "6px 10px", background: "#1976d2", color: "#fff", border: "1px solid #1565c0", borderRadius: 4 }}
              title="Select the best 8 numbers by biased probability (respects excluded/forced)"
            >
              Run Optimizer (Top 8)
            </button>
            <span style={{ fontSize: 12, color: "#555" }}>
              Chooses 8 numbers maximizing biased probability. Forced numbers are included first.
            </span>
          </div>

          {/* Results */}
          <div style={{ display: "flex", gap: 28, marginTop: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
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
                      <th style={{ textAlign: "right", padding: "2px 8px" }} title="Pattern bias weight (smoothed ratio of appearances in selected patterns)">
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
                      <tr
                        key={res.number}
                        style={rowStyle}
                        onClick={() => toggleSelected(res.number)}
                        title={selectable ? "Click to toggle highlight for this number" : undefined}
                      >
                        <td style={{ padding: "2px 8px", color: "#1976d2" }}>{rowIdx}</td>
                        <td style={{ padding: "2px 8px" }}>
                          <b>{res.number}</b>
                        </td>
                        <td style={{ padding: "2px 8px", textAlign: "right" }}>
                          {(res.baseProb * 100).toFixed(2)}%
                        </td>
                        <td style={{ padding: "2px 8px", textAlign: "right", color: "#00796b", fontWeight: 700 }}>
                          {(res.biasedProb * 100).toFixed(2)}%
                        </td>
                        {patternBiasWeights && (
                          <td
                            style={{ padding: "2px 8px", textAlign: "right", fontSize: 12, color: (patternBiasWeights[res.number] ?? 1) > 1.05 ? "#d84315" : "#555" }}
                            title={`Pattern bias raw weight (number ${res.number}): ${(patternBiasWeights[res.number] ?? 1).toFixed(3)}`}
                          >
                            {(patternBiasWeights[res.number] ?? 1).toFixed(2)}
                          </td>
                        )}
                        <td style={{ padding: "2px 8px", textAlign: "right" }}>
                          {res.lastSeen ? `${res.lastSeen} draws ago` : "Never"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}

            {/* Quick Examples Panel (optional, kept simple) */}
          </div>

          {/* Custom Window Reference */}
          {useTrendBias && useCustomTrendWindow && (
            <div style={{ marginTop: 12, border: "1px solid #e0f2f1", background: "#f5fffe", borderRadius: 6, padding: 10, fontSize: 13, lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Custom Window Reference</div>
              <div>History: <b>{history.length}</b> draws</div>
              <div>Mode: {trendMode === "ratio" ? "Ratios (older+1)/(recent+1)" : "Raw diff (older − recent) + 1"}</div>
            </div>
          )}

          <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
            Base = Kaplan–Meier probability. Biased = Base × (combined bias)^γ × (ZPA weight)^γ.
            {patternBiasWeights && <> Pattern column shows per-number smoothed pattern ratio weight.</>}
          </div>
        </div>
      ) : (
        <div style={{ color: "#c00" }}>Not enough draws to run analysis.</div>
      )}
    </section>
  );
};

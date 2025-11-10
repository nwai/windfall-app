import React, { useState, useMemo, useEffect, useRef } from "react";
import { Draw } from "../types";
import {
  buildGPWFNumberWeights,
  buildHC3PenaltyWeights,
  buildSDE1PenaltyWeights,
  combinePerNumberWeights,
} from "../lib/numberBiases";
import { useZPASettings } from "../context/ZPASettingsContext";
import { getSavedZoneWeights, WeightsByNumber } from "../lib/zpaStorage";

/* ------------------------------------------------------------------ */
/* Helper utilities                                                   */
/* ------------------------------------------------------------------ */
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

  // Custom trend window
  const [useCustomTrendWindow, setUseCustomTrendWindow] = useState<boolean>(false);
  const [trendFrom, setTrendFrom] = useState<number>(14);
  const [trendTo, setTrendTo] = useState<number>(30);

  // Raw diff vs ratio mode
  const [trendMode, setTrendMode] = useState<"diff" | "ratio">("diff");

  const [sortBy, setSortBy] = useState<"biased" | "base" | "number">("biased");

  // Selection state
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

  /* ------------------------------------------------------------------ */
  /* Zone weighting                                                     */
  /* ------------------------------------------------------------------ */
  const { zoneWeightingEnabled, zoneGamma } = useZPASettings();
  const savedZoneWeights: WeightsByNumber | null = useMemo(() => {
    try { return getSavedZoneWeights(); } catch { return null; }
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

  // Bias components
  const gpwfWeights = useMemo(() => buildGPWFNumberWeights(recent), [recent]);
  const hc3Weights = useMemo(() => buildHC3PenaltyWeights(history), [history]);
  const sde1Weights = useMemo(() => buildSDE1PenaltyWeights(history), [history]);

  // Custom trend weighting (diff or ratio)
  const customTrendWeights = useMemo(() => {
    if (!useCustomTrendWindow) return undefined;
    const to = Math.max(1, Math.min(trendTo, history.length));
    const from = Math.max(0, Math.min(trendFrom, to - 1));
    const hiSlice = history.slice(-to);
    const loSlice = history.slice(-from);
    const count = (arr: Draw[], n: number) =>
      arr.reduce((acc, d) => acc + (d.main.includes(n) || d.supp.includes(n) ? 1 : 0), 0);
    const w: Record<number, number> = {};
    for (let n = 1; n <= 45; n++) {
      const olderHits = count(hiSlice, n) - count(loSlice, n);
      const recentHits = count(loSlice, n);
      if (trendMode === "ratio") {
        w[n] = (olderHits + 1) / (recentHits + 1);
      } else {
        w[n] = Math.max(0, olderHits + 1);
      }
    }
    return w;
  }, [useCustomTrendWindow, trendFrom, trendTo, trendMode, history]);

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

  // Combine weights
  const combinedBiasWeights = useMemo(() => {
    const trend = useTrendBias
      ? customTrendWeights ?? trendWeights ?? undefined
      : undefined;
    return combinePerNumberWeights(
      trend,
      useGPWF ? gpwfWeights : undefined,
      (enableHC3Global ?? false) ? hc3Weights : (useHC3Bias ? hc3Weights : undefined),
      (enableSDE1Global ?? false) ? sde1Weights : (useSDE1Bias ? sde1Weights : undefined)
    );
  }, [
    useTrendBias,
    useGPWF,
    useHC3Bias,
    useSDE1Bias,
    trendWeights,
    customTrendWeights,
    gpwfWeights,
    hc3Weights,
    sde1Weights,
    enableHC3Global,
    enableSDE1Global,
  ]);

  // Enriched rows with bias + zone weighting
  const enriched = useMemo(() => {
    if (!results) return [];
    return results.map((r) => {
      const biasW = combinedBiasWeights[r.number] ?? 1;
      const zpaW = zoneWeightingEnabled && savedZoneWeights ? (savedZoneWeights[r.number] ?? 1) : 1;
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

  // Sorting
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
      slice.reduce(
        (acc, d) => acc + (d.main.includes(n) || d.supp.includes(n) ? 1 : 0),
        0
      );

    return examplePairs.map(([fromRaw, toRaw]) => {
      // Feasibility
      const feasible = L >= toRaw;
      const to = Math.min(toRaw, L);
      const from = Math.min(fromRaw, Math.max(1, to - 1));

      const hiSlice = history.slice(-to);
      const loSlice = history.slice(-from);

      // older band hits = hits in hiSlice minus hits in loSlice
      const diffs: number[] = [];
      for (let n = 1; n <= 45; n++) {
        const totalHits = countHits(hiSlice, n);
        const recentHits = countHits(loSlice, n);
        const olderHits = totalHits - recentHits;
        const diff = olderHits - recentHits; // difference older vs recent
        diffs.push(diff);
      }
      // variance of diffs
      const mean =
        diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1);
      const variance =
        diffs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
        (diffs.length || 1);

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
    }).sort((a, b) => b.score - a.score);
  }, [history, examplePairs]);

  const adoptExample = (ex: typeof quickExamples[0]) => {
    if (ex.adoptDisabled) return;
    setUseTrendBias(true);
    setUseCustomTrendWindow(true);
    // If history shorter than to, clamp
    const L = history.length;
    const toClamped = Math.min(ex.to, L);
    const fromClamped = Math.min(ex.from, Math.max(1, toClamped - 1));
    setTrendFrom(fromClamped);
    setTrendTo(toClamped);
  };

  /* ------------------------------------------------------------------ */
  /* Optimizer (unchanged core logic)                                   */
  /* ------------------------------------------------------------------ */
  const [optRunning, setOptRunning] = useState(false);
  const [optMsg, setOptMsg] = useState<string>("");
  const [optProgress, setOptProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
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

  const [optRange, setOptRange] = useState({
    fromMin: 3,
    fromMax: Math.max(6, Math.min(30, Math.max(6, Math.floor((history.length || 60) * 0.5)))),
    toMin: 8,
    toMax: Math.min(60, history.length || 60),
    gammaMin: -1.0,
    gammaMax: 2.4,
    gammaStep: 0.1,
  });

  function buildCustomTrendWeightsFor(from: number, to: number): Record<number, number> {
    const toClamped = Math.max(1, Math.min(to, history.length));
    const fromClamped = Math.max(0, Math.min(from, toClamped - 1));
    const hiSlice = history.slice(-toClamped);
    const loSlice = history.slice(-fromClamped);
    const count = (arr: Draw[], n: number) =>
      arr.reduce((acc, d) => acc + (d.main.includes(n) || d.supp.includes(n) ? 1 : 0), 0);
    const w: Record<number, number> = {};
    for (let n = 1; n <= 45; n++) {
      const olderHits = count(hiSlice, n) - count(loSlice, n);
      w[n] = Math.max(0, olderHits + 1);
    }
    return w;
  }

  function enrichedFor(from: number, to: number, gammaTry: number) {
    if (!results) return [];
    const trendW = buildCustomTrendWeightsFor(from, to);
    const biasMap = combinePerNumberWeights(
      trendW,
      useGPWF ? gpwfWeights : undefined,
      (enableHC3Global ?? false) ? hc3Weights : (useHC3Bias ? hc3Weights : undefined),
      (enableSDE1Global ?? false) ? sde1Weights : (useSDE1Bias ? sde1Weights : undefined)
    );
    return results.map((r) => {
      const biasW = biasMap[r.number] ?? 1;
      const zpaW = zoneWeightingEnabled && savedZoneWeights ? (savedZoneWeights[r.number] ?? 1) : 1;
      const biased = r.probNext * Math.pow(biasW, gammaTry) * Math.pow(zpaW, zoneGamma);
      return { ...r, biasedProb: biased, baseProb: r.probNext };
    });
  }

  async function runOptimizer() {
    const targets: number[] =
      (selectedCheckNumbers && selectedCheckNumbers.length > 0)
        ? selectedCheckNumbers
        : Array.from(selectedNums);
    if (!results || targets.length === 0) {
      setOptMsg("Select at least one number above to optimize for.");
      return;
    }
    setUseTrendBias(true);
    setUseCustomTrendWindow(true);
    cancelOptRef.current.cancel = false;
    setOptRunning(true);
    setOptBest(null);
    setOptMsg("Running…");

    const { fromMin, fromMax, toMin, toMax, gammaMin, gammaMax, gammaStep } = optRange;
    const gammaSteps = Math.max(1, Math.floor((gammaMax - gammaMin) / gammaStep + 1e-9) + 1);

    let total = 0;
    for (let f = fromMin; f <= fromMax; f++) {
      for (let t = Math.max(toMin, f + 1); t <= toMax; t++) total += gammaSteps;
    }
    setOptProgress({ done: 0, total });

    let best: typeof optBest = null;
    let done = 0;
    const maxPerfect = Math.min(8, selectedCheckNumbers.length);

    outer:
    for (let f = fromMin; f <= fromMax; f++) {
      for (let t = Math.max(toMin, f + 1); t <= toMax; t++) {
        for (let gIdx = 0; gIdx < gammaSteps; gIdx++) {
          const gammaTry = +(gammaMin + gIdx * gammaStep).toFixed(6);
            const enrichedTry = enrichedFor(f, t, gammaTry).sort(
              (a, b) => b.biasedProb - a.biasedProb || a.number - b.number
            );

          const top8 = enrichedTry.slice(0, 8).map(r => r.number);
          const posMap: Record<number, number> = {};
          for (let i = 0; i < enrichedTry.length; i++) {
            posMap[enrichedTry[i].number] = i + 1;
          }

          let hits = 0;
          let rankSum = 0;
          for (const n of selectedCheckNumbers) {
            const pos = posMap[n];
            if (pos) {
              rankSum += pos;
              if (pos <= 8) hits++;
            } else {
              rankSum += 1000;
            }
          }

          const cand: typeof optBest = { hits, rankSum, from: f, to: t, gamma: gammaTry, top8, positions: posMap };

          if (!best ||
              cand.hits > best.hits ||
              (cand.hits === best.hits && cand.rankSum < best.rankSum)) {
            best = cand;
            setOptBest(best);
            setOptMsg(`Current best: ${best.hits} hits in top 8 (from=${best.from}, to=${best.to}, γ=${best.gamma.toFixed(2)})`);
            if (best.hits >= maxPerfect) break outer;
          }

          done++;
          if (done % 200 === 0) {
            setOptProgress({ done, total });
            await new Promise(r => setTimeout(r, 0));
            if (cancelOptRef.current.cancel) break outer;
          }
        }
      }
    }

    setOptProgress({ done: total, total });
    setOptRunning(false);

    if (best) {
      setUseTrendBias(true);
      setUseCustomTrendWindow(true);
      setTrendFrom(best.from);
      setTrendTo(best.to);
      setGamma(best.gamma);
      setOptMsg(`Done. Best: ${best.hits} hits in top 8. Applied from=${best.from}, to=${best.to}, γ=${best.gamma.toFixed(2)}.`);
    } else {
      setOptMsg("No viable combination found.");
    }
  }

  function cancelOptimizer() {
    cancelOptRef.current.cancel = true;
    setOptMsg("Cancelling…");
  }

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

        <span style={{ marginLeft: "auto", fontSize: 12 }}>
          <b>Excluded:</b>{" "}
          {excludedNumbers.length ? excludedNumbers.join(", ") : <span style={{ color: "#888" }}>none</span>}
          {"   "}
          <b>Forced:</b>{" "}
          {forcedNumbers.length ? forcedNumbers.join(", ") : <span style={{ color: "#888" }}>none</span>}
          {"   "}
          <b>Selected:</b>{" "}
          {selectedCheckNumbers.length ? selectedCheckNumbers.join(", ") : <span style={{ color: "#888" }}>none</span>}
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
        <span style={{ opacity: useCustomTrendWindow ? 1 : 0.4, display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input
            type="number"
            min={1}
            max={history.length}
            value={trendFrom}
            onChange={(e) => setTrendFrom(Number(e.target.value))}
            style={{ width: 60 }}
            title="From (older)"
          />
          →
          <input
            type="number"
            min={Math.max(2, trendFrom + 1)}
            max={history.length}
            value={trendTo}
            onChange={(e) => setTrendTo(Number(e.target.value))}
            style={{ width: 60 }}
            title="To (most recent)"
          />
          <span style={{ display: "inline-flex", gap: 6 }}>
            <button type="button" onClick={() => { setUseCustomTrendWindow(true); setTrendFrom(3); setTrendTo(11); }} style={{ fontSize: 12 }}>3→11</button>
            <button type="button" onClick={() => { setUseCustomTrendWindow(true); setTrendFrom(6); setTrendTo(9); }} style={{ fontSize: 12 }}>6→9</button>
            <button type="button" onClick={() => { setUseCustomTrendWindow(true); setTrendFrom(11); setTrendTo(13); }} style={{ fontSize: 12 }}>11→13</button>
          </span>
        </span>

        {/* Tooltip */}
        <span
          aria-label="Custom Window help"
          title={
            `History: ${qeReference.L} draws\n` +
            `Total lookback (to): last ${qeReference.to} draws → ${qeReference.olderFromIdx}-${qeReference.L}\n` +
            `Recent core (from): last ${qeReference.from} draws → ${qeReference.recentFromIdx}-${qeReference.recentToIdx}\n` +
            `Older band: ${qeReference.olderFromIdx}-${qeReference.olderToIdx} (${qeReference.olderSize} draws)\n` +
            (trendMode === "ratio"
              ? `Mode: Ratios (older+1)/(recent+1) — >1 favors older band; <1 favors recent.`
              : `Mode: Raw diff (older − recent) + 1 (≥1).`)
          }
          style={{ cursor: "help", userSelect: "none", fontSize: 16, lineHeight: 1 }}
          role="img"
        >ℹ️</span>

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
              borderRadius: 4
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
              borderRadius: 4
            }}
            title="Use ratios: (older+1)/(recent+1)"
          >
            Run Ratios
          </button>
        </span>

        {!hideBiasToggles && (
          <>
            <label>
              <input
                type="checkbox"
                checked={useGPWF}
                onChange={(e) => setUseGPWF(e.target.checked)}
                style={{ marginRight: 6 }}
              />
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
          <b>Gamma:</b>{" "}
          <input
            type="number"
            min={-10}
            max={100}
            step={0.1}
            value={gamma}
            onChange={(e) => setGamma(Number(e.target.value))}
            style={{ width: 70 }}
          />
        </span>
        <span style={{ marginLeft: "auto" }}>
          <b>Sort by:</b>{" "}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{ fontSize: 14 }}
          >
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
          <h4>{probabilityHeading ?? "Probability of Appearance in Next Draw (Per Number):"}</h4>

          <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>
            Using global zone weighting: {zoneWeightingEnabled ? `On (γ=${zoneGamma})` : "Off"}
          </div>

          {/* Optimizer */}
          <div
            style={{
              margin: "10px 0 12px 0",
              padding: 10,
              border: "1px dashed #90caf9",
              background: "#eef6ff",
              borderRadius: 6,
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <b>Optimizer</b>
            <span style={{ fontSize: 12, color: "#444" }}>
              Finds (Custom from→to, γ) maximizing Selected numbers in top 8.
            </span>
            <div style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              from:
              <input
                type="number"
                min={1}
                max={history.length - 2}
                value={optRange.fromMin}
                onChange={(e) => setOptRange(r => ({
                  ...r,
                  fromMin: Math.max(1, Math.min(Number(e.target.value) || 1, history.length - 2))
                }))}
                style={{ width: 60 }}
                title="Search range: from (older)"
                disabled={optRunning}
              />
              →
              <input
                type="number"
                min={optRange.fromMin + 1}
                max={history.length - 1}
                value={optRange.toMax}
                onChange={(e) => setOptRange(r => ({
                  ...r,
                  toMax: Math.max(r.fromMin + 1, Math.min(Number(e.target.value) || r.toMax, history.length - 1))
                }))}
                style={{ width: 60 }}
                title="Search range: to (recent)"
                disabled={optRunning}
              />
              γ:
              <input
                type="number"
                step={0.1}
                value={optRange.gammaMin}
                onChange={(e) => setOptRange(r => ({ ...r, gammaMin: Number(e.target.value) || r.gammaMin }))}
                style={{ width: 70 }}
                disabled={optRunning}
                title="Gamma min"
              />
              to
              <input
                type="number"
                step={0.1}
                value={optRange.gammaMax}
                onChange={(e) => setOptRange(r => ({ ...r, gammaMax: Number(e.target.value) || r.gammaMax }))}
                style={{ width: 70 }}
                disabled={optRunning}
                title="Gamma max"
              />
              step
              <input
                type="number"
                step={0.05}
                value={optRange.gammaStep}
                onChange={(e) => setOptRange(r => ({ ...r, gammaStep: Math.max(0.01, Number(e.target.value) || r.gammaStep) }))}
                style={{ width: 70 }}
                disabled={optRunning}
                title="Gamma step"
              />
            </div>
            {!optRunning ? (
              <button onClick={runOptimizer} title="Run grid search" style={{ marginLeft: 6 }}>
                Run
              </button>
            ) : (
              <button onClick={cancelOptimizer} style={{ marginLeft: 6 }}>
                Cancel
              </button>
            )}
            <span style={{ fontSize: 12, color: "#555", marginLeft: 6 }}>
              {optMsg}
              {optRunning && `  ${optProgress.done}/${optProgress.total}`}
            </span>
            {optBest && (
              <span style={{ fontSize: 12, color: "#333" }}>
                • Top 8: {optBest.top8.join(", ")}
              </span>
            )}
          </div>

          {/* Result columns + Quick Examples panel */}
          <div
            style={{
              display: "flex",
              gap: 28,
              marginTop: 18,
              flexWrap: "wrap",
              alignItems: "flex-start",
            }}
          >
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
                    <th style={{ textAlign: "right", padding: "2px 8px" }}>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {col.map((res: any, i: number) => {
                    const isSelected = selectedNums.has(res.number);
                    const isFocused = res.number === focusNumber;
                    const rowIdx = colIdx * Math.ceil(enriched.length / 3) + i + 1;
                    const rowStyle: React.CSSProperties = {
                      cursor: selectable ? "pointer" : "default",
                    };
                    if (isSelected) {
                      rowStyle.background = "#00ff77";
                    }
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
                        <td style={{ padding: "2px 8px" }}><b>{res.number}</b></td>
                        <td style={{ padding: "2px 8px", textAlign: "right" }}>
                          {(res.baseProb * 100).toFixed(2)}%
                        </td>
                        <td
                          style={{
                            padding: "2px 8px",
                            textAlign: "right",
                            color: "#00796b",
                            fontWeight: 700,
                          }}
                        >
                          {(res.biasedProb * 100).toFixed(2)}%
                        </td>
                        <td style={{ padding: "2px 8px", textAlign: "right" }}>
                          {res.lastSeen ? `${res.lastSeen} draws ago` : "Never"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}

            {/* Quick Examples Panel */}
            {showQuickExamples && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  minWidth: 360,
                  background: "#ffffff",
                  border: "1px solid #c5e9f2",
                  borderRadius: 6,
                  padding: 10,
                  fontSize: 13,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 700 }}>Quick Examples (Effectiveness Ranked)</div>
                  <button
                    type="button"
                    onClick={() => setShowQuickExamples(false)}
                    style={{ fontSize: 11, padding: "2px 6px" }}
                    title="Hide Quick Examples panel"
                  >
                    Hide
                  </button>
                </div>
                <div style={{ fontSize: 12, color: "#555" }}>
                  Score = variance of (olderHits - recentHits) across 45 numbers. Higher variance ⇒ stronger differentiation.
                </div>
                <table
                  style={{
                    borderCollapse: "collapse",
                    fontSize: 12,
                    width: "100%",
                  }}
                >
                  <thead>
                    <tr style={{ background: "#e9f7fb" }}>
                      <th style={{ textAlign: "left", padding: "4px 6px" }}>(from,to)</th>
                      <th style={{ textAlign: "left", padding: "4px 6px" }}>Meaning</th>
                      <th style={{ textAlign: "right", padding: "4px 6px" }}>Older size</th>
                      <th style={{ textAlign: "center", padding: "4px 6px" }}>Older band draws</th>
                      <th style={{ textAlign: "center", padding: "4px 6px" }}>Recent draws</th>
                      <th style={{ textAlign: "right", padding: "4px 6px" }}>Score</th>
                      <th style={{ textAlign: "center", padding: "4px 6px" }}>Adopt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quickExamples.map(ex => (
                      <tr key={ex.label}>
                        <td style={{ padding: "3px 6px", fontWeight: 600 }}>{ex.label}</td>
                        <td style={{ padding: "3px 6px" }}>{ex.meaning}</td>
                        <td style={{ padding: "3px 6px", textAlign: "right" }}>{ex.olderSize}</td>
                        <td style={{ padding: "3px 6px", textAlign: "center" }}>{ex.olderRange}</td>
                        <td style={{ padding: "3px 6px", textAlign: "center" }}>{ex.recentRange}</td>
                        <td style={{ padding: "3px 6px", textAlign: "right" }}>{ex.score.toFixed(2)}</td>
                        <td style={{ padding: "3px 6px", textAlign: "center" }}>
                          <button
                            type="button"
                            disabled={ex.adoptDisabled}
                            onClick={() => adoptExample(ex)}
                            style={{
                              fontSize: 11,
                              padding: "2px 6px",
                              cursor: ex.adoptDisabled ? "not-allowed" : "pointer",
                              opacity: ex.adoptDisabled ? 0.4 : 1
                            }}
                            title={
                              ex.adoptDisabled
                                ? "Not enough draws to adopt this example"
                                : "Set Custom Window and Trend Bias to this pair"
                            }
                          >
                            Adopt
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  type="button"
                  onClick={() => setShowQuickExamples(false)}
                  style={{ fontSize: 11, alignSelf: "flex-end", marginTop: 4 }}
                >
                  Close
                </button>
              </div>
            )}

            {!showQuickExamples && (
              <button
                type="button"
                onClick={() => setShowQuickExamples(true)}
                style={{ fontSize: 12, padding: "6px 10px", border: "1px solid #90e0ef", background: "#fff", borderRadius: 6 }}
                title="Show Quick Examples panel"
              >
                Show Quick Examples
              </button>
            )}
          </div>

          {/* Current Custom Window Reference panel */}
          {useTrendBias && useCustomTrendWindow && (
            <div
              style={{
                marginTop: 12,
                border: "1px solid #e0f2f1",
                background: "#f5fffe",
                borderRadius: 6,
                padding: 10,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Custom Window Reference</div>
              <div>History: <b>{qeReference.L}</b> draws</div>
              <div>Total lookback (to): last <b>{qeReference.to}</b> draws → <b>{qeReference.olderFromIdx}</b>–<b>{qeReference.L}</b></div>
              <div>Recent core (from): last <b>{qeReference.from}</b> draws → <b>{qeReference.recentFromIdx}</b>–<b>{qeReference.recentToIdx}</b></div>
              <div>Older band (to − from = <b>{qeReference.olderSize}</b>): <b>{qeReference.olderFromIdx}</b>–<b>{qeReference.olderToIdx}</b></div>
              <div style={{ marginTop: 6, color: "#555" }}>
                Mode:{" "}
                {trendMode === "ratio"
                  ? "Ratios (older+1)/(recent+1) >1 older-heavy, <1 recent-heavy."
                  : "Raw diff (older − recent) + 1 (≥1)."}
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
            Base = Kaplan–Meier probability. Biased = Base × (combined bias)^γ × (ZPA weight)^γ.
          </div>
        </div>
      ) : (
        <div style={{ color: "#c00" }}>Not enough draws to run analysis.</div>
      )}
    </section>
  );
}
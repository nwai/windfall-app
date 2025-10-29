import React, { useMemo, useState } from "react";
import { Draw } from "../types";
import { buildTransitionMatrix, getTransitionProbability } from "../lib/temperatureTransitions";
import {
  backtestTemperatureTransitionsThreshold,
  backtestTemperatureTransitionsTopK,
} from "../lib/backtestTemperatureTransitions";
import { computeTemperatureCategories, Temperature, TemperatureClassifierOptions } from "../lib/temperatureCategories";
import { sweepWindows, WindowSweepMode, SweepMetric } from "../lib/ttpWindowSweep";
import { getSavedZoneWeights, WeightsByNumber } from "../lib/zpaStorage";
import { useZPASettings } from "../context/ZPASettingsContext";

export interface TemperatureTransitionPanelProps {
  history: Draw[];

  // Keep in lockstep with TemperatureHeatmap props:
  alpha?: number;
  metric?: "ema" | "recency" | "hybrid";
  buckets?: number;
  bucketStops?: number[];
  hybridWeight?: number;
  emaNormalize?: "global" | "per-number";
  enforcePeaks?: boolean;

  // Trend classification knobs (optional)
  trendLookback?: number;       // default 4
  trendDelta?: number;          // default 0.02
  trendReversal?: boolean;      // default true
}

type PredictionMode = "threshold" | "topk";
type LabelMode = "indices" | "dates";

function latestTempsFromCategories(
  categories: Record<number, Temperature[]>,
  heightNumbers = 45
): Record<number, Temperature> {
  const res: Record<number, Temperature> = {};
  for (let n = 1; n <= heightNumbers; ++n) {
    const arr = categories[n] || [];
    if (arr.length) res[n] = arr[arr.length - 1];
  }
  return res;
}

export const TemperatureTransitionPanel: React.FC<TemperatureTransitionPanelProps> = ({
  history,

  alpha = 0.25,
  metric = "hybrid",
  buckets = 10,
  bucketStops,
  hybridWeight = 0.6,
  emaNormalize = "per-number",
  enforcePeaks = true,

  trendLookback = 4,
  trendDelta = 0.02,
  trendReversal = true,
}) => {
  // Window and prediction controls
  const [windowSize, setWindowSize] = useState(50);
  const [mode, setMode] = useState<PredictionMode>("threshold");
  const [predThreshold, setPredThreshold] = useState(0.5);
  const [topK, setTopK] = useState(8);

  // Display controls
  const [backtestShowCount, setBacktestShowCount] = useState(6);
  const [labelMode, setLabelMode] = useState<LabelMode>("indices");

  // Auto-window suggestion
  const [autoSuggestion, setAutoSuggestion] = useState<{ window: number; metric: SweepMetric; value: number } | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);

  // Global Zone Weighting (single source of truth)
  const { zoneWeightingEnabled, zoneGamma } = useZPASettings();

  // Load saved per-number weights (from ZPA panel) once
  const savedZoneWeights: WeightsByNumber | null = useMemo(() => {
    try { return getSavedZoneWeights(); } catch { return null; }
  }, []);

  // Slice the history for the live model table (always honor small windows; clamp at least 1)
  const windowed = useMemo(
    () => history.slice(-Math.max(1, Math.min(windowSize, history.length))),
    [history, windowSize]
  );

  const classifierOptions: TemperatureClassifierOptions = useMemo(
    () => ({
      alpha,
      heightNumbers: 45,
      metric,
      hybridWeight,
      emaNormalize,
      enforcePeaks,
      buckets,
      bucketStops,
      lookback: trendLookback,
      threshold: trendDelta,
      trendReversal,
    }),
    [alpha, metric, hybridWeight, emaNormalize, enforcePeaks, buckets, bucketStops, trendLookback, trendDelta, trendReversal]
  );

  const categories = useMemo(
    () => computeTemperatureCategories(windowed, classifierOptions),
    [windowed, classifierOptions]
  );

  const matrix = useMemo(
    () => buildTransitionMatrix(windowed, categories),
    [windowed, categories]
  );

  const latestTemps = useMemo(
    () => latestTempsFromCategories(categories),
    [categories]
  );

  // Build per-number probabilities
  const probs = useMemo(() => {
    const rows = Array.from({ length: 45 }, (_, i) => {
      const n = i + 1;
      const t = latestTemps[n] ?? "other";
      let p = getTransitionProbability(matrix, n, t);

      // Apply global ZPA bias if enabled
      if (zoneWeightingEnabled && savedZoneWeights) {
        const w = savedZoneWeights[n] ?? 1;
        p = p * Math.pow(w, zoneGamma);
      }

      return { n, temp: t, p };
    }).sort((a, b) => b.p - a.p || a.n - b.n);
    return rows;
  }, [matrix, latestTemps, zoneWeightingEnabled, savedZoneWeights, zoneGamma]);

  // Selection set based on mode
  const selectedSet = useMemo(() => {
    if (mode === "threshold") {
      return new Set<number>(probs.filter(r => r.p >= predThreshold).map(r => r.n));
    } else {
      const K = Math.max(1, Math.min(topK, probs.length));
      return new Set<number>(probs.slice(0, K).map(r => r.n));
    }
  }, [mode, probs, predThreshold, topK]);

  const predictions = useMemo(() => {
    return probs.map(row => ({
      ...row,
      predict: selectedSet.has(row.n),
    }));
  }, [probs, selectedSet]);

  // Backtest: honor small windows (min 3) and ensure we have a "next" draw (<= history.length - 1)
  const backtest = useMemo(() => {
    const w = Math.max(3, Math.min(windowSize, history.length - 1));
    if (mode === "threshold") {
      return backtestTemperatureTransitionsThreshold(history, w, predThreshold, classifierOptions);
    } else {
      return backtestTemperatureTransitionsTopK(history, w, topK, classifierOptions);
    }
  }, [history, windowSize, mode, predThreshold, topK, classifierOptions]);

  const fmtPct = (x: number) => (x * 100).toFixed(1) + "%";
  const safeDate = (idx: number) => history[idx]?.date ?? "(unknown)";

  // Auto window (beta): sweep and suggest best window by meanF1
  async function onAutoWindow() {
    try {
      setAutoBusy(true);
      const sweepMode: WindowSweepMode = mode === "topk" ? "topk" : "threshold";
      const outcome = sweepWindows(
        history,
        [3, 5, 7, 9, 12, 15, 20, 25, 30, 40, 50],
        sweepMode,
        {
          topK,
          threshold: predThreshold,
          classifierOptions,
        }
      );
      const best = outcome.bestByMetric.meanF1;
      if (best.windowSize > 0) {
        setAutoSuggestion({ window: best.windowSize, metric: "meanF1", value: best.value });
        setWindowSize(best.windowSize);
      } else {
        setAutoSuggestion(null);
      }
    } finally {
      setAutoBusy(false);
    }
  }

  const HeaderStats = () => (
    <span style={{ marginLeft: "auto", fontSize: 13, color: "#555" }}>
      Backtest over {history.length} draws: acc {fmtPct(backtest.meanAccuracy)}, prec {fmtPct(backtest.meanPrecision)}, rec {fmtPct(backtest.meanRecall)}, F1 {fmtPct(backtest.meanF1)}
    </span>
  );

  return (
    <section style={{ border: "2px solid #3366cc", borderRadius: 8, padding: 18, margin: "24px 0", background: "#f3f7ff" }}>
      <h3 style={{ marginTop: 0 }}>Temperature Transition Predictions</h3>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Window size:{" "}
          <input
            type="number"
            min={3}
            max={history.length}
            value={windowSize}
            onChange={(e) => setWindowSize(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </label>

        <div style={{ display: "inline-flex", gap: 12, alignItems: "center", padding: "4px 8px", background: "#eef5ff", borderRadius: 6 }}>
          <label>
            <input
              type="radio"
              name="pred-mode"
              checked={mode === "threshold"}
              onChange={() => setMode("threshold")}
            />{" "}
            Threshold
          </label>
          <label>
            <input
              type="radio"
              name="pred-mode"
              checked={mode === "topk"}
              onChange={() => setMode("topk")}
            />{" "}
            Top-K
          </label>
        </div>

        {mode === "threshold" ? (
          <label>
            Threshold:{" "}
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={predThreshold}
              onChange={(e) => setPredThreshold(Number(e.target.value))}
              style={{ width: 80 }}
            />
          </label>
        ) : (
          <label>
            K:{" "}
            <input
              type="number"
              min={1}
              max={45}
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              style={{ width: 80 }}
            />
          </label>
        )}

        {/* Label mode toggle */}
        <div style={{ display: "inline-flex", gap: 12, alignItems: "center", padding: "4px 8px", background: "#eef5ff", borderRadius: 6 }}>
          <label title="Show window indices in backtest cards">
            <input
              type="radio"
              name="label-mode"
              checked={labelMode === "indices"}
              onChange={() => setLabelMode("indices")}
            />{" "}
            Indices
          </label>
          <label title="Show actual draw dates in backtest cards">
            <input
              type="radio"
              name="label-mode"
              checked={labelMode === "dates"}
              onChange={() => setLabelMode("dates")}
            />{" "}
            Dates
          </label>
        </div>

        <label title="How many of the most recent backtest windows to display">
          Show last N windows:{" "}
          <input
            type="number"
            min={1}
            max={200}
            value={backtestShowCount}
            onChange={(e) => setBacktestShowCount(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </label>

        {/* Auto window (beta) */}
        <button onClick={onAutoWindow} disabled={autoBusy} title="Sweep candidate window sizes and choose best by mean F1">
          {autoBusy ? "Auto window..." : "Auto window (beta)"}
        </button>
        {autoSuggestion && (
          <span style={{ fontSize: 12, color: "#444" }}>
            Suggested: {autoSuggestion.window} (best {autoSuggestion.metric} {fmtPct(autoSuggestion.value)})
          </span>
        )}

        <HeaderStats />
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 14 }}>
        <table style={{ borderCollapse: "collapse", minWidth: 420, background: "#fff", border: "1px solid #cfd8dc" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>#</th>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Curr Temp</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>P(V | Temp)</th>
              <th style={{ textAlign: "center", padding: "4px 8px" }}>Predict</th>
            </tr>
          </thead>
          <tbody>
            {predictions.map((row) => (
              <tr key={row.n} style={{ background: row.predict ? "#e8f5e9" : "transparent" }}>
                <td style={{ padding: "4px 8px" }}><b>{row.n}</b></td>
                <td style={{ padding: "4px 8px" }}>{row.temp}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtPct(row.p)}</td>
                <td style={{ padding: "4px 8px", textAlign: "center" }}>{row.predict ? "✔" : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ minWidth: 360, flex: 1 }}>
          <h4 style={{ margin: "6px 0" }}>
            Backtest (last {Math.min(backtestShowCount, backtest.windows.length)} window{Math.min(backtestShowCount, backtest.windows.length) === 1 ? "" : "s"})
          </h4>
          <div style={{ fontSize: 13, color: "#444" }}>
            {backtest.windows.slice(-backtestShowCount).map((w, i) => {
              const idxLabel = `${w.windowStart + 1}–${w.windowEnd + 1} ➜ next ${w.nextIndex + 1}`;
              const dateLabel = `${safeDate(w.windowStart)}–${safeDate(w.windowEnd)} ➜ next ${safeDate(w.nextIndex)}`;
              const heading = labelMode === "dates" ? dateLabel : idxLabel;
              return (
                <div key={i} style={{ padding: "6px 8px", border: "1px solid #e0e0e0", background: "#fff", borderRadius: 6, marginBottom: 6 }}>
                  <div><b>Window</b> {heading}</div>
                  {labelMode === "dates" && <div style={{ color: "#666" }}>{idxLabel}</div>}
                  <div>acc {fmtPct(w.accuracy)}, prec {fmtPct(w.precision)}, rec {fmtPct(w.recall)}, F1 {fmtPct(w.f1)}</div>
                  <div>
                    {mode === "threshold" ? `thr ${predThreshold}` : `K ${topK}`}
                  </div>
                </div>
              );
            })}
            {backtest.windows.length === 0 && <div>No backtest windows available.</div>}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#666", marginTop: 10 }}>
        Mode tips: Threshold controls the cut-off probability for marking a number as a predicted hit. Top-K always selects the K highest-probability numbers.
      </div>
    </section>
  );
};
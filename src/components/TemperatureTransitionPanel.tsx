import React, { useMemo, useState } from "react";
import { Draw } from "../types";
import { buildTransitionMatrix, getTransitionProbability } from "../lib/temperatureTransitions";
import { backtestTemperatureTransitions } from "../lib/backtestTemperatureTransitions";
import { computeTemperatureCategories, Temperature, TemperatureClassifierOptions } from "../lib/temperatureCategories";

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
  // Window and prediction threshold are panel-local controls
  const [windowSize, setWindowSize] = useState(50);
  const [predThreshold, setPredThreshold] = useState(0.5);

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

  const predictions = useMemo(() => {
    return Array.from({ length: 45 }, (_, i) => {
      const n = i + 1;
      const t = latestTemps[n] ?? "other";
      const p = getTransitionProbability(matrix, n, t);
      return { n, temp: t, p, predict: p >= predThreshold };
    }).sort((a, b) => b.p - a.p || a.n - b.n);
  }, [matrix, latestTemps, predThreshold]);

  const backtest = useMemo(() => {
    const w = Math.max(10, Math.min(windowSize, history.length - 1));
    return backtestTemperatureTransitions(history, w, predThreshold, classifierOptions);
  }, [history, windowSize, predThreshold, classifierOptions]);

  const fmtPct = (x: number) => (x * 100).toFixed(1) + "%";

  return (
    <section style={{ border: "2px solid #3366cc", borderRadius: 8, padding: 18, margin: "24px 0", background: "#f3f7ff" }}>
      <h3 style={{ marginTop: 0 }}>Temperature Transition Predictions</h3>

      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Window size:{" "}
          <input
            type="number"
            min={10}
            max={history.length}
            value={windowSize}
            onChange={(e) => setWindowSize(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </label>
        <label>
          Prediction threshold:{" "}
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

        <span style={{ marginLeft: "auto", fontSize: 13, color: "#555" }}>
          Backtest over {history.length} draws: acc {fmtPct(backtest.meanAccuracy)}, prec {fmtPct(backtest.meanPrecision)}, rec {fmtPct(backtest.meanRecall)}
        </span>
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

        <div style={{ minWidth: 320 }}>
          <h4 style={{ margin: "6px 0" }}>Backtest (last 6 windows)</h4>
          <div style={{ fontSize: 13, color: "#444" }}>
            {backtest.windows.slice(-6).map((w, i) => (
              <div key={i} style={{ padding: "6px 8px", border: "1px solid #e0e0e0", background: "#fff", borderRadius: 6, marginBottom: 6 }}>
                <div><b>Window</b> {w.windowStart}–{w.windowEnd} ➜ next {w.nextIndex}</div>
                <div>acc {fmtPct(w.accuracy)}, prec {fmtPct(w.precision)}, rec {fmtPct(w.recall)}</div>
                <div>pred pos {w.positivesPredicted}, actual pos {w.positivesActual}, thr {w.threshold}</div>
              </div>
            ))}
            {backtest.windows.length === 0 && <div>No backtest windows available.</div>}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#666", marginTop: 10 }}>
        Categories are computed with the same config as your Temperature Heatmap (alpha/metric/buckets/stops/hybrid/normalize/peaks) plus trend lookback/delta.
      </div>
    </section>
  );
};
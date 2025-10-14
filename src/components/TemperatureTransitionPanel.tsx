import React, { useMemo, useState } from "react";
import { Draw } from "../types";
import {
  computeNumberTemperatures,
  buildTransitionMatrix,
  getTransitionProbability,
  Temperature,
} from "../lib/temperatureTransitions";
import { backtestTemperatureTransitions } from "../lib/backtestTemperatureTransitions";

function getLatestTemps(numberTemperatures: Record<number, Temperature[]>): Record<number, Temperature> {
  const res: Record<number, Temperature> = {};
  for (let n = 1; n <= 45; ++n) {
    const arr = numberTemperatures[n] || [];
    if (arr.length) res[n] = arr[arr.length - 1];
  }
  return res;
}

export const TemperatureTransitionPanel: React.FC<{
  history: Draw[]; // pass filteredHistory from App
}> = ({ history }) => {
  const [windowSize, setWindowSize] = useState(50);
  const [threshold, setThreshold] = useState(0.5);

  const windowed = useMemo(() => history.slice(-Math.max(1, Math.min(windowSize, history.length))), [history, windowSize]);

  const numberTemps = useMemo(() => computeNumberTemperatures(windowed), [windowed]);
  const matrix = useMemo(() => buildTransitionMatrix(windowed, numberTemps), [windowed, numberTemps]);
  const latestTemps = useMemo(() => getLatestTemps(numberTemps), [numberTemps]);

  const predictions = useMemo(() => {
    return Array.from({ length: 45 }, (_, i) => {
      const n = i + 1;
      const t = latestTemps[n] ?? "other";
      const p = getTransitionProbability(matrix, n, t);
      return { n, temp: t, p, predict: p >= threshold };
    }).sort((a, b) => b.p - a.p || a.n - b.n);
  }, [matrix, latestTemps, threshold]);

  const backtest = useMemo(() => {
    // Backtest over the same filtered history you feed this panel
    return backtestTemperatureTransitions(history, Math.max(10, Math.min(windowSize, history.length - 1)), threshold);
  }, [history, windowSize, threshold]);

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
          Threshold:{" "}
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </label>

        <span style={{ marginLeft: "auto", fontSize: 13, color: "#555" }}>
          Backtest over {history.length} draws: acc {fmtPct(backtest.meanAccuracy)}, prec {fmtPct(backtest.meanPrecision)}, recall {fmtPct(backtest.meanRecall)}
        </span>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 14 }}>
        <table style={{ borderCollapse: "collapse", minWidth: 400, background: "#fff", border: "1px solid #cfd8dc" }}>
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
        Tip: Replace the fallback temperature classifier with your Temperature Heatmap logic for pR, pF, tT, F, C, &lt;C, etc.
      </div>
    </section>
  );
};
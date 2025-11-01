import React, { useState } from "react";
import type { Draw } from "../types";
import { backtestDroughtPredictions, BacktestOptions, BacktestSummary } from "../lib/backtestDrought";

export function DroughtBacktestPanel({ history }: { history: Draw[] }) {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<BacktestSummary | null>(null);
  const [opts, setOpts] = useState<BacktestOptions>({
    minHistory: 20,
    useRollingWindow: true,
    windowSize: 180,
    topK: 12,
    alpha: 0.25,
    hybridWeight: 0.6,
    emaNormalize: "per-number",
    enforcePeaks: true,
    metric: "hybrid",
  });

  const run = () => {
    if (!history || history.length < (opts.minHistory ?? 20)) {
      alert("Not enough draws to run backtest.");
      return;
    }
    setRunning(true);
    setTimeout(() => {
      try {
        const s = backtestDroughtPredictions(history, opts);
        setSummary(s);
      } finally {
        setRunning(false);
      }
    }, 10);
  };

  return (
    <section style={{ border: "1px solid #e0e0e0", padding: 12, borderRadius: 8, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h4 style={{ margin: 0 }}>Backtest: Drought predictions</h4>
        <button onClick={run} disabled={running} style={{ marginLeft: "auto" }}>
          {running ? "Running…" : "Run backtest"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
        <label>
          Start minHistory:
          <input
            type="number"
            value={opts.minHistory}
            onChange={(e) => setOpts((p) => ({ ...p, minHistory: Number(e.target.value) }))}
            style={{ width: 80, marginLeft: 6 }}
          />
        </label>
        <label>
          Use rolling window:
          <input
            type="checkbox"
            checked={opts.useRollingWindow}
            onChange={(e) => setOpts((p) => ({ ...p, useRollingWindow: e.target.checked }))}
            style={{ marginLeft: 6 }}
          />
        </label>
        <label>
          windowSize:
          <input
            type="number"
            value={opts.windowSize}
            onChange={(e) => setOpts((p) => ({ ...p, windowSize: Number(e.target.value) }))}
            style={{ width: 80, marginLeft: 6 }}
          />
        </label>
        <label>
          topK:
          <input
            type="number"
            value={opts.topK}
            onChange={(e) => setOpts((p) => ({ ...p, topK: Number(e.target.value) }))}
            style={{ width: 80, marginLeft: 6 }}
          />
        </label>
      </div>

      {summary && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={statTile}>Predictions: <b>{summary.totalPredictions}</b></div>
            <div style={statTile}>Total hits: <b>{summary.totalHits}</b></div>
            <div style={statTile}>Top1 hits: <b>{summary.hitAtTop1}</b></div>
            <div style={statTile}>Top3 hits: <b>{summary.hitAtTop3}</b></div>
            <div style={statTile}>Top5 hits: <b>{summary.hitAtTop5}</b></div>
            <div style={statTile}>Top10 hits: <b>{summary.hitAtTop10}</b></div>
            <div style={statTile}>Avg first-hit rank: <b>{summary.averageFirstHitRank ? summary.averageFirstHitRank.toFixed(2) : "—"}</b></div>
          </div>

          <div style={{ marginTop: 12 }}>
            <h5 style={{ margin: "8px 0" }}>Sample hit records (first 200 rows)</h5>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f7f7f7" }}>
                  <th style={thL}>Pred idx</th>
                  <th style={thL}>Pred date</th>
                  <th style={thL}>Next idx</th>
                  <th style={thL}>Next date</th>
                  <th style={thL}>First hit</th>
                  <th style={thL}>Rank</th>
                  <th style={thL}>TopK</th>
                </tr>
              </thead>
              <tbody>
                {summary.records.slice(0, 200).map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={tdL}>{r.indexAtPrediction}</td>
                    <td style={tdL}>{r.predictDate}</td>
                    <td style={tdL}>{r.nextIndex}</td>
                    <td style={tdL}>{r.nextDate}</td>
                    <td style={tdL}>{r.firstHitNum ?? "—"}</td>
                    <td style={tdL}>{r.firstHitRank ?? "miss"}</td>
                    <td style={tdL}>{r.topK.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12, fontSize: 13 }}>
            Rank distribution: {JSON.stringify(summary.rankDistribution)}
          </div>
        </div>
      )}
    </section>
  );
}

const statTile: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: 6,
  padding: "8px 12px",
  minWidth: 140,
};

const thL: React.CSSProperties = { textAlign: "left", padding: "6px 8px" };
const tdL: React.CSSProperties = { textAlign: "left", padding: "6px 8px" };

export default DroughtBacktestPanel;
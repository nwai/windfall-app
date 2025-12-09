import React, { useMemo } from "react";
import { Draw } from "../types";
import { computeOGA } from "../utils/oga";
import { forecastOGA } from "../lib/ogaForecast";

interface NextDrawProbabilitiesPanelProps {
  history: Draw[];
  mode?: "window" | "all"; // use provided history (window) vs all passed
  title?: string;
  allHistory?: Draw[]; // pass full history for baseline toggle
}

// Simple helper to bin OGA into deciles for easy probability bands
function toDecile(score: number): number {
  if (!isFinite(score)) return -1;
  // Scale roughly into 10 bands by empirical percentiles approximation
  // We'll compute actual percentiles from the observed distribution below
  return 0; // placeholder, not used directly
}

export const NextDrawProbabilitiesPanel: React.FC<NextDrawProbabilitiesPanelProps> = ({ history, mode = "window", title = "Next Draw Probabilities", allHistory }) => {
  // Compute Odd/Even ratio frequencies from observed history
  const ratioProbs = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;
    for (const d of history) {
      const nums = [...d.main, ...d.supp];
      const odd = nums.filter(n => n % 2 === 1).length;
      const even = nums.length - odd;
      const key = `${odd}:${even}`;
      map.set(key, (map.get(key) || 0) + 1);
      total += 1;
    }
    const ratios = Array.from(map.entries()).map(([ratio, count]) => ({ ratio, count, p: total ? count / total : 0 }));
    ratios.sort((a, b) => b.p - a.p || a.ratio.localeCompare(b.ratio));
    return { total, ratios };
  }, [history]);

  const [baselineMode, setBaselineMode] = React.useState<"window" | "all">("window");
  const baseline = baselineMode === "window" ? history : (allHistory ?? history);

  // Compute OGA distribution for each observed draw using baseline = current history
  const ogaStats = useMemo(() => forecastOGA(history, baseline), [history, baseline]);

  // Naive next-draw OGA band probabilities:
  // Use empirical distribution; report probability of falling below p10, between p10-p90, above p90
  const ogaBandProbs = useMemo(() => {
    const n = ogaStats.n;
    if (!n) return { low: 0, mid: 0, high: 0 };
    // For a new sample drawn from the same process, empirical CDF suggests ~10% below p10, ~80% mid, ~10% above p90.
    // Report these bands for a simple expectation.
    return { low: 0.10, mid: 0.80, high: 0.10 };
  }, [ogaStats]);

  const panelStyle: React.CSSProperties = { border: "1px solid #eee", borderRadius: 8, padding: 12, background: "#fff" };
  const h4: React.CSSProperties = { margin: "4px 0 8px" };
  const list: React.CSSProperties = { fontSize: 12, lineHeight: 1.6 };
  const table: React.CSSProperties = { borderCollapse: "collapse", fontSize: 12, width: "100%" };
  const th: React.CSSProperties = { textAlign: "left", borderBottom: "1px solid #ddd", padding: "4px 6px", fontWeight: 600 };
  const td: React.CSSProperties = { borderBottom: "1px solid #eee", padding: "4px 6px" };

  return (
    <div style={panelStyle}>
      <h4 style={h4}>{title}</h4>
      {history.length === 0 ? (
        <div style={{ fontSize: 12, color: "#666" }}>No history available.</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <label style={{ fontSize: 12 }}>
              OGA baseline:
              <select value={baselineMode} onChange={(e) => setBaselineMode(e.target.value as any)} style={{ marginLeft: 6 }}>
                <option value="window">Windowed</option>
                <option value="all">All History</option>
              </select>
            </label>
          </div>
          <div style={list}>
            <div><b>Window</b>: {history.length} draws</div>
            <div>
              <b>OGA bands</b> (empirical/KDE): mean={ogaStats.mean.toFixed(2)}; p10={ogaStats.p10.toFixed(2)}; p50={ogaStats.p50.toFixed(2)}; p90={ogaStats.p90.toFixed(2)}
            </div>
            <div>
              <b>Next OGA probabilities</b> (KDE):
              low (≤p10) ≈ {(ogaStats.bands.low * 100).toFixed(0)}%, mid (p10–p90) ≈ {(ogaStats.bands.mid * 100).toFixed(0)}%, high (≥p90) ≈ {(ogaStats.bands.high * 100).toFixed(0)}%
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <b style={{ fontSize: 12 }}>Odd/Even ratio probabilities (empirical)</b>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Ratio</th>
                  <th style={th}>Count</th>
                  <th style={th}>Prob%</th>
                </tr>
              </thead>
              <tbody>
                {ratioProbs.ratios.map(r => (
                  <tr key={r.ratio}>
                    <td style={td}>{r.ratio}</td>
                    <td style={td}>{r.count}</td>
                    <td style={td}>{(r.p * 100).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

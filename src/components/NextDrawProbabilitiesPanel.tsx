import React, { useMemo } from "react";
import { Draw } from "../types";
import { forecastOGA } from "../lib/ogaForecast";
import { filterRealDrawHistory } from "../lib/realDrawHistory";

interface NextDrawProbabilitiesPanelProps {
  history: Draw[];
  mode?: "window" | "all"; // use provided history (window) vs all passed
  title?: string;
  allHistory?: Draw[]; // pass full history for baseline toggle
}

export const NextDrawProbabilitiesPanel: React.FC<NextDrawProbabilitiesPanelProps> = ({ history, title = "Next Draw Empirical Diagnostics", allHistory }) => {
  const realWindow = useMemo(
    () => filterRealDrawHistory(history, "next-draw empirical diagnostics"),
    [history],
  );
  const realAllHistory = useMemo(
    () => filterRealDrawHistory(allHistory ?? history, "next-draw empirical diagnostics baseline"),
    [allHistory, history],
  );
  const analysisHistory = realWindow.history;

  // Compute Odd/Even ratio empirical shares from observed real history.
  const ratioProbs = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;
    for (const d of analysisHistory) {
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
  }, [analysisHistory]);

  const [baselineMode, setBaselineMode] = React.useState<"window" | "all">("window");
  const baseline = baselineMode === "window" ? analysisHistory : realAllHistory.history;

  // Compute OGA distribution from observed real draws only.
  const ogaStats = useMemo(() => forecastOGA(analysisHistory, baseline), [analysisHistory, baseline]);

  const decileMembers = useMemo(() => {
    if (!ogaStats.deciles || !ogaStats.deciles.thresholds) return [] as number[][];
    const thresholds = ogaStats.deciles.thresholds;
    const bins: number[][] = Array.from({ length: 10 }, () => []);
    const sortedScores = (ogaStats.scores || []).slice().sort((a, b) => a - b);
    for (const s of sortedScores) {
      const idx = thresholds.findIndex((t) => s <= t);
      const bin = idx === -1 ? 9 : Math.max(0, idx);
      bins[bin].push(s);
    }
    return bins;
  }, [ogaStats]);

  const decileRanges = useMemo(() => {
    if (!ogaStats.deciles || !ogaStats.deciles.thresholds || !ogaStats.scores?.length) return [] as { lo: number; hi: number }[];
    const thresholds = ogaStats.deciles.thresholds;
    const minScore = Math.min(...ogaStats.scores);
    const maxScore = Math.max(...ogaStats.scores);
    const ranges: { lo: number; hi: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const lo = i === 0 ? minScore : thresholds[i - 1];
      const hi = i === 9 ? maxScore : thresholds[i];
      ranges.push({ lo, hi });
    }
    return ranges;
  }, [ogaStats]);

  const formatDecileValues = (vals: number[]): string => {
    if (!vals || vals.length === 0) return "—";
    const shown = vals.slice(0, 12).map((v) => v.toFixed(2)).join(", ");
    if (vals.length > 12) return `${shown} … (+${vals.length - 12} more)`;
    return shown;
  };

  const panelStyle: React.CSSProperties = { border: "1px solid #eee", borderRadius: 8, padding: 12, background: "#fff" };
  const list: React.CSSProperties = { fontSize: 12, lineHeight: 1.6 };
  const table: React.CSSProperties = { borderCollapse: "collapse", fontSize: 12, width: "100%" };
  const th: React.CSSProperties = { textAlign: "left", borderBottom: "1px solid #ddd", padding: "4px 6px", fontWeight: 600 };
  const td: React.CSSProperties = { borderBottom: "1px solid #eee", padding: "4px 6px" };
  const warningStyle: React.CSSProperties = {
    marginBottom: 8,
    padding: "6px 8px",
    borderRadius: 6,
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    color: "#9a3412",
    fontSize: 12,
  };
  const warnings = [...realWindow.warnings, ...realAllHistory.warnings];

  return (
    <div style={panelStyle} aria-label={title}>
      {warnings.map((warning) => (
        <div key={warning} style={warningStyle}>{warning}</div>
      ))}
      {analysisHistory.length === 0 ? (
        <div style={{ fontSize: 12, color: "#666" }}>No real draw history available.</div>
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
            <div><b>Window</b>: {analysisHistory.length} real draws</div>
            <div>
              <b>OGA bands</b> (empirical/KDE): mean={ogaStats.mean.toFixed(2)}; p10={ogaStats.p10.toFixed(2)}; p50={ogaStats.p50.toFixed(2)}; p90={ogaStats.p90.toFixed(2)}
            </div>
            <div>
              <b>OGA band support</b> (KDE diagnostic):
              low (≤p10) ≈ {(ogaStats.bands.low * 100).toFixed(0)}%, mid (p10–p90) ≈ {(ogaStats.bands.mid * 100).toFixed(0)}%, high (≥p90) ≈ {(ogaStats.bands.high * 100).toFixed(0)}%
            </div>
          </div>

          {ogaStats.deciles && (
            <div style={{ marginTop: 8 }}>
              <b style={{ fontSize: 12 }}>OGA decile thresholds and KDE support</b>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Decile</th>
                    <th style={th}>Range</th>
                    <th style={th}>Count</th>
                    <th style={th}>Scores</th>
                    <th style={th}>KDE support %</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 10 }, (_, i) => i).map(i => (
                    <tr key={i}>
                      <td style={td}>D{i}</td>
                      <td style={td} title={`Range for D${i}`}>
                        {decileRanges[i] ? `[${decileRanges[i].lo.toFixed(2)}, ${decileRanges[i].hi.toFixed(2)}]` : "—"}
                      </td>
                      <td style={td}>{decileMembers[i]?.length ?? 0}</td>
                      <td style={td} title={`${decileMembers[i]?.length ?? 0} scores`}>
                        {formatDecileValues(decileMembers[i] || [])}
                      </td>
                      <td style={td}>{(ogaStats.deciles!.probs[i] * 100).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <b style={{ fontSize: 12 }}>Odd/Even ratio empirical shares</b>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Ratio</th>
                  <th style={th}>Count</th>
                  <th style={th}>Empirical share %</th>
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

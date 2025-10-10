import React from "react";
import { Draw } from "../types";
import { computeDroughtHazard } from "../lib/droughtHazard";

export const DroughtHazardPanel: React.FC<{ history: Draw[]; top?: number; title?: string }> = ({ history, top = 12, title }) => {
  const { hazard, maxK, byNumber } = React.useMemo(() => computeDroughtHazard(history), [history]);
  const sorted = React.useMemo(
    () => byNumber.slice().sort((a, b) => b.p - a.p || b.k - a.k).slice(0, top),
    [byNumber, top]
  );

  return (
    <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, background: "#fff", marginTop: 10 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title || "Drought hazard: P(hit next) by current drought length"}</div>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
        Hazard estimated from history: h(k) = P(hit at next draw | drought length = k). Laplace-smoothed.
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ background: "#f7f7f7" }}>
            <th style={th}>#</th>
            <th style={th}>Current drought (k)</th>
            <th style={th}>P(hit next)</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.number}>
              <td style={td}>{r.number}</td>
              <td style={td}>{r.k}</td>
              <td style={td}>{(r.p * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
        Max modeled drought length k = {maxK}. Longer k are clipped.
      </div>
    </section>
  );
};

const th: React.CSSProperties = { textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #ddd", fontWeight: 700 };
const td: React.CSSProperties = { textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #eee" };
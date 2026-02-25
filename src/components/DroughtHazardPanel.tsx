import React from "react";
import { Draw } from "../types";
import { computeDroughtHazard } from "../lib/droughtHazard";

export const DroughtHazardPanel: React.FC<{
  history: Draw[];
  top?: number;
  title?: string;
  onToggleNumber?: (n: number) => void;
  forcedNumbers?: number[];
  bucketLabels?: Record<number, string>;
}> = ({ history, top = 12, title, onToggleNumber, forcedNumbers = [], bucketLabels }) => {
  const { hazard, maxK, byNumber } = React.useMemo(() => computeDroughtHazard(history), [history]);
  const fallbackLabels = React.useMemo(() => {
    const counts = Array(46).fill(0);
    history.forEach((d) => {
      [...d.main, ...d.supp].forEach((n) => {
        if (n >= 1 && n <= 45) counts[n] += 1;
      });
    });
    return counts.map((c) => (c === 0 ? "Undrawn" : `${c}x`));
  }, [history]);
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
            <th style={{ ...th, textAlign: "left" }}>Bucket</th>
            <th style={th}>Current drought (k)</th>
            <th style={th}>P(hit next)</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const isForced = forcedNumbers.includes(r.number);
            return (
              <tr
                key={r.number}
                onClick={onToggleNumber ? () => onToggleNumber(r.number) : undefined}
                style={{ cursor: onToggleNumber ? "pointer" : undefined, background: isForced ? "#FFF8E1" : undefined }}
                title={onToggleNumber ? "Click to (de)select number for trend selection" : undefined}
              >
                <td style={td}>{r.number}</td>
                <td style={{ ...td, textAlign: "left" }}>{bucketLabels?.[r.number] ?? fallbackLabels[r.number] ?? "—"}</td>
                <td style={td}>{r.k}</td>
                <td style={td}>{(r.p * 100).toFixed(1)}%</td>
              </tr>
            );
          })}
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

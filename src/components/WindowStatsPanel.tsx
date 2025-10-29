import React, { useMemo, useState, useEffect } from "react";
import { Draw } from "../types";

export interface WindowStatsPanelProps {
  draws: Draw[];
  // Optional: seed values from parent (App)
  sumMin?: number;
  sumMax?: number;
  includeSupp?: boolean;
  // Emit to parent when user changes the range/toggle
  onSumFilterChange?: (range: { min: number; max: number; includeSupp: boolean }) => void;
}

const LOW_RANGE: [number, number] = [1, 15];
const MID_RANGE: [number, number] = [16, 30];
const HIGH_RANGE: [number, number] = [31, 45];

function inRange(n: number, [lo, hi]: [number, number]) {
  return n >= lo && n <= hi;
}

export const WindowStatsPanel: React.FC<WindowStatsPanelProps> = ({
  draws,
  sumMin = 0,
  sumMax = 999,
  includeSupp = true,
  onSumFilterChange
}) => {
  const [minSum, setMinSum] = useState<number>(sumMin);
  const [maxSum, setMaxSum] = useState<number>(sumMax);
  const [withSupp, setWithSupp] = useState<boolean>(includeSupp);

  // Keep internal UI in sync if parent updates props
  useEffect(() => { setMinSum(sumMin); }, [sumMin]);
  useEffect(() => { setMaxSum(sumMax); }, [sumMax]);
  useEffect(() => { setWithSupp(includeSupp); }, [includeSupp]);

  const rows = useMemo(() => {
    // Oldest -> newest, as your App normalizes
    return draws.map((d) => {
      const mains = d.main || [];
      const supp = d.supp || [];
      const all = withSupp ? [...mains, ...supp] : mains;

      const low = all.filter(n => inRange(n, LOW_RANGE)).length;
      const mid = all.filter(n => inRange(n, MID_RANGE)).length;
      const high = all.filter(n => inRange(n, HIGH_RANGE)).length;
      const even = all.filter(n => n % 2 === 0).length;
      const odd = all.length - even;
      const sum = all.reduce((a, b) => a + b, 0);

      return {
        date: d.date || "(unknown)",
        low, mid, high,
        even, odd,
        sum
      };
    });
  }, [draws, withSupp]);

  const summary = useMemo(() => {
    if (!rows.length) return { meanSum: 0, minSum: 0, maxSum: 0 };
    const sums = rows.map(r => r.sum);
    const mean = sums.reduce((a, b) => a + b, 0) / sums.length;
    return { meanSum: mean, minSum: Math.min(...sums), maxSum: Math.max(...sums) };
  }, [rows]);

  const applyToApp = () => {
    onSumFilterChange?.({ min: minSum, max: maxSum, includeSupp: withSupp });
  };

  return (
    <section style={{ padding: 10, background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <b>Window Stats</b>
        <span style={{ fontSize: 12, color: "#444" }}>
          Mean sum {summary.meanSum.toFixed(1)} (min {summary.minSum}, max {summary.maxSum})
        </span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#555" }}>
          Bands: Low 1–15, Mid 16–30, High 31–45
        </span>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <label title="Include supplementary numbers in stats and sum">
          <input
            type="checkbox"
            checked={withSupp}
            onChange={(e) => setWithSupp(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Include supp (main + supp)
        </label>
        <label>
          Sum min:{" "}
          <input
            type="number"
            value={minSum}
            onChange={(e) => setMinSum(Number(e.target.value))}
            style={{ width: 80, marginLeft: 4 }}
          />
        </label>
        <label>
          Sum max:{" "}
          <input
            type="number"
            value={maxSum}
            onChange={(e) => setMaxSum(Number(e.target.value))}
            style={{ width: 80, marginLeft: 4 }}
          />
        </label>
        <button onClick={applyToApp} title="Apply this range to candidate generation (App)">
          Apply to generation
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              <th style={thL}>Draw (date)</th>
              <th style={thR}>Low</th>
              <th style={thR}>Mid</th>
              <th style={thR}>High</th>
              <th style={thR}>Even</th>
              <th style={thR}>Odd</th>
              <th style={thR}>Sum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                <td style={tdL}>{r.date}</td>
                <td style={tdR}>{r.low}</td>
                <td style={tdR}>{r.mid}</td>
                <td style={tdR}>{r.high}</td>
                <td style={tdR}>{r.even}</td>
                <td style={tdR}>{r.odd}</td>
                <td style={tdR}>{r.sum}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "8px 10px", color: "#666" }}>
                  No draws in the current window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: "#555", lineHeight: 1.6 }}>
        Tip: Click “Apply to generation” to use this sum range (and the main-only vs main+supp toggle)
        as an additional constraint when generating candidates.
      </div>
    </section>
  );
};

const thL: React.CSSProperties = { textAlign: "left", padding: "6px 8px", borderBottom: "2px solid #333" };
const thR: React.CSSProperties = { textAlign: "right", padding: "6px 8px", borderBottom: "2px solid #333" };
const tdL: React.CSSProperties = { textAlign: "left", padding: "6px 8px" };
const tdR: React.CSSProperties = { textAlign: "right", padding: "6px 8px" };
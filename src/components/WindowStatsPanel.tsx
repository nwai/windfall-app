import React, { useMemo, useState, useEffect } from "react";
import { Draw } from "../types";

/**
 * A pattern row: Low (<=22) count, High (>=23) count, Even count, Odd count, Sum (of mains+optional supp)
 */
export interface WindowPattern {
  low: number;
  high: number;
  even: number;
  odd: number;
  sum: number;
}

export interface WindowStatsPanelProps {
  draws: Draw[];

  // Existing sum range / toggle plumbing
  sumMin?: number;
  sumMax?: number;
  includeSupp?: boolean;
  onSumFilterChange?: (range: { min: number; max: number; includeSupp: boolean }) => void;

  // Pattern selection plumbing (NEW)
  patternsSelected?: WindowPattern[];                // patterns currently selected
  onTogglePattern?: (pattern: WindowPattern) => void; // add/remove pattern
  constraintMode?: 'boost' | 'restrict';             // read-only label for display
  patternBoostFactor?: number;                       // read-only label (only meaningful in boost mode)

  // Optional: sum exact match tolerance when used in restrict mode (display only here)
  sumTolerance?: number;                             // e.g. 0 for exact, 2 means ±2 accepted (display)
}

const LOW_MAX = 22; // threshold boundary (inclusive)

/* Helpers */
function buildRow(draw: Draw, withSupp: boolean): WindowPattern & { date: string } {
  const mains = draw.main || [];
  const supp = draw.supp || [];
  const all = withSupp ? [...mains, ...supp] : mains;
  const low = all.filter(n => n <= LOW_MAX).length;
  const high = all.length - low;
  const even = all.filter(n => n % 2 === 0).length;
  const odd = all.length - even;
  const sum = all.reduce((a, b) => a + b, 0);
  return { date: draw.date || "(unknown)", low, high, even, odd, sum };
}

function patternEquals(a: WindowPattern, b: WindowPattern) {
  return a.low === b.low &&
         a.high === b.high &&
         a.even === b.even &&
         a.odd === b.odd &&
         a.sum === b.sum;
}

export const WindowStatsPanel: React.FC<WindowStatsPanelProps> = ({
  draws,
  sumMin = 0,
  sumMax = 999,
  includeSupp = true,
  onSumFilterChange,
  patternsSelected = [],
  onTogglePattern,
  constraintMode = 'boost',
  patternBoostFactor = 0.15,
  sumTolerance = 0,
}) => {

  // Local UI state
  const [minSum, setMinSum] = useState<number>(sumMin);
  const [maxSum, setMaxSum] = useState<number>(sumMax);
  const [withSupp, setWithSupp] = useState<boolean>(includeSupp);

  // Sync if parent updates props
  useEffect(() => { setMinSum(sumMin); }, [sumMin]);
  useEffect(() => { setMaxSum(sumMax); }, [sumMax]);
  useEffect(() => { setWithSupp(includeSupp); }, [includeSupp]);

  // Build rows oldest -> newest
  const rows = useMemo(() => draws.map(d => buildRow(d, withSupp)), [draws, withSupp]);

  // Summary (simple)
  const summary = useMemo(() => {
    if (!rows.length) return { meanSum: 0, minSum: 0, maxSum: 0 };
    const sums = rows.map(r => r.sum);
    const mean = sums.reduce((a, b) => a + b, 0) / sums.length;
    return { meanSum: mean, minSum: Math.min(...sums), maxSum: Math.max(...sums) };
  }, [rows]);

  // Apply sum filter back to App
  const applyToApp = () => {
    onSumFilterChange?.({ min: minSum, max: maxSum, includeSupp: withSupp });
  };

  function isSelected(p: WindowPattern): boolean {
    return patternsSelected.some(sel => patternEquals(sel, p));
  }

  return (
    <section style={{
      padding: 10,
      background: "#fff",
      border: "1px solid #e0e0e0",
      borderRadius: 6
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 8
      }}>
        <b>Window Stats (Low/High + Odd/Even + Sum)</b>
        <span style={{ fontSize: 12, color: "#444" }}>
          Mean sum {summary.meanSum.toFixed(1)} (min {summary.minSum}, max {summary.maxSum})
        </span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#555" }}>
          Low ≤ {LOW_MAX}, High ≥ {LOW_MAX + 1}
        </span>
      </div>

      {/* Controls row */}
      <div style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: 8
      }}>
        <label title="Include supplementary numbers in stats and sum calculations">
          <input
            type="checkbox"
            checked={withSupp}
            onChange={(e) => setWithSupp(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Include supp (main + supp)
        </label>

        <label>
          Sum min:&nbsp;
          <input
            type="number"
            value={minSum}
            onChange={(e) => setMinSum(Number(e.target.value))}
            style={{ width: 70 }}
          />
        </label>
        <label>
          Sum max:&nbsp;
          <input
            type="number"
            value={maxSum}
            onChange={(e) => setMaxSum(Number(e.target.value))}
            style={{ width: 70 }}
          />
        </label>

        <button
          type="button"
          onClick={applyToApp}
          style={{ padding: "4px 10px" }}
          title="Apply current sum range and supp toggle to candidate generation filters"
        >
          Apply to generation
        </button>

        {/* Read-only constraint mode and selected patterns count */}
        <span style={{ fontSize: 12, color: "#555" }}>
          Mode: <b>{constraintMode}</b>
          {constraintMode === 'boost' && ` (factor ${patternBoostFactor})`}
        </span>
        <span style={{ fontSize: 12, color: "#555" }}>
          Selected patterns: <b>{patternsSelected.length}</b>
        </span>
        {constraintMode === 'restrict' && (
          <span style={{ fontSize: 12, color: "#555" }}>
            Sum tolerance ±{sumTolerance}
          </span>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", minWidth: 720, width: "100%" }}>
          <thead>
            <tr>
              <th style={thL}>Date</th>
              <th style={thR}>Low</th>
              <th style={thR}>High</th>
              <th style={thR}>Even</th>
              <th style={thR}>Odd</th>
              <th style={thR}>Sum</th>
              <th style={thR}>Pattern</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const pattern: WindowPattern = {
                low: r.low,
                high: r.high,
                even: r.even,
                odd: r.odd,
                sum: r.sum
              };
              const sel = isSelected(pattern);
              return (
                <tr
                  key={i}
                  style={{
                    borderBottom: "1px solid #eee",
                    background: sel ? "#e3f2fd" : undefined
                  }}
                >
                  <td style={tdL}>{r.date}</td>
                  <td style={tdR}>{r.low}</td>
                  <td style={tdR}>{r.high}</td>
                  <td style={tdR}>{r.even}</td>
                  <td style={tdR}>{r.odd}</td>
                  <td style={tdR}>{r.sum}</td>
                  <td style={tdR}>
                    {onTogglePattern && (
                      <button
                        type="button"
                        onClick={() => onTogglePattern(pattern)}
                        style={{
                          padding: "2px 8px",
                          fontSize: 11,
                          background: sel ? "#1976d2" : "#fff",
                          color: sel ? "#fff" : "#1976d2",
                          border: "1px solid #1976d2",
                          borderRadius: 4,
                          cursor: "pointer"
                        }}
                        title={sel ? "Remove pattern from constraints" : "Add pattern as constraint"}
                      >
                        {sel ? "Remove" : "Add"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
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
        Patterns: (Low count ≤{LOW_MAX}) (High count ≥{LOW_MAX + 1}) (Even, Odd, Sum). Use "Add" to capture a row as a
        pattern constraint. In <b>restrict</b> mode candidates must match at least one selected pattern (optionally
        allowing ±t sum tolerance). In <b>boost</b> mode each match multiplies candidate score by (1 + factor).
        Evolving odd/even dominance (e.g. shift 4:4 → 5:3) can be tracked by selecting recent rows with desired ratios.
      </div>
    </section>
  );
};

/* Shared cell styles */
const thL: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "2px solid #333"
};
const thR: React.CSSProperties = {
  textAlign: "right",
  padding: "6px 8px",
  borderBottom: "2px solid #333"
};
const tdL: React.CSSProperties = { textAlign: "left", padding: "6px 8px" };
const tdR: React.CSSProperties = { textAlign: "right", padding: "6px 8px" };
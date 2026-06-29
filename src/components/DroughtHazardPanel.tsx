import React from "react";
import { Draw } from "../types";
import { computeDroughtHazard } from "../lib/droughtHazard";

export const DroughtHazardPanel: React.FC<{
  history: Draw[];
  top?: number;
  title?: string;
  onToggleNumber?: (n: number) => void;
  forcedNumbers?: number[];
  maxForcedSelections?: number;
  bucketLabels?: Record<number, string>;
}> = ({ history, top = 12, title, onToggleNumber, forcedNumbers = [], maxForcedSelections, bucketLabels }) => {
  const { baselineProbability, maxK, byNumber, priorTrials } = React.useMemo(() => computeDroughtHazard(history), [history]);
  const forcedSet = React.useMemo(() => new Set(forcedNumbers), [forcedNumbers]);
  const forcedCount = forcedSet.size;
  const maxReached = typeof maxForcedSelections === "number" && forcedCount >= maxForcedSelections;
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
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>{title || "Drought-break empirical shortlist (mains + supps)"}</div>
        {onToggleNumber && typeof maxForcedSelections === "number" && (
          <div
            aria-live="polite"
            style={{
              border: `1px solid ${forcedCount ? "#bbf7d0" : "#e2e8f0"}`,
              borderRadius: 999,
              background: forcedCount ? "#f0fdf4" : "#f8fafc",
              color: forcedCount ? "#166534" : "#64748b",
              fontSize: 12,
              fontWeight: 800,
              padding: "3px 8px",
            }}
          >
            {forcedCount}/{maxForcedSelections} selected for forced inclusion
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
        Mains+supps appearance evidence by current drought length. Rates are empirical, shrunk toward the {(baselineProbability * 100).toFixed(1)}% neutral 8-of-45 baseline.
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ background: "#f7f7f7" }}>
            <th style={th}>#</th>
            <th style={{ ...th, textAlign: "left" }}>Month bucket</th>
            <th style={th}>Current drought (k)</th>
            <th style={th}>Smoothed appearance rate</th>
            <th style={th}>Observed hits / trials</th>
            <th style={th}>Vs baseline</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const isForced = forcedSet.has(r.number);
            const disabled = !!onToggleNumber && !isForced && maxReached;
            const toggleLabel = isForced
              ? `Remove drought-break forced inclusion ${r.number}`
              : disabled
                ? `Maximum drought-break forced inclusions reached; remove another number before adding ${r.number}`
                : `Add drought-break forced inclusion ${r.number}`;
            return (
              <tr
                key={r.number}
                style={{ background: isForced ? "#f0fdf4" : undefined }}
              >
                <td style={td}>
                  {onToggleNumber ? (
                    <button
                      type="button"
                      onClick={() => onToggleNumber(r.number)}
                      disabled={disabled}
                      aria-pressed={isForced}
                      aria-label={toggleLabel}
                      title={toggleLabel}
                      style={numberButton(isForced, disabled)}
                    >
                      {r.number}
                    </button>
                  ) : (
                    r.number
                  )}
                </td>
                <td style={{ ...td, textAlign: "left" }}>{bucketLabels?.[r.number] ?? fallbackLabels[r.number] ?? "—"}</td>
                <td style={td}>{r.k}</td>
                <td style={td}>{(r.p * 100).toFixed(1)}%</td>
                <td style={td}>{r.hitsNext}/{r.trials}</td>
                <td style={{ ...td, color: r.liftVsBaseline >= 0 ? "#b91c1c" : "#1d4ed8", fontWeight: 700 }}>
                  {r.liftVsBaseline >= 0 ? "+" : ""}{(r.liftVsBaseline * 100).toFixed(1)}pp
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
        Max observed drought length k = {maxK}. Sparse drought lengths are stabilized with {priorTrials} baseline prior trials. Month bucket is context only; it does not drive the rate.
      </div>
    </section>
  );
};

const th: React.CSSProperties = { textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #ddd", fontWeight: 700 };
const td: React.CSSProperties = { textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #eee" };

const numberButton = (active: boolean, disabled: boolean): React.CSSProperties => ({
  minWidth: 34,
  minHeight: 30,
  border: `1px solid ${active ? "#15803d" : "#cbd5e1"}`,
  borderRadius: 8,
  background: active ? "#dcfce7" : "#ffffff",
  color: disabled ? "#94a3b8" : active ? "#14532d" : "#0f172a",
  cursor: disabled ? "not-allowed" : "pointer",
  fontWeight: 800,
  fontVariantNumeric: "tabular-nums",
});

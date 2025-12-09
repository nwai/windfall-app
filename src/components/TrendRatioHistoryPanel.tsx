import React, { useState, useMemo } from "react";

/**
 * Assumed incoming row shape (same as your existing historicalTrendRatioStats):
 *  tag: "u-d-f"
 *  count: observed occurrences of that ratio
 *  percent: (count / drawsConsidered) * 100 (but we recompute anyway)
 *  up, down, flat: sums across those draws (already aggregated)
 */
export interface TrendRatioStat {
  tag: string;
  count: number;
  percent: number;
  up: number;
  down: number;
  flat: number;
}

interface TrendRatioHistoryPanelProps {
  stats: TrendRatioStat[];
  allowedTrendRatios: string[];
  toggleTrendRatio: (tag: string) => void;
  lookback: number;
  threshold: number;
  drawsConsidered: number;   // eligible draws (windowSize - lookback)
  windowDraws: number;       // active window size
  minExpectedForZ?: number;  // default 3
  showExpected?: boolean;    // default true
}

/**
 * Compute factorial quickly for small n (n <= 8 here).
 */
function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/**
 * Computes z-scores for each ratio under a multinomial independence model:
 *  P_r = 8!/(u! d! f!) * pU^u * pD^d * pF^f
 * Expected E_r = N * P_r
 * Var(O_r) = N * P_r * (1 - P_r)
 * z = (O_r - E_r) / sqrt(Var)
 *
 * When expected < minExpectedForZ we suppress z (null) and show a warning indicator.
 */
function enrichWithZ(
  stats: TrendRatioStat[],
  drawsConsidered: number,
  pU: number,
  pD: number,
  pF: number,
  minExpectedForZ: number
) {
  if (drawsConsidered <= 0) {
    return stats.map(s => ({
      ...s,
      expected: 0,
      prob: 0,
      z: null,
      zWarn: "No eligible draws"
    }));
  }

  return stats.map(s => {
    const [uStr, dStr, fStr] = s.tag.split("-");
    const u = +uStr, d = +dStr, f = +fStr;
    if (u + d + f !== 8) {
      return {
        ...s,
        expected: 0,
        prob: 0,
        z: null,
        zWarn: "Invalid ratio"
      };
    }
    // Multinomial probability
    const multinomialCoeff = factorial(8) / (factorial(u) * factorial(d) * factorial(f));
    const P_r = multinomialCoeff * Math.pow(pU, u) * Math.pow(pD, d) * Math.pow(pF, f);
    const expected = drawsConsidered * P_r;
    if (expected < minExpectedForZ) {
      return {
        ...s,
        expected,
        prob: P_r,
        z: null,
        zWarn: "Low expected"
      };
    }
    const variance = drawsConsidered * P_r * (1 - P_r);
    const z = variance > 0 ? (s.count - expected) / Math.sqrt(variance) : null;
    return {
      ...s,
      expected,
      prob: P_r,
      z,
      zWarn: null
    };
  });
}

export const TrendRatioHistoryPanel: React.FC<TrendRatioHistoryPanelProps> = ({
  stats,
  allowedTrendRatios,
  toggleTrendRatio,
  lookback,
  threshold,
  drawsConsidered,
  windowDraws,
  minExpectedForZ = 3,
  showExpected = true
}) => {
  const [sortKey, setSortKey] = useState<SortKey>("count");
  const [descending, setDescending] = useState(true);

  const totalEligible = drawsConsidered || 0;

  // Compute global pU, pD, pF from sums of up/down/flat across all ratio rows
  const { pU, pD, pF } = useMemo(() => {
    if (!totalEligible || !stats.length) return { pU: 0, pD: 0, pF: 0 };
    const sumUp = stats.reduce((s, r) => s + r.up, 0);
    const sumDown = stats.reduce((s, r) => s + r.down, 0);
    const sumFlat = stats.reduce((s, r) => s + r.flat, 0);
    const total = sumUp + sumDown + sumFlat || 1;
    return { pU: sumUp / total, pD: sumDown / total, pF: sumFlat / total };
  }, [stats, totalEligible]);

  // Enrich each row with probability, expected, z, warnings
  const enriched = useMemo(() => {
    if (!stats.length || !totalEligible) return [];
    return enrichWithZ(stats, totalEligible, pU, pD, pF, minExpectedForZ);
  }, [stats, totalEligible, pU, pD, pF, minExpectedForZ]);

  // Coverage: selected ratios total observed / totalEligible
  const coverage = useMemo(() => {
    if (!totalEligible) return { count: 0, percent: 0 };
    if (!allowedTrendRatios.length) {
      return { count: totalEligible, percent: 100 };
    }
    const selectedCount = enriched
      .filter(r => allowedTrendRatios.includes(r.tag))
      .reduce((s, r) => s + r.count, 0);
    return { count: selectedCount, percent: +(100 * selectedCount / totalEligible).toFixed(2) };
  }, [enriched, allowedTrendRatios, totalEligible]);

  // Global max count for bar scaling (stable when sorting)
  const globalMaxCount = useMemo(
    () => enriched.length ? Math.max(...enriched.map(r => r.count)) : 1,
    [enriched]
  );

  // Sorting
  const sorted = useMemo(() => {
    const arr = enriched.slice();
    arr.sort((a, b) => {
      const dir = descending ? 1 : -1;
      switch (sortKey) {
        case "tag": return dir * a.tag.localeCompare(b.tag);
        case "count": return dir * (b.count - a.count);
        case "percent": return dir * (b.percent - a.percent);
        case "expected": return dir * ((b.expected ?? 0) - (a.expected ?? 0));
        case "z": {
          const az = a.z ?? -Infinity;
          const bz = b.z ?? -Infinity;
            return dir * (bz - az);
        }
        case "prob": return dir * ((b.prob ?? 0) - (a.prob ?? 0));
        default: return 0;
      }
    });
    return arr;
  }, [enriched, sortKey, descending]);

  // Column definitions
  const columns: ColumnDef[] = [
    { key: "tag", label: "Ratio", title: "u-d-f pattern" },
    { key: "count", label: "Count", title: "Observed occurrences" },
    { key: "percent", label: "%", title: "Observed % of eligible draws" },
    { key: "expected", label: "Exp", title: "Expected occurrences under null (multinomial)", hidden: !showExpected },
    { key: "prob", label: "P%", title: "Model P(r) * 100", formatter: v => (v * 100).toFixed(2) },
    { key: "z", label: "z", title: "Z-score (|z|>2 ≈ notable)" }
  ];

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setDescending(!descending);
    else {
      setSortKey(k);
      setDescending(true);
    }
  };

  if (!stats.length) {
    return (
      <section style={panelStyle}>
        <h3 style={h3Style}>Historical Trend Ratio Distribution</h3>
        <div style={{ fontSize: 12, color: "#666" }}>
          Not enough data (need at least lookback+1 eligible draws).
        </div>
      </section>
    );
  }

  return (
    <section style={panelStyle}>
      <h3 style={h3Style}>Historical Trend Ratio Distribution (with z)</h3>

      <div style={infoRowStyle}>
        Window draws: {windowDraws} | Eligible: {drawsConsidered} | Selected coverage: {coverage.count}/{drawsConsidered} ({coverage.percent}%)
        {allowedTrendRatios.length === 0 && (
          <span style={{ marginLeft: 6, color: "#1976d2" }}>(No ratios selected → filter OFF)</span>
        )}
      </div>
      <div style={infoSubStyle}>
        L={lookback} compares hybrid value now vs draw L back; θ={threshold}. pU={pU.toFixed(2)}, pD={pD.toFixed(2)}, pF={pF.toFixed(2)}.
        z uses multinomial null; suppressed when expected &lt; {minExpectedForZ}.
      </div>

      {/* Bar visualization (top 20 by currently sorted order) */}
      <div style={barWrapStyle}>
        {sorted.slice(0, 20).map(r => {
          const active = allowedTrendRatios.includes(r.tag);
          const h = Math.max(4, Math.round((r.count / globalMaxCount) * 70));
          const zColor = zColorStyle(r.z);
          return (
            <div
              key={`bar-${r.tag}`}
              style={barItemStyle}
              title={`${r.tag} | Obs=${r.count} (${r.percent.toFixed(2)}%) | Exp=${(r.expected ?? 0).toFixed(2)} | z=${r.z?.toFixed(2) ?? "—"}`}
              onClick={() => toggleTrendRatio(r.tag)}
            >
              <div
                style={{
                  height: h,
                  width: 22,
                  background: active ? "#1976d2" : "#bbb",
                  opacity: active ? 0.95 : 0.55,
                  borderRadius: 4,
                  position: "relative",
                  transition: "height 0.2s"
                }}
              >
                {r.z != null && Math.abs(r.z) >= 2 && (
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: -14,
                      transform: "translateX(-50%)",
                      fontSize: 10,
                      color: zColor,
                      fontWeight: 600
                    }}
                  >
                    {r.z.toFixed(1)}
                  </div>
                )}
              </div>
              <div style={barLabelStyle}>{r.tag}</div>
            </div>
          );
        })}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {columns.filter(c => !c.hidden).map(col => {
                const active = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    style={{ ...th, background: active ? "#eef4ff" : undefined }}
                    onClick={() => handleSort(col.key)}
                    title={col.title}
                  >
                    {col.label}{active ? (descending ? " ↓" : " ↑") : ""}
                  </th>
                );
              })}
              <th style={th}>Select</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const active = allowedTrendRatios.includes(r.tag);
              const zStyle = styleForZ(r.z);
              return (
                <tr
                  key={r.tag}
                  style={{ background: active ? "#eaf3ff" : undefined }}
                >
                  {columns.filter(c => !c.hidden).map(c => {
                    let value: any = (r as any)[c.key];
                    if (c.key === "percent") value = r.percent.toFixed(2);
                    if (c.key === "expected") value = (r.expected ?? 0).toFixed(2);
                    if (c.key === "prob") value = c.formatter ? c.formatter(r.prob ?? 0) : (r.prob ?? 0).toFixed(4);
                    if (c.key === "z") {
                      if (r.zWarn) value = "—";
                      else if (r.z == null) value = "—";
                      else value = r.z.toFixed(2);
                    }
                    const cellStyle =
                      c.key === "z"
                        ? { ...tdCenter, ...zStyle }
                        : tdCenter;
                    return (
                      <td key={c.key} style={cellStyle}>
                        {value}
                        {c.key === "z" && r.zWarn && (
                          <span style={{ color: "#999", marginLeft: 4, fontSize: 10 }} title={r.zWarn}>*</span>
                        )}
                      </td>
                    );
                  })}
                  <td style={tdCenter}>
                    <button
                      type="button"
                      onClick={() => toggleTrendRatio(r.tag)}
                      style={{
                        padding: "2px 6px",
                        fontSize: 11,
                        borderRadius: 4,
                        border: active ? "1px solid #1976d2" : "1px solid #aaa",
                        background: active ? "#1976d2" : "#fff",
                        color: active ? "#fff" : "#222",
                        cursor: "pointer"
                      }}
                    >
                      {active ? "On" : "Add"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={footStyle}>
        Click a bar or Add/On button to toggle ratio filtering. z shows deviation from a neutral multinomial model.
        |z| ≥ 2 ≈ notable. Expected suppressed if &lt; {minExpectedForZ}. Adjust L or θ to change classification dynamics.
      </div>
    </section>
  );
};

/* ---------- Helper styling for z ---------- */
function zColorStyle(z: number | null | undefined): string {
  if (z == null) return "#999";
  const absZ = Math.abs(z);
  if (absZ >= 4) return "#d32f2f"; // dark red
  if (absZ >= 3) return "#e64a19"; // red
  if (absZ >= 2) return "#f57c00"; // orange
  return "#388e3c"; // green
}
function styleForZ(z: number | null | undefined): React.CSSProperties {
  if (z == null) return {};
  const absZ = Math.abs(z);
  const base = { fontWeight: 500, transition: "all 0.2s" };
  if (absZ >= 4) return { ...base, color: "#d32f2f", opacity: 1 };
  if (absZ >= 3) return { ...base, color: "#e64a19", opacity: 1 };
  if (absZ >= 2) return { ...base, color: "#f57c00", opacity: 1 };
  return { ...base, color: "#388e3c", opacity: 1 };
}

/* ---------- Types ---------- */
type SortKey = "tag" | "count" | "percent" | "expected" | "z" | "prob";
interface ColumnDef {
  key: SortKey;
  label: string;
  title: string;
  hidden?: boolean;
  formatter?: (v: number) => string;
}

/* ---------- Styles ---------- */
const panelStyle: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 8,
  padding: 16,
  background: "#fff",
};
const h3Style: React.CSSProperties = { margin: 0, marginBottom: 8 };
const infoRowStyle: React.CSSProperties = { fontSize: 12, color: "#333", marginBottom: 6 };
const infoSubStyle: React.CSSProperties = { fontSize: 11, color: "#666", marginBottom: 10 };
const barWrapStyle: React.CSSProperties = { display: "flex", gap: 8, alignItems: "flex-end", margin: "8px 0" };
const barItemStyle: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center" };
const barLabelStyle: React.CSSProperties = { fontSize: 10, color: "#555", marginTop: 4 };
const tableStyle: React.CSSProperties = { borderCollapse: "collapse", width: "100%", fontSize: 12 };
const th: React.CSSProperties = { textAlign: "center", padding: "4px 6px", borderBottom: "1px solid #ddd", fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" };
const tdCenter: React.CSSProperties = { textAlign: "center", padding: "4px 6px", borderBottom: "1px solid " + "#eee" };
const footStyle: React.CSSProperties = { fontSize: 11, color: "#555", marginTop: 8 };

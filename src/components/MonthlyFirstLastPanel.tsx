import React, { useMemo, useState } from "react";
import type { Draw } from "../types";
import { filterRowsForHistoryBaselines, getExcludedMonthLabelsForHistoryBaselines } from "../lib/monthlyAverageScope";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Types                                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

type CompareMode = "intra" | "cross";

interface IntraRow {
  monthLabel: string;
  firstDate: string;
  lastDate: string;
  drawsInMonth: number;
  firstNums: number[];
  lastNums: number[];
  hits: number[];         // appear in both first & last
  onlyFirst: number[];    // in first but not last
  onlyLast: number[];     // in last but not first
}

interface CrossRow {
  monthLabel: string;       // "Month N → Month N+1"
  endDate: string;
  startDate: string;
  endNums: number[];
  startNums: number[];
  hits: number[];
  onlyEnd: number[];
  onlyStart: number[];
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

function parseDate(d: string): Date | null {
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : new Date(t);
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function numsOf(draw: Draw, includeSupp: boolean): number[] {
  const nums = includeSupp ? [...draw.main, ...draw.supp] : [...draw.main];
  return [...new Set(nums)].filter((n) => n >= 1 && n <= 45).sort((a, b) => a - b);
}

function buildIntraRows(history: Draw[], includeSupp: boolean): IntraRow[] {
  if (!history.length) return [];

  // Group draws by month, sorted chronologically within each month
  const byMonth = new Map<string, { date: Date; draw: Draw }[]>();
  for (const draw of history) {
    const dt = parseDate(draw.date || "");
    if (!dt) continue;
    const k = getMonthKey(dt);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k)!.push({ date: dt, draw });
  }

  const rows: IntraRow[] = [];
  for (const [month, items] of Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (items.length < 2) continue; // need at least 2 draws to compare first vs last
    items.sort((a, b) => a.date.getTime() - b.date.getTime());

    const first = items[0];
    const last = items[items.length - 1];
    const firstNums = numsOf(first.draw, includeSupp);
    const lastNums = numsOf(last.draw, includeSupp);
    const lastSet = new Set(lastNums);
    const firstSet = new Set(firstNums);

    rows.push({
      monthLabel: month,
      firstDate: first.draw.date || "",
      lastDate: last.draw.date || "",
      drawsInMonth: items.length,
      firstNums,
      lastNums,
      hits: firstNums.filter((n) => lastSet.has(n)),
      onlyFirst: firstNums.filter((n) => !lastSet.has(n)),
      onlyLast: lastNums.filter((n) => !firstSet.has(n)),
    });
  }
  return rows;
}

function buildCrossRows(history: Draw[], includeSupp: boolean): CrossRow[] {
  if (!history.length) return [];

  const byMonth = new Map<string, { date: Date; draw: Draw }[]>();
  for (const draw of history) {
    const dt = parseDate(draw.date || "");
    if (!dt) continue;
    const k = getMonthKey(dt);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k)!.push({ date: dt, draw });
  }

  const sortedMonths = Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const rows: CrossRow[] = [];

  for (let i = 0; i < sortedMonths.length - 1; i++) {
    const [monthA, itemsA] = sortedMonths[i];
    const [monthB, itemsB] = sortedMonths[i + 1];
    itemsA.sort((a, b) => a.date.getTime() - b.date.getTime());
    itemsB.sort((a, b) => a.date.getTime() - b.date.getTime());

    const endDraw = itemsA[itemsA.length - 1];
    const startDraw = itemsB[0];
    const endNums = numsOf(endDraw.draw, includeSupp);
    const startNums = numsOf(startDraw.draw, includeSupp);
    const startSet = new Set(startNums);
    const endSet = new Set(endNums);

    rows.push({
      monthLabel: `${monthA} → ${monthB}`,
      endDate: endDraw.draw.date || "",
      startDate: startDraw.draw.date || "",
      endNums,
      startNums,
      hits: endNums.filter((n) => startSet.has(n)),
      onlyEnd: endNums.filter((n) => !startSet.has(n)),
      onlyStart: startNums.filter((n) => !endSet.has(n)),
    });
  }
  return rows;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Sub-component: hit frequency summary for a set of rows                     */
/* ─────────────────────────────────────────────────────────────────────────── */

function HitFreqBar({ nums, hitCounts, totalRows }: { nums: number[]; hitCounts: Map<number, number>; totalRows: number }) {
  if (!nums.length) return null;
  const topNums = [...nums].sort((a, b) => (hitCounts.get(b) ?? 0) - (hitCounts.get(a) ?? 0)).slice(0, 15);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
      {topNums.map((n) => {
        const c = hitCounts.get(n) ?? 0;
        const pct = totalRows > 0 ? c / totalRows : 0;
        return (
          <span key={n} style={{
            fontSize: 11,
            padding: "1px 6px",
            borderRadius: 10,
            background: `rgba(37,99,235,${0.15 + pct * 0.75})`,
            color: pct > 0.4 ? "#1e3a8a" : "#374151",
            fontWeight: pct > 0.3 ? 700 : 400,
            border: "1px solid rgba(37,99,235,0.2)",
          }}
            title={`Number ${n}: hit in ${c}/${totalRows} months (${(pct * 100).toFixed(0)}%)`}
          >
            {n} <span style={{ color: "#6b7280", fontWeight: 400 }}>×{c}</span>
          </span>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Main component                                                               */
/* ─────────────────────────────────────────────────────────────────────────── */

export const MonthlyFirstLastPanel: React.FC<{ history: Draw[] }> = ({ history }) => {
  const [includeSupp, setIncludeSupp] = useState(false);
  const [mode, setMode] = useState<CompareMode>("intra");
  const [showNums, setShowNums] = useState(false);

  const intraRows = useMemo(() => buildIntraRows(history, includeSupp), [history, includeSupp]);
  const crossRows = useMemo(() => buildCrossRows(history, includeSupp), [history, includeSupp]);

  const rows = mode === "intra" ? intraRows : crossRows;
  const averageRows = useMemo(
    () => (
      mode === "intra"
        ? filterRowsForHistoryBaselines(intraRows, (row) => row.monthLabel)
        : filterRowsForHistoryBaselines(crossRows, (row) => row.monthLabel.split(" → ")[0] ?? row.monthLabel)
    ),
    [crossRows, intraRows, mode],
  );
  const averageExcludedMonthLabels = useMemo(
    () => (
      mode === "intra"
        ? getExcludedMonthLabelsForHistoryBaselines(intraRows, (row) => row.monthLabel)
        : getExcludedMonthLabelsForHistoryBaselines(crossRows, (row) => row.monthLabel.split(" → ")[0] ?? row.monthLabel)
    ),
    [crossRows, intraRows, mode],
  );

  /* ── Aggregate hit counts across all rows ────────────────────────── */
  const hitCounts = useMemo(() => {
    const counts = new Map<number, number>();
    rows.forEach((r) => {
      r.hits.forEach((n) => counts.set(n, (counts.get(n) ?? 0) + 1));
    });
    return counts;
  }, [rows]);

  const allHitNums = useMemo(() =>
    Array.from({ length: 45 }, (_, i) => i + 1).filter((n) => (hitCounts.get(n) ?? 0) > 0),
    [hitCounts]);

  const avgHits = averageRows.length
    ? (averageRows.reduce((s, r) => s + r.hits.length, 0) / averageRows.length).toFixed(2)
    : "—";

  const mostRecentRow = rows.length ? rows[rows.length - 1] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
        <b style={{ fontSize: 14 }}>Monthly First ↔ Last Draw Hits</b>

        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          Compare:
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as CompareMode)}
            style={{ marginLeft: 6, fontSize: 13, padding: "1px 6px", borderRadius: 4, border: "1px solid #cbd5e1" }}
          >
            <option value="intra">First vs Last within same month</option>
            <option value="cross">Last of month N vs First of month N+1</option>
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={includeSupp} onChange={(e) => setIncludeSupp(e.target.checked)} />
          Include supplementary
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={showNums} onChange={(e) => setShowNums(e.target.checked)} />
          Show all numbers
        </label>
      </div>

      {/* Summary cards */}
      {rows.length > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "8px 14px", fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: "#0369a1" }}>Avg hits / comparison</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0c4a6e" }}>{avgHits}</div>
          </div>
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 14px", fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: "#15803d" }}>Total comparisons</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#14532d" }}>{rows.length}</div>
          </div>
          {mostRecentRow && (
            <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 14px", fontSize: 13, minWidth: 180 }}>
              <div style={{ fontWeight: 700, color: "#92400e" }}>Most recent ({mostRecentRow.monthLabel})</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#78350f" }}>
                {mostRecentRow.hits.length} hit{mostRecentRow.hits.length !== 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: 11, color: "#a16207", marginTop: 2 }}>
                {mostRecentRow.hits.length > 0 ? mostRecentRow.hits.join(", ") : "No overlap"}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Most frequently hit numbers */}
      {allHitNums.length > 0 && (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: "#475569", marginBottom: 4 }}>
            Most frequently hit numbers (across all {rows.length} comparisons) — top 15 shown, size = frequency:
          </div>
          <HitFreqBar nums={allHitNums} hitCounts={hitCounts} totalRows={rows.length} />
        </div>
      )}

      {/* Table */}
      {rows.length === 0 ? (
        <div style={{ color: "#6b7280", fontSize: 13 }}>
          {mode === "intra"
            ? "Need at least one month with 2+ draws."
            : "Need at least two consecutive months of data."}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 620 }}>
            <thead>
              <tr style={{ background: "#f4f6fb", borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>
                  {mode === "intra" ? "Month" : "Transition"}
                </th>
                <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap" }}>
                  {mode === "intra" ? "First draw" : "Last of month N"}
                </th>
                <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap" }}>
                  {mode === "intra" ? "Last draw" : "First of month N+1"}
                </th>
                <th style={{ textAlign: "center", padding: "6px 8px", whiteSpace: "nowrap" }}>Hits</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Hit numbers</th>
                {showNums && (
                  <>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "#0369a1" }}>
                      {mode === "intra" ? "First only" : "End only"}
                    </th>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "#0369a1" }}>
                      {mode === "intra" ? "Last only" : "Start only"}
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => {
                const isIntra = mode === "intra";
                const ir = r as IntraRow;
                const cr = r as CrossRow;
                const aDate = isIntra ? ir.firstDate : cr.endDate;
                const bDate = isIntra ? ir.lastDate : cr.startDate;
                const aNums = isIntra ? ir.firstNums : cr.endNums;
                const bNums = isIntra ? ir.lastNums : cr.startNums;
                const onlyA = isIntra ? ir.onlyFirst : cr.onlyEnd;
                const onlyB = isIntra ? ir.onlyLast : cr.onlyStart;
                const hitPct = rows.length > 0 ? r.hits.length / Math.max(aNums.length, bNums.length, 1) : 0;
                const isRecent = r.monthLabel === mostRecentRow?.monthLabel;
                return (
                  <tr key={r.monthLabel} style={{
                    borderBottom: "1px solid #edf2f7",
                    background: isRecent ? "#fffbeb" : undefined,
                  }}>
                    <td style={{ padding: "5px 8px", fontWeight: 700 }}>
                      {r.monthLabel}
                      {isRecent && <span style={{ marginLeft: 5, fontSize: 10, color: "#b45309", background: "#fef3c7", borderRadius: 3, padding: "0 4px" }}>latest</span>}
                    </td>
                    <td style={{ padding: "5px 8px", color: "#374151", whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 600, fontSize: 11, color: "#6b7280" }}>{aDate}</div>
                      {showNums && <div style={{ fontSize: 11 }}>{aNums.join(", ")}</div>}
                    </td>
                    <td style={{ padding: "5px 8px", color: "#374151", whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 600, fontSize: 11, color: "#6b7280" }}>{bDate}</div>
                      {showNums && <div style={{ fontSize: 11 }}>{bNums.join(", ")}</div>}
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "center" }}>
                      <span style={{
                        fontWeight: 700,
                        fontSize: 14,
                        color: hitPct > 0.3 ? "#166534" : hitPct > 0.15 ? "#92400e" : "#374151",
                        background: hitPct > 0.3 ? "#dcfce7" : hitPct > 0.15 ? "#fef3c7" : undefined,
                        borderRadius: 4,
                        padding: hitPct > 0.15 ? "0 5px" : undefined,
                      }}>
                        {r.hits.length}
                      </span>
                    </td>
                    <td style={{ padding: "5px 8px", color: "#1d4ed8", fontWeight: r.hits.length > 0 ? 600 : 400 }}>
                      {r.hits.length > 0 ? r.hits.join(", ") : <span style={{ color: "#94a3b8" }}>—</span>}
                    </td>
                    {showNums && (
                      <>
                        <td style={{ padding: "5px 8px", color: "#475569", fontSize: 11 }}>{onlyA.join(", ") || "—"}</td>
                        <td style={{ padding: "5px 8px", color: "#475569", fontSize: 11 }}>{onlyB.join(", ") || "—"}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {/* Footer averages */}
            {averageRows.length > 1 && (
              <tfoot>
                <tr style={{ background: "#f8fafc", borderTop: "2px solid #e2e8f0", fontWeight: 700 }}>
                  <td style={{ padding: "6px 8px", color: "#475569" }} colSpan={3}>
                    Average ({averageRows.length} comparison{averageRows.length === 1 ? "" : "s"}{averageExcludedMonthLabels.length ? `; excl. ${averageExcludedMonthLabels.join(", ")}` : ""})
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center", color: "#0c4a6e", fontSize: 14 }}>
                    {avgHits}
                  </td>
                  <td style={{ padding: "6px 8px", fontSize: 11, color: "#64748b" }} colSpan={showNums ? 3 : 1}>
                    Min: {Math.min(...averageRows.map((r) => r.hits.length))} · Max: {Math.max(...averageRows.map((r) => r.hits.length))}
                    {" · "}0 hits: {averageRows.filter((r) => r.hits.length === 0).length} months
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
};

export default MonthlyFirstLastPanel;

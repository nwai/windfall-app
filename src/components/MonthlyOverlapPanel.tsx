import React, { useMemo, useState, useCallback } from "react";
import type { Draw } from "../types";

interface OverlapRow {
  monthLabel: string;
  targetDate: string;
  priorDrawCount: number;
  totalDrawsInMonth: number;
  overlapCount: number;
  overlaps: number[];
  overlapCounts: Record<number, number>;
  totalOverlapFreq: number;
  avgOverlapFreq: number;
  targetNums: number[];
  undrawnNums: number[];
  undrawnCount: number;
  /** All numbers that appeared in 2+ draws across the full month, sorted by freq desc */
  allMonthNumFreqs: { num: number; freq: number }[];
  /** True when this is a forward-looking placeholder row (no draws yet this month) */
  isPending?: boolean;
  pendingMessage?: string;
}

function parseDate(d: string): Date | null {
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : new Date(t);
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildRows(history: Draw[], includeSupp: boolean, targetDrawIndex: number): OverlapRow[] {
  if (!history.length) return [];
  const items = history
    .map((d) => {
      const dt = parseDate(d.date || "");
      if (!dt) return null;
      const nums = includeSupp ? [...d.main, ...d.supp] : [...d.main];
      return { date: dt, nums, rawDate: d.date };
    })
    .filter(Boolean)
    .sort((a, b) => a!.date.getTime() - b!.date.getTime()) as { date: Date; nums: number[]; rawDate: string }[];

  const byMonth = new Map<string, { date: Date; nums: number[]; rawDate: string }[]>();
  for (const item of items) {
    const k = getMonthKey(item.date);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k)!.push(item);
  }

  const rows: OverlapRow[] = [];
  const maxNumber = 45; // domain max
  const allNumbers = Array.from({ length: maxNumber }, (_, i) => i + 1);
  for (const [key, arr] of Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const idx = targetDrawIndex - 1; // convert 1-based to 0-based
    const allMonthFreqMap: Record<number, number> = {};
    arr.forEach((r) => {
      r.nums.forEach((n) => {
        allMonthFreqMap[n] = (allMonthFreqMap[n] || 0) + 1;
      });
    });
    const allMonthNumFreqs = Object.entries(allMonthFreqMap)
      .map(([n, freq]) => ({ num: Number(n), freq }))
      .filter(({ freq }) => freq > 1)
      .sort((a, b) => b.freq - a.freq || a.num - b.num);

    if (arr.length <= idx) {
      const numbersSeen = new Set(arr.flatMap((r) => r.nums));
      const undrawnNums = allNumbers.filter((n) => !numbersSeen.has(n));
      rows.push({
        monthLabel: key,
        targetDate: "",
        priorDrawCount: arr.length,
        totalDrawsInMonth: arr.length,
        overlapCount: 0,
        overlaps: [],
        overlapCounts: {},
        totalOverlapFreq: 0,
        avgOverlapFreq: 0,
        targetNums: [],
        undrawnNums,
        undrawnCount: undrawnNums.length,
        allMonthNumFreqs,
        isPending: true,
        pendingMessage:
          arr.length === 0
            ? `Awaiting first draw — overlap data will appear once ${targetDrawIndex} draw${targetDrawIndex !== 1 ? "s" : ""} have been added`
            : `Awaiting ${targetDrawIndex}${targetDrawIndex === 1 ? "st" : targetDrawIndex === 2 ? "nd" : targetDrawIndex === 3 ? "rd" : "th"} draw — ${arr.length} draw${arr.length !== 1 ? "s" : ""} recorded so far`,
      });
      continue;
    }
    const target = arr[idx];
    const baseline = new Set(arr.slice(0, idx).flatMap((r) => r.nums));
    const targetUnique = target.nums.filter((n, i, self) => self.indexOf(n) === i);

    const overlaps = targetUnique.filter((n) => baseline.has(n)).sort((a, b) => a - b);

    // NEW: undrawn set is the complement of all numbers seen up to and including the target draw
    const numbersSeen = new Set(arr.slice(0, idx + 1).flatMap((r) => r.nums));
    const undrawnNums = allNumbers.filter((n) => !numbersSeen.has(n));

    // Count how many times each number appeared in earlier draws this month
    const overlapCountsMap: Record<number, number> = {};
    arr.slice(0, idx).forEach((r) => {
      r.nums.forEach((n) => {
        overlapCountsMap[n] = (overlapCountsMap[n] || 0) + 1;
      });
    });

    rows.push({
      monthLabel: key,
      targetDate: target.rawDate,
      priorDrawCount: idx,
      totalDrawsInMonth: arr.length,
      overlapCount: overlaps.length,
      overlaps,
      overlapCounts: overlapCountsMap,
      totalOverlapFreq: overlaps.reduce((sum, n) => sum + (overlapCountsMap[n] || 0), 0),
      avgOverlapFreq:
        overlaps.length > 0
          ? overlaps.reduce((sum, n) => sum + (overlapCountsMap[n] || 0), 0) / overlaps.length
          : 0,
      targetNums: targetUnique,
      undrawnNums,
      undrawnCount: undrawnNums.length,
      allMonthNumFreqs,
    });
  }
  return rows;
}

export const MonthlyOverlapPanel: React.FC<{ history: Draw[] }> = ({ history }) => {
  const [includeSupp, setIncludeSupp] = useState<boolean>(false);
  const [targetDrawIndex, setTargetDrawIndex] = useState<number>(4); // default 4th draw

  // Compute the maximum draws available in any month to clamp the input dynamically
  const maxDrawsPerMonth = useMemo(() => {
    if (!history.length) return 12; // sensible fallback
    const counts = new Map<string, number>();
    history.forEach((d) => {
      const dt = parseDate(d.date || "");
      if (!dt) return;
      const k = getMonthKey(dt);
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    let max = 0;
    counts.forEach((v) => { if (v > max) max = v; });
    return Math.max(1, max);
  }, [history]);

  const rows = useMemo(() => {
    const built = buildRows(history, includeSupp, targetDrawIndex);
    const today = new Date();
    const currentKey = (() => { const d = today; return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
    const latestBuiltRow = built.length ? built[built.length - 1] : null;
    const latestKey = latestBuiltRow?.monthLabel ?? null;
    if (!latestKey) return built;

    // Helper: month key immediately after a given YYYY-MM string
    const nextMonthKey = (key: string) => {
      const [y, m] = key.split('-').map(Number);
      return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    };

    let pendingKey: string | null = null;

    if (currentKey > latestKey) {
      // Today is already in a later calendar month — show it as pending.
      pendingKey = currentKey;
    } else if (currentKey === latestKey) {
      // Today is still in the same month as the last draw.
      // If that month's draw count has reached maxDrawsPerMonth the month is
      // "complete" — show next month as pending so the user can plan ahead.
      // Find the row for the current month to get its actual draw count.
      const currentMonthRow = built.find(r => r.monthLabel === currentKey);
      if (currentMonthRow && !currentMonthRow.isPending && currentMonthRow.totalDrawsInMonth >= maxDrawsPerMonth) {
        const nk = nextMonthKey(latestKey);
        if (!built.find(r => r.monthLabel === nk)) {
          pendingKey = nk;
        }
      }
    }

    if (pendingKey) {
      built.push({
        monthLabel: pendingKey,
        targetDate: "",
        priorDrawCount: 0,
        totalDrawsInMonth: 0,
        overlapCount: 0,
        overlaps: [],
        overlapCounts: {},
        totalOverlapFreq: 0,
        avgOverlapFreq: 0,
        targetNums: [],
        undrawnNums: [],
        undrawnCount: 0,
        allMonthNumFreqs: [],
        isPending: true,
        pendingMessage: `Awaiting first draw — overlap data will appear once ${targetDrawIndex} draw${targetDrawIndex !== 1 ? "s" : ""} have been added`,
      });
    }
    return built;
  }, [history, includeSupp, targetDrawIndex, maxDrawsPerMonth]);

  /** The most recent non-pending month label — excluded from footer averages (may be incomplete). */
  const mostRecentLabel = useMemo(
    () => {
      const realRows = rows.filter((r) => !r.isPending);
      return realRows.length ? realRows[realRows.length - 1].monthLabel : null;
    },
    [rows]
  );

  /** Footer: avg overlap count + avg freq grouped by total draws in that month, plus "All".
   *  The most recent month and pending rows are excluded (may be incomplete). */
  const footerStats = useMemo(() => {
    if (!rows.length || !mostRecentLabel) return [];
    const filteredRows = rows.filter((r) => !r.isPending && r.monthLabel !== mostRecentLabel);
    if (!filteredRows.length) return [];
    const groups = new Map<number, OverlapRow[]>();
    filteredRows.forEach((r) => {
      if (!groups.has(r.totalDrawsInMonth)) groups.set(r.totalDrawsInMonth, []);
      groups.get(r.totalDrawsInMonth)!.push(r);
    });
    const result: { label: string; count: number; avgOverlap: number; avgFreq: number }[] = [];
    const numKeys = Array.from(groups.keys()).sort((a, b) => a - b);
    for (const k of numKeys) {
      const g = groups.get(k)!;
      result.push({
        label: `${k} draws/mo`,
        count: g.length,
        avgOverlap: g.reduce((s, r) => s + r.overlapCount, 0) / g.length,
        avgFreq: g.reduce((s, r) => s + r.avgOverlapFreq, 0) / g.length,
      });
    }
    result.push({
      label: "All",
      count: filteredRows.length,
      avgOverlap: filteredRows.reduce((s, r) => s + r.overlapCount, 0) / filteredRows.length,
      avgFreq: filteredRows.reduce((s, r) => s + r.avgOverlapFreq, 0) / filteredRows.length,
    });
    return result;
  }, [rows]);

  const hasData = rows.length > 0;

  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const toggleMonth = useCallback((label: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }, []);

  return (
    <div style={{ width: "100%", maxWidth: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0 }}>Monthly Numbers Overlap</h4>
        <label style={{ fontSize: 13 }}>
          <input
            type="checkbox"
            checked={includeSupp}
            onChange={(e) => setIncludeSupp(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Include supps
        </label>
        <label style={{ fontSize: 13 }}>
          Target draw (per month):
          <input
            type="number"
            min={1}
            max={maxDrawsPerMonth}
            value={targetDrawIndex}
            onChange={(e) => {
              const next = Number(e.target.value) || 1;
              const capped = Math.max(1, Math.min(maxDrawsPerMonth, next));
              setTargetDrawIndex(capped);
            }}
            style={{ width: 64, marginLeft: 6 }}
            title={`Compare this draw against all earlier draws in the month (1–${maxDrawsPerMonth})`}
          />
        </label>
        <span style={{ fontSize: 12, color: "#555" }}>
          Compares the selected draw to all earlier draws in that month (max available: {maxDrawsPerMonth}).
        </span>
      </div>

      {!hasData ? (
        <div style={{ fontSize: 13, color: "#777" }}>
          Need at least {targetDrawIndex} draws in a month to compute overlaps.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr style={{ background: "#f4f6fb" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Month</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>
                  {targetDrawIndex}ᵗʰ draw date
                </th>
                <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }} title="Total draws in this calendar month">Draws/mo</th>
                <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Prior draws</th>
                <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Overlap count</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Overlap numbers</th>
                <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }} title="Average frequency: mean number of times each overlapping number appeared in the prior draws this month">Avg freq</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Target draw numbers</th>
                <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Undrawn count</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Undrawn numbers</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isExcluded = r.monthLabel === mostRecentLabel;
                const isExpanded = expandedMonths.has(r.monthLabel);
                if (r.isPending) {
                  return (
                    <tr key={r.monthLabel} style={{ borderBottom: "1px solid #edf2f7", background: "#f0f9ff" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 700 }}>
                        {r.monthLabel}
                        <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: "#0369a1", background: "#e0f2fe", borderRadius: 4, padding: "1px 6px" }}>
                          {r.totalDrawsInMonth > 0 ? "in progress" : "upcoming"}
                        </span>
                      </td>
                      <td style={{ padding: "6px 8px", color: "#64748b" }}>—</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700 }}>{r.totalDrawsInMonth}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700 }}>{r.priorDrawCount}</td>
                      <td colSpan={6} style={{ padding: "6px 8px", color: "#64748b", fontStyle: "italic" }}>
                        {r.pendingMessage}
                      </td>
                    </tr>
                  );
                }
                return (
                  <React.Fragment key={r.monthLabel}>
                    <tr style={{ borderBottom: isExpanded ? "none" : "1px solid #edf2f7", background: isExcluded ? "#fffbeb" : undefined, opacity: isExcluded ? 0.75 : 1 }}>
                      <td style={{ padding: "6px 8px", fontWeight: 700 }}>
                        <button
                          onClick={() => toggleMonth(r.monthLabel)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginRight: 4, fontSize: 10, color: "#718096" }}
                          title="Toggle full-month number frequency"
                        >
                          {isExpanded ? "▼" : "▶"}
                        </button>
                        {r.monthLabel}
                        {isExcluded && <span style={{ marginLeft: 5, fontSize: "0.75em", color: "#b7791f", fontWeight: 400 }}>(excl.)</span>}
                      </td>
                      <td style={{ padding: "6px 8px" }}>{r.targetDate}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700 }}>{r.totalDrawsInMonth}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700 }}>{r.priorDrawCount}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700 }}>{r.overlapCount}</td>
                      <td style={{ padding: "6px 8px" }}>
                        {r.overlaps.length
                          ? r.overlaps.map((n, i) => {
                              const c = r.overlapCounts[n] || 0;
                              return (
                                <React.Fragment key={n}>
                                  {i > 0 && <span style={{ color: "#a0aec0" }}>, </span>}
                                  <span style={{ color: "#2b6cb0", fontWeight: 700 }}>{n}</span>
                                  <span style={{ color: "#718096", fontSize: "0.85em" }}> ({c})</span>
                                </React.Fragment>
                              );
                            })
                          : <span style={{ color: "#4a5568" }}>—</span>}
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700 }}>
                        {r.avgOverlapFreq > 0 ? r.avgOverlapFreq.toFixed(2) : "—"}
                      </td>
                      <td style={{ padding: "6px 8px", color: "#2d3748" }}>{r.targetNums.join(", ")}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700 }}>{r.undrawnCount}</td>
                      <td style={{ padding: "6px 8px", color: "#2d3748" }}>
                        {r.undrawnNums.length ? r.undrawnNums.join(", ") : "—"}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr style={{ borderBottom: "1px solid #edf2f7", background: isExcluded ? "#fffbeb" : "#f7fafc" }}>
                        <td colSpan={10} style={{ padding: "6px 16px 10px" }}>
                          <div style={{ fontSize: 12, color: "#4a5568", marginBottom: 4, fontWeight: 600 }}>
                            All repeated numbers this month (across all {r.totalDrawsInMonth} draws):
                          </div>
                          {r.allMonthNumFreqs.length === 0 ? (
                            <span style={{ fontSize: 12, color: "#718096" }}>No number appeared more than once.</span>
                          ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px" }}>
                              {r.allMonthNumFreqs.map(({ num, freq }) => (
                                <span key={num} style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                                  <span style={{ color: "#2b6cb0", fontWeight: 700 }}>{num}</span>
                                  <span style={{ color: "#718096" }}> ×{freq}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={10} style={{ padding: "4px 8px 0", borderTop: "2px solid #cbd5e0" }} />
              </tr>
              <tr style={{ background: "#edf2f7" }}>
                <td colSpan={2} style={{ padding: "6px 8px", fontWeight: 700, fontSize: 12, color: "#4a5568" }}>
                  Avg overlap by draws/month
                  <span style={{ fontWeight: 400, color: "#a0aec0", marginLeft: 6 }}>
                    (excl. {mostRecentLabel ?? "most recent month"})
                  </span>
                </td>
                <td colSpan={8} style={{ padding: "6px 8px" }}>
                  <span style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                    {footerStats.map((fs) => (
                      <span key={fs.label} style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                        <span style={{ fontWeight: 700, color: "#2d3748" }}>{fs.label}</span>
                        <span style={{ color: "#4a5568" }}>
                          {" "}n={fs.count} · avg overlap{" "}
                        </span>
                        <span style={{ fontWeight: 700, color: "#2b6cb0" }}>
                          {fs.avgOverlap.toFixed(2)}
                        </span>
                        <span style={{ color: "#4a5568" }}> · avg freq </span>
                        <span style={{ fontWeight: 700, color: "#718096" }}>
                          {fs.avgFreq.toFixed(2)}
                        </span>
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default MonthlyOverlapPanel;

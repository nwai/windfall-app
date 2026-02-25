import React, { useMemo, useState } from "react";
import type { Draw } from "../types";

interface OverlapRow {
  monthLabel: string;
  targetDate: string;
  overlapCount: number;
  overlaps: number[];
  overlapCounts: Record<number, number>;
  targetNums: number[];
  undrawnNums: number[];
  undrawnCount: number;
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
    if (arr.length <= idx) continue; // not enough draws in this month
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
      overlapCount: overlaps.length,
      overlaps,
      overlapCounts: overlapCountsMap,
      targetNums: targetUnique,
      undrawnNums,
      undrawnCount: undrawnNums.length,
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

  const rows = useMemo(
    () => buildRows(history, includeSupp, targetDrawIndex),
    [history, includeSupp, targetDrawIndex]
  );

  const hasData = rows.length > 0;

  return (
    <div style={{ width: "100%", maxWidth: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0 }}>Nth Draw Overlap by Month</h4>
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
                <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Overlap count</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Overlap numbers</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Target draw numbers</th>
                <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Undrawn count</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Undrawn numbers</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.monthLabel} style={{ borderBottom: "1px solid #edf2f7" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 700 }}>{r.monthLabel}</td>
                  <td style={{ padding: "6px 8px" }}>{r.targetDate}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700 }}>{r.overlapCount}</td>
                  <td style={{ padding: "6px 8px", color: r.overlaps.length ? "#c53030" : "#4a5568" }}>
                    {r.overlaps.length
                      ? r.overlaps
                          .map((n) => {
                            const c = r.overlapCounts[n] || 0;
                            return c > 1 ? `${n} (${c})` : `${n}`;
                          })
                          .join(", ")
                      : "—"}
                  </td>
                  <td style={{ padding: "6px 8px", color: "#2d3748" }}>{r.targetNums.join(", ")}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700 }}>{r.undrawnCount}</td>
                  <td style={{ padding: "6px 8px", color: "#2d3748" }}>
                    {r.undrawnNums.length ? r.undrawnNums.join(", ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MonthlyOverlapPanel;

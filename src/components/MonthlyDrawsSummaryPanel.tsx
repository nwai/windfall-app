import React, { useMemo, useState, useEffect } from "react";
import type { Draw } from "../types";
export interface MonthlyFrequencyConstraints {
  undrawn: number;
  times1: number;
  times2: number;
  times3: number;
  times4: number;
  times5: number;
  times6: number;
  times7: number;
  times8: number;
}
export interface MonthlyConstraintPayload {
  constraints: MonthlyFrequencyConstraints;
  buckets: {
    undrawn: Set<number>;
    times1: Set<number>;
    times2: Set<number>;
    times3: Set<number>;
    times4: Set<number>;
    times5: Set<number>;
    times6: Set<number>;
    times7: Set<number>;
    times8: Set<number>;
  };
}

interface MonthRow {
  monthLabel: string;
  drawCount: number;
  numbers: { n: number; c: number }[];
  frequencyCounts: { times: number; count: number }[];
  undrawn: number[];
}

function parseDate(d: string): Date | null {
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : new Date(t);
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function colorForTimes(times: number): string {
  const palette: Record<number, string> = {
    0: "rgba(117,117,117,0.70)",
    1: "rgba(66,165,245,0.70)",
    2: "rgba(102,187,106,0.70)",
    3: "rgba(38,198,218,0.70)",
    4: "rgba(251,192,45,0.70)",
    5: "rgba(251,140,0,0.72)",
    6: "rgba(244,81,30,0.72)",
    7: "rgba(229,57,53,0.74)",
  };
  return palette[times] ?? "rgba(142,36,170,0.74)";
}

function buildRows(history: Draw[], drawsPerMonth: number): MonthRow[] {
  if (!history.length) return [];
  const items = history
    .map((d) => {
      const dt = parseDate(d.date || "");
      if (!dt) return null;
      const nums = [...d.main, ...d.supp];
      return { date: dt, nums };
    })
    .filter(Boolean)
    .sort((a, b) => a!.date.getTime() - b!.date.getTime()) as { date: Date; nums: number[] }[];

  const byMonth = new Map<string, { date: Date; nums: number[] }[]>();
  for (const item of items) {
    const k = getMonthKey(item.date);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k)!.push(item);
  }

  const rows: MonthRow[] = [];
  for (const [month, arrFull] of Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const arr = arrFull.slice(0, drawsPerMonth);
    const counts = Array(45).fill(0);
    arr.forEach((r) => {
      r.nums.forEach((n) => {
        if (n >= 1 && n <= 45) counts[n - 1] += 1;
      });
    });
    const numbers = counts
      .map((c, idx) => ({ n: idx + 1, c }))
      .filter((x) => x.c > 0)
      .sort((a, b) => a.n - b.n);

    const frequencyCountsMap = counts.reduce<Map<number, number>>((acc, c) => {
      if (c > 0) acc.set(c, (acc.get(c) || 0) + c);
      return acc;
    }, new Map<number, number>());

    const frequencyCounts = Array.from(frequencyCountsMap.entries())
      .map(([times, count]) => ({ times, count }))
      .sort((a, b) => a.times - b.times);

    const undrawn = counts
      .map((c, idx) => ({ n: idx + 1, c }))
      .filter((x) => x.c === 0)
      .map((x) => x.n);

    rows.push({ monthLabel: month, drawCount: arr.length, numbers, frequencyCounts, undrawn });
  }
  return rows;
}

interface NumberSelectionState {
  undrawn: number[];
  times1: number[];
  times2: number[];
  times3: number[];
  times4: number[];
  times5: number[];
  times6: number[];
  times7: number[];
  times8: number[];
}

export const MonthlyDrawsSummaryPanel: React.FC<{
  history: Draw[];
  onConstraintsChange?: (payload: MonthlyConstraintPayload | null) => void;
  onUseSelectedNumbers?: (numbers: number[]) => void;
  constructiveFillEnabled?: boolean;
  onConstructiveFillChange?: (enabled: boolean) => void;
  onBucketInfoChange?: (info: { labels: Record<number, string> }) => void;
}> = ({ history, onConstraintsChange, onUseSelectedNumbers, constructiveFillEnabled = false, onConstructiveFillChange, onBucketInfoChange }) => {
  const [drawsPerMonth, setDrawsPerMonth] = useState<number>(12);
  const [constraints, setConstraints] = useState<MonthlyFrequencyConstraints>({
    undrawn: 0,
    times1: 0,
    times2: 0,
    times3: 0,
    times4: 0,
    times5: 0,
    times6: 0,
    times7: 0,
    times8: 0,
  });
  const [selectedByBucket, setSelectedByBucket] = useState<NumberSelectionState>({
    undrawn: [],
    times1: [],
    times2: [],
    times3: [],
    times4: [],
    times5: [],
    times6: [],
    times7: [],
    times8: [],
  });
  const maxDrawsPerMonth = useMemo(() => {
    if (!history.length) return 12;
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

  // Clamp drawsPerMonth to available max to avoid empty rows when user enters large numbers
  const safeDrawsPerMonth = Math.min(Math.max(1, drawsPerMonth), maxDrawsPerMonth);

  const rows = useMemo(() => buildRows(history, safeDrawsPerMonth), [history, safeDrawsPerMonth]);
  const hasData = rows.length > 0;
  const currentMonthKey = useMemo(() => getMonthKey(new Date()), []);
  const latestRow = useMemo(() => (rows.length ? rows[rows.length - 1] : null), [rows]);
  const bucketSets = useMemo(() => {
    const empty = {
      undrawn: new Set<number>(),
      times1: new Set<number>(),
      times2: new Set<number>(),
      times3: new Set<number>(),
      times4: new Set<number>(),
      times5: new Set<number>(),
      times6: new Set<number>(),
      times7: new Set<number>(),
      times8: new Set<number>(),
    } as const;
    if (!latestRow) return empty;
    const sets = {
      undrawn: new Set<number>(latestRow.undrawn),
      times1: new Set<number>(),
      times2: new Set<number>(),
      times3: new Set<number>(),
      times4: new Set<number>(),
      times5: new Set<number>(),
      times6: new Set<number>(),
      times7: new Set<number>(),
      times8: new Set<number>(),
    };
    latestRow.numbers.forEach(({ n, c }) => {
      if (c === 1) sets.times1.add(n);
      else if (c === 2) sets.times2.add(n);
      else if (c === 3) sets.times3.add(n);
      else if (c === 4) sets.times4.add(n);
      else if (c === 5) sets.times5.add(n);
      else if (c === 6) sets.times6.add(n);
      else if (c === 7) sets.times7.add(n);
      else if (c >= 8) sets.times8.add(n);
    });
    return sets;
  }, [latestRow]);

  const bucketOptions = useMemo(() => ({
    undrawn: Array.from(bucketSets.undrawn).sort((a, b) => a - b),
    times1: Array.from(bucketSets.times1).sort((a, b) => a - b),
    times2: Array.from(bucketSets.times2).sort((a, b) => a - b),
    times3: Array.from(bucketSets.times3).sort((a, b) => a - b),
    times4: Array.from(bucketSets.times4).sort((a, b) => a - b),
    times5: Array.from(bucketSets.times5).sort((a, b) => a - b),
    times6: Array.from(bucketSets.times6).sort((a, b) => a - b),
    times7: Array.from(bucketSets.times7).sort((a, b) => a - b),
    times8: Array.from(bucketSets.times8).sort((a, b) => a - b),
  }), [bucketSets]);

  useEffect(() => {
    if (!onBucketInfoChange) return;
    const labels: Record<number, string> = {};
    for (let n = 1; n <= 45; n++) {
      if (bucketSets.undrawn.has(n)) labels[n] = "Undrawn";
      else if (bucketSets.times8.has(n)) labels[n] = "8x+";
      else if (bucketSets.times7.has(n)) labels[n] = "7x";
      else if (bucketSets.times6.has(n)) labels[n] = "6x";
      else if (bucketSets.times5.has(n)) labels[n] = "5x";
      else if (bucketSets.times4.has(n)) labels[n] = "4x";
      else if (bucketSets.times3.has(n)) labels[n] = "3x";
      else if (bucketSets.times2.has(n)) labels[n] = "2x";
      else if (bucketSets.times1.has(n)) labels[n] = "1x";
    }
    onBucketInfoChange({ labels });
  }, [bucketSets, onBucketInfoChange]);

  const avgFrequencyCounts = useMemo(() => {
    const eligible = rows.filter((r) => r.monthLabel !== currentMonthKey);
    if (!eligible.length) return [] as { times: number; avg: number }[];
    const totals = new Map<number, number>();
    eligible.forEach((r) => {
      r.frequencyCounts.forEach((f) => {
        totals.set(f.times, (totals.get(f.times) || 0) + f.count);
      });
    });
    return Array.from(totals.entries())
      .map(([times, total]) => ({ times, avg: total / eligible.length }))
      .sort((a, b) => a.times - b.times);
  }, [rows, currentMonthKey]);

  const avgUndrawnCount = useMemo(() => {
    const eligible = rows.filter((r) => r.monthLabel !== currentMonthKey);
    if (!eligible.length) return null as number | null;
    const totalUndrawn = eligible.reduce((sum, r) => sum + r.undrawn.length, 0);
    return totalUndrawn / eligible.length;
  }, [rows, currentMonthKey]);

  const handleSelectChange = (bucketKey: keyof NumberSelectionState, values: string[]) => {
    const nums = values.map((v) => Number(v)).filter((n) => Number.isFinite(n));
    setSelectedByBucket((prev) => ({ ...prev, [bucketKey]: nums }));
  };

  const toggleBucketNumber = (bucketKey: keyof NumberSelectionState, n: number) => {
    setSelectedByBucket((prev) => {
      const nextSet = new Set(prev[bucketKey]);
      if (nextSet.has(n)) {
        nextSet.delete(n);
      } else {
        nextSet.add(n);
      }
      const sorted = Array.from(nextSet).sort((a, b) => a - b);
      return { ...prev, [bucketKey]: sorted };
    });
  };

  useEffect(() => {
    // Keep acceptance counts in sync with current selections.
    setConstraints({
      undrawn: selectedByBucket.undrawn.length,
      times1: selectedByBucket.times1.length,
      times2: selectedByBucket.times2.length,
      times3: selectedByBucket.times3.length,
      times4: selectedByBucket.times4.length,
      times5: selectedByBucket.times5.length,
      times6: selectedByBucket.times6.length,
      times7: selectedByBucket.times7.length,
      times8: selectedByBucket.times8.length,
    });
  }, [selectedByBucket]);

  const handleUseSelected = () => {
    if (!onUseSelectedNumbers) return;
    const all = new Set<number>();
    (Object.keys(selectedByBucket) as (keyof NumberSelectionState)[]).forEach((k) => {
      selectedByBucket[k].forEach((n) => all.add(n));
    });
    onUseSelectedNumbers(Array.from(all).sort((a, b) => a - b));
  };

  useEffect(() => {
    if (!constructiveFillEnabled) {
      onConstraintsChange?.(null);
      return;
    }
    onConstraintsChange?.({ constraints, buckets: bucketSets });
  }, [constraints, bucketSets, constructiveFillEnabled, onConstraintsChange]);

  return (
    <div style={{ width: "100%", maxWidth: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0 }}>Monthly Draws Summary</h4>
        <label style={{ fontSize: 13 }}>
          Draws per month:
          <input
            type="number"
            min={1}
            max={maxDrawsPerMonth}
            value={safeDrawsPerMonth}
            onChange={(e) => {
              const next = Number(e.target.value) || 1;
              setDrawsPerMonth(next);
            }}
            style={{ width: 70, marginLeft: 6 }}
            title={`Summarize up to this many draws per month (1–${maxDrawsPerMonth})`}
          />
        </label>
        <span style={{ fontSize: 12, color: "#555" }}>Shows all numbers drawn in each month with total appearances.</span>
      </div>

      {!hasData ? (
        <div style={{ fontSize: 13, color: "#777" }}>No draws available.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr style={{ background: "f4f6fb" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Month</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Numbers (count)</th>
                <th style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Draws</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Frequency counts</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>Undrawn (count)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.monthLabel} style={{ borderBottom: "1px solid #edf2f7" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 700 }}>{r.monthLabel}</td>
                  <td style={{ padding: "6px 8px", color: "#2d3748" }}>
                    {r.numbers.length === 0
                      ? "—"
                      : r.numbers.map((x, idx) => (
                          <span key={`${r.monthLabel}-num-${x.n}`}>
                            <strong>{x.n}</strong>
                            {x.c > 1 ? ` (${x.c})` : ""}
                            {idx < r.numbers.length - 1 ? ", " : ""}
                          </span>
                        ))}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700 }}>{r.drawCount}</td>
                  <td style={{ padding: "6px 8px", color: "#2d3748" }}>
                    {r.frequencyCounts.length
                      ? r.frequencyCounts.map((f, idx) => (
                          <span
                            key={`${r.monthLabel}-freq-${f.times}-${idx}`}
                            style={{
                              display: "inline-block",
                              marginRight: 8,
                              marginBottom: 4,
                              padding: "2px 6px",
                              borderRadius: 6,
                              background: colorForTimes(f.times),
                              color: "#fff",
                              fontWeight: 600,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            <span style={{ color: "#fff" }}>{f.times}x:</span>{" "}
                            <span style={{ color: "#000" }}>{f.count}</span>
                          </span>
                        ))
                      : "—"}
                    {(
                      <span
                        style={{
                          display: "inline-block",
                          marginRight: 8,
                          marginBottom: 4,
                          padding: "2px 6px",
                          borderRadius: 6,
                          background: colorForTimes(0),
                          color: "#fff",
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        <span style={{ color: "#fff" }}>0x:</span>{" "}
                        <span style={{ color: "#000" }}>{r.undrawn.length}</span>
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "6px 8px", color: "#2d3748" }}>
                    {r.undrawn.length ? r.undrawn.length : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            {hasData && (
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ padding: 0, height: 12 }} />
                </tr>
                <tr style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 700 }}>Average</td>
                  <td style={{ padding: "6px 8px" }} />
                  <td style={{ padding: "6px 8px" }} />
                  <td style={{ padding: "6px 8px", color: "#2d3748" }}>
                    {avgFrequencyCounts.length
                      ? avgFrequencyCounts.map((f) => (
                          <span
                            key={`avg-freq-${f.times}`}
                            style={{
                              display: "inline-block",
                              marginRight: 8,
                              marginBottom: 4,
                              padding: "2px 6px",
                              borderRadius: 6,
                              background: colorForTimes(f.times),
                              color: "#fff",
                              fontWeight: 600,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            <span style={{ color: "#fff" }}>{f.times}x:</span>{" "}
                            <span style={{ color: "#000" }}>{f.avg.toFixed(1)}</span>
                          </span>
                        ))
                      : "—"}
                    {avgUndrawnCount !== null && (
                      <span
                        style={{
                          display: "inline-block",
                          marginRight: 8,
                          marginBottom: 4,
                          padding: "2px 6px",
                          borderRadius: 6,
                          background: colorForTimes(0),
                          color: "#fff",
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        <span style={{ color: "#fff" }}>0x:</span>{" "}
                        <span style={{ color: "#000" }}>{avgUndrawnCount.toFixed(1)}</span>
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "6px 8px" }} />
                </tr>
                <tr style={{ background: "#eef2f7", borderTop: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 700 }}>Acceptance needs</td>
                  <td colSpan={4} style={{ padding: "8px", color: "#2d3748" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                      {([
                        { key: "undrawn", label: "Undrawn" },
                        { key: "times1", label: "Drawn 1x" },
                        { key: "times2", label: "Drawn 2x" },
                        { key: "times3", label: "Drawn 3x" },
                        { key: "times4", label: "Drawn 4x" },
                        { key: "times5", label: "Drawn 5x" },
                        { key: "times6", label: "Drawn 6x" },
                        { key: "times7", label: "Drawn 7x" },
                        { key: "times8", label: "Drawn 8x+" },
                      ] as const).map((item) => (
                        <label key={item.key} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                          {item.label}:
                          <input
                            type="number"
                            min={0}
                            max={45}
                            value={constraints[item.key] as number}
                            readOnly
                            style={{ width: 70, background: "#f1f5f9" }}
                            title={`Count selected in ${item.label.toLowerCase()}`}
                          />
                        </label>
                      ))}
                      <span style={{ fontSize: 11, color: "#555" }}>
                        Counts reflect numbers picked below (latest month buckets).
                      </span>
                      <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginLeft: 12 }}>
                        <input
                          type="checkbox"
                          checked={constructiveFillEnabled}
                          onChange={(e) => onConstructiveFillChange?.(e.target.checked)}
                        />
                        Use these counts when constructing candidates
                      </label>
                    </div>
                    <div style={{ marginTop: 10, padding: 8, borderRadius: 6, background: "#f7faff", border: "1px dashed #d0e3ff" }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>Select numbers by bucket (latest month)</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, justifyItems: "center" }}>
                        {([
                          { key: "undrawn", label: "Undrawn" },
                          { key: "times1", label: "Drawn 1x" },
                          { key: "times2", label: "Drawn 2x" },
                          { key: "times3", label: "Drawn 3x" },
                          { key: "times4", label: "Drawn 4x" },
                          { key: "times5", label: "Drawn 5x" },
                          { key: "times6", label: "Drawn 6x" },
                          { key: "times7", label: "Drawn 7x" },
                          { key: "times8", label: "Drawn 8x+" },
                        ] as const).map((item) => (
                          <div
                            key={item.key}
                            style={{
                              fontSize: 12,
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                              width: "100%",
                              maxWidth: 260,
                              border: "1px solid #e2e8f0",
                              borderRadius: 8,
                              padding: 8,
                              background: "#fff",
                            }}
                          >
                            <div style={{ fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span>{item.label}</span>
                              <span style={{ fontSize: 11, color: "#444" }}>Selected: {selectedByBucket[item.key].length}</span>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {bucketOptions[item.key].length === 0 ? (
                                <span style={{ fontSize: 11, color: "#777" }}>none</span>
                              ) : (
                                bucketOptions[item.key].map((n) => {
                                  const active = selectedByBucket[item.key].includes(n);
                                  return (
                                    <button
                                      key={`${item.key}-${n}`}
                                      type="button"
                                      onClick={() => toggleBucketNumber(item.key, n)}
                                      style={{
                                        padding: "4px 8px",
                                        borderRadius: 6,
                                        border: active ? "1px solid #1976d2" : "1px solid #cbd5e1",
                                        background: active ? "#e3f2fd" : "#f8fafc",
                                        color: active ? "#0d47a1" : "#1e293b",
                                        cursor: "pointer",
                                      }}
                                    >
                                      {n}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button type="button" onClick={handleUseSelected} disabled={!onUseSelectedNumbers}>
                          Use selected
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedByBucket({
                            undrawn: [], times1: [], times2: [], times3: [], times4: [], times5: [], times6: [], times7: [], times8: [],
                          })}
                        >
                          Clear selections
                        </button>
                        <span style={{ fontSize: 11, color: "#555" }}>Click numbers to toggle; counts above update automatically.</span>
                      </div>
                    </div>
                  </td>
                </tr>
              </tfoot>
            )}
           </table>
         </div>
        )}
     </div>
   );
 }

export default MonthlyDrawsSummaryPanel;

import React, { useMemo, useState } from "react";
import { Draw } from "../../types";

type SortMode = "lastAgoAsc" | "countDesc" | "numberAsc";

interface Row {
  n: number;
  count: number;
  lastAgo: number | null;
  gapWindow: number | null;
  gapAll: number | null;
  monthlyGaps: Array<{ month: string; gap: number }>;
}

function appearances(draws: Draw[], n: number): number[] {
  const idxs: number[] = [];
  for (let i = 0; i < draws.length; i++) {
    const d = draws[i];
    let hit = false;
    for (const m of d.main) if (m === n) { hit = true; break; }
    if (!hit) for (const s of d.supp) if (s === n) { hit = true; break; }
    if (hit) idxs.push(i);
  }
  return idxs;
}

function averageGap(idxs: number[]): number | null {
  if (idxs.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < idxs.length; i++) sum += (idxs[i] - idxs[i - 1]);
  return sum / (idxs.length - 1);
}

function monthlyGapTrend(allDraws: Draw[], n: number): Array<{ month: string; gap: number }> {
  const parseDate = (s: string): Date => {
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) return dt;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(y, m - 1, d || 1);
    }
    const parts = s.split("/").map(Number);
    if (parts.length >= 3) {
      const [a, b, c] = parts;
      const y = c < 100 ? 2000 + c : c;
      return new Date(y, a - 1, b || 1);
    }
    return new Date(1970, 0, 1);
  };
  const startDt = allDraws.length ? parseDate(allDraws[0].date) : new Date(1970, 0, 1);
  const endDt = allDraws.length ? parseDate(allDraws[allDraws.length - 1].date) : new Date(1970, 0, 1);
  const months: string[] = [];
  let y = startDt.getFullYear();
  let m = startDt.getMonth();
  const endY = endDt.getFullYear();
  const endM = endDt.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m += 1; if (m >= 12) { m = 0; y += 1; }
  }

  // Rolling gap counter: number of draws since last hit
  const isHitAt = new Set<number>(appearances(allDraws, n));
  let since = Infinity; // if number never seen yet, start as Infinity to ramp down on first hit
  const perMonthSamples: Map<string, number[]> = new Map();
  for (let i = 0; i < allDraws.length; i++) {
    const dt = parseDate(allDraws[i].date);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    if (isHitAt.has(i)) {
      since = 0;
    } else {
      since = Number.isFinite(since) ? since + 1 : 1; // first non-Infinity value becomes 1
    }
    const arr = perMonthSamples.get(key) || [];
    arr.push(since);
    perMonthSamples.set(key, arr);
  }

  // Build contiguous series with average since per month; missing months get 0
  return months.map((mm) => {
    const samples = perMonthSamples.get(mm) || [];
    const avg = samples.length ? (samples.reduce((a, b) => a + b, 0) / samples.length) : 0;
    return { month: mm, gap: avg };
  });
}

const HistogramTooltip: React.FC<{ data: Array<{ month: string; gap: number }> }> = ({ data }) => {
  if (!data.length) return <div style={{ padding: 6 }}>No monthly data</div>;
  const gaps = data.map(d => d.gap);
  const min = Math.min(...gaps);
  const max = Math.max(...gaps);
  const norm = (g: number) => (max === min ? 1 : (g - min) / (max - min));
  return (
    <div style={{ padding: 8, maxWidth: 320 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Monthly avg gap (draws since last hit)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
        {data.map(({ month, gap }) => (
          <div key={month} title={`${month}: ${gap.toFixed(2)} draws`} style={{ textAlign: "center" }}>
            <div style={{ height: 40, background: "#e3f2fd", position: "relative", borderRadius: 3 }}>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: Math.max(4, Math.round(norm(gap) * 40)), background: "#1976d2", borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{month.slice(5)}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "#777", marginTop: 6 }}>Months without hits accumulate larger averages and will show taller bars.</div>
    </div>
  );
};

export const NumberFrequencyPanel: React.FC<{ draws: Draw[]; allDraws?: Draw[] }> = ({ draws, allDraws }) => {
  const [sortMode, setSortMode] = useState<SortMode>("lastAgoAsc");
  const [hoverRow, setHoverRow] = useState<number | null>(null);

  const rows = useMemo<Row[]>(() => {
    const N = 45;
    const counts = Array(N + 1).fill(0);
    const lastAgo = Array<number | null>(N + 1).fill(null);

    for (let i = 0; i < draws.length; i++) {
      const d = draws[i];
      for (const n of d.main) if (n >= 1 && n <= 45) counts[n] += 1;
      for (const n of d.supp) if (n >= 1 && n <= 45) counts[n] += 1;
    }

    for (let i = draws.length - 1; i >= 0; i--) {
      const ago = (draws.length - 1) - i;
      const d = draws[i];
      for (const n of d.main) if (n >= 1 && n <= 45 && lastAgo[n] === null) lastAgo[n] = ago;
      for (const n of d.supp) if (n >= 1 && n <= 45 && lastAgo[n] === null) lastAgo[n] = ago;
    }

    const out: Row[] = [];
    for (let n = 1; n <= N; n++) {
      const idxsWindow = appearances(draws, n);
      const gapW = averageGap(idxsWindow);
      const idxsAll = allDraws ? appearances(allDraws, n) : idxsWindow;
      const gapA = averageGap(idxsAll);
      const monthly = allDraws ? monthlyGapTrend(allDraws, n) : [];
      out.push({ n, count: counts[n], lastAgo: lastAgo[n], gapWindow: gapW, gapAll: gapA, monthlyGaps: monthly });
    }
    return out;
  }, [draws, allDraws]);

  const sorted = useMemo<Row[]>(() => {
    const asNum = (x: number | null) => (x === null ? Number.POSITIVE_INFINITY : x);
    const byLastAgoAsc = (a: Row, b: Row) => asNum(a.lastAgo) - asNum(b.lastAgo) || b.count - a.count || a.n - b.n;
    const byCountDesc = (a: Row, b: Row) => b.count - a.count || asNum(a.lastAgo) - asNum(b.lastAgo) || a.n - b.n;
    const byNumberAsc = (a: Row, b: Row) => a.n - b.n;
    const arr = rows.slice();
    switch (sortMode) {
      case "lastAgoAsc": return arr.sort(byLastAgoAsc);
      case "countDesc": return arr.sort(byCountDesc);
      case "numberAsc": return arr.sort(byNumberAsc);
      default: return arr;
    }
  }, [rows, sortMode]);

  const fmtAgo = (ago: number | null) => ago === null ? "—" : String(ago);
  const fmtGap = (gap: number | null) => gap === null ? "—" : gap.toFixed(2);

  return (
    <div style={{ position: "relative", background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6 }}>
      {/* Small control bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 8px", borderBottom: "1px solid #eee" }}>
        <label style={{ fontSize: 12, color: "#444" }}>
          Sort by:{" "}
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            style={{ marginLeft: 6, fontSize: 12 }}
            title="Change sorting of the table below"
          >
            <option value="lastAgoAsc">Last drawn (recent first)</option>
            <option value="countDesc">Count (high → low)</option>
            <option value="numberAsc">Number (1 → 45)</option>
          </select>
        </label>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th style={thLeft}>#</th>
            <th style={thRight} title="Occurrences across mains+supp within the selected window">Count</th>
            <th
              style={thRight}
              title="How many draws ago this number last appeared (0 means it appeared in the most recent draw)"
            >
              Last drawn (ago)
            </th>
            <th style={thRight} title="Average gap in draws between hits across all history (All/H)">Gap (All/H)</th>
            <th style={thRight} title="Average gap in draws between hits within current window (WFMQY)">Gap (WFMQY)</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.n} style={{ borderBottom: "1px solid #eee" }} onMouseEnter={() => setHoverRow(r.n)} onMouseLeave={() => setHoverRow(null)}>
              <td style={tdLeft}><b>{r.n}</b></td>
              <td style={tdRight}>{r.count}</td>
              <td style={tdRight}>{fmtAgo(r.lastAgo)}</td>
              <td style={tdRight}>{fmtGap(r.gapAll)}</td>
              <td style={tdRight}>{fmtGap(r.gapWindow)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {hoverRow !== null && (() => {
        const r = rows.find(rr => rr.n === hoverRow);
        if (!r) return null;
        return (
          <div style={{ position: "absolute", right: 12, top: 42, zIndex: 10, background: "#fff", border: "1px solid #ddd", boxShadow: "0 2px 10px rgba(0,0,0,0.08)", borderRadius: 6 }}>
            <HistogramTooltip data={r.monthlyGaps} />
          </div>
        );
      })()}
    </div>
  );
};

const thLeft: React.CSSProperties = { textAlign: "left", padding: "6px 8px", borderBottom: "2px solid #333" };
const thRight: React.CSSProperties = { textAlign: "right", padding: "6px 8px", borderBottom: "2px solid #333" };
const tdLeft: React.CSSProperties = { textAlign: "left", padding: "6px 8px" };
const tdRight: React.CSSProperties = { textAlign: "right", padding: "6px 8px" };

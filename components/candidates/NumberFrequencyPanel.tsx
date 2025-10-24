import React, { useMemo, useState } from "react";
import { Draw } from "../../types";

type SortMode = "lastAgoAsc" | "countDesc" | "numberAsc";

interface Row {
  n: number;
  count: number;
  lastAgo: number | null; // 0 = last draw, 1 = one draw ago, null = never in window
}

export const NumberFrequencyPanel: React.FC<{ draws: Draw[] }> = ({ draws }) => {
  // Default: most recent first (0, 1, 2, ...; never seen at the end)
  const [sortMode, setSortMode] = useState<SortMode>("lastAgoAsc");

  const rows = useMemo<Row[]>(() => {
    const N = 45;
    const counts = Array(N + 1).fill(0);                  // 1..45
    const lastAgo = Array<number | null>(N + 1).fill(null); // 1..45

    // Count occurrences (main + supp)
    for (let i = 0; i < draws.length; i++) {
      const d = draws[i];
      for (const n of d.main) if (n >= 1 && n <= 45) counts[n] += 1;
      for (const n of d.supp) if (n >= 1 && n <= 45) counts[n] += 1;
    }

    // Compute "draws ago" index of last appearance
    // Assumes draws are oldest -> newest
    for (let i = draws.length - 1; i >= 0; i--) {
      const ago = (draws.length - 1) - i;
      const d = draws[i];
      for (const n of d.main) if (n >= 1 && n <= 45 && lastAgo[n] === null) lastAgo[n] = ago;
      for (const n of d.supp) if (n >= 1 && n <= 45 && lastAgo[n] === null) lastAgo[n] = ago;
    }

    const out: Row[] = [];
    for (let n = 1; n <= N; n++) out.push({ n, count: counts[n], lastAgo: lastAgo[n] });
    return out;
  }, [draws]);

  const sorted = useMemo<Row[]>(() => {
    const asNum = (x: number | null) => (x === null ? Number.POSITIVE_INFINITY : x);

    const byLastAgoAsc = (a: Row, b: Row) =>
      asNum(a.lastAgo) - asNum(b.lastAgo) || b.count - a.count || a.n - b.n;

    const byCountDesc = (a: Row, b: Row) =>
      b.count - a.count || asNum(a.lastAgo) - asNum(b.lastAgo) || a.n - b.n;

    const byNumberAsc = (a: Row, b: Row) => a.n - b.n;

    const arr = rows.slice();
    switch (sortMode) {
      case "lastAgoAsc": return arr.sort(byLastAgoAsc);
      case "countDesc":  return arr.sort(byCountDesc);
      case "numberAsc":  return arr.sort(byNumberAsc);
      default:           return arr;
    }
  }, [rows, sortMode]);

  const fmtAgo = (ago: number | null) =>
    ago === null ? "—" : String(ago);

  return (
    <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6 }}>
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
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.n} style={{ borderBottom: "1px solid #eee" }}>
              <td style={tdLeft}><b>{r.n}</b></td>
              <td style={tdRight}>{r.count}</td>
              <td style={tdRight}>{fmtAgo(r.lastAgo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const thLeft: React.CSSProperties = { textAlign: "left", padding: "6px 8px", borderBottom: "2px solid #333" };
const thRight: React.CSSProperties = { textAlign: "right", padding: "6px 8px", borderBottom: "2px solid #333" };
const tdLeft: React.CSSProperties = { textAlign: "left", padding: "6px 8px" };
const tdRight: React.CSSProperties = { textAlign: "right", padding: "6px 8px" };
import React from "react";
import type { Draw } from "../types";
import { buildDrawGrid } from "../dga";

/**
 * Small panel: show per-column nonzero counts and a textual preview of the last N columns.
 * Useful to see grid sparsity and why diamonds are absent.
 *
 * Props:
 * - history: filteredHistory (oldest -> newest)
 * - previewCols: how many rightmost columns to show (default 8)
 */
export function DroughtGridSummary({ history, previewCols = 8 }: { history: Draw[]; previewCols?: number }) {
  if (!history || history.length === 0) return <div style={{ color: "#666" }}>No history</div>;
  const draws = history.length;
  const grid = buildDrawGrid(history, 45, draws);
  if (!grid.length) return <div style={{ color: "#666" }}>Empty grid</div>;

  const nCols = grid[0].length;
  const countsPerCol = Array.from({ length: nCols }, (_, c) => grid.reduce((acc, row) => acc + (row[c] ? 1 : 0), 0));
  const rightPreview = Math.min(previewCols, nCols);
  const start = Math.max(0, nCols - rightPreview);

  return (
    <div style={{ border: "1px solid #e0e0e0", padding: 8, borderRadius: 6, background: "#fff" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Grid summary</div>
      <div style={{ fontSize: 13, color: "#444", marginBottom: 6 }}>
        Draws: <b>{draws}</b> | Columns: <b>{nCols}</b>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", overflowX: "auto", paddingBottom: 8 }}>
        {countsPerCol.map((cnt, idx) => (
          <div key={idx} style={{ textAlign: "center", width: 28 }}>
            <div style={{ height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>
              {idx + 1}
            </div>
            <div style={{ height: 10 }} />
            <div style={{ fontSize: 12 }}>{cnt}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, fontSize: 13, color: "#333" }}>
        Last {rightPreview} columns (symbols: ▢=0, ●=main, ○=supp)
      </div>
      <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 12, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ padding: 4, textAlign: "left" }}>#</th>
              {Array.from({ length: rightPreview }, (_, i) => (
                <th key={i} style={{ padding: "4px 6px", textAlign: "center" }}>{start + i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, rIdx) => (
              <tr key={rIdx}>
                <td style={{ padding: "2px 6px", textAlign: "right", color: "#666" }}>{String(rIdx + 1).padStart(2, " ")}</td>
                {row.slice(start, nCols).map((cell, cIdx) => (
                  <td key={cIdx} style={{ padding: "2px 6px", textAlign: "center", width: 22 }}>
                    {cell === 0 ? "▢" : cell === 1 ? "●" : "○"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DroughtGridSummary;
import React, { useState } from "react";
import type { Draw } from "../types";
import { diagnoseNumberPosition, DiagnoseResult } from "../debug/droughtCheck";
import { computeDroughtHazard } from "../lib/droughtHazard";
import { buildDrawGrid, findDiamondsAllRadii, getPredictedNumbers } from "../dga";
import { comparePredictions } from "../debug/comparePredictions";

type Props = {
  history: Draw[];
  title?: string;
  defaultOpen?: boolean; // intrinsically collapsible
};

export function DroughtDebugPanel({ history, title = "Drought debug", defaultOpen = false }: Props) {
  const [num, setNum] = useState<number>(38);
  const [topK, setTopK] = useState<number>(12);
  const [useZoneBias, setUseZoneBias] = useState<boolean>(false);
  const [zoneGamma, setZoneGamma] = useState<number>(0.5);

  const [lastDiagnose, setLastDiagnose] = useState<DiagnoseResult | null>(null);
  const [lastHazardTop, setLastHazardTop] = useState<{ number: number; k: number; p: number }[] | null>(null);
  const [lastDgaPred, setLastDgaPred] = useState<number[] | null>(null);
  const [compareResult, setCompareResult] = useState<any | null>(null);

  const runAll = () => {
    if (!history || history.length === 0) {
      alert("No history available");
      return;
    }
    const cappedTopK = Math.max(1, Math.min(45, topK));
    const diag = diagnoseNumberPosition(history, num, cappedTopK, "both", useZoneBias, zoneGamma);
    setLastDiagnose(diag);

    const { byNumber } = computeDroughtHazard(history);
    const hazardTop = byNumber.slice().sort((a, b) => b.p - a.p || b.k - a.k).slice(0, cappedTopK);
    setLastHazardTop(hazardTop);

    // DGA predictions (mirror UI)
    const draws = history.length;
    let grid = buildDrawGrid(history, 45, draws);
    grid = grid.map((row) => [...row, 0]); // append empty next column
    const nRows = grid.length;
    const nCols = grid[0]?.length || 1;
    const maxRadius = Math.max(1, Math.min(4, Math.floor(Math.min(nRows, nCols) / 2)));
    const diamonds = findDiamondsAllRadii(grid, 1, maxRadius);
    const predCol = (grid[0]?.length || 1) - 1;
    const dgaPreds = getPredictedNumbers(diamonds, predCol);
    setLastDgaPred(dgaPreds.slice(0, cappedTopK));
  };

  const runCompareAndCopy = async () => {
    if (!history || history.length === 0) {
      alert("No history");
      return;
    }
    const cmp = comparePredictions(history, { topK });
    setCompareResult(cmp);
    const payload = JSON.stringify(cmp, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      alert("Compare payload copied to clipboard (also logged).");
      console.log("comparePredictions payload:", cmp);
    } catch (err) {
      console.error("Clipboard failed", err);
      const w = window.open();
      if (w) {
        w.document.title = "drought-compare";
        w.document.body.style.whiteSpace = "pre";
        w.document.body.style.fontFamily = "monospace";
        w.document.body.textContent = payload;
      }
      alert("Could not copy automatically — opened payload in a new tab.");
    }
  };

  return (
    <details open={defaultOpen} style={{ marginTop: 10 }}>
      <summary style={{ cursor: "pointer" }}>
        <b>{title}</b> <span style={{ color: "#666", fontSize: 12, marginLeft: 6 }}>(hazard vs temp vs DGA)</span>
      </summary>

      <section style={{ border: "1px solid #e0e0e0", padding: 10, borderRadius: 8, background: "#fff", marginTop: 10 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label>
            Number:
            <input type="number" min={1} max={45} value={num} onChange={(e) => setNum(Number(e.target.value))} style={{ width: 80, marginLeft: 6 }} />
          </label>
          <label>
            TopK:
            <input type="number" min={1} max={45} value={topK} onChange={(e) => setTopK(Number(e.target.value))} style={{ width: 80, marginLeft: 6 }} />
          </label>
          <label title="Apply saved ZPA zone bias when computing ranking">
            <input type="checkbox" checked={useZoneBias} onChange={(e) => setUseZoneBias(e.target.checked)} /> Zone bias
          </label>
          {useZoneBias && (
            <label>
              γ:
              <input type="number" min={0} max={1} step={0.05} value={zoneGamma} onChange={(e) => setZoneGamma(Number(e.target.value))} style={{ width: 80, marginLeft: 6 }} />
            </label>
          )}

          <button onClick={runAll} style={{ marginLeft: "auto" }}>Run debug</button>
          <button onClick={runCompareAndCopy} style={{ marginLeft: 6 }}>Compare & Copy JSON</button>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px", minWidth: 320 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Diagnose (temperature signal)</div>
            <pre style={{ maxHeight: 280, overflow: "auto", fontSize: 13, padding: 8, background: "#fafafa", borderRadius: 6 }}>
              {lastDiagnose ? JSON.stringify(lastDiagnose, null, 2) : "Run debug to compute diagnoseNumberPosition()"}
            </pre>
          </div>

          <div style={{ flex: "1 1 320px", minWidth: 320 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Drought hazard top (h(k) table)</div>
            {lastHazardTop ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f7f7f7" }}>
                    <th style={{ textAlign: "left", padding: 6 }}>#</th>
                    <th style={{ textAlign: "right", padding: 6 }}>k</th>
                    <th style={{ textAlign: "right", padding: 6 }}>p</th>
                  </tr>
                </thead>
                <tbody>
                  {lastHazardTop.map((r) => (
                    <tr key={r.number}>
                      <td style={{ padding: 6 }}>{r.number}</td>
                      <td style={{ padding: 6, textAlign: "right" }}>{r.k}</td>
                      <td style={{ padding: 6, textAlign: "right" }}>{(r.p * 100).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ fontSize: 13, color: "#666" }}>Run debug to compute hazard table</div>
            )}
          </div>

          <div style={{ flex: "1 1 240px", minWidth: 240 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>DGA diamond predictions</div>
            <div style={{ fontSize: 13, background: "#fafafa", padding: 8, borderRadius: 6 }}>
              {lastDgaPred ? (
                <div>
                  <div>Top predictions (DGA):</div>
                  <div style={{ marginTop: 8, fontWeight: 700 }}>{lastDgaPred.join(", ") || "—"}</div>
                  <div style={{ marginTop: 8, color: "#666", fontSize: 12 }}>
                    Note: DGA predictions come from diamond edge positions (structural algorithm).
                  </div>
                </div>
              ) : (
                "Run debug to compute DGA predictions"
              )}
            </div>
          </div>
        </div>

        {compareResult && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Compare result (top lists)</div>
            <div style={{ maxHeight: 240, overflow: "auto", background: "#fafafa", padding: 8, borderRadius: 6 }}>
              <pre style={{ fontSize: 12 }}>{JSON.stringify({
                topK: compareResult.topK,
                hazardTop: compareResult.hazardTop,
                tempTop: compareResult.tempTop,
                dgaTop: compareResult.dgaTop,
                dgaDiagnostics: compareResult.dgaDiagnostics
              }, null, 2)}</pre>
            </div>
          </div>
        )}
      </section>
    </details>
  );
}

export default DroughtDebugPanel;
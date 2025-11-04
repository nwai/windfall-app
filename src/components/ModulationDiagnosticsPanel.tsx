import React from "react";
import { BatesDiagnostics } from "../lib/batesDiagnostics";
import { BatesParameterSet } from "../lib/batesWeightsCore";

/* Keep one canonical default here (should mirror BatesPanel default) */
const defaultBatesParams: BatesParameterSet = {
  k: 3,
  dualTri: false,
  triMode: 0.5,
  triMode2: 0.2,
  dualTriWeightA: 0.5,
  mixWeight: 0.5,
  betaHot: 0,
  betaCold: 0,
  betaGlobal: 0,
  gammaConditional: 0,
  hotQuantile: 0.7,
  coldQuantile: 0.3,
  highlightHotCold: true
};

interface ModulationDiagnosticsPanelProps {
  diagnostics: BatesDiagnostics | null;
  currentBatesParams?: Partial<BatesParameterSet>; // accept partial safely
  title?: string;
  hideSnapshotIfEmpty?: boolean; // optional behavior toggle
}

export const ModulationDiagnosticsPanel: React.FC<ModulationDiagnosticsPanelProps> = ({
  diagnostics,
  currentBatesParams,
  title = "Modulation Diagnostics",
  hideSnapshotIfEmpty = false
}) => {

  const fmt = (v: unknown, digits = 2) =>
    typeof v === "number" && isFinite(v) ? v.toFixed(digits) : "–";

  const hasData = diagnostics !== null;

  return (
    <section style={panel}>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>{title}</h3>

      {!hasData && (
        <div style={{ fontSize: 12, color: "#666" }}>
          No diagnostics yet. Generate or adjust parameters to populate this panel.
        </div>
      )}

      {hasData && (
        <>
          {/* Summary */}
          {diagnostics.summary && (
            <div style={summaryBox}>
              <b>Summary:</b> {diagnostics.summary}
            </div>
          )}

          {/* Guardrails */}
          {diagnostics.guardrails && diagnostics.guardrails.warnings.length > 0 && (
            <div
              style={{
                ...guardBox,
                borderColor: diagnostics.guardrails.severity === "risk" ? "#c62828" : 
                            diagnostics.guardrails.severity === "warn" ? "#e0a100" : "#2196f3",
                background: diagnostics.guardrails.severity === "risk" ? "#fdecea" :
                           diagnostics.guardrails.severity === "warn" ? "#fff8e1" : "#e3f2fd",
                color: diagnostics.guardrails.severity === "risk" ? "#8b1d1d" :
                      diagnostics.guardrails.severity === "warn" ? "#795c00" : "#1565c0"
              }}
            >
              <b>Guardrails ({diagnostics.guardrails.severity}):</b>
              {diagnostics.guardrails.warnings.map((w, i) => (
                <div key={i} style={{ marginLeft: 8, marginTop: 2 }}>• {w}</div>
              ))}
            </div>
          )}

          {/* Weight Statistics */}
          {diagnostics.weights && (
            <div style={statsBox}>
              <div style={statsRow}>
                <b>Weight Statistics:</b>
              </div>
              <div style={statsRow}>
                <span>Min: {fmt(diagnostics.weights.min, 4)}</span>
                <span>Max: {fmt(diagnostics.weights.max, 4)}</span>
                <span>Mean: {fmt(diagnostics.weights.mean, 4)}</span>
                <span>Std: {fmt(diagnostics.weights.std, 4)}</span>
              </div>
              
              {/* Top N weights */}
              {diagnostics.weights.top && diagnostics.weights.top.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <b>Top 10 Numbers by Weight:</b>
                  <div style={{ overflowX: "auto", marginTop: 4 }}>
                    <table style={table}>
                      <thead>
                        <tr style={{ background: "#fafafa" }}>
                          <th style={th}>Number</th>
                          <th style={th}>Weight</th>
                          <th style={th}>Weight %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diagnostics.weights.top.map((item, i) => (
                          <tr key={i}>
                            <td style={td}>{item.n}</td>
                            <td style={td}>{fmt(item.w, 4)}</td>
                            <td style={td}>{fmt(item.w * 100, 2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {diagnostics.updatedAt && (
            <div style={updatedStamp}>
              Updated: {new Date(diagnostics.updatedAt).toLocaleString()}
            </div>
          )}
        </>
      )}
    </section>
  );
};

/* Styles */
const panel: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 8,
  padding: 16,
  background: "#fff",
  marginTop: 18
};

const summaryBox: React.CSSProperties = {
  fontSize: 11,
  marginBottom: 10,
  background: "#f8fafc",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #e2e8f0",
  lineHeight: 1.5
};

const guardBox: React.CSSProperties = {
  marginBottom: 10,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid",
  fontSize: 11,
  lineHeight: 1.5
};

const statsBox: React.CSSProperties = {
  fontSize: 12,
  marginBottom: 10,
  background: "#fafafa",
  padding: "10px",
  borderRadius: 6,
  border: "1px solid #e2e8f0"
};

const statsRow: React.CSSProperties = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 4
};

const table: React.CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
  fontSize: 11
};

const th: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid #ddd",
  textAlign: "center",
  fontWeight: 600,
  whiteSpace: "nowrap"
};

const td: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid #eee",
  textAlign: "center",
  fontVariantNumeric: "tabular-nums"
};

const updatedStamp: React.CSSProperties = {
  fontSize: 10,
  marginTop: 8,
  color: "#666",
  fontStyle: "italic"
};
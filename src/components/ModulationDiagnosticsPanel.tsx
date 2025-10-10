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

  const rows = diagnostics?.rows || [];

  // Merge defaults + provided (partial) params
  const mergedParams: BatesParameterSet = {
    ...defaultBatesParams,
    ...(currentBatesParams || {})
  };

  // Decide whether to show snapshot
  const providedKeys = currentBatesParams ? Object.keys(currentBatesParams) : [];
  const showSnapshot = !hideSnapshotIfEmpty || providedKeys.length > 0;

  const fmt = (v: unknown, digits = 2) =>
    typeof v === "number" && isFinite(v) ? v.toFixed(digits) : "–";

  return (
    <section style={panel}>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>{title}</h3>

      {showSnapshot && (
        <div style={snapshotBox}>
          <b>Current Bates Params:</b>{" "}
          k={fmt(mergedParams.k)} | mix={fmt(mergedParams.mixWeight)} | dual={mergedParams.dualTri ? "yes" : "no"} | triMode={fmt(mergedParams.triMode)}
          {mergedParams.dualTri && (
            <>
              {" "}
              triMode2={fmt(mergedParams.triMode2)} wA={fmt(mergedParams.dualTriWeightA)}
            </>
          )}{" "}
          βHot={fmt(mergedParams.betaHot)} βCold={fmt(mergedParams.betaCold)} βG=
          {fmt(mergedParams.betaGlobal)} γCond={fmt(mergedParams.gammaConditional)} hotQ={fmt(mergedParams.hotQuantile)} coldQ={fmt(mergedParams.coldQuantile)}
        </div>
      )}

      {!rows.length && (
        <div style={{ fontSize: 12, color: "#666" }}>
          No diagnostics yet. Generate or adjust parameters to populate this panel.
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={th}>#</th>
                <th style={th}>Final w%</th>
                <th style={th}>Base w%</th>
                <th style={th}>Tri Portion%</th>
                <th style={th}>Bates Portion%</th>
                <th style={th}>Hot?</th>
                <th style={th}>Cold?</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.number}>
                  <td style={td}>{r.number}</td>
                  <td style={td}>{(r.final * 100).toFixed(2)}</td>
                  <td style={td}>{(r.baseConvex * 100).toFixed(2)}</td>
                  <td style={td}>{(r.triPortion * 100).toFixed(2)}</td>
                  <td style={td}>{(r.batesPortion * 100).toFixed(2)}</td>
                  <td style={td}>{r.isHot ? "Y" : ""}</td>
                  <td style={td}>{r.isCold ? "Y" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={legend}>
            <span>Final w% = post modulation</span>
            <span>Tri/Bates Portion% = pre-modulation convex parts</span>
          </div>
        </div>
      )}
      {diagnostics?.generatedAt && (
        <div style={updatedStamp}>
          Updated: {diagnostics.generatedAt}
        </div>
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
const snapshotBox: React.CSSProperties = {
  fontSize: 11,
  marginBottom: 8,
  background: "#f8fafc",
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #e2e8f0",
  lineHeight: 1.4
};
const table: React.CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
  fontSize: 12
};
const th: React.CSSProperties = {
  padding: "4px 6px",
  borderBottom: "1px solid #ddd",
  textAlign: "center",
  fontWeight: 600,
  whiteSpace: "nowrap"
};
const td: React.CSSProperties = {
  padding: "4px 6px",
  borderBottom: "1px solid #eee",
  textAlign: "center",
  fontVariantNumeric: "tabular-nums"
};
const legend: React.CSSProperties = {
  fontSize: 10,
  marginTop: 6,
  display: "flex",
  gap: 18,
  flexWrap: "wrap",
  color: "#555"
};
const updatedStamp: React.CSSProperties = {
  fontSize: 10,
  marginTop: 6,
  color: "#666"
};
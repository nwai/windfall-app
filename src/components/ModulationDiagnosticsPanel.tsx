import React from "react";
import type { BatesDiagnostics } from "../lib/batesDiagnostics";
import type { BatesParameterSet } from "../lib/batesWeightsCore";

export const ModulationDiagnosticsPanel: React.FC<{
  diagnostics: BatesDiagnostics | null;
  currentBatesParams?: Partial<BatesParameterSet>;
}> = ({ diagnostics, currentBatesParams }) => {
  return (
    <section style={panel}>
      <h4 style={{ marginTop: 0 }}>Modulation Diagnostics</h4>

      {!diagnostics ? (
        <div style={{ fontSize: 12, color: "#666" }}>
          {currentBatesParams ? (
            <>Current Bates Params: {summarize(currentBatesParams)}</>
          ) : (
            <>No diagnostics yet. Generate or adjust parameters to populate this panel.</>
          )}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: "#333", marginBottom: 8 }}>
            <b>Summary:</b> {diagnostics.summary}{" "}
            <span style={{ color: "#888" }}>
              (updated {new Date(diagnostics.updatedAt).toLocaleString()})
            </span>
          </div>

          {diagnostics.guardrails && diagnostics.guardrails.warnings.length > 0 && (
            <div
              style={{
                ...callout,
                borderColor:
                  diagnostics.guardrails.severity === "risk"
                    ? "#c62828"
                    : diagnostics.guardrails.severity === "warn"
                    ? "#e0a100"
                    : "#90caf9",
                background:
                  diagnostics.guardrails.severity === "risk"
                    ? "#fdecea"
                    : diagnostics.guardrails.severity === "warn"
                    ? "#fff8e1"
                    : "#eef6ff",
                color:
                  diagnostics.guardrails.severity === "risk"
                    ? "#8b1d1d"
                    : diagnostics.guardrails.severity === "warn"
                    ? "#795c00"
                    : "#0d47a1",
              }}
            >
              <b>Guardrails ({diagnostics.guardrails.severity}):</b>{" "}
              {diagnostics.guardrails.warnings.map((w, i) => (
                <span key={i} style={{ marginLeft: 6 }}>
                  • {w}
                </span>
              ))}
            </div>
          )}

          {diagnostics.weights && (
            <div style={{ fontSize: 12 }}>
              <div style={{ marginBottom: 6 }}>
                <b>Weight stats:</b> min {fmt(diagnostics.weights.min)}, max{" "}
                {fmt(diagnostics.weights.max)}, mean {fmt(diagnostics.weights.mean)}, std{" "}
                {fmt(diagnostics.weights.std)}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", minWidth: 420 }}>
                  <thead>
                    <tr>
                      <th style={thCell}>#</th>
                      <th style={thCell}>Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(diagnostics.weights.top ?? []).map((t) => (
                      <tr key={t.n}>
                        <td style={tdCell}>{t.n}</td>
                        <td style={tdCell}>{fmt(t.w)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};

function summarize(p: Partial<BatesParameterSet>) {
  const parts: string[] = [];
  if (p.k != null) parts.push(`k=${p.k}`);
  if ((p as any).mixWeight != null) parts.push(`mix=${(p as any).mixWeight}`);
  if ((p as any).triMode != null) parts.push(`mode=${(p as any).triMode}`);
  return parts.join(" | ");
}
function fmt(x: number) {
  return Number.isFinite(x) ? x.toFixed(3) : "–";
}

const panel: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 8,
  padding: 12,
  marginTop: 10,
  background: "#fff",
};
const callout: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid",
  borderRadius: 6,
  fontSize: 12,
  marginBottom: 10,
};
const thCell: React.CSSProperties = {
  textAlign: "left",
  padding: "4px 8px",
  borderBottom: "1px solid #ddd",
  background: "#fafafa",
};
const tdCell: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid #f0f0f0",
};
import React from "react";

import type { BatesDiagnostics, BatesSignalDiagnostics } from "../lib/batesDiagnostics";
import { normalizeBatesParameters, type BatesParameterSet } from "../lib/batesWeightsCore";
import type { GuardrailResult } from "../lib/batesGuardrails";

interface ModulationDiagnosticsPanelProps {
  diagnostics: BatesDiagnostics | null;
  currentBatesParams?: Partial<BatesParameterSet>;
}

export const ModulationDiagnosticsPanel: React.FC<ModulationDiagnosticsPanelProps> = ({
  diagnostics,
  currentBatesParams,
}) => {
  const parameterSnapshot = currentBatesParams && Object.keys(currentBatesParams).length > 0
    ? summarizeParams(normalizeBatesParameters(currentBatesParams))
    : "";

  if (!diagnostics) {
    return (
      <section style={panel}>
        <div style={header}>
          <div>
            <h4 style={title}>Modulation Diagnostics</h4>
            {parameterSnapshot && <div style={subtleText}>{parameterSnapshot}</div>}
          </div>
          <SeverityBadge severity="ok" label="Waiting" />
        </div>
        <div style={emptyState}>No diagnostics have been emitted yet.</div>
      </section>
    );
  }

  const weights = diagnostics.weights;
  const integrityLabel = weights.invalidWeightCount === 0 && weights.sourceLength === 45
    ? "Valid"
    : `${weights.invalidWeightCount} invalid`;

  return (
    <section style={panel}>
      <div style={header}>
        <div>
          <h4 style={title}>Modulation Diagnostics</h4>
          <div style={subtleText}>{diagnostics.summary}</div>
        </div>
        <SeverityBadge severity={diagnostics.guardrails.severity} label={capitalize(diagnostics.guardrails.severity)} />
      </div>

      <div style={metricsGrid}>
        <Metric label="Effective Numbers" value={`${formatNumber(weights.effectiveNumbers, 1)}/45`} />
        <Metric label="Entropy" value={formatPercent(weights.entropyRatio)} />
        <Metric label="Top Share" value={formatPercent(weights.max)} />
        <Metric label="Weight Integrity" value={integrityLabel} />
      </div>

      {diagnostics.guardrails.warnings.length > 0 && (
        <div style={calloutStyle(diagnostics.guardrails.severity)}>
          <div style={calloutTitle}>Guardrails</div>
          <ul style={warningList}>
            {diagnostics.guardrails.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={detailGrid}>
        <section style={detailSection}>
          <h5 style={sectionTitle}>Distribution</h5>
          <div style={kvGrid}>
            <KeyValue label="Min" value={formatPercent(weights.min)} />
            <KeyValue label="Mean" value={formatPercent(weights.mean)} />
            <KeyValue label="Std" value={formatPercent(weights.std)} />
            <KeyValue label="CV" value={formatNumber(weights.coefficientOfVariation, 2)} />
            <KeyValue label="Mass" value={formatNumber(weights.totalMass, 4)} />
            <KeyValue label="Length" value={String(weights.sourceLength)} />
          </div>
        </section>

        <section style={detailSection}>
          <h5 style={sectionTitle}>Signals</h5>
          <div style={kvGrid}>
            <KeyValue label="Recent" value={formatSignal(diagnostics.signals.recentSignal)} />
            <KeyValue label="Conditional" value={formatSignal(diagnostics.signals.conditionalProb)} />
            <KeyValue label="Updated" value={formatDate(diagnostics.updatedAt)} />
            <KeyValue label="Concentration" value={capitalize(weights.concentrationSeverity)} />
          </div>
        </section>
      </div>

      <div style={topWeightsShell}>
        <div style={tableHeader}>
          <span>Number</span>
          <span>Share</span>
          <span>Cumulative</span>
        </div>
        {weights.top.map((row) => (
          <div key={row.n} style={tableRow}>
            <span style={numberPill}>{row.n}</span>
            <span>{formatPercent(row.w)}</span>
            <span>{formatPercent(row.cumulative)}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

interface MetricProps {
  label: string;
  value: string;
}

const Metric: React.FC<MetricProps> = ({ label, value }) => (
  <div style={metric}>
    <div style={metricLabel}>{label}</div>
    <div style={metricValue}>{value}</div>
  </div>
);

interface KeyValueProps {
  label: string;
  value: string;
}

const KeyValue: React.FC<KeyValueProps> = ({ label, value }) => (
  <div style={keyValue}>
    <span style={keyLabel}>{label}</span>
    <b style={keyValueText}>{value}</b>
  </div>
);

interface SeverityBadgeProps {
  severity: GuardrailResult["severity"];
  label: string;
}

const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity, label }) => (
  <span style={badgeStyle(severity)}>{label}</span>
);

function summarizeParams(params: BatesParameterSet): string {
  const shape = params.dualTri ? "dual" : "single";
  return `k ${params.k} | ${shape} | mix ${formatNumber(params.mixWeight, 2)} | hot ${formatNumber(params.betaHot, 2)} | cold ${formatNumber(params.betaCold, 2)} | gamma ${formatNumber(params.gammaConditional, 2)}`;
}

function formatSignal(signal: BatesSignalDiagnostics): string {
  if (!signal.available) return "missing";
  if (signal.valid) return "valid";
  return `${signal.finiteCount}/${signal.length} finite`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString();
}

function formatNumber(value: number, digits: number): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "0";
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "0.0%";
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function badgeStyle(severity: GuardrailResult["severity"]): React.CSSProperties {
  const palette = severityPalette(severity);
  return {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 26,
    padding: "4px 9px",
    border: `1px solid ${palette.border}`,
    borderRadius: 6,
    background: palette.background,
    color: palette.text,
    fontSize: 12,
    fontWeight: 700,
  };
}

function calloutStyle(severity: GuardrailResult["severity"]): React.CSSProperties {
  const palette = severityPalette(severity);
  return {
    border: `1px solid ${palette.border}`,
    borderRadius: 6,
    padding: "8px 10px",
    background: palette.background,
    color: palette.text,
    fontSize: 12,
    lineHeight: 1.4,
  };
}

function severityPalette(severity: GuardrailResult["severity"]) {
  if (severity === "risk") {
    return { border: "#fecaca", background: "#fff1f2", text: "#991b1b" };
  }
  if (severity === "caution") {
    return { border: "#fde68a", background: "#fffbeb", text: "#92400e" };
  }
  return { border: "#bbf7d0", background: "#f0fdf4", text: "#166534" };
}

const panel: React.CSSProperties = {
  display: "grid",
  gap: 12,
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 14,
  marginTop: 10,
  background: "#fff",
  color: "#0f172a",
};

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  lineHeight: 1.2,
};

const subtleText: React.CSSProperties = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.35,
};

const emptyState: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  padding: "10px 12px",
  background: "#f8fafc",
  color: "#475569",
  fontSize: 12,
};

const metricsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 8,
};

const metric: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  padding: "8px 10px",
  minWidth: 0,
};

const metricLabel: React.CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  marginBottom: 2,
};

const metricValue: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1.2,
};

const calloutTitle: React.CSSProperties = {
  fontWeight: 700,
  marginBottom: 4,
};

const warningList: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
};

const detailGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const detailSection: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  padding: 10,
};

const sectionTitle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 12,
  color: "#334155",
};

const kvGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))",
  gap: 8,
};

const keyValue: React.CSSProperties = {
  display: "grid",
  gap: 2,
  minWidth: 0,
};

const keyLabel: React.CSSProperties = {
  color: "#64748b",
  fontSize: 11,
};

const keyValueText: React.CSSProperties = {
  fontSize: 12,
  color: "#0f172a",
  overflowWrap: "anywhere",
};

const topWeightsShell: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  overflow: "hidden",
  fontSize: 12,
};

const tableHeader: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(72px, 0.8fr) minmax(90px, 1fr) minmax(96px, 1fr)",
  gap: 8,
  alignItems: "center",
  padding: "7px 10px",
  background: "#f8fafc",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 700,
};

const tableRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(72px, 0.8fr) minmax(90px, 1fr) minmax(96px, 1fr)",
  gap: 8,
  alignItems: "center",
  padding: "8px 10px",
  borderTop: "1px solid #e5e7eb",
  fontVariantNumeric: "tabular-nums",
};

const numberPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 34,
  minHeight: 26,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  background: "#fff",
  fontWeight: 700,
};

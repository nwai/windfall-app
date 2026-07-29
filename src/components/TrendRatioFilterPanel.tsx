import React, { useMemo } from "react";
import type { TrendRatioFilterModel } from "../lib/trendRatioFilter";

/**
 * @deprecated Retained for older internal diagnostics. The active app panel is
 * TrendRatioHistoryPanel, which exposes all 45 U/D/F ratios and wires selected
 * ratios into candidate generation.
 */
interface TrendClassCounts {
  up: number;
  down: number;
  flat: number;
}

interface TrendRatioFilterPanelProps {
  model: TrendRatioFilterModel;
  lookback: number;
  threshold: number;
  windowDraws: number;
  trendClassCounts: TrendClassCounts;
  onLookbackChange: (value: number) => void;
  onThresholdChange: (value: number) => void;
  onToggleRatio: (tag: string) => void;
  onSetAllowedRatios: (tags: string[]) => void;
}

export const TrendRatioFilterPanel: React.FC<TrendRatioFilterPanelProps> = ({
  model,
  lookback,
  threshold,
  windowDraws,
  trendClassCounts,
  onLookbackChange,
  onThresholdChange,
  onToggleRatio,
  onSetAllowedRatios,
}) => {
  const rowsByCount = useMemo(
    () => model.rows.slice().sort((a, b) => b.count - a.count || Math.abs(b.zScore ?? 0) - Math.abs(a.zScore ?? 0) || a.tag.localeCompare(b.tag)),
    [model.rows],
  );
  const notableRows = useMemo(
    () => rowsByCount.filter((row) => row.zScore !== null && Math.abs(row.zScore) >= 2),
    [rowsByCount],
  );
  const selectedTags = useMemo(
    () => model.rows.filter((row) => row.selected).map((row) => row.tag),
    [model.rows],
  );
  const disabled = model.summary.eligibleDraws === 0;
  const status = model.summary.selectedRatioCount > 0 ? "On" : "Off";
  const coverageLabel = model.summary.selectedRatioCount > 0
    ? `${model.summary.selectedDraws}/${model.summary.eligibleDraws} (${model.summary.coveragePercent.toFixed(2)}%)`
    : `${model.summary.eligibleDraws}/${model.summary.eligibleDraws || 0} (100%)`;

  return (
    <section style={panelStyle}>
      <div style={metricGridStyle}>
        <Metric label="Filter" value={status} tone={status === "On" ? "active" : "neutral"} />
        <Metric label="Historical coverage" value={coverageLabel} />
        <Metric label="Eligible draws" value={`${model.summary.eligibleDraws}/${windowDraws}`} />
        <Metric label="Live U/D/F" value={`${trendClassCounts.up}/${trendClassCounts.down}/${trendClassCounts.flat}`} />
      </div>

      <div style={controlGridStyle}>
        <label style={fieldStyle}>
          <span style={labelStyle}>Lookback draws</span>
          <input
            type="number"
            min={1}
            max={Math.max(1, windowDraws - 1)}
            value={lookback}
            onChange={(event) => onLookbackChange(Number(event.target.value))}
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Trend threshold</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.005}
            value={threshold}
            onChange={(event) => onThresholdChange(Number(event.target.value))}
            style={inputStyle}
          />
        </label>
        <div style={buttonGroupStyle}>
          <button type="button" disabled={disabled} onClick={() => onSetAllowedRatios(rowsByCount.slice(0, 3).map((row) => row.tag))} style={buttonStyle(disabled)}>
            Top 3
          </button>
          <button type="button" disabled={disabled || notableRows.length === 0} onClick={() => onSetAllowedRatios(notableRows.map((row) => row.tag))} style={buttonStyle(disabled || notableRows.length === 0)}>
            Notable
          </button>
          <button type="button" disabled={disabled} onClick={() => onSetAllowedRatios(rowsByCount.map((row) => row.tag))} style={buttonStyle(disabled)}>
            All
          </button>
          <button type="button" disabled={selectedTags.length === 0} onClick={() => onSetAllowedRatios([])} style={buttonStyle(selectedTags.length === 0)}>
            Clear
          </button>
        </div>
      </div>

      {disabled ? (
        <div style={emptyStyle}>Not enough draws for the current lookback.</div>
      ) : (
        <div style={ratioGridStyle}>
          {rowsByCount.map((row) => {
            const active = row.selected;
            const absZ = Math.abs(row.zScore ?? 0);
            const zColor = absZ >= 2 ? "#b45309" : "#64748b";
            return (
              <button
                key={row.tag}
                type="button"
                onClick={() => onToggleRatio(row.tag)}
                style={{
                  ...ratioButtonStyle,
                  borderColor: active ? "#1d4ed8" : "#cbd5e1",
                  background: active ? "#eff6ff" : "#fff",
                }}
                title={`Observed ${row.count} draws; expected ${row.expected.toFixed(2)}; posterior ${(row.posteriorMean * 100).toFixed(2)}%`}
              >
                <span style={{ fontWeight: 800, color: active ? "#1d4ed8" : "#111827" }}>{row.tag}</span>
                <span>{row.count} draws</span>
                <span>{row.percent.toFixed(2)}%</span>
                <span style={{ color: zColor }}>z {row.zScore === null ? "-" : row.zScore.toFixed(2)}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "active" }) {
  return (
    <div style={{ ...metricStyle, borderColor: tone === "active" ? "#93c5fd" : "#e2e8f0", background: tone === "active" ? "#eff6ff" : "#fff" }}>
      <span style={metricLabelStyle}>{label}</span>
      <span style={metricValueStyle}>{value}</span>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  marginTop: 6,
  padding: 12,
  border: "1px solid #dbeafe",
  borderRadius: 6,
  background: "#f8fafc",
};

const metricGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 8,
};

const metricStyle: React.CSSProperties = {
  display: "grid",
  gap: 2,
  minHeight: 48,
  padding: "6px 8px",
  border: "1px solid #e2e8f0",
  borderRadius: 6,
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  fontWeight: 700,
};

const metricValueStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#0f172a",
  fontWeight: 800,
};

const controlGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 8,
  alignItems: "end",
};

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#334155",
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  minHeight: 32,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "4px 8px",
};

const buttonGroupStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

function buttonStyle(disabled: boolean): React.CSSProperties {
  return {
    minHeight: 32,
    padding: "5px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    background: disabled ? "#f1f5f9" : "#fff",
    color: disabled ? "#94a3b8" : "#334155",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12,
    fontWeight: 700,
  };
}

const ratioGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(116px, 1fr))",
  gap: 8,
};

const ratioButtonStyle: React.CSSProperties = {
  display: "grid",
  gap: 2,
  textAlign: "left",
  minHeight: 74,
  padding: "7px 8px",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  color: "#334155",
  cursor: "pointer",
  fontSize: 11,
};

const emptyStyle: React.CSSProperties = {
  minHeight: 38,
  display: "flex",
  alignItems: "center",
  color: "#64748b",
  fontSize: 12,
};

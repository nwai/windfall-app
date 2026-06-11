import React from "react";

import {
  MAX_TARGET_WEIGHT,
  MIN_TARGET_WEIGHT,
  areWeightedTargetsEqual,
  buildWeightedTargetModel,
  normalizeWeightedTargets,
  sanitizeTargetWeight,
} from "../lib/weightedTargets";

interface WeightedTargetListPanelProps {
  userSelectedNumbers: number[];
  weightedTargets: Record<number, number>;
  setWeightedTargets: React.Dispatch<React.SetStateAction<Record<number, number>>>;
}

export const WeightedTargetListPanel: React.FC<WeightedTargetListPanelProps> = ({
  userSelectedNumbers,
  weightedTargets,
  setWeightedTargets,
}) => {
  const model = React.useMemo(
    () => buildWeightedTargetModel(userSelectedNumbers, weightedTargets),
    [userSelectedNumbers, weightedTargets],
  );

  React.useEffect(() => {
    if (!areWeightedTargetsEqual(weightedTargets, model.normalizedTargets)) {
      setWeightedTargets(model.normalizedTargets);
    }
  }, [model.normalizedTargets, setWeightedTargets, weightedTargets]);

  function setWeight(number: number, value: unknown) {
    const nextWeight = sanitizeTargetWeight(value);
    setWeightedTargets((current) => normalizeWeightedTargets(userSelectedNumbers, {
      ...current,
      [number]: nextWeight,
    }));
  }

  function resetAll() {
    const balanced = model.selectedNumbers.reduce<Record<number, number>>((next, number) => {
      next[number] = 1;
      return next;
    }, {});
    setWeightedTargets(balanced);
  }

  const hasSelectedNumbers = model.summary.selectedCount > 0;

  return (
    <section style={panel}>
      <div style={header}>
        <div>
          <div style={subtleText}>
            Parameter Search reads these weights after validation.
          </div>
        </div>
        <button
          type="button"
          onClick={resetAll}
          disabled={!hasSelectedNumbers}
          style={button(!hasSelectedNumbers)}
          title="Set every selected number to weight 1"
        >
          Reset to 1
        </button>
      </div>

      {!hasSelectedNumbers ? (
        <div style={emptyState}>No user-selected numbers are active.</div>
      ) : (
        <>
          <div style={metricsGrid}>
            <Metric label="Selected" value={String(model.summary.selectedCount)} />
            <Metric label="Total Weight" value={formatNumber(model.summary.totalWeight)} />
            <Metric label="4-Hit Floor" value={formatNumber(model.summary.weightedMatchFloor)} />
            <Metric label="Effective Targets" value={formatNumber(model.summary.effectiveTargetCount)} />
          </div>

          <div style={tableShell}>
            <div style={tableHeader}>
              <span>Number</span>
              <span>Weight</span>
              <span>Share</span>
            </div>
            {model.rows.map((row) => (
              <div key={row.number} style={tableRow}>
                <span style={numberPill}>{row.number}</span>
                <input
                  type="number"
                  min={MIN_TARGET_WEIGHT}
                  max={MAX_TARGET_WEIGHT}
                  step={0.1}
                  value={row.weight}
                  onChange={(event) => setWeight(row.number, event.currentTarget.value)}
                  style={input}
                  aria-label={`Weight for number ${row.number}`}
                  title={`Allowed range: ${MIN_TARGET_WEIGHT} to ${MAX_TARGET_WEIGHT}`}
                />
                <span style={shareText}>{formatPercent(row.sharePercent)}</span>
              </div>
            ))}
          </div>

          <div style={footer}>
            <span>
              Weight range {formatNumber(model.summary.minWeight)}-{formatNumber(model.summary.maxWeight)}
            </span>
            <span>Variation {formatNumber(model.summary.coefficientOfVariation)}</span>
          </div>
        </>
      )}
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

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

const panel: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 14,
  background: "#fff",
  marginTop: 16,
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
};

const subtleText: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: "#64748b",
};

const button = (disabled: boolean): React.CSSProperties => ({
  padding: "6px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  background: disabled ? "#f1f5f9" : "#fff",
  color: disabled ? "#94a3b8" : "#0f172a",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 12,
  lineHeight: 1.2,
});

const emptyState: React.CSSProperties = {
  marginTop: 12,
  padding: "12px 14px",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  color: "#475569",
  background: "#f8fafc",
  fontSize: 12,
};

const metricsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 8,
  marginTop: 12,
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
  color: "#0f172a",
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1.2,
};

const tableShell: React.CSSProperties = {
  marginTop: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  overflow: "hidden",
};

const tableHeader: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(70px, 0.8fr) minmax(100px, 1fr) minmax(70px, 0.8fr)",
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
  gridTemplateColumns: "minmax(70px, 0.8fr) minmax(100px, 1fr) minmax(70px, 0.8fr)",
  gap: 8,
  alignItems: "center",
  padding: "8px 10px",
  borderTop: "1px solid #e5e7eb",
  fontSize: 12,
};

const numberPill: React.CSSProperties = {
  display: "inline-flex",
  justifyContent: "center",
  alignItems: "center",
  width: 34,
  minHeight: 28,
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  fontWeight: 700,
  color: "#0f172a",
  background: "#fff",
};

const input: React.CSSProperties = {
  width: "100%",
  maxWidth: 120,
  minWidth: 72,
  fontSize: 12,
  padding: "5px 7px",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
};

const shareText: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  color: "#334155",
};

const footer: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 8,
  color: "#64748b",
  fontSize: 11,
};

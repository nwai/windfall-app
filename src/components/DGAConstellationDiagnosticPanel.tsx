import React, { useMemo, useState } from "react";

import type { Draw } from "../types";
import {
  buildDgaConstellationDiagnostic,
  type DgaConstellationCell,
  type DgaConstellationCellRole,
  type DgaConstellationMetric,
} from "../lib/dgaConstellation";
import { HigButton, HigField, InfoHelp } from "./shared/HigControls";

interface DGAConstellationDiagnosticPanelProps {
  history: Draw[];
}

const panelStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const controlsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
  alignItems: "end",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.32)",
  borderRadius: 10,
  background: "rgba(255, 255, 255, 0.94)",
  padding: 10,
};

const metricGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
};

const mutedStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.45,
};

const rolePalette: Record<DgaConstellationCellRole, { background: string; border: string; color: string; label: string }> = {
  main: { background: "#fff1f2", border: "#fecaca", color: "#b91c1c", label: "M" },
  supp: { background: "#f0fdf4", border: "#bbf7d0", color: "#166534", label: "S" },
  none: { background: "#f8fafc", border: "#e2e8f0", color: "#94a3b8", label: "" },
};

const formatNumber = (value: number | null | undefined, digits = 1): string => (
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "-"
);

const formatRate = (value: number | null | undefined): string => (
  typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "-"
);

const formatPValue = (value: number | null | undefined): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (value < 0.001) return "<0.001";
  return value.toFixed(3);
};

const roleLabel = (role: DgaConstellationCellRole): string => (
  role === "main" ? "main" : role === "supp" ? "supplementary" : "not drawn"
);

const MetricCard: React.FC<{ metric: DgaConstellationMetric; title: string }> = ({ metric, title }) => (
  <div style={cardStyle}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
      <strong style={{ color: "#0f172a", fontSize: 13 }}>{title}</strong>
      <span style={{ color: "#334155", fontSize: 12, fontWeight: 850 }}>
        {metric.hitCount}/{metric.possibleCells}
      </span>
    </div>
    <div style={{ marginTop: 6, color: "#0f172a", fontSize: 18, fontWeight: 900 }}>
      {metric.hitCount} hit{metric.hitCount === 1 ? "" : "s"}
    </div>
    <div style={{ ...mutedStyle, marginTop: 4 }}>
      Expected {formatNumber(metric.expectedHits)} from local number baseline {formatRate(metric.baselineRate)}.
    </div>
    <div style={{ ...mutedStyle, marginTop: 4 }}>
      Lift {metric.lift == null ? "-" : `${formatNumber(metric.lift, 2)}x`} · z {formatNumber(metric.zScore, 2)} · upper-tail p {formatPValue(metric.upperTailPValue)}
    </div>
    <div style={{ ...mutedStyle, marginTop: 4 }}>
      M {metric.mainHits} · S {metric.suppHits}
    </div>
  </div>
);

const cellStyle = (cell: DgaConstellationCell, centerDrawNumber: number, centerNumber: number): React.CSSProperties => {
  const palette = rolePalette[cell.role];
  const isCenter = cell.drawNumber === centerDrawNumber && cell.number === centerNumber;
  const isRising = cell.offsetDraw === cell.offsetNumber;
  const isFalling = cell.offsetDraw === -cell.offsetNumber;
  return {
    minWidth: 30,
    height: 28,
    border: isCenter
      ? "2px solid #0f172a"
      : isRising || isFalling
        ? "1px solid #64748b"
        : `1px solid ${palette.border}`,
    borderRadius: 6,
    background: palette.background,
    color: palette.color,
    fontSize: 11,
    fontWeight: 900,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontVariantNumeric: "tabular-nums",
    boxShadow: isCenter ? "0 0 0 2px rgba(15, 23, 42, 0.08)" : undefined,
  };
};

export const DGAConstellationDiagnosticPanel: React.FC<DGAConstellationDiagnosticPanelProps> = ({ history }) => {
  const latestDrawNumber = Math.max(1, history.filter((draw) => !draw.isSimulated).length);
  const [centerDrawNumber, setCenterDrawNumber] = useState(() => Math.max(1, latestDrawNumber));
  const [centerNumber, setCenterNumber] = useState(23);
  const [radius, setRadius] = useState(3);
  const [forwardHorizon, setForwardHorizon] = useState(3);

  const diagnostic = useMemo(
    () => buildDgaConstellationDiagnostic(history, {
      centerDrawNumber,
      centerNumber,
      forwardHorizon,
      radius,
    }),
    [centerDrawNumber, centerNumber, forwardHorizon, history, radius],
  );
  const activeRadiusSummary = diagnostic.radiusSummaries[diagnostic.radiusSummaries.length - 1];
  const matrixNumbers = diagnostic.matrixRows[0]?.cells.map((cell) => cell.number) ?? [];

  const useExample = (drawNumber: number, number: number) => {
    setCenterDrawNumber(Math.min(Math.max(drawNumber, 1), latestDrawNumber));
    setCenterNumber(number);
    setRadius(3);
  };

  return (
    <section style={panelStyle} aria-label="DGA constellation diagnostic">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <strong style={{ color: "#0f172a", fontSize: 15 }}>DGA constellation diagnostic</strong>
            <InfoHelp label="DGA constellation diagnostic help">
              This observe-only tool measures local diagonal clusters around a chosen DGA cell. It uses real chronological DGA draw labels and mains + supplementaries. The p-value is a binomial-style density diagnostic, not proof of prediction.
            </InfoHelp>
          </div>
          <div style={mutedStyle}>
            {diagnostic.historyScopeLabel}. Pick a centre cell, then compare exact diagonals and nearby orbit cells against local number baselines.
          </div>
        </div>
        <span style={{ border: "1px solid #cfe3f7", borderRadius: 999, padding: "2px 8px", background: "#eef6ff", color: "#155a8a", fontSize: 12, fontWeight: 850 }}>
          Observe-only
        </span>
      </div>

      <div style={controlsStyle}>
        <HigField label="Centre draw">
          <input
            type="number"
            min={1}
            max={latestDrawNumber}
            value={centerDrawNumber}
            onChange={(event) => setCenterDrawNumber(Number(event.target.value))}
          />
        </HigField>
        <HigField label="Centre number">
          <input
            type="number"
            min={1}
            max={45}
            value={centerNumber}
            onChange={(event) => setCenterNumber(Number(event.target.value))}
          />
        </HigField>
        <HigField label="Radius">
          <select value={radius} onChange={(event) => setRadius(Number(event.target.value))}>
            {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>r{value}</option>)}
          </select>
        </HigField>
        <HigField label="Forward horizon">
          <select value={forwardHorizon} onChange={(event) => setForwardHorizon(Number(event.target.value))}>
            {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} draw{value === 1 ? "" : "s"}</option>)}
          </select>
        </HigField>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <HigButton size="compact" variant="secondary" onClick={() => useExample(348, 17)} disabled={latestDrawNumber < 348}>
          Use D348 / N17
        </HigButton>
        <HigButton size="compact" variant="secondary" onClick={() => useExample(346, 43)} disabled={latestDrawNumber < 346}>
          Use D346 / N43
        </HigButton>
      </div>

      {diagnostic.warnings.length ? (
        <div style={{ ...cardStyle, borderColor: "#fed7aa", background: "#fff7ed", color: "#9a3412", fontSize: 12, fontWeight: 750 }}>
          {diagnostic.warnings.join(" ")}
        </div>
      ) : null}

      <div style={{ ...cardStyle, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ color: "#64748b", fontSize: 12, fontWeight: 850 }}>Centre cell</div>
          <div style={{ color: "#0f172a", fontSize: 20, fontWeight: 900 }}>
            D{diagnostic.centerDrawNumber} / N{diagnostic.centerNumber}
          </div>
          <div style={mutedStyle}>
            {diagnostic.centerCell.drawDate || "No date"} · {roleLabel(diagnostic.centerCell.role)}
          </div>
        </div>
        <div style={mutedStyle}>
          Global cell hit baseline: {formatRate(diagnostic.baselineRate)}. Expected-vs-observed cards use the historical baseline for only the numbers inside that measured shape.
        </div>
      </div>

      {activeRadiusSummary ? (
        <div style={metricGridStyle}>
          <MetricCard title={`Local window r${activeRadiusSummary.radius}`} metric={activeRadiusSummary.localWindow} />
          <MetricCard title={`Diagonal cross r${activeRadiusSummary.radius}`} metric={activeRadiusSummary.diagonalCross} />
          <MetricCard title={`Lead-in band r${activeRadiusSummary.radius}`} metric={activeRadiusSummary.leadIn} />
          <MetricCard title={`Follow-through band r${activeRadiusSummary.radius}`} metric={activeRadiusSummary.followThrough} />
        </div>
      ) : null}

      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}>
          <strong style={{ color: "#0f172a", fontSize: 13 }}>Mapped cells</strong>
          <span style={mutedStyle}>M = main · S = supplementary · bordered cells sit on one of the exact diagonals</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 4, fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ color: "#64748b", textAlign: "right", paddingRight: 6 }}>Number</th>
                {diagnostic.matrixRows.map((row) => (
                  <th
                    key={row.drawNumber}
                    title={`${row.drawDate} · D${row.drawNumber}`}
                    style={{ color: "#334155", fontWeight: 900, minWidth: 30 }}
                  >
                    D{row.drawNumber}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrixNumbers.map((number) => (
                <tr key={number}>
                  <th style={{ color: "#334155", textAlign: "right", paddingRight: 6, whiteSpace: "nowrap" }}>
                    {number}
                  </th>
                  {diagnostic.matrixRows.map((row) => {
                    const cell = row.cells.find((candidate) => candidate.number === number);
                    return cell ? (
                      <td key={`${cell.drawNumber}-${cell.number}`} title={`D${cell.drawNumber} · ${row.drawDate} · N${cell.number} · ${roleLabel(cell.role)}`}>
                        <span style={cellStyle(cell, diagnostic.centerDrawNumber, diagnostic.centerNumber)}>
                          {rolePalette[cell.role].label}
                        </span>
                      </td>
                    ) : (
                      <td key={`${row.drawNumber}-${number}`} />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {activeRadiusSummary ? (
        <div style={metricGridStyle}>
          <MetricCard title={`Rising diagonal r${activeRadiusSummary.radius}`} metric={activeRadiusSummary.risingDiagonal} />
          <MetricCard title={`Falling diagonal r${activeRadiusSummary.radius}`} metric={activeRadiusSummary.fallingDiagonal} />
        </div>
      ) : null}

      <div style={{ ...cardStyle, ...mutedStyle }}>
        <strong style={{ color: "#334155" }}>Truthfulness note:</strong>{" "}
        This panel measures density and shape in historical cells. It does not claim a constellation predicts the next draw. The next proof step is a no-lookahead replay that asks whether similar past constellations were followed by above-baseline nearby hits.
      </div>
    </section>
  );
};

export default DGAConstellationDiagnosticPanel;

import React, { useMemo, useState } from "react";

import {
  analyzeOddEvenRatioCadence,
  type OddEvenCadenceScope,
  type OddEvenRatioCadenceRow,
  type OddEvenRatioTimelineRow,
} from "../lib/oddEvenRatioCadence";
import type { Draw } from "../types";
import { HigField, InfoHelp } from "./shared/HigControls";

interface OddEvenRatioCadencePanelProps {
  draws: Draw[];
}

const RARE_THRESHOLD_OPTIONS = [1, 2, 3, 4, 5];
const RECENT_WINDOW_OPTIONS = [20, 50, 100, 200];

const formatMetric = (value: number | null): string => (
  value == null ? "-" : Number.isInteger(value) ? String(value) : value.toFixed(2)
);

const statusForRatio = (row: OddEvenRatioCadenceRow): string => {
  if (row.isNeverSeen) return "Never seen in this window";
  if (row.isRare) return "Rare in this window";
  return "Observed";
};

const rowTone = (row: OddEvenRatioCadenceRow, selected: boolean): React.CSSProperties => {
  if (selected) return { background: "#111827", color: "#fff" };
  if (row.isNeverSeen) return { background: "#f7f7f7", color: "#555" };
  if (row.isRare) return { background: "#fff7ed", color: "#7c2d12" };
  return {};
};

const ratioSortIndex = (ratios: OddEvenRatioCadenceRow[], ratio: string): number => (
  ratios.findIndex((row) => row.ratio === ratio)
);

const OddEvenCadenceTimeline: React.FC<{
  rows: OddEvenRatioCadenceRow[];
  timeline: OddEvenRatioTimelineRow[];
  selectedRatio: string;
  onSelectRatio: (ratio: string) => void;
}> = ({ rows, timeline, selectedRatio, onSelectRatio }) => {
  if (timeline.length === 0) {
    return <div style={mutedStyle}>No valid timeline rows to chart.</div>;
  }

  const width = 760;
  const rowHeight = 28;
  const margin = { top: 22, right: 24, bottom: 34, left: 58 };
  const chartW = width - margin.left - margin.right;
  const chartH = Math.max(1, (rows.length - 1) * rowHeight);
  const height = margin.top + chartH + margin.bottom;

  const xForIndex = (index: number): number => (
    margin.left + (index / Math.max(timeline.length - 1, 1)) * chartW
  );
  const yForRatio = (ratio: string): number => (
    margin.top + Math.max(0, ratioSortIndex(rows, ratio)) * rowHeight
  );

  return (
    <div style={{ width: "100%", overflowX: "auto" }} aria-label="Observed ratio timeline">
      <svg
        role="img"
        aria-label="Observed ratio timeline"
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", minWidth: 620, height: "auto", display: "block" }}
      >
        <rect
          x={margin.left}
          y={margin.top - 11}
          width={chartW}
          height={chartH + 22}
          fill="#fff"
          stroke="#d6d6d6"
        />

        {rows.map((row) => {
          const y = yForRatio(row.ratio);
          const selected = row.ratio === selectedRatio;
          return (
            <g key={`axis-${row.ratio}`}>
              <text
                role="button"
                tabIndex={0}
                aria-label={`Select ratio ${row.ratio}`}
                onClick={() => onSelectRatio(row.ratio)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectRatio(row.ratio);
                  }
                }}
                x={margin.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                fontWeight={selected ? 700 : 500}
                fill={selected ? "#111827" : row.isNeverSeen ? "#777" : row.isRare ? "#9a3412" : "#333"}
                style={{ cursor: "pointer" }}
              >
                {row.ratio}
              </text>
              <line
                x1={margin.left}
                x2={margin.left + chartW}
                y1={y}
                y2={y}
                stroke={selected ? "#111827" : row.isRare ? "#fed7aa" : "#ececec"}
                strokeDasharray={row.isRare ? "4 4" : undefined}
              />
              {row.isRare ? (
                <text x={margin.left + chartW + 6} y={y + 4} fontSize={9} fill="#9a3412">
                  {row.isNeverSeen ? "never" : "rare"}
                </text>
              ) : null}
            </g>
          );
        })}

        {timeline.map((row, index) => {
          const selected = row.ratio === selectedRatio;
          return (
            <circle
              key={`${row.drawIndex}-${row.ratio}`}
              cx={xForIndex(index)}
              cy={yForRatio(row.ratio)}
              r={selected ? 4 : 3}
              fill={selected ? "#111827" : "#2563eb"}
              stroke="#fff"
              strokeWidth={selected ? 1.5 : 1}
            >
              <title>{`${row.dateLabel}: ${row.ratio}`}</title>
            </circle>
          );
        })}

        <text x={margin.left} y={height - 8} fontSize={11} fill="#555">
          older
        </text>
        <text x={margin.left + chartW} y={height - 8} textAnchor="end" fontSize={11} fill="#555">
          newer
        </text>
      </svg>
    </div>
  );
};

export const OddEvenRatioCadencePanel: React.FC<OddEvenRatioCadencePanelProps> = ({ draws }) => {
  const [scope, setScope] = useState<OddEvenCadenceScope>("mains-plus-supps");
  const [recentWindow, setRecentWindow] = useState(50);
  const [rarePercentThreshold, setRarePercentThreshold] = useState(5);
  const [selectedRatio, setSelectedRatio] = useState<string | null>(null);

  const analysis = useMemo(
    () => analyzeOddEvenRatioCadence(draws, { scope, recentWindow, rarePercentThreshold }),
    [draws, scope, recentWindow, rarePercentThreshold],
  );

  const activeRatio = selectedRatio && analysis.ratios.some((row) => row.ratio === selectedRatio)
    ? selectedRatio
    : analysis.ratios.find((row) => row.count > 0)?.ratio ?? analysis.ratios[0]?.ratio ?? "";
  const selectedRow = analysis.ratios.find((row) => row.ratio === activeRatio);

  return (
    <section aria-label="Odd/Even Ratio Cadence" style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <p style={subtitleStyle}>
            Observed odd/even ratio cadence across the active draw window. Intervals describe history only; they are not calibrated predictions.
          </p>
        </div>
        <InfoHelp label="How Odd/Even Ratio Cadence works">
          This panel counts observed odd/even ratios and gaps between appearances. The expected percentage is an exact random-combination baseline, not a next-draw forecast.
        </InfoHelp>
      </div>

      <div style={controlsStyle}>
        <HigField label="Scope" help="Choose whether ratios use all 8 drawn numbers or mains only.">
          <select
            name="oddEvenCadenceScope"
            value={scope}
            onChange={(event) => {
              setScope(event.target.value as OddEvenCadenceScope);
              setSelectedRatio(null);
            }}
            style={selectStyle}
          >
            <option value="mains-plus-supps">Mains + supps (8)</option>
            <option value="mains">Mains only (6)</option>
          </select>
        </HigField>

        <HigField label="Recent window" help="Recent count is measured across this many valid draws, clamped to available history.">
          <select
            name="recentWindow"
            value={recentWindow}
            onChange={(event) => setRecentWindow(Number(event.target.value))}
            style={selectStyle}
          >
            {RECENT_WINDOW_OPTIONS.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </HigField>

        <HigField label="Rare threshold" help="A ratio is marked rare when its observed share is at or below this percentage, or when it has never appeared.">
          <select
            name="rarePercentThreshold"
            value={rarePercentThreshold}
            onChange={(event) => setRarePercentThreshold(Number(event.target.value))}
            style={selectStyle}
          >
            {RARE_THRESHOLD_OPTIONS.map((value) => (
              <option key={value} value={value}>{value}%</option>
            ))}
          </select>
        </HigField>
      </div>

      {draws.length === 0 ? (
        <div style={emptyStyle}>No active draw history available.</div>
      ) : analysis.validDraws === 0 ? (
        <div style={emptyStyle}>No valid draws for this scope.</div>
      ) : (
        <>
          <div style={summaryGridStyle}>
            <Metric label="Valid draws" value={String(analysis.validDraws)} />
            <Metric label="Skipped draws" value={String(analysis.skippedDraws)} />
            <Metric label="Scope size" value={String(analysis.totalNumbers)} />
            <Metric label="Rare threshold" value={`${analysis.rarePercentThreshold}%`} />
          </div>

          {selectedRow ? (
            <div style={detailStyle} aria-live="polite">
              <div style={{ fontWeight: 700 }}>Selected ratio {selectedRow.ratio}</div>
              <div style={detailGridStyle}>
                <span>{statusForRatio(selectedRow)}</span>
                <span>Count {selectedRow.count} ({selectedRow.percent.toFixed(2)}%)</span>
                <span>Expected {selectedRow.expectedPercent.toFixed(2)}%</span>
                <span>Current gap {selectedRow.currentGap}</span>
                <span>Median gap {formatMetric(selectedRow.medianGap)}</span>
                <span>Longest gap {formatMetric(selectedRow.longestGap)}</span>
                <span>{selectedRow.regularityLabel}</span>
              </div>
            </div>
          ) : null}

          <h4 style={sectionTitleStyle}>Observed ratio timeline</h4>
          <OddEvenCadenceTimeline
            rows={analysis.ratios}
            timeline={analysis.timeline}
            selectedRatio={activeRatio}
            onSelectRatio={setSelectedRatio}
          />

          <h4 style={sectionTitleStyle}>Diagnostics</h4>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Ratio</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Count</th>
                  <th style={thStyle}>Obs %</th>
                  <th style={thStyle}>Exp %</th>
                  <th style={thStyle}>Current gap</th>
                  <th style={thStyle}>Mean gap</th>
                  <th style={thStyle}>Median gap</th>
                  <th style={thStyle}>Longest gap</th>
                  <th style={thStyle}>Recent count</th>
                  <th style={thStyle}>Regularity</th>
                </tr>
              </thead>
              <tbody>
                {analysis.ratios.map((row) => {
                  const selected = row.ratio === activeRatio;
                  return (
                    <tr key={row.ratio} style={rowTone(row, selected)}>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          aria-label={`Select ratio ${row.ratio}`}
                          onClick={() => setSelectedRatio(row.ratio)}
                          style={{
                            ...ratioButtonStyle,
                            ...(selected ? selectedRatioButtonStyle : {}),
                          }}
                        >
                          {row.ratio}
                        </button>
                      </td>
                      <td style={tdStyle}>{statusForRatio(row)}</td>
                      <td style={tdNumberStyle}>{row.count}</td>
                      <td style={tdNumberStyle}>{row.percent.toFixed(2)}</td>
                      <td style={tdNumberStyle}>{row.expectedPercent.toFixed(2)}</td>
                      <td style={tdNumberStyle}>{row.currentGap}</td>
                      <td style={tdNumberStyle}>{formatMetric(row.meanGap)}</td>
                      <td style={tdNumberStyle}>{formatMetric(row.medianGap)}</td>
                      <td style={tdNumberStyle}>{formatMetric(row.longestGap)}</td>
                      <td style={tdNumberStyle}>{row.recentCount}</td>
                      <td style={tdStyle}>{row.regularityLabel}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {analysis.skippedDraws > 0 ? (
            <div style={mutedStyle}>
              Provenance: skipped {analysis.skippedDraws} draw{analysis.skippedDraws === 1 ? "" : "s"} with invalid unique counts for this scope.
            </div>
          ) : null}
        </>
      )}
    </section>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={metricStyle}>
    <div style={metricLabelStyle}>{label}</div>
    <div style={metricValueStyle}>{value}</div>
  </div>
);

const panelStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  fontFamily: "Helvetica, Arial, sans-serif",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  justifyContent: "space-between",
  alignItems: "flex-start",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  letterSpacing: 0,
};

const subtitleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#555",
  fontSize: 12,
  lineHeight: 1.45,
};

const controlsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "flex-start",
};

const selectStyle: React.CSSProperties = {
  minHeight: 34,
  border: "1px solid #c9c9c9",
  borderRadius: 6,
  padding: "4px 28px 4px 8px",
  background: "#fff",
  font: "inherit",
};

const emptyStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  background: "#fafafa",
  padding: 12,
  borderRadius: 6,
  color: "#555",
  fontSize: 13,
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 8,
};

const metricStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 6,
  padding: 8,
  background: "#fff",
};

const metricLabelStyle: React.CSSProperties = {
  color: "#666",
  fontSize: 11,
};

const metricValueStyle: React.CSSProperties = {
  color: "#111",
  fontSize: 17,
  fontWeight: 700,
  marginTop: 2,
};

const detailStyle: React.CSSProperties = {
  border: "1px solid #111827",
  borderRadius: 6,
  padding: 10,
  background: "#f9fafb",
  fontSize: 12,
};

const detailGridStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px 14px",
  marginTop: 6,
  color: "#333",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  letterSpacing: 0,
};

const mutedStyle: React.CSSProperties = {
  color: "#666",
  fontSize: 12,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "7px 8px",
  borderBottom: "1px solid #d7d7d7",
  whiteSpace: "nowrap",
  background: "#f5f5f5",
};

const tdStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #ececec",
  whiteSpace: "nowrap",
};

const tdNumberStyle: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const ratioButtonStyle: React.CSSProperties = {
  border: "1px solid #b8b8b8",
  borderRadius: 5,
  background: "#fff",
  color: "#111",
  minHeight: 28,
  padding: "3px 8px",
  fontWeight: 700,
  cursor: "pointer",
};

const selectedRatioButtonStyle: React.CSSProperties = {
  border: "1px solid #fff",
  background: "#fff",
  color: "#111827",
};

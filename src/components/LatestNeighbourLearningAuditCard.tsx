import React from "react";

import type { Draw } from "../types";
import {
  analyzeLatestNeighbourLearningAudit,
  LATEST_NEIGHBOUR_RANDOM_NUMBER_RATE,
  type LatestNeighbourAuditGateStatus,
  type LatestNeighbourModePreferenceStatus,
  type LatestNeighbourScreenGateStatus,
} from "../lib/latestNeighbourLearningAudit";
import type { LatestNeighbourSupportMode } from "../lib/latestNeighbourSupport";
import InlineCollapsibleCard from "./shared/InlineCollapsibleCard";

interface Props {
  history: Draw[];
  historyScopeLabel: string;
  liveMode: LatestNeighbourSupportMode;
  liveEnabled: boolean;
}

const CURRENT_GATE_LABELS: Record<LatestNeighbourAuditGateStatus, string> = {
  insufficient: "Learning",
  "no-validated-lift": "No validated lift",
  "validated-lift": "Validated lift",
};

const MODE_PREFERENCE_LABELS: Record<LatestNeighbourModePreferenceStatus, string> = {
  insufficient: "Learning",
  "no-validated-preference": "No validated preference",
  "prefer-pm1": "Evidence favours ±1",
  "prefer-pm1pm2": "Evidence favours ±1/±2",
};

const SCREEN_GATE_LABELS: Record<LatestNeighbourScreenGateStatus, string> = {
  insufficient: "Learning",
  "no-validated-effect": "Screen effect uncertain",
  "validated-help": "Screens show lift",
  "validated-harm": "Screens need review",
};

const modeLabel = (mode: LatestNeighbourSupportMode): string => (
  mode === "pm1pm2" ? "±1/±2" : "±1"
);

const LatestNeighbourLearningAuditCard: React.FC<Props> = ({
  history,
  historyScopeLabel,
  liveMode,
  liveEnabled,
}) => {
  const result = React.useMemo(
    () => analyzeLatestNeighbourLearningAudit(history, { currentMode: liveMode }),
    [history, liveMode],
  );
  const current = result.currentOutcomes.find((row) => row.mode === liveMode);
  const latestRows = [...result.records].reverse().slice(0, 48);

  return (
    <InlineCollapsibleCard
      id="latest-neighbour-learning-audit"
      title="Latest Draw ±1/±2 Learning & Self-Audit"
      subtitle="Exact live-screen replay; observe-only"
      collapsedSummary={`${result.modelVersion} · ${result.records.length} scored draws · ${CURRENT_GATE_LABELS[result.currentGate.status]}`}
      defaultExpanded={false}
      collapsedLabel="Review"
      expandedLabel="Hide"
    >
      <div style={contentStyle}>
        <div role="status" style={truthBannerStyle}>
          <strong>{result.modelVersion} audits the rule Windfall actually uses.</strong>
          Each historical next draw is hidden while the latest-draw neighbour cloud and its fixed streak, drought, month-bucket and terminal-family screens are rebuilt from earlier draws only. This card does not switch the live mode, change generation, or treat its scores as probabilities.
        </div>

        <div style={scopeStyle}>
          <span>{historyScopeLabel}</span>
          <span>{result.validHistoryDraws} valid scheduled real draws</span>
          <span>Warm-up {result.minHistory}</span>
          {result.excludedHistoryRows > 0 ? <span>{result.excludedHistoryRows} invalid, duplicate, off-schedule, or simulated row{result.excludedHistoryRows === 1 ? "" : "s"} excluded</span> : null}
        </div>

        <div style={metricGridStyle}>
          <Metric label="Scored targets" value={String(result.records.length)} detail="strict walk-forward rows" />
          <Metric label="Live control" value={`${liveEnabled ? "On" : "Off"} · ${modeLabel(liveMode)}`} detail="read from Candidate Generation Setup" compact />
          <Metric label="Current-mode verdict" value={CURRENT_GATE_LABELS[result.currentGate.status]} detail="against equal-size random expectation" compact />
          <Metric label="Mode comparison" value={MODE_PREFERENCE_LABELS[result.modePreference.status]} detail="manual control remains unchanged" compact />
          <Metric label="Eligibility screens" value={SCREEN_GATE_LABELS[result.screenGate.status]} detail="screened vs raw neighbour cloud" compact />
        </div>

        <section aria-labelledby="latest-neighbour-current-title" style={sectionStyle}>
          <div id="latest-neighbour-current-title" style={sectionHeaderStyle}>
            <span>Current history-only target read</span>
            <span style={sectionMetaStyle}>
              {current ? `${current.targetDrawDate} · D${current.targetDrawOrdinal}/${current.targetMonthExpectedDrawCount}` : "No target"}
            </span>
          </div>
          {current ? (
            <div style={currentGridStyle}>
              <NumberList
                label={`${modeLabel(liveMode)} eligible (${current.targetNumbers.length})`}
                numbers={current.targetNumbers}
                tone="eligible"
              />
              <NumberList
                label={`Screened out (${current.disqualifiedNumbers.length})`}
                numbers={current.disqualifiedNumbers}
                tone="screened"
              />
            </div>
          ) : (
            <div style={emptyStyle}>No valid real draw is available for a current target read.</div>
          )}
          <div style={finePrintStyle}>
            Current targets mirror the fixed history-based screens but deliberately omit temporary user exclusions, because those settings cannot be reconstructed truthfully for past draws.
          </div>
        </section>

        <section aria-labelledby="latest-neighbour-mode-table-title" style={sectionStyle}>
          <div id="latest-neighbour-mode-table-title" style={sectionHeaderStyle}>Walk-forward mode comparison</div>
          <div style={tableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={thLeftStyle}>Mode</th>
                  <th style={thStyle}>Trials</th>
                  <th style={thStyle}>Avg targets</th>
                  <th style={thStyle}>Avg hits</th>
                  <th style={thStyle}>Random expected</th>
                  <th style={thStyle}>Excess</th>
                  <th style={thStyle}>Target hit rate</th>
                  <th style={thStyle}>Any hit</th>
                  <th style={thStyle}>Expected any hit</th>
                  <th style={thStyle}>Avg screened out</th>
                </tr>
              </thead>
              <tbody>
                {result.summaries.map((summary) => (
                  <tr key={summary.mode}>
                    <td style={tdLeftStyle}>
                      <strong>{summary.label}</strong>
                      {summary.mode === liveMode ? <span style={livePillStyle}>live selection</span> : null}
                    </td>
                    <td style={tdStyle}>{summary.trials}{summary.inactiveDraws ? ` (+${summary.inactiveDraws} inactive)` : ""}</td>
                    <td style={tdStyle}>{formatNumber(summary.averageTargetCount)}</td>
                    <td style={tdStyle}>{formatNumber(summary.averageHits)}</td>
                    <td style={tdStyle}>{formatNumber(summary.averageExpectedHits)}</td>
                    <td style={tdStyle}>{formatSigned(summary.averageExcessHits)}</td>
                    <td style={tdStyle}>{formatPercent(summary.targetHitRate)}</td>
                    <td style={tdStyle}>{formatPercent(summary.anyHitRate)}</td>
                    <td style={tdStyle}>{formatPercent(summary.averageExpectedAnyHitRate)}</td>
                    <td style={tdStyle}>{formatNumber(summary.averageScreenedOut)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={randomTdStyle}><strong>Equal-size random</strong></td>
                  <td style={tdStyle}>reference</td>
                  <td style={tdStyle}>same as row</td>
                  <td style={tdStyle}>varies with target count</td>
                  <td style={tdStyle}>shown above</td>
                  <td style={tdStyle}>0.00</td>
                  <td style={tdStyle}>{formatPercent(LATEST_NEIGHBOUR_RANDOM_NUMBER_RATE)}</td>
                  <td style={tdStyle}>exact hypergeometric</td>
                  <td style={tdStyle}>shown above</td>
                  <td style={tdStyle}>n/a</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={finePrintStyle}>
            Larger target clouds naturally collect more hits. Windfall therefore compares each row with the exact expectation for a random set of the same size. <strong>Excess</strong> is observed hits minus that fair-size expectation.
          </div>
        </section>

        <section aria-labelledby="latest-neighbour-gates-title" style={sectionStyle}>
          <div id="latest-neighbour-gates-title" style={sectionHeaderStyle}>Conservative evidence gates</div>
          <div style={gateGridStyle}>
            <GateCard
              title={`${modeLabel(liveMode)} vs random`}
              status={CURRENT_GATE_LABELS[result.currentGate.status]}
              value={`${formatSigned(result.currentGate.averageExcessHits)} hits/draw`}
              interval={result.currentGate.excessHitsCi}
              reason={result.currentGate.reason}
            />
            <GateCard
              title="±1/±2 minus ±1"
              status={MODE_PREFERENCE_LABELS[result.modePreference.status]}
              value={`${formatSigned(result.modePreference.averageDifference)} excess hits/draw`}
              interval={result.modePreference.differenceCi}
              reason={result.modePreference.reason}
            />
            <GateCard
              title={`${modeLabel(liveMode)} screens vs raw cloud`}
              status={SCREEN_GATE_LABELS[result.screenGate.status]}
              value={`${formatSigned(result.screenGate.averageEffect)} excess hits/draw`}
              interval={result.screenGate.effectCi}
              reason={result.screenGate.reason}
            />
          </div>
          <div style={finePrintStyle}>
            A positive sample average alone is not enough. Gates require at least 60 targets and a serial-adjusted approximate 95% interval that excludes no effect; mode lift must also clear per-target and at-least-one random references. Results update when another real draw is loaded, but Windfall never rewrites the rule automatically.
          </div>
        </section>

        <section aria-labelledby="latest-neighbour-ledger-title" style={sectionStyle}>
          <div id="latest-neighbour-ledger-title" style={sectionHeaderStyle}>
            <span>Versioned walk-forward ledger</span>
            <span style={sectionMetaStyle}>latest {latestRows.length} of {result.records.length}</span>
          </div>
          <div style={ledgerScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 1040 }}>
              <thead>
                <tr>
                  <th style={thLeftStyle}>Target</th>
                  <th style={thStyle}>Stage</th>
                  <th style={thStyle}>Prior draws</th>
                  <th style={thLeftStyle}>±1 hits / targets</th>
                  <th style={thStyle}>Expected</th>
                  <th style={thLeftStyle}>±1/±2 hits / targets</th>
                  <th style={thStyle}>Expected</th>
                  <th style={thStyle}>Screened out</th>
                </tr>
              </thead>
              <tbody>
                {latestRows.length ? latestRows.map((record) => (
                  <tr key={`${record.targetDate}-${record.trainingDraws}`}>
                    <td style={tdLeftStyle}>{record.targetDate}</td>
                    <td style={tdStyle}>D{record.targetDrawOrdinal}/{record.targetMonthExpectedDrawCount}</td>
                    <td style={tdStyle}>{record.trainingDraws}</td>
                    <td style={tdLeftStyle}>{formatHits(record.pm1.hitNumbers)} / {record.pm1.targetCount}</td>
                    <td style={tdStyle}>{formatNumber(record.pm1.expectedHits)}</td>
                    <td style={tdLeftStyle}>{formatHits(record.pm1pm2.hitNumbers)} / {record.pm1pm2.targetCount}</td>
                    <td style={tdStyle}>{formatNumber(record.pm1pm2.expectedHits)}</td>
                    <td style={tdStyle}>{record.pm1.screenedOutCount} / {record.pm1pm2.screenedOutCount}</td>
                  </tr>
                )) : (
                  <tr><td style={tdLeftStyle} colSpan={8}>Not enough valid history has accumulated beyond the warm-up.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={finePrintStyle}>{result.antiLookaheadNote}</div>
        </section>
      </div>
    </InlineCollapsibleCard>
  );
};

const Metric: React.FC<{ label: string; value: string; detail: string; compact?: boolean }> = ({ label, value, detail, compact }) => (
  <div style={metricStyle}>
    <div style={metricLabelStyle}>{label}</div>
    <div style={{ ...metricValueStyle, fontSize: compact ? 15 : 22 }}>{value}</div>
    <div style={finePrintStyle}>{detail}</div>
  </div>
);

const NumberList: React.FC<{ label: string; numbers: number[]; tone: "eligible" | "screened" }> = ({ label, numbers, tone }) => (
  <div>
    <div style={metricLabelStyle}>{label}</div>
    <div style={numberWrapStyle}>
      {numbers.length ? numbers.map((number) => (
        <span key={number} style={numberPillStyle(tone)}>{number}</span>
      )) : <span style={emptyInlineStyle}>None</span>}
    </div>
  </div>
);

const GateCard: React.FC<{
  title: string;
  status: string;
  value: string;
  interval: [number, number] | null;
  reason: string;
}> = ({ title, status, value, interval, reason }) => (
  <div style={gateStyle}>
    <div style={decisionHeaderStyle}><span>{title}</span><span>{status}</span></div>
    <div style={gateValueStyle}>{value}</div>
    <div style={finePrintStyle}>Serial-adjusted approximate 95% interval: {formatInterval(interval)}</div>
    <div style={finePrintStyle}>{reason}</div>
  </div>
);

const formatNumber = (value: number, digits = 2): string => value.toFixed(digits);
const formatSigned = (value: number, digits = 2): string => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const formatInterval = (interval: [number, number] | null): string => (
  interval ? `${formatSigned(interval[0])} to ${formatSigned(interval[1])}` : "not enough rows"
);
const formatHits = (numbers: number[]): string => numbers.length ? `${numbers.length} [${numbers.join(", ")}]` : "0 [none]";

const contentStyle: React.CSSProperties = { display: "grid", gap: 12 };
const truthBannerStyle: React.CSSProperties = {
  border: "1px solid #bfdbfe",
  borderRadius: 8,
  background: "#eff6ff",
  color: "#1e3a8a",
  padding: 10,
  fontSize: 12,
  lineHeight: 1.5,
  display: "grid",
  gap: 3,
};
const scopeStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 7, fontSize: 11, color: "#475569" };
const metricGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 };
const metricStyle: React.CSSProperties = { border: "1px solid #dfe5ee", borderRadius: 8, background: "#fff", padding: 10, minWidth: 0 };
const metricLabelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 850, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 };
const metricValueStyle: React.CSSProperties = { fontWeight: 900, color: "#111827", marginTop: 2, overflowWrap: "anywhere" };
const finePrintStyle: React.CSSProperties = { fontSize: 11, lineHeight: 1.4, color: "#64748b", marginTop: 4 };
const sectionStyle: React.CSSProperties = { border: "1px solid #dfe5ee", borderRadius: 8, background: "#fff", padding: 10, display: "grid", gap: 8 };
const sectionHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", fontSize: 12, fontWeight: 900, color: "#26313d" };
const sectionMetaStyle: React.CSSProperties = { color: "#64748b", fontWeight: 700, fontSize: 11 };
const currentGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 };
const numberWrapStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 };
const numberPillStyle = (tone: "eligible" | "screened"): React.CSSProperties => ({
  minWidth: 28,
  minHeight: 26,
  display: "inline-flex",
  justifyContent: "center",
  alignItems: "center",
  borderRadius: 999,
  border: `1px solid ${tone === "eligible" ? "#93c5fd" : "#cbd5e1"}`,
  background: tone === "eligible" ? "#eff6ff" : "#f8fafc",
  color: tone === "eligible" ? "#1d4ed8" : "#64748b",
  fontSize: 12,
  fontWeight: 850,
});
const emptyInlineStyle: React.CSSProperties = { color: "#64748b", fontSize: 12 };
const emptyStyle: React.CSSProperties = { border: "1px dashed #cbd5e1", borderRadius: 8, padding: 10, fontSize: 12, color: "#64748b" };
const tableScrollStyle: React.CSSProperties = { overflowX: "auto", border: "1px solid #edf0f5", borderRadius: 8 };
const ledgerScrollStyle: React.CSSProperties = { ...tableScrollStyle, maxHeight: 360, overflowY: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 11 };
const thBaseStyle: React.CSSProperties = { padding: "7px 8px", borderBottom: "1px solid #d8dee8", color: "#475569", background: "#f8fafc", position: "sticky", top: 0, zIndex: 1, whiteSpace: "nowrap" };
const thStyle: React.CSSProperties = { ...thBaseStyle, textAlign: "right" };
const thLeftStyle: React.CSSProperties = { ...thBaseStyle, textAlign: "left" };
const tdBaseStyle: React.CSSProperties = { padding: "7px 8px", borderBottom: "1px solid #edf0f5", fontVariantNumeric: "tabular-nums", verticalAlign: "top" };
const tdStyle: React.CSSProperties = { ...tdBaseStyle, textAlign: "right" };
const tdLeftStyle: React.CSSProperties = { ...tdBaseStyle, textAlign: "left" };
const randomTdStyle: React.CSSProperties = { ...tdLeftStyle, background: "#f8fafc" };
const livePillStyle: React.CSSProperties = { display: "inline-flex", marginLeft: 6, borderRadius: 999, padding: "2px 6px", border: "1px solid #93c5fd", background: "#eff6ff", color: "#1d4ed8", fontSize: 9, fontWeight: 900, textTransform: "uppercase" };
const gateGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 8 };
const gateStyle: React.CSSProperties = { border: "1px solid #cbd5e1", borderRadius: 8, background: "#f8fafc", padding: 10 };
const decisionHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", fontSize: 11, fontWeight: 900, color: "#334155" };
const gateValueStyle: React.CSSProperties = { fontSize: 18, fontWeight: 900, color: "#111827", marginTop: 4, fontVariantNumeric: "tabular-nums" };

export default LatestNeighbourLearningAuditCard;

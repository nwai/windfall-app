import React from "react";
import type { Draw } from "../types";
import {
  analyzeDroughtLearningAudit,
  type DroughtLearningAuditRecord,
  type DroughtLearningGateStatus,
} from "../lib/droughtLearningAudit";
import InlineCollapsibleCard from "./shared/InlineCollapsibleCard";

interface Props {
  history: Draw[];
  historyScopeLabel?: string;
  threshold: number;
  topK: number;
  targetMonthLabel: string;
  targetDrawOrdinal: number;
  targetMonthExpectedDrawCount: number;
}

const GATE_LABELS: Record<DroughtLearningGateStatus, string> = {
  insufficient: "Learning",
  "retain-champion": "Retain strict champion",
  "watch-challenger": "Watch challenger",
  "promote-challenger": "Challenger clears gate",
};

export const DroughtLearningAuditPanel: React.FC<Props> = ({
  history,
  historyScopeLabel,
  threshold,
  topK,
  targetMonthLabel,
  targetDrawOrdinal,
  targetMonthExpectedDrawCount,
}) => {
  const result = React.useMemo(() => analyzeDroughtLearningAudit(history, {
    threshold,
    topK,
    targetMonthLabel,
    targetDrawOrdinal,
    targetMonthExpectedDrawCount,
  }), [history, targetDrawOrdinal, targetMonthExpectedDrawCount, targetMonthLabel, threshold, topK]);

  const gateLabel = GATE_LABELS[result.gate.status];
  const currentRows = result.currentRankedNumbers.slice(0, result.topK);
  const latestRecords = [...result.records].reverse().slice(0, 60);
  const changedNumbers = result.currentChallenger.filter((number, index) => result.currentChampion[index] !== number).length;

  return (
    <InlineCollapsibleCard
      id="drought-learning-self-audit"
      title="Drought Learning & Self-Audit"
      subtitle="Versioned walk-forward challenger; observe-only"
      collapsedSummary={`${result.modelVersion} · ${result.records.length} scored draws · ${gateLabel}`}
      defaultExpanded={false}
      collapsedLabel="Review"
      expandedLabel="Hide"
    >
      <div style={contentStyle}>
        <div role="status" style={truthBannerStyle}>
          <strong>{result.modelVersion} is not self-aware and does not modify application code.</strong>
          It updates fixed evidence counters after each real draw, audits its prior ranking, and can change only its observe-only champion/challenger recommendation. It does not affect candidate generation, forced selections, or drought shortlist rank.
        </div>

        <div style={scopeStyle}>
          <span>{historyScopeLabel ?? `${result.validHistoryDraws} real draws`}</span>
          <span>{result.scope} · strict threshold {result.threshold}+ · top {result.topK}</span>
          <span>Current target {result.targetMonthExpectedDrawCount}D D{result.targetDrawOrdinal}</span>
          {result.excludedHistoryRows > 0 ? <span>{result.excludedHistoryRows} invalid/duplicate row{result.excludedHistoryRows === 1 ? "" : "s"} excluded</span> : null}
        </div>

        <div style={metricGridStyle}>
          <Metric label="Scored draws" value={String(result.records.length)} detail={`after ${result.minHistory} prior draws`} />
          <Metric label="Strict champion" value={formatDecimal(result.championAverageHits)} detail={`hits/draw · random ${formatDecimal(result.expectedRandomAverageHits)}`} />
          <Metric label="State challenger" value={formatDecimal(result.challengerAverageHits)} detail={`hits/draw · ${signedDecimal(result.challengerAverageHits - result.championAverageHits)} vs champion`} />
          <Metric label="Historical policy" value={formatDecimal(result.policyAverageHits)} detail="model selected before each draw" />
          <Metric label="Challenger Brier" value={formatNullable(result.challengerBrierScore, 3)} detail={`neutral ${formatNullable(result.neutralBrierScore, 3)} · lower is better`} />
          <Metric label="Current decision" value={gateLabel} detail={`${result.gate.trials} paired draws`} compact />
        </div>

        <div style={decisionStyle(result.gate.status)}>
          <div style={decisionHeadingStyle}>
            <span>{gateLabel}</span>
            <span>{formatSignedHits(result.gate.averagePairedDifference)} hits/draw</span>
          </div>
          <div style={finePrintStyle}>{result.gate.reason}</div>
          <div style={finePrintStyle}>
            Paired 95% interval: {formatCi(result.gate.pairedDifferenceCi)}. A promotion requires at least 60 earlier scored draws, an interval wholly above zero, and challenger performance above equal-size random expectation. The gate can later reverse if new real outcomes weaken the evidence.
          </div>
        </div>

        <section aria-labelledby="drought-learning-current-title" style={sectionStyle}>
          <div id="drought-learning-current-title" style={sectionHeaderStyle}>
            <span>Current learned ordering</span>
            <span style={sectionHeaderMetaStyle}>{changedNumbers} top-row position{changedNumbers === 1 ? "" : "s"} differ from strict ordering</span>
          </div>
          <div style={tableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 930 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Learned</th>
                  <th style={thStyle}>Strict</th>
                  <th style={thStyle}>#</th>
                  <th style={thLeftStyle}>Month bucket</th>
                  <th style={thStyle}>Drought</th>
                  <th style={thStyle}>Smoothed historical rate</th>
                  <th style={thStyle}>Exact trials</th>
                  <th style={thStyle}>Stage trials</th>
                  <th style={thStyle}>Base trials</th>
                  <th style={thLeftStyle}>Evidence size</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.length ? currentRows.map((row) => (
                  <tr key={row.number}>
                    <td style={tdStyle}>{row.learnedRank}</td>
                    <td style={tdStyle}>{row.strictRank}</td>
                    <td style={numberTdStyle}>{row.number}</td>
                    <td style={tdLeftStyle}>{row.bucketLabel}</td>
                    <td style={tdStyle}>k{row.currentDrought}</td>
                    <td style={tdStyle}>{formatPercent(row.learnedRate)}</td>
                    <td style={tdStyle}>{row.exactTrials}</td>
                    <td style={tdStyle}>{row.coarseTrials}</td>
                    <td style={tdStyle}>{row.baseTrials}</td>
                    <td style={tdLeftStyle}>{row.sample}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={10} style={emptyTdStyle}>No numbers currently meet the strict {result.threshold}+ drought threshold.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={finePrintStyle}>
            The rate is a baseline-shrunk historical state estimate, not a calibrated next-draw probability. Inputs are expected month length, draw-stage band, monthly bucket, and drought-length band. Exact rate ties retain the existing strict order as a deterministic tie-break only. <strong>Episodes 6+ is deliberately excluded from {result.modelVersion}'s learned rate</strong> so the first challenger does not double-count completed-drought evidence.
          </div>
        </section>

        <section aria-labelledby="drought-learning-calibration-title" style={sectionStyle}>
          <div id="drought-learning-calibration-title" style={sectionHeaderStyle}>Challenger calibration</div>
          <div style={tableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 690 }}>
              <thead>
                <tr>
                  <th style={thLeftStyle}>Rate band</th>
                  <th style={thStyle}>Number-state trials</th>
                  <th style={thStyle}>Hits</th>
                  <th style={thStyle}>Average estimated rate</th>
                  <th style={thStyle}>Observed rate</th>
                  <th style={thStyle}>Brier</th>
                </tr>
              </thead>
              <tbody>
                {result.calibrationRows.map((row) => (
                  <tr key={row.label}>
                    <td style={tdLeftStyle}>{row.label}</td>
                    <td style={tdStyle}>{row.trials}</td>
                    <td style={tdStyle}>{row.hits}</td>
                    <td style={tdStyle}>{row.trials ? formatPercent(row.averageLearnedRate) : "n/a"}</td>
                    <td style={tdStyle}>{row.trials ? formatPercent(row.observedRate) : "n/a"}</td>
                    <td style={tdStyle}>{row.trials ? row.brierScore.toFixed(3) : "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={finePrintStyle}>
            Calibration rows contain selected challenger number-states, not independent lottery draws. Promotion is therefore decided from paired draw-level hit differences above, not by treating every number-state as an independent trial.
          </div>
        </section>

        <section aria-labelledby="drought-learning-ledger-title" style={sectionStyle}>
          <div id="drought-learning-ledger-title" style={sectionHeaderStyle}>
            <span>Versioned walk-forward ledger</span>
            <span style={sectionHeaderMetaStyle}>latest {latestRecords.length} of {result.records.length}</span>
          </div>
          <div style={ledgerScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 1120 }}>
              <thead>
                <tr>
                  <th style={thLeftStyle}>Target</th>
                  <th style={thStyle}>Context</th>
                  <th style={thStyle}>Prior draws</th>
                  <th style={thLeftStyle}>Policy before draw</th>
                  <th style={thLeftStyle}>Strict champion</th>
                  <th style={thLeftStyle}>Champion hits</th>
                  <th style={thLeftStyle}>State challenger</th>
                  <th style={thLeftStyle}>Challenger hits</th>
                </tr>
              </thead>
              <tbody>
                {latestRecords.map((record) => <LedgerRow key={`${record.targetDate}-${record.trainingDraws}`} record={record} />)}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </InlineCollapsibleCard>
  );
};

const Metric: React.FC<{ label: string; value: string; detail: string; compact?: boolean }> = ({ label, value, detail, compact }) => (
  <div style={metricStyle}>
    <div style={metricLabelStyle}>{label}</div>
    <div style={{ ...metricValueStyle, fontSize: compact ? 16 : 22 }}>{value}</div>
    <div style={finePrintStyle}>{detail}</div>
  </div>
);

const LedgerRow: React.FC<{ record: DroughtLearningAuditRecord }> = ({ record }) => (
  <tr>
    <td style={tdLeftStyle}>{record.targetDate}</td>
    <td style={tdStyle}>{record.targetMonthExpectedDrawCount}D D{record.targetDrawOrdinal}</td>
    <td style={tdStyle}>{record.trainingDraws}</td>
    <td style={tdLeftStyle}>{record.policyModelBeforeDraw} · {GATE_LABELS[record.gateStatusBeforeDraw]}</td>
    <td style={tdLeftStyle}>{formatNumbers(record.championNumbers)}</td>
    <td style={tdLeftStyle}>{formatNumbers(record.championHits)}</td>
    <td style={tdLeftStyle}>{formatNumbers(record.challengerNumbers)}</td>
    <td style={tdLeftStyle}>{formatNumbers(record.challengerHits)}</td>
  </tr>
);

const formatNumbers = (numbers: readonly number[]): string => numbers.length ? numbers.join(", ") : "none";
const formatDecimal = (value: number): string => value.toFixed(2);
const signedDecimal = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const formatNullable = (value: number | null, digits: number): string => value == null ? "n/a" : value.toFixed(digits);
const formatSignedHits = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
const formatCi = (ci: [number, number] | null): string => ci
  ? `${formatSignedHits(ci[0])} to ${formatSignedHits(ci[1])} hits/draw`
  : "not available";

const contentStyle: React.CSSProperties = { display: "grid", gap: 12 };
const truthBannerStyle: React.CSSProperties = { display: "grid", gap: 3, padding: "10px 12px", border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff", color: "#1e3a5f", fontSize: 12, lineHeight: 1.45 };
const scopeStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "6px 14px", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", color: "#475569", fontSize: 12, fontWeight: 750 };
const metricGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 };
const metricStyle: React.CSSProperties = { minHeight: 88, padding: 10, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" };
const metricLabelStyle: React.CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 850, textTransform: "uppercase" };
const metricValueStyle: React.CSSProperties = { marginTop: 4, color: "#0f172a", fontWeight: 900, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" };
const decisionStyle = (status: DroughtLearningGateStatus): React.CSSProperties => ({ padding: "10px 12px", border: `1px solid ${status === "promote-challenger" ? "#93c5fd" : "#dbe4ee"}`, borderRadius: 8, background: status === "promote-challenger" ? "#eff6ff" : "#fbfdff", display: "grid", gap: 5 });
const decisionHeadingStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", color: "#0f172a", fontSize: 13, fontWeight: 900 };
const sectionStyle: React.CSSProperties = { border: "1px solid #dbe4ee", borderRadius: 8, overflow: "hidden", background: "#fff" };
const sectionHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "8px 10px", borderBottom: "1px solid #dbe4ee", background: "#f8fafc", color: "#334155", fontSize: 12, fontWeight: 900 };
const sectionHeaderMetaStyle: React.CSSProperties = { color: "#64748b", fontWeight: 700 };
const tableScrollStyle: React.CSSProperties = { overflowX: "auto" };
const ledgerScrollStyle: React.CSSProperties = { overflow: "auto", maxHeight: 390 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const thStyle: React.CSSProperties = { position: "sticky", top: 0, zIndex: 1, padding: "7px 8px", borderBottom: "1px solid #dbe4ee", background: "#f8fafc", color: "#334155", textAlign: "right", fontWeight: 850, whiteSpace: "nowrap" };
const thLeftStyle: React.CSSProperties = { ...thStyle, textAlign: "left" };
const tdStyle: React.CSSProperties = { padding: "7px 8px", borderBottom: "1px solid #eef2f7", color: "#334155", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
const tdLeftStyle: React.CSSProperties = { ...tdStyle, textAlign: "left" };
const numberTdStyle: React.CSSProperties = { ...tdStyle, color: "#174ea6", fontWeight: 900 };
const emptyTdStyle: React.CSSProperties = { ...tdLeftStyle, padding: 12, color: "#64748b" };
const finePrintStyle: React.CSSProperties = { padding: "7px 10px", color: "#64748b", fontSize: 11, lineHeight: 1.45 };

export default DroughtLearningAuditPanel;

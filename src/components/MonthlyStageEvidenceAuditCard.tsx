import React from "react";

import type { Draw } from "../types";
import {
  analyzeMonthlyStageEvidence,
  type MonthlyStageEvidenceGateStatus,
} from "../lib/monthlyStageEvidenceAudit";
import InlineCollapsibleCard from "./shared/InlineCollapsibleCard";

interface MonthlyStageEvidenceAuditCardProps {
  history: Draw[];
}

const GATE_LABELS: Record<MonthlyStageEvidenceGateStatus, string> = {
  insufficient: "Learning",
  "stage-supported": "Stage evidence clears gate",
  "bucket-supported": "Bucket-only evidence clears gate",
  "watch-evidence": "Watch learned evidence",
  "no-validated-lift": "No validated learned lift",
};

const formatNumber = (value: number | null, digits = 3): string => (
  value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(digits)
);

const formatSigned = (value: number, digits = 4): string => (
  `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`
);

const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;

const formatCi = (ci: [number, number] | null): string => (
  ci ? `${formatSigned(ci[0])} to ${formatSigned(ci[1])}` : "not available"
);

const formatMix = (mix: readonly number[] | null): string => {
  if (!mix) return "n/a";
  const labels = ["U", "1x", "2x", "3x", "4x", "5x", "6x", "7x", "8x+"];
  const populated = mix
    .map((count, index) => ({ count, label: labels[index] }))
    .filter((row) => row.count > 0)
    .map((row) => `${row.label}:${row.count}`);
  return populated.length ? populated.join(" · ") : "none";
};

const Metric: React.FC<{ label: string; value: string; detail: string }> = ({ label, value, detail }) => (
  <div style={metricStyle}>
    <div style={metricLabelStyle}>{label}</div>
    <div style={metricValueStyle}>{value}</div>
    <div style={finePrintStyle}>{detail}</div>
  </div>
);

export const MonthlyStageEvidenceAuditCard: React.FC<MonthlyStageEvidenceAuditCardProps> = ({ history }) => {
  const result = React.useMemo(() => analyzeMonthlyStageEvidence(history), [history]);
  const gateLabel = GATE_LABELS[result.gate.status];
  const latestRows = [...result.records].reverse().slice(0, 60);
  const current = result.currentState;

  return (
    <InlineCollapsibleCard
      id="monthly-stage-evidence-learning-audit"
      title="Monthly Stage Evidence Learning & Self-Audit"
      subtitle="Shared, versioned month-stage evidence; observe-only"
      collapsedSummary={`${result.modelVersion} · ${result.records.length} scored draws · ${gateLabel}`}
      defaultExpanded={false}
      collapsedLabel="Review"
      expandedLabel="Hide"
    >
      <div style={contentStyle}>
        <div role="status" style={truthBannerStyle}>
          <strong>{result.modelVersion} learns only from earlier real draws.</strong>
          For every historical target, Windfall freezes the information available beforehand, predicts the eight bucket origins, scores the real result, and only then updates its counters. It does not rewrite code or alter Stage IDM, Acceptance Needs, Survival, or candidate generation.
          The Transition Lab's Number scope and Month-length evidence controls do not alter this fixed audit specification.
        </div>

        <div style={scopeStyle}>
          <span>{result.scopeLabel}</span>
          <span>{result.baselineRealDraws} baseline draws · {result.validRealDraws} valid real draws</span>
          <span>Uniform per-number control {formatPercent(8 / 45)}</span>
          {result.simulatedRowsIgnored > 0 ? <span>{result.simulatedRowsIgnored} simulated row{result.simulatedRowsIgnored === 1 ? "" : "s"} ignored</span> : null}
        </div>

        <div style={metricGridStyle}>
          <Metric label="Scored draws" value={String(result.records.length)} detail={`after ${result.minPriorDraws} earlier draws`} />
          <Metric label="Learned Brier" value={formatNumber(result.learnedAverageBrier)} detail="stage + month length · lower is better" />
          <Metric label="Bucket-only Brier" value={formatNumber(result.bucketBaselineAverageBrier)} detail={`uniform ${formatNumber(result.uniformAverageBrier)}`} />
          <Metric label="Learned mix overlap" value={formatNumber(result.learnedAverageOverlap, 2)} detail={`of 8 slots · bucket-only ${formatNumber(result.bucketBaselineAverageOverlap, 2)}`} />
          <Metric label="Stage IDM overlap" value={formatNumber(result.stageIdmAverageOverlap, 2)} detail="descriptive recipe scored against actual origins" />
          <Metric label="Current audit decision" value={gateLabel} detail={`${result.gate.scoredMonths} scored months`} />
        </div>

        <div style={decisionStyle(result.gate.status)}>
          <div style={decisionHeadingStyle}>
            <span>{gateLabel}</span>
            <span>{formatSigned(result.gate.averageBrierImprovement)} Brier improvement</span>
          </div>
          <div style={finePrintInsetStyle}>{result.gate.reason}</div>
          <div style={finePrintInsetStyle}>
            Stage vs bucket-only 95% interval: {formatCi(result.gate.monthClusteredCi)}. Learned stage vs exact control: {formatSigned(result.gate.averageLearnedVsUniformImprovement)} ({formatCi(result.gate.learnedVsUniformCi)}). Bucket-only vs exact control: {formatSigned(result.gate.averageBucketVsUniformImprovement)} ({formatCi(result.gate.bucketVsUniformCi)}).
          </div>
          <div style={finePrintInsetStyle}>
            Positive improvement means lower error. Intervals are calculated across calendar-month averages so 13 draws in one month are not treated as 13 fully independent months.
          </div>
        </div>

        {current ? (
          <section aria-labelledby="monthly-stage-current-title" style={sectionStyle}>
            <div id="monthly-stage-current-title" style={sectionHeaderStyle}>
              <span>Current shared stage evidence</span>
              <span style={sectionHeaderMetaStyle}>
                {current.targetMonthLabel} · {current.expectedMonthDrawCount}D D{current.drawOrdinal} · target {current.targetDate}
              </span>
            </div>
            <div style={recipeGridStyle}>
              <Recipe label="Learned stage recipe" value={formatMix(current.learnedBucketMix)} detail="Hierarchical month-length + draw-stage evidence" />
              <Recipe label="Bucket-only control" value={formatMix(current.bucketBaselineMix)} detail="Ignores draw ordinal and month length" />
              <Recipe label="Current Stage IDM" value={formatMix(current.stageIdmBucketMix)} detail={`${current.comparableStageMonths} comparable prior month${current.comparableStageMonths === 1 ? "" : "s"}`} />
            </div>
            <div style={tableScrollStyle}>
              <table style={{ ...tableStyle, minWidth: 1040 }}>
                <thead>
                  <tr>
                    <th style={thLeftStyle}>Bucket now</th>
                    <th style={thStyle}>Count</th>
                    <th style={thLeftStyle}>Numbers</th>
                    <th style={thStyle}>Learned rate</th>
                    <th style={thStyle}>Learned picks</th>
                    <th style={thStyle}>Bucket-only picks</th>
                    <th style={thStyle}>Stage IDM picks</th>
                    <th style={thStyle}>Exact trials</th>
                    <th style={thStyle}>Stage trials</th>
                    <th style={thStyle}>Base trials</th>
                  </tr>
                </thead>
                <tbody>
                  {current.bucketRows.filter((row) => row.currentCount > 0).map((row) => (
                    <tr key={row.bucket}>
                      <td style={tdLeftStrongStyle}>{row.label}</td>
                      <td style={tdStyle}>{row.currentCount}</td>
                      <td style={numbersTdStyle}>{row.numbers.join(", ")}</td>
                      <td style={tdStyle}>{formatPercent(row.learnedRate)}</td>
                      <td style={tdStrongStyle}>{row.learnedTargetPicks}</td>
                      <td style={tdStyle}>{row.bucketBaselineTargetPicks}</td>
                      <td style={tdStyle}>{row.stageIdmTargetPicks ?? "n/a"}</td>
                      <td style={tdStyle}>{row.exactTrials}</td>
                      <td style={tdStyle}>{row.stageTrials}</td>
                      <td style={tdStyle}>{row.baseTrials}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={finePrintStyle}>
              Each recipe contains exactly eight slots and cannot request more numbers than a bucket currently contains. Learned rate is normalised across all 45 numbers so the displayed per-number rates sum to eight expected hits; it is still an empirical diagnostic, not a calibrated next-draw probability. No recipe is applied automatically.
            </div>
          </section>
        ) : null}

        <section aria-labelledby="monthly-stage-ordinal-title" style={sectionStyle}>
          <div id="monthly-stage-ordinal-title" style={sectionHeaderStyle}>
            <span>Evidence by draw ordinal</span>
            <span style={sectionHeaderMetaStyle}>positive Brier lift favours stage context</span>
          </div>
          <div style={tableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 780 }}>
              <thead>
                <tr>
                  <th style={thLeftStyle}>Target stage</th>
                  <th style={thStyle}>Draws</th>
                  <th style={thStyle}>Months</th>
                  <th style={thStyle}>Brier lift</th>
                  <th style={thStyle}>Learned overlap</th>
                  <th style={thStyle}>Bucket-only overlap</th>
                  <th style={thStyle}>Stage IDM overlap</th>
                </tr>
              </thead>
              <tbody>
                {result.ordinalRows.map((row) => (
                  <tr key={row.drawOrdinal}>
                    <td style={tdLeftStrongStyle}>D{row.drawOrdinal}</td>
                    <td style={tdStyle}>{row.scoredDraws}</td>
                    <td style={tdStyle}>{row.scoredMonths}</td>
                    <td style={{ ...tdStrongStyle, color: row.averageBrierImprovement > 0 ? "#166534" : row.averageBrierImprovement < 0 ? "#9f1239" : "#475569" }}>
                      {formatSigned(row.averageBrierImprovement)}
                    </td>
                    <td style={tdStyle}>{row.learnedAverageOverlap.toFixed(2)}</td>
                    <td style={tdStyle}>{row.bucketBaselineAverageOverlap.toFixed(2)}</td>
                    <td style={tdStyle}>{formatNumber(row.stageIdmAverageOverlap, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="monthly-stage-calibration-title" style={sectionStyle}>
          <div id="monthly-stage-calibration-title" style={sectionHeaderStyle}>Learned-rate calibration</div>
          <div style={tableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 680 }}>
              <thead>
                <tr>
                  <th style={thLeftStyle}>Estimated-rate band</th>
                  <th style={thStyle}>Number-state trials</th>
                  <th style={thStyle}>Hits</th>
                  <th style={thStyle}>Average estimate</th>
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
                    <td style={tdStyle}>{row.trials ? formatPercent(row.averageEstimatedRate) : "n/a"}</td>
                    <td style={tdStyle}>{row.trials ? formatPercent(row.observedRate) : "n/a"}</td>
                    <td style={tdStyle}>{row.trials ? row.brierScore.toFixed(3) : "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={finePrintStyle}>
            These are number-state observations, not independent draws. They are shown to expose calibration; the audit decision above uses paired draw results clustered by month.
          </div>
        </section>

        <section aria-labelledby="monthly-stage-ledger-title" style={sectionStyle}>
          <div id="monthly-stage-ledger-title" style={sectionHeaderStyle}>
            <span>Strict walk-forward ledger</span>
            <span style={sectionHeaderMetaStyle}>latest {latestRows.length} of {result.records.length}</span>
          </div>
          <div style={ledgerScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 1200 }}>
              <thead>
                <tr>
                  <th style={thLeftStyle}>Target</th>
                  <th style={thStyle}>Context</th>
                  <th style={thStyle}>Prior draws</th>
                  <th style={thStyle}>Comparable months</th>
                  <th style={thLeftStyle}>Actual origins</th>
                  <th style={thLeftStyle}>Learned recipe</th>
                  <th style={thLeftStyle}>Stage IDM recipe</th>
                  <th style={thStyle}>Learned overlap</th>
                  <th style={thStyle}>Stage IDM overlap</th>
                  <th style={thStyle}>Brier lift</th>
                </tr>
              </thead>
              <tbody>
                {latestRows.map((row) => (
                  <tr key={row.targetDate}>
                    <td style={tdLeftStyle}>{row.targetDate}</td>
                    <td style={tdStyle}>{row.expectedMonthDrawCount}D D{row.drawOrdinal}</td>
                    <td style={tdStyle}>{row.priorDraws}</td>
                    <td style={tdStyle}>{row.comparableStageMonths}</td>
                    <td style={tdLeftStyle}>{formatMix(row.actualBucketMix)}</td>
                    <td style={tdLeftStyle}>{formatMix(row.learnedBucketMix)}</td>
                    <td style={tdLeftStyle}>{formatMix(row.stageIdmBucketMix)}</td>
                    <td style={tdStyle}>{row.learnedOverlap}/8</td>
                    <td style={tdStyle}>{row.stageIdmOverlap === null ? "n/a" : `${row.stageIdmOverlap}/8`}</td>
                    <td style={tdStrongStyle}>{formatSigned(row.brierImprovement)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {result.warnings.length ? (
          <div style={warningStyle}>
            <strong>Evidence notes</strong>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </div>
        ) : null}
      </div>
    </InlineCollapsibleCard>
  );
};

const Recipe: React.FC<{ label: string; value: string; detail: string }> = ({ label, value, detail }) => (
  <div style={recipeStyle}>
    <div style={metricLabelStyle}>{label}</div>
    <div style={recipeValueStyle}>{value}</div>
    <div style={finePrintInsetStyle}>{detail}</div>
  </div>
);

const contentStyle: React.CSSProperties = { display: "grid", gap: 12 };
const truthBannerStyle: React.CSSProperties = { display: "grid", gap: 3, padding: "10px 12px", border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff", color: "#1e3a5f", fontSize: 12, lineHeight: 1.45 };
const scopeStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "6px 14px", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", color: "#475569", fontSize: 12, fontWeight: 750 };
const metricGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 };
const metricStyle: React.CSSProperties = { minHeight: 88, padding: 10, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" };
const metricLabelStyle: React.CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 850, textTransform: "uppercase" };
const metricValueStyle: React.CSSProperties = { marginTop: 4, color: "#0f172a", fontSize: 19, fontWeight: 900, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" };
const decisionStyle = (status: MonthlyStageEvidenceGateStatus): React.CSSProperties => ({ padding: "10px 12px", border: `1px solid ${status === "stage-supported" ? "#93c5fd" : "#dbe4ee"}`, borderRadius: 8, background: status === "stage-supported" ? "#eff6ff" : "#fbfdff", display: "grid", gap: 5 });
const decisionHeadingStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", color: "#0f172a", fontSize: 13, fontWeight: 900 };
const sectionStyle: React.CSSProperties = { border: "1px solid #dbe4ee", borderRadius: 8, overflow: "hidden", background: "#fff" };
const sectionHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "8px 10px", borderBottom: "1px solid #dbe4ee", background: "#f8fafc", color: "#334155", fontSize: 12, fontWeight: 900 };
const sectionHeaderMetaStyle: React.CSSProperties = { color: "#64748b", fontWeight: 700 };
const recipeGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, padding: 10 };
const recipeStyle: React.CSSProperties = { minHeight: 78, padding: 9, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fbfdff" };
const recipeValueStyle: React.CSSProperties = { marginTop: 4, color: "#174ea6", fontSize: 13, fontWeight: 900, lineHeight: 1.4, fontVariantNumeric: "tabular-nums" };
const tableScrollStyle: React.CSSProperties = { overflowX: "auto" };
const ledgerScrollStyle: React.CSSProperties = { overflow: "auto", maxHeight: 390 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const thStyle: React.CSSProperties = { position: "sticky", top: 0, zIndex: 1, padding: "7px 8px", borderBottom: "1px solid #dbe4ee", background: "#f8fafc", color: "#334155", textAlign: "right", fontWeight: 850, whiteSpace: "nowrap" };
const thLeftStyle: React.CSSProperties = { ...thStyle, textAlign: "left" };
const tdStyle: React.CSSProperties = { padding: "7px 8px", borderBottom: "1px solid #eef2f7", color: "#334155", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
const tdStrongStyle: React.CSSProperties = { ...tdStyle, fontWeight: 900 };
const tdLeftStyle: React.CSSProperties = { ...tdStyle, textAlign: "left" };
const tdLeftStrongStyle: React.CSSProperties = { ...tdLeftStyle, color: "#174ea6", fontWeight: 900 };
const numbersTdStyle: React.CSSProperties = { ...tdLeftStyle, minWidth: 220, whiteSpace: "normal", lineHeight: 1.4 };
const finePrintStyle: React.CSSProperties = { padding: "7px 10px", color: "#64748b", fontSize: 11, lineHeight: 1.45 };
const finePrintInsetStyle: React.CSSProperties = { color: "#64748b", fontSize: 11, lineHeight: 1.45 };
const warningStyle: React.CSSProperties = { padding: "9px 11px", border: "1px solid #fde68a", borderRadius: 8, background: "#fffbeb", color: "#92400e", fontSize: 12, lineHeight: 1.45 };

export default MonthlyStageEvidenceAuditCard;

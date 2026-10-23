import React from "react";
import type { Draw } from "../types";
import {
  analyzeDroughtHazardCalibration,
  DROUGHT_HAZARD_CALIBRATION_MAX_ECE,
  DROUGHT_HAZARD_CALIBRATION_MIN_EVALUATION_DRAWS,
  DROUGHT_HAZARD_CALIBRATION_STABILITY_SHARE,
  DROUGHT_HAZARD_CALIBRATION_STABILITY_WINDOW,
  DROUGHT_HAZARD_CALIBRATION_VERSION,
  formatDroughtHazardPriorStrength,
  type DroughtHazardCalibrationStatus,
  type DroughtHazardPriorStrength,
} from "../lib/droughtHazardCalibration";
import InlineCollapsibleCard from "./shared/InlineCollapsibleCard";

interface Props {
  history: Draw[];
  historyScopeLabel?: string;
}

const STATUS_LABELS: Record<DroughtHazardCalibrationStatus, string> = {
  insufficient: "Insufficient",
  "baseline-favoured": "Baseline favoured",
  unstable: "Not stable",
  miscalibrated: "Calibration gap",
  supported: "Supported",
};

export const DroughtHazardCalibrationAuditPanel: React.FC<Props> = ({
  history,
  historyScopeLabel,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const result = React.useMemo(
    () => expanded ? analyzeDroughtHazardCalibration(history) : null,
    [expanded, history],
  );

  if (!result) {
    return (
      <InlineCollapsibleCard
        id="drought-hazard-calibration-audit"
        title="Empirical Hazard Calibration Audit"
        subtitle="Real-draw walk-forward calibration; observe-only"
        collapsedSummary={`${DROUGHT_HAZARD_CALIBRATION_VERSION} · Open Review to test learned smoothing against the neutral 8/45 benchmark. No simulated results and no generation influence.`}
        expanded={expanded}
        onExpandedChange={setExpanded}
        collapsedLabel="Review"
        expandedLabel="Hide"
      >
        {null}
      </InlineCollapsibleCard>
    );
  }

  const latestRecords = [...result.evaluationRecords].reverse().slice(0, 40);
  const selectedCandidate = result.candidateRows.find(
    (row) => row.priorStrength === result.currentLearnedPriorStrength,
  );

  return (
    <InlineCollapsibleCard
      id="drought-hazard-calibration-audit"
      title="Empirical Hazard Calibration Audit"
      subtitle="Real-draw walk-forward calibration; observe-only"
      collapsedSummary={`${result.version} · ${result.evaluationRecords.length} out-of-sample draws · ${STATUS_LABELS[result.verdict.status]}`}
      expanded={expanded}
      onExpandedChange={setExpanded}
      collapsedLabel="Review"
      expandedLabel="Hide"
    >
      <div style={contentStyle}>
        <div role="status" style={truthBannerStyle}>
          <strong>Recorded real draws only.</strong>
          {result.version} excludes simulated, malformed, duplicate-date, and off-schedule rows. For every target draw, its prior strength and rate are fixed before that draw is revealed. This audit does not affect generation, shortlist rank, or forced selections.
        </div>

        <div style={scopeStyle}>
          <span>{historyScopeLabel ?? `${result.validHistoryDraws} validated real draws`}</span>
          <span>{result.scope} · neutral baseline {formatPercent(result.baselineProbability)}</span>
          <span>{result.minTrainingDraws} prior draws before scoring</span>
          <span>{result.selectionWarmupDraws} scored draws before adaptive selection</span>
          {result.excludedHistoryRows > 0 ? <span>{result.excludedHistoryRows} supplied row{result.excludedHistoryRows === 1 ? "" : "s"} excluded</span> : null}
        </div>

        <div style={metricGridStyle}>
          <Metric
            label="Evaluation draws"
            value={String(result.evaluationRecords.length)}
            detail={`${result.numberStateChecks.toLocaleString()} number-state checks`}
          />
          <Metric
            label="Learned prior"
            value={formatDroughtHazardPriorStrength(result.currentLearnedPriorStrength)}
            detail={selectedCandidate ? `candidate Brier ${formatBrier(selectedCandidate.brierScore)}` : "not available"}
            compact
          />
          <Metric
            label="Policy Brier"
            value={formatBrier(result.modelBrierScore)}
            detail={`neutral ${formatBrier(result.baselineBrierScore)} · lower is better`}
          />
          <Metric
            label="Brier improvement"
            value={formatSignedBrier(result.brierImprovement)}
            detail={`95% draw-level interval ${formatCi(result.brierImprovementCi)}`}
          />
          <Metric
            label="Calibration gap"
            value={formatNullablePercent(result.expectedCalibrationError)}
            detail={`declared guardrail <= ${(DROUGHT_HAZARD_CALIBRATION_MAX_ECE * 100).toFixed(0)}pp`}
          />
          <Metric
            label="Recent stability"
            value={formatPercent(result.recentStrengthAgreement)}
            detail={`${result.recentStrengthDraws} draws · gate ${(DROUGHT_HAZARD_CALIBRATION_STABILITY_SHARE * 100).toFixed(0)}% of ${DROUGHT_HAZARD_CALIBRATION_STABILITY_WINDOW}`}
          />
        </div>

        <div style={verdictStyle(result.verdict.status)}>
          <div style={verdictHeadingStyle}>
            <span>{STATUS_LABELS[result.verdict.status]}</span>
            <span>{result.verdict.title}</span>
          </div>
          <div style={finePrintStyle}>{result.verdict.reason}</div>
          <div style={finePrintStyle}>
            “Supported” requires at least {DROUGHT_HAZARD_CALIBRATION_MIN_EVALUATION_DRAWS} learned-policy target draws, a positive draw-level Brier interval, a stable recent prior, and a weighted reliability gap no greater than {(DROUGHT_HAZARD_CALIBRATION_MAX_ECE * 100).toFixed(0)} percentage points.
          </div>
        </div>

        <section aria-labelledby="drought-calibration-sample-title" style={sectionStyle}>
          <div id="drought-calibration-sample-title" style={sectionHeaderStyle}>How much evidence is enough?</div>
          <p style={bodyCopyStyle}>
            There is no perfect finite sample size. More real target draws narrow uncertainty, while rare long-drought states remain thin even when the overall audit is large. The figures below are nominal 95% requirements for estimating a rate near 8/45 within the stated margin.
          </p>
          <div style={tableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 620 }}>
              <thead>
                <tr>
                  <th style={thLeftStyle}>Desired margin</th>
                  <th style={thStyle}>Independent state trials needed</th>
                  <th style={thStyle}>Overall states available</th>
                  <th style={thLeftStyle}>Nominal result</th>
                </tr>
              </thead>
              <tbody>
                {result.precisionRows.map((row) => (
                  <tr key={row.margin}>
                    <td style={tdLeftStyle}>±{(row.margin * 100).toFixed(0)} percentage points</td>
                    <td style={tdStyle}>{row.requiredIndependentTrials.toLocaleString()}</td>
                    <td style={tdStyle}>{result.numberStateChecks.toLocaleString()}</td>
                    <td style={tdLeftStyle}>{row.achievedByOverallNumberStates ? "Overall count reached" : "Not reached"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={finePrintStyle}>
            These are lower-bound planning counts, not guarantees: 45 number-states from one lottery draw are dependent because exactly eight numbers appear. Windfall therefore bases its performance interval and verdict on target draws, not on pretending every number-state is an independent experiment.
          </div>
        </section>

        <section aria-labelledby="drought-calibration-prior-title" style={sectionStyle}>
          <div id="drought-calibration-prior-title" style={sectionHeaderStyle}>Pre-registered prior-strength comparison</div>
          <div style={tableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={thLeftStyle}>Candidate</th>
                  <th style={thStyle}>Scored draws</th>
                  <th style={thStyle}>Number-state checks</th>
                  <th style={thStyle}>Brier</th>
                  <th style={thStyle}>Vs neutral</th>
                  <th style={thLeftStyle}>Current read</th>
                </tr>
              </thead>
              <tbody>
                {result.candidateRows.map((row) => {
                  const selected = row.priorStrength === result.currentLearnedPriorStrength;
                  return (
                    <tr key={strengthKey(row.priorStrength)} style={selected ? selectedRowStyle : undefined}>
                      <td style={tdLeftStyle}>{row.label}</td>
                      <td style={tdStyle}>{row.scoredDraws}</td>
                      <td style={tdStyle}>{row.numberStateChecks.toLocaleString()}</td>
                      <td style={tdStyle}>{formatBrier(row.brierScore)}</td>
                      <td style={signedCellStyle(row.improvementVsBaseline)}>{formatSignedBrier(row.improvementVsBaseline)}</td>
                      <td style={tdLeftStyle}>{selected ? "Lowest prior-only walk-forward Brier" : "Comparison"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={finePrintStyle}>
            The neutral row always reports 8/45. Finite rows use <code>(hits + strength x 8/45) / (trials + strength)</code>. Strength zero is the unsmoothed rate. The candidate with the lowest accumulated prior-only Brier is selected for the next eligible target; ties prefer the simpler neutral or more conservative prior.
          </div>
        </section>

        <section aria-labelledby="drought-calibration-reliability-title" style={sectionStyle}>
          <div id="drought-calibration-reliability-title" style={sectionHeaderStyle}>Out-of-sample reliability</div>
          <div style={tableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={thLeftStyle}>Forecast band</th>
                  <th style={thStyle}>State trials</th>
                  <th style={thStyle}>Hits</th>
                  <th style={thStyle}>Average forecast</th>
                  <th style={thStyle}>Observed rate</th>
                  <th style={thStyle}>Gap</th>
                  <th style={thStyle}>Brier</th>
                </tr>
              </thead>
              <tbody>
                {result.reliabilityRows.map((row) => (
                  <tr key={row.label}>
                    <td style={tdLeftStyle}>{row.label}</td>
                    <td style={tdStyle}>{row.trials.toLocaleString()}</td>
                    <td style={tdStyle}>{row.hits.toLocaleString()}</td>
                    <td style={tdStyle}>{row.trials ? formatPercent(row.averagePredictedRate) : "n/a"}</td>
                    <td style={tdStyle}>{row.trials ? formatPercent(row.observedRate) : "n/a"}</td>
                    <td style={tdStyle}>{row.trials ? formatPoints(row.absoluteGap) : "n/a"}</td>
                    <td style={tdStyle}>{row.trials ? row.brierScore.toFixed(5) : "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="drought-calibration-k-title" style={sectionStyle}>
          <div id="drought-calibration-k-title" style={sectionHeaderStyle}>Evidence by drought length k</div>
          <div style={verticalTableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={stickyThLeftStyle}>k</th>
                  <th style={stickyThStyle}>State trials</th>
                  <th style={stickyThStyle}>Hits</th>
                  <th style={stickyThStyle}>Average forecast</th>
                  <th style={stickyThStyle}>Observed rate</th>
                  <th style={stickyThStyle}>Gap</th>
                  <th style={stickyThStyle}>Nominal 95% margin</th>
                  <th style={stickyThLeftStyle}>Sample read</th>
                </tr>
              </thead>
              <tbody>
                {result.byDroughtRows.map((row) => (
                  <tr key={row.drought}>
                    <td style={tdLeftStyle}>k={row.drought}</td>
                    <td style={tdStyle}>{row.trials.toLocaleString()}</td>
                    <td style={tdStyle}>{row.hits.toLocaleString()}</td>
                    <td style={tdStyle}>{formatPercent(row.averagePredictedRate)}</td>
                    <td style={tdStyle}>{formatPercent(row.observedRate)}</td>
                    <td style={tdStyle}>{formatPoints(row.absoluteGap)}</td>
                    <td style={tdStyle}>±{formatPoints(row.nominalMargin95)}</td>
                    <td style={tdLeftStyle}>{sampleText(row.sample)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={finePrintStyle}>
            Initial unknown droughts are left-censored and excluded until that number first appears in the available history. This avoids pretending the dataset began immediately after an unseen hit. The nominal margins still assume independent states and should be treated as optimistic.
          </div>
        </section>

        <section aria-labelledby="drought-calibration-ledger-title" style={sectionStyle}>
          <div id="drought-calibration-ledger-title" style={sectionHeaderStyle}>
            <span>Latest walk-forward decisions</span>
            <span style={sectionMetaStyle}>latest {latestRecords.length} of {result.evaluationRecords.length}</span>
          </div>
          <div style={verticalTableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={stickyThLeftStyle}>Target</th>
                  <th style={stickyThStyle}>Prior draws</th>
                  <th style={stickyThLeftStyle}>Strength chosen before target</th>
                  <th style={stickyThStyle}>Policy Brier</th>
                  <th style={stickyThStyle}>Neutral Brier</th>
                  <th style={stickyThStyle}>Difference</th>
                </tr>
              </thead>
              <tbody>
                {latestRecords.map((record) => (
                  <tr key={`${record.targetDate}-${record.trainingDraws}`}>
                    <td style={tdLeftStyle}>{record.targetDate}</td>
                    <td style={tdStyle}>{record.trainingDraws}</td>
                    <td style={tdLeftStyle}>{formatDroughtHazardPriorStrength(record.selectedPriorStrength)}</td>
                    <td style={tdStyle}>{record.modelBrierScore.toFixed(5)}</td>
                    <td style={tdStyle}>{record.baselineBrierScore.toFixed(5)}</td>
                    <td style={signedCellStyle(record.baselineBrierScore - record.modelBrierScore)}>
                      {formatSignedBrier(record.baselineBrierScore - record.modelBrierScore)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </InlineCollapsibleCard>
  );
};

const Metric: React.FC<{ label: string; value: string; detail: string; compact?: boolean }> = ({
  label,
  value,
  detail,
  compact,
}) => (
  <div style={metricStyle}>
    <div style={metricLabelStyle}>{label}</div>
    <div style={{ ...metricValueStyle, fontSize: compact ? 16 : 21 }}>{value}</div>
    <div style={finePrintStyle}>{detail}</div>
  </div>
);

const strengthKey = (strength: DroughtHazardPriorStrength): string => (
  strength === null ? "neutral" : String(strength)
);

const sampleText = (sample: "thin" | "5pp" | "3pp" | "2pp" | "1pp"): string => {
  if (sample === "thin") return "Thin: wider than ±5pp nominally";
  return `Nominal ±${sample.replace("pp", "")}pp count reached`;
};

const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const formatPoints = (value: number): string => `${(value * 100).toFixed(1)}pp`;
const formatNullablePercent = (value: number | null): string => value == null ? "n/a" : formatPoints(value);
const formatBrier = (value: number | null): string => value == null ? "n/a" : value.toFixed(5);
const formatSignedBrier = (value: number | null): string => (
  value == null ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(5)}`
);
const formatCi = (ci: [number, number] | null): string => (
  ci ? `${formatSignedBrier(ci[0])} to ${formatSignedBrier(ci[1])}` : "n/a"
);

const contentStyle: React.CSSProperties = { display: "grid", gap: 12 };
const truthBannerStyle: React.CSSProperties = { display: "grid", gap: 3, padding: "10px 12px", border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff", color: "#1e3a5f", fontSize: 12, lineHeight: 1.45 };
const scopeStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "6px 14px", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", color: "#475569", fontSize: 12, fontWeight: 750 };
const metricGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 };
const metricStyle: React.CSSProperties = { minHeight: 88, padding: 10, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" };
const metricLabelStyle: React.CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 850, textTransform: "uppercase" };
const metricValueStyle: React.CSSProperties = { marginTop: 4, color: "#0f172a", fontWeight: 900, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" };
const finePrintStyle: React.CSSProperties = { color: "#64748b", fontSize: 11, lineHeight: 1.45 };
const bodyCopyStyle: React.CSSProperties = { margin: 0, color: "#334155", fontSize: 13, lineHeight: 1.5 };
const sectionStyle: React.CSSProperties = { display: "grid", gap: 8, paddingTop: 2 };
const sectionHeaderStyle: React.CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", color: "#0f172a", fontWeight: 850, fontSize: 14 };
const sectionMetaStyle: React.CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 750 };
const tableScrollStyle: React.CSSProperties = { width: "100%", overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 8 };
const verticalTableScrollStyle: React.CSSProperties = { width: "100%", maxHeight: 350, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12, background: "#fff" };
const thStyle: React.CSSProperties = { padding: "7px 8px", textAlign: "right", borderBottom: "1px solid #cbd5e1", background: "#f8fafc", color: "#334155", fontWeight: 850, whiteSpace: "nowrap" };
const thLeftStyle: React.CSSProperties = { ...thStyle, textAlign: "left" };
const stickyThStyle: React.CSSProperties = { ...thStyle, position: "sticky", top: 0, zIndex: 1 };
const stickyThLeftStyle: React.CSSProperties = { ...stickyThStyle, textAlign: "left" };
const tdStyle: React.CSSProperties = { padding: "7px 8px", textAlign: "right", borderBottom: "1px solid #eef2f7", color: "#334155", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
const tdLeftStyle: React.CSSProperties = { ...tdStyle, textAlign: "left" };
const selectedRowStyle: React.CSSProperties = { background: "#eff6ff" };

const verdictStyle = (status: DroughtHazardCalibrationStatus): React.CSSProperties => {
  const colors: Record<DroughtHazardCalibrationStatus, { border: string; background: string; color: string }> = {
    insufficient: { border: "#cbd5e1", background: "#f8fafc", color: "#334155" },
    "baseline-favoured": { border: "#93c5fd", background: "#eff6ff", color: "#1e3a5f" },
    unstable: { border: "#fbbf24", background: "#fffbeb", color: "#78350f" },
    miscalibrated: { border: "#fbbf24", background: "#fffbeb", color: "#78350f" },
    supported: { border: "#86efac", background: "#f0fdf4", color: "#14532d" },
  };
  const color = colors[status];
  return { display: "grid", gap: 5, padding: "10px 12px", border: `1px solid ${color.border}`, borderRadius: 8, background: color.background, color: color.color };
};

const verdictHeadingStyle: React.CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 13, fontWeight: 900 };
const signedCellStyle = (value: number | null): React.CSSProperties => ({
  ...tdStyle,
  color: value == null ? "#64748b" : value > 0 ? "#166534" : value < 0 ? "#b42318" : "#475569",
  fontWeight: 800,
});

export default DroughtHazardCalibrationAuditPanel;

import React from "react";
import type { Draw } from "../types";
import {
  analyzeDroughtLearningAudit,
  DROUGHT_LEARNING_MODEL_VERSION,
  type DroughtLearningAuditResult,
  type DroughtLearningAuditRecord,
  type DroughtLearningGateStatus,
  type DroughtLearningStateAuditRow,
} from "../lib/droughtLearningAudit";
import {
  analyzeDroughtWindowEvidence,
  type DroughtWindowEvidenceResult,
  type DroughtWindowMembership,
  type DroughtWindowScale,
} from "../lib/droughtWindowEvidence";
import InlineCollapsibleCard from "./shared/InlineCollapsibleCard";

interface Props {
  history: Draw[];
  fullHistory?: Draw[];
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
  fullHistory,
  historyScopeLabel,
  threshold,
  topK,
  targetMonthLabel,
  targetDrawOrdinal,
  targetMonthExpectedDrawCount,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const result = React.useMemo(() => expanded ? analyzeDroughtLearningAudit(history, {
    threshold,
    topK,
    targetMonthLabel,
    targetDrawOrdinal,
    targetMonthExpectedDrawCount,
  }) : null, [expanded, history, targetDrawOrdinal, targetMonthExpectedDrawCount, targetMonthLabel, threshold, topK]);
  const windowEvidence = React.useMemo(
    () => expanded ? analyzeDroughtWindowEvidence(fullHistory?.length ? fullHistory : history, topK) : null,
    [expanded, fullHistory, history, topK],
  );

  if (!result || !windowEvidence) {
    return (
      <InlineCollapsibleCard
        id="drought-learning-self-audit"
        title="Drought Learning & Self-Audit"
        subtitle="Versioned walk-forward challenger and state identity audit; observe-only"
        collapsedSummary={`${DROUGHT_LEARNING_MODEL_VERSION} · Open Review to run this history-only audit. Closed audits do not delay draw-history refreshes.`}
        expanded={expanded}
        onExpandedChange={setExpanded}
        collapsedLabel="Review"
        expandedLabel="Hide"
      >
        {null}
      </InlineCollapsibleCard>
    );
  }

  const gateLabel = GATE_LABELS[result.gate.status];
  const currentRows = result.currentRankedNumbers.slice(0, result.topK);
  const latestRecords = [...result.records].reverse().slice(0, 60);
  const changedNumbers = result.currentChallenger.filter((number, index) => result.currentChampion[index] !== number).length;

  return (
    <InlineCollapsibleCard
      id="drought-learning-self-audit"
      title="Drought Learning & Self-Audit"
      subtitle="Versioned walk-forward challenger and state identity audit; observe-only"
      collapsedSummary={`${result.modelVersion} · ${result.records.length} scored draws · ${gateLabel}`}
      expanded={expanded}
      onExpandedChange={setExpanded}
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
            <table style={{ ...tableStyle, minWidth: 1180 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Learned</th>
                  <th style={thStyle}>Strict</th>
                  <th style={thStyle}>#</th>
                  <th style={thLeftStyle}>State ID</th>
                  <th style={thLeftStyle}>State peers</th>
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
                    <td style={stateIdTdStyle}>{formatStateId(row.stateId)}</td>
                    <td style={tdLeftStyle}>{formatNumbers(row.statePeers)}</td>
                    <td style={tdLeftStyle}>{row.bucketLabel}</td>
                    <td style={tdStyle}>k{row.currentDrought}</td>
                    <td style={tdStyle}>{formatPercent(row.learnedRate)}</td>
                    <td style={tdStyle}>{row.exactTrials}</td>
                    <td style={tdStyle}>{row.coarseTrials}</td>
                    <td style={tdStyle}>{row.baseTrials}</td>
                    <td style={tdLeftStyle}>{row.sample}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={12} style={emptyTdStyle}>No numbers currently meet the strict {result.threshold}+ drought threshold.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={finePrintStyle}>
            The rate is a baseline-shrunk historical state estimate, not a calibrated next-draw probability. Inputs are expected month length, draw-stage band, monthly bucket, and drought-length band. Exact rate ties retain the existing strict order as a deterministic tie-break only. <strong>Episodes 6+ is deliberately excluded from {result.modelVersion}'s learned rate</strong> so the first challenger does not double-count completed-drought evidence.
          </div>
        </section>

        <DroughtStateIdentityAudit result={result} windowEvidence={windowEvidence} />

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

const DroughtStateIdentityAudit: React.FC<{
  result: DroughtLearningAuditResult;
  windowEvidence: DroughtWindowEvidenceResult;
}> = ({ result, windowEvidence }) => {
  const currentTopRows = result.currentRankedNumbers.slice(0, result.topK);
  const currentStateIds = [...new Set(currentTopRows.map((row) => row.stateId))];
  const currentStateSet = new Set(currentStateIds);
  const auditByState = new Map(result.stateAuditRows.map((row) => [row.stateId, row]));
  const currentGroups = currentStateIds.map((stateId) => {
    const peers = result.currentRankedNumbers.filter((row) => row.stateId === stateId);
    const topPeers = peers.filter((row) => row.learnedRank <= result.topK);
    return {
      stateId,
      peers,
      topPeers,
      audit: auditByState.get(stateId),
    };
  });

  return (
    <section aria-labelledby="drought-state-identity-title" style={sectionStyle}>
      <div id="drought-state-identity-title" style={sectionHeaderStyle}>
        <span>Drought State Identity Audit · {result.stateIdentityVersion}</span>
        <span style={sectionHeaderMetaStyle}>Observe-only · recorded real draws · no generation influence</span>
      </div>
      <div style={identityIntroStyle}>
        <strong>A shared State ID is repeatable by construction; its advantage is not assumed.</strong>
        Numbers receive the same ID only when month length, draw-stage band, monthly bucket, and drought-length band match before the target draw. Windfall then scores that state against later recorded draws. The supplied future result is never an input, and no simulated rows are used.
      </div>

      <div style={subsectionTitleStyle}>Current shared states</div>
      <div style={tableScrollStyle}>
        <table style={{ ...tableStyle, minWidth: 1210 }}>
          <thead>
            <tr>
              <th style={thLeftStyle}>State ID</th>
              <th style={thLeftStyle}>All current peers</th>
              <th style={thLeftStyle}>Top-{result.topK} peers</th>
              <th style={thStyle}>Shared DLA rate</th>
              <th style={thStyle}>Historical draws</th>
              <th style={thStyle}>Number-state trials</th>
              <th style={thStyle}>Hits</th>
              <th style={thStyle}>Observed</th>
              <th style={thStyle}>Vs 8/45</th>
              <th style={thStyle}>95% hit-lift / draw</th>
              <th style={thLeftStyle}>Evidence read</th>
            </tr>
          </thead>
          <tbody>
            {currentGroups.map((group) => (
              <StateAuditRow
                key={group.stateId}
                stateId={group.stateId}
                peers={group.peers.map((row) => row.number).sort((left, right) => left - right)}
                topPeers={group.topPeers.map((row) => row.number)}
                learnedRate={group.peers[0]?.learnedRate}
                audit={group.audit}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div style={finePrintStyle}>
        Peers share historical state evidence, not identity-specific evidence. When rates tie, DLA retains current drought and Strict rank only as deterministic ordering rules. A state is merely worth watching when its draw-level interval still crosses zero; it is not a next-draw prediction.
      </div>

      <div style={subsectionTitleStyle}>All walk-forward state signatures</div>
      <div style={stateRegistryScrollStyle}>
        <table style={{ ...tableStyle, minWidth: 940 }}>
          <thead>
            <tr>
              <th style={thLeftStyle}>State ID</th>
              <th style={thStyle}>Target draws</th>
              <th style={thStyle}>Number-state trials</th>
              <th style={thStyle}>Hits</th>
              <th style={thStyle}>Observed</th>
              <th style={thStyle}>Expected hits</th>
              <th style={thStyle}>Vs 8/45</th>
              <th style={thStyle}>Average lift / draw</th>
              <th style={thStyle}>95% interval</th>
              <th style={thLeftStyle}>Evidence size</th>
            </tr>
          </thead>
          <tbody>
            {result.stateAuditRows.map((row) => (
              <tr key={row.stateId} style={currentStateSet.has(row.stateId) ? currentStateRowStyle : undefined}>
                <td style={stateIdTdStyle}>{formatStateId(row.stateId)}{currentStateSet.has(row.stateId) ? " · current" : ""}</td>
                <td style={tdStyle}>{row.targetDraws}</td>
                <td style={tdStyle}>{row.numberStateTrials}</td>
                <td style={tdStyle}>{row.hits}</td>
                <td style={tdStyle}>{formatPercent(row.observedRate)}</td>
                <td style={tdStyle}>{row.expectedHits.toFixed(1)}</td>
                <td style={tdStyle}>{formatSignedPercentagePoints(row.liftVsBaseline)}</td>
                <td style={tdStyle}>{formatSignedHits(row.averageDrawLift)}</td>
                <td style={tdStyle}>{formatCompactCi(row.drawLiftCi)}</td>
                <td style={tdLeftStyle}>{row.sample}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={finePrintStyle}>
        Number-state trials within one draw are related, so the uncertainty interval is calculated from each target draw's total state hits minus its equal-size random expectation. It is not calculated by pretending every number-state is an independent lottery draw.
      </div>

      <div style={subsectionTitleStyle}>Empirical window dependence control</div>
      <div style={scaleSummaryGridStyle}>
        {(["short", "medium", "long"] as DroughtWindowScale[]).map((scale) => {
          const sources = windowEvidence.sources.filter((source) => source.definition.scale === scale);
          return (
            <div key={scale} style={scaleSummaryStyle}>
              <div style={scaleTitleStyle}>{scale[0].toUpperCase() + scale.slice(1)} scale</div>
              <div>{sources.map((source) => `${source.definition.id} ${source.effectiveDraws}`).join(" · ")}</div>
              <div style={scaleDetailStyle}>{scale === "short" ? "Thin windows; inspect, do not treat as confirmation." : "Nested sources count as one scale, not separate votes."}</div>
            </div>
          );
        })}
      </div>
      <div style={windowRegistryScrollStyle}>
        <table style={{ ...tableStyle, minWidth: 1130 }}>
          <thead>
            <tr>
              <th style={thStyle}>#</th>
              <th style={thLeftStyle}>Short · W/F</th>
              <th style={thLeftStyle}>Medium · M/Q</th>
              <th style={thLeftStyle}>Long · Y/H</th>
              <th style={thStyle}>Sources</th>
              <th style={thStyle}>Scale coverage</th>
              <th style={thLeftStyle}>Dependence read</th>
            </tr>
          </thead>
          <tbody>
            {windowEvidence.numbers.map((row) => (
              <tr key={row.number}>
                <td style={numberTdStyle}>{row.number}</td>
                <td style={tdLeftStyle}>{formatWindowMemberships(row.memberships, "short")}</td>
                <td style={tdLeftStyle}>{formatWindowMemberships(row.memberships, "medium")}</td>
                <td style={tdLeftStyle}>{formatWindowMemberships(row.memberships, "long")}</td>
                <td style={tdStyle}>{row.sourceCount}</td>
                <td style={tdStyle}>{row.scaleCount}/3</td>
                <td style={tdLeftStyle}>{row.sourceCount > row.scaleCount ? "Nested sources collapsed" : "One source per represented scale"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={finePrintStyle}>
        {windowEvidence.version} uses fixed W=3, F=6, M=13, Q=36, Y=156, and H={windowEvidence.historyDraws} real draws. A number appearing in both W and F still has only one short-scale observation; Y and H likewise share one long scale. Scale coverage controls obvious double-counting but does not claim the three scales are statistically independent. Current union: {windowEvidence.unionSize} numbers across six top-{windowEvidence.topK} lists.
      </div>
    </section>
  );
};

const StateAuditRow: React.FC<{
  stateId: string;
  peers: number[];
  topPeers: number[];
  learnedRate?: number;
  audit?: DroughtLearningStateAuditRow;
}> = ({ stateId, peers, topPeers, learnedRate, audit }) => (
  <tr>
    <td style={stateIdTdStyle}>{formatStateId(stateId)}</td>
    <td style={tdLeftStyle}>{formatNumbers(peers)}</td>
    <td style={tdLeftStyle}>{formatNumbers(topPeers)}</td>
    <td style={tdStyle}>{learnedRate == null ? "n/a" : formatPercent(learnedRate)}</td>
    <td style={tdStyle}>{audit?.targetDraws ?? 0}</td>
    <td style={tdStyle}>{audit?.numberStateTrials ?? 0}</td>
    <td style={tdStyle}>{audit?.hits ?? 0}</td>
    <td style={tdStyle}>{audit ? formatPercent(audit.observedRate) : "n/a"}</td>
    <td style={tdStyle}>{audit ? formatSignedPercentagePoints(audit.liftVsBaseline) : "n/a"}</td>
    <td style={tdStyle}>{audit ? formatCompactCi(audit.drawLiftCi) : "n/a"}</td>
    <td style={tdLeftStyle}>{audit ? stateEvidenceLabel(audit) : "No prior matching state"}</td>
  </tr>
);

const formatNumbers = (numbers: readonly number[]): string => numbers.length ? numbers.join(", ") : "none";
const formatStateId = (stateId: string): string => stateId.replace(/\|/g, " · ");
const formatDecimal = (value: number): string => value.toFixed(2);
const signedDecimal = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const formatNullable = (value: number | null, digits: number): string => value == null ? "n/a" : value.toFixed(digits);
const formatSignedHits = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
const formatCi = (ci: [number, number] | null): string => ci
  ? `${formatSignedHits(ci[0])} to ${formatSignedHits(ci[1])} hits/draw`
  : "not available";
const formatCompactCi = (ci: [number, number] | null): string => ci
  ? `${formatSignedHits(ci[0])} to ${formatSignedHits(ci[1])}`
  : "n/a";
const formatSignedPercentagePoints = (value: number): string => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}pp`;
const stateEvidenceLabel = (row: DroughtLearningStateAuditRow): string => {
  if (row.sample === "thin" || !row.drawLiftCi) return "Thin; descriptive only";
  if (row.drawLiftCi[0] > 0) return "Positive watch; not predictive";
  if (row.drawLiftCi[1] < 0) return "Below baseline in this history";
  return "Unresolved; interval crosses zero";
};
const formatWindowMemberships = (
  memberships: readonly DroughtWindowMembership[],
  scale: DroughtWindowScale,
): string => {
  const rows = memberships.filter((membership) => membership.scale === scale);
  if (!rows.length) return "none";
  return rows.map((row) => `${row.sourceId}#${row.rank} · k${row.droughtLength} · ${row.trials}t ${row.sample}`).join(" | ");
};

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
const stateRegistryScrollStyle: React.CSSProperties = { overflow: "auto", maxHeight: 360 };
const windowRegistryScrollStyle: React.CSSProperties = { overflow: "auto", maxHeight: 430 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const thStyle: React.CSSProperties = { position: "sticky", top: 0, zIndex: 1, padding: "7px 8px", borderBottom: "1px solid #dbe4ee", background: "#f8fafc", color: "#334155", textAlign: "right", fontWeight: 850, whiteSpace: "nowrap" };
const thLeftStyle: React.CSSProperties = { ...thStyle, textAlign: "left" };
const tdStyle: React.CSSProperties = { padding: "7px 8px", borderBottom: "1px solid #eef2f7", color: "#334155", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
const tdLeftStyle: React.CSSProperties = { ...tdStyle, textAlign: "left" };
const numberTdStyle: React.CSSProperties = { ...tdStyle, color: "#174ea6", fontWeight: 900 };
const stateIdTdStyle: React.CSSProperties = { ...tdLeftStyle, color: "#334155", fontWeight: 850, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
const emptyTdStyle: React.CSSProperties = { ...tdLeftStyle, padding: 12, color: "#64748b" };
const finePrintStyle: React.CSSProperties = { padding: "7px 10px", color: "#64748b", fontSize: 11, lineHeight: 1.45 };
const identityIntroStyle: React.CSSProperties = { display: "grid", gap: 3, padding: "10px 12px", borderBottom: "1px solid #dbe4ee", background: "#f8fbff", color: "#334155", fontSize: 12, lineHeight: 1.45 };
const subsectionTitleStyle: React.CSSProperties = { padding: "8px 10px", borderTop: "1px solid #dbe4ee", borderBottom: "1px solid #dbe4ee", background: "#f8fafc", color: "#475569", fontSize: 11, fontWeight: 900, textTransform: "uppercase" };
const currentStateRowStyle: React.CSSProperties = { background: "#eff6ff" };
const scaleSummaryGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, padding: 10 };
const scaleSummaryStyle: React.CSSProperties = { minHeight: 76, padding: 9, border: "1px solid #dbe4ee", borderRadius: 7, background: "#fff", color: "#334155", fontSize: 12, lineHeight: 1.4 };
const scaleTitleStyle: React.CSSProperties = { marginBottom: 3, color: "#0f172a", fontWeight: 900 };
const scaleDetailStyle: React.CSSProperties = { marginTop: 4, color: "#64748b", fontSize: 11 };

export default DroughtLearningAuditPanel;

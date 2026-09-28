import React from "react";

import type { Draw } from "../types";
import {
  analyzeDgaAutoSuppLearningAudit,
  DGA_AUTO_SUPP_RANDOM_ANY_HIT_RATE,
  DGA_AUTO_SUPP_RANDOM_EXACT_RATE,
  DGA_AUTO_SUPP_RANDOM_MEAN_HITS,
  type DgaAutoSuppAuditModel,
  type DgaAutoSuppAuditRecord,
  type DgaAutoSuppChallengerGate,
  type DgaAutoSuppCurrentGateStatus,
  type DgaAutoSuppGateStatus,
} from "../lib/dgaAutoSuppLearningAudit";
import { analyzeDgaAutoSuppJournal } from "../lib/dgaAutoSuppJournalAudit";
import {
  loadPredictionJournalEntries,
  PREDICTION_JOURNAL_UPDATED_EVENT,
} from "../lib/predictionJournal";
import InlineCollapsibleCard from "./shared/InlineCollapsibleCard";

interface Props {
  history: Draw[];
  activeHistoryCount: number;
  selectedNumbers: number[];
}

const GATE_LABELS: Record<DgaAutoSuppGateStatus, string> = {
  insufficient: "Learning",
  "retain-champion": "Retain current method",
  "watch-challenger": "Watch challenger",
  "promote-challenger": "Challenger clears gate",
};

const MODEL_SHORT_LABELS: Record<DgaAutoSuppAuditModel, string> = {
  champion: "Current",
  "role-rate": "Role-rate",
  "pair-blend": "Pair blend",
};

const CURRENT_GATE_LABELS: Record<DgaAutoSuppCurrentGateStatus, string> = {
  insufficient: "Learning",
  "no-validated-lift": "No validated lift",
  "validated-lift": "Validated lift",
};

const DgaAutoSuppLearningAuditPanel: React.FC<Props> = ({
  history,
  activeHistoryCount,
  selectedNumbers,
}) => {
  const [journalRevision, setJournalRevision] = React.useState(0);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const refresh = () => setJournalRevision((current) => current + 1);
    window.addEventListener("storage", refresh);
    window.addEventListener(PREDICTION_JOURNAL_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(PREDICTION_JOURNAL_UPDATED_EVENT, refresh);
    };
  }, []);

  const result = React.useMemo(() => analyzeDgaAutoSuppLearningAudit(history, {
    activeWindowSize: activeHistoryCount,
    selectedNumbers,
  }), [activeHistoryCount, history, selectedNumbers]);

  const journalEntries = React.useMemo(() => (
    typeof window === "undefined" ? [] : loadPredictionJournalEntries()
  ), [journalRevision]);
  const journalAudit = React.useMemo(
    () => analyzeDgaAutoSuppJournal(journalEntries, history),
    [history, journalEntries],
  );
  const latestRecords = [...result.records].reverse().slice(0, 60);
  const selectedModelLabel = MODEL_SHORT_LABELS[result.selectedModel];

  return (
    <InlineCollapsibleCard
      id="dga-auto-supp-learning-audit"
      title="Auto Supp Learning & Self-Audit"
      subtitle="Known-eight role replay; observe-only"
      collapsedSummary={`${result.modelVersion} · ${result.records.length} scored draws · ${CURRENT_GATE_LABELS[result.currentMethodGate.status]}`}
      defaultExpanded={false}
      collapsedLabel="Review"
      expandedLabel="Hide"
    >
      <div style={contentStyle}>
        <div role="status" style={truthBannerStyle}>
          <strong>{result.modelVersion} tests supplementary-role assignment only.</strong>
          For each historical draw, Windfall reveals the eight drawn numbers but conceals which two were supplementary. Every method then chooses two using earlier draws only. This does not test whether the app could have found those eight numbers beforehand, and it does not change DGA Auto supps or candidate generation.
        </div>

        <div style={scopeStyle}>
          <span>{result.validHistoryDraws} valid scheduled real draws</span>
          <span>Champion lookback {result.activeWindowSize} draw{result.activeWindowSize === 1 ? "" : "s"} · mirrors current WFMQYH length</span>
          <span>Warm-up {result.minHistory} draws</span>
          {result.excludedHistoryRows > 0 ? <span>{result.excludedHistoryRows} simulated, invalid, duplicate, conflicting, or off-schedule row{result.excludedHistoryRows === 1 ? "" : "s"} excluded</span> : null}
        </div>

        <div style={metricGridStyle}>
          <Metric label="Scored draws" value={String(result.records.length)} detail="strict walk-forward targets" />
          <Metric label="Random mean" value={formatDecimal(DGA_AUTO_SUPP_RANDOM_MEAN_HITS)} detail="supp hits from two of known eight" />
          <Metric label="Random exact pair" value={formatPercent(DGA_AUTO_SUPP_RANDOM_EXACT_RATE)} detail="1 of 28 possible pairs" />
          <Metric label="Historical policy" value={formatDecimal(result.policyAverageHits)} detail="method selected before each draw" />
          <Metric label="Live-method verdict" value={CURRENT_GATE_LABELS[result.currentMethodGate.status]} detail="against exact random references" compact />
          <Metric label="Audit policy" value={selectedModelLabel} detail="observe-only; no app change" compact />
          <Metric label="Journal sample" value={String(journalAudit.scoredEntries)} detail={`${journalAudit.pendingEntries} awaiting a real target`} />
        </div>

        <section aria-labelledby="auto-supp-current-comparison-title" style={sectionStyle}>
          <div id="auto-supp-current-comparison-title" style={sectionHeaderStyle}>
            <span>Current selected-eight comparison</span>
            <span style={sectionHeaderMetaStyle}>{result.selectedNumbers.length}/8 selected</span>
          </div>
          {result.currentPairs.length ? (
            <div style={pairGridStyle}>
              {result.currentPairs.map((row) => (
                <div key={row.model} style={pairCardStyle(row.model === result.selectedModel)}>
                  <div style={metricLabelStyle}>{row.label}</div>
                  <div style={pairValueStyle}>{row.pair.join(" · ")}</div>
                  <div style={finePrintStyle}>
                    {row.model === "champion"
                      ? "This is the pair currently displayed by DGA Auto supps."
                      : row.model === result.selectedModel
                        ? "Clears the observe-only historical gate; DGA remains unchanged."
                        : "Challenger pair for comparison only."}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyStyle}>Select exactly eight available numbers in either DGA simulation strip to compare the current method with both challengers.</div>
          )}
        </section>

        <section aria-labelledby="auto-supp-history-title" style={sectionStyle}>
          <div id="auto-supp-history-title" style={sectionHeaderStyle}>Historical known-eight replay</div>
          <div style={tableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 920 }}>
              <thead>
                <tr>
                  <th style={thLeftStyle}>Method</th>
                  <th style={thStyle}>Trials</th>
                  <th style={thStyle}>Avg hits</th>
                  <th style={thStyle}>0 hit</th>
                  <th style={thStyle}>1 hit</th>
                  <th style={thStyle}>2 hit / exact</th>
                  <th style={thStyle}>Any-hit rate</th>
                  <th style={thStyle}>Exact rate</th>
                  <th style={thStyle}>Actual pair avg rank</th>
                </tr>
              </thead>
              <tbody>
                {result.summaries.map((summary) => (
                  <tr key={summary.model}>
                    <td style={tdLeftStyle}>
                      <strong>{summary.label}</strong>
                      {summary.model === "champion"
                        ? <span style={recommendedPillStyle}>live method</span>
                        : summary.model === result.selectedModel
                          ? <span style={recommendedPillStyle}>challenger cleared</span>
                          : null}
                    </td>
                    <td style={tdStyle}>{summary.trials}</td>
                    <td style={tdStyle}>{formatDecimal(summary.meanHits)}</td>
                    <td style={tdStyle}>{summary.zeroHits}</td>
                    <td style={tdStyle}>{summary.oneHit}</td>
                    <td style={tdStyle}>{summary.twoHits}</td>
                    <td style={tdStyle}>{formatPercent(summary.anyHitRate)}</td>
                    <td style={tdStyle}>{formatPercent(summary.exactRate)}</td>
                    <td style={tdStyle}>{formatDecimal(summary.averageActualPairRank)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={randomTdStyle}><strong>Random pair expectation</strong></td>
                  <td style={tdStyle}>reference</td>
                  <td style={tdStyle}>{formatDecimal(DGA_AUTO_SUPP_RANDOM_MEAN_HITS)}</td>
                  <td style={tdStyle}>n/a</td>
                  <td style={tdStyle}>n/a</td>
                  <td style={tdStyle}>n/a</td>
                  <td style={tdStyle}>{formatPercent(DGA_AUTO_SUPP_RANDOM_ANY_HIT_RATE)}</td>
                  <td style={tdStyle}>{formatPercent(DGA_AUTO_SUPP_RANDOM_EXACT_RATE)}</td>
                  <td style={tdStyle}>14.50</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={finePrintStyle}>
            The current method uses raw supplementary counts from a fixed replay of the active WFMQYH draw count, then exact-pair and full-history tie-breakers. Role-rate divides supplementary appearances by all appearances and shrinks toward the neutral 25% role rate. Pair blend adds heavily shrunk exact-pair evidence. None of these values is a next-draw probability.
          </div>
        </section>

        <section aria-labelledby="auto-supp-gates-title" style={sectionStyle}>
          <div id="auto-supp-gates-title" style={sectionHeaderStyle}>Promotion gates</div>
          <div style={currentGateStyle(result.currentMethodGate.status)}>
            <div style={decisionHeadingStyle}>
              <span>Live method vs random</span>
              <span>{CURRENT_GATE_LABELS[result.currentMethodGate.status]}</span>
            </div>
            <div style={gateDeltaStyle}>{formatSigned(result.currentMethodGate.averageDifferenceFromRandom)} hits/draw</div>
            <div style={finePrintStyle}>Serial-adjusted approximate 95% interval: {formatCi(result.currentMethodGate.differenceFromRandomCi)}</div>
            <div style={finePrintStyle}>{result.currentMethodGate.reason}</div>
          </div>
          <div style={gateGridStyle}>
            {result.gates.map((gate) => <GateCard key={gate.model} gate={gate} />)}
          </div>
          <div style={finePrintStyle}>
            Promotion requires at least 60 paired draws, a serial-adjusted approximate 95% interval wholly above zero, average hits above random, and exact-pair performance no worse than both the current method and random. The audit decision is reversible as subsequent real draws arrive; it does not replace the live Auto supp method.
          </div>
        </section>

        <section aria-labelledby="auto-supp-journal-title" style={sectionStyle}>
          <div id="auto-supp-journal-title" style={sectionHeaderStyle}>
            <span>Prediction Journal workflow audit</span>
            <span style={sectionHeaderMetaStyle}>{journalAudit.scoredEntries} scored of {journalAudit.capturedEntries} captured</span>
          </div>
          {journalAudit.scoredEntries ? (
            <>
              <div style={journalMetricGridStyle}>
                <Metric label="Average hits" value={formatDecimal(journalAudit.meanHits)} detail="user-selected entry sample" />
                <Metric label="0 hit" value={String(journalAudit.zeroHits)} detail="miss" />
                <Metric label="1 hit" value={String(journalAudit.oneHit)} detail="partial" />
                <Metric label="2 hit" value={String(journalAudit.twoHits)} detail="exact pair" />
              </div>
              <div style={journalScrollStyle}>
                <table style={{ ...tableStyle, minWidth: 620 }}>
                  <thead>
                    <tr>
                      <th style={thLeftStyle}>Target</th>
                      <th style={thLeftStyle}>Suggested supps</th>
                      <th style={thLeftStyle}>Actual supps</th>
                      <th style={thStyle}>Hits</th>
                      <th style={thLeftStyle}>Entry state</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journalAudit.rows.slice(0, 20).map((row) => (
                      <tr key={row.entryId}>
                        <td style={tdLeftStyle}>{row.targetDate}</td>
                        <td style={tdLeftStyle}>{formatNumbers(row.predictedSupp)}</td>
                        <td style={tdLeftStyle}>{formatNumbers(row.actualSupp)}</td>
                        <td style={tdStyle}>{row.hits}/2</td>
                        <td style={tdLeftStyle}>{row.archived ? "Archived" : "Active"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={emptyStyle}>
              No saved Auto supp entry has a real target result yet. Prediction Journal entries remain a user-selected workflow sample and are never used to train or promote the historical model.
            </div>
          )}
        </section>

        <section aria-labelledby="auto-supp-ledger-title" style={sectionStyle}>
          <div id="auto-supp-ledger-title" style={sectionHeaderStyle}>
            <span>Versioned walk-forward ledger</span>
            <span style={sectionHeaderMetaStyle}>latest {latestRecords.length} of {result.records.length}</span>
          </div>
          <div style={ledgerScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 1120 }}>
              <thead>
                <tr>
                  <th style={thLeftStyle}>Target</th>
                  <th style={thStyle}>Prior draws</th>
                  <th style={thStyle}>WFMQYH-length window</th>
                  <th style={thLeftStyle}>Actual supps</th>
                  <th style={thLeftStyle}>Current method</th>
                  <th style={thStyle}>Hits</th>
                  <th style={thLeftStyle}>Role-rate</th>
                  <th style={thStyle}>Hits</th>
                  <th style={thLeftStyle}>Pair blend</th>
                  <th style={thStyle}>Hits</th>
                  <th style={thLeftStyle}>Policy before draw</th>
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

const GateCard: React.FC<{ gate: DgaAutoSuppChallengerGate }> = ({ gate }) => (
  <div style={gateStyle(gate.status)}>
    <div style={decisionHeadingStyle}>
      <span>{MODEL_SHORT_LABELS[gate.model]}</span>
      <span>{GATE_LABELS[gate.status]}</span>
    </div>
    <div style={gateDeltaStyle}>{formatSigned(gate.averagePairedDifference)} hits/draw</div>
    <div style={finePrintStyle}>Paired 95% interval: {formatCi(gate.pairedDifferenceCi)}</div>
    <div style={finePrintStyle}>{gate.reason}</div>
  </div>
);

const LedgerRow: React.FC<{ record: DgaAutoSuppAuditRecord }> = ({ record }) => (
  <tr>
    <td style={tdLeftStyle}>{record.targetDate}</td>
    <td style={tdStyle}>{record.trainingDraws}</td>
    <td style={tdStyle}>{record.activeWindowDraws}</td>
    <td style={tdLeftStyle}>{formatNumbers(record.actualSupp)}</td>
    <td style={tdLeftStyle}>{formatNumbers(record.champion.pair)}</td>
    <td style={tdStyle}>{record.champion.hits}/2</td>
    <td style={tdLeftStyle}>{formatNumbers(record.roleRate.pair)}</td>
    <td style={tdStyle}>{record.roleRate.hits}/2</td>
    <td style={tdLeftStyle}>{formatNumbers(record.pairBlend.pair)}</td>
    <td style={tdStyle}>{record.pairBlend.hits}/2</td>
    <td style={tdLeftStyle}>{MODEL_SHORT_LABELS[record.policyModelBeforeDraw]} · {GATE_LABELS[record.gateStatusBeforeDraw]}</td>
  </tr>
);

const formatNumbers = (numbers: readonly number[]): string => numbers.length ? numbers.join(", ") : "none";
const formatDecimal = (value: number): string => value.toFixed(2);
const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const formatSigned = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
const formatCi = (ci: [number, number] | null): string => ci
  ? `${formatSigned(ci[0])} to ${formatSigned(ci[1])}`
  : "not available";

const contentStyle: React.CSSProperties = { padding: "12px", display: "grid", gap: 12 };
const truthBannerStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  border: "1px solid #b9d7f3",
  background: "#f3f8fd",
  color: "#18344f",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 13,
  lineHeight: 1.45,
};
const scopeStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "6px 12px", color: "#52606d", fontSize: 12 };
const metricGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 8 };
const journalMetricGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 8 };
const metricStyle: React.CSSProperties = { border: "1px solid #dbe4ec", background: "#fff", borderRadius: 8, padding: "9px 10px", minWidth: 0 };
const metricLabelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "#607080", letterSpacing: 0 };
const metricValueStyle: React.CSSProperties = { marginTop: 3, color: "#15283a", fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 };
const pairGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 };
const pairCardStyle = (recommended: boolean): React.CSSProperties => ({
  border: `1px solid ${recommended ? "#86b8e8" : "#dbe4ec"}`,
  background: recommended ? "#f1f7fd" : "#fff",
  borderRadius: 8,
  padding: "10px 12px",
});
const pairValueStyle: React.CSSProperties = { color: "#0a4f8a", fontSize: 22, fontWeight: 800, margin: "5px 0", fontVariantNumeric: "tabular-nums" };
const sectionStyle: React.CSSProperties = { display: "grid", gap: 7 };
const sectionHeaderStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, color: "#203548", fontWeight: 800, fontSize: 13 };
const sectionHeaderMetaStyle: React.CSSProperties = { color: "#66788a", fontSize: 11, fontWeight: 600 };
const tableScrollStyle: React.CSSProperties = { overflowX: "auto", border: "1px solid #dce5ed", borderRadius: 8, background: "#fff" };
const ledgerScrollStyle: React.CSSProperties = { ...tableScrollStyle, maxHeight: 360, overflowY: "auto" };
const journalScrollStyle: React.CSSProperties = { ...tableScrollStyle, maxHeight: 260, overflowY: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12, fontVariantNumeric: "tabular-nums" };
const stickyHeaderBase: React.CSSProperties = { position: "sticky", top: 0, zIndex: 2, background: "#edf3f8", color: "#354a5f", borderBottom: "1px solid #cbd7e2", padding: "7px 8px", whiteSpace: "nowrap" };
const thStyle: React.CSSProperties = { ...stickyHeaderBase, textAlign: "center" };
const thLeftStyle: React.CSSProperties = { ...stickyHeaderBase, textAlign: "left" };
const tdStyle: React.CSSProperties = { textAlign: "center", padding: "7px 8px", borderBottom: "1px solid #edf1f4", color: "#27394b" };
const tdLeftStyle: React.CSSProperties = { ...tdStyle, textAlign: "left" };
const randomTdStyle: React.CSSProperties = { ...tdLeftStyle, background: "#f8fafc" };
const finePrintStyle: React.CSSProperties = { color: "#647486", fontSize: 11, lineHeight: 1.4 };
const recommendedPillStyle: React.CSSProperties = { display: "inline-block", marginLeft: 7, padding: "1px 6px", borderRadius: 999, background: "#dceefd", color: "#0b5f9e", fontSize: 9, fontWeight: 800, textTransform: "uppercase" };
const gateGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 };
const gateStyle = (status: DgaAutoSuppGateStatus): React.CSSProperties => ({
  border: `1px solid ${status === "promote-challenger" ? "#9fd4b0" : status === "watch-challenger" ? "#efd18f" : "#dbe4ec"}`,
  background: status === "promote-challenger" ? "#f2fbf5" : status === "watch-challenger" ? "#fffaf0" : "#fff",
  borderRadius: 8,
  padding: "10px 12px",
});
const currentGateStyle = (status: DgaAutoSuppCurrentGateStatus): React.CSSProperties => ({
  border: `1px solid ${status === "validated-lift" ? "#9fd4b0" : status === "no-validated-lift" ? "#efc5c0" : "#dbe4ec"}`,
  background: status === "validated-lift" ? "#f2fbf5" : status === "no-validated-lift" ? "#fff7f6" : "#fff",
  borderRadius: 8,
  padding: "10px 12px",
});
const decisionHeadingStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, color: "#263b4d", fontSize: 12, fontWeight: 800 };
const gateDeltaStyle: React.CSSProperties = { color: "#0b5f9e", fontSize: 18, fontWeight: 800, margin: "5px 0", fontVariantNumeric: "tabular-nums" };
const emptyStyle: React.CSSProperties = { border: "1px dashed #cbd6df", borderRadius: 8, padding: "10px 12px", color: "#637487", fontSize: 12, lineHeight: 1.45, background: "#fafcfd" };

export default DgaAutoSuppLearningAuditPanel;

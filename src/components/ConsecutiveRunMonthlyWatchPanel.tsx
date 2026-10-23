import React from "react";

import type {
  ConsecutiveRunDroughtFamily,
  ConsecutiveRunDroughtFamilyRow,
  ConsecutiveRunMonthRow,
  ConsecutiveRunMonthlyWatchResult,
  ConsecutiveRunOccurrence,
} from "../lib/consecutiveRunMonthlyWatch";
import { InfoHelp } from "./shared/HigControls";

export interface ConsecutiveRunMonthlyWatchPanelProps {
  analysis: ConsecutiveRunMonthlyWatchResult;
}

const percent = (value: number | null, digits = 1): string => (
  value === null ? "n/a" : `${(value * 100).toFixed(digits)}%`
);

const percentagePointLift = (value: number | null): string => {
  if (value === null) return "n/a";
  const points = value * 100;
  return `${points >= 0 ? "+" : ""}${points.toFixed(1)}pp`;
};

const formatRun = (numbers: readonly number[]): string => numbers.join("–");

const formatOccurrence = (occurrence: ConsecutiveRunOccurrence): string => (
  `D${occurrence.drawOrdinal} ${occurrence.runs.map((run) => formatRun(run.numbers)).join(" · ")}`
);

const sampleColor = (quality: string): string => {
  if (quality === "Developing") return "#0a7f42";
  if (quality === "Thin") return "#9a6700";
  if (quality === "Very thin") return "#b54708";
  return "#6e6e73";
};

const droughtFamilyColor = (family: ConsecutiveRunDroughtFamily): string => {
  if (family === "strict") return "#b42318";
  if (family === "empirical") return "#1557b0";
  return "#5856d6";
};

const droughtFamilyAt = (
  rows: readonly ConsecutiveRunDroughtFamilyRow[],
  family: ConsecutiveRunDroughtFamily,
): ConsecutiveRunDroughtFamilyRow | null => rows.find((row) => row.family === family) ?? null;

const StatTile: React.FC<{ label: string; value: React.ReactNode; detail: React.ReactNode }> = ({
  label,
  value,
  detail,
}) => (
  <div style={{ minWidth: 0, padding: "12px 14px", border: "1px solid #d8d8dc", borderRadius: 8, background: "#fff" }}>
    <div style={{ color: "#6e6e73", fontSize: 11, fontWeight: 700 }}>{label}</div>
    <div style={{ marginTop: 4, color: "#1d1d1f", fontSize: 20, fontWeight: 750, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    <div style={{ marginTop: 4, color: "#5f6368", fontSize: 11, lineHeight: 1.4 }}>{detail}</div>
  </div>
);

const monthOccurrenceText = (month: ConsecutiveRunMonthRow): string => {
  if (!month.occurrences.length) return "None";
  return month.occurrences.map(formatOccurrence).join(" · ");
};

export const ConsecutiveRunMonthlyWatchPanel: React.FC<ConsecutiveRunMonthlyWatchPanelProps> = ({ analysis }) => {
  const current = analysis.currentState;
  const droughtCrossCheck = analysis.droughtKeyCrossCheck;
  const d13 = analysis.stageRows.find((row) => row.drawOrdinal === 13) ?? null;
  const latestMonthRows = [...analysis.monthRows].reverse();
  const firstCurrentOccurrence = current?.firstOccurrenceOrdinal
    ? current.occurrences.find((occurrence) => occurrence.drawOrdinal === current.firstOccurrenceOrdinal) ?? null
    : null;
  const currentEvidenceAvailable = current?.observationCompleteThroughLatestDraw ?? false;
  const nextEvidence = current?.nextStageEvidence ?? null;

  return (
    <div style={{ display: "grid", gap: 14, paddingTop: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
          padding: "12px 14px",
          border: "1px solid #a8c7fa",
          borderRadius: 8,
          background: "#f4f8ff",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 520px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ color: "#1d1d1f", fontSize: 14 }}>Current month watch</strong>
            <span style={{ padding: "2px 7px", borderRadius: 999, background: !currentEvidenceAvailable ? "#fff3e0" : firstCurrentOccurrence ? "#e8f5ee" : "#e8f0fe", color: !currentEvidenceAvailable ? "#9a4d00" : firstCurrentOccurrence ? "#0a6b3b" : "#1557b0", fontSize: 11, fontWeight: 750 }}>
              {!currentEvidenceAvailable ? "Incomplete" : firstCurrentOccurrence ? "Observed" : "Watching"}
            </span>
            <InfoHelp label="How the current month watch works">
              Windfall looks only at valid real mains plus supplementary results already recorded for the month. It reports whether a run of at least three consecutive whole numbers has appeared. It never fills a missing draw, invents an occurrence, or changes candidate generation.
            </InfoHelp>
          </div>
          {current ? (
            !currentEvidenceAvailable ? (
              <div style={{ marginTop: 6, color: "#6e4b00", fontSize: 12, lineHeight: 1.5 }}>
                <strong>{current.targetMonthLabel}</strong> has a missing earlier scheduled draw. Windfall will not claim a first occurrence until the recorded month is complete through its latest draw.
              </div>
            ) : firstCurrentOccurrence ? (
              <div style={{ marginTop: 6, color: "#2f3133", fontSize: 12, lineHeight: 1.5 }}>
                <strong>{current.targetMonthLabel}</strong> recorded its first run at D{firstCurrentOccurrence.drawOrdinal}: {firstCurrentOccurrence.runs.map((run) => formatRun(run.numbers)).join(" · ")}. Next target D{current.targetDrawOrdinal} of {current.targetMonthExpectedDrawCount}; later runs are recorded as repeat occurrences.
              </div>
            ) : (
              <div style={{ marginTop: 6, color: "#2f3133", fontSize: 12, lineHeight: 1.5 }}>
                <strong>{current.targetMonthLabel}</strong> has no recorded run through D{current.completedDrawCount}. For target D{current.targetDrawOrdinal} of {current.targetMonthExpectedDrawCount}, historical first-occurrence evidence is {nextEvidence ? `${nextEvidence.firstOccurrenceCount}/${nextEvidence.firstRiskTrials} (${percent(nextEvidence.conditionalFirstRate)})` : "unavailable"}; exact per-draw random baseline {percent(analysis.exactRandomDrawRate, 2)}.
              </div>
            )
          ) : (
            <div style={{ marginTop: 6, color: "#6e6e73", fontSize: 12 }}>No valid real draw context is available.</div>
          )}
        </div>
        <div style={{ color: "#4f5965", fontSize: 11, lineHeight: 1.45, textAlign: "right" }}>
          <strong>{analysis.modelVersion}</strong><br />
          Observe-only · mains + supps<br />
          No generation influence
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <StatTile
          label="COMPLETED MONTHS WITH A RUN"
          value={`${analysis.completedMonthsWithOccurrence}/${analysis.completedMonthCount}`}
          detail={`Expected ${analysis.expectedCompletedMonthsWithOccurrence.toFixed(2)} under the exact independent-draw baseline; chance of at least this many ${percent(analysis.completedMonthTailProbability)}.`}
        />
        <StatTile
          label="EXACT PER-DRAW BASELINE"
          value={percent(analysis.exactRandomDrawRate, 2)}
          detail={`${analysis.exactCombinationCount.toLocaleString()} of ${analysis.totalCombinationCount.toLocaleString()} unordered 8-from-45 combinations contain a run of 3 or more.`}
        />
        <StatTile
          label="D13 · ANY RUN"
          value={d13 ? `${d13.occurrenceCount}/${d13.trials}` : "n/a"}
          detail={d13 ? `${percent(d13.occurrenceRate)} at D13, including both first and repeat occurrences.` : "No D13 evidence is available."}
        />
        <StatTile
          label="D13 · FIRST-RUN WATCH"
          value={d13 ? `${d13.firstOccurrenceCount}/${d13.firstRiskTrials}` : "n/a"}
          detail={d13 ? `${percent(d13.conditionalFirstRate)} among months still without a run; ${d13.sampleQuality.toLowerCase()} sample.` : "No D13 at-risk sample is available."}
        />
      </div>

      <section style={{ border: "1px solid #c7c7cc", borderRadius: 8, background: "#f9f9fb", padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <strong style={{ color: "#1d1d1f", fontSize: 13 }}>Drought key cross-check</strong>
            <span style={{ padding: "2px 7px", borderRadius: 999, background: "#e8f0fe", color: "#1557b0", fontSize: 10.5, fontWeight: 750 }}>
              Observe-only
            </span>
            <InfoHelp label="How the drought key cross-check works">
              For each historical consecutive run, Windfall rebuilds the Strict and Empirical top-eight drought lists using only real draws recorded before that target draw. Observed overlap is compared with how much of the 1–45 field each list would cover across every possible contiguous start of the same run length. This is a no-lookahead cross-check, not a probability that a future run will contain a drought number.
            </InfoHelp>
          </div>
          <div style={{ color: "#6e6e73", fontSize: 10.5, textAlign: "right" }}>
            {droughtCrossCheck.modelVersion} · {droughtCrossCheck.eligibleTargetDraws} target draws · {droughtCrossCheck.eligibleRunSequences} run sequences
          </div>
        </div>

        <div style={{ marginTop: 9, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8 }}>
          {droughtCrossCheck.familyRows.map((row) => (
            <div key={row.family} style={{ minWidth: 0, padding: "10px 11px", border: "1px solid #dedee3", borderRadius: 7, background: "#fff" }}>
              <div style={{ color: droughtFamilyColor(row.family), fontSize: 11, fontWeight: 800 }}>{row.label}</div>
              <div style={{ marginTop: 3, color: "#1d1d1f", fontSize: 18, fontWeight: 750, fontVariantNumeric: "tabular-nums" }}>
                {row.observedSequenceCount}/{row.sequenceTrials}
              </div>
              <div style={{ marginTop: 3, color: "#515154", fontSize: 10.5, lineHeight: 1.45 }}>
                Observed {percent(row.observedSequenceRate)} · coverage {percent(row.expectedSequenceRate)} · lift {percentagePointLift(row.lift)}
              </div>
              <div style={{ marginTop: 2, color: "#6e6e73", fontSize: 10.5 }}>
                Upper-tail {percent(row.upperTailProbability)} · {row.sampleQuality.toLowerCase()}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 9, display: "flex", gap: 6, flexWrap: "wrap" }} aria-label="Drought-list source membership within observed runs">
          {droughtCrossCheck.sourceRows.map((row) => (
            <span key={row.source} style={{ padding: "4px 7px", border: "1px solid #d8d8dc", borderRadius: 6, background: "#fff", color: "#3a3a3c", fontSize: 10.5, fontVariantNumeric: "tabular-nums" }}>
              <strong>{row.label}</strong> · {row.memberCount} members · {row.sequenceCount} sequences
            </span>
          ))}
        </div>

        <details style={{ marginTop: 10, borderTop: "1px solid #dedee3", paddingTop: 8 }}>
          <summary style={{ cursor: "pointer", color: "#1d1d1f", fontSize: 11.5, fontWeight: 750 }}>Draw-ordinal drought cross-check</summary>
          <div style={{ marginTop: 8, maxHeight: 330, overflow: "auto", border: "1px solid #dedee3", borderRadius: 7, background: "#fff" }}>
            <table style={{ width: "100%", minWidth: 920, borderCollapse: "separate", borderSpacing: 0, fontSize: 10.5, fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr>
                  {["Stage", "Target draws", "Sequences", "Strict obs / coverage", "Empirical obs / coverage", "Either obs / coverage", "Sample"].map((label) => (
                    <th key={label} scope="col" style={{ position: "sticky", top: 0, zIndex: 1, padding: "7px 8px", borderBottom: "1px solid #c7c7cc", background: "#f5f5f7", color: "#3a3a3c", textAlign: label === "Stage" || label === "Sample" ? "left" : "right", whiteSpace: "nowrap" }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {droughtCrossCheck.stageRows.map((row) => {
                  const strict = droughtFamilyAt(row.familyRows, "strict");
                  const empirical = droughtFamilyAt(row.familyRows, "empirical");
                  const union = droughtFamilyAt(row.familyRows, "union");
                  const familyCell = (family: ConsecutiveRunDroughtFamilyRow | null): string => family
                    ? `${family.observedSequenceCount}/${family.sequenceTrials} · ${percent(family.observedSequenceRate)} / ${percent(family.expectedSequenceRate)} · ${percentagePointLift(family.lift)}`
                    : "n/a";
                  return (
                    <tr key={row.drawOrdinal}>
                      <th scope="row" style={{ padding: "7px 8px", borderBottom: "1px solid #ececef", textAlign: "left" }}>D{row.drawOrdinal}</th>
                      <td style={{ padding: "7px 8px", borderBottom: "1px solid #ececef", textAlign: "right" }}>{row.targetDraws}</td>
                      <td style={{ padding: "7px 8px", borderBottom: "1px solid #ececef", textAlign: "right" }}>{row.sequenceTrials}</td>
                      <td style={{ padding: "7px 8px", borderBottom: "1px solid #ececef", textAlign: "right", color: droughtFamilyColor("strict") }}>{familyCell(strict)}</td>
                      <td style={{ padding: "7px 8px", borderBottom: "1px solid #ececef", textAlign: "right", color: droughtFamilyColor("empirical") }}>{familyCell(empirical)}</td>
                      <td style={{ padding: "7px 8px", borderBottom: "1px solid #ececef", textAlign: "right", color: droughtFamilyColor("union") }}>{familyCell(union)}</td>
                      <td style={{ padding: "7px 8px", borderBottom: "1px solid #ececef", textAlign: "left", color: sampleColor(row.sampleQuality), fontWeight: 700 }}>{row.sampleQuality}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>

        <div style={{ marginTop: 8, color: "#6e6e73", fontSize: 10.5, lineHeight: 1.45 }}>
          Expanding all-prior-real-history replay · minimum {droughtCrossCheck.minTrainingDraws} prior draws · top {droughtCrossCheck.topK} per drought list. Multiple runs in one draw are related observations, so upper-tail values are descriptive rather than a formal independent-trial claim.
          {droughtCrossCheck.warnings.length ? ` ${droughtCrossCheck.warnings.join(" ")}` : ""}
        </div>
      </section>

      <div style={{ borderTop: "1px solid #d8d8dc", paddingTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 8 }}>
          <strong style={{ color: "#1d1d1f", fontSize: 13 }}>First-occurrence survival by monthly draw ordinal</strong>
          <InfoHelp label="How to read first-occurrence survival">
            First-risk is the number of months that reached this draw without an earlier run. First at D is how many of those months recorded their first run here. Cumulative is the share of months that had recorded at least one run by this stage. The random comparison is exact combinatorics, not simulated data.
          </InfoHelp>
        </div>
        <div style={{ maxHeight: 390, overflow: "auto", border: "1px solid #d8d8dc", borderRadius: 8, background: "#fff" }}>
          <table style={{ width: "100%", minWidth: 940, borderCollapse: "separate", borderSpacing: 0, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr>
                {[
                  "Stage",
                  "Trials",
                  "Any run at D",
                  "First-risk",
                  "First at D",
                  "Conditional first",
                  "Cumulative by D",
                  "Random cumulative",
                  "Sample",
                ].map((label) => (
                  <th key={label} scope="col" style={{ position: "sticky", top: 0, zIndex: 1, padding: "8px 9px", borderBottom: "1px solid #c7c7cc", background: "#f5f5f7", color: "#3a3a3c", textAlign: label === "Stage" || label === "Sample" ? "left" : "right", whiteSpace: "nowrap" }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analysis.stageRows.map((row) => (
                <tr key={row.drawOrdinal} style={{ background: current?.targetDrawOrdinal === row.drawOrdinal ? "#f4f8ff" : "#fff" }}>
                  <th scope="row" style={{ padding: "7px 9px", borderBottom: "1px solid #ececef", color: "#1d1d1f", textAlign: "left" }}>D{row.drawOrdinal}</th>
                  <td style={{ padding: "7px 9px", borderBottom: "1px solid #ececef", textAlign: "right" }}>{row.trials}</td>
                  <td style={{ padding: "7px 9px", borderBottom: "1px solid #ececef", textAlign: "right" }}>{row.occurrenceCount}/{row.trials} · {percent(row.occurrenceRate)}</td>
                  <td style={{ padding: "7px 9px", borderBottom: "1px solid #ececef", textAlign: "right" }}>{row.firstRiskTrials}</td>
                  <td style={{ padding: "7px 9px", borderBottom: "1px solid #ececef", textAlign: "right" }}>{row.firstOccurrenceCount}</td>
                  <td style={{ padding: "7px 9px", borderBottom: "1px solid #ececef", textAlign: "right" }}>{percent(row.conditionalFirstRate)}</td>
                  <td style={{ padding: "7px 9px", borderBottom: "1px solid #ececef", textAlign: "right" }}>{row.cumulativeOccurrenceCount}/{row.trials} · {percent(row.cumulativeOccurrenceRate)}</td>
                  <td style={{ padding: "7px 9px", borderBottom: "1px solid #ececef", textAlign: "right" }}>{percent(row.exactRandomCumulativeRate)}</td>
                  <td style={{ padding: "7px 9px", borderBottom: "1px solid #ececef", color: sampleColor(row.sampleQuality), fontWeight: 700, textAlign: "left" }}>{row.sampleQuality}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <details style={{ border: "1px solid #d8d8dc", borderRadius: 8, background: "#fff", padding: "10px 12px" }}>
        <summary style={{ cursor: "pointer", color: "#1d1d1f", fontSize: 12, fontWeight: 750 }}>Occurrence ledger by month</summary>
        <div style={{ marginTop: 9, maxHeight: 320, overflow: "auto", border: "1px solid #ececef", borderRadius: 6 }}>
          <table style={{ width: "100%", minWidth: 650, borderCollapse: "separate", borderSpacing: 0, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr>
                {[
                  "Month",
                  "Recorded / scheduled",
                  "First run",
                  "Observed runs",
                  "State",
                ].map((label) => (
                  <th key={label} scope="col" style={{ position: "sticky", top: 0, zIndex: 1, padding: "8px 9px", borderBottom: "1px solid #c7c7cc", background: "#f5f5f7", color: "#3a3a3c", textAlign: "left" }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {latestMonthRows.map((month) => (
                <tr key={month.monthLabel}>
                  <th scope="row" style={{ padding: "7px 9px", borderBottom: "1px solid #ececef", textAlign: "left" }}>{month.monthLabel}</th>
                  <td style={{ padding: "7px 9px", borderBottom: "1px solid #ececef" }}>{month.recordedDrawCount}/{month.expectedDrawCount}</td>
                  <td style={{ padding: "7px 9px", borderBottom: "1px solid #ececef" }}>{month.firstOccurrenceOrdinal ? `D${month.firstOccurrenceOrdinal}` : "None"}</td>
                  <td style={{ padding: "7px 9px", borderBottom: "1px solid #ececef" }}>{monthOccurrenceText(month)}</td>
                  <td style={{ padding: "7px 9px", borderBottom: "1px solid #ececef", color: month.complete ? "#3a3a3c" : "#1557b0" }}>{month.complete ? "Complete" : "In progress"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div style={{ borderLeft: "3px solid #ff9f0a", padding: "9px 11px", background: "#fff8eb", color: "#5c4600", fontSize: 11, lineHeight: 1.5 }}>
        <strong>Truthfulness boundary:</strong> this is one evidence family. D-stage rows, cumulative incidence, D13 survival, and the drought key cross-check are related views of the same run occurrences and must not be counted as independent votes. The drought lists are dependencies used for cross-checking, not extra Signal Confluence support. The watch updates only when valid real draws are added; it does not boost, reject, rank, or construct candidates.
      </div>

      <div style={{ color: "#6e6e73", fontSize: 10.5, lineHeight: 1.45 }}>
        {analysis.scopeLabel}. Valid real draws {analysis.validRealDraws}; baseline draws {analysis.baselineRealDraws}; invalid or duplicate rows excluded {analysis.excludedHistoryRows}; simulated rows ignored {analysis.simulatedRowsIgnored}.
        {analysis.warnings.length ? ` ${analysis.warnings.join(" ")}` : ""}
      </div>
    </div>
  );
};

export default ConsecutiveRunMonthlyWatchPanel;

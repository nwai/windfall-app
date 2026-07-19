import React, { useMemo, useState } from "react";

import type { Draw } from "../types";
import {
  analyzeMonthlyBucketTransitions,
  MONTHLY_TRANSITION_BUCKET_LABELS,
  type MonthlyBucketExpectationRow,
  type MonthlyBucketFirstReachRow,
  type MonthlyHeatBucketRow,
  type MonthlyLengthComparisonRow,
  type MonthlyTransitionLengthFilter,
  type MonthlyUndrawnSurvivalRow,
} from "../lib/monthlyBucketTransitions";
import { HigField, InfoHelp } from "./shared/HigControls";

interface MonthlyBucketTransitionLabPanelProps {
  history: Draw[];
}

type MonthLengthControl = "auto" | MonthlyTransitionLengthFilter;

const panelStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#fff",
  padding: 12,
};

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  flexWrap: "wrap",
  margin: "12px 0",
};

const selectStyle: React.CSSProperties = {
  minHeight: 34,
  border: "1px solid #cbd5e1",
  borderRadius: 7,
  background: "#fff",
  color: "#0f172a",
  padding: "5px 8px",
  fontWeight: 700,
};

const metricGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
  gap: 8,
  margin: "10px 0 12px",
};

const metricStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#f8fafc",
  padding: "9px 10px",
};

const sectionStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#fff",
  padding: 10,
  marginTop: 10,
};

const tableWrapStyle: React.CSSProperties = {
  overflow: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  maxHeight: 360,
};

const thStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  padding: "8px 9px",
  borderBottom: "1px solid #e5e7eb",
  background: "#f8fafc",
  color: "#475569",
  fontSize: 12,
  textAlign: "left",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "7px 9px",
  borderBottom: "1px solid #f1f5f9",
  color: "#0f172a",
  fontSize: 12,
  verticalAlign: "middle",
  fontVariantNumeric: "tabular-nums",
};

const noteStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.45,
};

const warnStyle: React.CSSProperties = {
  marginTop: 8,
  border: "1px solid #fde68a",
  borderRadius: 8,
  background: "#fffbeb",
  color: "#92400e",
  padding: "8px 10px",
  fontSize: 12,
  lineHeight: 1.45,
};

const bucketColor = (bucket: number): string => {
  if (bucket === 0) return "#2563eb";
  if (bucket <= 2) return "#0f766e";
  if (bucket <= 4) return "#9333ea";
  if (bucket <= 5) return "#c2410c";
  return "#b91c1c";
};

const heatTierStyle = (tier: string): React.CSSProperties => {
  if (tier === "hot") return { color: "#b91c1c", background: "#fee2e2", borderColor: "#fecaca" };
  if (tier === "cold") return { color: "#1d4ed8", background: "#dbeafe", borderColor: "#bfdbfe" };
  if (tier === "middle") return { color: "#365314", background: "#ecfccb", borderColor: "#d9f99d" };
  return { color: "#475569", background: "#f1f5f9", borderColor: "#e2e8f0" };
};

const fmtPct = (value: number | null | undefined): string => (
  value === null || value === undefined || !Number.isFinite(value) ? "n/a" : `${(value * 100).toFixed(1)}%`
);

const fmtNum = (value: number | null | undefined, digits = 1): string => (
  value === null || value === undefined || !Number.isFinite(value) ? "n/a" : value.toFixed(digits)
);

const formatLength = (length: MonthlyTransitionLengthFilter): string => (
  length === "all" ? "All lengths" : `${length}d months`
);

const Metric: React.FC<{ label: string; value: React.ReactNode; detail?: React.ReactNode }> = ({ label, value, detail }) => (
  <div style={metricStyle}>
    <div style={{ color: "#64748b", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0 }}>
      {label}
    </div>
    <div style={{ color: "#0f172a", fontSize: 20, fontWeight: 900, marginTop: 2 }}>
      {value}
    </div>
    {detail ? <div style={{ ...noteStyle, marginTop: 2 }}>{detail}</div> : null}
  </div>
);

const BucketPill: React.FC<{ bucket: number; label?: string }> = ({ bucket, label }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 54,
      height: 24,
      padding: "0 8px",
      borderRadius: 999,
      border: `1px solid ${bucketColor(bucket)}`,
      color: bucketColor(bucket),
      background: "#fff",
      fontWeight: 900,
      fontSize: 12,
      whiteSpace: "nowrap",
    }}
  >
    {label ?? MONTHLY_TRANSITION_BUCKET_LABELS[bucket]}
  </span>
);

const SectionHeader: React.FC<{
  title: string;
  helpLabel: string;
  children: React.ReactNode;
}> = ({ title, helpLabel, children }) => (
  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
    <strong style={{ color: "#0f172a" }}>{title}</strong>
    <InfoHelp label={helpLabel}>
      <div style={{ display: "grid", gap: 6 }}>
        {children}
      </div>
    </InfoHelp>
  </div>
);

const CurrentExpectationTable: React.FC<{ rows: MonthlyBucketExpectationRow[] }> = ({ rows }) => (
  <div style={tableWrapStyle}>
    <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={thStyle}>Bucket now</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Count now</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Trials</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Hits</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Raw rate</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Smoothed rate</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Expected next hits</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.bucket}>
            <td style={tdStyle}><BucketPill bucket={row.bucket} label={row.label} /></td>
            <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800 }}>{row.currentCount}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{row.trials}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{row.hits}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{fmtPct(row.rawRate)}</td>
            <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800 }}>{fmtPct(row.smoothedRate)}</td>
            <td style={{ ...tdStyle, textAlign: "right", fontWeight: 900 }}>{fmtNum(row.expectedHits)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const UndrawnSurvivalTable: React.FC<{ rows: MonthlyUndrawnSurvivalRow[] }> = ({ rows }) => (
  <div style={tableWrapStyle}>
    <table style={{ width: "100%", minWidth: 860, borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={thStyle}>Draw</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Months</th>
          <th style={{ ...thStyle, textAlign: "right" }}>At risk</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Broke</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Raw break</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Smoothed break</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Survival est.</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Median undrawn after</th>
          <th style={{ ...thStyle, textAlign: "right" }}>IQR after</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.drawOrdinal}>
            <td style={{ ...tdStyle, fontWeight: 900 }}>D{row.drawOrdinal}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{row.monthsWithStage}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{row.trials}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{row.breaks}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{fmtPct(row.rawBreakRate)}</td>
            <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800 }}>{fmtPct(row.smoothedBreakRate)}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{fmtPct(row.estimatedSurvivalRate)}</td>
            <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800 }}>{fmtNum(row.medianUndrawnAfter)}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>
              {fmtNum(row.q1UndrawnAfter)} - {fmtNum(row.q3UndrawnAfter)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const FirstReachTable: React.FC<{ rows: MonthlyBucketFirstReachRow[] }> = ({ rows }) => (
  <div style={tableWrapStyle}>
    <table style={{ width: "100%", minWidth: 820, borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={thStyle}>Bucket reached</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Months reached</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Reach rate</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Reached by planning D</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Typical first D</th>
          <th style={{ ...thStyle, textAlign: "right" }}>First-D IQR</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Month-end median count</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.bucket}>
            <td style={tdStyle}><BucketPill bucket={row.bucket} label={row.label} /></td>
            <td style={{ ...tdStyle, textAlign: "right" }}>
              {row.monthsReached}/{row.monthsEligible}
            </td>
            <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800 }}>{fmtPct(row.reachedRate)}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>
              {row.reachedByPlanningStage}/{row.monthsEligible} ({fmtPct(row.reachedByPlanningStageRate)})
            </td>
            <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800 }}>
              {row.earliestDrawMedian === null ? "n/a" : `D${fmtNum(row.earliestDrawMedian)}`}
            </td>
            <td style={{ ...tdStyle, textAlign: "right" }}>
              {row.earliestDrawQ1 === null || row.earliestDrawQ3 === null
                ? "n/a"
                : `D${fmtNum(row.earliestDrawQ1)} - D${fmtNum(row.earliestDrawQ3)}`}
            </td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{fmtNum(row.monthEndMedianCount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const MonthLengthComparisonTable: React.FC<{ rows: MonthlyLengthComparisonRow[] }> = ({ rows }) => (
  <div style={tableWrapStyle}>
    <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={thStyle}>Month length</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Months</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Complete</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Undrawn</th>
          <th style={{ ...thStyle, textAlign: "right" }}>1x</th>
          <th style={{ ...thStyle, textAlign: "right" }}>2x</th>
          <th style={{ ...thStyle, textAlign: "right" }}>3x</th>
          <th style={{ ...thStyle, textAlign: "right" }}>4x</th>
          <th style={{ ...thStyle, textAlign: "right" }}>5x</th>
          <th style={{ ...thStyle, textAlign: "right" }}>6x+</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.monthLength}>
            <td style={{ ...tdStyle, fontWeight: 900 }}>{row.monthLength} draws</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{row.months}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{row.completeMonths}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{fmtNum(row.medianUndrawnEnd)}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{fmtNum(row.median1xEnd)}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{fmtNum(row.median2xEnd)}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{fmtNum(row.median3xEnd)}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{fmtNum(row.median4xEnd)}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{fmtNum(row.median5xEnd)}</td>
            <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800 }}>{fmtNum(row.median6PlusEnd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const HeatBucketTable: React.FC<{ rows: MonthlyHeatBucketRow[] }> = ({ rows }) => (
  <div style={tableWrapStyle}>
    <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={thStyle}>Bucket before</th>
          <th style={thStyle}>Prior heat tier</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Trials</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Hits</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Raw rate</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Smoothed rate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const tierStyle = heatTierStyle(row.heatTier);
          return (
            <tr key={`${row.bucket}-${row.heatTier}`}>
              <td style={tdStyle}><BucketPill bucket={row.bucket} label={row.label} /></td>
              <td style={tdStyle}>
                <span
                  style={{
                    display: "inline-flex",
                    minWidth: 58,
                    justifyContent: "center",
                    borderRadius: 999,
                    border: `1px solid ${tierStyle.borderColor}`,
                    background: tierStyle.background,
                    color: tierStyle.color,
                    padding: "3px 8px",
                    fontWeight: 900,
                    textTransform: "capitalize",
                  }}
                >
                  {row.heatTier}
                </span>
              </td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{row.trials}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{row.hits}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{fmtPct(row.rawRate)}</td>
              <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800 }}>{fmtPct(row.smoothedRate)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export const MonthlyBucketTransitionLabPanel: React.FC<MonthlyBucketTransitionLabPanelProps> = ({ history }) => {
  const [includeSupp, setIncludeSupp] = useState(true);
  const [monthLengthControl, setMonthLengthControl] = useState<MonthLengthControl>("auto");

  const analysis = useMemo(() => analyzeMonthlyBucketTransitions(history, {
    includeSupp,
    monthLength: monthLengthControl === "auto" ? undefined : monthLengthControl,
  }), [history, includeSupp, monthLengthControl]);

  const planningDetail = analysis.planningState
    ? analysis.planningState.source === "planning-reset"
      ? `planning ${analysis.planningState.monthLabel} D1 after completed ${analysis.planningState.sourceMonthLabel}`
      : `${analysis.planningState.monthLabel} D${analysis.planningState.nextDrawOrdinal} after ${analysis.planningState.completedDrawCount} draw${analysis.planningState.completedDrawCount === 1 ? "" : "s"}`
    : "no valid planning state";

  const monthLengthValue = monthLengthControl === "auto"
    ? "auto"
    : String(monthLengthControl);
  const autoMonthLengthLabel = analysis.planningState
    && analysis.monthLengthOptions.includes(analysis.planningState.expectedDrawCount)
    ? formatLength(analysis.planningState.expectedDrawCount)
    : "All lengths";

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={noteStyle}>
            Observe-only transition evidence for monthly bucket movement. The lab asks what happened next from a known before-draw state; it does not influence generation.
          </div>
          <div style={{ ...noteStyle, marginTop: 4 }}>
            Scope: {analysis.scopeLabel}. Rates are empirical diagnostics, not calibrated lottery probabilities.
          </div>
        </div>
        <InfoHelp label="Monthly Bucket Transition Lab help">
          <span>Each number contributes one before-draw observation per draw. If it is drawn, it moves from its current monthly bucket to the next bucket; 8x+ is capped.</span>
          <span>Smoothed rates shrink thin stage evidence toward the full-history bucket rate so tiny samples do not overstate certainty.</span>
          <span>Month-end comparisons use completed months only. Incomplete months can still contribute to stages already observed.</span>
        </InfoHelp>
      </div>

      <div style={toolbarStyle}>
        <HigField
          label="Number scope"
          help="Default includes supplementary numbers because monthly bucket state treats all drawn balls as observations from the same 45-number pool."
        >
          <label style={{ display: "inline-flex", alignItems: "center", gap: 7, minHeight: 34, color: "#334155", fontSize: 12, fontWeight: 800 }}>
            <input
              type="checkbox"
              checked={includeSupp}
              onChange={(event) => setIncludeSupp(event.target.checked)}
            />
            Mains + supps
          </label>
        </HigField>

        <HigField
          label="Month-length evidence"
          help="Auto uses the planning month length when the history contains matching months; All lengths pools every baseline month."
        >
          <select
            value={monthLengthValue}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "auto") setMonthLengthControl("auto");
              else if (value === "all") setMonthLengthControl("all");
              else setMonthLengthControl(Number(value));
            }}
            style={selectStyle}
          >
            <option value="auto">Auto: {autoMonthLengthLabel}</option>
            <option value="all">All baseline month lengths</option>
            {analysis.monthLengthOptions.map((length) => (
              <option key={length} value={length}>{length} draw months</option>
            ))}
          </select>
        </HigField>
      </div>

      <div style={metricGridStyle}>
        <Metric label="Planning State" value={analysis.planningState ? `D${analysis.planningState.nextDrawOrdinal}` : "n/a"} detail={planningDetail} />
        <Metric label="Evidence Length" value={formatLength(analysis.selectedMonthLength)} detail={`${analysis.selectedMonthCount} matching month${analysis.selectedMonthCount === 1 ? "" : "s"}`} />
        <Metric label="Baseline Months" value={analysis.baselineMonthCount} detail={`${analysis.allMonthCount} visible month${analysis.allMonthCount === 1 ? "" : "s"}`} />
        <Metric label="Completed Month-Ends" value={analysis.selectedCompleteMonthCount} detail="used for final-shape rows" />
      </div>

      {analysis.warnings.length > 0 && (
        <div style={warnStyle}>
          <strong style={{ display: "block", marginBottom: 4 }}>Evidence notes</strong>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {analysis.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={sectionStyle}>
        <SectionHeader title="Current-Stage Transition Expectation" helpLabel="Current-stage transition expectation help">
          <span>For the next planning draw, this table takes the current bucket counts and applies the historically observed draw-hit rate for the same draw ordinal.</span>
          <span>Expected next hits is count now multiplied by the smoothed draw-hit rate. It is an expected count, not a forced target.</span>
        </SectionHeader>
        <CurrentExpectationTable rows={analysis.currentExpectations} />
      </div>

      <div style={sectionStyle}>
        <SectionHeader title="Undrawn Survival / Break Curve" helpLabel="Undrawn survival help">
          <span>At risk means number-draw observations that were still undrawn before that draw. Broke means the number appeared in that draw and moved to 1x.</span>
          <span>Median undrawn after shows the typical count of still-undrawn numbers after each draw stage in matching months.</span>
        </SectionHeader>
        <UndrawnSurvivalTable rows={analysis.undrawnSurvivalRows} />
      </div>

      <div style={sectionStyle}>
        <SectionHeader title="Upper-Bucket First Reach Timing" helpLabel="Upper-bucket first reach help">
          <span>This checks when a month first produces at least one number in 3x, 4x, 5x and rarer upper buckets.</span>
          <span>It is designed to test questions like whether 4x before D6 is normal or unusual, and whether 6x+ mostly belongs to longer months.</span>
        </SectionHeader>
        <FirstReachTable rows={analysis.firstReachRows} />
      </div>

      <div style={sectionStyle}>
        <SectionHeader title="Month-Length Final Shape Comparison" helpLabel="Month-length comparison help">
          <span>Completed months only. Each value is the median final bucket count for months with that draw count.</span>
          <span>This is where repeated 13d versus 14d differences should start to show up if they are real.</span>
        </SectionHeader>
        <MonthLengthComparisonTable rows={analysis.monthLengthComparisonRows} />
      </div>

      <div style={sectionStyle}>
        <SectionHeader title="Prior Heat x Monthly Bucket Relationship" helpLabel="Heat and bucket relationship help">
          <span>Prior heat is computed without lookahead from each number's cumulative historical count before the draw being measured.</span>
          <span>This table asks whether hot, middle, or cold numbers inside the same monthly bucket were more likely to be drawn next.</span>
        </SectionHeader>
        <HeatBucketTable rows={analysis.heatBucketRows} />
      </div>
    </section>
  );
};

export default MonthlyBucketTransitionLabPanel;

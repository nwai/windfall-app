import React, { useMemo, useState } from "react";

import type { Draw } from "../types";
import { type MlndDrawScope, type MlndRiskRow } from "../lib/mlndExclusionRisk";
import { buildMlndCalibratedAnalysis, selectMlndCalibrationBudget } from "../lib/mlndCalibration";
import { MlndCalibrationAudit } from "./MlndCalibrationAudit";

interface MostLikelyNotDrawnPanelProps {
  history: Draw[];
  allHistory?: Draw[];
  title?: string;
}

const BUDGET_OPTIONS = [12, 18, 24, 30, 37] as const;

const panelStyle: React.CSSProperties = {
  minWidth: 0,
  background: "#f8fafc",
  border: "1px solid #dbe3ef",
  borderRadius: 8,
  padding: 12,
};

const cardGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 8,
};

const cardStyle: React.CSSProperties = {
  minWidth: 0,
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "10px 12px",
};

const subtleTextStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.45,
};

const numberPillStyle = (tone: "comparison" | "watch" | "neutral" = "neutral"): React.CSSProperties => {
  const palette = {
    comparison: { background: "#eff6ff", border: "#bfdbfe", color: "#0f3a74" },
    watch: { background: "#fff1f2", border: "#fecdd3", color: "#9f1239" },
    neutral: { background: "#eff6ff", border: "#bfdbfe", color: "#0f3a74" },
  }[tone];
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 34,
    height: 30,
    padding: "0 9px",
    borderRadius: 999,
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: palette.color,
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
  };
};

const formatNumber = (value: number | null, digits = 2): string => (
  value != null && Number.isFinite(value) ? value.toFixed(digits) : "n/a"
);

const formatPercent = (value: number | null, digits = 1): string => (
  value == null ? "n/a" : `${formatNumber(value * 100, digits)}%`
);

const scopeLabel = (scope: MlndDrawScope): string => (
  scope === "mains" ? "Mains only (6 balls)" : "Mains + supps (8 balls)"
);

const riskTone = (row: MlndRiskRow): React.CSSProperties => {
  if (row.liftVsBaseline < 0.85) return { color: "#166534", fontWeight: 800 };
  if (row.liftVsBaseline > 1.15) return { color: "#be123c", fontWeight: 800 };
  return { color: "#334155", fontWeight: 750 };
};

export const MostLikelyNotDrawnPanel: React.FC<MostLikelyNotDrawnPanelProps> = ({
  history,
  allHistory,
}) => {
  const [scope, setScope] = useState<MlndDrawScope>("mainAndSupp");
  const [budget, setBudget] = useState<number>(37);
  const [minTrainingDraws, setMinTrainingDraws] = useState<number>(60);
  const [showRows, setShowRows] = useState<number>(45);

  const sourceHistory = allHistory?.length ? allHistory : history;
  const evidence = useMemo(
    () => buildMlndCalibratedAnalysis(sourceHistory, {
      scope,
      minTrainingDraws,
    }),
    [sourceHistory, scope, minTrainingDraws],
  );
  const budgetAudit = useMemo(() => selectMlndCalibrationBudget(evidence, budget), [evidence, budget]);
  const analysis = {
    historyScope: evidence.historyScope, rows: evidence.rows,
    excludedNumbers: budgetAudit.rawExcluded, allowedNumbers: budgetAudit.rawAllowed,
    watchNumbers: evidence.rows.slice().sort((a, b) => b.riskScore - a.riskScore || a.number - b.number).slice(0, 8).map(row => row.number),
    backtest: {
      meanFalseExcluded: budgetAudit.meanFalseExcluded, randomMeanFalseExcluded: budgetAudit.fairFalseExcluded,
      deltaVsRandom: budgetAudit.delta.mean, bootstrapCI: budgetAudit.delta.interval95,
      zeroFalseExclusionRate: evidence.evaluationDraws ? evidence.records.filter(row => row.adjustedBrier != null)
        .filter(row => !row.points.slice(0, budget).some(point => point.hit)).length / evidence.evaluationDraws : null,
      drawsEvaluated: evidence.evaluationDraws,
    },
  };

  const randomExpectedText = `${formatNumber(analysis.backtest.randomMeanFalseExcluded, 2)} drawn ball${Math.abs(analysis.backtest.randomMeanFalseExcluded - 1) < 0.01 ? "" : "s"}`;
  const modelExpectedText = `${formatNumber(analysis.backtest.meanFalseExcluded, 2)} drawn ball${Math.abs((analysis.backtest.meanFalseExcluded ?? 0) - 1) < 0.01 ? "" : "s"}`;
  const deltaTone = (analysis.backtest.deltaVsRandom ?? 0) > 0 ? "#166534" : (analysis.backtest.deltaVsRandom ?? 0) < 0 ? "#be123c" : "#334155";
  const excludedMonthsText = analysis.historyScope.excludedMonthLabels.length
    ? analysis.historyScope.excludedMonthLabels.join(", ")
    : "none";
  const visibleRows = evidence.currentTrainingDraws >= evidence.minTrainingDraws ? analysis.rows.slice(0, showRows) : [];

  return (
    <div style={panelStyle} role="region" aria-label="Most Likely NOT Drawn">
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 260, flex: "1 1 420px" }}>
            <div style={{ color: "#0f172a", fontWeight: 850, fontSize: 16 }}>Exclusion Risk Ledger</div>
            <div style={{ ...subtleTextStyle, marginTop: 3 }}>
              Sequentially adjusted risk estimates alongside the original raw diagnostic ranking. This does not force generator exclusions.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
            <label style={{ display: "grid", gap: 3, fontSize: 12, color: "#334155" }}>
              Scope
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value as MlndDrawScope)}
                style={{ minHeight: 32, borderRadius: 6, border: "1px solid #cbd5e1", padding: "4px 8px" }}
              >
                <option value="mainAndSupp">Mains + supps</option>
                <option value="mains">Mains only</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 3, fontSize: 12, color: "#334155" }}>
              Min training
              <input
                type="number"
                min={20}
                max={180}
                value={minTrainingDraws}
                onChange={(event) => setMinTrainingDraws(Math.max(20, Math.min(180, Number(event.target.value) || 60)))}
                style={{ width: 82, minHeight: 32, borderRadius: 6, border: "1px solid #cbd5e1", padding: "4px 8px" }}
              />
            </label>
          </div>
        </div>

        <div style={cardGridStyle}>
          <div style={cardStyle}>
            <div style={subtleTextStyle}>Evidence history</div>
            <div style={{ marginTop: 4, fontWeight: 850, color: "#0f172a" }}>
              {analysis.historyScope.usedDrawCount} draws
            </div>
            <div style={{ ...subtleTextStyle, marginTop: 3 }}>
              {analysis.historyScope.firstDate ?? "none"} to {analysis.historyScope.lastDate ?? "none"}
            </div>
          </div>
          <div style={cardStyle}>
            <div style={subtleTextStyle}>Windfall All History definition</div>
            <div style={{ marginTop: 4, fontWeight: 850, color: "#0f172a" }}>
              {analysis.historyScope.excludedMonthLabels.length ? "Opening partial month excluded" : "No opening month exclusion"}
            </div>
            <div style={{ ...subtleTextStyle, marginTop: 3 }}>
              Excluded baseline month: {excludedMonthsText}. WFMQYH is ignored here.
            </div>
          </div>
          <div style={cardStyle}>
            <div style={subtleTextStyle}>Calibration evaluation</div>
            <div style={{ marginTop: 4, fontWeight: 850, color: "#0f172a" }}>
              {evidence.evaluationDraws} later target draws
            </div>
            <div style={{ ...subtleTextStyle, marginTop: 3 }}>
              Raw and adjusted scores tested on the same targets.
            </div>
          </div>
        </div>

        <MlndCalibrationAudit analysis={evidence} budget={budget} />

        <div style={{ ...cardStyle, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 850, color: "#0f172a" }}>Exclusion comparison budget</div>
              <div style={subtleTextStyle}>
                Inspect a raw comparison set and check whether calibrated evidence supports it. Changing this count does not select numbers or retrain the correction.
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {BUDGET_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setBudget(option)}
                  aria-pressed={budget === option}
                  style={{
                    minHeight: 32,
                    padding: "5px 10px",
                    borderRadius: 999,
                    border: budget === option ? "1px solid #0f3a74" : "1px solid #cbd5e1",
                    background: budget === option ? "#0f3a74" : "#ffffff",
                    color: budget === option ? "#ffffff" : "#334155",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, background: "#f8fafc" }}>
              <div style={subtleTextStyle}>Raw model false exclusions</div>
              <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>{modelExpectedText}</div>
            </div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, background: "#f8fafc" }}>
              <div style={subtleTextStyle}>Random baseline</div>
              <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>{randomExpectedText}</div>
            </div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, background: "#f8fafc" }}>
              <div style={subtleTextStyle}>Delta vs random</div>
              <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: deltaTone }}>
                {analysis.backtest.deltaVsRandom != null && analysis.backtest.deltaVsRandom >= 0 ? "+" : ""}{formatNumber(analysis.backtest.deltaVsRandom, 2)}
              </div>
              <div style={subtleTextStyle}>
                95% draw-level interval: {analysis.backtest.bootstrapCI ? `${formatNumber(analysis.backtest.bootstrapCI[0], 2)} to ${formatNumber(analysis.backtest.bootstrapCI[1], 2)}` : "n/a"}
              </div>
            </div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, background: "#f8fafc" }}>
              <div style={subtleTextStyle}>Zero-error exclusion draws</div>
              <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
                {formatPercent(analysis.backtest.zeroFalseExclusionRate)}
              </div>
              <div style={subtleTextStyle}>{analysis.backtest.drawsEvaluated} later evaluation draws; raw model only.</div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 850, color: "#0f3a74" }}>Raw comparison exclusions ({analysis.excludedNumbers.length})</div>
              <div style={subtleTextStyle}>Original raw-score order; not a calibrated recommendation</div>
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
              {analysis.excludedNumbers.map((number) => (
                <span key={`exclude-${number}`} style={numberPillStyle("comparison")}>{number}</span>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 850, color: "#334155" }}>Raw comparison remainder ({analysis.allowedNumbers.length})</div>
              <div style={subtleTextStyle}>Complement of the raw set; not predicted winners</div>
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
              {analysis.allowedNumbers.map((number) => (
                <span key={`allow-${number}`} style={numberPillStyle(analysis.watchNumbers.includes(number) ? "watch" : "neutral")}>{number}</span>
              ))}
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 850, color: "#0f172a" }}>Number-level exclusion evidence</div>
              <div style={subtleTextStyle}>
                Rows retain the original raw-score order for comparison. Adjusted risks come from earlier out-of-sample outcomes; equal values mean tied evidence, not distinct ranks.
              </div>
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#334155" }}>
              Rows
              <select
                value={showRows}
                onChange={(event) => setShowRows(Number(event.target.value))}
                style={{ minHeight: 32, borderRadius: 6, border: "1px solid #cbd5e1", padding: "4px 8px" }}
              >
                <option value={15}>15</option>
                <option value={30}>30</option>
                <option value={45}>45</option>
              </select>
            </label>
          </div>

          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 980 }}>
              <thead>
                <tr style={{ background: "#f8fafc", color: "#475569" }}>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e2e8f0" }}>#</th>
                  <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>Adjusted risk</th>
                  <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>Raw index</th>
                  <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>Raw score</th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e2e8f0" }}>Current gap</th>
                  <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>13</th>
                  <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>26</th>
                  <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>52</th>
                  <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>Full</th>
                  <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>Raw hazard</th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e2e8f0" }}>Raw inputs</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => {
                  const inExcludedSet = analysis.excludedNumbers.includes(row.number);
                  const inWatchSet = analysis.watchNumbers.includes(row.number);
                  return (
                    <tr key={row.number} style={{ background: inExcludedSet ? "#f6faff" : inWatchSet ? "#fff7f8" : "#ffffff" }}>
                      <td style={{ padding: 8, borderBottom: "1px solid #edf2f7" }}>
                        <span style={numberPillStyle(inExcludedSet ? "comparison" : inWatchSet ? "watch" : "neutral")}>{row.number}</span>
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #edf2f7", textAlign: "right", fontWeight: 800 }}>{formatPercent(row.adjustedRisk, 2)}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #edf2f7", textAlign: "right", ...riskTone(row) }}>{formatNumber(row.riskPercent, 2)}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #edf2f7", textAlign: "right" }}>{formatNumber(row.exclusionScore, 1)}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #edf2f7" }}>{row.currentGapLabel}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #edf2f7", textAlign: "right" }}>{row.recent13Hits}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #edf2f7", textAlign: "right" }}>{row.recent26Hits}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #edf2f7", textAlign: "right" }}>{row.recent52Hits}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #edf2f7", textAlign: "right" }}>{row.fullHits}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #edf2f7", textAlign: "right" }}>
                        {formatNumber(row.hazardRiskPercent, 1)}% ({row.hazardHits}/{row.hazardTrials})
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #edf2f7", color: "#475569" }}>
                        {index + 1}. {row.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div
          style={{
            border: "1px solid #fde68a",
            borderRadius: 8,
            background: "#fffbeb",
            padding: 10,
            color: "#713f12",
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          <b>Truthfulness note:</b> Excluding {budget} numbers leaves {45 - budget} available numbers, so a 37-number exclusion list is mathematically equivalent to proposing an 8-number draw universe. The raw lists are diagnostic comparisons only. The adjusted-risk column uses a fitted sequential correction; calibration does not imply predictive advantage or guarantee absence. Unsupported or tied evidence never becomes a calibrated exclusion recommendation.
        </div>
      </div>
    </div>
  );
};

export default MostLikelyNotDrawnPanel;

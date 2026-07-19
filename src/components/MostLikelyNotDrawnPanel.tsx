import React, { useMemo, useState } from "react";

import type { Draw } from "../types";
import {
  buildMlndRiskAnalysis,
  type MlndDrawScope,
  type MlndRiskRow,
} from "../lib/mlndExclusionRisk";

interface MostLikelyNotDrawnPanelProps {
  history: Draw[];
  allHistory?: Draw[];
  title?: string;
}

const BUDGET_OPTIONS = [12, 18, 24, 30, 37] as const;

const panelStyle: React.CSSProperties = {
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

const numberPillStyle = (tone: "safe" | "watch" | "neutral" = "neutral"): React.CSSProperties => {
  const palette = {
    safe: { background: "#ecfdf5", border: "#bbf7d0", color: "#14532d" },
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

const formatNumber = (value: number, digits = 2): string => (
  Number.isFinite(value) ? value.toFixed(digits) : "0.00"
);

const formatPercent = (value: number, digits = 1): string => (
  `${formatNumber(value * 100, digits)}%`
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
  const analysis = useMemo(
    () => buildMlndRiskAnalysis(sourceHistory, {
      scope,
      budget,
      minTrainingDraws,
      bootstrapIters: 300,
    }),
    [sourceHistory, scope, budget, minTrainingDraws],
  );

  const randomExpectedText = `${formatNumber(analysis.backtest.randomMeanFalseExcluded, 2)} drawn ball${Math.abs(analysis.backtest.randomMeanFalseExcluded - 1) < 0.01 ? "" : "s"}`;
  const modelExpectedText = `${formatNumber(analysis.backtest.meanFalseExcluded, 2)} drawn ball${Math.abs(analysis.backtest.meanFalseExcluded - 1) < 0.01 ? "" : "s"}`;
  const deltaTone = analysis.backtest.deltaVsRandom > 0 ? "#166534" : analysis.backtest.deltaVsRandom < 0 ? "#be123c" : "#334155";
  const excludedMonthsText = analysis.historyScope.excludedMonthLabels.length
    ? analysis.historyScope.excludedMonthLabels.join(", ")
    : "none";
  const visibleRows = analysis.rows.slice(0, showRows);

  return (
    <div style={panelStyle}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 260, flex: "1 1 420px" }}>
            <div style={{ color: "#0f172a", fontWeight: 850, fontSize: 16 }}>Exclusion Risk Ledger</div>
            <div style={{ ...subtleTextStyle, marginTop: 3 }}>
              Observe-only ranking of numbers that look least risky to exclude from the next 45-number pool. This does not force generator exclusions.
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
              Opening partial month excluded
            </div>
            <div style={{ ...subtleTextStyle, marginTop: 3 }}>
              Excluded baseline month: {excludedMonthsText}. WFMQYH is ignored here.
            </div>
          </div>
          <div style={cardStyle}>
            <div style={subtleTextStyle}>Validation verdict</div>
            <div style={{ marginTop: 4, fontWeight: 850, color: deltaTone }}>
              {analysis.backtest.verdict}
            </div>
            <div style={{ ...subtleTextStyle, marginTop: 3 }}>
              Walk-forward tests: {analysis.backtest.drawsEvaluated}
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 850, color: "#0f172a" }}>Risk budget</div>
              <div style={subtleTextStyle}>
                Choose how many numbers to exclude. Higher budgets are more aggressive and carry more false-exclusion risk.
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
              <div style={subtleTextStyle}>Model false exclusions</div>
              <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>{modelExpectedText}</div>
            </div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, background: "#f8fafc" }}>
              <div style={subtleTextStyle}>Random baseline</div>
              <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>{randomExpectedText}</div>
            </div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, background: "#f8fafc" }}>
              <div style={subtleTextStyle}>Delta vs random</div>
              <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: deltaTone }}>
                {analysis.backtest.deltaVsRandom >= 0 ? "+" : ""}{formatNumber(analysis.backtest.deltaVsRandom, 2)}
              </div>
              <div style={subtleTextStyle}>
                95% bootstrap CI: {analysis.backtest.bootstrapCI ? `${formatNumber(analysis.backtest.bootstrapCI[0], 2)} to ${formatNumber(analysis.backtest.bootstrapCI[1], 2)}` : "n/a"}
              </div>
            </div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, background: "#f8fafc" }}>
              <div style={subtleTextStyle}>Zero-error exclusion draws</div>
              <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
                {formatPercent(analysis.backtest.zeroFalseExclusionRate)}
              </div>
              <div style={subtleTextStyle}>p-value: {analysis.backtest.pValue === null ? "n/a" : formatNumber(analysis.backtest.pValue, 3)}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 850, color: "#14532d" }}>Lowest-risk exclusions ({analysis.excludedNumbers.length})</div>
              <div style={subtleTextStyle}>Ranked least risky first</div>
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
              {analysis.excludedNumbers.map((number) => (
                <span key={`exclude-${number}`} style={numberPillStyle("safe")}>{number}</span>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 850, color: "#9f1239" }}>Allowed / watch list ({analysis.allowedNumbers.length})</div>
              <div style={subtleTextStyle}>Complement of the exclusions</div>
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
                Rows are sorted by lowest estimated draw risk first. Lower risk means safer to exclude, not guaranteed absent.
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
                  <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>Risk</th>
                  <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>Vs base</th>
                  <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>Score</th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e2e8f0" }}>Current gap</th>
                  <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>13</th>
                  <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>26</th>
                  <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>52</th>
                  <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>Full</th>
                  <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>Hazard</th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e2e8f0" }}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => {
                  const inExcludedSet = analysis.excludedNumbers.includes(row.number);
                  const inWatchSet = analysis.watchNumbers.includes(row.number);
                  return (
                    <tr key={row.number} style={{ background: inExcludedSet ? "#f8fffb" : inWatchSet ? "#fff7f8" : "#ffffff" }}>
                      <td style={{ padding: 8, borderBottom: "1px solid #edf2f7" }}>
                        <span style={numberPillStyle(inExcludedSet ? "safe" : inWatchSet ? "watch" : "neutral")}>{row.number}</span>
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid #edf2f7", textAlign: "right", ...riskTone(row) }}>{formatNumber(row.riskPercent, 2)}%</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #edf2f7", textAlign: "right" }}>{formatNumber(row.liftVsBaseline, 2)}x</td>
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
          <b>Truthfulness note:</b> Excluding {budget} numbers leaves {45 - budget} allowed numbers, so a 37-number exclusion list is mathematically equivalent to proposing an 8-number draw universe. Treat this as calibrated exclusion-risk evidence, not as a promise that the listed numbers cannot appear.
        </div>
      </div>
    </div>
  );
};

export default MostLikelyNotDrawnPanel;

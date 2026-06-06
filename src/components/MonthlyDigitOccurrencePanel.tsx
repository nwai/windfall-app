import React, { useMemo, useState } from "react";

import type { Draw } from "../types";
import {
  analyzeMonthlyDigitOccurrences,
  type MonthlyDigitOccurrenceBias,
  type MonthlyDigitOccurrenceRow,
  type MonthlyDigitNumberCount,
} from "../lib/monthlyDigitOccurrences";

interface MonthlyDigitOccurrencePanelProps {
  history: Draw[];
}

const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const formatBiasPoints = (value: number): string => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} pts`;

const leaderStyles: Record<MonthlyDigitOccurrenceRow["leadingBucket"], { label: string; background: string; color: string; border: string }> = {
  oneDigit: {
    label: "1-digit leads",
    background: "#ecfeff",
    color: "#155e75",
    border: "1px solid #a5f3fc",
  },
  twoDigit: {
    label: "2-digit leads",
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
  },
  balanced: {
    label: "Balanced",
    background: "#f8fafc",
    color: "#475569",
    border: "1px solid #cbd5e1",
  },
};

const StatCard: React.FC<{ label: string; value: string; hint?: string; tone?: "cyan" | "blue" | "amber" | "slate" }> = ({
  label,
  value,
  hint,
  tone = "slate",
}) => {
  const tones = {
    cyan: { background: "#ecfeff", border: "#a5f3fc", labelColor: "#0f766e", valueColor: "#134e4a" },
    blue: { background: "#eff6ff", border: "#bfdbfe", labelColor: "#1d4ed8", valueColor: "#1e3a8a" },
    amber: { background: "#fffbeb", border: "#fde68a", labelColor: "#b45309", valueColor: "#92400e" },
    slate: { background: "#f8fafc", border: "#e2e8f0", labelColor: "#475569", valueColor: "#1e293b" },
  } as const;

  const palette = tones[tone];

  return (
    <div style={{ background: palette.background, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "8px 12px", minWidth: 160 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, color: palette.labelColor }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 22, fontWeight: 800, color: palette.valueColor, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {hint ? <div style={{ marginTop: 4, fontSize: 11, color: "#64748b" }}>{hint}</div> : null}
    </div>
  );
};

const NumberCountChips: React.FC<{
  numbers: MonthlyDigitNumberCount[];
  emptyLabel: string;
  max?: number;
}> = ({ numbers, emptyLabel, max = 6 }) => {
  if (numbers.length === 0) {
    return <span style={{ fontSize: 11, color: "#94a3b8" }}>{emptyLabel}</span>;
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {numbers.slice(0, max).map((entry) => (
        <span
          key={`${entry.number}-${entry.count}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: 999,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            fontSize: 11,
            color: "#334155",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <strong>{entry.number}</strong>
          <span style={{ color: "#64748b" }}>×{entry.count}</span>
        </span>
      ))}
    </div>
  );
};

const UniqueNumbersCell: React.FC<{ numbers: number[]; emptyLabel: string }> = ({ numbers, emptyLabel }) => {
  if (numbers.length === 0) {
    return <span style={{ fontSize: 11, color: "#94a3b8" }}>{emptyLabel}</span>;
  }

  return (
    <span style={{ fontSize: 12, color: "#1e293b" }}>
      {numbers.join(", ")}
    </span>
  );
};

const getBiasAccent = (bias: MonthlyDigitOccurrenceBias): {
  background: string;
  border: string;
  label: string;
  color: string;
} => {
  switch (bias.direction) {
    case "oneDigitHeavy":
      return {
        background: "#ecfeff",
        border: "#a5f3fc",
        label: `${bias.intensity === "none" ? "Mild" : bias.intensity} 1-digit bias`,
        color: "#155e75",
      };
    case "twoDigitHeavy":
      return {
        background: "#eff6ff",
        border: "#bfdbfe",
        label: `${bias.intensity === "none" ? "Mild" : bias.intensity} 2-digit bias`,
        color: "#1d4ed8",
      };
    case "neutral":
      return {
        background: "#f8fafc",
        border: "#cbd5e1",
        label: "Near historical balance",
        color: "#475569",
      };
    case "insufficientHistory":
    default:
      return {
        background: "#f8fafc",
        border: "#e2e8f0",
        label: "Need more months",
        color: "#475569",
      };
  }
};

const BiasSummaryCard: React.FC<{ bias: MonthlyDigitOccurrenceBias }> = ({ bias }) => {
  const accent = getBiasAccent(bias);

  if (bias.direction === "insufficientHistory") {
    return (
      <div style={{ border: `1px solid ${accent.border}`, borderRadius: 8, background: accent.background, padding: "10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: accent.color }}>Recent month bias</div>
            <div style={{ marginTop: 2, fontSize: 18, fontWeight: 800, color: accent.color }}>{accent.label}</div>
          </div>
          <span style={{ fontSize: 11, color: "#64748b" }}>At least 2 months are needed before recent-vs-history bias can be measured.</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${accent.border}`, borderRadius: 8, background: accent.background, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: accent.color }}>Recent month bias</div>
          <div style={{ marginTop: 2, fontSize: 20, fontWeight: 800, color: accent.color }}>{accent.label}</div>
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, color: accent.color, fontVariantNumeric: "tabular-nums" }}>
          {formatBiasPoints(bias.oneDigitBiasScore)}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.45 }}>
        Compares the <b>average 1-digit share</b> in the most recent <b>{bias.recentWindowMonths}</b> month{bias.recentWindowMonths !== 1 ? "s" : ""}
        {" "}against the earlier <b>{bias.historicalWindowMonths}</b> month{bias.historicalWindowMonths !== 1 ? "s" : ""}. Positive scores mean recent months are more <b>1-digit-heavy</b>; negative scores mean they are more <b>2-digit-heavy</b>.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: "#334155" }}>
        <span>Recent avg 1-digit share: <b>{formatPercent(bias.recentAvgOneDigitShare)}</b></span>
        <span>Historical avg 1-digit share: <b>{formatPercent(bias.historicalAvgOneDigitShare)}</b></span>
        <span>Recent avg 2-digit share: <b>{formatPercent(bias.recentAvgTwoDigitShare)}</b></span>
        <span>Historical avg 2-digit share: <b>{formatPercent(bias.historicalAvgTwoDigitShare)}</b></span>
      </div>
    </div>
  );
};

export const MonthlyDigitOccurrencePanel: React.FC<MonthlyDigitOccurrencePanelProps> = ({ history }) => {
  const [includeSupp, setIncludeSupp] = useState<boolean>(false);
  const [latestFirst, setLatestFirst] = useState<boolean>(true);
  const [breakdownOpen, setBreakdownOpen] = useState<boolean>(true);

  const summary = useMemo(
    () => analyzeMonthlyDigitOccurrences(history, { includeSupp }),
    [history, includeSupp],
  );

  const rows = useMemo(
    () => (latestFirst ? [...summary.rows].reverse() : summary.rows),
    [latestFirst, summary.rows],
  );
  const averageMonthHint = summary.averageMonthCount > 0
    ? `${summary.avgOneDigitPerMonth.toFixed(1)} per month across ${summary.averageMonthCount} complete month${summary.averageMonthCount === 1 ? "" : "s"}${summary.averageExcludedMonthLabels.length ? ` (excl. ${summary.averageExcludedMonthLabels.join(", ")})` : ""}`
    : `No complete months available${summary.averageExcludedMonthLabels.length ? ` (excl. ${summary.averageExcludedMonthLabels.join(", ")})` : ""}`;
  const averageTwoDigitHint = summary.averageMonthCount > 0
    ? `${summary.avgTwoDigitPerMonth.toFixed(1)} per month across ${summary.averageMonthCount} complete month${summary.averageMonthCount === 1 ? "" : "s"}${summary.averageExcludedMonthLabels.length ? ` (excl. ${summary.averageExcludedMonthLabels.join(", ")})` : ""}`
    : `No complete months available${summary.averageExcludedMonthLabels.length ? ` (excl. ${summary.averageExcludedMonthLabels.join(", ")})` : ""}`;

  return (
    <section style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#223" }}>Monthly 1-Digit vs 2-Digit Occurrences</div>
          <div style={{ fontSize: 12, color: "#667", marginTop: 2 }}>
            Counts monthly occurrences of one-digit numbers <b>(1–9)</b> versus two-digit numbers <b>(10–45)</b> across draw history.
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#334155" }}>
            <input
              type="checkbox"
              checked={includeSupp}
              onChange={(event) => setIncludeSupp(event.target.checked)}
            />
            Include supplementary numbers
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#334155" }}>
            <input
              type="checkbox"
              checked={latestFirst}
              onChange={(event) => setLatestFirst(event.target.checked)}
            />
            Latest month first
          </label>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.45, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px" }}>
        <b>How to read this:</b> “Occurrence” means every time a number appears in a draw during that month. So if <b>7</b> appears in three separate draws in the same month, it contributes <b>3</b> one-digit occurrences.
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <StatCard label="Months analysed" value={String(summary.totalMonths)} hint={`${summary.totalDraws} draws counted${summary.averageExcludedMonthLabels.length ? ` · month averages exclude ${summary.averageExcludedMonthLabels.join(", ")}` : ""}`} tone="slate" />
        <StatCard label="1-digit occurrences" value={String(summary.totalOneDigitOccurrences)} hint={`${averageMonthHint} · ${summary.avgOneDigitPerDraw.toFixed(2)} per draw`} tone="cyan" />
        <StatCard label="2-digit occurrences" value={String(summary.totalTwoDigitOccurrences)} hint={`${averageTwoDigitHint} · ${summary.avgTwoDigitPerDraw.toFixed(2)} per draw`} tone="blue" />
        <StatCard label="Monthly leaders" value={`${summary.monthsOneDigitLed} / ${summary.monthsTwoDigitLed} / ${summary.balancedMonths}`} hint="1-digit led / 2-digit led / balanced" tone="amber" />
      </div>

      <BiasSummaryCard bias={summary.recentBias} />

      {(summary.strongestOneDigitMonth || summary.strongestTwoDigitMonth) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
          <div style={{ borderRadius: 8, border: "1px solid #a5f3fc", background: "#ecfeff", padding: "10px 12px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f766e" }}>Strongest 1-digit month</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#155e75", marginTop: 2 }}>
              {summary.strongestOneDigitMonth ? `${summary.strongestOneDigitMonth.monthLabel} · ${summary.strongestOneDigitMonth.oneDigitOccurrences}` : "—"}
            </div>
            <div style={{ fontSize: 11, color: "#0f766e", marginTop: 4 }}>
              Top numbers: {summary.strongestOneDigitMonth?.oneDigitTopNumbers.slice(0, 4).map((entry) => `${entry.number}×${entry.count}`).join(", ") || "none"}
            </div>
          </div>
          <div style={{ borderRadius: 8, border: "1px solid #bfdbfe", background: "#eff6ff", padding: "10px 12px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8" }}>Strongest 2-digit month</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#1e3a8a", marginTop: 2 }}>
              {summary.strongestTwoDigitMonth ? `${summary.strongestTwoDigitMonth.monthLabel} · ${summary.strongestTwoDigitMonth.twoDigitOccurrences}` : "—"}
            </div>
            <div style={{ fontSize: 11, color: "#1d4ed8", marginTop: 4 }}>
              Top numbers: {summary.strongestTwoDigitMonth?.twoDigitTopNumbers.slice(0, 4).map((entry) => `${entry.number}×${entry.count}`).join(", ") || "none"}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, background: "#fcfeff" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0f766e", marginBottom: 8 }}>Most common 1-digit numbers overall</div>
          <NumberCountChips numbers={summary.overallOneDigitTopNumbers} emptyLabel="No one-digit hits yet." max={9} />
        </div>
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, background: "#fcfdff" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", marginBottom: 8 }}>Most common 2-digit numbers overall</div>
          <NumberCountChips numbers={summary.overallTwoDigitTopNumbers} emptyLabel="No two-digit hits yet." max={12} />
        </div>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => setBreakdownOpen((prev) => !prev)}
          aria-expanded={breakdownOpen}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "none",
            borderBottom: breakdownOpen ? "1px solid #e5e7eb" : "none",
            background: "#fafcff",
            fontWeight: 700,
            color: "#223",
            textAlign: "left",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
          }}
        >
          <span>Monthly occurrence breakdown</span>
          <span style={{ fontSize: 12, color: "#64748b" }}>
            {breakdownOpen ? "Hide table ▲" : `Show table (${rows.length} month${rows.length !== 1 ? "s" : ""}) ▼`}
          </span>
        </button>
        {!breakdownOpen ? (
          <div style={{ padding: "10px 12px", fontSize: 12, color: "#64748b", background: "#fff" }}>
            Collapsed to keep the panel compact. Expand to inspect the full month-by-month breakdown.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100, fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thLeft}>Month</th>
                  <th style={thRight}>Draws</th>
                  <th style={thRight}>1-digit total</th>
                  <th style={thRight}>2-digit total</th>
                  <th style={thLeft}>Share split</th>
                  <th style={thLeft}>Per-draw avg</th>
                  <th style={thLeft}>Unique 1-digit numbers</th>
                  <th style={thLeft}>Unique 2-digit numbers</th>
                  <th style={thLeft}>Top 1-digit numbers</th>
                  <th style={thLeft}>Top 2-digit numbers</th>
                  <th style={thLeft}>Leader</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const leader = leaderStyles[row.leadingBucket];
                  return (
                    <tr key={row.monthLabel} style={{ borderTop: "1px solid #edf2f7" }}>
                      <td style={{ ...tdLeft, fontWeight: 700 }}>{row.monthLabel}</td>
                      <td style={tdRight}>{row.drawCount}</td>
                      <td style={{ ...tdRight, color: "#155e75", fontWeight: 700 }}>{row.oneDigitOccurrences}</td>
                      <td style={{ ...tdRight, color: "#1d4ed8", fontWeight: 700 }}>{row.twoDigitOccurrences}</td>
                      <td style={tdLeft}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ color: "#155e75" }}>1-digit: {formatPercent(row.oneDigitShare)}</span>
                          <span style={{ color: "#1d4ed8" }}>2-digit: {formatPercent(row.twoDigitShare)}</span>
                        </div>
                      </td>
                      <td style={tdLeft}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ color: "#155e75" }}>1-digit: {row.oneDigitAveragePerDraw.toFixed(2)}</span>
                          <span style={{ color: "#1d4ed8" }}>2-digit: {row.twoDigitAveragePerDraw.toFixed(2)}</span>
                        </div>
                      </td>
                      <td style={tdLeft}><UniqueNumbersCell numbers={row.oneDigitUniqueNumbers} emptyLabel="none" /></td>
                      <td style={tdLeft}><UniqueNumbersCell numbers={row.twoDigitUniqueNumbers} emptyLabel="none" /></td>
                      <td style={tdLeft}><NumberCountChips numbers={row.oneDigitTopNumbers} emptyLabel="none" max={5} /></td>
                      <td style={tdLeft}><NumberCountChips numbers={row.twoDigitTopNumbers} emptyLabel="none" max={5} /></td>
                      <td style={tdLeft}>
                        <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: 999, background: leader.background, color: leader.color, border: leader.border, fontWeight: 700, fontSize: 11 }}>
                          {leader.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ padding: 14, color: "#94a3b8", textAlign: "center" }}>
                      No valid draw history is available for monthly digit-occurrence analysis.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

const thLeft: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid #e5e7eb",
  color: "#475569",
  verticalAlign: "top",
};

const thRight: React.CSSProperties = {
  ...thLeft,
  textAlign: "right",
};

const tdLeft: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  color: "#1f2937",
  verticalAlign: "top",
};

const tdRight: React.CSSProperties = {
  ...tdLeft,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

export default MonthlyDigitOccurrencePanel;

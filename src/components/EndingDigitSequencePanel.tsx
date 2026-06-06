import React, { useMemo, useState } from "react";

import type { Draw } from "../types";
import {
  analyzeEndingDigitSequences,
  predictNextEndingDigitSequence,
  type EndingDigitSequencePrediction,
  type EndingDigitPredictionSequence,
  type EndingDigitSequenceDrawStats,
} from "../lib/endingDigitSequences";

interface EndingDigitSequencePanelProps {
  draws: Draw[];
}

type SortMode = "dateDesc" | "coveredDesc" | "runDesc";
type HorizonChoice = "6" | "10" | "20" | "36" | "WFMQYH";

const StatChip: React.FC<{
  label: string;
  value: string;
  title?: string;
}> = ({ label, value, title }) => (
  <div
    title={title}
    style={{
      padding: "8px 10px",
      borderRadius: 8,
      border: "1px solid #e5e7eb",
      background: "#fafcff",
      minWidth: 120,
    }}
  >
    <div style={{ fontSize: 10, color: "#78909c", textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
    <div style={{ marginTop: 2, fontSize: 16, fontWeight: 700, color: "#263238", fontVariantNumeric: "tabular-nums" }}>{value}</div>
  </div>
);

const FrequencyBars: React.FC<{
  title: string;
  description: string;
  freq: Record<number, number>;
  tone: "indigo" | "teal";
}> = ({ title, description, freq, tone }) => {
  const entries = Object.entries(freq).map(([key, count]) => ({ key, count }));
  const maxCount = Math.max(...entries.map((entry) => entry.count), 1);
  const barColor = tone === "indigo" ? "linear-gradient(180deg, #c5cae9 0%, #3949ab 100%)" : "linear-gradient(180deg, #b2dfdb 0%, #00796b 100%)";

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#fff" }}>
      <div style={{ fontWeight: 700, color: "#223", fontSize: 14 }}>{title}</div>
      <div style={{ fontSize: 11, color: "#667", marginTop: 3, marginBottom: 10 }}>{description}</div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 12, color: "#999" }}>No draws available.</div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, minHeight: 160, borderBottom: "1px solid #e5e7eb", paddingBottom: 6 }}>
          {entries.map((entry) => (
            <div key={entry.key} style={{ flex: 1, minWidth: 0, textAlign: "center" }} title={`${entry.key}: ${entry.count} draw${entry.count === 1 ? "" : "s"}`}>
              <div style={{ fontSize: 11, color: "#546e7a", marginBottom: 4, fontVariantNumeric: "tabular-nums" }}>{entry.count}</div>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", height: 120 }}>
                <div
                  style={{
                    width: "100%",
                    maxWidth: 48,
                    height: `${Math.max((entry.count / maxCount) * 100, 2)}%`,
                    minHeight: entry.count > 0 ? 6 : 0,
                    borderRadius: "6px 6px 0 0",
                    background: barColor,
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: "#455a64", marginTop: 6, fontWeight: 700 }}>{entry.key}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const formatRuns = (draw: EndingDigitSequenceDrawStats): string => {
  if (!draw.maxRuns.length) return "—";
  return draw.maxRuns.map((run) => `${run.digits.join("-")} (${run.coveredNumbers})`).join(" | ");
};

const formatSequence = (digits: readonly number[]): string => digits.join("-");

const formatComponent = (value: number): string => `${Math.round(value * 100)}%`;

export const EndingDigitSequencePanel: React.FC<EndingDigitSequencePanelProps> = ({ draws }) => {
  const [includeSupp, setIncludeSupp] = useState<boolean>(true);
  const [sortMode, setSortMode] = useState<SortMode>("dateDesc");
  const [recentWindowChoice, setRecentWindowChoice] = useState<HorizonChoice>("20");
  const [halfLifeChoice, setHalfLifeChoice] = useState<HorizonChoice>("10");
  const [prediction, setPrediction] = useState<EndingDigitSequencePrediction | null>(null);
  const drawSignature = useMemo(
    () => draws
      .map((draw) => `${draw.date}:${draw.main.join(",")}:${draw.supp?.join(",") ?? ""}`)
      .join("|"),
    [draws],
  );

  const summary = useMemo(
    () => analyzeEndingDigitSequences(draws, { includeSupp }),
    [draws, includeSupp],
  );

  React.useEffect(() => {
    setPrediction(null);
  }, [drawSignature, halfLifeChoice, includeSupp, recentWindowChoice]);

  const sortedDraws = useMemo(() => {
    const rows = [...summary.perDraw];
    switch (sortMode) {
      case "coveredDesc":
        return rows.sort((a, b) => b.coveredNumbers - a.coveredNumbers || b.maxRunLength - a.maxRunLength || b.date.localeCompare(a.date));
      case "runDesc":
        return rows.sort((a, b) => b.maxRunLength - a.maxRunLength || b.coveredNumbers - a.coveredNumbers || b.date.localeCompare(a.date));
      case "dateDesc":
      default:
        return rows.reverse();
    }
  }, [sortMode, summary.perDraw]);

  const pct = (value: number): string => {
    if (summary.totalDraws === 0) return "0.0%";
    return `${((value / summary.totalDraws) * 100).toFixed(1)}%`;
  };

  const handleSuggestNext = () => {
    setPrediction(predictNextEndingDigitSequence(draws, {
      includeSupp,
      sequenceLength: "auto",
      recentWindow: resolveHorizon(recentWindowChoice, draws.length, 20),
      halfLife: resolveHorizon(halfLifeChoice, draws.length, 10),
    }));
  };

  return (
    <section style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", padding: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#223" }}>Ending Digit Sequence Analyzer</div>
          <div style={{ fontSize: 12, color: "#667", marginTop: 2 }}>
            Checks whether draws cluster into consecutive ending-digit runs such as 2-3-4-5 or 8-9-0.
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "#444" }} title="Include supplementary numbers in the ending-digit sequence analysis">
            <input
              type="checkbox"
              checked={includeSupp}
              onChange={(e) => setIncludeSupp(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Include supp (main + supp)
          </label>
          <label style={{ fontSize: 12, color: "#444" }}>
            Sort recent draws:
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} style={{ marginLeft: 6, fontSize: 12 }}>
              <option value="dateDesc">Newest first</option>
              <option value="coveredDesc">Covered numbers</option>
              <option value="runDesc">Run length</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: "#444" }}>
            Recent:
            <select value={recentWindowChoice} onChange={(e) => setRecentWindowChoice(e.target.value as HorizonChoice)} style={{ marginLeft: 6, fontSize: 12 }}>
              <option value="6">6</option>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="36">36</option>
              <option value="WFMQYH">WFMQYH</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: "#444" }}>
            Half-life:
            <select value={halfLifeChoice} onChange={(e) => setHalfLifeChoice(e.target.value as HorizonChoice)} style={{ marginLeft: 6, fontSize: 12 }}>
              <option value="6">6</option>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="36">36</option>
              <option value="WFMQYH">WFMQYH</option>
            </select>
          </label>
          <button
            type="button"
            onClick={handleSuggestNext}
            disabled={draws.length === 0}
            style={buttonStyle(draws.length === 0)}
            title="Rank ending-digit runs from transitions, WFMQYH ending history, adjacent combos, observed shape, and hot/cold movement"
          >
            Rank ending candidates
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <StatChip label="Window" value={`${summary.totalDraws}`} title="Number of draws analyzed in the active window" />
        <StatChip label="Run ≥ 3" value={`${summary.drawsWithMaxRunAtLeast3} · ${pct(summary.drawsWithMaxRunAtLeast3)}`} title="Draws whose longest ending-digit run is at least 3 digits long" />
        <StatChip label="Run ≥ 4" value={`${summary.drawsWithMaxRunAtLeast4} · ${pct(summary.drawsWithMaxRunAtLeast4)}`} title="Draws whose longest ending-digit run is at least 4 digits long" />
        <StatChip label="Covered ≥ 4" value={`${summary.drawsWithCoveredNumbersAtLeast4} · ${pct(summary.drawsWithCoveredNumbersAtLeast4)}`} title="Draws where the strongest ending-digit run covers at least 4 numbers" />
        <StatChip label="Run ≥ 5" value={`${summary.drawsWithMaxRunAtLeast5} · ${pct(summary.drawsWithMaxRunAtLeast5)}`} title="Draws whose longest ending-digit run is at least 5 digits long" />
      </div>

      <div style={{ fontSize: 12, color: "#556", marginBottom: 12, lineHeight: 1.45 }}>
        Ending digits are treated <b>circularly</b>, so <b>8-9-0</b> and <b>9-0-1-2</b> count as consecutive runs. “Covered numbers” means how many numbers in the draw fall inside the strongest consecutive ending-digit run.
      </div>

      {prediction && <PredictionResult prediction={prediction} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 14 }}>
        <FrequencyBars
          title="Longest ending-digit run per draw"
          description="How often a draw’s strongest distinct ending-digit run is length 1, 2, 3, 4, and so on."
          freq={summary.maxRunLengthFrequency}
          tone="indigo"
        />
        <FrequencyBars
          title="Numbers covered by strongest run"
          description="How many actual numbers in a draw are explained by the strongest ending-digit sequence."
          freq={summary.coveredNumbersFrequency}
          tone="teal"
        />
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e5e7eb", background: "#fafcff", fontWeight: 700, color: "#223" }}>
          Recent / strongest examples
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thLeft}>Date</th>
                <th style={thLeft}>Numbers</th>
                <th style={thLeft}>Endings</th>
                <th style={thLeft}>Strongest run(s)</th>
                <th style={thRight}>Run len</th>
                <th style={thRight}>Covered</th>
              </tr>
            </thead>
            <tbody>
              {sortedDraws.slice(0, 18).map((draw) => (
                <tr key={`${draw.date}-${draw.numbers.join("-")}`} style={{ borderTop: "1px solid #edf2f7" }}>
                  <td style={tdLeft}>{draw.date}</td>
                  <td style={tdLeft}>{draw.numbers.join(" ")}</td>
                  <td style={tdLeft}>{draw.endings.join(" ")}</td>
                  <td style={tdLeft}>{formatRuns(draw)}</td>
                  <td style={tdRight}>{draw.maxRunLength}</td>
                  <td style={tdRight}>{draw.coveredNumbers}</td>
                </tr>
              ))}
              {sortedDraws.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 12, color: "#999", textAlign: "center" }}>
                    No draws available for ending-digit sequence analysis.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

function resolveHorizon(choice: HorizonChoice, drawCount: number, fallback: number): number {
  if (choice === "WFMQYH") return Math.max(1, drawCount);
  const numeric = Number(choice);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

const PredictionResult: React.FC<{ prediction: EndingDigitSequencePrediction }> = ({ prediction }) => {
  if (!prediction.topSequence) {
    return (
      <section style={predictionShell}>
        <div style={predictionTitle}>Best-Supported Ending Run Candidates</div>
        <div style={mutedText}>No valid WFMQYH draw history is available for a sequence recommendation.</div>
      </section>
    );
  }

  const top = prediction.topSequence;
  const target = prediction.windowShape.target;

  return (
    <section style={predictionShell}>
      <div style={predictionHeader}>
        <div>
          <div style={predictionTitle}>Best-Supported Ending Run Candidates</div>
          <div style={mutedText}>
            Best-supported candidates from {prediction.totalDraws} selected draw{prediction.totalDraws === 1 ? "" : "s"}.
          </div>
        </div>
        <div style={sequenceBadge} title="This is a transition-informed evidence score, not a probability guarantee">
          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Top candidate</span>
          <b style={{ fontSize: 20, color: "#0f172a", letterSpacing: 0 }}>{formatSequence(top.digits)}</b>
        </div>
      </div>

      <div style={predictionMetrics}>
        <Metric label="Evidence" value={`${top.score.toFixed(1)}/100`} />
        <Metric label="Calibrated" value={top.confidenceLabel} />
        <Metric label="Full-run hits" value={`${top.fullRunHits}/${prediction.totalDraws}`} />
        <Metric label="Recent/Half-life" value={`${prediction.recentWindow}/${prediction.halfLife}`} />
        <Metric label="Backtest partial" value={`${(prediction.backtest.partialHitRate * 100).toFixed(0)}%`} />
      </div>

      <div style={componentGrid}>
        <ComponentBar label="Transition" value={top.components.transition} />
        <ComponentBar label="Ending history" value={top.components.endingHistory} />
        <ComponentBar label="Adjacent combos" value={top.components.adjacentCombos} />
        <ComponentBar label="Hot/cold" value={top.components.hotCold} />
        <ComponentBar label="Observed shape" value={top.components.observedShape} />
        <ComponentBar label="Run-length prior" value={top.components.runLengthPrior} />
        <ComponentBar label="Recency" value={top.components.recency} />
      </div>

      <div style={predictionColumns}>
        <div>
          <div style={sectionLabel}>Drivers</div>
          <ul style={driverList}>
            {top.drivers.map((driver) => (
              <li key={driver}>{driver}</li>
            ))}
          </ul>
        </div>

        <div>
          <div style={sectionLabel}>Current Window Shape</div>
          <div style={shapeGrid}>
            <span>Low {target.lowMidHigh.low.toFixed(1)}</span>
            <span>Mid {target.lowMidHigh.mid.toFixed(1)}</span>
            <span>High {target.lowMidHigh.high.toFixed(1)}</span>
            <span>Even {target.evenOdd.even.toFixed(1)}</span>
            <span>Odd {target.evenOdd.odd.toFixed(1)}</span>
            <span>Mean {target.meanNumber.toFixed(1)}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={sectionLabel}>Walk-Forward Backtest</div>
        <div style={shapeGrid}>
          <span>{prediction.backtest.evaluatedTransitions} trials</span>
          <span>Exact {(prediction.backtest.exactHitRate * 100).toFixed(0)}%</span>
          <span>Partial {(prediction.backtest.partialHitRate * 100).toFixed(0)}%</span>
          <span>Overlap {(prediction.backtest.averageOverlap * 100).toFixed(0)}%</span>
        </div>
      </div>

      {top.comboContributors.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={sectionLabel}>Adjacent Combo Contributors</div>
          <div style={comboList}>
            {top.comboContributors.map((combo) => (
              <span key={combo.key} style={comboPill} title={`Count ${combo.count}; longest run ${combo.longestRun}; current streak ${combo.currentStreak}`}>
                {combo.key} → {formatSequence(combo.endings)}
              </span>
            ))}
          </div>
        </div>
      )}

      {prediction.alternatives.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={sectionLabel}>Alternatives</div>
          <div style={comboList}>
            {prediction.alternatives.slice(0, 4).map((sequence) => (
              <SequencePill key={formatSequence(sequence.digits)} sequence={sequence} />
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <div style={sectionLabel}>Top Ending Digits</div>
        <div style={comboList}>
          {prediction.digitScores.slice(0, 6).map((digit) => (
            <span key={digit.digit} style={digitPill} title={`History ${digit.endingHistory.toFixed(1)} · hot/cold ${digit.hotCold.toFixed(1)}`}>
              {digit.digit} · {digit.total.toFixed(0)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={metricBox}>
    <div style={metricLabel}>{label}</div>
    <div style={metricValue}>{value}</div>
  </div>
);

const ComponentBar: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div>
    <div style={componentLabel}>
      <span>{label}</span>
      <b>{formatComponent(value)}</b>
    </div>
    <div style={barTrack}>
      <div style={{ ...barFill, width: `${Math.round(clampPercent(value))}%` }} />
    </div>
  </div>
);

const SequencePill: React.FC<{ sequence: EndingDigitPredictionSequence }> = ({ sequence }) => (
  <span style={comboPill} title={`Evidence ${sequence.score.toFixed(1)}/100`}>
    {formatSequence(sequence.digits)} · {sequence.score.toFixed(0)}
  </span>
);

const clampPercent = (value: number): number => Math.min(100, Math.max(0, value * 100));

const thLeft: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid #e5e7eb",
  color: "#455a64",
};

const thRight: React.CSSProperties = {
  ...thLeft,
  textAlign: "right",
};

const tdLeft: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  color: "#223",
};

const tdRight: React.CSSProperties = {
  ...tdLeft,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const buttonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: disabled ? "#f1f5f9" : "#0f172a",
  color: disabled ? "#94a3b8" : "#fff",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 12,
  fontWeight: 700,
});

const predictionShell: React.CSSProperties = {
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  padding: 12,
  background: "#f8fafc",
  marginBottom: 14,
};

const predictionHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const predictionTitle: React.CSSProperties = {
  fontWeight: 800,
  color: "#0f172a",
  fontSize: 14,
};

const mutedText: React.CSSProperties = {
  marginTop: 3,
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.35,
};

const sequenceBadge: React.CSSProperties = {
  minWidth: 120,
  display: "flex",
  flexDirection: "column",
  gap: 2,
  alignItems: "flex-end",
};

const predictionMetrics: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 8,
  marginTop: 10,
};

const metricBox: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#fff",
  padding: "8px 10px",
};

const metricLabel: React.CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  fontWeight: 700,
};

const metricValue: React.CSSProperties = {
  color: "#0f172a",
  marginTop: 2,
  fontSize: 15,
  fontWeight: 800,
  textTransform: "capitalize",
};

const componentGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 8,
  marginTop: 10,
};

const componentLabel: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  color: "#334155",
  fontSize: 11,
  fontWeight: 700,
};

const barTrack: React.CSSProperties = {
  height: 6,
  borderRadius: 6,
  background: "#e2e8f0",
  overflow: "hidden",
  marginTop: 4,
};

const barFill: React.CSSProperties = {
  height: "100%",
  borderRadius: 6,
  background: "#2563eb",
};

const predictionColumns: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginTop: 10,
};

const sectionLabel: React.CSSProperties = {
  color: "#334155",
  fontSize: 12,
  fontWeight: 800,
  marginBottom: 6,
};

const driverList: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  color: "#334155",
  fontSize: 12,
  lineHeight: 1.45,
};

const shapeGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))",
  gap: 6,
  color: "#334155",
  fontSize: 12,
};

const comboList: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const comboPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 24,
  padding: "3px 8px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  fontSize: 11,
  fontWeight: 700,
};

const digitPill: React.CSSProperties = {
  ...comboPill,
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  color: "#1d4ed8",
};

export default EndingDigitSequencePanel;

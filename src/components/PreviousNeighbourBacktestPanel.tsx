import React, { useMemo, useState } from "react";

import {
  analyzePreviousNeighbourBacktest,
  type PreviousNeighbourBacktestResult,
  type PreviousNeighbourDistributionRow,
  type PreviousNeighbourScope,
  type PreviousNeighbourTarget,
  type PreviousNeighbourTransition,
} from "../lib/previousNeighbourBacktest";
import type { Draw } from "../types";
import { HigField, InfoHelp } from "./shared/HigControls";

interface PreviousNeighbourBacktestPanelProps {
  draws: Draw[];
}

const SCOPE_OPTIONS: Array<{ value: PreviousNeighbourScope; label: string }> = [
  { value: "mains-plus-supps", label: "Mains + supps (8)" },
  { value: "mains", label: "Mains only (6)" },
];

const WARMUP_OPTIONS = [20, 50, 100];
const POOL_OPTIONS = [100, 200, 500];
const SELECTED_OPTIONS = [10, 20, 50];

const formatNumber = (value: number | null, digits = 2): string => (
  value == null ? "-" : value.toFixed(digits)
);

const formatPercent = (value: number, digits = 1): string => `${(value * 100).toFixed(digits)}%`;

const formatTargets = (targets: PreviousNeighbourTarget[]): string => {
  if (targets.length === 0) return "None";
  return targets
    .map((entry) => `${entry.target} (${entry.sources.join("+")})`)
    .join(", ");
};

const statusTextFor = (analysis: PreviousNeighbourBacktestResult): string => {
  const backtest = analysis.candidateBacktest;
  if (backtest.evaluatedDraws === 0) return "Insufficient post-warm-up history";
  if (backtest.meanDeltaHits > 0 && backtest.pValueOneSidedImprovement <= 0.05) {
    return "Soft rule improved this diagnostic sample";
  }
  if (backtest.meanDeltaHits > 0) return "Positive but not statistically convincing";
  if (backtest.meanDeltaHits < 0) return "No improvement in this diagnostic sample";
  return "No measurable difference";
};

const miniTableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "1px solid #d8dee8",
  color: "#4b5563",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const tdStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #edf0f5",
  verticalAlign: "top",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #dfe5ee",
  borderRadius: 8,
  background: "#fff",
  padding: 12,
};

const selectStyle: React.CSSProperties = {
  minHeight: 34,
  borderRadius: 8,
  border: "1px solid #cfd6e2",
  background: "#fff",
  padding: "4px 8px",
};

const DistributionTable: React.FC<{
  title: string;
  rows: PreviousNeighbourDistributionRow[];
}> = ({ title, rows }) => (
  <div style={cardStyle}>
    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{title}</div>
    <table style={miniTableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>Count</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Draws</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td style={tdStyle} colSpan={3}>No transition rows available.</td>
          </tr>
        ) : rows.map((row) => (
          <tr key={row.count}>
            <td style={tdStyle}>{row.count}</td>
            <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.observed}</td>
            <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.percent.toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

type NumberChipTone = "plain" | "singleton" | "duplicate" | "repeat";

const NumberChip: React.FC<{
  value: number;
  tone?: NumberChipTone;
}> = ({ value, tone = "plain" }) => {
  const styles: Record<NumberChipTone, React.CSSProperties> = {
    plain: { background: "#f8fafc", borderColor: "#dfe5ee", color: "#111827" },
    singleton: { background: "#eff6ff", borderColor: "#93c5fd", color: "#1d4ed8" },
    duplicate: { background: "#fffbeb", borderColor: "#fbbf24", color: "#92400e" },
    repeat: { background: "#f3f4f6", borderColor: "#cbd5e1", color: "#475569" },
  };

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 26,
      height: 24,
      borderRadius: 999,
      border: "1px solid",
      fontSize: 12,
      fontWeight: 800,
      fontVariantNumeric: "tabular-nums",
      ...styles[tone],
    }}>
      {value}
    </span>
  );
};

const TransitionHistoryTable: React.FC<{ transitions: PreviousNeighbourTransition[] }> = ({ transitions }) => {
  const recentTransitions = transitions.slice(-20).reverse();

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800 }}>±1 History Table</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>Latest {recentTransitions.length} WFMQYH transitions; coloured current-draw numbers are observed ±1 hits.</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 11, color: "#475569" }}>
          <span><NumberChip value={1} tone="duplicate" /> duplicated ±1</span>
          <span><NumberChip value={2} tone="singleton" /> singleton ±1</span>
          <span><NumberChip value={3} tone="repeat" /> direct repeat</span>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ ...miniTableStyle, minWidth: 720 }}>
          <thead>
            <tr>
              <th style={thStyle}>Previous draw</th>
              <th style={thStyle}>Current draw</th>
              <th style={{ ...thStyle, textAlign: "right" }}>±1 hits</th>
              <th style={thStyle}>Hit targets</th>
            </tr>
          </thead>
          <tbody>
            {recentTransitions.length === 0 ? (
              <tr>
                <td style={tdStyle} colSpan={4}>No transition rows available.</td>
              </tr>
            ) : recentTransitions.map((transition) => {
              const duplicateHitSet = new Set(transition.duplicateHits.map((entry) => entry.target));
              const singletonHitSet = new Set(transition.singletonHits.map((entry) => entry.target));
              const repeatSet = new Set(transition.directRepeats);
              const hitTargets = [...transition.duplicateHits, ...transition.singletonHits]
                .sort((left, right) => left.target - right.target);

              return (
                <tr key={`${transition.previousDate}-${transition.currentDate}`}>
                  <td style={tdStyle}>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{transition.previousDate}</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {transition.previousNumbers.map((number) => <NumberChip key={number} value={number} />)}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{transition.currentDate}</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {transition.currentNumbers.map((number) => {
                        const tone = duplicateHitSet.has(number)
                          ? "duplicate"
                          : singletonHitSet.has(number)
                            ? "singleton"
                            : repeatSet.has(number)
                              ? "repeat"
                              : "plain";
                        return <NumberChip key={number} value={number} tone={tone} />;
                      })}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>
                    {transition.totalHitCount}
                  </td>
                  <td style={tdStyle}>
                    {hitTargets.length ? formatTargets(hitTargets) : "None"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const PreviousNeighbourBacktestPanel: React.FC<PreviousNeighbourBacktestPanelProps> = ({ draws }) => {
  const [scope, setScope] = useState<PreviousNeighbourScope>("mains-plus-supps");
  const [warmupPairs, setWarmupPairs] = useState(50);
  const [candidatePoolSize, setCandidatePoolSize] = useState(200);
  const [selectedPerDraw, setSelectedPerDraw] = useState(20);

  const analysis = useMemo(
    () => analyzePreviousNeighbourBacktest(draws, {
      scope,
      warmupPairs,
      candidatePoolSize,
      selectedPerDraw,
      permutationIterations: 1000,
      seed: 20260613,
    }),
    [draws, scope, warmupPairs, candidatePoolSize, selectedPerDraw],
  );

  const backtest = analysis.candidateBacktest;
  const latest = analysis.latestTransition;

  return (
    <section aria-label="Previous ±1 Neighbour Backtest" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: "#1d4ed8",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 999,
              padding: "3px 8px",
            }}>
              Observe-only
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: "#166534",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 999,
              padding: "3px 8px",
            }}>
              Anti-lookahead
            </span>
          </div>
          <p style={{ margin: "8px 0 0", color: "#4b5563", maxWidth: 760 }}>
            Previous ±1 Neighbour Backtest checks whether candidates that match the previous draw&apos;s adjacent-neighbour shape
            score better out of sample. This panel does not alter candidate generation.
          </p>
        </div>
        <InfoHelp label="How previous ±1 neighbour backtesting works">
          For each historical target draw, the model only uses transitions that happened before that target draw. It compares random candidate
          samples with a soft-rule ranking that favours candidate neighbour counts similar to the previously observed transition shape.
        </InfoHelp>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <HigField label="Scope" help="Use all 8 drawn numbers or mains only.">
          <select
            name="previousNeighbourScope"
            value={scope}
            onChange={(event) => setScope(event.target.value as PreviousNeighbourScope)}
            style={selectStyle}
          >
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </HigField>
        <HigField label="Warm-up pairs" help="How many prior transitions are required before a target draw is tested.">
          <select
            name="previousNeighbourWarmup"
            value={warmupPairs}
            onChange={(event) => setWarmupPairs(Number(event.target.value))}
            style={selectStyle}
          >
            {WARMUP_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </HigField>
        <HigField label="Candidate pool" help="Random candidates sampled for each historical target draw before the soft rule ranks them.">
          <select
            name="previousNeighbourPool"
            value={candidatePoolSize}
            onChange={(event) => setCandidatePoolSize(Number(event.target.value))}
            style={selectStyle}
          >
            {POOL_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </HigField>
        <HigField label="Selected per draw" help="How many candidates are retained from each pool for baseline and soft-rule comparison.">
          <select
            name="previousNeighbourSelected"
            value={selectedPerDraw}
            onChange={(event) => setSelectedPerDraw(Number(event.target.value))}
            style={selectStyle}
          >
            {SELECTED_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </HigField>
      </div>

      {analysis.warnings.length > 0 ? (
        <div style={{
          border: "1px solid #facc15",
          background: "#fefce8",
          color: "#713f12",
          borderRadius: 8,
          padding: 10,
          fontSize: 12,
        }}>
          {analysis.warnings.join(" ")}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>Transitions</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{analysis.transitionCount}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>{analysis.validDraws} valid draws, {analysis.skippedDraws} skipped</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>Observed vs random</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>
            {formatNumber(analysis.observedAverageHits)} / {formatNumber(analysis.expectedAverageHits)}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Average ±1 hits per draw. Lift {formatNumber(analysis.lift, 3)}x.</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>Duplicated neighbours</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>
            {formatPercent(analysis.duplicateTargetHitRate)} vs {formatPercent(analysis.randomTargetHitRate)}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Duplicated target hit rate vs random single-number rate.</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>Soft-rule candidate check</div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{statusTextFor(analysis)}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            Δ {formatNumber(backtest.meanDeltaHits, 3)} hits; p {formatNumber(backtest.pValueOneSidedImprovement, 3)}.
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, background: "#f8fafc" }}>
        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Anti-lookahead rule</div>
        <div style={{ fontSize: 12, color: "#4b5563" }}>{backtest.antiLookaheadNote}</div>
        {backtest.firstEvaluation ? (
          <div style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>
            First tested target: {backtest.firstEvaluation.previousDate} → {backtest.firstEvaluation.currentDate},
            calibrated from {backtest.firstEvaluation.calibrationPairCount} earlier transition pairs.
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
        <DistributionTable title="Total ±1 hits per next draw" rows={analysis.totalHitDistribution} />
        <DistributionTable title="Duplicated-neighbour hits per next draw" rows={analysis.duplicateHitDistribution} />
        <DistributionTable title="Duplicated-neighbour target count" rows={analysis.duplicateTargetDistribution} />
      </div>

      <TransitionHistoryTable transitions={analysis.transitions} />

      <div style={cardStyle}>
        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Latest transition detail</div>
        {latest ? (
          <table style={miniTableStyle}>
            <tbody>
              <tr>
                <th style={thStyle}>Pair</th>
                <td style={tdStyle}>{latest.previousDate} → {latest.currentDate}</td>
              </tr>
              <tr>
                <th style={thStyle}>Duplicated targets</th>
                <td style={tdStyle}>{formatTargets(latest.duplicateTargets)}</td>
              </tr>
              <tr>
                <th style={thStyle}>Duplicated hits</th>
                <td style={tdStyle}>{formatTargets(latest.duplicateHits)}</td>
              </tr>
              <tr>
                <th style={thStyle}>Singleton hits</th>
                <td style={tdStyle}>{formatTargets(latest.singletonHits)}</td>
              </tr>
              <tr>
                <th style={thStyle}>Direct repeats</th>
                <td style={tdStyle}>{latest.directRepeats.length ? latest.directRepeats.join(", ") : "None"}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 12, color: "#6b7280" }}>No consecutive transition is available in the active history window.</div>
        )}
      </div>
    </section>
  );
};

export default PreviousNeighbourBacktestPanel;

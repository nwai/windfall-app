import React, { useMemo, useState } from "react";

import {
  analyzePreviousNeighbourBacktest,
  type PreviousNeighbourBacktestResult,
  type PreviousNeighbourDistributionRow,
  type PreviousNeighbourScope,
  type PreviousNeighbourTarget,
  type PreviousNeighbourTransition,
} from "../lib/previousNeighbourBacktest";
import {
  analyzePreviousNeighbourDirectionalPatterns,
  analyzePreviousNeighbourHandoff,
  type PreviousNeighbourHandoffAnalysis,
  type PreviousNeighbourHandoffRow,
  type PreviousNeighbourMissedSideHelper,
  type PreviousNeighbourDirectionalPatternAnalysis,
  type PreviousNeighbourDirectionalPatternDistributionRow,
  type PreviousNeighbourDirectionalPatternGroupRow,
  type PreviousNeighbourDirectionalSelectionHelper,
} from "../lib/previousNeighbourDirectionalPatterns";
import type { Draw } from "../types";
import { HigField, InfoHelp } from "./shared/HigControls";

interface PreviousNeighbourBacktestPanelProps {
  draws: Draw[];
  userSelectedNumbers?: readonly number[];
  excludedNumbers?: readonly number[];
  onToggleUserSelectedNumber?: (number: number) => void;
}

const SCOPE_OPTIONS: Array<{ value: PreviousNeighbourScope; label: string }> = [
  { value: "mains-plus-supps", label: "Mains + supps (8)" },
  { value: "mains", label: "Mains only (6)" },
];

const WARMUP_OPTIONS = [20, 50, 100];
const POOL_OPTIONS = [100, 200, 500];
const SELECTED_OPTIONS = [10, 20, 50];
const DIRECTIONAL_LOOKBACK_OPTIONS = [1, 2] as const;

const formatNumber = (value: number | null, digits = 2): string => (
  value == null ? "-" : value.toFixed(digits)
);

const formatPercent = (value: number, digits = 1): string => `${(value * 100).toFixed(digits)}%`;

const formatPValue = (value: number): string => (
  value < 0.001 ? "<0.001" : formatNumber(value, 3)
);

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

const advancedDetailsStyle: React.CSSProperties = {
  border: "1px solid #dfe5ee",
  borderRadius: 8,
  background: "#f8fafc",
  padding: "8px 10px",
};

const advancedSummaryStyle: React.CSSProperties = {
  cursor: "pointer",
  color: "#26313d",
  fontSize: 12,
  fontWeight: 850,
};

const stickyThStyle: React.CSSProperties = {
  ...thStyle,
  position: "sticky",
  top: 0,
  zIndex: 1,
  background: "#fff",
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

const DirectionalPatternTable: React.FC<{
  title: string;
  rows: PreviousNeighbourDirectionalPatternDistributionRow[];
}> = ({ title, rows }) => (
  <div style={cardStyle}>
    <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>{title}</div>
    <div style={{ overflowX: "auto" }}>
      <table style={{ ...miniTableStyle, minWidth: 330 }}>
        <thead>
          <tr>
            <th style={thStyle}>Pattern</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Draws</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td style={tdStyle} colSpan={3}>No directional pattern rows available.</td></tr>
          ) : rows.map((row) => (
            <tr key={row.pattern}>
              <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>{row.pattern}</td>
              <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.observed}</td>
              <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.percent.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const DirectionalGroupTable: React.FC<{
  title: string;
  rows: PreviousNeighbourDirectionalPatternGroupRow[];
  limit?: number;
}> = ({ title, rows, limit }) => {
  const visibleRows = limit ? rows.slice(0, limit) : rows;
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>{title}</div>
      <div style={{ overflowX: "auto", maxHeight: 260, overflowY: "auto" }}>
        <table style={{ ...miniTableStyle, minWidth: 520 }}>
          <thead>
            <tr>
              <th style={thStyle}>Slice</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Rows</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Avg unique</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Lift</th>
              <th style={{ ...thStyle, textAlign: "right" }}>≥3</th>
              <th style={thStyle}>Top pattern</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td style={tdStyle} colSpan={6}>No grouped rows available.</td></tr>
            ) : visibleRows.map((row) => (
              <tr key={row.label}>
                <td style={{ ...tdStyle, fontWeight: 850 }}>{row.label}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.transitions}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatNumber(row.averageUniqueHits)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatNumber(row.lift, 3)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatPercent(row.atLeastThreeRate)}</td>
                <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{row.topPattern} ({row.topPatternCount})</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const handoffWinnerLabel = (winner: PreviousNeighbourHandoffRow["cleanWinner"]): string => {
  if (winner === "hit-side") return "Hit side";
  if (winner === "miss-side") return "Miss side";
  return "Tie";
};

const HandoffNumberList: React.FC<{
  label: string;
  numbers: number[];
  emptyLabel?: string;
  tone?: NumberChipTone;
  selectedNumbers?: readonly number[];
  excludedNumbers?: readonly number[];
  onToggleNumber?: (number: number) => void;
}> = ({
  label,
  numbers,
  emptyLabel = "None",
  tone = "plain",
  selectedNumbers = [],
  excludedNumbers = [],
  onToggleNumber,
}) => {
  const selectedSet = new Set(selectedNumbers);
  const excludedSet = new Set(excludedNumbers);
  return (
    <div>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 850, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {numbers.length ? numbers.map((number) => <NumberChip
          key={`${label}-${number}`}
          value={number}
          tone={tone}
          selected={selectedSet.has(number)}
          disabled={excludedSet.has(number)}
          onToggle={onToggleNumber}
        />) : (
          <span style={{ color: "#64748b", fontSize: 12 }}>{emptyLabel}</span>
        )}
      </div>
    </div>
  );
};

const HandoffMetricCard: React.FC<{
  label: string;
  value: string;
  detail: string;
}> = ({ label, value, detail }) => (
  <div style={cardStyle}>
    <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
    <div style={{ fontSize: 19, fontWeight: 850 }}>{value}</div>
    <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.35 }}>{detail}</div>
  </div>
);

const LiveHandoffPlanningCard: React.FC<{
  handoff: PreviousNeighbourHandoffAnalysis;
  helper: PreviousNeighbourDirectionalSelectionHelper | null;
  userSelectedNumbers?: readonly number[];
  excludedNumbers?: readonly number[];
  onToggleUserSelectedNumber?: (number: number) => void;
}> = ({
  handoff,
  helper,
  userSelectedNumbers = [],
  excludedNumbers = [],
  onToggleUserSelectedNumber,
}) => {
  const allTargets = helper
    ? Array.from(new Set([...helper.singletonTargets, ...helper.duplicateTargets])).sort((left, right) => left - right)
    : [];

  return (
    <div style={{ ...cardStyle, background: "#f8fafc", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#26313d" }}>Live hand-off read + latest ±1/±2 targets</div>
          <div style={{ marginTop: 3, fontSize: 12, color: "#64748b", lineHeight: 1.45, maxWidth: 920 }}>
            Updates from the active draw history. The clean comparison is historical; the target cloud is built from the most recent draw only.
          </div>
        </div>
        <span style={{
          fontSize: 11,
          fontWeight: 900,
          textTransform: "uppercase",
          color: "#1d4ed8",
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: 999,
          padding: "3px 8px",
        }}>
          Selectable helper
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        <div style={{ ...cardStyle, padding: 10 }}>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>Clean comparison</div>
          <div style={{ marginTop: 4, fontSize: 27, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: "#111827" }}>
            {handoff.hitSideWins} / {handoff.missSideWins} / {handoff.ties}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#4b5563", lineHeight: 1.35 }}>
            hit-side wins / miss-side wins / ties
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: "#64748b", lineHeight: 1.35 }}>
            {handoff.testedTriples} no-lookahead A → B → C triples; sign-test p {formatPValue(handoff.signTestPValue)}.
          </div>
        </div>

        <div style={{ ...cardStyle, padding: 10 }}>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>Possible latest-draw ±1/±2 numbers</div>
          {helper ? (
            <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
              <HandoffNumberList
                label={`All targets from ${helper.sourceDateLabel} (${helper.targetCount})`}
                numbers={allTargets}
                selectedNumbers={userSelectedNumbers}
                excludedNumbers={excludedNumbers}
                onToggleNumber={onToggleUserSelectedNumber}
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 8 }}>
                <HandoffNumberList label="-2" numbers={helper.targetsByOffset["-2"]} selectedNumbers={userSelectedNumbers} excludedNumbers={excludedNumbers} onToggleNumber={onToggleUserSelectedNumber} />
                <HandoffNumberList label="-1" numbers={helper.targetsByOffset["-1"]} selectedNumbers={userSelectedNumbers} excludedNumbers={excludedNumbers} onToggleNumber={onToggleUserSelectedNumber} />
                <HandoffNumberList label="+1" numbers={helper.targetsByOffset["+1"]} selectedNumbers={userSelectedNumbers} excludedNumbers={excludedNumbers} onToggleNumber={onToggleUserSelectedNumber} />
                <HandoffNumberList label="+2" numbers={helper.targetsByOffset["+2"]} selectedNumbers={userSelectedNumbers} excludedNumbers={excludedNumbers} onToggleNumber={onToggleUserSelectedNumber} />
                <HandoffNumberList label="Duplicated / ambiguous" numbers={helper.duplicateTargets} tone="duplicate" selectedNumbers={userSelectedNumbers} excludedNumbers={excludedNumbers} onToggleNumber={onToggleUserSelectedNumber} />
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
              At least one valid real draw is needed to build latest-draw ±1/±2 targets.
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.45 }}>
        This card is a user helper. Selecting a target updates shared User Selected Numbers; the clean comparison remains evidence rather than proof.
      </div>
    </div>
  );
};

const CurrentMissedSideHelper: React.FC<{
  helper: PreviousNeighbourMissedSideHelper | null;
}> = ({ helper }) => {
  if (!helper) {
    return (
      <div style={{ ...cardStyle, background: "#f8fafc" }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#26313d" }}>Current missed-side helper</div>
        <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
          At least two valid real draws are needed to build the latest missed-side helper.
        </div>
      </div>
    );
  }

  const allTargets = Array.from(new Set([...helper.singletonTargets, ...helper.duplicateTargets]))
    .sort((left, right) => left - right);

  return (
    <div style={{ ...cardStyle, background: "#f8fafc", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#26313d" }}>Current missed-side helper</div>
          <div style={{ marginTop: 3, fontSize: 12, color: "#64748b", lineHeight: 1.45, maxWidth: 920 }}>
            Built from {helper.previousDate} → {helper.latestDate}. These are the old neighbour targets that <b>missed</b> the latest draw,
            then received fresh <code>±1/±2</code> treatment for the next-draw planning cloud.
          </div>
        </div>
        <span style={{
          fontSize: 11,
          fontWeight: 900,
          textTransform: "uppercase",
          color: "#92400e",
          background: "#fffbeb",
          border: "1px solid #fbbf24",
          borderRadius: 999,
          padding: "3px 8px",
        }}>
          Helper only
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
        <div style={{ ...cardStyle, padding: 10 }}>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>Latest split</div>
          <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
            <HandoffNumberList
              label={`${helper.hitSourceNumbers.length} old-neighbour hit${helper.hitSourceNumbers.length === 1 ? "" : "s"} in latest draw`}
              numbers={helper.hitSourceNumbers}
              tone="singleton"
            />
            <div>
              <HandoffNumberList
                label={`${helper.missedSourceNumbers.length}/${helper.oldNeighbourTargetCount} old-neighbour misses to treat`}
                numbers={helper.missedSourceNumbers}
                tone="repeat"
              />
              <div style={{ marginTop: 5, fontSize: 11, color: "#64748b", lineHeight: 1.35 }}>
                This source list can be wide. That is why this remains a selection helper rather than an automatic forced inclusion rule.
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, padding: 10 }}>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>Fresh ±1/±2 cloud from missed sources</div>
          <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
            <HandoffNumberList label={`All fresh targets (${helper.targetCount})`} numbers={allTargets} tone="plain" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              <HandoffNumberList label="-2" numbers={helper.targetsByOffset["-2"]} />
              <HandoffNumberList label="-1" numbers={helper.targetsByOffset["-1"]} />
              <HandoffNumberList label="+1" numbers={helper.targetsByOffset["+1"]} />
              <HandoffNumberList label="+2" numbers={helper.targetsByOffset["+2"]} />
              <HandoffNumberList label="Duplicated / ambiguous" numbers={helper.duplicateTargets} tone="duplicate" />
            </div>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.45 }}>
        Use this as an inspection shortlist when the hand-off audit favours the miss side. It is not a guarantee, and it does not change generation unless you manually use the numbers elsewhere.
      </div>
    </div>
  );
};

const HandoffAuditTable: React.FC<{ rows: PreviousNeighbourHandoffRow[] }> = ({ rows }) => (
  <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 340, border: "1px solid #edf0f5", borderRadius: 8 }}>
    <table style={{ ...miniTableStyle, minWidth: 860 }}>
      <thead>
        <tr>
          <th style={stickyThStyle}>A → B → C</th>
          <th style={stickyThStyle}>Hit sources in B</th>
          <th style={stickyThStyle}>C via hit side</th>
          <th style={stickyThStyle}>C via miss side</th>
          <th style={stickyThStyle}>Clean result</th>
          <th style={stickyThStyle}>Exact / delayed</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td style={tdStyle} colSpan={6}>No A → B → C rows available.</td></tr>
        ) : rows.map((row) => (
          <tr key={`${row.previousDate}-${row.hitDate}-${row.nextDate}`}>
            <td style={tdStyle}>
              <div style={{ fontSize: 11, color: "#64748b" }}>{row.previousDate}</div>
              <div style={{ fontSize: 12, fontWeight: 850 }}>{row.hitDate}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>tested against {row.nextDate}</div>
            </td>
            <td style={tdStyle}>
              <HandoffNumberList label={`${row.hitSourceNumbers.length} hit source${row.hitSourceNumbers.length === 1 ? "" : "s"}`} numbers={row.hitSourceNumbers} tone="singleton" />
              <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>
                {row.missedSourceCount} missed sources{row.missedSourcePreview.length ? `; first ${row.missedSourcePreview.join(", ")}` : ""}
              </div>
            </td>
            <td style={tdStyle}>
              <HandoffNumberList label={`${row.hitSideNextHits.length}/${row.hitSideTargetCount} targets`} numbers={row.hitSideNextHits} tone="duplicate" />
              <div style={{ marginTop: 5, fontSize: 11, color: "#64748b" }}>
                clean {row.hitSideExclusiveNextHits.length}/{row.hitSideExclusiveTargetCount}
              </div>
            </td>
            <td style={tdStyle}>
              <HandoffNumberList label={`${row.missSideNextHits.length}/${row.missSideTargetCount} targets`} numbers={row.missSideNextHits} tone="repeat" />
              <div style={{ marginTop: 5, fontSize: 11, color: "#64748b" }}>
                clean {row.missSideExclusiveNextHits.length}/{row.missSideExclusiveTargetCount}
              </div>
            </td>
            <td style={tdStyle}>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 24,
                borderRadius: 999,
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: 900,
                background: row.cleanWinner === "hit-side" ? "#eff6ff" : row.cleanWinner === "miss-side" ? "#f3f4f6" : "#f8fafc",
                border: `1px solid ${row.cleanWinner === "hit-side" ? "#93c5fd" : row.cleanWinner === "miss-side" ? "#cbd5e1" : "#e2e8f0"}`,
                color: row.cleanWinner === "hit-side" ? "#1d4ed8" : "#475569",
              }}>
                {handoffWinnerLabel(row.cleanWinner)}
              </div>
              <div style={{ marginTop: 5, fontSize: 11, color: "#64748b", fontVariantNumeric: "tabular-nums" }}>
                Δ {row.exclusiveRateDelta.toFixed(3)}
              </div>
            </td>
            <td style={tdStyle}>
              <HandoffNumberList label="Hit-source exact repeats" numbers={row.hitSourceExactRepeats} tone="duplicate" />
              <div style={{ marginTop: 8 }}>
                <HandoffNumberList label="Delayed old misses" numbers={row.delayedMissedTargets} tone="repeat" />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const HandoffDiagnostic: React.FC<{
  analysis: PreviousNeighbourHandoffAnalysis;
}> = ({ analysis }) => (
  <div style={{ ...cardStyle, display: "grid", gap: 10 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#26313d" }}>Hit vs missed neighbour hand-off test</div>
        <div style={{ marginTop: 3, fontSize: 12, color: "#64748b", lineHeight: 1.45, maxWidth: 920 }}>
          Tests each A → B → C triple. Numbers from A&apos;s ±1/±2 cloud that hit in B become the <b>hit side</b>;
          cloud numbers that missed B become the <b>miss side</b>. Both sides are then treated as ±1/±2 sources and scored against C.
        </div>
      </div>
      <span style={{
        fontSize: 11,
        fontWeight: 900,
        textTransform: "uppercase",
        color: "#1d4ed8",
        background: "#eff6ff",
        border: "1px solid #bfdbfe",
        borderRadius: 999,
        padding: "3px 8px",
      }}>
        Observe-only hand-off
      </span>
    </div>

    {analysis.warnings.length ? (
      <div style={{ border: "1px solid #facc15", background: "#fefce8", color: "#713f12", borderRadius: 8, padding: 10, fontSize: 12 }}>
        {analysis.warnings.join(" ")}
      </div>
    ) : null}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
      <HandoffMetricCard
        label="Hit side"
        value={`${formatPercent(analysis.hitSideTargetHitRate)} · ${formatNumber(analysis.averageHitSideNextHits)} avg`}
        detail={`Lift ${formatNumber(analysis.hitSideTargetLift, 3)}x vs random ${formatPercent(analysis.randomTargetHitRate)}.`}
      />
      <HandoffMetricCard
        label="Miss side"
        value={`${formatPercent(analysis.missSideTargetHitRate)} · ${formatNumber(analysis.averageMissSideNextHits)} avg`}
        detail={`Lift ${formatNumber(analysis.missSideTargetLift, 3)}x vs random ${formatPercent(analysis.randomTargetHitRate)}.`}
      />
      <HandoffMetricCard
        label="Clean exclusive comparison"
        value={`${analysis.hitSideWins}/${analysis.missSideWins}/${analysis.ties}`}
        detail={`Hit wins / miss wins / ties. Mean clean Δ ${formatNumber(analysis.exclusiveRateDelta, 3)}; sign-test p ${formatPValue(analysis.signTestPValue)}.`}
      />
      <HandoffMetricCard
        label="Exact carry / delayed old misses"
        value={`${formatNumber(analysis.averageHitSourceExactRepeats)} / ${formatNumber(analysis.averageDelayedMissedTargets)}`}
        detail="Average exact repeats from hit-side sources vs old missed target numbers appearing one draw late."
      />
    </div>

    <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.45 }}>
      {analysis.antiLookaheadNote} Raw miss-side counts can look larger because the missed source pool is wider, so the clean exclusive rate is the fairer read.
    </div>

    <CurrentMissedSideHelper helper={analysis.currentMissedSideHelper} />

    <HandoffAuditTable rows={analysis.latestRows} />
  </div>
);

const TargetList: React.FC<{ label: string; numbers: number[]; tone?: NumberChipTone }> = ({ label, numbers, tone = "plain" }) => (
  <div>
    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 850, marginBottom: 4 }}>{label}</div>
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {numbers.length ? numbers.map((number) => <NumberChip key={`${label}-${number}`} value={number} tone={tone} />) : (
        <span style={{ color: "#64748b", fontSize: 12 }}>None</span>
      )}
    </div>
  </div>
);

const DirectionalPatternLab: React.FC<{
  analysis: PreviousNeighbourDirectionalPatternAnalysis;
}> = ({ analysis }) => {
  const helper = analysis.selectionHelper;
  const latest = analysis.latestTransition;
  const topPattern = analysis.topPatterns[0];

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#26313d" }}>Previous Draw ±1/±2 Directional Pattern Lab</div>
          <div style={{ marginTop: 3, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
            Observe-only helper. It records each transition fingerprint as <b>-2/-1/+1/+2</b> counts and compares average unique hits with random expectation.
          </div>
        </div>
        <span style={{
          fontSize: 11,
          fontWeight: 900,
          textTransform: "uppercase",
          color: "#1d4ed8",
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: 999,
          padding: "3px 8px",
        }}>
          Selection helper
        </span>
      </div>

      {analysis.warnings.length ? (
        <div style={{ border: "1px solid #facc15", background: "#fefce8", color: "#713f12", borderRadius: 8, padding: 10, fontSize: 12 }}>
          {analysis.warnings.join(" ")}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>Directional transitions</div>
          <div style={{ fontSize: 24, fontWeight: 850 }}>{analysis.transitionCount}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>{analysis.validDraws} valid draws; lookback {analysis.lookbackDraws}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>Avg unique vs random</div>
          <div style={{ fontSize: 20, fontWeight: 850 }}>
            {formatNumber(analysis.averageUniqueHits)} / {formatNumber(analysis.averageExpectedUniqueHits)}
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Lift {formatNumber(analysis.lift, 3)}x. Near 1.000 means no global edge.</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>Latest recorded fingerprint</div>
          <div style={{ fontSize: 15, fontWeight: 850, fontVariantNumeric: "tabular-nums" }}>
            {latest?.pattern ?? "none"}
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {latest ? `${latest.previousDateLabel} → ${latest.currentDate}` : "No latest transition."}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>Most repeated fingerprint</div>
          <div style={{ fontSize: 15, fontWeight: 850, fontVariantNumeric: "tabular-nums" }}>
            {topPattern?.pattern ?? "none"}
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {topPattern ? `${topPattern.observed} rows · ${topPattern.percent.toFixed(1)}%` : "No top pattern."}
          </div>
        </div>
      </div>

      {helper ? (
        <div style={{ ...cardStyle, background: "#f8fafc" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 850 }}>Current selection helper target cloud</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>
                Built from {helper.sourceDateLabel}; {helper.targetCount} unique ±1/±2 targets. Duplicated targets are candidates produced by more than one source/offset.
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <TargetList label="-2 targets" numbers={helper.targetsByOffset["-2"]} />
            <TargetList label="-1 targets" numbers={helper.targetsByOffset["-1"]} />
            <TargetList label="+1 targets" numbers={helper.targetsByOffset["+1"]} />
            <TargetList label="+2 targets" numbers={helper.targetsByOffset["+2"]} />
            <TargetList label="Duplicated / ambiguous" numbers={helper.duplicateTargets} tone="duplicate" />
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
        <DirectionalPatternTable title="Most common directional fingerprints" rows={analysis.topPatterns} />
        <DirectionalGroupTable title="By draw ordinal" rows={analysis.byDrawOrdinal} />
        <DirectionalGroupTable title="By weekday" rows={analysis.byWeekday} />
      </div>
    </div>
  );
};

type NumberChipTone = "plain" | "singleton" | "duplicate" | "repeat";

const NumberChip: React.FC<{
  value: number;
  tone?: NumberChipTone;
  selected?: boolean;
  disabled?: boolean;
  onToggle?: (number: number) => void;
}> = ({ value, tone = "plain", selected = false, disabled = false, onToggle }) => {
  const styles: Record<NumberChipTone, React.CSSProperties> = {
    plain: { background: "#f8fafc", borderColor: "#dfe5ee", color: "#111827" },
    singleton: { background: "#eff6ff", borderColor: "#93c5fd", color: "#1d4ed8" },
    duplicate: { background: "#fffbeb", borderColor: "#fbbf24", color: "#92400e" },
    repeat: { background: "#f3f4f6", borderColor: "#cbd5e1", color: "#475569" },
  };
  const selectable = typeof onToggle === "function";
  const baseStyle: React.CSSProperties = {
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
    ...(selected ? {
      background: "#dcfce7",
      borderColor: "#15803d",
      color: "#14532d",
      boxShadow: "0 0 0 2px rgba(21, 128, 61, 0.14)",
    } : null),
    ...(disabled ? {
      background: "#f1f5f9",
      borderColor: "#cbd5e1",
      color: "#94a3b8",
      boxShadow: "none",
    } : null),
  };

  if (selectable) {
    return (
      <button
        type="button"
        onClick={() => !disabled && onToggle?.(value)}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={`${selected ? "Deselect" : "Select"} ${value} as a user selected number`}
        title={disabled
          ? `Number ${value} is unavailable because it is currently excluded.`
          : `${selected ? "Deselect" : "Select"} ${value} in shared User Selected Numbers.`}
        style={{
          ...baseStyle,
          cursor: disabled ? "not-allowed" : "pointer",
          padding: "0 7px",
          fontFamily: "inherit",
        }}
      >
        {value}
      </button>
    );
  }

  return (
    <span style={baseStyle}>
      {value}
    </span>
  );
};

const TransitionHistoryTable: React.FC<{ transitions: PreviousNeighbourTransition[] }> = ({ transitions }) => {
  const visibleTransitions = [...transitions].reverse();

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800 }}>±1 History Table</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{visibleTransitions.length} WFMQYH transitions, newest first; coloured current-draw numbers are observed ±1 hits.</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 11, color: "#475569" }}>
          <span><NumberChip value={1} tone="duplicate" /> duplicated ±1</span>
          <span><NumberChip value={2} tone="singleton" /> singleton ±1</span>
          <span><NumberChip value={3} tone="repeat" /> direct repeat</span>
        </div>
      </div>
      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 420, border: "1px solid #edf0f5", borderRadius: 8 }}>
        <table style={{ ...miniTableStyle, minWidth: 720 }}>
          <thead>
            <tr>
              <th style={stickyThStyle}>Previous draw</th>
              <th style={stickyThStyle}>Current draw</th>
              <th style={{ ...stickyThStyle, textAlign: "right" }}>±1 hits</th>
              <th style={stickyThStyle}>Hit targets</th>
            </tr>
          </thead>
          <tbody>
            {visibleTransitions.length === 0 ? (
              <tr>
                <td style={tdStyle} colSpan={4}>No transition rows available.</td>
              </tr>
            ) : visibleTransitions.map((transition) => {
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

export const PreviousNeighbourBacktestPanel: React.FC<PreviousNeighbourBacktestPanelProps> = ({
  draws,
  userSelectedNumbers = [],
  excludedNumbers = [],
  onToggleUserSelectedNumber,
}) => {
  const [scope, setScope] = useState<PreviousNeighbourScope>("mains-plus-supps");
  const [directionalLookback, setDirectionalLookback] = useState<1 | 2>(1);
  const [warmupPairs, setWarmupPairs] = useState(50);
  const [candidatePoolSize, setCandidatePoolSize] = useState(200);
  const [selectedPerDraw, setSelectedPerDraw] = useState(20);

  const directionalAnalysis = useMemo(
    () => analyzePreviousNeighbourDirectionalPatterns(draws, {
      scope,
      lookbackDraws: directionalLookback,
    }),
    [directionalLookback, draws, scope],
  );

  const handoffAnalysis = useMemo(
    () => analyzePreviousNeighbourHandoff(draws, {
      scope,
      latestRows: 36,
    }),
    [draws, scope],
  );

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
    <section aria-label="Previous ±1/±2 Neighbour Diagnostics" style={{ display: "grid", gap: 12 }}>
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
            Previous-neighbour diagnostics check whether draws and candidates match the preceding draw&apos;s adjacent-number structure.
            The ±1/±2 lab is a selection helper; the older ±1 soft-rule backtest remains observe-only and does not alter candidate generation.
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
        <HigField label="±1/±2 lookback" help="Use the previous one draw or previous two draws to build the directional target cloud.">
          <select
            name="previousNeighbourDirectionalLookback"
            value={directionalLookback}
            onChange={(event) => setDirectionalLookback(Number(event.target.value) as 1 | 2)}
            style={selectStyle}
          >
            {DIRECTIONAL_LOOKBACK_OPTIONS.map((value) => (
              <option key={value} value={value}>Previous {value} draw{value === 1 ? "" : "s"}</option>
            ))}
          </select>
        </HigField>
      </div>

      <LiveHandoffPlanningCard
        handoff={handoffAnalysis}
        helper={directionalAnalysis.selectionHelper}
        userSelectedNumbers={userSelectedNumbers}
        excludedNumbers={excludedNumbers}
        onToggleUserSelectedNumber={onToggleUserSelectedNumber}
      />

      <details style={advancedDetailsStyle}>
        <summary style={advancedSummaryStyle}>Advanced soft-rule replay settings</summary>
        <div style={{ marginTop: 8, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
          These controls only tune the older observe-only ±1 replay below. They do not change the ±1/±2 Directional Pattern Lab and do not alter candidate generation.
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start", marginTop: 10 }}>
          <HigField label="Warm-up pairs" help="Training transitions used before any historical target draw is tested.">
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
          <HigField label="Selected per draw" help="Candidates retained from each pool for baseline versus soft-rule comparison.">
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
      </details>

      <DirectionalPatternLab analysis={directionalAnalysis} />

      <HandoffDiagnostic analysis={handoffAnalysis} />

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

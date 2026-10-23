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
  type PreviousNeighbourDirectionalSelectionHelper,
} from "../lib/previousNeighbourDirectionalPatterns";
import {
  type PreviousNeighbourAtlasCloudSizeRow,
  type PreviousNeighbourAtlasCompositionRow,
  type PreviousNeighbourAtlasOrdinalRow,
  type PreviousNeighbourAtlasTransition,
  type PreviousNeighbourCountShapeAtlasAnalysis,
} from "../lib/previousNeighbourCountShapeAtlas";
import {
  type PreviousNeighbourAtlasHistorySource,
} from "../lib/previousNeighbourAtlasEvidence";
import type { Draw } from "../types";
import type { LatestNeighbourSupportMode } from "../lib/latestNeighbourSupport";
import { HigButton, HigField, InfoHelp } from "./shared/HigControls";
import LatestNeighbourLearningAuditCard from "./LatestNeighbourLearningAuditCard";

interface PreviousNeighbourBacktestPanelProps {
  draws: Draw[];
  auditDraws?: Draw[];
  auditHistoryScopeLabel?: string;
  atlasAnalysis: PreviousNeighbourCountShapeAtlasAnalysis;
  scope: PreviousNeighbourScope;
  onScopeChange: (scope: PreviousNeighbourScope) => void;
  directionalLookback: 1 | 2;
  onDirectionalLookbackChange: (lookback: 1 | 2) => void;
  atlasHistorySource: PreviousNeighbourAtlasHistorySource;
  onAtlasHistorySourceChange: (source: PreviousNeighbourAtlasHistorySource) => void;
  planningTargetDate?: string;
  planningTargetDrawOrdinal?: number;
  planningTargetMonthExpectedDrawCount?: number;
  liveNeighbourMode?: LatestNeighbourSupportMode;
  liveNeighbourEnabled?: boolean;
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

type NeighbourAtlasView = "count" | "direction" | "composition" | "ledger";
const ATLAS_VIEW_OPTIONS: Array<{ value: NeighbourAtlasView; label: string }> = [
  { value: "count", label: "Count & stage" },
  { value: "direction", label: "Direction" },
  { value: "composition", label: "Composition" },
  { value: "ledger", label: "Transition ledger" },
];

const sampleQualityStyle = (quality: PreviousNeighbourAtlasOrdinalRow["sampleQuality"]): React.CSSProperties => {
  if (quality === "Broad") return { color: "#166534", background: "#f0fdf4", borderColor: "#86efac" };
  if (quality === "Limited") return { color: "#92400e", background: "#fffbeb", borderColor: "#fbbf24" };
  return { color: "#9f1239", background: "#fff1f2", borderColor: "#fda4af" };
};

const SampleQualityPill: React.FC<{ quality: PreviousNeighbourAtlasOrdinalRow["sampleQuality"] }> = ({ quality }) => (
  <span style={{
    display: "inline-flex",
    alignItems: "center",
    minHeight: 22,
    padding: "1px 7px",
    border: "1px solid",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 900,
    textTransform: "uppercase",
    ...sampleQualityStyle(quality),
  }}>
    {quality}
  </span>
);

const AtlasMetricCard: React.FC<{
  label: string;
  value: React.ReactNode;
  detail: React.ReactNode;
}> = ({ label, value, detail }) => (
  <div style={{ ...cardStyle, minWidth: 0 }}>
    <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 800 }}>{label}</div>
    <div style={{ marginTop: 3, fontSize: 20, lineHeight: 1.15, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    <div style={{ marginTop: 4, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>{detail}</div>
  </div>
);

const CountDistributionTable: React.FC<{
  analysis: PreviousNeighbourCountShapeAtlasAnalysis;
}> = ({ analysis }) => (
  <div style={cardStyle}>
    <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 4 }}>Unique target-hit count</div>
    <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4, marginBottom: 8 }}>
      Each drawn number is counted once, even when several source/offset paths point to it.
    </div>
    <div style={{ overflowX: "auto" }}>
      <table style={{ ...miniTableStyle, minWidth: 330 }}>
        <thead>
          <tr>
            <th style={stickyThStyle}>Unique hits</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Draws</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Share</th>
          </tr>
        </thead>
        <tbody>
          {analysis.countDistribution.map((row) => (
            <tr key={row.count}>
              <td style={{ ...tdStyle, fontWeight: 850 }}>{row.count}</td>
              <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.observed}</td>
              <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatPercent(row.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const OrdinalCountMatrix: React.FC<{
  rows: PreviousNeighbourAtlasOrdinalRow[];
  drawSize: 6 | 8;
  planningTargetDrawOrdinal?: number;
}> = ({ rows, drawSize, planningTargetDrawOrdinal }) => (
  <div style={cardStyle}>
    <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 4 }}>Unique-hit count by monthly draw ordinal</div>
    <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4, marginBottom: 8 }}>
      Cells show historical draw counts; hover or focus-equivalent table text gives the within-ordinal share. Current target D{planningTargetDrawOrdinal ?? "?"} is highlighted.
    </div>
    <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 430, border: "1px solid #edf0f5", borderRadius: 8 }}>
      <table style={{ ...miniTableStyle, minWidth: 1140 }}>
        <thead>
          <tr>
            <th style={stickyThStyle}>Stage</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Trials</th>
            {Array.from({ length: drawSize + 1 }, (_, count) => (
              <th key={count} style={{ ...stickyThStyle, textAlign: "center" }}>{count}</th>
            ))}
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Avg cloud</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Avg</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Expected</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Lift</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>≥3</th>
            <th style={stickyThStyle}>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isCurrentTarget = row.drawOrdinal === planningTargetDrawOrdinal;
            return (
              <tr key={row.drawOrdinal} style={{ background: isCurrentTarget ? "#eff6ff" : "#fff" }}>
                <td style={{ ...tdStyle, fontWeight: 900, color: isCurrentTarget ? "#1d4ed8" : "#111827" }}>
                  {row.label}{isCurrentTarget ? " · target" : ""}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.trials}</td>
                {row.countDistribution.map((cell) => (
                  <td
                    key={cell.count}
                    style={{
                      ...tdStyle,
                      minWidth: 44,
                      textAlign: "center",
                      fontVariantNumeric: "tabular-nums",
                      color: cell.observed ? "#111827" : "#94a3b8",
                      fontWeight: cell.observed ? 800 : 500,
                    }}
                    title={`${row.label}: ${cell.observed} of ${row.trials} draws (${formatPercent(cell.rate)}) had ${cell.count} unique hit${cell.count === 1 ? "" : "s"}.`}
                  >
                    <div>{cell.observed}</div>
                    <div style={{ fontSize: 9, color: "#64748b", fontWeight: 600 }}>{formatPercent(cell.rate, 0)}</div>
                  </td>
                ))}
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  <div style={{ fontWeight: 850 }}>{formatNumber(row.averageTargetCount, 1)} / 45</div>
                  <div style={{ fontSize: 9, color: "#64748b", fontWeight: 600 }}>{formatPercent(row.averageFieldCoverage, 0)}</div>
                </td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 850 }}>{formatNumber(row.averageUniqueHits)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatNumber(row.averageExpectedUniqueHits)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatNumber(row.lift, 3)}x</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatPercent(row.atLeastThreeRate)}</td>
                <td style={tdStyle}><SampleQualityPill quality={row.sampleQuality} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

const CloudSizeControlledTable: React.FC<{
  rows: PreviousNeighbourAtlasCloudSizeRow[];
  planningTargetDrawOrdinal?: number;
  currentTargetCount?: number;
}> = ({ rows, planningTargetDrawOrdinal, currentTargetCount }) => (
  <div style={cardStyle}>
    <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 4 }}>Cloud-size-controlled draw-stage evidence</div>
    <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4, marginBottom: 8 }}>
      Compares like-sized target clouds in fixed three-number bands. The interval is calculated from each draw&apos;s observed hits minus its exact cloud-size expectation; crossing zero means unresolved.
    </div>
    <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 390, border: "1px solid #edf0f5", borderRadius: 8 }}>
      <table style={{ ...miniTableStyle, minWidth: 850 }}>
        <thead>
          <tr>
            <th style={stickyThStyle}>Stage</th>
            <th style={stickyThStyle}>Cloud band</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Trials</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Avg cloud</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Observed</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Expected</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Excess</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>95% excess interval</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Lift</th>
            <th style={stickyThStyle}>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isCurrent = row.drawOrdinal === planningTargetDrawOrdinal
              && currentTargetCount !== undefined
              && currentTargetCount >= row.bandMinimum
              && currentTargetCount <= row.bandMaximum;
            const interval = row.excessHitsCiLow === null || row.excessHitsCiHigh === null
              ? "n/a"
              : `${formatNumber(row.excessHitsCiLow)} to ${formatNumber(row.excessHitsCiHigh)}`;
            return (
              <tr key={`${row.drawOrdinal}-${row.bandMinimum}`} style={{ background: isCurrent ? "#eff6ff" : "#fff" }}>
                <td style={{ ...tdStyle, fontWeight: 900, color: isCurrent ? "#1d4ed8" : "#111827" }}>{row.drawLabel}{isCurrent ? " · current" : ""}</td>
                <td style={{ ...tdStyle, fontWeight: 850 }}>{row.bandLabel} targets</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.trials}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatNumber(row.averageTargetCount, 1)} <span style={{ color: "#64748b" }}>({formatPercent(row.averageFieldCoverage, 0)})</span></td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 850 }}>{formatNumber(row.averageUniqueHits)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatNumber(row.averageExpectedUniqueHits)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.averageExcessHits >= 0 ? "+" : ""}{formatNumber(row.averageExcessHits)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{interval}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatNumber(row.lift, 3)}x</td>
                <td style={tdStyle}><SampleQualityPill quality={row.sampleQuality} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

const CompositionTable: React.FC<{
  title: string;
  rows: PreviousNeighbourAtlasCompositionRow[];
  populationNote: string;
}> = ({ title, rows, populationNote }) => (
  <div style={cardStyle}>
    <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 4 }}>{title}</div>
    <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4, marginBottom: 8 }}>{populationNote}</div>
    <table style={miniTableStyle}>
      <thead>
        <tr>
          <th style={stickyThStyle}>Class</th>
          <th style={{ ...stickyThStyle, textAlign: "right" }}>Observed</th>
          <th style={{ ...stickyThStyle, textAlign: "right" }}>Share</th>
          <th style={{ ...stickyThStyle, textAlign: "right" }}>Expected</th>
          <th style={{ ...stickyThStyle, textAlign: "right" }}>Lift</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td style={{ ...tdStyle, fontWeight: 850 }}>{row.label}</td>
            <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.observed}</td>
            <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatPercent(row.observedShare)}</td>
            <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatNumber(row.expected)}</td>
            <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 850 }}>{formatNumber(row.lift, 3)}x</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const OrdinalCompositionTable: React.FC<{
  rows: PreviousNeighbourAtlasOrdinalRow[];
  planningTargetDrawOrdinal?: number;
}> = ({ rows, planningTargetDrawOrdinal }) => (
  <div style={cardStyle}>
    <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 4 }}>Composition by monthly draw ordinal</div>
    <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4, marginBottom: 8 }}>
      Each cell is observed / conditionally expected. Expectations use the actual eligible cloud in every historical transition.
    </div>
    <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 390, border: "1px solid #edf0f5", borderRadius: 8 }}>
      <table style={{ ...miniTableStyle, minWidth: 760 }}>
        <thead>
          <tr>
            <th style={stickyThStyle}>Stage</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Trials</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Odd</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Even</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>1 digit</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>2 digits</th>
            <th style={stickyThStyle}>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isCurrentTarget = row.drawOrdinal === planningTargetDrawOrdinal;
            return (
              <tr key={row.drawOrdinal} style={{ background: isCurrentTarget ? "#eff6ff" : "#fff" }}>
                <td style={{ ...tdStyle, fontWeight: 900, color: isCurrentTarget ? "#1d4ed8" : "#111827" }}>{row.label}{isCurrentTarget ? " · target" : ""}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{row.trials}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.oddHitCount} / {formatNumber(row.expectedOddHits)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.evenHitCount} / {formatNumber(row.expectedEvenHits)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.oneDigitHitCount} / {formatNumber(row.expectedOneDigitHits)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.twoDigitHitCount} / {formatNumber(row.expectedTwoDigitHits)}</td>
                <td style={tdStyle}><SampleQualityPill quality={row.sampleQuality} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

const AtlasTransitionLedger: React.FC<{ rows: PreviousNeighbourAtlasTransition[] }> = ({ rows }) => (
  <div style={cardStyle}>
    <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 4 }}>Auditable transition ledger</div>
    <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4, marginBottom: 8 }}>
      Newest first. The target cloud is frozen from earlier draws before the recorded target result is scored.
    </div>
    <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 480, border: "1px solid #edf0f5", borderRadius: 8 }}>
      <table style={{ ...miniTableStyle, minWidth: 1120 }}>
        <thead>
          <tr>
            <th style={stickyThStyle}>Transition</th>
            <th style={stickyThStyle}>Stage</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Cloud</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Unique / expected</th>
            <th style={stickyThStyle}>Directional shape</th>
            <th style={stickyThStyle}>Observed hit numbers</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>Odd : even</th>
            <th style={{ ...stickyThStyle, textAlign: "right" }}>1D : 2D</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((row) => (
            <tr key={`${row.previousDateLabel}-${row.currentDate}`}>
              <td style={tdStyle}>
                <div style={{ fontSize: 11, color: "#64748b" }}>{row.previousDateLabel}</div>
                <div style={{ fontWeight: 850 }}>→ {row.currentDate}</div>
              </td>
              <td style={tdStyle}>
                <div style={{ fontWeight: 850 }}>D{row.drawOrdinal}/{row.monthDrawCount}</div>
                <div style={{ marginTop: 3, fontSize: 10, color: row.crossMonth ? "#1d4ed8" : "#64748b" }}>
                  {row.crossMonth ? "Cross-month source" : row.weekdayLabel}
                </div>
              </td>
              <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.targetCount}</td>
              <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 850 }}>
                {row.uniqueHitCount} / {formatNumber(row.expectedUniqueHits)}
              </td>
              <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>
                <div style={{ fontWeight: 850 }}>{row.directionalPattern}</div>
                <div style={{ marginTop: 2, fontSize: 10, color: "#64748b" }}>{row.directionalHitTotal} paths; {row.duplicateHitCount} duplicated hits</div>
              </td>
              <td style={tdStyle}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {row.hitNumbers.length ? row.hitNumbers.map((number) => <NumberChip key={number} value={number} tone="singleton" />) : <span style={{ color: "#64748b" }}>None</span>}
                </div>
              </td>
              <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.oddHitCount} : {row.evenHitCount}</td>
              <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.oneDigitHitCount} : {row.twoDigitHitCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const PlanningCloudCard: React.FC<{
  analysis: PreviousNeighbourCountShapeAtlasAnalysis;
  planningTargetDate?: string;
  planningTargetDrawOrdinal?: number;
  planningTargetMonthExpectedDrawCount?: number;
  userSelectedNumbers?: readonly number[];
  excludedNumbers?: readonly number[];
  onToggleUserSelectedNumber?: (number: number) => void;
}> = ({
  analysis,
  planningTargetDate,
  planningTargetDrawOrdinal,
  planningTargetMonthExpectedDrawCount,
  userSelectedNumbers = [],
  excludedNumbers = [],
  onToggleUserSelectedNumber,
}) => {
  const cloud = analysis.planningCloud;
  const ordinalEvidence = planningTargetDrawOrdinal
    ? analysis.byDrawOrdinal.find((row) => row.drawOrdinal === planningTargetDrawOrdinal)
    : undefined;
  const comparableCloudEvidence = cloud && planningTargetDrawOrdinal
    ? analysis.byDrawOrdinalAndCloudSize.find((row) => (
      row.drawOrdinal === planningTargetDrawOrdinal
      && cloud.targetCount >= row.bandMinimum
      && cloud.targetCount <= row.bandMaximum
    ))
    : undefined;
  const leadingExactCounts = ordinalEvidence
    ? [...ordinalEvidence.countDistribution]
      .filter((row) => row.observed > 0)
      .sort((left, right) => right.observed - left.observed || left.count - right.count)
      .slice(0, 3)
    : [];
  const selected = new Set(userSelectedNumbers);
  const excluded = new Set(excludedNumbers);
  const duplicateTargets = new Set(cloud?.duplicateTargetNumbers ?? []);
  const currentExpectedHits = cloud ? (cloud.targetCount / 45) * analysis.drawSize : 0;

  return (
    <div style={{ ...cardStyle, background: "#f8fafc", display: "grid", gap: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900 }}>Current planning cloud</div>
          <div style={{ marginTop: 3, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
            {planningTargetDate || "Next draw"}{planningTargetDrawOrdinal ? ` · D${planningTargetDrawOrdinal}${planningTargetMonthExpectedDrawCount ? `/${planningTargetMonthExpectedDrawCount}` : ""}` : ""}.
            {cloud ? ` Frozen from ${cloud.sourceDateLabel}.` : " Not enough real history."}
          </div>
        </div>
        <span style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>
          No future result used
        </span>
      </div>
      {cloud ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
            <div><b>{cloud.targetCount} / 45 · {formatPercent(cloud.targetCount / 45, 0)}</b><br /><span style={{ fontSize: 11, color: "#64748b" }}>current field coverage · {cloud.duplicateTargetCount} ambiguous</span></div>
            <div><b>{cloud.oddTargetCount} odd · {cloud.evenTargetCount} even</b><br /><span style={{ fontSize: 11, color: "#64748b" }}>eligible cloud composition</span></div>
            <div><b>{cloud.oneDigitTargetCount} one-digit · {cloud.twoDigitTargetCount} two-digit</b><br /><span style={{ fontSize: 11, color: "#64748b" }}>eligible cloud composition</span></div>
            <div>
              <b>{formatNumber(currentExpectedHits)} / {analysis.drawSize}</b><br />
              <span style={{ fontSize: 11, color: "#64748b" }}>random expectation from this cloud&apos;s size</span>
            </div>
          </div>

          <div style={{ border: "1px solid #dbeafe", background: "#fff", borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#17202a" }}>Immediate next-draw translation</div>
              <div style={{ marginTop: 3, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
                These are the actual history-only eligible numbers created from {cloud.sourceDateLabel}. The draw-stage table estimates a count, not which members will appear.
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {cloud.targetNumbers.map((number) => (
                <NumberChip
                  key={`planning-cloud-${number}`}
                  value={number}
                  tone={duplicateTargets.has(number) ? "duplicate" : "singleton"}
                  selected={selected.has(number)}
                  disabled={excluded.has(number)}
                  onToggle={onToggleUserSelectedNumber}
                />
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
              Blue identifies a single-path target; gold identifies a duplicated / ambiguous target. Clicking is a deliberate User Selected Numbers action only and does not turn Atlas evidence into an automatic generator rule.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 8 }}>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", padding: 9 }}>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 850 }}>Same-stage count guide</div>
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 850, color: "#17202a" }}>
                {ordinalEvidence
                  ? `${formatNumber(ordinalEvidence.averageUniqueHits)} observed vs ${formatNumber(ordinalEvidence.averageExpectedUniqueHits)} expected`
                  : "No same-stage row"}
              </div>
              <div style={{ marginTop: 3, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
                {ordinalEvidence
                  ? `${ordinalEvidence.trials} historical D${ordinalEvidence.drawOrdinal} trials · avg cloud ${formatNumber(ordinalEvidence.averageTargetCount, 1)}/45 (${formatPercent(ordinalEvidence.averageFieldCoverage, 0)}).`
                  : "Planning ordinal unavailable in this source."}
              </div>
              {leadingExactCounts.length ? (
                <div style={{ marginTop: 5, fontSize: 11, color: "#4b5563", lineHeight: 1.4 }}>
                  Most observed exact counts: {leadingExactCounts.map((row) => `${row.count} (${row.observed}/${ordinalEvidence?.trials ?? 0}, ${formatPercent(row.rate, 0)})`).join(" · ")}.
                </div>
              ) : null}
            </div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", padding: 9 }}>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 850 }}>Comparable cloud-size check</div>
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 850, color: "#17202a" }}>
                {comparableCloudEvidence
                  ? `${comparableCloudEvidence.bandLabel} targets · ${comparableCloudEvidence.trials} ${comparableCloudEvidence.trials === 1 ? "trial" : "trials"}`
                  : "No same-stage cloud-size row"}
              </div>
              <div style={{ marginTop: 3, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
                {comparableCloudEvidence
                  ? `${formatNumber(comparableCloudEvidence.averageUniqueHits)} observed vs ${formatNumber(comparableCloudEvidence.averageExpectedUniqueHits)} expected · ${formatNumber(comparableCloudEvidence.lift, 3)}x lift · ${comparableCloudEvidence.sampleQuality.toLowerCase()} sample.`
                  : "No like-sized historical cloud is available for this draw ordinal."}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: "#4b5563", lineHeight: 1.4 }}>
            The eligible list is exhaustive for the selected scope and lookback, but it is intentionally unranked. Cloud coverage and historical count frequencies cannot identify which specific targets will be drawn.
          </div>
        </>
      ) : null}
    </div>
  );
};

const AtlasDirectionalView: React.FC<{
  analysis: PreviousNeighbourCountShapeAtlasAnalysis;
  planningTargetDrawOrdinal?: number;
}> = ({ analysis, planningTargetDrawOrdinal }) => {
  const topPattern = analysis.directionalPatterns[0];
  const cloud = analysis.planningCloud;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div role="note" style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1e3a8a", borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 1.45 }}>
        <b>Unique numbers and directional paths are deliberately separate.</b> A number can be <code>+1</code> from one source and <code>-2</code> from another, so path totals may exceed unique-hit totals without adding another drawn number.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 9 }}>
        <AtlasMetricCard label="Average unique hits" value={formatNumber(analysis.averageUniqueHits)} detail="Deduplicated drawn target numbers per transition." />
        <AtlasMetricCard label="Average directional paths" value={formatNumber(analysis.averageDirectionalHits)} detail="All -2/-1/+1/+2 relationships, including ambiguous paths." />
        <AtlasMetricCard label="Most repeated shape" value={topPattern?.pattern ?? "None"} detail={topPattern ? `${topPattern.observed} transitions · ${formatPercent(topPattern.rate)}` : "No transitions available."} />
      </div>

      {cloud ? (
        <div style={{ ...cardStyle, background: "#f8fafc" }}>
          <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 4 }}>Current pre-draw directional cloud</div>
          <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4, marginBottom: 8 }}>Frozen from {cloud.sourceDateLabel}; target lists may overlap.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
            <TargetList label="-2 targets" numbers={cloud.targetsByOffset["-2"]} />
            <TargetList label="-1 targets" numbers={cloud.targetsByOffset["-1"]} />
            <TargetList label="+1 targets" numbers={cloud.targetsByOffset["+1"]} />
            <TargetList label="+2 targets" numbers={cloud.targetsByOffset["+2"]} />
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 10 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>Most common directional shapes</div>
          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 360 }}>
            <table style={{ ...miniTableStyle, minWidth: 350 }}>
              <thead><tr><th style={stickyThStyle}>-2 / -1 / +1 / +2</th><th style={{ ...stickyThStyle, textAlign: "right" }}>Draws</th><th style={{ ...stickyThStyle, textAlign: "right" }}>Share</th></tr></thead>
              <tbody>
                {analysis.directionalPatterns.slice(0, 24).map((row) => (
                  <tr key={row.pattern}>
                    <td style={{ ...tdStyle, fontWeight: 850, fontVariantNumeric: "tabular-nums" }}>{row.pattern}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{row.observed}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{formatPercent(row.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>Leading shape by monthly draw ordinal</div>
          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 360 }}>
            <table style={{ ...miniTableStyle, minWidth: 470 }}>
              <thead><tr><th style={stickyThStyle}>Stage</th><th style={{ ...stickyThStyle, textAlign: "right" }}>Trials</th><th style={stickyThStyle}>Top shape</th><th style={{ ...stickyThStyle, textAlign: "right" }}>Rows</th><th style={stickyThStyle}>Evidence</th></tr></thead>
              <tbody>
                {analysis.byDrawOrdinal.map((row) => {
                  const isCurrentTarget = row.drawOrdinal === planningTargetDrawOrdinal;
                  return (
                    <tr key={row.drawOrdinal} style={{ background: isCurrentTarget ? "#eff6ff" : "#fff" }}>
                      <td style={{ ...tdStyle, fontWeight: 900, color: isCurrentTarget ? "#1d4ed8" : "#111827" }}>{row.label}{isCurrentTarget ? " · target" : ""}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{row.trials}</td>
                      <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{row.topPattern}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{row.topPatternCount}</td>
                      <td style={tdStyle}><SampleQualityPill quality={row.sampleQuality} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

const NeighbourCountShapeAtlas: React.FC<{
  analysis: PreviousNeighbourCountShapeAtlasAnalysis;
  historySource: PreviousNeighbourAtlasHistorySource;
  onHistorySourceChange: (source: PreviousNeighbourAtlasHistorySource) => void;
  baselineLabel: string;
  wfmqyhDrawCount: number;
  planningTargetDate?: string;
  planningTargetDrawOrdinal?: number;
  planningTargetMonthExpectedDrawCount?: number;
  userSelectedNumbers?: readonly number[];
  excludedNumbers?: readonly number[];
  onToggleUserSelectedNumber?: (number: number) => void;
}> = ({
  analysis,
  historySource,
  onHistorySourceChange,
  baselineLabel,
  wfmqyhDrawCount,
  planningTargetDate,
  planningTargetDrawOrdinal,
  planningTargetMonthExpectedDrawCount,
  userSelectedNumbers,
  excludedNumbers,
  onToggleUserSelectedNumber,
}) => {
  const [view, setView] = useState<NeighbourAtlasView>("count");
  const observedHitTotal = analysis.parity.reduce((total, row) => total + row.observed, 0);
  const odd = analysis.parity.find((row) => row.key === "odd");
  const even = analysis.parity.find((row) => row.key === "even");
  const oneDigit = analysis.digitWidth.find((row) => row.key === "one-digit");
  const twoDigit = analysis.digitWidth.find((row) => row.key === "two-digit");

  return (
    <div style={{ border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", padding: 12, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "#17202a" }}>Neighbour Count & Shape Atlas</div>
            <span style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 999, padding: "2px 7px", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Observe-only</span>
          </div>
          <div style={{ marginTop: 4, maxWidth: 850, color: "#64748b", fontSize: 12, lineHeight: 1.45 }}>
            One anti-lookahead transition ledger feeds every count, directional shape, monthly stage, parity, and digit-width summary.
          </div>
        </div>
        <InfoHelp label="How the Neighbour Count and Shape Atlas stays truthful">
          The eligible ±1/±2 cloud is frozen from earlier draws first. The subsequent real draw is scored second. Unique numbers are counted once, while directional paths remain separate because one number can satisfy several paths. Every composition result is compared with the expected count from that transition&apos;s actual cloud.
        </InfoHelp>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 850, marginBottom: 5 }}>History source</div>
          <div role="group" aria-label="Neighbour atlas history source" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <HigButton size="compact" variant={historySource === "baseline" ? "primary" : "secondary"} aria-pressed={historySource === "baseline"} onClick={() => onHistorySourceChange("baseline")}>All baseline</HigButton>
            <HigButton size="compact" variant={historySource === "wfmqyh" ? "primary" : "secondary"} aria-pressed={historySource === "wfmqyh"} onClick={() => onHistorySourceChange("wfmqyh")}>WFMQYH</HigButton>
          </div>
        </div>
        <div role="tablist" aria-label="Neighbour atlas view" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ATLAS_VIEW_OPTIONS.map((option) => (
            <HigButton
              key={option.value}
              size="compact"
              variant={view === option.value ? "primary" : "quiet"}
              role="tab"
              aria-selected={view === option.value}
              onClick={() => setView(option.value)}
            >
              {option.label}
            </HigButton>
          ))}
        </div>
      </div>

      <div role="note" style={{ border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", padding: "8px 10px", color: "#475569", fontSize: 11, lineHeight: 1.4 }}>
        <b>{historySource === "baseline" ? baselineLabel : `Current WFMQYH (${wfmqyhDrawCount} real draws)`}</b>
        {analysis.excludedTargetMonthLabels.length
          ? ` · Target draws from ${analysis.excludedTargetMonthLabels.join(", ")} are excluded, but their final draw may remain as source context for the following month.`
          : " · No target months are excluded from this selected slice."}
        {` · Scope ${analysis.scope === "mains" ? "mains only" : "mains + supps"}; lookback ${analysis.lookbackDraws}.`}
      </div>

      {analysis.warnings.length ? (
        <div role="status" style={{ border: "1px solid #facc15", background: "#fefce8", color: "#713f12", borderRadius: 8, padding: 10, fontSize: 12 }}>
          {analysis.warnings.join(" ")}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 9 }}>
        <AtlasMetricCard label="Tested transitions" value={analysis.transitionCount} detail={`${analysis.validDraws} valid source rows; ${analysis.excludedTargetDraws} target rows deliberately excluded.`} />
        <AtlasMetricCard label="Unique hits vs expected" value={`${formatNumber(analysis.averageUniqueHits)} / ${formatNumber(analysis.averageExpectedUniqueHits)}`} detail={`Lift ${formatNumber(analysis.lift, 3)}x. Near 1.000 means no overall advantage.`} />
        <AtlasMetricCard label="Observed parity" value={`${formatPercent(odd?.observedShare ?? 0)} / ${formatPercent(even?.observedShare ?? 0)}`} detail={`Odd / even across ${observedHitTotal} unique hits. Raw share is not base-rate adjusted.`} />
        <AtlasMetricCard label="Observed digit width" value={`${formatPercent(oneDigit?.observedShare ?? 0)} / ${formatPercent(twoDigit?.observedShare ?? 0)}`} detail="1 digit / 2 digits. The 9 versus 36 number population imbalance is adjusted in Composition." />
      </div>

      <PlanningCloudCard
        analysis={analysis}
        planningTargetDate={planningTargetDate}
        planningTargetDrawOrdinal={planningTargetDrawOrdinal}
        planningTargetMonthExpectedDrawCount={planningTargetMonthExpectedDrawCount}
        userSelectedNumbers={userSelectedNumbers}
        excludedNumbers={excludedNumbers}
        onToggleUserSelectedNumber={onToggleUserSelectedNumber}
      />

      <div role="tabpanel" hidden={view !== "count"}>
        <div style={{ display: "grid", gap: 10 }}>
          <CountDistributionTable analysis={analysis} />
          <OrdinalCountMatrix rows={analysis.byDrawOrdinal} drawSize={analysis.drawSize} planningTargetDrawOrdinal={planningTargetDrawOrdinal} />
          <CloudSizeControlledTable
            rows={analysis.byDrawOrdinalAndCloudSize}
            planningTargetDrawOrdinal={planningTargetDrawOrdinal}
            currentTargetCount={analysis.planningCloud?.targetCount}
          />
        </div>
      </div>

      <div role="tabpanel" hidden={view !== "direction"}>
        <AtlasDirectionalView analysis={analysis} planningTargetDrawOrdinal={planningTargetDrawOrdinal} />
      </div>

      <div role="tabpanel" hidden={view !== "composition"}>
        <div style={{ display: "grid", gap: 10 }}>
          <div role="note" style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1e3a8a", borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 1.45 }}>
            <b>Read lift, not raw totals.</b> Odd/even has a 23/22 population split; one-digit/two-digit has a much larger 9/36 split. A class can lead the raw count while performing no better than its eligible-cloud expectation.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10 }}>
            <CompositionTable title="Odd vs even unique hits" rows={analysis.parity} populationNote="Observed unique hits compared with the parity composition of every eligible historical target cloud." />
            <CompositionTable title="One-digit vs two-digit unique hits" rows={analysis.digitWidth} populationNote="Observed unique hits compared with each cloud; 1-9 and 10-45 are not equally sized populations." />
          </div>
          <OrdinalCompositionTable rows={analysis.byDrawOrdinal} planningTargetDrawOrdinal={planningTargetDrawOrdinal} />
        </div>
      </div>

      <div role="tabpanel" hidden={view !== "ledger"}>
        <AtlasTransitionLedger rows={analysis.transitions} />
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

const PreviousNeighbourReplay: React.FC<{
  draws: Draw[];
  scope: PreviousNeighbourScope;
  warmupPairs: number;
  candidatePoolSize: number;
  selectedPerDraw: number;
}> = ({ draws, scope, warmupPairs, candidatePoolSize, selectedPerDraw }) => {
  const analysis = useMemo(
    () => analyzePreviousNeighbourBacktest(draws, {
      scope,
      warmupPairs,
      candidatePoolSize,
      selectedPerDraw,
      permutationIterations: 1000,
      seed: 20260613,
    }),
    [candidatePoolSize, draws, scope, selectedPerDraw, warmupPairs],
  );
  const backtest = analysis.candidateBacktest;
  const latest = analysis.latestTransition;

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
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
              <tr><th style={thStyle}>Pair</th><td style={tdStyle}>{latest.previousDate} → {latest.currentDate}</td></tr>
              <tr><th style={thStyle}>Duplicated targets</th><td style={tdStyle}>{formatTargets(latest.duplicateTargets)}</td></tr>
              <tr><th style={thStyle}>Duplicated hits</th><td style={tdStyle}>{formatTargets(latest.duplicateHits)}</td></tr>
              <tr><th style={thStyle}>Singleton hits</th><td style={tdStyle}>{formatTargets(latest.singletonHits)}</td></tr>
              <tr><th style={thStyle}>Direct repeats</th><td style={tdStyle}>{latest.directRepeats.length ? latest.directRepeats.join(", ") : "None"}</td></tr>
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 12, color: "#6b7280" }}>No consecutive transition is available in the active history window.</div>
        )}
      </div>
    </div>
  );
};

export const PreviousNeighbourBacktestPanel: React.FC<PreviousNeighbourBacktestPanelProps> = ({
  draws,
  auditDraws = draws,
  auditHistoryScopeLabel = "Current history slice",
  atlasAnalysis,
  scope,
  onScopeChange,
  directionalLookback,
  onDirectionalLookbackChange,
  atlasHistorySource,
  onAtlasHistorySourceChange,
  planningTargetDate,
  planningTargetDrawOrdinal,
  planningTargetMonthExpectedDrawCount,
  liveNeighbourMode = "pm1",
  liveNeighbourEnabled = false,
  userSelectedNumbers = [],
  excludedNumbers = [],
  onToggleUserSelectedNumber,
}) => {
  const [warmupPairs, setWarmupPairs] = useState(50);
  const [candidatePoolSize, setCandidatePoolSize] = useState(200);
  const [selectedPerDraw, setSelectedPerDraw] = useState(20);
  const [advancedReplayOpen, setAdvancedReplayOpen] = useState(false);

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
            onChange={(event) => onScopeChange(event.target.value as PreviousNeighbourScope)}
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
            onChange={(event) => onDirectionalLookbackChange(Number(event.target.value) as 1 | 2)}
            style={selectStyle}
          >
            {DIRECTIONAL_LOOKBACK_OPTIONS.map((value) => (
              <option key={value} value={value}>Previous {value} draw{value === 1 ? "" : "s"}</option>
            ))}
          </select>
        </HigField>
      </div>

      <LatestNeighbourLearningAuditCard
        history={auditDraws}
        historyScopeLabel={auditHistoryScopeLabel}
        liveMode={liveNeighbourMode}
        liveEnabled={liveNeighbourEnabled}
      />

      <LiveHandoffPlanningCard
        handoff={handoffAnalysis}
        helper={directionalAnalysis.selectionHelper}
        userSelectedNumbers={userSelectedNumbers}
        excludedNumbers={excludedNumbers}
        onToggleUserSelectedNumber={onToggleUserSelectedNumber}
      />

      <details
        style={advancedDetailsStyle}
        open={advancedReplayOpen}
        onToggle={(event) => setAdvancedReplayOpen(event.currentTarget.open)}
      >
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
        {advancedReplayOpen ? (
          <PreviousNeighbourReplay
            draws={draws}
            scope={scope}
            warmupPairs={warmupPairs}
            candidatePoolSize={candidatePoolSize}
            selectedPerDraw={selectedPerDraw}
          />
        ) : null}
      </details>

      <NeighbourCountShapeAtlas
        analysis={atlasAnalysis}
        historySource={atlasHistorySource}
        onHistorySourceChange={onAtlasHistorySourceChange}
        baselineLabel={auditHistoryScopeLabel}
        wfmqyhDrawCount={draws.length}
        planningTargetDate={planningTargetDate}
        planningTargetDrawOrdinal={planningTargetDrawOrdinal}
        planningTargetMonthExpectedDrawCount={planningTargetMonthExpectedDrawCount}
        userSelectedNumbers={userSelectedNumbers}
        excludedNumbers={excludedNumbers}
        onToggleUserSelectedNumber={onToggleUserSelectedNumber}
      />

      <HandoffDiagnostic analysis={handoffAnalysis} />
    </section>
  );
};

export default PreviousNeighbourBacktestPanel;

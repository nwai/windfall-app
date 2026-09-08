import React, { useMemo, useState } from "react";
import type { Draw } from "../types";
import type { LatestNeighbourSupportMode } from "../lib/latestNeighbourSupport";
import type { PreviousNeighbourConstraintRow } from "../lib/previousNeighbourTargets";
import { analyzePreviousNeighbourDirectionalPatterns } from "../lib/previousNeighbourDirectionalPatterns";
import type { DrawBucketPatternGenerationInfluenceRow } from "../lib/drawBucketPatternInfluence";
import type { NumberDiagnosticRow } from "../lib/scoringSystemDiagnostics";
import type { SelectionInsightPredictedCompanionRow } from "../lib/selectionInsights";
import type { NextDrawEvidenceResult } from "../lib/nextDrawEvidenceEnsemble";
import {
  monthlyBucketDisplayForNumber,
  type MonthlyBucketNumberDisplay,
  type MonthlyBucketSets,
} from "../lib/monthlyDrawSummary";
import { parseDrawDateParts } from "../lib/planningDrawContext";
import type { PortfolioHotColdEvidenceRow } from "./candidates/PortfolioCompressionPanel";
import {
  buildSignalConfluenceRows,
  normalizeSignalConfluenceNumbers,
  rankedStrength,
  sortSignalConfluenceRows,
  type SignalConfluenceMention,
  type SignalConfluenceRow,
  type SignalConfluenceSortDirection,
  type SignalConfluenceSortKey,
} from "../lib/signalConfluence";
import { HigButton } from "./shared/HigControls";
import "./SignalConfluencePanel.css";

interface SignalConfluencePanelProps {
  activeHistory: Draw[];
  allHistoryDrawCount: number;
  latestDrawDate?: string;
  targetDrawDate?: string;
  latestNeighbourMode: LatestNeighbourSupportMode;
  latestNeighbourRows: PreviousNeighbourConstraintRow[];
  strictDroughtNumbers: readonly number[];
  empiricalDroughtNumbers: readonly number[];
  sharedAnalysisSelectionNumbers: readonly number[];
  hotColdRows: readonly PortfolioHotColdEvidenceRow[];
  drawBucketPatternRows: readonly DrawBucketPatternGenerationInfluenceRow[];
  scoringNumberRows: readonly NumberDiagnosticRow[];
  selectionInsightRows: readonly SelectionInsightPredictedCompanionRow[];
  nextDrawEvidenceResult: NextDrawEvidenceResult | null;
  monthlyBuckets?: MonthlyBucketSets | null;
  userSelectedNumbers: readonly number[];
  forcedNumbers: readonly number[];
  excludedNumbers: readonly number[];
  signalConfluenceForcedNumbers?: readonly number[];
  onToggleForcedNumber?: (number: number) => void;
  maxForcedNumbers?: number;
}

const formatScore = (value: number): string => value.toFixed(2);

const allNumbers = (): number[] => Array.from({ length: 45 }, (_, index) => index + 1);

const drawNumbers = (draw: Draw): number[] => (
  [...(Array.isArray(draw.main) ? draw.main : []), ...(Array.isArray(draw.supp) ? draw.supp : [])]
    .filter((value): value is number => Number.isInteger(value) && value >= 1 && value <= 45)
);

const formatLatestNeighbourMode = (mode: LatestNeighbourSupportMode): string => (
  mode === "pm1pm2" ? "+/-1 and +/-2" : "+/-1"
);

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const REGULAR_DRAW_WEEKDAYS = new Set<string>(["Mon", "Wed", "Fri"]);
const MIN_WEEKDAY_NEIGHBOUR_TRANSITIONS = 3;

const weekdayLabelFromDate = (value: string | undefined): string | null => {
  const parts = parseDrawDateParts(value);
  if (!parts) return null;
  return WEEKDAY_LABELS[new Date(parts.year, parts.month - 1, parts.day).getDay()] ?? null;
};

const strengthFromValue = (value: number, maxValue: number, floor = 0.35): number => {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(maxValue) || maxValue <= 0) return 0;
  return Math.max(floor, Math.min(1, value / maxValue));
};

const buildActiveFrequencyMentions = (activeHistory: Draw[]): SignalConfluenceMention[] => {
  const counts = new Map<number, number>();
  for (const draw of activeHistory) {
    for (const number of drawNumbers(draw)) {
      counts.set(number, (counts.get(number) ?? 0) + 1);
    }
  }
  const ranked = allNumbers()
    .map((number) => ({ number, count: counts.get(number) ?? 0 }))
    .filter((row) => row.count > 0)
    .sort((left, right) => right.count - left.count || left.number - right.number)
    .slice(0, 8);

  return ranked.map((row, index) => ({
    number: row.number,
    family: "active-frequency",
    source: "WFMQYH frequency",
    label: `Freq #${index + 1}`,
    detail: `${row.count} hits in active WFMQYH`,
    strength: rankedStrength(index, ranked.length),
  }));
};

const buildLatestNeighbourMentions = (
  rows: readonly PreviousNeighbourConstraintRow[],
  mode: LatestNeighbourSupportMode,
): SignalConfluenceMention[] => {
  const allowedLabels = new Set(mode === "pm1pm2" ? ["-2", "-1", "+1", "+2"] : ["-1", "+1"]);
  const byTarget = new Map<number, { labels: Set<string>; sources: Set<number>; duplicated: boolean }>();

  for (const row of rows) {
    for (const option of row.targetOptions) {
      if (!allowedLabels.has(option.label) || option.value == null) continue;
      const current = byTarget.get(option.value) ?? { labels: new Set<string>(), sources: new Set<number>(), duplicated: false };
      current.labels.add(option.label);
      current.sources.add(row.source);
      current.duplicated = current.duplicated || row.duplicateTargets.includes(option.value);
      byTarget.set(option.value, current);
    }
  }

  return Array.from(byTarget.entries())
    .sort(([leftNumber], [rightNumber]) => leftNumber - rightNumber)
    .map(([number, meta]) => ({
      number,
      family: "latest-neighbour",
      source: `Latest draw ${formatLatestNeighbourMode(mode)}`,
      label: Array.from(meta.labels).sort().join("/"),
      detail: `from ${Array.from(meta.sources).sort((left, right) => left - right).join(", ")}${meta.duplicated ? "; duplicated target" : ""}`,
      strength: meta.duplicated ? 1 : 0.82,
    }));
};

const buildWeekdayNeighbourMentions = (
  activeHistory: Draw[],
  rows: readonly PreviousNeighbourConstraintRow[],
  mode: LatestNeighbourSupportMode,
  targetDrawDate: string | undefined,
): SignalConfluenceMention[] => {
  const targetWeekday = weekdayLabelFromDate(targetDrawDate);
  if (!targetWeekday || !REGULAR_DRAW_WEEKDAYS.has(targetWeekday)) return [];

  const analysis = analyzePreviousNeighbourDirectionalPatterns(activeHistory, {
    scope: "mains-plus-supps",
    lookbackDraws: 1,
  });
  const weekdayRows = analysis.byWeekday
    .filter((row) => REGULAR_DRAW_WEEKDAYS.has(row.label))
    .filter((row) => row.transitions >= MIN_WEEKDAY_NEIGHBOUR_TRANSITIONS && row.lift != null);
  const targetRow = weekdayRows.find((row) => row.label === targetWeekday);
  if (!targetRow || targetRow.lift == null || targetRow.lift <= 1) return [];

  const topAverage = Math.max(...weekdayRows.map((row) => row.averageUniqueHits));
  if (targetRow.averageUniqueHits < topAverage - 1e-9) return [];

  const allowedLabels = new Set(mode === "pm1pm2" ? ["-2", "-1", "+1", "+2"] : ["-1", "+1"]);
  const strength = Math.max(0.35, Math.min(0.72, 0.35 + ((targetRow.lift - 1) * 2)));
  const label = `${targetWeekday} ${mode === "pm1pm2" ? "±1/±2" : "±1"} lift`;
  const detail = [
    `${targetRow.transitions} active WFMQYH transitions`,
    `avg unique ${targetRow.averageUniqueHits.toFixed(2)} vs expected ${targetRow.averageExpectedUniqueHits.toFixed(2)}`,
    `lift ${targetRow.lift.toFixed(3)}x`,
  ].join("; ");
  const targets = new Map<number, Set<string>>();

  for (const row of rows) {
    for (const option of row.targetOptions) {
      if (!allowedLabels.has(option.label) || option.value == null) continue;
      const labels = targets.get(option.value) ?? new Set<string>();
      labels.add(option.label);
      targets.set(option.value, labels);
    }
  }

  return Array.from(targets.entries())
    .sort(([leftNumber], [rightNumber]) => leftNumber - rightNumber)
    .map(([number, labels]) => ({
      number,
      family: "weekday-neighbour",
      source: "Previous-neighbour weekday diagnostic",
      label,
      detail: `${detail}; target offsets ${Array.from(labels).sort().join("/")}`,
      strength,
    }));
};

const buildRankedMentions = (
  numbers: readonly number[],
  family: SignalConfluenceMention["family"],
  source: string,
  labelPrefix: string,
  limit = 8,
): SignalConfluenceMention[] => {
  const normalized = normalizeSignalConfluenceNumbers(numbers).slice(0, limit);
  return normalized.map((number, index) => ({
    number,
    family,
    source,
    label: `${labelPrefix} #${index + 1}`,
    strength: rankedStrength(index, normalized.length),
  }));
};

const buildHotColdMentions = (rows: readonly PortfolioHotColdEvidenceRow[]): SignalConfluenceMention[] => {
  const mentions: SignalConfluenceMention[] = [];
  rows.forEach((row) => {
    if (row.hotRank > 0 && row.hotRank <= 8) {
      mentions.push({
        number: row.number,
        family: "temperature",
        source: "Hot/cold ranking",
        label: `Hot #${row.hotRank}`,
        detail: `hot score ${row.hotScore.toFixed(2)}`,
        strength: rankedStrength(row.hotRank - 1, 8),
      });
    }
    if (row.recentRank > 0 && row.recentRank <= 8) {
      mentions.push({
        number: row.number,
        family: "temperature",
        source: "Recent leaders",
        label: `Recent #${row.recentRank}`,
        detail: `${row.recentCount} recent hits`,
        strength: rankedStrength(row.recentRank - 1, 8),
      });
    }
    if (row.weightedRank > 0 && row.weightedRank <= 8) {
      mentions.push({
        number: row.number,
        family: "temperature",
        source: "Weighted leaders",
        label: `Weighted #${row.weightedRank}`,
        strength: rankedStrength(row.weightedRank - 1, 8),
      });
    }
  });
  return mentions;
};

const buildDrawBucketPatternMentions = (rows: readonly DrawBucketPatternGenerationInfluenceRow[]): SignalConfluenceMention[] => {
  const ranked = rows
    .filter((row) => row.recentAverageHits > 0 && row.numbers.length > 0)
    .slice()
    .sort((left, right) => right.recentAverageHits - left.recentAverageHits || left.label.localeCompare(right.label))
    .slice(0, 4);
  const maxRecentAverage = Math.max(0, ...ranked.map((row) => row.recentAverageHits));
  const mentions: SignalConfluenceMention[] = [];
  ranked.forEach((row, index) => {
    row.numbers.forEach((number) => {
      mentions.push({
        number,
        family: "terminal-bucket",
        source: "Draw Bucket Patterns",
        label: `${row.label} #${index + 1}`,
        detail: `Recent avg ${row.recentAverageHits.toFixed(2)}`,
        strength: strengthFromValue(row.recentAverageHits, maxRecentAverage, 0.45),
      });
    });
  });
  return mentions;
};

const buildScoringMentions = (rows: readonly NumberDiagnosticRow[]): SignalConfluenceMention[] => (
  rows
    .slice()
    .sort((left, right) => left.rank - right.rank || left.number - right.number)
    .slice(0, 12)
    .map((row, index) => ({
      number: row.number,
      family: "scoring-numbers",
      source: "Scoring System numbers",
      label: `Score #${row.rank}`,
      detail: `combined ${row.combinedDiagnosticScore.toFixed(0)}; WFMQYH hits ${row.wfmqyhCount}`,
      strength: rankedStrength(index, 12, 0.28),
    }))
);

const buildSelectionInsightMentions = (rows: readonly SelectionInsightPredictedCompanionRow[]): SignalConfluenceMention[] => {
  const ranked = rows
    .filter((row) => row.supportScore > 0)
    .slice(0, 12);
  const maxSupport = Math.max(0, ...ranked.map((row) => row.supportScore));

  return ranked.map((row) => ({
    number: row.n,
    family: "selection-insights",
    source: "Selection Insights predicted",
    label: `Comp ${row.supportScore.toFixed(1)}`,
    detail: `WFMQYH ${row.windowCount}; all ${row.allCount}`,
    strength: strengthFromValue(row.supportScore, maxSupport, 0.3),
  }));
};

const buildNextDrawEvidenceMentions = (result: NextDrawEvidenceResult | null): SignalConfluenceMention[] => {
  if (!result) return [];
  return result.topEight.map((number, index) => {
    const row = result.numberRows.find((candidate) => candidate.number === number);
    return {
      number,
      family: "next-draw-evidence",
      source: "NDEE fixed replay",
      label: `NDEE #${index + 1}`,
      detail: row ? `estimate ${(row.inclusionEstimate * 100).toFixed(1)}%; ${row.selectedRole}` : undefined,
      strength: rankedStrength(index, result.topEight.length, 0.35),
    };
  });
};

const buildStateMentions = (
  userSelectedNumbers: readonly number[],
  forcedNumbers: readonly number[],
  excludedNumbers: readonly number[],
): SignalConfluenceMention[] => [
  ...normalizeSignalConfluenceNumbers(userSelectedNumbers).map((number) => ({
    number,
    family: "user-state" as const,
    source: "User selected",
    label: "Selected",
    tone: "state" as const,
    strength: 0,
  })),
  ...normalizeSignalConfluenceNumbers(forcedNumbers).map((number) => ({
    number,
    family: "user-state" as const,
    source: "Forced inclusion",
    label: "Forced",
    tone: "state" as const,
    strength: 0,
  })),
  ...normalizeSignalConfluenceNumbers(excludedNumbers).map((number) => ({
    number,
    family: "user-state" as const,
    source: "Active exclusion",
    label: "Excluded",
    tone: "caution" as const,
    detail: "Excluded numbers are listed but moved below available numbers.",
    strength: 0,
  })),
];

const Chip: React.FC<{ mention: SignalConfluenceMention }> = ({ mention }) => (
  <span
    className={`signal-confluence-panel__chip signal-confluence-panel__chip--${mention.tone === "caution" ? "caution" : mention.family}`}
    title={`${mention.source}: ${mention.label}${mention.detail ? ` - ${mention.detail}` : ""}`}
  >
    {mention.label}
  </span>
);

const StateStack: React.FC<{
  row: SignalConfluenceRow;
  isSignalConfluenceForced?: boolean;
  monthlyBucketDisplay?: MonthlyBucketNumberDisplay | null;
}> = ({ row, isSignalConfluenceForced = false, monthlyBucketDisplay = null }) => (
  <div className="signal-confluence-panel__state-stack">
    {row.isForced ? <span className="signal-confluence-panel__state signal-confluence-panel__state--forced">Forced</span> : null}
    {isSignalConfluenceForced ? <span className="signal-confluence-panel__state signal-confluence-panel__state--confluence">Confluence</span> : null}
    {row.isUserSelected ? <span className="signal-confluence-panel__state signal-confluence-panel__state--selected">Selected</span> : null}
    {row.isExcluded ? <span className="signal-confluence-panel__state signal-confluence-panel__state--excluded">Excluded</span> : null}
    {monthlyBucketDisplay ? (
      <span
        className="signal-confluence-panel__state signal-confluence-panel__state--bucket"
        style={{
          borderColor: monthlyBucketDisplay.color,
          background: monthlyBucketDisplay.softColor,
          color: monthlyBucketDisplay.color,
        }}
        title={`Current Monthly Draws Summary bucket: ${monthlyBucketDisplay.label}. Context only; it does not add Signal Confluence support.`}
      >
        Bucket {monthlyBucketDisplay.label}
      </span>
    ) : null}
    {!row.isForced && !row.isUserSelected && !row.isExcluded && !isSignalConfluenceForced ? <span className="signal-confluence-panel__state">Open</span> : null}
  </div>
);

const NumberAction: React.FC<{
  row: SignalConfluenceRow;
  isSignalConfluenceForced: boolean;
  forcedCount: number;
  maxForcedNumbers: number;
  onToggleForcedNumber?: (number: number) => void;
}> = ({
  row,
  isSignalConfluenceForced,
  forcedCount,
  maxForcedNumbers,
  onToggleForcedNumber,
}) => {
  const hasSupport = row.rawMentionCount > 0;
  const forcedLimitReached = !row.isForced && !isSignalConfluenceForced && forcedCount >= maxForcedNumbers;
  const disabled = !onToggleForcedNumber || row.isExcluded || (!hasSupport && !isSignalConfluenceForced) || forcedLimitReached;
  const title = row.isExcluded
    ? `Active exclusion prevents forcing ${row.number}.`
    : forcedLimitReached
      ? `Eight forced numbers are already active. Release another forced number before adding ${row.number}.`
      : !hasSupport && !isSignalConfluenceForced
        ? `Number ${row.number} has no Signal Confluence support to force from this panel.`
        : isSignalConfluenceForced
          ? `Remove ${row.number} as a Signal Confluence forced inclusion.`
          : `Force ${row.number} from Signal Confluence. This is user-controlled and will affect generation.`;

  if (!onToggleForcedNumber) {
    return <span className="signal-confluence-panel__number">{row.number}</span>;
  }

  return (
    <button
      type="button"
      className={[
        "signal-confluence-panel__number",
        "signal-confluence-panel__number-button",
        isSignalConfluenceForced ? "signal-confluence-panel__number-button--active" : "",
      ].filter(Boolean).join(" ")}
      aria-pressed={isSignalConfluenceForced}
      aria-label={`${isSignalConfluenceForced ? "Release" : "Force"} number ${row.number} from Signal Confluence`}
      disabled={disabled}
      title={title}
      onClick={() => onToggleForcedNumber(row.number)}
    >
      {row.number}
    </button>
  );
};

export const SignalConfluencePanel: React.FC<SignalConfluencePanelProps> = ({
  activeHistory,
  allHistoryDrawCount,
  latestDrawDate,
  targetDrawDate,
  latestNeighbourMode,
  latestNeighbourRows,
  strictDroughtNumbers,
  empiricalDroughtNumbers,
  sharedAnalysisSelectionNumbers,
  hotColdRows,
  drawBucketPatternRows,
  scoringNumberRows,
  selectionInsightRows,
  nextDrawEvidenceResult,
  monthlyBuckets = null,
  userSelectedNumbers,
  forcedNumbers,
  excludedNumbers,
  signalConfluenceForcedNumbers = [],
  onToggleForcedNumber,
  maxForcedNumbers = 8,
}) => {
  const [showTop, setShowTop] = useState(20);
  const [hideZeroSupport, setHideZeroSupport] = useState(true);
  const [sortKey, setSortKey] = useState<SignalConfluenceSortKey>("rank");
  const [supportSortDirection, setSupportSortDirection] = useState<SignalConfluenceSortDirection>("descending");

  const rows = useMemo(() => {
    const mentions: SignalConfluenceMention[] = [
      ...buildLatestNeighbourMentions(latestNeighbourRows, latestNeighbourMode),
      ...buildWeekdayNeighbourMentions(activeHistory, latestNeighbourRows, latestNeighbourMode, targetDrawDate),
      ...buildRankedMentions(strictDroughtNumbers, "drought", "Strict drought shortlist", "Strict", 8),
      ...buildRankedMentions(empiricalDroughtNumbers, "drought", "Empirical drought shortlist", "Emp", 8),
      ...buildRankedMentions(sharedAnalysisSelectionNumbers, "shared-selection", "Shared analysis selection", "Shared", 8),
      ...buildActiveFrequencyMentions(activeHistory),
      ...buildHotColdMentions(hotColdRows),
      ...buildDrawBucketPatternMentions(drawBucketPatternRows),
      ...buildScoringMentions(scoringNumberRows),
      ...buildSelectionInsightMentions(selectionInsightRows),
      ...buildNextDrawEvidenceMentions(nextDrawEvidenceResult),
      ...buildStateMentions(userSelectedNumbers, forcedNumbers, excludedNumbers),
    ];
    return buildSignalConfluenceRows(mentions, {
      excludedNumbers,
      forcedNumbers,
      userSelectedNumbers,
    });
  }, [
    activeHistory,
    drawBucketPatternRows,
    empiricalDroughtNumbers,
    excludedNumbers,
    forcedNumbers,
    hotColdRows,
    latestNeighbourMode,
    latestNeighbourRows,
    nextDrawEvidenceResult,
    scoringNumberRows,
    selectionInsightRows,
    sharedAnalysisSelectionNumbers,
    strictDroughtNumbers,
    targetDrawDate,
    userSelectedNumbers,
  ]);

  const displayRows = useMemo(() => {
    const filtered = hideZeroSupport ? rows.filter((row) => row.rawMentionCount > 0 || row.isForced || row.isUserSelected || row.isExcluded) : rows;
    return sortSignalConfluenceRows(
      filtered,
      sortKey,
      sortKey === "support" ? supportSortDirection : "ascending",
    ).slice(0, showTop);
  }, [hideZeroSupport, rows, showTop, sortKey, supportSortDirection]);

  const supportFamilyCount = useMemo(() => (
    new Set(rows.flatMap((row) => row.supportMentions.map((mention) => mention.family))).size
  ), [rows]);

  const supportedRows = rows.filter((row) => row.rawMentionCount > 0 && !row.isExcluded);
  const signalConfluenceForcedSet = useMemo(
    () => new Set(normalizeSignalConfluenceNumbers(signalConfluenceForcedNumbers)),
    [signalConfluenceForcedNumbers],
  );
  const forcedCount = useMemo(
    () => normalizeSignalConfluenceNumbers(forcedNumbers).length,
    [forcedNumbers],
  );
  const topRow = supportedRows[0] ?? null;
  const ndeeStatus = nextDrawEvidenceResult ? "included" : "not run";
  const supportSortLabel = sortKey === "support"
    ? `Support ${supportSortDirection === "descending" ? "desc" : "asc"}`
    : "Support sort";

  const handleRankSort = () => {
    setSortKey("rank");
  };

  const handleSupportSort = () => {
    if (sortKey !== "support") {
      setSortKey("support");
      setSupportSortDirection("descending");
      return;
    }
    setSupportSortDirection((current) => current === "descending" ? "ascending" : "descending");
  };

  return (
    <section className="signal-confluence-panel" aria-label="Signal Confluence Number Consensus Ledger">
      <div className="signal-confluence-panel__intro">
        <div>
          <span className="signal-confluence-panel__kicker">Observe-only ledger</span>
          <p>
            This panel counts where independent-looking app signals mention the same numbers. Related signals are capped by family, so a cluster of similar evidence cannot pretend to be many separate proofs. It changes candidate generation only when you deliberately force a supported number from this table.
          </p>
        </div>
        <HigButton variant="secondary" size="compact" onClick={() => setHideZeroSupport((current) => !current)}>
          {hideZeroSupport ? "Show All 45" : "Hide Zero Support"}
        </HigButton>
      </div>

      <div className="signal-confluence-panel__summary">
        <div className="signal-confluence-panel__metric">
          <div className="signal-confluence-panel__metric-label">Top available</div>
          <div className="signal-confluence-panel__metric-value">{topRow ? topRow.number : "-"}</div>
          <div className="signal-confluence-panel__metric-detail">{topRow ? `${topRow.familyCount} families; ${topRow.rawMentionCount} mentions` : "No support mentions yet"}</div>
        </div>
        <div className="signal-confluence-panel__metric">
          <div className="signal-confluence-panel__metric-label">Support families</div>
          <div className="signal-confluence-panel__metric-value">{supportFamilyCount}</div>
          <div className="signal-confluence-panel__metric-detail">capped before scoring</div>
        </div>
        <div className="signal-confluence-panel__metric">
          <div className="signal-confluence-panel__metric-label">Active WFMQYH</div>
          <div className="signal-confluence-panel__metric-value">{activeHistory.length}</div>
          <div className="signal-confluence-panel__metric-detail">all real {allHistoryDrawCount}; latest {latestDrawDate ?? "unknown"}</div>
        </div>
        <div className="signal-confluence-panel__metric">
          <div className="signal-confluence-panel__metric-label">NDEE source</div>
          <div className="signal-confluence-panel__metric-value">{ndeeStatus}</div>
          <div className="signal-confluence-panel__metric-detail">only after fixed replay runs</div>
        </div>
      </div>

      <div className="signal-confluence-panel__controls">
        <div className="signal-confluence-panel__action-note">
          Click a supported number pill to add or release a Signal Confluence forced inclusion. Excluded numbers and zero-support rows cannot be forced here.
        </div>
        <label className="signal-confluence-panel__control">
          Show rows
          <select
            className="signal-confluence-panel__select"
            value={showTop}
            onChange={(event) => setShowTop(Number(event.target.value))}
          >
            <option value={12}>Top 12</option>
            <option value={20}>Top 20</option>
            <option value={45}>All 45</option>
          </select>
        </label>
        <label className="signal-confluence-panel__control">
          <input
            type="checkbox"
            checked={hideZeroSupport}
            onChange={(event) => setHideZeroSupport(event.target.checked)}
          />
          Hide zero-support numbers
        </label>
      </div>

      <div className="signal-confluence-panel__table-scroll">
        <table className="signal-confluence-panel__table">
          <thead>
            <tr>
              <th aria-sort={sortKey === "rank" ? "ascending" : "none"}>
                <button
                  type="button"
                  className="signal-confluence-panel__sort-button"
                  onClick={handleRankSort}
                  title="Restore default consensus-rank order"
                >
                  Rank {sortKey === "rank" ? "asc" : ""}
                </button>
              </th>
              <th>Number</th>
              <th>Family score</th>
              <th>Families</th>
              <th>Raw</th>
              <th>State</th>
              <th aria-sort={sortKey === "support" ? supportSortDirection : "none"}>
                <button
                  type="button"
                  className="signal-confluence-panel__sort-button"
                  onClick={handleSupportSort}
                  title="Sort by support-chip count; ties use family count, family score, then consensus rank"
                >
                  {supportSortLabel}
                </button>
              </th>
              <th>Caution</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length ? (
              displayRows.map((row) => {
                const monthlyBucketDisplay = monthlyBucketDisplayForNumber(monthlyBuckets, row.number);
                return (
                  <tr key={row.number} className={row.isExcluded ? "signal-confluence-panel__row--excluded" : undefined}>
                    <td>{row.rank}</td>
                    <td>
                      <NumberAction
                        row={row}
                        isSignalConfluenceForced={signalConfluenceForcedSet.has(row.number)}
                        forcedCount={forcedCount}
                        maxForcedNumbers={maxForcedNumbers}
                        onToggleForcedNumber={onToggleForcedNumber}
                      />
                    </td>
                    <td>{formatScore(row.familyScore)}</td>
                    <td>{row.familyCount}</td>
                    <td>{row.rawMentionCount}</td>
                    <td>
                      <StateStack
                        row={row}
                        isSignalConfluenceForced={signalConfluenceForcedSet.has(row.number)}
                        monthlyBucketDisplay={monthlyBucketDisplay}
                      />
                    </td>
                    <td>
                      <div className="signal-confluence-panel__chip-row">
                        {row.supportMentions.length ? row.supportMentions.map((mention, index) => (
                          <Chip key={`${mention.family}-${mention.source}-${mention.label}-${index}`} mention={mention} />
                        )) : "-"}
                      </div>
                    </td>
                    <td>
                      <div className="signal-confluence-panel__chip-row">
                        {row.cautionMentions.length ? row.cautionMentions.map((mention, index) => (
                          <Chip key={`${mention.family}-${mention.source}-${mention.label}-${index}`} mention={mention} />
                        )) : "-"}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="signal-confluence-panel__empty">No signal support rows to show yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="signal-confluence-panel__footnote">
        Family score is capped support by source family. Raw is the uncapped support mention count. Signal Confluence forcing is a user action, not an automatic prediction. Excluded numbers remain visible for conflict awareness, but rank below available numbers.
      </div>
    </section>
  );
};

export default SignalConfluencePanel;

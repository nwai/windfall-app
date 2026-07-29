import React, { useEffect, useMemo, useState } from "react";

import type { Draw } from "../types";
import {
  analyzeMonthlyDrawSummary,
  analyzeStageIdealDrawModel,
  bucketLabelForTimes,
  MONTHLY_BUCKET_KEYS,
  monthlyFrequencyConstraintsFromSelections,
  numbersFromMonthlySelections,
  projectMonthlyBucketCounts,
  pruneMonthlySelections,
  sampleMonthlyNumbers,
  type AvgBucketEntry,
  type MonthlyBucketKey,
  type MonthlyBucketSelections,
  type MonthlyBucketSets,
  type MonthlyConstraintPayload,
  type MonthlyDrawMonthRow,
  type MonthlyDrawSummary,
  type MonthlyFrequencyCount,
  type MonthlyIdealDrawState,
  type StageIdealDrawState,
} from "../lib/monthlyDrawSummary";
import {
  formatUserExclusionReminder,
  normalizeUserExclusionLocks,
} from "../lib/userExclusionLocks";

export type {
  AvgBucketEntry,
  MonthlyBucketSelections,
  MonthlyBucketSets,
  MonthlyConstraintPayload,
  MonthlyFrequencyConstraints,
  MonthlyIdealDrawState,
  StageIdealDrawState,
} from "../lib/monthlyDrawSummary";

interface MonthlyDrawsSummaryPanelProps {
  history: Draw[];
  onConstraintsChange?: (payload: MonthlyConstraintPayload | null) => void;
  onUseSelectedNumbers?: (numbers: number[]) => void;
  constructiveFillEnabled?: boolean;
  onConstructiveFillChange?: (enabled: boolean) => void;
  onBucketInfoChange?: (info: { labels: Record<number, string> }) => void;
  onBucketSetsChange?: (buckets: MonthlyBucketSets) => void;
  onAvgBucketsChange?: (avgBuckets: AvgBucketEntry[]) => void;
  onIdealDrawStateChange?: (state: MonthlyIdealDrawState | null) => void;
  onStageIdealDrawStateChange?: (state: StageIdealDrawState | null) => void;
  onSimulateNumbers?: (numbers: number[]) => void;
  excludedNumbers?: number[];
}

type DrawLimit = number | "all";
type SelectedByBucket = MonthlyBucketSelections;

const emptySelections = (): SelectedByBucket => ({
  undrawn: [],
  times1: [],
  times2: [],
  times3: [],
  times4: [],
  times5: [],
  times6: [],
  times7: [],
  times8: [],
});

const bucketMeta: { key: MonthlyBucketKey; times: number; label: string }[] = MONTHLY_BUCKET_KEYS.map((key, index) => ({
  key,
  times: index,
  label: bucketLabelForTimes(index),
}));

const colorForTimes = (times: number): string => {
  const palette: Record<number, string> = {
    0: "#64748b",
    1: "#2563eb",
    2: "#16a34a",
    3: "#0891b2",
    4: "#ca8a04",
    5: "#ea580c",
    6: "#dc2626",
    7: "#be123c",
    8: "#7c3aed",
  };
  return palette[Math.min(Math.max(0, times), 8)] ?? "#334155";
};

const softColorForTimes = (times: number): string => {
  const palette: Record<number, string> = {
    0: "#f1f5f9",
    1: "#eff6ff",
    2: "#f0fdf4",
    3: "#ecfeff",
    4: "#fefce8",
    5: "#fff7ed",
    6: "#fef2f2",
    7: "#fff1f2",
    8: "#f5f3ff",
  };
  return palette[Math.min(Math.max(0, times), 8)] ?? "#f8fafc";
};

const textOnColorForTimes = (times: number): string => (
  times >= 2 && times <= 5 ? "#0f172a" : "#fff"
);

const panelStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const toolbarStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 8,
  alignItems: "end",
};

const sectionStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#fff",
  padding: 10,
};

const statGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 8,
};

const controlLabelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  color: "#475569",
  fontWeight: 700,
};

const selectStyle: React.CSSProperties = {
  minHeight: 34,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  background: "#fff",
  color: "#0f172a",
  padding: "5px 8px",
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "7px 8px",
  borderBottom: "1px solid #dbe3ef",
  color: "#334155",
  fontSize: 12,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "7px 8px",
  borderBottom: "1px solid #edf2f7",
  verticalAlign: "top",
  fontSize: 12,
  color: "#1e293b",
};

const undrawnInMonthCellStyle: React.CSSProperties = {
  ...tdStyle,
  textAlign: "center",
  verticalAlign: "middle",
};

const undrawnInMonthBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 34,
  height: 34,
  padding: "0 8px",
  borderRadius: 999,
  border: "2px solid #0f172a",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 900,
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
  boxSizing: "border-box",
};

const sameSelections = (a: SelectedByBucket, b: SelectedByBucket): boolean => (
  MONTHLY_BUCKET_KEYS.every((key) => (
    a[key].length === b[key].length && a[key].every((value, index) => value === b[key][index])
  ))
);

const formatSigned = (value: number): string => (value > 0 ? `+${value}` : String(value));

const formatDecimal = (value: number): string => (
  Number.isInteger(value) ? String(value) : value.toFixed(1)
);

const StatCard: React.FC<{ label: string; value: string; detail?: string; tone?: "neutral" | "good" | "warn" | "bad" }> = ({
  label,
  value,
  detail,
  tone = "neutral",
}) => {
  const tones: Record<typeof tone, { border: string; background: string; color: string }> = {
    neutral: { border: "#dbe3ef", background: "#f8fafc", color: "#0f172a" },
    good: { border: "#bbf7d0", background: "#f0fdf4", color: "#166534" },
    warn: { border: "#fde68a", background: "#fffbeb", color: "#92400e" },
    bad: { border: "#fecaca", background: "#fef2f2", color: "#991b1b" },
  };
  const palette = tones[tone];
  return (
    <div style={{ border: `1px solid ${palette.border}`, background: palette.background, borderRadius: 8, padding: 10, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, lineHeight: 1.2, color: palette.color, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {detail && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{detail}</div>}
    </div>
  );
};

const BucketChip: React.FC<{ times: number; value: string | number; muted?: boolean; title?: string }> = ({
  times,
  value,
  muted = false,
  title,
}) => (
  <span
    title={title}
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      minHeight: 24,
      borderRadius: 6,
      padding: "2px 7px",
      background: muted ? "#f1f5f9" : colorForTimes(times),
      color: muted ? "#64748b" : "#fff",
      fontWeight: 800,
      fontSize: 12,
      fontVariantNumeric: "tabular-nums",
      opacity: muted ? 0.8 : 1,
    }}
  >
    <span>{bucketLabelForTimes(times)}</span>
    <span style={{ color: muted ? "#334155" : "#f8fafc" }}>{value}</span>
  </span>
);

const NumberPills: React.FC<{
  numbers: number[];
  selected?: number[];
  excludedNumbers?: readonly number[];
  bucketTimes?: number;
  bucketLabel?: string;
  onToggle?: (n: number) => void;
}> = ({
  numbers,
  selected = [],
  excludedNumbers = [],
  bucketTimes,
  bucketLabel,
  onToggle,
}) => {
  if (!numbers.length) return <span style={{ color: "#94a3b8" }}>none</span>;
  const selectedSet = new Set(selected);
  const excludedSet = new Set(excludedNumbers);
  const hasBucketTone = typeof bucketTimes === "number";
  const bucketColor = hasBucketTone ? colorForTimes(bucketTimes) : "#2563eb";
  const bucketSoftColor = hasBucketTone ? softColorForTimes(bucketTimes) : "#dbeafe";
  const activeTextColor = hasBucketTone ? textOnColorForTimes(bucketTimes) : "#fff";
  const bucketTitleSuffix = bucketLabel ? `, ${bucketLabel} bucket` : "";
  const bucketTitleText = bucketLabel ? `${bucketLabel} bucket` : undefined;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {numbers.map((n) => {
        const isUserExcluded = excludedSet.has(n);
        const active = !isUserExcluded && selectedSet.has(n);
        if (!onToggle) {
          return (
            <span
              key={n}
              style={{
                display: "inline-flex",
                justifyContent: "center",
                alignItems: "center",
                width: 28,
                height: 24,
                borderRadius: 6,
                background: hasBucketTone ? bucketSoftColor : "#f8fafc",
                border: hasBucketTone ? `1px solid ${bucketColor}` : "1px solid #e2e8f0",
                color: hasBucketTone ? bucketColor : "#0f172a",
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
              }}
              title={bucketTitleText ? `${n} · ${bucketTitleText}` : undefined}
              data-monthly-bucket-times={hasBucketTone ? bucketTimes : undefined}
            >
              {n}
            </span>
          );
        }

        return (
          <button
            key={n}
            type="button"
            onClick={() => onToggle(n)}
            disabled={isUserExcluded}
            style={{
              width: 34,
              height: 30,
              borderRadius: 6,
              border: active ? `2px solid ${bucketColor}` : isUserExcluded ? "1px solid #cbd5e1" : hasBucketTone ? `1px solid ${bucketColor}` : "1px solid #cbd5e1",
              background: active ? bucketColor : isUserExcluded ? "#f1f5f9" : bucketSoftColor,
              color: active ? activeTextColor : isUserExcluded ? "#94a3b8" : hasBucketTone ? bucketColor : "#0f172a",
              fontWeight: 800,
              cursor: isUserExcluded ? "not-allowed" : "pointer",
              fontVariantNumeric: "tabular-nums",
              boxShadow: active ? `0 0 0 2px ${bucketSoftColor}` : "none",
            }}
            aria-pressed={active}
            aria-label={isUserExcluded ? `Number ${n} is excluded by User Exclusions${bucketTitleSuffix}` : `${active ? "Remove" : "Select"} ${n}${bucketTitleSuffix}`}
            title={isUserExcluded ? `Clear it in WFMQYH User Exclusions before selecting ${n}${bucketTitleSuffix}.` : `${active ? "Remove" : "Select"} ${n}${bucketTitleSuffix}`}
            data-user-excluded={isUserExcluded ? "true" : undefined}
            data-monthly-bucket-times={hasBucketTone ? bucketTimes : undefined}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
};

const MonthNumbers: React.FC<{ row: MonthlyDrawMonthRow }> = ({ row }) => {
  if (!row.numbers.length) return <span style={{ color: "#94a3b8" }}>none</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {row.numbers.map(({ n, c }) => (
        <span
          key={n}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            minWidth: 30,
            height: 24,
            borderRadius: 6,
            padding: "0 6px",
            border: "1px solid #e2e8f0",
            background: "#fff",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <strong>{n}</strong>
          {c > 1 && <span style={{ color: "#64748b" }}>x{c}</span>}
        </span>
      ))}
    </div>
  );
};

const FrequencyChips: React.FC<{ counts: MonthlyFrequencyCount[]; includeZero?: number }> = ({ counts, includeZero }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
    {typeof includeZero === "number" && includeZero > 0 && <BucketChip times={0} value={includeZero} />}
    {counts.map(({ times, count }) => (
      <BucketChip key={times} times={times} value={count} />
    ))}
  </div>
);

const TargetGrid: React.FC<{ summary: MonthlyDrawSummary }> = ({ summary }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: 6 }}>
    {summary.bucketTargets.map((bucket) => {
      const deltaColor = bucket.neededDelta > 0 ? "#2563eb" : bucket.neededDelta < 0 ? "#dc2626" : "#16a34a";
      const ideal = summary.idealDraw?.bucketCounts.find((entry) => entry.times === bucket.times)?.count ?? 0;
      return (
        <div key={bucket.times} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 8, background: "#f8fafc" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
            <span style={{ fontWeight: 800, color: colorForTimes(bucket.times) }}>{bucketLabelForTimes(bucket.times)}</span>
            <span style={{ color: deltaColor, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{formatSigned(bucket.neededDelta)}</span>
          </div>
          <div style={{ marginTop: 5, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11, color: "#64748b" }}>
            <span>Now</span>
            <strong style={{ color: "#0f172a", textAlign: "right" }}>{bucket.currentCount}</strong>
            <span>Target</span>
            <strong style={{ color: "#0f172a", textAlign: "right" }}>{bucket.targetCount}</strong>
            <span>Median</span>
            <strong style={{ color: "#0f172a", textAlign: "right" }}>{formatDecimal(bucket.median)}</strong>
            <span>Ideal</span>
            <strong style={{ color: ideal > 0 ? "#166534" : "#64748b", textAlign: "right" }}>{ideal}</strong>
          </div>
        </div>
      );
    })}
  </div>
);

export const MonthlyDrawsSummaryPanel: React.FC<MonthlyDrawsSummaryPanelProps> = ({
  history,
  onConstraintsChange,
  onUseSelectedNumbers,
  constructiveFillEnabled = false,
  onConstructiveFillChange,
  onBucketInfoChange,
  onBucketSetsChange,
  onAvgBucketsChange,
  onIdealDrawStateChange,
  onStageIdealDrawStateChange,
  onSimulateNumbers,
  excludedNumbers = [],
}) => {
  const [drawLimit, setDrawLimit] = useState<DrawLimit>("all");
  const [averageDrawCountFilter, setAverageDrawCountFilter] = useState<DrawLimit>("all");
  const [stageExpectedDrawCount, setStageExpectedDrawCount] = useState<number | "auto">("auto");
  const [selectedByBucket, setSelectedByBucket] = useState<SelectedByBucket>(() => emptySelections());
  const [simulateResult, setSimulateResult] = useState<number[] | null>(null);
  const [selectedNumberBiasEnabled, setSelectedNumberBiasEnabled] = useState<boolean>(false);
  const userExcludedNumbers = useMemo(
    () => normalizeUserExclusionLocks(excludedNumbers),
    [excludedNumbers],
  );
  const userExcludedSet = useMemo(() => new Set(userExcludedNumbers), [userExcludedNumbers]);
  const userExclusionReminder = useMemo(
    () => formatUserExclusionReminder(userExcludedNumbers),
    [userExcludedNumbers],
  );

  const summary = useMemo(() => (
    analyzeMonthlyDrawSummary(history, {
      drawLimitPerMonth: drawLimit,
      averageDrawCountFilter,
    })
  ), [averageDrawCountFilter, drawLimit, history]);
  const monthlyBucketDisplayRows = useMemo(() => {
    const rows = averageDrawCountFilter === "all"
      ? summary.rows
      : summary.rows.filter((row) => (
        row.totalDrawCount === averageDrawCountFilter
        || row.monthLabel === summary.effectiveMonthLabel
      ));
    return [...rows].reverse();
  }, [averageDrawCountFilter, summary.effectiveMonthLabel, summary.rows]);
  const monthlyBucketHiddenCount = summary.rows.length - monthlyBucketDisplayRows.length;

  const stageIdealDrawState = useMemo(() => analyzeStageIdealDrawModel(history, {
    drawLimitPerMonth: "all",
    averageDrawCountFilter,
    expectedDrawCountOverride: stageExpectedDrawCount,
  }), [averageDrawCountFilter, history, stageExpectedDrawCount]);

  const constraints = useMemo(
    () => monthlyFrequencyConstraintsFromSelections(selectedByBucket),
    [selectedByBucket],
  );

  const allSelected = useMemo(
    () => numbersFromMonthlySelections(selectedByBucket),
    [selectedByBucket],
  );
  const activeBucketSets = summary.effectiveBucketSets;
  const activeBucketLabels = summary.effectiveBucketLabels;

  const projectedBucketCounts = useMemo(
    () => projectMonthlyBucketCounts(activeBucketSets, selectedByBucket),
    [activeBucketSets, selectedByBucket],
  );

  const bucketOptions = useMemo(() => {
    const options = {} as Record<MonthlyBucketKey, number[]>;
    for (const key of MONTHLY_BUCKET_KEYS) {
      options[key] = [...activeBucketSets[key]].sort((a, b) => a - b);
    }
    return options;
  }, [activeBucketSets]);

  useEffect(() => {
    setSelectedByBucket((previous) => {
      const prunedByBuckets = pruneMonthlySelections(previous, activeBucketSets);
      const pruned = MONTHLY_BUCKET_KEYS.reduce<SelectedByBucket>((acc, key) => {
        acc[key] = prunedByBuckets[key].filter((number) => !userExcludedSet.has(number));
        return acc;
      }, emptySelections());
      return sameSelections(previous, pruned) ? previous : pruned;
    });
  }, [activeBucketSets, userExcludedSet]);

  useEffect(() => {
    onBucketInfoChange?.({ labels: activeBucketLabels });
  }, [activeBucketLabels, onBucketInfoChange]);

  useEffect(() => {
    onBucketSetsChange?.(activeBucketSets);
  }, [activeBucketSets, onBucketSetsChange]);

  useEffect(() => {
    onAvgBucketsChange?.(summary.eligibleRows.length ? summary.bucketAverages : []);
  }, [onAvgBucketsChange, summary.bucketAverages, summary.eligibleRows.length]);

  useEffect(() => {
    onStageIdealDrawStateChange?.(stageIdealDrawState);
  }, [onStageIdealDrawStateChange, stageIdealDrawState]);

  useEffect(() => {
    if (!summary.idealDraw || !summary.eligibleRows.length) {
      onIdealDrawStateChange?.(null);
      return;
    }
    onIdealDrawStateChange?.({
      bucketSets: summary.effectiveBucketSets,
      targetDistribution: [...summary.targetDistribution],
      idealDrawBucketCounts: summary.idealDraw.bucketCounts.map(({ count }) => count),
      effectiveMonthLabel: summary.effectiveMonthLabel,
      effectiveMonthIsSynthetic: summary.effectiveMonthIsSynthetic,
    });
  }, [
    onIdealDrawStateChange,
    summary.effectiveBucketSets,
    summary.effectiveMonthIsSynthetic,
    summary.effectiveMonthLabel,
    summary.eligibleRows.length,
    summary.idealDraw,
    summary.targetDistribution,
  ]);

  useEffect(() => {
    if (!constructiveFillEnabled || !summary.latestRow) {
      onConstraintsChange?.(null);
      return;
    }
    onConstraintsChange?.({
      constraints,
      buckets: activeBucketSets,
      selectedNumbersByBucket: selectedByBucket,
      selectedNumberBiasEnabled,
    });
  }, [activeBucketSets, constraints, constructiveFillEnabled, onConstraintsChange, selectedByBucket, selectedNumberBiasEnabled, summary.latestRow]);

  const toggleBucketNumber = (bucketKey: MonthlyBucketKey, n: number) => {
    if (userExcludedSet.has(n)) return;
    setSelectedByBucket((previous) => {
      const nextSet = new Set(previous[bucketKey]);
      if (nextSet.has(n)) nextSet.delete(n);
      else nextSet.add(n);
      return {
        ...previous,
        [bucketKey]: [...nextSet].sort((a, b) => a - b),
      };
    });
    setSimulateResult(null);
  };

  const handleUseSelected = () => {
    onUseSelectedNumbers?.(allSelected);
  };

  const handleSimulate = () => {
    const numbers = sampleMonthlyNumbers(allSelected, 8);
    setSimulateResult(numbers);
    onSimulateNumbers?.(numbers);
  };

  const clearSelections = () => {
    setSelectedByBucket(emptySelections());
    setSimulateResult(null);
  };

  const hasData = summary.rows.length > 0;
  const qualityTone = summary.quality.warnings.length ? "warn" : "good";
  const drawLimitOptions = Array.from({ length: summary.maxObservedDrawsPerMonth }, (_, index) => index + 1);

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ marginTop: 2, color: "#64748b", fontSize: 12 }}>
            Observed monthly frequency buckets for numbers 1-45, including supplementary numbers.
          </div>
          <div style={{ marginTop: 4, color: "#64748b", fontSize: 12, maxWidth: 760, lineHeight: 1.45 }}>
            <b>Undrawn</b> here means a number never appeared anywhere in that calendar month. It is a unique month-level count, so it will not match <b>Undrawn Patterns</b>, which counts absences draw by draw.
          </div>
          <div style={{ marginTop: 4, color: "#64748b", fontSize: 12, maxWidth: 760, lineHeight: 1.45 }}>
            Historical baselines and averages are <b>date-smart</b>: the opening partial month <b>2024-05</b> stays visible in the table, but it is excluded from all-history baseline / ideal-mix calculations.
          </div>
        </div>
        <div style={{ color: "#475569", fontSize: 12, fontWeight: 700, textAlign: "right", lineHeight: 1.35 }}>
          <div>Latest observed: {summary.latestRow?.monthLabel ?? "none"}</div>
          <div>
            Active buckets: {summary.effectiveMonthLabel || "none"}
            {summary.effectiveMonthIsSynthetic ? " (planning reset)" : ""}
          </div>
        </div>
      </div>

      <div style={toolbarStyle}>
        <label style={controlLabelStyle}>
          Draws Included Per Month
          <select
            value={drawLimit === "all" ? "all" : String(drawLimit)}
            onChange={(event) => setDrawLimit(event.target.value === "all" ? "all" : Number(event.target.value))}
            style={selectStyle}
          >
            <option value="all">All observed draws</option>
            {drawLimitOptions.map((count) => (
              <option key={count} value={count}>First {count}</option>
            ))}
          </select>
        </label>
        <label style={controlLabelStyle}>
          Baseline Months
          <select
            value={averageDrawCountFilter === "all" ? "all" : String(averageDrawCountFilter)}
            onChange={(event) => setAverageDrawCountFilter(event.target.value === "all" ? "all" : Number(event.target.value))}
            style={selectStyle}
          >
            <option value="all">All completed months</option>
            {summary.drawCountOptions.map((count) => (
              <option key={count} value={count}>{count} draw month{count === 1 ? "" : "s"}</option>
            ))}
          </select>
        </label>
      </div>

      <div style={statGridStyle}>
        <StatCard label="Months" value={String(summary.rows.length)} detail={`${summary.quality.validDatedDrawCount} dated draw rows`} />
        <StatCard label="Latest Observed" value={summary.latestRow ? String(summary.latestRow.totalDrawCount) : "0"} detail={summary.latestRow?.monthLabel ?? "No valid month"} />
        <StatCard label="Active Buckets" value={summary.effectiveMonthDrawCount === 0 && summary.effectiveMonthIsSynthetic ? "reset" : String(summary.effectiveMonthDrawCount)} detail={summary.effectiveMonthLabel || "No active month"} />
        <StatCard label="Baseline" value={String(summary.eligibleRows.length)} detail={summary.excludedMonthCount ? `${summary.excludedMonthCount} excluded from baseline` : "No baseline exclusions"} />
        <StatCard label="Integrity" value={summary.quality.warnings.length ? `${summary.quality.warnings.length} warning${summary.quality.warnings.length === 1 ? "" : "s"}` : "clear"} tone={qualityTone} />
      </div>

      {summary.quality.warnings.length > 0 && (
        <div style={{ ...sectionStyle, borderColor: "#fde68a", background: "#fffbeb", color: "#92400e" }}>
          <strong style={{ display: "block", marginBottom: 4 }}>Input integrity</strong>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {summary.quality.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {!hasData ? (
        <div style={{ ...sectionStyle, color: "#64748b" }}>No valid dated draws are available.</div>
      ) : (
        <>
          <div style={sectionStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <strong style={{ color: "#0f172a" }}>Monthly Buckets</strong>
              <span style={{ color: "#64748b", fontSize: 12 }}>
                Counts are unique numbers per month; planning reset rows show 0/expected draws before the first draw lands.
                {averageDrawCountFilter === "all"
                  ? ""
                  : ` Showing ${monthlyBucketDisplayRows.length} of ${summary.rows.length} months while filtering ${averageDrawCountFilter}-draw baseline months; current month stays visible${monthlyBucketHiddenCount ? `, ${monthlyBucketHiddenCount} hidden` : ""}.`}
              </span>
            </div>
            <div style={{ overflowX: "auto", maxHeight: 430 }}>
              <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, background: "#f8fafc", zIndex: 1 }}>
                  <tr>
                    <th style={thStyle}>Month</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Draws</th>
                    <th style={thStyle}>Observed Numbers</th>
                    <th style={thStyle}>Bucket Counts</th>
                    <th
                      style={{ ...thStyle, textAlign: "center" }}
                      title="Numbers that never appeared anywhere in the month"
                    >
                      Undrawn in month
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyBucketDisplayRows.map((row) => (
                    <tr key={row.monthLabel} style={{ background: row.monthLabel === summary.effectiveMonthLabel ? "#f8fafc" : "#fff" }}>
                      <td style={{ ...tdStyle, fontWeight: 800, whiteSpace: "nowrap" }}>{row.monthLabel}</td>
                      <td style={{ ...tdStyle, textAlign: "center", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                        {row.drawCount === row.totalDrawCount ? row.totalDrawCount : `${row.drawCount}/${row.totalDrawCount}`}
                      </td>
                      <td style={tdStyle}><MonthNumbers row={row} /></td>
                      <td style={tdStyle}><FrequencyChips counts={row.frequencyCounts} includeZero={row.undrawn.length} /></td>
                      <td style={undrawnInMonthCellStyle}>
                        <span
                          aria-label={`${row.undrawn.length} numbers undrawn in month`}
                          title={`${row.undrawn.length} numbers undrawn in this month`}
                          style={undrawnInMonthBadgeStyle}
                        >
                          {row.undrawn.length}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <strong style={{ color: "#0f172a" }}>Robust Baseline And Ideal Draw</strong>
              <span style={{ color: "#64748b", fontSize: 12, maxWidth: 620, textAlign: "right" }}>
                Median bucket targets resist outlier months; ideal draw is an exhaustive 8-pick allocation. Ideal pick mix currently targets <strong>{summary.effectiveMonthLabel || "the active month"}</strong>{summary.effectiveMonthIsSynthetic ? " using a date-smart reset because no active-month rows are available yet." : ` with ${summary.effectiveMonthDrawCount} counted draw${summary.effectiveMonthDrawCount === 1 ? "" : "s"}.`}
              </span>
            </div>
            <TargetGrid summary={summary} />
            {summary.idealDraw && (
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", color: "#475569", fontSize: 12 }}>
                <strong style={{ color: "#166534" }}>Ideal pick mix:</strong>
                {summary.idealDraw.bucketCounts.map(({ times, count }) => (
                  <BucketChip key={times} times={times} value={count} muted={count === 0} />
                ))}
                <span>SSD {summary.idealDraw.scoreBefore} to {summary.idealDraw.scoreAfter}</span>
                {summary.idealDraw.freePicks > 0 && <span>{summary.idealDraw.freePicks} neutral 8x+ pick{summary.idealDraw.freePicks === 1 ? "" : "s"}</span>}
              </div>
            )}
            <div style={{ marginTop: 10, borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                <strong style={{ color: "#0f172a" }}>Stage IDM</strong>
                <label style={{ ...controlLabelStyle, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  Expected Draw Count
                  <select
                    value={stageExpectedDrawCount === "auto" ? "auto" : String(stageExpectedDrawCount)}
                    onChange={(event) => setStageExpectedDrawCount(event.target.value === "auto" ? "auto" : Number(event.target.value))}
                    style={{ ...selectStyle, minHeight: 32 }}
                  >
                    <option value="auto">Auto{stageIdealDrawState ? `: ${stageIdealDrawState.expectedDrawCount} draws` : ""}</option>
                    {summary.drawCountOptions.map((count) => (
                      <option key={count} value={count}>{count} draws</option>
                    ))}
                  </select>
                </label>
              </div>
              {stageIdealDrawState ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", color: "#475569", fontSize: 12 }}>
                  <span>
                    {stageIdealDrawState.workingMonthLabel} · {stageIdealDrawState.expectedDrawCountSource === "auto" ? "Auto" : "Override"}: {stageIdealDrawState.expectedDrawCount}-draw month · planning draw {stageIdealDrawState.targetStageDrawCount} · baseline: {stageIdealDrawState.comparableMonthCount} comparable month{stageIdealDrawState.comparableMonthCount === 1 ? "" : "s"}
                  </span>
                  {stageIdealDrawState.idealDrawBucketCounts.map((count, times) => (
                    <BucketChip key={times} times={times} value={count} muted={count === 0} />
                  ))}
                  {stageIdealDrawState.warnings.map((warning) => (
                    <span key={warning} style={{ color: "#b45309", fontWeight: 700 }}>{warning}</span>
                  ))}
                </div>
              ) : (
                <div style={{ color: "#64748b", fontSize: 12 }}>
                  Stage IDM unavailable: no comparable months for the resolved draw count and next stage.
                </div>
              )}
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <div>
                <strong style={{ color: "#0f172a" }}>Acceptance Needs</strong>
                <div style={{ color: "#64748b", fontSize: 12 }}>
                  Select numbers from the active monthly buckets; stale selections are removed automatically.
                  {summary.effectiveMonthIsSynthetic ? " The planning month starts with all numbers in Undrawn." : ""}
                </div>
                {userExclusionReminder && (
                  <div role="status" style={{ color: "#475569", fontSize: 12, marginTop: 4 }}>
                    {userExclusionReminder}. Clear these in WFMQYH User Exclusions before selecting them here.
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#334155", fontSize: 12, fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={constructiveFillEnabled}
                    onChange={(event) => onConstructiveFillChange?.(event.target.checked)}
                  />
                  Use counts when constructing candidates
                </label>
                <label
                  style={{ display: "flex", alignItems: "center", gap: 6, color: "#475569", fontSize: 11, fontWeight: 700 }}
                  title="Favour the clicked numbers inside each selected bucket during constructive fill, while still allowing unclicked numbers to appear."
                >
                  <input
                    type="checkbox"
                    checked={selectedNumberBiasEnabled}
                    onChange={(event) => setSelectedNumberBiasEnabled(event.target.checked)}
                  />
                  Bias clicked bucket numbers (not forced)
                </label>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(108px, 1fr))", gap: 6, marginBottom: 10 }}>
              {bucketMeta.map(({ key, times, label }) => (
                <div key={key} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 8, background: "#f8fafc" }}>
                  <div style={{ color: colorForTimes(times), fontSize: 12, fontWeight: 800 }}>{label}</div>
                  <div style={{ color: "#0f172a", fontSize: 18, fontWeight: 900 }}>{constraints[key]}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
              {bucketMeta.map(({ key, times, label }) => (
                <div key={key} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                      <strong style={{ color: colorForTimes(times), fontSize: 13 }}>{label}</strong>
                      <span style={{ color: "#0f172a", fontSize: 16, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
                        {projectedBucketCounts[key].projectedCount}
                      </span>
                    </div>
                    <span
                      style={{ color: "#64748b", fontSize: 11, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}
                      title={`Base ${projectedBucketCounts[key].baseCount}${projectedBucketCounts[key].delta === 0 ? "" : `, delta ${formatSigned(projectedBucketCounts[key].delta)}`}`}
                    >
                      {projectedBucketCounts[key].delta === 0 ? `base ${projectedBucketCounts[key].baseCount}` : formatSigned(projectedBucketCounts[key].delta)}
                    </span>
                  </div>
                  <div style={{ color: "#64748b", fontSize: 11, marginBottom: 6 }}>
                    Clicked {projectedBucketCounts[key].selectedCount} · base {projectedBucketCounts[key].baseCount}
                  </div>
                  <NumberPills
                    numbers={bucketOptions[key]}
                    selected={selectedByBucket[key]}
                    excludedNumbers={userExcludedNumbers}
                    bucketTimes={times}
                    bucketLabel={label}
                    onToggle={(n) => toggleBucketNumber(key, n)}
                  />
                </div>
              ))}
            </div>

            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <button type="button" onClick={handleUseSelected} disabled={!onUseSelectedNumbers || allSelected.length === 0}>
                Use selected
              </button>
              <button type="button" onClick={clearSelections} disabled={allSelected.length === 0}>
                Clear
              </button>
              <button type="button" onClick={handleSimulate} disabled={allSelected.length === 0}>
                Simulate 8
              </button>
              <span style={{ color: "#64748b", fontSize: 12 }}>
                {allSelected.length} selected
              </span>
              {simulateResult && (
                <span style={{ display: "inline-flex", gap: 5, alignItems: "center", color: "#166534", fontSize: 12, fontWeight: 800 }}>
                  Result
                  <NumberPills numbers={simulateResult} />
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MonthlyDrawsSummaryPanel;

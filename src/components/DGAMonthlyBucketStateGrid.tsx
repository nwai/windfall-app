import React, { useMemo, useState } from "react";

import { normalizeDgaSelectedNumbers, summarizeDgaSelectedNumbers } from "../lib/dgaSelectedNumbers";
import type { MonthlyBucketTimelineDrawState, MonthlyBucketTimelineEntry } from "../lib/monthlyBucketTimeline";
import type { MonthlyBucketSets } from "../lib/monthlyDrawSummary";

interface DGAMonthlyBucketStateGridProps {
  timeline: MonthlyBucketTimelineEntry[];
  currentMonthLabel?: string;
  cellSize?: number;
  hoveredNumber?: number | null;
  onHoverNumber?: (value: number | null) => void;
  selectedNumbers?: number[];
}

const colorForTimes = (times: number): string => {
  const palette: Record<number, string> = {
    0: "rgba(117,117,117,0.70)",
    1: "rgba(66,165,245,0.70)",
    2: "rgba(102,187,106,0.70)",
    3: "rgba(38,198,218,0.70)",
    4: "rgba(251,192,45,0.70)",
    5: "rgba(251,140,0,0.72)",
    6: "rgba(244,81,30,0.72)",
    7: "rgba(229,57,53,0.74)",
  };
  return palette[times] ?? "rgba(142,36,170,0.74)";
};

const labelForTimes = (times: number): string => {
  if (times <= 0) return "Undrawn";
  return times >= 8 ? "8x+" : `${times}x`;
};

const drawProgressLabel = (entry: MonthlyBucketTimelineEntry): string => {
  const observed = Math.max(entry.drawCount, entry.drawStates?.length ?? 0);
  const total = Math.max(observed, Math.floor(entry.totalDrawCount || observed || 0));
  return total > 0 ? `${observed}/${total}` : `${observed}`;
};

const drawStateLabel = (state: MonthlyBucketTimelineDrawState): string => (
  `${state.isSimulated ? "Sim D" : "D"}${state.drawOrdinal}`
);

const drawSlotLabel = (slotNumber: number): string => `D${slotNumber}`;

const columnKeyForSlot = (
  entry: MonthlyBucketTimelineEntry,
  slotNumber: number,
  state: MonthlyBucketTimelineDrawState | null,
  index: number,
): string => `${entry.monthLabel}:${slotNumber}:${index}:${state ? (state.isSimulated ? "sim" : "real") : "empty"}`;

const drawSlotTitle = (
  entry: MonthlyBucketTimelineEntry,
  slotNumber: number,
  state: MonthlyBucketTimelineDrawState | null,
): string => {
  if (!state) return `${entry.monthLabel} · ${drawSlotLabel(slotNumber)} · no recorded draw state`;
  const date = state.drawDate ? ` · ${state.drawDate}` : "";
  return `${entry.monthLabel} · ${drawSlotLabel(slotNumber)}${date}${state.isSimulated ? " · simulated" : ""}`;
};

const drawStatesForEntry = (entry: MonthlyBucketTimelineEntry): MonthlyBucketTimelineDrawState[] => {
  if (Array.isArray(entry.drawStates) && entry.drawStates.length > 0) return entry.drawStates;
  if (entry.drawCount <= 0) return [];
  return [{
    drawOrdinal: entry.drawCount,
    drawDate: "",
    bucketSets: entry.bucketSets,
    isSimulated: false,
  }];
};

const timesForNumber = (n: number, buckets: MonthlyBucketSets): number => {
  if (buckets.undrawn.has(n)) return 0;
  if (buckets.times1.has(n)) return 1;
  if (buckets.times2.has(n)) return 2;
  if (buckets.times3.has(n)) return 3;
  if (buckets.times4.has(n)) return 4;
  if (buckets.times5.has(n)) return 5;
  if (buckets.times6.has(n)) return 6;
  if (buckets.times7.has(n)) return 7;
  if (buckets.times8.has(n)) return 8;
  return 0;
};

const countForTimes = (times: number, buckets: MonthlyBucketSets): number => {
  if (times <= 0) return buckets.undrawn.size;
  if (times === 1) return buckets.times1.size;
  if (times === 2) return buckets.times2.size;
  if (times === 3) return buckets.times3.size;
  if (times === 4) return buckets.times4.size;
  if (times === 5) return buckets.times5.size;
  if (times === 6) return buckets.times6.size;
  if (times === 7) return buckets.times7.size;
  return buckets.times8.size;
};

const legendTimes = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
const ROW_LABEL_WIDTH = 46;
const UNSELECTED_ROW_OPACITY = 0.38;

interface BucketCountChip {
  times: number;
  label: string;
  count: number;
}

interface ColumnSummary {
  bucketCounts: BucketCountChip[];
  totalsLabel: string;
}

interface DrawSlotColumn {
  entry: MonthlyBucketTimelineEntry;
  slotNumber: number;
  state: MonthlyBucketTimelineDrawState | null;
  slotIndex: number;
  key: string;
}

interface EntrySlotGroup {
  entry: MonthlyBucketTimelineEntry;
  slots: DrawSlotColumn[];
}

const buildBucketCounts = (bucketSets: MonthlyBucketSets): BucketCountChip[] => (
  legendTimes.map((times) => ({
    times,
    label: labelForTimes(times),
    count: countForTimes(times, bucketSets),
  }))
);

const buildColumnSummary = (bucketSets: MonthlyBucketSets): ColumnSummary => {
  const bucketCounts = buildBucketCounts(bucketSets);
  return {
    bucketCounts,
    totalsLabel: bucketCounts.map(({ label, count }) => `${label} ${count}`).join(" · "),
  };
};

const drawSlotsForEntry = (entry: MonthlyBucketTimelineEntry): DrawSlotColumn[] => {
  const states = drawStatesForEntry(entry);
  const slotCount = Math.max(
    Math.floor(entry.totalDrawCount || 0),
    Math.floor(entry.drawCount || 0),
    states.length,
  );
  if (slotCount <= 0) return [];

  const statesByOrdinal = new Map<number, MonthlyBucketTimelineDrawState>();
  states.forEach((state) => {
    if (!statesByOrdinal.has(state.drawOrdinal)) {
      statesByOrdinal.set(state.drawOrdinal, state);
    }
  });

  return Array.from({ length: slotCount }, (_, index) => {
    const slotNumber = index + 1;
    const state = statesByOrdinal.get(slotNumber) ?? null;
    return {
      entry,
      slotNumber,
      state,
      slotIndex: index,
      key: columnKeyForSlot(entry, slotNumber, state, index),
    };
  });
};

export const DGAMonthlyBucketStateGrid: React.FC<DGAMonthlyBucketStateGridProps> = ({
  timeline,
  currentMonthLabel,
  cellSize = 20,
  hoveredNumber,
  onHoverNumber,
  selectedNumbers,
}) => {
  const [expanded, setExpanded] = useState<boolean>(false);
  const [hoveredColumnKey, setHoveredColumnKey] = useState<string | null>(null);
  const normalizedSelectedNumbers = useMemo(
    () => normalizeDgaSelectedNumbers(selectedNumbers),
    [selectedNumbers],
  );
  const selectedNumberSet = useMemo(
    () => new Set<number>(normalizedSelectedNumbers),
    [normalizedSelectedNumbers],
  );
  const selectedNumbersSummary = useMemo(
    () => summarizeDgaSelectedNumbers(normalizedSelectedNumbers),
    [normalizedSelectedNumbers],
  );

  const currentEntry = useMemo(
    () => timeline.find((entry) => entry.monthLabel === currentMonthLabel) ?? timeline[timeline.length - 1] ?? null,
    [timeline, currentMonthLabel],
  );

  const orderedTimeline = useMemo(() => {
    if (!currentEntry) return [];
    const remainingEntries = timeline
      .filter((entry) => entry.monthLabel !== currentEntry.monthLabel)
      .slice()
      .sort((a, b) => b.monthLabel.localeCompare(a.monthLabel));
    return [currentEntry, ...remainingEntries];
  }, [currentEntry, timeline]);

  const entryGroups = useMemo<EntrySlotGroup[]>(
    () => orderedTimeline
      .map((entry) => ({
        entry,
        slots: drawSlotsForEntry(entry),
      }))
      .filter((group) => group.slots.length > 0),
    [orderedTimeline],
  );

  const gridColumns = useMemo(
    () => entryGroups.flatMap(({ slots }) => slots),
    [entryGroups],
  );

  const columnSummaryByKey = useMemo(() => {
    const next = new Map<string, ColumnSummary>();
    gridColumns.forEach((column) => {
      if (column.state) {
        next.set(column.key, buildColumnSummary(column.state.bucketSets));
      }
    });
    return next;
  }, [gridColumns]);

  const currentBucketSets = currentEntry?.bucketSets ?? null;
  const currentDrawCountLabel = currentEntry
    ? `${drawProgressLabel(currentEntry)} draw slot${Math.max(currentEntry.drawCount, currentEntry.drawStates?.length ?? 0) === 1 ? "" : "s"}`
    : "0 draw slots";
  const currentColumnSummary = currentEntry ? buildColumnSummary(currentEntry.bucketSets) : null;
  const currentAxisGroup = entryGroups.find((group) => group.entry.monthLabel === currentEntry?.monthLabel) ?? entryGroups[0] ?? null;
  const fallbackSummaryColumn = gridColumns.find((column) => column.entry.monthLabel === currentEntry?.monthLabel && column.state) ?? gridColumns.find((column) => column.state) ?? null;
  const hoveredColumn = gridColumns.find((column) => column.key === hoveredColumnKey) ?? null;
  const activeSummaryColumn = hoveredColumnKey ? hoveredColumn : fallbackSummaryColumn;
  const activeSummary = activeSummaryColumn?.state ? columnSummaryByKey.get(activeSummaryColumn.key) ?? null : null;
  const columnWidth = cellSize + 6;
  const hasActiveStripSelection = normalizedSelectedNumbers.length > 0;

  if (!currentEntry || orderedTimeline.length === 0) return null;

  return (
    <div
      style={{
        marginTop: 12,
        border: "1px solid #dbe3ef",
        borderRadius: 10,
        background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "10px 12px",
          border: "none",
          borderBottom: expanded ? "1px solid #dbe3ef" : "none",
          background: expanded ? "#eef6ff" : "transparent",
          color: "#0f172a",
          cursor: "pointer",
          textAlign: "left",
        }}
        aria-expanded={expanded}
      >
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <strong style={{ color: "#0f172a" }}>Monthly bucket state grid</strong>
          <span style={{ color: "#64748b", fontSize: 12 }}>
              {orderedTimeline.length} month{orderedTimeline.length === 1 ? "" : "s"} · current strip month {currentEntry.monthLabel} · {currentDrawCountLabel}
              {normalizedSelectedNumbers.length > 0 ? ` · ${normalizedSelectedNumbers.length} strip-selected` : ""}
          </span>
        </span>
        <span style={{ color: "#1565c0", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>
            {expanded ? "Hide ▲" : `Show (${orderedTimeline.length} months) ▼`}
        </span>
      </button>

      {!expanded ? (
        <div style={{ padding: "0 12px 10px", color: "#64748b", fontSize: 12 }}>
          Rows are numbers 1–45; the pinned first month column mirrors the DGA strip, and hovering a strip number or grid row spotlights the same number in both places.
          {hasActiveStripSelection ? ` With active strip selections, unselected rows are dimmed so ${selectedNumbersSummary} stay in focus.` : ""}
        </div>
      ) : (
        <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap", margin: "10px 12px 8px" }}>
        <div>
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>
            45 rows by month and scheduled draw slot. The current month is grouped first; blank future slots are labelled but do not carry bucket-state data.
            {hasActiveStripSelection ? " Non-selected rows are dimmed while strip selections are active." : ""}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {legendTimes.map((times) => (
            <span
              key={times}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "2px 6px",
                borderRadius: 999,
                background: colorForTimes(times),
                color: "#fff",
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.95)",
                  opacity: 0.95,
                }}
              />
              {labelForTimes(times)}
            </span>
          ))}
        </div>
      </div>

      {currentAxisGroup ? (
        <div
          aria-label={`Current month draw-slot x-axis for ${currentAxisGroup.entry.monthLabel}`}
          style={{
            margin: "0 12px 10px",
            padding: "8px 10px",
            border: "1px solid #cfe3ff",
            borderRadius: 8,
            background: "#f8fbff",
            display: "flex",
            alignItems: "center",
            gap: 8,
            overflowX: "auto",
            scrollbarColor: "#90caf9 #e3f2fd",
          }}
        >
          <span
            style={{
              flex: "0 0 auto",
              color: "#0d47a1",
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: 0,
              textTransform: "uppercase",
            }}
          >
            X-axis
          </span>
          <span
            style={{
              flex: "0 0 auto",
              color: "#64748b",
              fontSize: 11,
              fontWeight: 800,
              whiteSpace: "nowrap",
            }}
          >
            {currentAxisGroup.entry.monthLabel}
          </span>
          <div style={{ display: "flex", gap: 3, alignItems: "center", minWidth: 0 }}>
            {currentAxisGroup.slots.map((column) => {
              const isEmptySlot = !column.state;
              return (
                <span
                  key={`top-axis-${column.key}`}
                  title={drawSlotTitle(currentAxisGroup.entry, column.slotNumber, column.state)}
                  style={{
                    flex: "0 0 auto",
                    minWidth: 28,
                    height: 24,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 6,
                    border: isEmptySlot ? "1px solid #dbe3ef" : "1px solid #bfdbfe",
                    background: isEmptySlot ? "#f8fafc" : "#eff6ff",
                    color: isEmptySlot ? "#94a3b8" : "#0d47a1",
                    fontSize: 10,
                    fontWeight: 900,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {drawSlotLabel(column.slotNumber)}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      <div
        style={{
          margin: "0 12px 10px",
          padding: 10,
          border: "1px solid #dbe3ef",
          borderRadius: 8,
          background: "#f8fafc",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 8,
          fontSize: 12,
          color: "#334155",
        }}
      >
        <div><strong>Rows:</strong> numbers 1–45.</div>
        <div><strong>Columns:</strong> scheduled D1–D13/D14 draw slots inside each month.</div>
        <div><strong>Current month group:</strong> the current strip month stays first.</div>
        <div><strong>Header chip:</strong> recorded or simulated draw slot over calculated month capacity.</div>
        <div><strong>Left colour rail:</strong> current strip colour for each number.</div>
        <div><strong>Cell colour:</strong> the bucket that number occupied after that recorded or simulated slot.</div>
        <div><strong>Blank slots:</strong> scheduled future slots with no recorded state yet.</div>
        <div><strong>Strip focus:</strong> active strip selections dim the non-selected rows.</div>
        <div><strong>Hover totals:</strong> hover any populated draw header or cell to see that draw-state column’s bucket totals.</div>
        <div><strong>Hover link:</strong> hover a strip number or grid row to spotlight the same number in both places.</div>
      </div>

      <div
        style={{
          margin: "0 12px 10px",
          padding: 10,
          border: "1px solid #bfdbfe",
          borderRadius: 8,
          background: hoveredColumnKey ? "#eff6ff" : "#f8fafc",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <strong style={{ color: hoveredColumnKey ? "#0d47a1" : "#0f172a" }}>
              {hoveredColumnKey ? "Hovered draw-state totals" : "Pinned current draw-state totals"}
            </strong>
            <span style={{ color: "#64748b", fontSize: 12 }}>
              {activeSummaryColumn?.state
                ? `${activeSummaryColumn.entry.monthLabel} · ${drawStateLabel(activeSummaryColumn.state)}${activeSummaryColumn.state.drawDate ? ` · ${activeSummaryColumn.state.drawDate}` : ""}`
                : activeSummaryColumn
                  ? `${activeSummaryColumn.entry.monthLabel} · ${drawSlotLabel(activeSummaryColumn.slotNumber)} · no recorded draw state`
                : "— · 0 draws"}
              {activeSummaryColumn?.entry.monthLabel === currentEntry.monthLabel ? " · current strip month" : ""}
            </span>
            <span style={{ color: "#64748b", fontSize: 11 }}>
              {hoveredColumnKey && activeSummaryColumn?.state
                ? "Move within the same draw-state column to keep these totals visible."
                : hoveredColumnKey
                  ? "This scheduled slot is labelled on the x-axis, but no recorded or simulated draw state exists for it yet."
                : "Hover any draw header or cell to swap this summary to that draw state."}
            </span>
            {hoveredNumber !== null ? (
              <span style={{ color: "#0d47a1", fontSize: 11, fontWeight: 800 }}>
                Linked hover: {hoveredNumber} is highlighted in the DGA strip and the pinned current-month cell.
              </span>
            ) : null}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {activeSummary ? activeSummary.bucketCounts.map(({ times, label, count }) => (
              <span
                key={`${activeSummaryColumn?.key ?? "none"}-${times}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "2px 7px",
                  borderRadius: 999,
                  background: colorForTimes(times),
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {label}: {count}
              </span>
            )) : (
              <span style={{ color: "#64748b", fontSize: 11, fontWeight: 800 }}>
                No bucket totals for this empty slot
              </span>
            )}
          </div>
        </div>
      </div>

      {normalizedSelectedNumbers.length > 0 ? (
        <div
          style={{
            margin: "0 12px 10px",
            padding: 10,
            border: "1px solid #bfdbfe",
            borderRadius: 8,
            background: "linear-gradient(180deg, #eff6ff 0%, #f8fbff 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <strong style={{ color: "#0d47a1" }}>Selected in DGA strip</strong>
              <span style={{ color: "#64748b", fontSize: 12 }}>
                These rows stay fully visible while the other rows are dimmed until you clear them from the strip.
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              {normalizedSelectedNumbers.map((value) => (
                <span
                  key={`selected-${value}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 28,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "#1565c0",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 800,
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
                  }}
                >
                  {value}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div
        style={{
          overflow: "auto",
          borderTop: "1px solid #dbe3ef",
          background: "linear-gradient(180deg, rgba(227,242,253,0.35) 0%, rgba(255,255,255,1) 28px)",
          boxShadow: "inset 0 10px 18px rgba(21,101,192,0.05)",
          scrollbarColor: "#90caf9 #e3f2fd",
        }}
        onMouseLeave={() => {
          setHoveredColumnKey(null);
          onHoverNumber?.(null);
        }}
      >
        {entryGroups.length === 0 ? (
          <div style={{ padding: 12, color: "#64748b", fontSize: 12 }}>
            No scheduled draw-slot columns are available for the current monthly bucket timeline.
          </div>
        ) : (
          <table style={{ borderCollapse: "collapse", fontSize: 11, width: "max-content", minWidth: "100%" }}>
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 6,
                    background: "#f8fafc",
                    borderBottom: "1px solid #dbe3ef",
                    borderRight: "1px solid #dbe3ef",
                    padding: "4px 6px",
                    width: ROW_LABEL_WIDTH,
                    minWidth: ROW_LABEL_WIDTH,
                    maxWidth: ROW_LABEL_WIDTH,
                    textAlign: "right",
                  }}
                >
                  No.
                </th>
                {entryGroups.map(({ entry, slots }) => {
                  const isCurrent = entry.monthLabel === currentEntry.monthLabel;
                  const groupWidth = slots.length * columnWidth;
                  return (
                    <th
                      key={entry.monthLabel}
                      colSpan={slots.length}
                      title={`${entry.monthLabel} · ${drawProgressLabel(entry)} draw slots${isCurrent ? " · current strip month" : ""}`}
                      style={{
                        position: isCurrent ? "sticky" : undefined,
                        left: isCurrent ? ROW_LABEL_WIDTH : undefined,
                        zIndex: isCurrent ? 5 : 2,
                        minWidth: groupWidth,
                        width: groupWidth,
                        borderBottom: "1px solid #dbe3ef",
                        borderLeft: isCurrent ? "2px solid #1565c0" : "1px solid #edf2f7",
                        borderRight: isCurrent ? "2px solid #1565c0" : "1px solid #edf2f7",
                        background: isCurrent ? "#e3f2fd" : "#f8fafc",
                        color: isCurrent ? "#0d47a1" : "#334155",
                        padding: "4px 6px",
                        boxShadow: isCurrent ? "4px 0 10px rgba(15,23,42,0.08)" : undefined,
                        textAlign: "center",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                        <strong>{entry.monthLabel}</strong>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "1px 5px",
                            borderRadius: 999,
                            background: isCurrent ? "#1565c0" : "#e2e8f0",
                            color: isCurrent ? "#fff" : "#334155",
                            fontSize: 9,
                            fontWeight: 900,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {drawProgressLabel(entry)}
                        </span>
                        {isCurrent ? <span style={{ fontSize: 9, fontWeight: 900 }}>strip</span> : null}
                      </span>
                    </th>
                  );
                })}
              </tr>
              <tr>
                {entryGroups.flatMap(({ entry, slots }) => (
                  slots.map((column) => {
                    const { key, slotIndex, slotNumber, state } = column;
                    const isCurrent = entry.monthLabel === currentEntry.monthLabel;
                    const isHoveredColumn = key === hoveredColumnKey;
                    const isEmptySlot = !state;
                    const stickyLeft = ROW_LABEL_WIDTH + slotIndex * columnWidth;
                    return (
                      <th
                        key={key}
                        onMouseEnter={() => setHoveredColumnKey(key)}
                        title={drawSlotTitle(entry, slotNumber, state)}
                        style={{
                          position: isCurrent ? "sticky" : undefined,
                          left: isCurrent ? stickyLeft : undefined,
                          zIndex: isCurrent ? 5 : 2,
                          width: columnWidth,
                          minWidth: columnWidth,
                          height: 38,
                          borderBottom: "1px solid #dbe3ef",
                          borderLeft: slotIndex === 0
                            ? (isCurrent ? "2px solid #1565c0" : "1px solid #edf2f7")
                            : "1px solid #edf2f7",
                          borderRight: slotIndex === slots.length - 1
                            ? (isCurrent ? "2px solid #1565c0" : "1px solid #edf2f7")
                            : "1px solid #edf2f7",
                          background: isEmptySlot
                            ? (isCurrent ? "#f8fbff" : "#f8fafc")
                            : isCurrent
                              ? (isHoveredColumn ? "#dbeafe" : "#eff6ff")
                              : (isHoveredColumn ? "#eef6ff" : "#ffffff"),
                          color: isEmptySlot ? "#94a3b8" : (state.isSimulated ? "#7c2d12" : (isCurrent ? "#0d47a1" : "#334155")),
                          padding: 0,
                          boxShadow: isHoveredColumn ? "inset 0 0 0 1px rgba(21,101,192,0.18)" : undefined,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        <span style={{ fontWeight: 900, fontSize: 10 }}>
                          {drawSlotLabel(slotNumber)}
                        </span>
                      </th>
                    );
                  })
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 45 }, (_, index) => index + 1).map((n) => (
                <tr
                  key={n}
                  onMouseEnter={() => onHoverNumber?.(n)}
                  onMouseLeave={() => onHoverNumber?.(null)}
                >
                  {(() => {
                    const isSelectedRow = selectedNumberSet.has(n);
                    const isDimmedRow = hasActiveStripSelection && !isSelectedRow && hoveredNumber !== n;
                    const rowLabelBoxShadow = [
                      hoveredNumber === n ? "inset 0 0 0 2px rgba(255,255,255,0.94), 0 0 0 2px rgba(13,71,161,0.30)" : "",
                    ].filter(Boolean).join(", ") || undefined;

                    return (
                      <td
                        title={`${n} · current strip bucket ${labelForTimes(currentBucketSets ? timesForNumber(n, currentBucketSets) : 0)} · ${currentDrawCountLabel}${currentColumnSummary ? ` · totals: ${currentColumnSummary.totalsLabel}` : ""}${isSelectedRow ? " · selected in DGA strip" : ""}${isDimmedRow ? " · dimmed because it is not selected in the DGA strip" : ""}`}
                        style={{
                          position: "sticky",
                          left: 0,
                          zIndex: 6,
                          background: colorForTimes(currentBucketSets ? timesForNumber(n, currentBucketSets) : 0),
                          borderRight: "1px solid #dbe3ef",
                          borderBottom: "1px solid #edf2f7",
                          padding: "0 6px",
                          height: cellSize,
                          width: ROW_LABEL_WIDTH,
                          minWidth: ROW_LABEL_WIDTH,
                          maxWidth: ROW_LABEL_WIDTH,
                          textAlign: "right",
                          fontWeight: 800,
                          color: "#fff",
                          fontVariantNumeric: "tabular-nums",
                          boxShadow: rowLabelBoxShadow,
                          opacity: isDimmedRow ? UNSELECTED_ROW_OPACITY : 1,
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 4, width: "100%" }}>
                          {isSelectedRow ? (
                            <span aria-hidden="true" style={{ fontSize: 9, fontWeight: 900, lineHeight: 1 }}>
                              ✓
                            </span>
                          ) : null}
                          <span>{n}</span>
                        </span>
                      </td>
                    );
                  })()}
                  {entryGroups.flatMap(({ entry, slots }) => (
                    slots.map((column) => {
                      const { key, slotIndex, slotNumber, state } = column;
                      const times = state ? timesForNumber(n, state.bucketSets) : null;
                      const isCurrent = entry.monthLabel === currentEntry.monthLabel;
                      const isHoveredColumn = key === hoveredColumnKey;
                      const isSelectedRow = selectedNumberSet.has(n);
                      const isDimmedRow = hasActiveStripSelection && !isSelectedRow && hoveredNumber !== n;
                      const isCrossHighlight = !!state && isCurrent && hoveredNumber === n;
                      const stickyLeft = ROW_LABEL_WIDTH + slotIndex * columnWidth;
                      const columnSummary = columnSummaryByKey.get(key);
                      const cellBoxShadow = [
                        isHoveredColumn ? "inset 0 0 0 1px rgba(255,255,255,0.40)" : "",
                        isCrossHighlight ? "inset 0 0 0 2px rgba(255,255,255,0.94), 0 0 0 2px rgba(13,71,161,0.34)" : "",
                      ].filter(Boolean).join(", ") || undefined;
                      const title = state
                        ? `${n} · ${entry.monthLabel} · ${drawStateLabel(state)} · ${labelForTimes(times ?? 0)}${state.drawDate ? ` · ${state.drawDate}` : ""}${columnSummary ? ` · totals: ${columnSummary.totalsLabel}` : ""}${state.isSimulated ? " · simulated draw state" : ""}${isCurrent ? " · current strip month" : ""}${isSelectedRow ? " · selected in DGA strip" : ""}${isDimmedRow ? " · dimmed because it is not selected in the DGA strip" : ""}${isCrossHighlight ? " · linked to DGA strip hover" : ""}`
                        : `${n} · ${entry.monthLabel} · ${drawSlotLabel(slotNumber)} · no recorded draw state${isCurrent ? " · current strip month" : ""}${isSelectedRow ? " · selected in DGA strip" : ""}${isDimmedRow ? " · dimmed because it is not selected in the DGA strip" : ""}`;
                      return (
                        <td
                          key={`${key}-${n}`}
                          onMouseEnter={() => setHoveredColumnKey(key)}
                          title={title}
                          style={{
                            position: isCurrent ? "sticky" : undefined,
                            left: isCurrent ? stickyLeft : undefined,
                            zIndex: isCurrent ? 3 : 1,
                            width: columnWidth,
                            minWidth: columnWidth,
                            height: cellSize,
                            background: state ? colorForTimes(times ?? 0) : "#f8fafc",
                            borderLeft: slotIndex === 0
                              ? (isCurrent ? "2px solid #1565c0" : "1px solid #edf2f7")
                              : "1px solid #edf2f7",
                            borderRight: slotIndex === slots.length - 1
                              ? (isCurrent ? "2px solid #1565c0" : "1px solid #edf2f7")
                              : "1px solid #edf2f7",
                            borderBottom: "1px solid #edf2f7",
                            padding: 0,
                            boxSizing: "border-box",
                            boxShadow: cellBoxShadow,
                            opacity: isDimmedRow ? UNSELECTED_ROW_OPACITY : (state ? 1 : 0.72),
                            filter: isHoveredColumn ? "brightness(1.03)" : undefined,
                          }}
                        />
                      );
                    })
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
        </>
      )}
    </div>
  );
};

export default DGAMonthlyBucketStateGrid;

import React, { useMemo, useState } from "react";

import type { Draw } from "../types";
import { analyzeMonthEndCarryOverBuckets, type MonthEndCarryOverBucketEvent } from "../lib/monthEndCarryOverBuckets";

interface MonthEndCarryOverBucketsPanelProps {
  history: Draw[];
  selectedBoostNumbers?: number[];
  onToggleBoostNumber?: (number: number) => void;
}

type Mode = "mains" | "all";

const panelStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#fff",
  padding: 12,
};

const metricGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
  margin: "12px 0",
};

const metricStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#f8fafc",
  padding: "9px 10px",
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
};

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontSize: 12,
  color: "#475569",
  background: "#f8fafc",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #f1f5f9",
  fontSize: 13,
  verticalAlign: "top",
};

const numberChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 26,
  height: 24,
  padding: "0 7px",
  margin: "0 5px 5px 0",
  borderRadius: 999,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 800,
  fontVariantNumeric: "tabular-nums",
};

const selectedNumberChipStyle: React.CSSProperties = {
  ...numberChipStyle,
  borderColor: "#166534",
  background: "#dcfce7",
  color: "#14532d",
  boxShadow: "inset 0 0 0 1px #86efac",
};

const formatPct = (value: number): string => `${(value * 100).toFixed(1)}%`;

const formatLeadingBuckets = (buckets: readonly string[] | undefined, fallback: string | null): string => {
  if (buckets && buckets.length > 0) return buckets.join(" / ");
  return fallback ?? "None";
};

const uniqueNumberLabel = (events: MonthEndCarryOverBucketEvent[]): string => {
  const grouped = new Map<number, MonthEndCarryOverBucketEvent[]>();
  events.forEach((event) => {
    grouped.set(event.number, [...(grouped.get(event.number) ?? []), event]);
  });
  return Array.from(grouped.entries())
    .map(([number, numberEvents]) => `${number} (${numberEvents.length})`)
    .join(", ");
};

const EventChips: React.FC<{
  events: MonthEndCarryOverBucketEvent[];
  selectedNumbers: ReadonlySet<number>;
  onToggleBoostNumber?: (number: number) => void;
}> = ({ events, selectedNumbers, onToggleBoostNumber }) => {
  if (events.length === 0) return <span style={{ color: "#94a3b8" }}>None</span>;

  return (
    <div style={{ minWidth: 220 }}>
      {events.map((event) => {
        const selected = selectedNumbers.has(event.number);
        const title = `${event.number}: ${event.sourceLastDrawDate} -> ${event.targetFirstDrawDate}; source ${event.sourceMonthHits}x, target ${event.targetMonthHits}x`;
        if (!onToggleBoostNumber) {
          return (
            <span
              key={`${event.boundaryLabel}-${event.number}-${event.sourceLastDrawDate}`}
              style={selected ? selectedNumberChipStyle : numberChipStyle}
              title={title}
            >
              {event.number}
            </span>
          );
        }
        return (
          <button
            key={`${event.boundaryLabel}-${event.number}-${event.sourceLastDrawDate}`}
            type="button"
            aria-pressed={selected}
            aria-label={`${selected ? "Remove" : "Add"} carry-over boost for ${event.number}`}
            onClick={() => onToggleBoostNumber(event.number)}
            style={{
              ...(selected ? selectedNumberChipStyle : numberChipStyle),
              cursor: "pointer",
            }}
            title={`${title}; ${selected ? "click to remove the explicit boost" : "click to apply a massive explicit boost"}`}
          >
            {event.number}
          </button>
        );
      })}
      <div style={{ color: "#64748b", fontSize: 11, lineHeight: 1.4 }}>
        {uniqueNumberLabel(events)}
      </div>
    </div>
  );
};

export const MonthEndCarryOverBucketsPanel: React.FC<MonthEndCarryOverBucketsPanelProps> = ({
  history,
  selectedBoostNumbers = [],
  onToggleBoostNumber,
}) => {
  const [mode, setMode] = useState<Mode>("all");
  const [excludePartialSourceMonths, setExcludePartialSourceMonths] = useState(true);
  const selectedNumberSet = useMemo(() => new Set(selectedBoostNumbers), [selectedBoostNumbers]);

  const analysis = useMemo(
    () => analyzeMonthEndCarryOverBuckets(history, {
      includeSupp: mode === "all",
      excludePartialSourceMonths,
    }),
    [excludePartialSourceMonths, history, mode],
  );

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h4 style={{ margin: 0, color: "#0f172a", fontSize: 16 }}>Month-End Carry-Over Buckets</h4>
          <div style={{ marginTop: 4, color: "#64748b", fontSize: 12, lineHeight: 1.45 }}>
            Groups numbers that appeared in the last draw of a month and the first draw of the next month by their source-month frequency bucket.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", border: "1px solid #cbd5e1", borderRadius: 6, overflow: "hidden" }}>
            <button type="button" onClick={() => setMode("mains")} style={toggleStyle(mode === "mains")}>Mains</button>
            <button type="button" onClick={() => setMode("all")} style={toggleStyle(mode === "all")}>Main + supp</button>
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#475569", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={excludePartialSourceMonths}
              onChange={(event) => setExcludePartialSourceMonths(event.target.checked)}
            />
            Exclude opening partial month
          </label>
        </div>
      </div>

      <div style={metricGridStyle}>
        <Metric label="Transitions" value={String(analysis.summary.transitions)} />
        <Metric label="Carry-over instances" value={String(analysis.summary.totalCarryOverInstances)} />
        <Metric label="Leading bucket" value={formatLeadingBuckets(analysis.summary.leadingBuckets, analysis.summary.leadingBucket)} />
        <Metric label="6x / 7x / 8x+" value={String(analysis.summary.highBucketCarryOverInstances)} />
      </div>

      {onToggleBoostNumber && selectedBoostNumbers.length > 0 && (
        <div style={{ margin: "0 0 10px", color: "#14532d", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 700 }}>
          Massive generation boost selected: {selectedBoostNumbers.slice().sort((left, right) => left - right).join(", ")}
        </div>
      )}

      <div style={tableWrapStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Source bucket</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Source observations</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Last-draw obs</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Carry-over</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Rate</th>
              <th style={thStyle}>Carry-over numbers</th>
            </tr>
          </thead>
          <tbody>
            {analysis.bucketRows.map((row) => (
              <tr key={row.bucket}>
                <td style={{ ...tdStyle, fontWeight: 800, color: "#0f172a" }}>{row.bucket}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.sourceObservations}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.lastDrawObservations}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>{row.carryOverInstances}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatPct(row.carryOverRate)}</td>
                <td style={tdStyle}>
                  <EventChips
                    events={row.carryOverNumbers}
                    selectedNumbers={selectedNumberSet}
                    onToggleBoostNumber={onToggleBoostNumber}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "#475569", fontSize: 12, lineHeight: 1.45 }}>
        {analysis.notes.map((note) => <li key={note}>{note}</li>)}
      </ul>
    </section>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={metricStyle}>
    <div style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: 0 }}>{label}</div>
    <div style={{ color: "#0f172a", fontSize: 18, fontWeight: 800, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{value}</div>
  </div>
);

const toggleStyle = (active: boolean): React.CSSProperties => ({
  padding: "6px 10px",
  border: "none",
  borderLeft: active ? "none" : "1px solid #cbd5e1",
  background: active ? "#2563eb" : "#f8fafc",
  color: active ? "#fff" : "#0f172a",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
});

export default MonthEndCarryOverBucketsPanel;

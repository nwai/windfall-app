import React, { useEffect, useMemo, useState } from "react";

import type { Draw } from "../types";
import {
  analyzeDrawBucketPatterns,
  buildDrawBucketPatternLeaderboard,
  buildDrawMonthOptions,
  DEFAULT_RECENT_DRAW_BUCKET_WINDOW,
  formatDrawMonthLabel,
  getDrawMonthKey,
  selectDrawMonthDraws,
  type DrawBucketPatternDistributionBin,
  type DrawBucketPatternLeaderboardRow,
  type DrawBucketPatternSortMode,
  type DrawBucketPatternStats,
} from "../lib/drawBucketPatterns";
import { forecastDrawBucketMonth, type BucketHitForecast } from "../lib/drawBucketMonthForecast";
import { getMostRecentDraw } from "../lib/recentDraws";

type HeatmapTone = "past" | "current";
type HeatmapAlign = "left" | "right";

interface HeatmapSlot {
  displayLabel: string;
  titleLabel: string;
  isEmpty?: boolean;
}

interface HeatmapCellData {
  hits?: number;
  isForecast?: boolean;
  forecast?: BucketHitForecast;
}

export interface DrawBucketPatternPanelProps {
  draws: Draw[];
  allDraws?: Draw[];
}

const getHeatmapCellColors = (
  hits: number,
  maxPossibleHits: number,
  tone: HeatmapTone,
): { background: string; color: string } => {
  if (hits <= 0) return { background: "#eceff1", color: "#90a4ae" };
  const intensity = hits / Math.max(1, maxPossibleHits);
  if (tone === "past") {
    if (intensity >= 0.75) return { background: "#6a1b9a", color: "#fff" };
    if (intensity >= 0.5) return { background: "#ab47bc", color: "#fff" };
    if (intensity >= 0.25) return { background: "#ce93d8", color: "#4a148c" };
    return { background: "#f3e5f5", color: "#6a1b9a" };
  }
  if (intensity >= 0.75) return { background: "#1565c0", color: "#fff" };
  if (intensity >= 0.5) return { background: "#42a5f5", color: "#0d47a1" };
  if (intensity >= 0.25) return { background: "#90caf9", color: "#0d47a1" };
  return { background: "#dbeafe", color: "#0d47a1" };
};

const formatHeatmapDate = (raw: string, fallbackIndex: number): string => {
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${String(parsed.getMonth() + 1).padStart(2, "0")}/${String(parsed.getDate()).padStart(2, "0")}`;
  }
  return `D${fallbackIndex + 1}`;
};

const buildHeatmapSlots = (drawDates: string[], totalColumns: number, emptyLabelPrefix: string): HeatmapSlot[] => {
  const slotCount = Math.max(totalColumns, drawDates.length);
  return Array.from({ length: slotCount }, (_, idx) => {
    const drawDate = drawDates[idx];
    if (drawDate) {
      return {
        displayLabel: formatHeatmapDate(drawDate, idx),
        titleLabel: drawDate,
      };
    }

    return {
      displayLabel: "—",
      titleLabel: `${emptyLabelPrefix} slot ${idx + 1}`,
      isEmpty: true,
    };
  });
};

const DistributionBars: React.FC<{
  distribution: DrawBucketPatternDistributionBin[];
}> = ({ distribution }) => {
  const maxCount = Math.max(...distribution.map((bin) => bin.count), 1);

  return (
    <div style={{ display: "grid", gap: 6 }}>
      {distribution.map((bin) => (
        <div
          key={bin.hits}
          style={{
            display: "grid",
            gridTemplateColumns: "36px minmax(0, 1fr) 96px",
            gap: 8,
            alignItems: "center",
            fontSize: 11,
          }}
          title={`${bin.hits} hit${bin.hits === 1 ? "" : "s"}: ${bin.count} draw${bin.count === 1 ? "" : "s"} (${bin.percentage.toFixed(1)}%)`}
        >
          <span style={{ color: "#555", fontVariantNumeric: "tabular-nums" }}>{bin.hits}x</span>
          <div style={{ height: 10, background: "#eef2f7", borderRadius: 999, overflow: "hidden" }}>
            <div
              style={{
                width: `${(bin.count / maxCount) * 100}%`,
                minWidth: bin.count > 0 ? 6 : 0,
                height: "100%",
                background: "linear-gradient(90deg, #90caf9 0%, #1976d2 100%)",
                borderRadius: 999,
              }}
            />
          </div>
          <span style={{ color: "#666", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {bin.count} · {bin.percentage.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
};

const RecentHitsStrip: React.FC<{
  recentHits: number[];
  maxPossibleHits: number;
}> = ({ recentHits, maxPossibleHits }) => {
  if (!recentHits.length) {
    return <span style={{ fontSize: 11, color: "#999" }}>No recent draws in window.</span>;
  }

  return (
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
      {recentHits.map((hits, idx) => (
        <span
          key={`recent-${idx}`}
          title={`Recent draw hit count: ${hits}`}
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            color: getHeatmapCellColors(hits, maxPossibleHits, "current").color,
            background: getHeatmapCellColors(hits, maxPossibleHits, "current").background,
            border: "1px solid rgba(21,101,192,0.12)",
          }}
        >
          {hits}
        </span>
      ))}
    </div>
  );
};

const HeatmapLegend: React.FC<{ tone: HeatmapTone; title: string }> = ({ tone, title }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 11, color: "#667" }}>
    <span style={{ fontWeight: 700, color: "#455a64" }}>{title}:</span>
    {[0, 1, 2, 3].map((level) => {
      const maxPossibleHits = 3;
      const hits = level;
      const colors = getHeatmapCellColors(hits, maxPossibleHits, tone);
      const label = level === 0 ? "0 hit" : level === 1 ? "Low" : level === 2 ? "Mid" : "High";
      return (
        <span key={`${tone}-${label}`} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: 4,
              background: colors.background,
              border: "1px solid rgba(21,101,192,0.14)",
              boxSizing: "border-box",
            }}
          />
          <span style={{ color: colors.color === "#fff" ? "#455a64" : colors.color }}>{label}</span>
        </span>
      );
    })}
  </div>
);

const HeatmapColumnFrame: React.FC<{
  title: string;
  titleColor: string;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ title, titleColor, subtitle, children }) => (
  <div style={{ minWidth: 0 }}>
    <div style={heatmapColumnTopBlock}>
      <div style={{ ...heatmapColumnTitle, color: titleColor }}>{title}</div>
      <div style={heatmapColumnSubtitle}>{subtitle ?? "\u00A0"}</div>
    </div>
    {children}
  </div>
);

const BucketHeatmapColumn: React.FC<{
  stats: DrawBucketPatternStats[];
}> = ({ stats }) => (
  <HeatmapColumnFrame title="Bucket" titleColor="#455a64">
    <div style={{ border: "1px solid #e7edf3", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
      <div style={heatmapBucketHeaderCell} aria-hidden="true" />
      {stats.map((stat) => (
        <div key={`bucket-label-${stat.key}`} style={heatmapBucketRowCell} title={`${stat.label}: ${stat.numbers.join(", ")}`}>
          <div style={{ fontWeight: 700, color: "#223", fontSize: 12 }}>{stat.label}</div>
          <div style={{ fontSize: 10, color: "#78909c", marginTop: 2 }}>{stat.modeHits}x mode · {stat.atLeastOneRate.toFixed(1)}% ≥1</div>
        </div>
      ))}
    </div>
  </HeatmapColumnFrame>
);

const HeatmapSection: React.FC<{
  title: string;
  subtitle: string;
  tone: HeatmapTone;
  stats: DrawBucketPatternStats[];
  slots: HeatmapSlot[];
  cellsByStatKey?: Map<string, HeatmapCellData[]>;
  align?: HeatmapAlign;
}> = ({ title, subtitle, tone, stats, slots, cellsByStatKey, align = "left" }) => {
  if (!slots.length) {
    return (
      <HeatmapColumnFrame title={title} titleColor={tone === "past" ? "#6a1b9a" : "#1565c0"} subtitle={subtitle}>
        <div style={{ border: "1px solid #e7edf3", borderRadius: 8, padding: 12, background: "#fff", fontSize: 12, color: "#999" }}>
          No draws available for this section.
        </div>
      </HeatmapColumnFrame>
    );
  }

  return (
    <HeatmapColumnFrame title={title} titleColor={tone === "past" ? "#6a1b9a" : "#1565c0"} subtitle={subtitle}>
      <div style={{ overflowX: "auto", border: "1px solid #e7edf3", borderRadius: 8, background: "#fff" }}>
        <div
          style={{
            minWidth: "100%",
            display: "flex",
            justifyContent: align === "right" ? "flex-end" : "flex-start",
          }}
        >
          <div style={{ minWidth: Math.max(slots.length * HEATMAP_CELL_SIZE, 140) }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${slots.length}, ${HEATMAP_CELL_SIZE}px)`,
              minHeight: HEATMAP_HEADER_HEIGHT,
              borderBottom: "1px solid #e7edf3",
              background: tone === "past" ? "#fcf7fd" : "#f8fbff",
            }}
          >
            {slots.map((slot, idx) => (
              <div
                key={`${tone}-head-${idx}`}
                style={{
                  ...heatmapHeaderCell,
                  background: slot.isEmpty ? (tone === "past" ? "#fdf7ff" : "#fbfdff") : undefined,
                  color: slot.isEmpty ? "#b0bec5" : heatmapHeaderCell.color,
                }}
                title={`${title} slot ${idx + 1} of ${slots.length} • ${slot.titleLabel}`}
              >
                <div style={{ transform: "rotate(-45deg)", whiteSpace: "nowrap", display: "inline-block", transformOrigin: "bottom left" }}>
                  {slot.displayLabel}
                </div>
              </div>
            ))}
          </div>
          {stats.map((stat) => (
            <div
              key={`${tone}-row-${stat.key}`}
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${slots.length}, ${HEATMAP_CELL_SIZE}px)`,
                minHeight: HEATMAP_ROW_HEIGHT,
              }}
            >
              {Array.from({ length: slots.length }, (_, idx) => {
                const cellData = cellsByStatKey?.get(stat.key)?.[idx] ?? { hits: stat.recentHits[idx] };
                const hits = cellData.hits;
                const slot = slots[idx];
                if (typeof hits !== "number") {
                  return (
                    <div
                      key={`${tone}-${stat.key}-${idx}`}
                      style={{
                        ...heatmapCell,
                        background: tone === "past" ? "#faf5ff" : "#f8fafc",
                        color: "#b0bec5",
                        borderStyle: "dashed",
                      }}
                      title={`${stat.label} • ${slot.titleLabel} • no draw yet`}
                    />
                  );
                }
                const colors = getHeatmapCellColors(hits, stat.maxPossibleHits, tone);
                const forecastTitle = cellData.isForecast && cellData.forecast
                  ? [
                      `Forecast • ${stat.label} • ${slot.titleLabel}`,
                      `Most-supported hit count: ${cellData.forecast.predictedHits}`,
                      `Expected hits: ${cellData.forecast.expectedHits.toFixed(2)}`,
                      `Support share: ${(cellData.forecast.confidence * 100).toFixed(1)}%`,
                      `Support months: ${cellData.forecast.support}`,
                      cellData.forecast.drivers.length > 0
                        ? `Drivers: ${cellData.forecast.drivers.join("; ")}`
                        : null,
                      cellData.forecast.topMatches.length > 0
                        ? `Nearest months: ${cellData.forecast.topMatches.map((match) => `${formatDrawMonthLabel(match.monthKey)} ${match.targetDate} (${match.hits} hits, d=${match.distance.toFixed(2)})`).join(" | ")}`
                        : null,
                    ].filter(Boolean).join("\n")
                  : `${stat.label} • ${slot.titleLabel} • ${hits} hit${hits === 1 ? "" : "s"}`;
                return (
                  <div
                    key={`${tone}-${stat.key}-${idx}`}
                    style={{
                      ...heatmapCell,
                      background: cellData.isForecast ? (tone === "past" ? "#f8f0fb" : "#eef6ff") : colors.background,
                      color: cellData.isForecast ? (tone === "past" ? "#6a1b9a" : "#1565c0") : colors.color,
                      borderStyle: cellData.isForecast ? "dashed" : undefined,
                      borderColor: cellData.isForecast ? (tone === "past" ? "rgba(106,27,154,0.35)" : "rgba(21,101,192,0.35)") : undefined,
                      position: "relative",
                    }}
                    title={forecastTitle}
                  >
                    {hits}
                    {cellData.isForecast && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          top: 2,
                          right: 3,
                          fontSize: 8,
                          lineHeight: 1,
                          color: tone === "past" ? "#8e24aa" : "#1976d2",
                        }}
                      >
                        F
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          </div>
        </div>
      </div>
    </HeatmapColumnFrame>
  );
};

const BucketCard: React.FC<{ stat: DrawBucketPatternStats }> = ({ stat }) => {
  return (
    <div
      style={{
        border: "1px solid #e3e7ee",
        borderRadius: 8,
        background: "#fff",
        padding: 12,
        display: "grid",
        gap: 10,
        boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 700, color: "#223", fontSize: 14 }}>{stat.label}</div>
          <div style={{ marginTop: 3, fontSize: 11, color: "#667" }}>{stat.description}</div>
          <div style={{ marginTop: 5, fontSize: 11, color: "#1565c0", fontVariantNumeric: "tabular-nums" }}>
            {stat.numbers.join(", ")}
          </div>
        </div>
        <div
          style={{
            padding: "3px 8px",
            borderRadius: 999,
            background: "#f3f7fb",
            border: "1px solid #d8e3ef",
            fontSize: 11,
            color: "#455a64",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
          title="Most common hit count per draw within the selected window"
        >
          Mode {stat.modeHits}x
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
        {[
          { label: "Avg / draw", value: stat.averageHits.toFixed(2), title: "Average bucket hits per draw" },
          { label: "≥1 hit", value: `${stat.atLeastOneRate.toFixed(1)}%`, title: "Percentage of draws with at least one hit" },
          { label: "0 hit", value: `${stat.zeroRate.toFixed(1)}%`, title: "Percentage of draws with zero hits" },
          { label: "Max seen", value: `${stat.maxObservedHits}x`, title: "Highest hit count observed in a single draw" },
        ].map((item) => (
          <div
            key={item.label}
            title={item.title}
            style={{
              background: "#fafcff",
              border: "1px solid #edf2f7",
              borderRadius: 6,
              padding: "8px 9px",
            }}
          >
            <div style={{ fontSize: 10, color: "#78909c", textTransform: "uppercase", letterSpacing: 0.3 }}>{item.label}</div>
            <div style={{ marginTop: 2, fontSize: 14, fontWeight: 700, color: "#263238", fontVariantNumeric: "tabular-nums" }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#455a64", marginBottom: 6 }}>
          Per-draw hit distribution
        </div>
        <DistributionBars distribution={stat.distribution} />
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#455a64", marginBottom: 6 }}>
          Recent draw rhythm (oldest → newest)
        </div>
        <RecentHitsStrip recentHits={stat.recentHits} maxPossibleHits={stat.maxPossibleHits} />
      </div>
    </div>
  );
};

const getPositionBadgeStyle = (position: number, compact = false): React.CSSProperties => {
  if (position === 1) {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: compact ? 34 : 46,
      padding: compact ? "2px 7px" : "4px 10px",
      borderRadius: 999,
      background: "linear-gradient(135deg, #fff8e1 0%, #ffd54f 100%)",
      border: "1px solid #fbc02d",
      color: "#6d4c00",
      fontWeight: 800,
      fontSize: compact ? 10 : 12,
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap",
    };
  }
  if (position === 2) {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: compact ? 34 : 46,
      padding: compact ? "2px 7px" : "4px 10px",
      borderRadius: 999,
      background: "linear-gradient(135deg, #f8fafc 0%, #cfd8dc 100%)",
      border: "1px solid #b0bec5",
      color: "#455a64",
      fontWeight: 800,
      fontSize: compact ? 10 : 12,
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap",
    };
  }
  if (position === 3) {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: compact ? 34 : 46,
      padding: compact ? "2px 7px" : "4px 10px",
      borderRadius: 999,
      background: "linear-gradient(135deg, #fff3e0 0%, #ffcc80 100%)",
      border: "1px solid #ffb74d",
      color: "#7a3e00",
      fontWeight: 800,
      fontSize: compact ? 10 : 12,
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap",
    };
  }
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: compact ? 34 : 46,
    padding: compact ? "2px 7px" : "4px 10px",
    borderRadius: 999,
    background: "#f5f8fb",
    border: "1px solid #d9e3ec",
    color: "#546e7a",
    fontWeight: 700,
    fontSize: compact ? 10 : 12,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  };
};

const PositionBadge: React.FC<{ position: number; compact?: boolean }> = ({ position, compact = false }) => (
  <span style={getPositionBadgeStyle(position, compact)}>#{position}</span>
);

const LeaderboardMetricCell: React.FC<{
  value: string;
  position: number;
  title: string;
}> = ({ value, position, title }) => (
  <div title={title} style={{ display: "grid", gap: 5, justifyItems: "start" }}>
    <span style={{ fontSize: 13, fontWeight: 700, color: "#263238", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    <PositionBadge position={position} compact />
  </div>
);

const BucketLeaderboardTable: React.FC<{
  rows: DrawBucketPatternLeaderboardRow[];
  currentSortLabel: string;
  recentWindowSize: number;
}> = ({ rows, currentSortLabel, recentWindowSize }) => {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div style={{ marginBottom: 14, padding: 12, border: "1px solid #e6edf5", borderRadius: 8, background: "#fbfdff" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: "#223", fontSize: 14 }}>Detailed bucket leaderboard</div>
        <span style={{ fontSize: 11, color: "#667" }}>
          Current order follows <b>{currentSortLabel}</b>. Each metric also shows that bucket&apos;s own rank position.
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 1180, borderCollapse: "separate", borderSpacing: 0, background: "#fff", border: "1px solid #e3eaf2", borderRadius: 8, overflow: "hidden" }}>
          <thead>
            <tr style={{ background: "#f7fbff" }}>
              {[
                { label: "Pos", title: "Current position under the selected sort mode" },
                { label: "Bucket", title: "Bucket label and description" },
                { label: "Numbers", title: "Numbers tracked by this bucket" },
                { label: "≥1 hit", title: "Value plus rank position for draws with at least one hit" },
                { label: "Avg / draw", title: "Value plus rank position for average hits per draw" },
                { label: `Recent avg (${recentWindowSize})`, title: "Average hits across the recent rhythm window shown in the cards" },
                { label: "Mode", title: "Most common hit count per draw, plus rank position" },
                { label: "0 hit (low)", title: "Zero-hit rate plus position, where a lower percentage ranks better" },
                { label: "Max seen", title: "Highest single-draw hit count observed, plus rank position" },
                { label: "Total hits", title: "Total hits across the active analysis window, plus rank position" },
              ].map((column) => (
                <th
                  key={column.label}
                  title={column.title}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 0.35,
                    color: "#607d8b",
                    borderBottom: "1px solid #e7edf3",
                    whiteSpace: "nowrap",
                  }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`leaderboard-${row.stat.key}`} style={{ background: row.selectedSortPosition === 1 ? "#fcfeff" : "#fff" }}>
                <td style={leaderboardCellStyle}>
                  <PositionBadge position={row.selectedSortPosition} />
                </td>
                <td style={leaderboardCellStyle}>
                  <div style={{ fontWeight: 700, color: "#223", fontSize: 13 }}>{row.stat.label}</div>
                  <div style={{ marginTop: 4, fontSize: 11, color: "#667", lineHeight: 1.4 }}>{row.stat.description}</div>
                </td>
                <td style={leaderboardCellStyle}>
                  <div style={{ fontSize: 12, color: "#1565c0", fontVariantNumeric: "tabular-nums", lineHeight: 1.5 }}>
                    {row.stat.numbers.join(", ")}
                  </div>
                </td>
                <td style={leaderboardCellStyle}>
                  <LeaderboardMetricCell
                    value={`${row.stat.atLeastOneRate.toFixed(1)}%`}
                    position={row.atLeastOnePosition}
                    title={`${row.stat.label}: ${row.stat.atLeastOneRate.toFixed(1)}% of draws had ≥1 hit • rank #${row.atLeastOnePosition}`}
                  />
                </td>
                <td style={leaderboardCellStyle}>
                  <LeaderboardMetricCell
                    value={row.stat.averageHits.toFixed(2)}
                    position={row.averageHitsPosition}
                    title={`${row.stat.label}: ${row.stat.averageHits.toFixed(2)} average hits per draw • rank #${row.averageHitsPosition}`}
                  />
                </td>
                <td style={leaderboardCellStyle}>
                  <LeaderboardMetricCell
                    value={row.recentAverageHits.toFixed(2)}
                    position={row.recentAveragePosition}
                    title={`${row.stat.label}: ${row.recentAverageHits.toFixed(2)} average hits across the recent window • rank #${row.recentAveragePosition}`}
                  />
                </td>
                <td style={leaderboardCellStyle}>
                  <LeaderboardMetricCell
                    value={`${row.stat.modeHits}x`}
                    position={row.modeHitsPosition}
                    title={`${row.stat.label}: mode ${row.stat.modeHits}x • rank #${row.modeHitsPosition}`}
                  />
                </td>
                <td style={leaderboardCellStyle}>
                  <LeaderboardMetricCell
                    value={`${row.stat.zeroRate.toFixed(1)}%`}
                    position={row.zeroRatePosition}
                    title={`${row.stat.label}: ${row.stat.zeroRate.toFixed(1)}% zero-hit draws • lower is stronger • rank #${row.zeroRatePosition}`}
                  />
                </td>
                <td style={leaderboardCellStyle}>
                  <LeaderboardMetricCell
                    value={`${row.stat.maxObservedHits}x`}
                    position={row.maxObservedHitsPosition}
                    title={`${row.stat.label}: max observed ${row.stat.maxObservedHits}x • rank #${row.maxObservedHitsPosition}`}
                  />
                </td>
                <td style={leaderboardCellStyle}>
                  <LeaderboardMetricCell
                    value={String(row.stat.totalHits)}
                    position={row.totalHitsPosition}
                    title={`${row.stat.label}: ${row.stat.totalHits} total hits • rank #${row.totalHitsPosition}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const DrawBucketPatternPanel: React.FC<DrawBucketPatternPanelProps> = ({ draws, allDraws = [] }) => {
  const [includeSupp, setIncludeSupp] = useState<boolean>(true);
  const [sortMode, setSortMode] = useState<DrawBucketPatternSortMode>("atLeastOne");
  const [selectedPastMonthKey, setSelectedPastMonthKey] = useState<string>("");
  const [showForecast, setShowForecast] = useState<boolean>(true);

  const comparisonHistory = allDraws.length > 0 ? allDraws : draws;

  const monthOptions = useMemo(
    () => buildDrawMonthOptions(comparisonHistory),
    [comparisonHistory],
  );

  const latestAllHistoryMonthKey = useMemo(() => {
    const mostRecentDraw = getMostRecentDraw(comparisonHistory);
    return mostRecentDraw ? getDrawMonthKey(mostRecentDraw.date) ?? "" : "";
  }, [comparisonHistory]);

  const pastMonthOptions = useMemo(
    () => monthOptions.filter((option) => option.key !== latestAllHistoryMonthKey),
    [monthOptions, latestAllHistoryMonthKey],
  );

  useEffect(() => {
    if (pastMonthOptions.length === 0) {
      if (selectedPastMonthKey !== "") setSelectedPastMonthKey("");
      return;
    }
    if (!pastMonthOptions.some((option) => option.key === selectedPastMonthKey)) {
      setSelectedPastMonthKey(pastMonthOptions[0].key);
    }
  }, [pastMonthOptions, selectedPastMonthKey]);

  const stats = useMemo(
    () => analyzeDrawBucketPatterns(draws, { includeSupp, recentWindowSize: DEFAULT_RECENT_DRAW_BUCKET_WINDOW }),
    [draws, includeSupp],
  );

  const currentMonthDraws = useMemo(
    () => selectDrawMonthDraws(comparisonHistory, latestAllHistoryMonthKey || null),
    [comparisonHistory, latestAllHistoryMonthKey],
  );

  const currentHeatmapStats = useMemo(
    () => analyzeDrawBucketPatterns(currentMonthDraws, { includeSupp, recentWindowSize: currentMonthDraws.length }),
    [currentMonthDraws, includeSupp],
  );

  const comparablePastDraws = useMemo(
    () => selectDrawMonthDraws(comparisonHistory, selectedPastMonthKey || null),
    [comparisonHistory, selectedPastMonthKey],
  );

  const pastHeatmapStats = useMemo(
    () => analyzeDrawBucketPatterns(comparablePastDraws, { includeSupp, recentWindowSize: comparablePastDraws.length }),
    [comparablePastDraws, includeSupp],
  );

  const currentHeatmapColumnCount = useMemo(
    () => Math.max(currentMonthDraws.length, comparablePastDraws.length),
    [currentMonthDraws.length, comparablePastDraws.length],
  );

  const currentHeatmapSlots = useMemo(
    () => buildHeatmapSlots(currentMonthDraws.map((draw) => draw.date), currentHeatmapColumnCount, "No draw yet"),
    [currentMonthDraws, currentHeatmapColumnCount],
  );

  const pastHeatmapSlots = useMemo(
    () => buildHeatmapSlots(comparablePastDraws.map((draw) => draw.date), comparablePastDraws.length, "No draw"),
    [comparablePastDraws],
  );

  const currentMonthForecast = useMemo(
    () => {
      if (!showForecast || currentHeatmapColumnCount <= currentMonthDraws.length || !latestAllHistoryMonthKey) {
        return null;
      }
      return forecastDrawBucketMonth(comparisonHistory, {
        includeSupp,
        currentMonthKey: latestAllHistoryMonthKey,
        targetSlotCount: currentHeatmapColumnCount,
      });
    },
    [showForecast, currentHeatmapColumnCount, currentMonthDraws.length, latestAllHistoryMonthKey, comparisonHistory, includeSupp],
  );

  const leaderboardRows = useMemo(
    () => buildDrawBucketPatternLeaderboard(stats, sortMode),
    [sortMode, stats],
  );

  const sortedStats = useMemo(
    () => leaderboardRows.map((row) => row.stat),
    [leaderboardRows],
  );

  const currentHeatmapStatsByKey = useMemo(
    () => new Map(currentHeatmapStats.map((stat) => [stat.key, stat])),
    [currentHeatmapStats],
  );

  const pastHeatmapStatsByKey = useMemo(
    () => new Map(pastHeatmapStats.map((stat) => [stat.key, stat])),
    [pastHeatmapStats],
  );

  const alignedCurrentHeatmapStats = useMemo(
    () => sortedStats.map((stat) => currentHeatmapStatsByKey.get(stat.key) ?? stat),
    [sortedStats, currentHeatmapStatsByKey],
  );

  const alignedPastHeatmapStats = useMemo(
    () => sortedStats.map((stat) => pastHeatmapStatsByKey.get(stat.key) ?? stat),
    [sortedStats, pastHeatmapStatsByKey],
  );

  const currentHeatmapCellsByKey = useMemo(() => {
    const map = new Map<string, HeatmapCellData[]>();
    alignedCurrentHeatmapStats.forEach((stat) => {
      const baseCells: HeatmapCellData[] = currentHeatmapSlots.map((_, idx) => (
        idx < stat.recentHits.length ? { hits: stat.recentHits[idx] } : {}
      ));

      currentMonthForecast?.slotForecasts.forEach((slotForecast) => {
        const cellIndex = slotForecast.slotIndex - 1;
        const bucketForecast = slotForecast.bucketForecasts[stat.key];
        if (cellIndex >= 0 && cellIndex < baseCells.length && bucketForecast) {
          baseCells[cellIndex] = {
            hits: bucketForecast.predictedHits,
            isForecast: true,
            forecast: bucketForecast,
          };
        }
      });

      map.set(stat.key, baseCells);
    });
    return map;
  }, [alignedCurrentHeatmapStats, currentHeatmapSlots, currentMonthForecast]);

  const strongestBucket = leaderboardRows[0]?.stat ?? null;
  const totalDraws = draws.length;
  const selectedPastMonthLabel = selectedPastMonthKey ? formatDrawMonthLabel(selectedPastMonthKey) : "None";
  const currentMonthLabel = latestAllHistoryMonthKey ? formatDrawMonthLabel(latestAllHistoryMonthKey) : "Current month";
  const currentMonthHasPendingSlots = currentHeatmapColumnCount > currentMonthDraws.length;
  const forecastedSlotCount = currentMonthForecast?.forecastSlotCount ?? 0;
  const recentWindowSize = stats[0]?.recentHits.length ?? Math.min(DEFAULT_RECENT_DRAW_BUCKET_WINDOW, draws.length);
  const currentSortLabel = sortMode === "atLeastOne"
    ? "≥1 hit rate"
    : sortMode === "averageHits"
      ? "Average hits"
      : sortMode === "modeHits"
        ? "Mode hits"
        : "Label";

  return (
    <section
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        background: "#fff",
        padding: 12,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: "#667", marginTop: 2 }}>
            Shows how often each bucket appears per draw inside the active WFMQYH window.
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "#444" }} title="Compare main-only versus main+supp draw composition">
            <input
              type="checkbox"
              checked={includeSupp}
              onChange={(e) => setIncludeSupp(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Include supp (main + supp)
          </label>
          <label style={{ fontSize: 12, color: "#444" }}>
            Sort by:
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as DrawBucketPatternSortMode)}
              style={{ marginLeft: 6, fontSize: 12 }}
            >
              <option value="atLeastOne">≥1 hit rate</option>
              <option value="averageHits">Average hits</option>
              <option value="modeHits">Mode hits</option>
              <option value="label">Label</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: "#444" }} title="Choose a historical month to compare against the current month heatmap">
            Compare month:
            <select
              value={selectedPastMonthKey}
              onChange={(e) => setSelectedPastMonthKey(e.target.value)}
              style={{ marginLeft: 6, fontSize: 12 }}
              disabled={pastMonthOptions.length === 0}
            >
              {pastMonthOptions.length === 0 ? (
                <option value="">No prior month</option>
              ) : (
                pastMonthOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label} ({option.drawCount})
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12, fontSize: 12 }}>
        <span style={summaryChip}>
          Window: <b>{totalDraws}</b> draw{totalDraws === 1 ? "" : "s"}
        </span>
        <span style={summaryChip}>
          Pool: <b>{includeSupp ? "main + supp" : "main only"}</b>
        </span>
        {strongestBucket && (
          <span style={summaryChip} title="Current top-ranked bucket under the selected sort mode">
            Highlight: <b>{strongestBucket.label}</b> ({strongestBucket.atLeastOneRate.toFixed(1)}% with ≥1 hit)
          </span>
        )}
        <span style={summaryChip} title="The Past heatmap now shows every draw from the selected comparison month.">
          Past compare: <b>{selectedPastMonthLabel}</b> ({comparablePastDraws.length} draw{comparablePastDraws.length === 1 ? "" : "s"})
        </span>
        <span style={summaryChip} title="The Current heatmap shows the current month and keeps any remaining side-by-side month slots visibly empty.">
          Current month: <b>{currentMonthLabel}</b> ({currentMonthDraws.length}/{currentHeatmapColumnCount} slot{currentHeatmapColumnCount === 1 ? "" : "s"} filled)
        </span>
        <span style={summaryChip} title="Forecast cells fill blank current-month slots using month-summary, overlap, ending-sequence, and 1-digit/2-digit signals from historical months.">
          Forecast: <b>{showForecast ? `${forecastedSlotCount} slot${forecastedSlotCount === 1 ? "" : "s"}` : "off"}</b>
        </span>
      </div>
      {currentMonthForecast?.warnings.length ? (
        <div style={{ marginBottom: 12, fontSize: 12, color: "#6b4a00", background: "#fff9e8", border: "1px solid #e2b84f", borderRadius: 6, padding: "7px 9px" }}>
          {currentMonthForecast.warnings.join(" ")}
        </div>
      ) : null}

      <div style={{ fontSize: 12, color: "#556", marginBottom: 12, lineHeight: 1.45 }}>
        Look for buckets whose distributions bunch up around a particular hit count. For example, if the
        <b> Divisible by 5</b> card peaks at <b>1x</b>, those draws most often contain exactly one number divisible by 5.
        A high <b>≥1 hit</b> rate means the bucket appears in most draws; a low <b>0 hit</b> rate means it is rarely absent.
      </div>

      <BucketLeaderboardTable
        rows={leaderboardRows}
        currentSortLabel={currentSortLabel}
        recentWindowSize={recentWindowSize}
      />

      {sortedStats.length > 0 && (
        <div style={{ marginBottom: 14, padding: 12, border: "1px solid #e6edf5", borderRadius: 8, background: "#fbfdff" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, color: "#223", fontSize: 14 }}>Draw month comparison heatmap</div>
            <span style={{ fontSize: 11, color: "#667" }}>
              Past shows the full selected month; Current shows the current month with empty future slots when needed.
            </span>
            <label style={{ fontSize: 11, color: "#455a64", display: "inline-flex", alignItems: "center", gap: 6 }} title="Predict blank current-month slots from historical month progress using monthly summary, overlap, ending sequence, and digit-width signals.">
              <input
                type="checkbox"
                checked={showForecast}
                onChange={(e) => setShowForecast(e.target.checked)}
              />
              Forecast blank current slots
            </label>
            <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 14 }}>
              <HeatmapLegend tone="past" title="Past" />
              <HeatmapLegend tone="current" title="Current" />
              <span style={{ fontSize: 11, color: "#667", display: "inline-flex", alignItems: "center", gap: 5 }} title="Forecast cells are modelled from historical month progress, not observed draws.">
                <span style={{ width: 14, height: 14, borderRadius: 4, background: "#eef6ff", border: "1px dashed rgba(21,101,192,0.35)", boxSizing: "border-box", position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#1976d2", fontSize: 8, fontWeight: 700 }}>F</span>
                Forecast
              </span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#667", marginBottom: 10, lineHeight: 1.45 }}>
            <b>Past</b> shows every draw from <b>{selectedPastMonthLabel}</b>. <b>Current</b> shows <b>{currentMonthLabel}</b> and {showForecast ? "models" : "leaves"} later month slots when the comparison month has more draws than the current month so far.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "136px minmax(0, 1fr) 10px minmax(0, 1fr)", gap: 10, alignItems: "start" }}>
            <BucketHeatmapColumn stats={sortedStats} />
            <HeatmapSection
              title={`← Past · ${selectedPastMonthLabel}`}
              subtitle={selectedPastMonthKey
                ? `Showing all ${comparablePastDraws.length} draw${comparablePastDraws.length === 1 ? "" : "s"} from ${selectedPastMonthLabel}.`
                : "Choose a comparison month."}
              tone="past"
              stats={alignedPastHeatmapStats}
              slots={pastHeatmapSlots}
              align="right"
            />
            <div
              aria-hidden="true"
              style={{
                alignSelf: "stretch",
                borderRadius: 999,
                background: "linear-gradient(180deg, rgba(106,27,154,0.10) 0%, rgba(148,163,184,0.30) 50%, rgba(21,101,192,0.10) 100%)",
                border: "1px solid rgba(148,163,184,0.18)",
              }}
            />
            <HeatmapSection
              title={`Current · ${currentMonthLabel} →`}
              subtitle={currentMonthHasPendingSlots
                ? `Showing ${currentMonthDraws.length} current draw${currentMonthDraws.length === 1 ? "" : "s"} plus ${currentHeatmapColumnCount - currentMonthDraws.length} future slot${currentHeatmapColumnCount - currentMonthDraws.length === 1 ? "" : "s"}${showForecast ? " forecasted from historical month progress" : " left empty"}.`
                : `Showing all ${currentMonthDraws.length} draw${currentMonthDraws.length === 1 ? "" : "s"} from ${currentMonthLabel}.`}
              tone="current"
              stats={alignedCurrentHeatmapStats}
              slots={currentHeatmapSlots}
              cellsByStatKey={currentHeatmapCellsByKey}
              align="left"
            />
          </div>
        </div>
      )}

      {sortedStats.length === 0 ? (
        <div style={{ fontSize: 12, color: "#999" }}>No draws available for bucket analysis.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
          {sortedStats.map((stat) => (
            <BucketCard key={stat.key} stat={stat} />
          ))}
        </div>
      )}
    </section>
  );
};

const summaryChip: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 999,
  background: "#f5f8fb",
  border: "1px solid #dde6ef",
  color: "#455a64",
};

const leaderboardCellStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #eef2f6",
  verticalAlign: "top",
};

const heatmapColumnTopBlock: React.CSSProperties = {
  minHeight: 40,
  marginBottom: 8,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
};

const heatmapColumnTitle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 13,
  lineHeight: 1.2,
};

const heatmapColumnSubtitle: React.CSSProperties = {
  fontSize: 11,
  color: "#667",
  lineHeight: 1.2,
  minHeight: 13,
  marginTop: 2,
};

const HEATMAP_CELL_SIZE = 28;
const HEATMAP_HEADER_HEIGHT = 64;
const HEATMAP_ROW_HEIGHT = 52;

const heatmapBucketHeaderCell: React.CSSProperties = {
  height: HEATMAP_HEADER_HEIGHT,
  padding: "8px 10px",
  textAlign: "left",
  borderBottom: "1px solid #e7edf3",
  color: "#455a64",
  background: "#f8fbff",
  fontSize: 12,
  fontWeight: 700,
  display: "flex",
  alignItems: "flex-end",
  boxSizing: "border-box",
};

const heatmapHeaderCell: React.CSSProperties = {
  minWidth: HEATMAP_CELL_SIZE,
  width: HEATMAP_CELL_SIZE,
  height: HEATMAP_HEADER_HEIGHT,
  padding: "6px 4px",
  textAlign: "center",
  verticalAlign: "bottom",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  color: "#607d8b",
  fontSize: 10,
  fontWeight: 700,
  boxSizing: "border-box",
};

const heatmapBucketRowCell: React.CSSProperties = {
  height: HEATMAP_ROW_HEIGHT,
  padding: "8px 10px",
  borderBottom: "1px solid #eef2f6",
  background: "#fff",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  boxSizing: "border-box",
};

const heatmapCell: React.CSSProperties = {
  width: HEATMAP_CELL_SIZE,
  minWidth: HEATMAP_CELL_SIZE,
  height: HEATMAP_ROW_HEIGHT,
  textAlign: "center",
  verticalAlign: "middle",
  fontSize: 11,
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  borderBottom: "1px solid #f1f5f9",
  borderRight: "1px solid #f1f5f9",
  boxSizing: "border-box",
};

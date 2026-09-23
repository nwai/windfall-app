import React from "react";

type Props = {
  labels: string[];
  counts: number[];
  total: number;
  colors?: string[]; // optional palette; if omitted, fallback to a default
  sticky?: boolean;  // optional: stick to top of its scroll context
  hiddenIndexes?: readonly number[];
  onToggleIndex?: (index: number) => void;
  onShowAll?: () => void;
  filterHint?: string;
};

export function normalizeHeatmapLegendHiddenIndexes(
  hiddenIndexes: readonly number[] | undefined,
  bucketCount: number,
): number[] {
  if (bucketCount <= 1) return [];
  const valid = Array.from(new Set((hiddenIndexes ?? []).filter((index) => (
    Number.isInteger(index) && index >= 0 && index < bucketCount
  )))).sort((left, right) => left - right);
  return valid.length >= bucketCount ? valid.slice(0, bucketCount - 1) : valid;
}

export function toggleHeatmapLegendHiddenIndex(
  hiddenIndexes: readonly number[] | undefined,
  index: number,
  bucketCount: number,
): number[] {
  const current = normalizeHeatmapLegendHiddenIndexes(hiddenIndexes, bucketCount);
  if (!Number.isInteger(index) || index < 0 || index >= bucketCount) return current;
  const currentSet = new Set(current);
  if (currentSet.has(index)) {
    currentSet.delete(index);
    return Array.from(currentSet).sort((left, right) => left - right);
  }
  if (currentSet.size >= bucketCount - 1) return current;
  currentSet.add(index);
  return Array.from(currentSet).sort((left, right) => left - right);
}

export const HeatmapLegendBar: React.FC<Props> = ({
  labels,
  counts,
  total,
  colors,
  sticky = false,
  hiddenIndexes,
  onToggleIndex,
  onShowAll,
  filterHint,
}) => {
  const defaultColors = [
  "#0b1020", // prehistoric
  "#3a3a3a", // frozen
  "#244963", // permafrost
  "#2c75a0", // cold
  "#3ca0c7", // cool
  "#66c2a5", // temperate
  "#a6d854", // warm
  "#fdd835", // hot
  "#fb8c00", // tropical
  "#e53935", // volcanic
  ];
  const palette = colors && colors.length === labels.length ? colors : defaultColors;
  const hidden = normalizeHeatmapLegendHiddenIndexes(hiddenIndexes, labels.length);
  const hiddenSet = new Set(hidden);
  const isInteractive = Boolean(onToggleIndex);
  const visibleCount = Math.max(0, labels.length - hidden.length);

  const barStyle: React.CSSProperties = {
    position: sticky ? "sticky" : "static",
    top: sticky ? 0 : undefined,
    zIndex: sticky ? 2 : undefined,
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 6,
    padding: "6px 10px",
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
    fontSize: 12,
  };

  return (
    <div style={barStyle}>
      {isInteractive && (
        <span style={{ color: "#475569", fontWeight: 800 }}>
          {filterHint ?? "Click legend bands to hide/show cells."}
        </span>
      )}
      {labels.map((label, i) => {
        const c = counts[i] ?? 0;
        const pct = total > 0 ? ((c / total) * 100).toFixed(2) : "0.00";
        const isHidden = hiddenSet.has(i);
        const wouldHideLastVisible = !isHidden && visibleCount <= 1;
        const itemTitle = isInteractive
          ? isHidden
            ? `Show ${label} cells`
            : wouldHideLastVisible
              ? "At least one temperature band must remain visible."
              : `Hide ${label} cells`
          : label;
        const itemContent = (
          <>
            <span
              aria-hidden
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                background: palette[i] || "#ccc",
                border: "1px solid rgba(0,0,0,0.08)",
                display: "inline-block",
                boxShadow: isHidden ? "inset 0 0 0 2px rgba(255,255,255,0.78)" : undefined,
              }}
            />
            <span>
              {label} ({c} • {pct}%){isHidden ? " · hidden" : ""}
            </span>
          </>
        );
        if (isInteractive) {
          return (
            <button
              key={label}
              type="button"
              aria-pressed={isHidden}
              disabled={wouldHideLastVisible}
              onClick={() => onToggleIndex?.(i)}
              style={{
                minHeight: 32,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: isHidden ? "1px solid #94a3b8" : "1px solid #e2e8f0",
                borderRadius: 999,
                background: isHidden ? "#f8fafc" : "#fff",
                color: isHidden ? "#64748b" : "#1e293b",
                opacity: wouldHideLastVisible ? 0.48 : 1,
                padding: "4px 8px",
                cursor: wouldHideLastVisible ? "not-allowed" : "pointer",
                textDecoration: isHidden ? "line-through" : "none",
                font: "inherit",
              }}
              title={itemTitle}
            >
              {itemContent}
            </button>
          );
        }
        return (
          <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }} title={itemTitle}>
            {itemContent}
          </span>
        );
      })}
      {isInteractive && hidden.length > 0 && (
        <button
          type="button"
          onClick={onShowAll}
          style={{
            minHeight: 32,
            border: "1px solid #cbd5e1",
            borderRadius: 999,
            background: "#f8fafc",
            color: "#0f172a",
            fontWeight: 900,
            padding: "4px 10px",
            cursor: "pointer",
          }}
          title="Restore all temperature bands"
        >
          Show all
        </button>
      )}
      {isInteractive && visibleCount <= 1 && (
        <span style={{ color: "#b45309", fontWeight: 800 }}>
          One band must remain visible.
        </span>
      )}
    </div>
  );
};

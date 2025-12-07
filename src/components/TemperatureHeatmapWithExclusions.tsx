import React from "react";
import { TemperatureHeatmap } from "./TemperatureHeatmap";

type HeatmapProps = React.ComponentProps<typeof TemperatureHeatmap>;

export function TemperatureHeatmapWithExclusions(
  props: HeatmapProps & {
    excludedNumbers: number[];
    setExcludedNumbers: (updater: (prev: number[]) => number[]) => void;
    focusNumber?: number | null;

    // Optional: add a tiny vertical nudge if your heatmap draws any top inset
    topOffsetPx?: number; // default 0

    // Optional: show a label ABOVE the heatmap (doesn't affect alignment)
    showHeader?: boolean;  // default false
    headerLabel?: string;  // default "Exclude"
  }
) {
  const {
    excludedNumbers,
    setExcludedNumbers,
    focusNumber = null,
    cellSize = 14, // keep aligned to the heatmap’s row height
    topOffsetPx = 10,
    showHeader = false,
    headerLabel = "Exclude",
    ...heatmapProps
  } = props;

  const rowHeight = cellSize;

  return (
    <div>
      {/* Optional header ABOVE (does not push rows down) */}
      {showHeader && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#555",
              background: "#fafafa",
              border: "1px solid #eee",
              borderRadius: 6,
              padding: "6px 15px 4px 2px",
            }}
          >
            {headerLabel}
          </div>
        </div>
      )}

      {/* Heatmap + vertical exclude column */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginRight: 10 }}>
        {/* Left: the original heatmap */}
        <div style={{ flex: "1 1 auto" }}>
          <TemperatureHeatmap cellSize={cellSize} {...heatmapProps} />
        </div>

        {/* Right: vertical exclusion checkboxes aligned exactly to rows */}
        <div
          style={{
            flex: "0 0 84px",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            marginTop: topOffsetPx, // nudge if your heatmap has a top inset
          }}
        >
          {/* No header inside this column so rows start at the same Y as the heatmap */}
          {Array.from({ length: 45 }, (_, i) => {
            const n = i + 1; // If your heatmap is flipped, use const n = 45 - i;
            const checked = excludedNumbers.includes(n);
            const isFocused = focusNumber === n;

            return (
              <label
                key={n}
                title={`Exclude ${n}`}
                style={{
                  height: rowHeight,
                  display: "flex",
                  alignItems: "left",
                  justifyContent: "left",
                  gap: 6,
                  borderRadius: 4,
                  background: isFocused ? "#FFF9C4" : "transparent",
                  cursor: "pointer",
                  userSelect: "none",
                }}
                onMouseDown={(e) => e.preventDefault()} // prevent selection while toggling
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setExcludedNumbers((prev) =>
                      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
                    )
                  }
                />
                <span style={{ fontSize: 11, color: "#333", minWidth: 20, textAlign: "left" }}>
                  {n}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

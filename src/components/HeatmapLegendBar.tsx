import React from "react";

type Props = {
  labels: string[];
  counts: number[];
  total: number;
  colors?: string[]; // optional palette; if omitted, fallback to a default
  sticky?: boolean;  // optional: stick to top of its scroll context
};

export const HeatmapLegendBar: React.FC<Props> = ({
  labels,
  counts,
  total,
  colors,
  sticky = false,
}) => {
  const defaultColors = [
    "#0b1020", // prehistoric
    "#1b2733", // frozen
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
      {labels.map((label, i) => {
        const c = counts[i] ?? 0;
        const pct = total > 0 ? ((c / total) * 100).toFixed(1) : "0.0";
        return (
          <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              aria-hidden
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                background: palette[i] || "#ccc",
                border: "1px solid rgba(0,0,0,0.08)",
                display: "inline-block",
              }}
              title={label}
            />
            <span>
              {label} ({c} • {pct}%)
            </span>
          </span>
        );
      })}
    </div>
  );
};
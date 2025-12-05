import React, { useMemo } from "react";
import type { Draw } from "../types";

export type NumberTrend = {
  number: number;   // 1..45
  // New short windows
  d3: number;       // last 3 draws
  d9: number;       // last 9 draws
  d15: number;      // last 15 draws
  // Existing windows (now measured in draws)
  fortnight: number; // 6 draws
  month: number;     // 12 draws
  quarter: number;   // 36 draws
  year: number;      // 156 draws
  all: number;       // all draws in the provided history
};

export function NumberTrendsTable({
  trends,
  onToggle,
  selected,
  // New optional props to support usage in App.tsx
  history,
  excludedNumbers,
  trendSelectedNumbers,
  onExcludeToggle,
  onTrendSelectToggle,
  onTrace,
}: {
  trends?: NumberTrend[];
  onToggle?: (n: number) => void;
  selected?: number[];
  // New optional props
  history?: Draw[];
  excludedNumbers?: number[];
  trendSelectedNumbers?: number[];
  onExcludeToggle?: (n: number) => void;
  onTrendSelectToggle?: (n: number) => void;
  onTrace?: (line: string) => void;
}) {
  // Compute trends from history if provided and no trends passed
  const computedTrends: NumberTrend[] = useMemo(() => {
    if (!history || !history.length) return trends || [];
    const counts = (windowSize: number): number[] => {
      const arr = Array(46).fill(0) as number[];
      const window = history.slice(-windowSize);
      for (const d of window) {
        for (const n of [...d.main, ...d.supp]) arr[n] += 1;
      }
      return arr;
    };
    const allCounts = (() => {
      const arr = Array(46).fill(0) as number[];
      for (const d of history) for (const n of [...d.main, ...d.supp]) arr[n] += 1;
      return arr;
    })();
    const d3 = counts(3);
    const d9 = counts(9);
    const d15 = counts(15);
    const d6 = counts(6); // fortnight
    const d12 = counts(12); // month
    const d36 = counts(36); // quarter
    const d156 = counts(156); // year
    const res: NumberTrend[] = Array.from({ length: 45 }, (_, i) => i + 1).map((n) => ({
      number: n,
      d3: d3[n] || 0,
      d9: d9[n] || 0,
      d15: d15[n] || 0,
      fortnight: d6[n] || 0,
      month: d12[n] || 0,
      quarter: d36[n] || 0,
      year: d156[n] || 0,
      all: allCounts[n] || 0,
    }));
    // Simple sort by month desc then number asc to keep table stable
    return res.sort((a, b) => b.month - a.month || a.number - b.number);
  }, [history, trends]);

  const activeSelected = trendSelectedNumbers || selected || [];

  // 3-column layout
  const columns = 3;
  const rowsPerCol = Math.ceil((computedTrends.length) / columns);
  const cols = Array.from({ length: columns }, (_, i) =>
    computedTrends.slice(i * rowsPerCol, (i + 1) * rowsPerCol)
  );

  // Data for chart (only selected numbers)
  const selectedSeries = useMemo(() => {
    const pick = new Map<number, NumberTrend>();
    computedTrends.forEach((t) => {
      if (activeSelected.includes(t.number)) pick.set(t.number, t);
    });
    return Array.from(pick.values()).map((t) => ({
      number: t.number,
      values: [t.d3, t.month, t.d9, t.d15, t.fortnight, t.quarter, t.year, t.all],
    }));
  }, [computedTrends, activeSelected]);

  // Helpers for Δ column: use 3→12
  const colorForNumber = (n: number) => `hsl(${(n * 23) % 360}, 70%, 45%)`;
  const shortTermDeltaPP = (t: NumberTrend) => {
    const r3 = t.d3 / 3;
    const r12 = t.month / 12;
    const delta = r3 - r12;
    const deltaPP = delta * 100;
    const THRESH = 0.055;
    const dir: "up" | "down" | "flat" =
      delta > THRESH ? "up" : delta < -THRESH ? "down" : "flat";
    return { r3, r12, deltaPP, dir };
  };

  const Arrow = ({
    dir,
    color,
    sizePx = 18,
  }: {
    dir: "up" | "down" | "flat";
    color: string;
    sizePx?: number;
  }) => {
    const sym = dir === "up" ? "↑" : dir === "down" ? "↓" : "→";
    const c = dir === "flat" ? "#666" : color;
    const opacity = dir === "flat" ? 0.55 : 1;
    return (
      <span
        style={{
          color: c,
          opacity,
          fontWeight: 900,
          fontSize: sizePx,
          display: "inline-block",
          width: sizePx + 2,
          textAlign: "center",
          lineHeight: 1,
          verticalAlign: "middle",
        }}
        aria-hidden
      >
        {sym}
      </span>
    );
  };

  const handleToggle = (n: number) => {
    // Prefer new callbacks; fall back to legacy onToggle
    if (onTrendSelectToggle) onTrendSelectToggle(n);
    else onToggle?.(n);
    onTrace?.(`[NumberTrendsTable] toggled ${n}`);
  };

  return (
    <div style={{ margin: "12px 0" }}>
      {/* 3-column tables */}
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        {cols.map((col, colIdx) => (
          <table
            key={colIdx}
            style={{
              fontSize: 13,
              borderCollapse: "collapse",
              minWidth: 540,
              background: "#fff",
              border: "1px solid #eee",
            }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>#</th>
                {/* New short windows */}
                <th style={{ textAlign: "right", padding: "4px 8px" }}>3D</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>6D</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>9D</th>
                {/* Existing windows */}
                <th style={{ textAlign: "right", padding: "4px 8px" }}>12D</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>15D</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>36D</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>156D</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>All</th>
                <th style={{ textAlign: "center", padding: "4px 8px", whiteSpace: "nowrap" }}>
                  Δ 3→12(pp)
                </th>
              </tr>
            </thead>
            <tbody>
              {col.map((trend) => {
                const isSelected = activeSelected.includes(trend.number);
                const { r3, r12, deltaPP, dir } = shortTermDeltaPP(trend);
                const clr = colorForNumber(trend.number);
                const tooltip = `#${trend.number} short-term rate: 3D ${(r3 * 100).toFixed(1)}% vs 12D ${(r12 * 100).toFixed(1)}% • Δ ${deltaPP.toFixed(1)} pp (${dir})`;

                return (
                  <tr
                    key={trend.number}
                    style={{
                      background: isSelected ? "#FFEBEE" : undefined,
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                    onClick={() => handleToggle(trend.number)}
                    title="Click to (de)select number for forced inclusion"
                  >
                    <td style={{ padding: "2px 8px" }}>
                      <b>{trend.number}</b>
                      {isSelected && <span style={{ color: "#c62828", fontWeight: 900 }}> ●</span>}
                    </td>
                    {/* New short windows */}
                    <td style={{ textAlign: "right", padding: "2px 8px" }}>{trend.d3}</td>
                    {/* Existing windows */}
                    <td style={{ textAlign: "right", padding: "2px 8px" }}>{trend.fortnight}</td> {/* 6D */}
                    <td style={{ textAlign: "right", padding: "2px 8px" }}>{trend.d9}</td>
                    <td style={{ textAlign: "right", padding: "2px 8px" }}>{trend.month}</td>     {/* 12D */}

                    <td style={{ textAlign: "right", padding: "2px 8px" }}>{trend.d15}</td>
                    <td style={{ textAlign: "right", padding: "2px 8px" }}>{trend.quarter}</td>   {/* 36D */}
                    <td style={{ textAlign: "right", padding: "2px 8px" }}>{trend.year}</td>      {/* 156D */}
                    <td style={{ textAlign: "right", padding: "2px 8px" }}>{trend.all}</td>

                    {/* New Δ column (3→12) */}
                    <td
                      style={{
                        textAlign: "center",
                        padding: "2px 8px",
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                      }}
                      title={tooltip}
                    >
                      <Arrow dir={dir} color={clr} sizePx={18} />
                      <span style={{ marginLeft: 6, color: dir === "flat" ? "#444" : clr }}>
                        {deltaPP >= 0 ? "+" : ""}
                        {deltaPP.toFixed(1)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      </div>

      {/* Mini chart with slope arrows */}
      <div style={{ marginTop: 18 }}>
        <TrendMiniChart series={selectedSeries} />
      </div>

      {/* Optional legend for the new column */}
      <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
        Δ 3→12 (pp) = (3D count / 3) − (12D count / 12). Positive = heating; negative = cooling.
      </div>
    </div>
  );
}

function TrendMiniChart({
  series,
  width = 1000,
  height = 260,
}: {
  series: { number: number; values: number[] }[];
  width?: number;
  height?: number;
}) {
  // Empty state
  if (!series || series.length === 0) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px dashed #ddd",
          borderRadius: 8,
          color: "#888",
          fontSize: 13,
          background: "#fafafa",
        }}
      >
        Select numbers above to visualize their trend over time…
      </div>
    );
  }

  // Labels aligned with selectedSeries order
  const labels = ["3D", "6D", "9D", "12D", "15D", "36D", "156D", "All"];
  const margin = { top: 12, right: 16, bottom: 32, left: 12 };
  const innerW = Math.max(1, width - margin.left - margin.right);
  const innerH = Math.max(1, height - margin.top - margin.bottom);
  const xStep = innerW / (labels.length - 1);

  // Y scale
  let yMax = 0;
  series.forEach((s) => s.values.forEach((v) => (yMax = Math.max(yMax, v))));
  if (yMax <= 0) yMax = 1;

  const xToPx = (i: number) => margin.left + xStep * i;
  const yToPx = (v: number) => margin.top + innerH * (1 - v / yMax);

  const colorForNumber = (n: number) => `hsl(${(n * 23) % 360}, 70%, 45%)`;
  const buildPath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"} ${xToPx(i)} ${yToPx(v)}`).join(" ");

  // Threshold for Δ 3→12 in pp per draw
  const THRESH = 0.055;

  // Arrow utility with tooltip
  const arrowShape = (
    x: number,
    y: number,
    dir: "up" | "down" | "flat",
    color: string,
    size: number,
    tooltip: string
  ) => {
    if (dir === "flat") {
      return (
        <circle cx={x} cy={y} r={3} fill={color} fillOpacity={0.5} stroke="#fff" strokeWidth={1}>
          <title>{tooltip}</title>
        </circle>
      );
    }
    const points =
      dir === "up"
        ? `${x},${y - size} ${x - size * 0.6},${y + size * 0.6} ${x + size * 0.6},${y + size * 0.6}`
        : `${x},${y + size} ${x - size * 0.6},${y - size * 0.6} ${x + size * 0.6},${y - size * 0.6}`;
    return (
      <polygon points={points} fill={color} fillOpacity={0.85} stroke="#fff" strokeWidth={1}>
        <title>{tooltip}</title>
      </polygon>
    );
  };

  // Place arrows near the 3D point
  const arrowXBase = xToPx(0);
  const arrowX = Math.max(margin.left + 10, arrowXBase - 12);
  const arrowXAlt = Math.min(margin.left + innerW - 10, arrowXBase + 12);

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label="Number trend lines for selected numbers"
      style={{ display: "block", background: "#fff", border: "1px solid #eee", borderRadius: 8 }}
    >
      {/* X axis */}
      <line x1={margin.left} y1={margin.top + innerH} x2={margin.left + innerW} y2={margin.top + innerH} stroke="#ccc" />
      {labels.map((label, i) => (
        <g key={label}>
          <line x1={xToPx(i)} y1={margin.top + innerH} x2={xToPx(i)} y2={margin.top + innerH + 6} stroke="#ccc" />
          <text x={xToPx(i)} y={margin.top + innerH + 20} textAnchor="middle" fontSize={12} fill="#666">
            {label}
          </text>
        </g>
      ))}
      {[0.25, 0.5, 0.75].map((p) => (
        <line key={p} x1={margin.left} x2={margin.left + innerW} y1={margin.top + innerH * (1 - p)} y2={margin.top + innerH * (1 - p)} stroke="#f0f0f0" />
      ))}

      {/* Series lines */}
      {series.map((s) => (
        <path key={s.number} d={buildPath(s.values)} fill="none" stroke={colorForNumber(s.number)} strokeWidth={2} />
      ))}
      {/* Points */}
      {series.map((s) =>
        s.values.map((v, i) => (
          <circle key={`${s.number}-${i}`} cx={xToPx(i)} cy={yToPx(v)} r={3} fill="#fff" stroke={colorForNumber(s.number)} strokeWidth={2} />
        ))
      )}

      {/* Short-term slope arrows (rates: 3D/3 vs 12D/12) */}
      {series.map((s) => {
        const c = colorForNumber(s.number);
        const v3 = s.values[0];   // first label is 3D
        const v12 = s.values[1];  // second label is 12D
        const r3 = v3 / 3;
        const r12 = v12 / 12;
        const delta = r3 - r12;
        const dir: "up" | "down" | "flat" = delta > THRESH ? "up" : delta < -THRESH ? "down" : "flat";
        const size = 8 + Math.min(6, Math.abs(delta) * 100); // scale with pp magnitude, capped
        const x = arrowX === arrowXBase - 12 ? arrowX : arrowXAlt;
        const y = yToPx(v3);
        const tooltip = `#${s.number} short-term rate: 3D ${(r3 * 100).toFixed(1)}% vs 12D ${(r12 * 100).toFixed(1)}% • Δ ${(delta * 100).toFixed(1)} pp (${dir})`;

        return (
          <g key={`arrow-${s.number}`}>
            {arrowShape(x, y, dir, c, size, tooltip)}
          </g>
        );
      })}

      <text x={margin.left + innerW} y={margin.top + 12} textAnchor="end" fontSize={11} fill="#888">
        Short-term slope arrows at 3D (rates)
      </text>
    </svg>
  );
}

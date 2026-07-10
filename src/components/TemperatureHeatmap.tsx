import React, { useEffect, useMemo, useRef, useState } from "react";
import { Draw } from "../types";
import { DGA_CELL_SIZE } from "../constants/ui";
import { computeDroughtHazard } from "../lib/droughtHazard";
import { getHeatmapColumnOpacity, normalizeHeatmapContextWindow } from "../lib/heatmapContextWindow";
import { parseDrawDateToEpoch, sortDrawsChronologically } from "../lib/recentDraws";

export interface TemperatureHeatmapProps {
  history: Draw[];
  displayHistory?: Draw[];
  alpha?: number;
  cellSize?: number;
  gutter?: number;
  showLegend?: boolean;
  heightNumbers?: number;

  metric?: "ema" | "recency" | "hybrid" | "x-only";
  buckets?: number;
  bucketLabels?: string[];
  bucketStops?: number[];
  bucketAssignments?: number[];
  bucketIndexSeries?: number[][];
  bucketColors?: string[];         // NEW
  onHoverNumber?: (n: number | null) => void;
  showLegendCounts?: boolean;
  hazardHistory?: Draw[];

  activeWindowStart?: number;
  activeWindowEnd?: number;
  dimmedWindowOpacity?: number;
  highlightedColumns?: number[];

  hybridWeight?: number; // for hybrid
  emaNormalize?: "global" | "per-number";
  enforcePeaks?: boolean;

  // Unified hover + overlay
  showHoverProbability?: boolean; // default true
  overlayNumbers?: number[]; // rows (1..45) to mark with white dots near right edge

  // Letter overlay
  showBucketLetters?: boolean;
  bucketLetters?: string[];

  // Draw slot x-axis overlay
  showDrawSlotAxis?: boolean;
}

// Helpers
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
function getContrastTextColor(bgHex: string): string {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return "#000";
  const yiq = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return yiq >= 140 ? "#000" : "#fff";
}

const DEFAULT_BUCKET_LABELS = [
  "prehistoric","frozen","permafrost","cold","cool",
  "temperate","warm","hot","tropical","volcanic",
];
const DEFAULT_BUCKET_COLORS = [
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
const DEFAULT_BUCKET_LETTERS = ["pR","F","pF","<C","C>","tT","W","H","tR","V"];
const DRAW_SLOT_COLUMN_BORDER_COLOR = "rgba(226,232,240,0.86)";

const monthLabelForDraw = (draw: Draw): string => {
  const date = new Date(parseDrawDateToEpoch(draw.date));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

export const buildDrawSlotAxisLabels = (draws: Draw[]): string[] => {
  const monthCounts = new Map<string, number>();
  return sortDrawsChronologically(draws).map((draw) => {
    const monthLabel = monthLabelForDraw(draw);
    const nextCount = (monthCounts.get(monthLabel) ?? 0) + 1;
    monthCounts.set(monthLabel, nextCount);
    return String(nextCount);
  });
};

export const TemperatureHeatmap: React.FC<TemperatureHeatmapProps> = ({
  history,
  displayHistory,
  alpha = 0.2,
  cellSize = DGA_CELL_SIZE,
  gutter = 15,
  showLegend = true,
  heightNumbers = 45,
  metric = "hybrid",
  buckets = 10,
  bucketLabels,
  bucketStops,
  onHoverNumber,
  showLegendCounts = true,
  hybridWeight = 0.5,
  emaNormalize = "global",
  enforcePeaks = true,
  showHoverProbability = true,
  overlayNumbers = [],
  showBucketLetters = false,
  bucketLetters,
  showDrawSlotAxis = false,
  bucketAssignments,
  bucketColors,
  bucketIndexSeries,
  hazardHistory,
  activeWindowStart,
  activeWindowEnd,
  dimmedWindowOpacity = 0.35,
  highlightedColumns = [],
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverN, setHoverN] = useState<number | null>(null);
  const [hoverPt, setHoverPt] = useState<{ x: number; y: number } | null>(null);
  const [hoverDrawIndex, setHoverDrawIndex] = useState<number | null>(null);

  // Chronological history and time length
  const chrono = useMemo(() => {
    return sortDrawsChronologically(history);
  }, [history]);
  const displayChrono = useMemo(() => {
    return sortDrawsChronologically(displayHistory ?? history);
  }, [displayHistory, history]);
  const drawSlotAxisLabels = useMemo(
    () => showDrawSlotAxis ? buildDrawSlotAxisLabels(displayChrono) : [],
    [displayChrono, showDrawSlotAxis],
  );
  const analysisT = chrono.length;
  const displayT = displayChrono.length;
  const T = bucketIndexSeries ? displayT : analysisT;
  const contextWindow = useMemo(
    () => normalizeHeatmapContextWindow(T, activeWindowStart, activeWindowEnd),
    [T, activeWindowStart, activeWindowEnd],
  );
  const hazardChrono = useMemo(() => {
    return sortDrawsChronologically(hazardHistory ?? history);
  }, [hazardHistory, history]);

  // Occurrence + EMA
  const { occurSeries, emaSeries } = useMemo(() => {
    const occur: number[][] = Array.from({ length: heightNumbers }, () => Array(analysisT).fill(0));
    const ema: number[][] = Array.from({ length: heightNumbers }, () => Array(analysisT).fill(0));
    const prev: number[] = Array(heightNumbers).fill(0);
    for (let t = 0; t < analysisT; t++) {
      const present = new Set<number>([...(chrono[t]?.main || []), ...(chrono[t]?.supp || [])]);
      for (let n = 1; n <= heightNumbers; n++) {
        const o = present.has(n) ? 1 : 0;
        occur[n - 1][t] = o;
        const cur = alpha * o + (1 - alpha) * prev[n - 1];
        ema[n - 1][t] = cur;
        prev[n - 1] = cur;
      }
    }
    return { occurSeries: occur, emaSeries: ema };
  }, [chrono, analysisT, alpha, heightNumbers]);

  // Recency exponential-decay
  const recencySeries = useMemo(() => {
    const rec: number[][] = Array.from({ length: heightNumbers }, () => Array(analysisT).fill(0));
    const p = 8 / 45;
    const k = 1 / (p || 0.0001);
    const maxAgeCap = Math.max(1, Math.floor(k * 8));
    for (let n = 0; n < heightNumbers; n++) {
      let age = maxAgeCap;
      for (let t = 0; t < analysisT; t++) {
        if (occurSeries[n][t] === 1) age = 0; else age = Math.min(maxAgeCap, age + 1);
        const v = Math.exp(-age / k);
        rec[n][t] = v;
      }
    }
    return rec;
  }, [occurSeries, analysisT, heightNumbers]);

  // EMA normalization
  const emaNorm = useMemo(() => {
    if (emaNormalize === "per-number") {
      const out = Array.from({ length: heightNumbers }, () => Array(analysisT).fill(0));
      for (let n = 0; n < heightNumbers; n++) {
        let minV = Number.POSITIVE_INFINITY, maxV = Number.NEGATIVE_INFINITY;
        for (let t = 0; t < analysisT; t++) {
          const v = emaSeries[n][t];
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
        const denom = (maxV - minV) || 1;
        for (let t = 0; t < analysisT; t++) out[n][t] = (emaSeries[n][t] - minV) / denom;
      }
      return out;
    } else {
      let minV = Number.POSITIVE_INFINITY, maxV = Number.NEGATIVE_INFINITY;
      for (let n = 0; n < heightNumbers; n++) for (let t = 0; t < analysisT; t++) {
        const v = emaSeries[n][t]; if (v < minV) minV = v; if (v > maxV) maxV = v;
      }
      const denom = (maxV - minV) || 1;
      const out = Array.from({ length: heightNumbers }, () => Array(analysisT).fill(0));
      for (let n = 0; n < heightNumbers; n++) for (let t = 0; t < analysisT; t++) {
        out[n][t] = (emaSeries[n][t] - minV) / denom;
      }
      return out;
    }
  }, [emaSeries, analysisT, heightNumbers, emaNormalize]);

  // Combined value series
  const valueSeries = useMemo(() => {
    const out: number[][] = Array.from({ length: heightNumbers }, () => Array(analysisT).fill(0));
    const w = Math.max(0, Math.min(1, hybridWeight));
    for (let n = 0; n < heightNumbers; n++) {
      for (let t = 0; t < analysisT; t++) {
        let v = 0;
        if (metric === "ema") v = emaNorm[n][t];
        else if (metric === "recency") v = recencySeries[n][t];
        else v = w * emaNorm[n][t] + (1 - w) * recencySeries[n][t];
        if (enforcePeaks && occurSeries[n][t] === 1) v = 1;
        out[n][t] = v;
      }
    }
    return out;
  }, [emaNorm, recencySeries, occurSeries, metric, analysisT, heightNumbers, hybridWeight, enforcePeaks]);

  // Buckets (labels/colors/stops)
  const { stops, labels, colors } = useMemo(() => {
    const labels = bucketLabels && bucketLabels.length === buckets ? bucketLabels : DEFAULT_BUCKET_LABELS.slice(0, buckets);
    const colors = bucketColors && bucketColors.length >= buckets
      ? bucketColors.slice(0, buckets)
      : DEFAULT_BUCKET_COLORS.slice(0, buckets);
    const stops = bucketStops && bucketStops.length === buckets - 1
      ? bucketStops.slice()
      : Array.from({ length: buckets - 1 }, (_, i) => (i + 1) / buckets);
    return { stops, labels, colors };
  }, [bucketLabels, bucketStops, bucketColors, buckets]);

  // Letters (overlay)
  const letters = useMemo(() => {
    if (bucketLetters && bucketLetters.length === buckets) return bucketLetters;
    if (DEFAULT_BUCKET_LETTERS.length === buckets) return DEFAULT_BUCKET_LETTERS;
    return labels.map(l => (l?.length ? l[0].toUpperCase() : "?"));
  }, [bucketLetters, labels, buckets]);

  const bucketIndexFor = (v: number) => {
    for (let i = 0; i < stops.length; i++) if (v <= stops[i]) return i;
    return stops.length;
  };

  const effectiveBucketIndexSeries = useMemo(() => {
    const out: number[][] = Array.from({ length: heightNumbers }, () => Array(T).fill(0));
    for (let n = 0; n < heightNumbers; n++) {
      for (let t = 0; t < T; t++) {
        const seriesBucket = bucketIndexSeries?.[n]?.[t];
        if (typeof seriesBucket === "number" && Number.isFinite(seriesBucket)) {
          out[n][t] = Math.max(0, Math.min(buckets - 1, Math.floor(seriesBucket)));
          continue;
        }

        const baseBucket = bucketIndexFor(valueSeries[n]?.[Math.min(t, Math.max(0, analysisT - 1))] ?? 0);
        const assigned = bucketAssignments && bucketAssignments[n] != null
          ? bucketAssignments[n]
          : baseBucket;
        out[n][t] = Math.max(0, Math.min(buckets - 1, assigned));
      }
    }
    return out;
  }, [bucketAssignments, bucketIndexSeries, buckets, heightNumbers, T, valueSeries, analysisT, stops]);

  // Canvas size
  const widthPx = useMemo(() => T * cellSize + gutter * 2, [T, cellSize, gutter]);
  const heightPx = useMemo(
    () => heightNumbers * cellSize + gutter * 2 + (showLegend ? 8 : 0),
    [heightNumbers, cellSize, gutter, showLegend]
  );

  // Draw heatmap + overlay dots + letters
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, widthPx, heightPx);

    if (showBucketLetters) {
      ctx.font = `bold ${Math.max(9, Math.floor(cellSize * 0.5))}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
    }

    for (let n = 0; n < heightNumbers; n++) {
      for (let t = 0; t < T; t++) {
        const assigned = effectiveBucketIndexSeries[n]?.[t] ?? 0;
        const color = colors[assigned] ?? colors[colors.length - 1];
        const x = gutter + t * cellSize;
        const y = gutter + n * cellSize;
        const cellOpacity = getHeatmapColumnOpacity(t, contextWindow, dimmedWindowOpacity, highlightedColumns);
        ctx.globalAlpha = cellOpacity;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, cellSize, cellSize);
        if (showBucketLetters) {
          const letter = letters[assigned] ?? "?";
          ctx.fillStyle = getContrastTextColor(color);
          ctx.fillText(letter, x + cellSize / 2, y + cellSize / 2);
        }
        ctx.globalAlpha = 1;
      }
    }

    if (showDrawSlotAxis && T > 0) {
      ctx.save();
      ctx.strokeStyle = DRAW_SLOT_COLUMN_BORDER_COLOR;
      ctx.lineWidth = .5;
      ctx.globalAlpha = 1;
      const topY = gutter + 0.5;
      const bottomY = gutter + heightNumbers * cellSize + 0.5;
      ctx.beginPath();
      for (let t = 0; t <= T; t++) {
        const x = gutter + t * cellSize + 0.5;
        ctx.moveTo(x, topY);
        ctx.lineTo(x, bottomY);
      }
      ctx.moveTo(gutter + 0.5, topY);
      ctx.lineTo(gutter + T * cellSize + 0.5, topY);
      ctx.moveTo(gutter + 0.5, bottomY);
      ctx.lineTo(gutter + T * cellSize + 0.5, bottomY);
      ctx.stroke();
      ctx.restore();
    }

    if (overlayNumbers && overlayNumbers.length > 0) {
      ctx.save();
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1;
      const dotX = gutter + T * cellSize - Math.min(6, Math.floor(cellSize / 3));
      for (const n of overlayNumbers) {
        if (n >= 1 && n <= heightNumbers) {
          const cy = gutter + (n - 1) * cellSize + cellSize / 2;
          ctx.beginPath();
          ctx.arc(dotX, cy, Math.max(2, Math.min(4, cellSize / 4)), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    ctx.save();
    if (showDrawSlotAxis && drawSlotAxisLabels.length > 0) {
      ctx.font = `700 ${Math.max(8, Math.min(10, Math.floor(cellSize * 0.48)))}px Helvetica, Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      for (let t = 0; t < T; t++) {
        const label = drawSlotAxisLabels[t] ?? "";
        if (!label) continue;
        const x = gutter + t * cellSize + cellSize / 2;
        const y = Math.max(10, gutter - 3);
        const isHighlighted = highlightedColumns.includes(t);
        ctx.fillStyle = isHighlighted ? "#7c2d12" : "#334155";
        ctx.fillText(label, x, y);
      }
    } else {
      ctx.fillStyle = "#444";
      ctx.font = "14px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("older → newer", gutter, gutter - 2);
    }
    ctx.restore();
  }, [
    canvasRef, widthPx, heightPx, gutter, heightNumbers, T, cellSize,
    valueSeries, colors, stops, overlayNumbers,
    showBucketLetters, letters, effectiveBucketIndexSeries, contextWindow, dimmedWindowOpacity, highlightedColumns,
    showDrawSlotAxis, drawSlotAxisLabels,
  ]);

  // Legend counts should match bucket assignments if provided
  const bucketCounts = useMemo(() => {
    const counts = Array(buckets).fill(0);
    for (let n = 0; n < heightNumbers; n++) {
      for (let t = 0; t < T; t++) {
        const assigned = effectiveBucketIndexSeries[n]?.[t] ?? 0;
        counts[assigned] = (counts[assigned] || 0) + 1;
      }
    }
    return counts;
  }, [buckets, T, heightNumbers, effectiveBucketIndexSeries]);

  // Unified hover
  const onMouseMove: React.MouseEventHandler<HTMLCanvasElement> = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const x = e.clientX - rect.left;
    const row = Math.floor((y - gutter) / cellSize);
    const col = Math.floor((x - gutter) / cellSize);
    if (row >= 0 && row < heightNumbers) {
      const n = row + 1;
      setHoverN(n);
      setHoverPt({ x, y });
      setHoverDrawIndex(col >= 0 && col < T ? col : null);
      onHoverNumber?.(n);
    } else {
      setHoverN(null);
      setHoverPt(null);
      setHoverDrawIndex(null);
      onHoverNumber?.(null);
    }
  };
  const onMouseLeave = () => {
    setHoverN(null);
    setHoverPt(null);
    setHoverDrawIndex(null);
    onHoverNumber?.(null);
  };

  // Sparkline of combined value (last 50)
  const spark = useMemo(() => {
    if (!hoverN) return null;
    const vals = valueSeries[hoverN - 1] || [];
    if (!vals.length) return null;
    const N = Math.min(50, vals.length);
    const slice = vals.slice(vals.length - N);
    const minV = Math.min(...slice);
    const maxV = Math.max(...slice);
    const W = 140, H = 44, pad = 4;
    const range = maxV - minV || 1;
    const px = (i: number) => pad + (i / (N - 1)) * (W - 2 * pad);
    const py = (v: number) => pad + (H - 2 * pad) * (1 - (v - minV) / range);
    const d = slice.map((v: number, i: number) => `${i === 0 ? "M" : "L"} ${px(i)} ${py(v)}`).join(" ");
    return { d, W, H, N };
  }, [hoverN, valueSeries]);

  // Drought hazard can stay scoped to a narrower analysis window even when the
  // heatmap itself is rendering full-history context.
  const hazard = useMemo(() => computeDroughtHazard(hazardChrono), [hazardChrono]);

  function labelForP(p: number, baseline: number) {
    if (p >= baseline + 0.08) return { label: "High evidence", color: "#d32f2f" };
    if (p >= baseline + 0.03) return { label: "Elevated evidence", color: "#f57c00" };
    if (p >= baseline - 0.03) return { label: "Near baseline", color: "#1976d2" };
    return { label: "Low", color: "#455a64" };
  }

  // Tooltip placement near cursor, clamped within canvas
  const hoverBoxStyle = useMemo<React.CSSProperties>(() => {
    if (!hoverPt) return { display: "none" };
    const boxW = 220;
    const boxH = 110;
    const pad = 10;
    let left = hoverPt.x + 12;
    let top = hoverPt.y + 12;
    if (left + boxW > widthPx - pad) left = Math.max(pad, widthPx - pad - boxW);
    if (top + boxH > heightPx - pad) top = Math.max(pad, heightPx - pad - boxH);
    return {
      position: "absolute",
      left, top,
      background: "rgba(255,255,255,0.98)",
      border: "1px solid #ddd",
      borderRadius: 6,
      padding: "6px 8px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
      pointerEvents: "none",
      fontSize: 12,
      minWidth: boxW,
    };
  }, [hoverPt, widthPx, heightPx]);

  return (
    <div style={{ width: "100%", position: "relative", overflowX: "auto", border: "1px solid #eee", borderRadius: 8, background: "#fff" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: widthPx, height: heightPx, cursor: "crosshair" }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      />

      {/* Unified hover: drought + sparkline, follows cursor and scrolls */}
      {showHoverProbability && hoverN && hoverPt && (
        <div style={hoverBoxStyle}>
          {(() => {
            const rec = hazard.byNumber[hoverN - 1] || { k: 0, p: 0, hitsNext: 0, trials: 0 };
            const baseline = hazard.baselineProbability;
            const { label, color } = labelForP(rec.p, baseline);
            const hoveredDraw = hoverDrawIndex !== null ? displayChrono[hoverDrawIndex] : null;
            const hoveredBucketLabel = hoverDrawIndex !== null
              ? labels[effectiveBucketIndexSeries[hoverN - 1]?.[hoverDrawIndex] ?? 0] ?? null
              : null;
            const hoveredDrawLabel = hoverDrawIndex !== null
              ? hoveredDraw?.isSimulated
                ? `Simulated next draw (${hoveredDraw.date})`
                : hoveredDraw?.date ?? `column ${hoverDrawIndex + 1}`
              : null;
            return (
              <div>
                <div style={{ marginBottom: 4 }}>
                  <b style={{ marginRight: 6 }}>#{hoverN}</b>
                  <span style={{ color: "#666" }}>Smoothed drought-break appearance rate</span>
                </div>
                {hoveredBucketLabel && hoveredDrawLabel ? (
                  <div style={{ color: "#555", marginBottom: 4 }}>
                    Cell bucket @ <b>{hoveredDrawLabel}</b>: <b>{hoveredBucketLabel}</b>
                  </div>
                ) : null}
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ color, fontWeight: 700, fontSize: 14 }}>{(rec.p * 100).toFixed(1)}%</span>
                  <span style={{ color: "#444", fontWeight: 600 }}>{label}</span>
                </div>
                <div style={{ color: "#777", marginTop: 2, marginBottom: 6 }}>
                  Drought length k={rec.k} • Observed {rec.hitsNext}/{rec.trials} • Baseline {(baseline * 100).toFixed(1)}%
                </div>
                {spark && (
                  <div>
                    <div style={{ fontSize: 12, marginBottom: 2 }}>Temperature (last {spark.N})</div>
                    <svg width={spark.W} height={spark.H}>
                      <path d={spark.d} fill="none" stroke="#1976d2" strokeWidth="2" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Legend */}
      {showLegend && (
        <div style={{ padding: "8px 10px", borderTop: "1px solid #eee", display: "flex", flexWrap: "wrap", gap: 12 }}>
          {Array.from({ length: buckets }, (_, i) => {
            const label = (bucketLabels && bucketLabels[i]) || DEFAULT_BUCKET_LABELS[i] || `L${i + 1}`;
            const totalCells = heightNumbers * (T || 1);
            const pct = totalCells ? ((bucketCounts[i] / totalCells) * 100).toFixed(1) : "0.0";
            return (
              <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 180 }}>
                <span style={{ width: 16, height: 10, background: colors[i], border: "1px solid #ccc", borderRadius: 2 }} />
                <span style={{ fontSize: 12, color: "#222" }}>
                  {label} ({bucketCounts[i]} • {pct}%)
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

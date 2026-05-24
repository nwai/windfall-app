import React, { useMemo, useCallback, useState } from "react";

interface WalkForwardChartProps {
  /** Per-draw delta values (random − method). Positive = method is better. */
  deltaPerDraw: number[];
  /** Rolling average window size */
  rollingWindow?: number;
  /** Height in pixels */
  height?: number;
}

/**
 * Compute a simple moving average over an array of numbers.
 * Returns an array of the same length; early values use a shorter window.
 */
function rollingAverage(values: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

const MARGIN = { top: 20, right: 24, bottom: 44, left: 54 };

/**
 * Pure-SVG walk-forward hit-rate chart.
 * Renders per-draw deltas (grey) and a rolling average (blue) with a zero line.
 * No external charting library required.
 */
export const WalkForwardChart: React.FC<WalkForwardChartProps> = ({
  deltaPerDraw,
  rollingWindow = 10,
  height = 260,
}) => {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    draw: number;
    delta: number;
    avg: number;
  } | null>(null);

  const rolling = useMemo(
    () => rollingAverage(deltaPerDraw, rollingWindow),
    [deltaPerDraw, rollingWindow]
  );

  const layout = useMemo(() => {
    if (!deltaPerDraw.length) return null;

    const allValues = [...deltaPerDraw, ...rolling];
    const yMin = Math.min(...allValues, 0);
    const yMax = Math.max(...allValues, 0);
    const yPad = (yMax - yMin) * 0.1 || 0.5;

    return {
      yMin: yMin - yPad,
      yMax: yMax + yPad,
      n: deltaPerDraw.length,
    };
  }, [deltaPerDraw, rolling]);

  const toPath = useCallback(
    (values: number[], chartW: number, chartH: number): string => {
      if (!layout || values.length === 0) return "";
      const { yMin, yMax, n } = layout;
      const yRange = yMax - yMin || 1;
      return values
        .map((v, i) => {
          const x = MARGIN.left + (i / Math.max(n - 1, 1)) * chartW;
          const y = MARGIN.top + (1 - (v - yMin) / yRange) * chartH;
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
    },
    [layout]
  );

  if (!deltaPerDraw.length || !layout) {
    return (
      <div style={{ color: "#999", fontSize: 12 }}>
        No data — run a backtest first.
      </div>
    );
  }

  const width = 600; // SVG viewBox width; scales responsively
  const chartW = width - MARGIN.left - MARGIN.right;
  const chartH = height - MARGIN.top - MARGIN.bottom;
  const { yMin, yMax, n } = layout;
  const yRange = yMax - yMin || 1;

  // Zero line Y position
  const zeroY = MARGIN.top + (1 - (0 - yMin) / yRange) * chartH;

  // Y-axis tick values (5 ticks)
  const yTicks: number[] = [];
  for (let i = 0; i <= 4; i++) {
    yTicks.push(yMin + (yRange * i) / 4);
  }

  // X-axis tick values (up to 6 ticks)
  const xTickCount = Math.min(n, 6);
  const xTicks: number[] = [];
  for (let i = 0; i < xTickCount; i++) {
    xTicks.push(Math.round(1 + (i * (n - 1)) / Math.max(xTickCount - 1, 1)));
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const scaleX = width / rect.width;
    const mx = (e.clientX - rect.left) * scaleX - MARGIN.left;

    const idx = Math.round((mx / chartW) * (n - 1));
    if (idx < 0 || idx >= n) {
      setTooltip(null);
      return;
    }

    const px = MARGIN.left + (idx / Math.max(n - 1, 1)) * chartW;
    const py =
      MARGIN.top + (1 - (deltaPerDraw[idx] - yMin) / yRange) * chartH;

    setTooltip({
      x: px,
      y: py,
      draw: idx + 1,
      delta: deltaPerDraw[idx],
      avg: rolling[idx],
    });
  };

  const handleMouseLeave = (): void => setTooltip(null);

  const deltaPath = toPath(deltaPerDraw, chartW, chartH);
  const rollingPath = toPath(rolling, chartW, chartH);

  return (
    <div style={{ width: "100%", position: "relative" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Chart background */}
        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={chartW}
          height={chartH}
          fill="#1a1a2e"
          rx={2}
        />

        {/* Y gridlines */}
        {yTicks.map((v) => {
          const y = MARGIN.top + (1 - (v - yMin) / yRange) * chartH;
          return (
            <g key={`yt-${v}`}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + chartW}
                y1={y}
                y2={y}
                stroke="#333"
                strokeWidth={0.5}
              />
              <text
                x={MARGIN.left - 6}
                y={y + 3}
                textAnchor="end"
                fontSize={9}
                fill="#999"
              >
                {v.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* X-axis ticks */}
        {xTicks.map((drawNum) => {
          const x =
            MARGIN.left + ((drawNum - 1) / Math.max(n - 1, 1)) * chartW;
          return (
            <text
              key={`xt-${drawNum}`}
              x={x}
              y={MARGIN.top + chartH + 16}
              textAnchor="middle"
              fontSize={9}
              fill="#999"
            >
              {drawNum}
            </text>
          );
        })}

        {/* Axis labels */}
        <text
          x={MARGIN.left + chartW / 2}
          y={height - 4}
          textAnchor="middle"
          fontSize={11}
          fill="#aaa"
        >
          Draw #
        </text>
        <text
          x={14}
          y={MARGIN.top + chartH / 2}
          textAnchor="middle"
          fontSize={11}
          fill="#aaa"
          transform={`rotate(-90, 14, ${MARGIN.top + chartH / 2})`}
        >
          Delta (rand − method)
        </text>

        {/* Zero line */}
        {zeroY >= MARGIN.top && zeroY <= MARGIN.top + chartH && (
          <line
            x1={MARGIN.left}
            x2={MARGIN.left + chartW}
            y1={zeroY}
            y2={zeroY}
            stroke="#e53935"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        )}

        {/* Delta per draw line */}
        <path
          d={deltaPath}
          fill="none"
          stroke="#888"
          strokeWidth={1}
          strokeLinejoin="round"
        />

        {/* Rolling average line */}
        <path
          d={rollingPath}
          fill="none"
          stroke="#2196f3"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Tooltip crosshair + dot */}
        {tooltip && (
          <g>
            <line
              x1={tooltip.x}
              x2={tooltip.x}
              y1={MARGIN.top}
              y2={MARGIN.top + chartH}
              stroke="#666"
              strokeWidth={0.5}
              strokeDasharray="3 3"
            />
            <circle cx={tooltip.x} cy={tooltip.y} r={3} fill="#2196f3" />
          </g>
        )}

        {/* Legend */}
        <g transform={`translate(${MARGIN.left + 8}, ${MARGIN.top + 10})`}>
          <line x1={0} x2={14} y1={0} y2={0} stroke="#888" strokeWidth={1} />
          <text x={18} y={3} fontSize={9} fill="#aaa">
            Delta per draw
          </text>
          <line
            x1={110}
            x2={124}
            y1={0}
            y2={0}
            stroke="#2196f3"
            strokeWidth={2}
          />
          <text x={128} y={3} fontSize={9} fill="#aaa">
            Rolling avg ({rollingWindow})
          </text>
        </g>
      </svg>

      {/* Tooltip overlay */}
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: `${(tooltip.x / width) * 100}%`,
            top: 0,
            transform: "translateX(-50%)",
            background: "rgba(30,30,50,0.95)",
            border: "1px solid #555",
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: 11,
            color: "#eee",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          <div>Draw #{tooltip.draw}</div>
          <div style={{ color: "#888" }}>
            Δ: {tooltip.delta.toFixed(4)}
          </div>
          <div style={{ color: "#2196f3" }}>
            Avg: {tooltip.avg.toFixed(4)}
          </div>
        </div>
      )}
    </div>
  );
};

export default WalkForwardChart;

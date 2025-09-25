import React, { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";

/**
 * Usage:
 * <NumberHeatmapAndTimeline history={yourHistoryArray} />
 *
 * history: Array of { date, mains: [n,n,n,n,n,n], ... }
 */

// Helper to build heatmap data safely, ignoring rows without a valid mains array
function buildHeatmapData(history) {
  return history
    .slice()
    .reverse()
    .map((draw, i) => {
      const obj = { drawIndex: i + 1, date: draw?.date || "" };
      for (let n = 1; n <= 45; n++) {
        obj[n] = Array.isArray(draw?.mains) && draw.mains.includes(n) ? 1 : 0;
      }
      return obj;
    });
}

// Helper to build timeline data safely
function buildTimelineData(history, number) {
  return history
    .slice()
    .reverse()
    .map((draw, i) => ({
      drawIndex: i + 1,
      date: draw?.date || "",
      present: Array.isArray(draw?.mains) && draw.mains.includes(number) ? 1 : 0,
    }));
}

export default function NumberHeatmapAndTimeline({ history }) {
  const [selectedNumber, setSelectedNumber] = useState(1);

  if (!Array.isArray(history) || history.length === 0) {
    return <div>No history loaded.</div>;
  }

  const heatmapData = buildHeatmapData(history);

  // SVG layout
  const cellWidth = 16, cellHeight = 14;
  const heatmapWidth = 45 * cellWidth + 60;
  const heatmapHeight = heatmapData.length * cellHeight + 40;

  return (
    <div style={{ margin: 24 }}>
      <h2>Weekday Windfall Number Heatmap</h2>
      <div style={{overflowX:"auto", border: "1px solid #aaa", background: "#fff", padding: 8, borderRadius: 6}}>
        <svg width={heatmapWidth} height={heatmapHeight} style={{display: "block"}}>
          {/* Column headers (numbers 1–45) */}
          {Array.from({ length: 45 }, (_, i) => (
            <text
              key={i}
              x={i * cellWidth + 60 + cellWidth/2}
              y={18}
              fontSize={11}
              textAnchor="middle"
              fill="#333"
              style={{
                fontWeight: selectedNumber === (i+1) ? "bold" : undefined,
                cursor: "pointer"
              }}
              onClick={() => setSelectedNumber(i+1)}
            >
              {i+1}
            </text>
          ))}
          {/* Row labels (draw index or date) */}
          {heatmapData.map((row, i) => (
            <text
              key={i}
              x={54}
              y={i * cellHeight + 34}
              fontSize={10}
              textAnchor="end"
              fill="#888"
            >
              {row.date}
            </text>
          ))}
          {/* The heatmap cells */}
          {heatmapData.map((row, rIdx) =>
            Array.from({ length: 45 }, (_, cIdx) => {
              const number = cIdx + 1;
              const value = row[number];
              const highlight = (selectedNumber === number);
              return (
                <rect
                  key={number}
                  x={cIdx * cellWidth + 60}
                  y={rIdx * cellHeight + 24}
                  width={cellWidth-1}
                  height={cellHeight-1}
                  fill={
                    value
                      ? highlight
                        ? "#e53935"
                        : "#1976d2"
                      : highlight
                        ? "#ffd54f"
                        : "#f5f5f5"
                  }
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedNumber(number)}
                />
              );
            })
          )}
        </svg>
        <div style={{fontSize:12, color:"#555", marginTop:8}}>
          Click a column/number to view its timeline below.
        </div>
      </div>

      <h2 style={{marginTop:32}}>Timeline for Number <span style={{color:"#1976d2"}}>{selectedNumber}</span></h2>
      <div style={{background: "#fff", border: "1px solid #aaa", borderRadius: 6, padding: 8}}>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={buildTimelineData(history, selectedNumber)}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="drawIndex" tickFormatter={v=>""} hide/>
            <YAxis dataKey="present" domain={[0,1]} ticks={[0,1]} width={30} />
            <Tooltip labelFormatter={(idx) => {
              const entry = buildTimelineData(history, selectedNumber)[idx];
              return entry ? `Draw ${entry.drawIndex} (${entry.date})` : "";
            }} />
            <Legend />
            <Line
              type="stepAfter"
              dataKey="present"
              stroke="#1976d2"
              strokeWidth={2}
              dot={false}
              name={`Number ${selectedNumber} Present`}
            />
          </LineChart>
        </ResponsiveContainer>
        <div style={{fontSize:12, color:"#555", marginTop:8}}>
          Blue = number drawn. X-axis is time (most recent to oldest left-to-right).
        </div>
      </div>
    </div>
  );
}
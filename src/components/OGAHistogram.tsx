import React from "react";
import { ResponsiveBar } from "@nivo/bar";

export function OGAHistogram({
  ogaScores,
  candidateOGA,
  candidatePercentile,
}: {
  ogaScores: number[];
  candidateOGA?: number;
  candidatePercentile?: number;
}) {
  console.log("Rendering NIVO OGAHistogram");

  if (!ogaScores.length) return null;

  // Bin data
  const min = Math.min(...ogaScores);
  const max = Math.max(...ogaScores);
  const binCount = 10;
  const binWidth = (max - min) / binCount || 1;
  const bins = Array(binCount).fill(0);
  ogaScores.forEach((score) => {
    const idx = Math.min(binCount - 1, Math.floor((score - min) / binWidth));
    bins[idx]++;
  });
  // Find hot zone
  const maxCount = Math.max(...bins);
  const hotZones = bins
    .map((count, i) => (count === maxCount ? i : -1))
    .filter((i) => i !== -1);

  // Candidate bin
  let candidateBin: number | undefined = undefined;
  if (candidateOGA !== undefined) {
    candidateBin = Math.min(
      binCount - 1,
      Math.floor((candidateOGA - min) / binWidth)
    );
  }

  // Prepare data for Nivo (no booleans!)
  const data = bins.map((count, i) => {
    const rangeStart = min + binWidth * i;
    const rangeEnd = min + binWidth * (i + 1);
    return {
      bin: `${rangeStart.toFixed(1)}-${rangeEnd.toFixed(1)}`,
      count,
      isHot: hotZones.includes(i) ? 1 : 0,
      isCandidate: candidateBin === i ? 1 : 0,
    };
  });

  return (
    <div style={{ height: 180 }}>
      <b>OGA Score Distribution (History)</b>
      <ResponsiveBar
        data={data}
        keys={["count"]}
        indexBy="bin"
        margin={{ top: 30, right: 30, bottom: 40, left: 40 }}
        padding={0.3}
        colors={({ data }) =>
          data.isCandidate ? "#d32f2f" : data.isHot ? "#ffd600" : "#90caf9"
        }
        borderColor={{ from: "color", modifiers: [["darker", 1.6]] }}
        enableLabel={false}
        axisBottom={{
          tickSize: 3,
          tickPadding: 6,
          tickRotation: 0,
          legend: "OGA Range",
          legendPosition: "middle",
          legendOffset: 28,
        }}
        axisLeft={{
          tickSize: 3,
          tickPadding: 5,
          legend: "Draws",
          legendPosition: "middle",
          legendOffset: -32,
        }}
        tooltip={({ data }) => (
          <div
            style={{
              padding: 8,
              background: "#fff",
              border: "1px solid #ccc",
              color: "#222",
              fontSize: 13,
            }}
          >
            <div>
              <b>OGA {data.bin}</b>
            </div>
            <div>Draws: {data.count}</div>
            {!!data.isHot && <div style={{ color: "#b29f00" }}>Hot zone</div>}
            {!!data.isCandidate && (
              <div style={{ color: "#d32f2f" }}>Your set</div>
            )}
          </div>
        )}
        theme={{
          axis: {
            ticks: {
              text: { fontSize: 12, fill: "#555" },
            },
            legend: { text: { fontSize: 13, fontWeight: "bold" } },
          },
        }}
      />
      <div style={{ marginTop: 10 }}>
        {candidateOGA !== undefined && (
          <div>
            <b>Your Candidate OGA:</b>{" "}
            <span style={{ color: "#d32f2f" }}>{candidateOGA.toFixed(2)}</span>{" "}
            {candidatePercentile !== undefined && (
              <span>
                (<b>{candidatePercentile.toFixed(1)}%</b> percentile)
                {candidatePercentile > 80 ? (
                  <span style={{ color: "green", marginLeft: 6 }}>
                    Typical for winners
                  </span>
                ) : candidatePercentile < 20 ? (
                  <span style={{ color: "red", marginLeft: 6 }}>
                    Atypical for winners
                  </span>
                ) : (
                  <span style={{ color: "#888", marginLeft: 6 }}>
                    Within normal range
                  </span>
                )}
              </span>
            )}
          </div>
        )}
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          <span
            style={{
              background: "#ffd600",
              color: "#222",
              padding: "0 4px",
              borderRadius: 3,
            }}
          >
            Hot zone
          </span>{" "}
          = most common OGA range among past winners.
          <span style={{ color: "#d32f2f", marginLeft: 8 }}>
            Your set highlighted in red.
          </span>
        </div>
      </div>
    </div>
  );
}
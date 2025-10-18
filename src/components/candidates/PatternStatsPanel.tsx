import React, { useMemo } from "react";
import { Draw } from "../../types";
import {
  computePatternFeaturesForHistory,
  createHistogram,
} from "../../lib/patternStats";

interface PatternStatsPanelProps {
  draws: Draw[];
  numBins?: number;
}

export function PatternStatsPanel({
  draws,
  numBins = 10,
}: PatternStatsPanelProps) {
  const features = useMemo(
    () => computePatternFeaturesForHistory(draws),
    [draws]
  );

  const consecPairsHist = useMemo(
    () => createHistogram(features.consecPairs, numBins),
    [features.consecPairs, numBins]
  );

  const evenCountsHist = useMemo(
    () => createHistogram(features.evenCounts, numBins),
    [features.evenCounts, numBins]
  );

  const lowCountsHist = useMemo(
    () => createHistogram(features.lowCounts, numBins),
    [features.lowCounts, numBins]
  );

  const sumsHist = useMemo(
    () => createHistogram(features.sums, numBins),
    [features.sums, numBins]
  );

  const renderHistogram = (
    title: string,
    histogram: Array<{ min: number; max: number; count: number }>,
    description: string
  ) => {
    const maxCount = Math.max(...histogram.map((bin) => bin.count), 1);

    return (
      <div style={{ marginBottom: "1.5rem" }}>
        <h4 style={{ marginBottom: "0.5rem" }}>{title}</h4>
        <div style={{ fontSize: "0.85rem", color: "#666", marginBottom: "0.5rem" }}>
          {description}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "4px",
            height: "120px",
            borderBottom: "1px solid #ccc",
            paddingBottom: "4px",
          }}
        >
          {histogram.map((bin, idx) => {
            const height = (bin.count / maxCount) * 100;
            return (
              <div
                key={idx}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-end",
                }}
                title={`${bin.min.toFixed(1)} - ${bin.max.toFixed(1)}: ${bin.count} draws`}
              >
                <div
                  style={{
                    width: "100%",
                    height: `${height}%`,
                    backgroundColor: "#1976d2",
                    borderRadius: "2px 2px 0 0",
                    minHeight: bin.count > 0 ? "2px" : "0",
                  }}
                />
                <div
                  style={{
                    fontSize: "10px",
                    marginTop: "4px",
                    textAlign: "center",
                    color: "#666",
                  }}
                >
                  {Math.round(bin.min)}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: "0.8rem", color: "#888", marginTop: "4px" }}>
          Total draws: {histogram.reduce((sum, bin) => sum + bin.count, 0)}
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        border: "1px solid #eee",
        borderRadius: "8px",
        padding: "1rem",
        background: "#fff",
        marginTop: "10px",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>Pattern Stats</h3>
      <div style={{ fontSize: "0.9rem", color: "#555", marginBottom: "1rem" }}>
        Distribution analysis over {draws.length} draws
      </div>

      {renderHistogram(
        "Consecutive Pairs",
        consecPairsHist,
        "Number of consecutive pairs in main numbers (e.g., 5-6, 10-11)"
      )}

      {renderHistogram(
        "Even Count",
        evenCountsHist,
        "Number of even numbers in main numbers (0-6)"
      )}

      {renderHistogram(
        "Low Count (≤22)",
        lowCountsHist,
        "Number of low numbers (1-22) in main numbers (0-6)"
      )}

      {renderHistogram(
        "Sum(mains)",
        sumsHist,
        "Sum of all main numbers in each draw"
      )}
    </div>
  );
}

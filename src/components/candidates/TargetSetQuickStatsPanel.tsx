import React, { useMemo } from "react";

interface TargetSetQuickStatsPanelProps {
  forcedNumbers: number[];
  selectedNumbers: number[];
}

export function TargetSetQuickStatsPanel({
  forcedNumbers = [],
  selectedNumbers = [],
}: TargetSetQuickStatsPanelProps) {
  const stats = useMemo(() => {
    // Combine forced and selected, remove duplicates
    const allNumbers = Array.from(
      new Set([...forcedNumbers, ...selectedNumbers])
    ).sort((a, b) => a - b);

    // Count by category
    const lowNumbers = allNumbers.filter((n) => n <= 22);
    const highNumbers = allNumbers.filter((n) => n > 22);
    const evenNumbers = allNumbers.filter((n) => n % 2 === 0);
    const oddNumbers = allNumbers.filter((n) => n % 2 !== 0);

    // Sum
    const sum = allNumbers.reduce((a, b) => a + b, 0);

    return {
      allNumbers,
      total: allNumbers.length,
      lowNumbers,
      highNumbers,
      evenNumbers,
      oddNumbers,
      sum,
    };
  }, [forcedNumbers, selectedNumbers]);

  const renderStat = (label: string, value: number | string, detail?: string) => {
    return (
      <div
        style={{
          padding: "0.75rem",
          backgroundColor: "#f9f9f9",
          border: "1px solid #ddd",
          borderRadius: "4px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "0.8rem", color: "#666", marginBottom: "4px" }}>
          {label}
        </div>
        <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#333" }}>
          {value}
        </div>
        {detail && (
          <div style={{ fontSize: "0.75rem", color: "#888", marginTop: "4px" }}>
            {detail}
          </div>
        )}
      </div>
    );
  };

  const renderNumbersList = (numbers: number[], color: string) => {
    if (numbers.length === 0) {
      return <span style={{ color: "#999", fontStyle: "italic" }}>None</span>;
    }
    return (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px",
          marginTop: "4px",
        }}
      >
        {numbers.map((num) => (
          <span
            key={num}
            style={{
              display: "inline-block",
              padding: "2px 8px",
              backgroundColor: color,
              color: "#fff",
              borderRadius: "4px",
              fontSize: "0.85rem",
              fontWeight: "bold",
            }}
          >
            {num}
          </span>
        ))}
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
      <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>
        Target Set Quick Stats
      </h3>

      {stats.total === 0 ? (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: "#999",
            fontStyle: "italic",
          }}
        >
          No forced or selected numbers to analyze
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            {renderStat("Total", stats.total, "numbers")}
            {renderStat(
              "Low (≤22)",
              stats.lowNumbers.length,
              `${((stats.lowNumbers.length / stats.total) * 100).toFixed(0)}%`
            )}
            {renderStat(
              "High (>22)",
              stats.highNumbers.length,
              `${((stats.highNumbers.length / stats.total) * 100).toFixed(0)}%`
            )}
            {renderStat(
              "Even",
              stats.evenNumbers.length,
              `${((stats.evenNumbers.length / stats.total) * 100).toFixed(0)}%`
            )}
            {renderStat(
              "Odd",
              stats.oddNumbers.length,
              `${((stats.oddNumbers.length / stats.total) * 100).toFixed(0)}%`
            )}
            {renderStat("Sum", stats.sum)}
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
              All Numbers ({stats.total}):
            </div>
            {renderNumbersList(stats.allNumbers, "#1976d2")}
          </div>

          {forcedNumbers.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
                Forced Numbers ({forcedNumbers.length}):
              </div>
              {renderNumbersList(
                forcedNumbers.sort((a, b) => a - b),
                "#28a745"
              )}
            </div>
          )}

          {selectedNumbers.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
                Selected Numbers ({selectedNumbers.length}):
              </div>
              {renderNumbersList(
                selectedNumbers.sort((a, b) => a - b),
                "#ff9800"
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

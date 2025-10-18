import React, { useState, useMemo } from "react";
import { Draw } from "../../types";
import {
  perNumberFrequency,
  getTopNumbers,
  getBottomNumbers,
} from "../../lib/patternStats";

interface NumberFrequencyPanelProps {
  draws: Draw[];
}

export const NumberFrequencyPanel: React.FC<NumberFrequencyPanelProps> = ({
  draws,
}) => {
  const [includeSupp, setIncludeSupp] = useState(false);

  const frequency = useMemo(
    () => perNumberFrequency(draws, includeSupp),
    [draws, includeSupp]
  );

  const topNumbers = useMemo(() => getTopNumbers(frequency, 10), [frequency]);
  const bottomNumbers = useMemo(
    () => getBottomNumbers(frequency, 10),
    [frequency]
  );

  const renderNumberList = (
    title: string,
    numbers: Array<[number, number]>,
    isTop: boolean
  ) => {
    return (
      <div style={{ flex: 1, minWidth: "200px" }}>
        <h4 style={{ marginTop: 0, marginBottom: "0.5rem" }}>{title}</h4>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.9rem",
          }}
        >
          <thead>
            <tr style={{ backgroundColor: "#f0f0f0" }}>
              <th style={headerStyle}>Rank</th>
              <th style={headerStyle}>Number</th>
              <th style={headerStyle}>Frequency</th>
            </tr>
          </thead>
          <tbody>
            {numbers.map(([num, freq], idx) => (
              <tr key={num} style={{ borderBottom: "1px solid #eee" }}>
                <td style={cellStyle}>{idx + 1}</td>
                <td
                  style={{
                    ...cellStyle,
                    fontWeight: "bold",
                    color: isTop ? "#28a745" : "#dc3545",
                  }}
                >
                  {num}
                </td>
                <td style={cellStyle}>{freq}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h3 style={{ margin: 0 }}>Number Frequency</h3>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={includeSupp}
            onChange={(e) => setIncludeSupp(e.target.checked)}
            style={{ cursor: "pointer" }}
          />
          <span style={{ fontSize: "0.9rem" }}>Include Supp</span>
        </label>
      </div>

      <div style={{ fontSize: "0.9rem", color: "#555", marginBottom: "1rem" }}>
        {includeSupp
          ? "Showing frequency for main + supplementary numbers"
          : "Showing frequency for main numbers only"}{" "}
        over {draws.length} draws
      </div>

      <div
        style={{
          display: "flex",
          gap: "2rem",
          flexWrap: "wrap",
        }}
      >
        {renderNumberList("Top 10 Numbers", topNumbers, true)}
        {renderNumberList("Bottom 10 Numbers", bottomNumbers, false)}
      </div>
    </div>
  );
};

const headerStyle: React.CSSProperties = {
  padding: "0.5rem",
  textAlign: "left",
  fontWeight: "bold",
  borderBottom: "2px solid #333",
};

const cellStyle: React.CSSProperties = {
  padding: "0.5rem",
  textAlign: "center",
};
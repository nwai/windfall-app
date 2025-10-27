import React from "react";

interface WindowStatsPanelProps {
  sumFilterEnabled: boolean;
  setSumFilterEnabled: (enabled: boolean) => void;
  sumMin: number;
  setSumMin: (min: number) => void;
  sumMax: number;
  setSumMax: (max: number) => void;
  sumIncludeSupp: boolean;
  setSumIncludeSupp: (include: boolean) => void;
}

export function WindowStatsPanel({
  sumFilterEnabled,
  setSumFilterEnabled,
  sumMin,
  setSumMin,
  sumMax,
  setSumMax,
  sumIncludeSupp,
  setSumIncludeSupp,
}: WindowStatsPanelProps) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: "8px",
        padding: "1rem",
        background: "#fff",
        marginTop: "10px",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>Window Statistics Filter</h3>
      
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            checked={sumFilterEnabled}
            onChange={(e) => setSumFilterEnabled(e.target.checked)}
          />
          <strong>Apply to generation</strong>
        </label>
      </div>

      {sumFilterEnabled && (
        <div style={{ paddingLeft: "1.5rem", borderLeft: "3px solid #1976d2" }}>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9rem" }}>
              <strong>Sum Range:</strong>
            </label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="number"
                value={sumMin}
                onChange={(e) => setSumMin(Number(e.target.value))}
                min={0}
                max={sumMax}
                style={{ width: "80px", padding: "4px" }}
              />
              <span>to</span>
              <input
                type="number"
                value={sumMax}
                onChange={(e) => setSumMax(Number(e.target.value))}
                min={sumMin}
                max={9999}
                style={{ width: "80px", padding: "4px" }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}>
              <input
                type="checkbox"
                checked={sumIncludeSupp}
                onChange={(e) => setSumIncludeSupp(e.target.checked)}
              />
              Include supplementary numbers in sum
            </label>
          </div>
        </div>
      )}

      {sumFilterEnabled && (
        <div style={{ marginTop: "1rem", padding: "0.5rem", background: "#f5f5f5", borderRadius: "4px", fontSize: "0.85rem" }}>
          <strong>Active Filter:</strong> Sum of {sumIncludeSupp ? "main+supp" : "main-only"} numbers must be in [{sumMin}, {sumMax}]
        </div>
      )}
    </div>
  );
}

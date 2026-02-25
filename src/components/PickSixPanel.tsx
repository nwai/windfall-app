import React, { useMemo } from "react";

export type PickSixSource = "manual" | "manualSim" | "dgaSim";

interface PickSixPanelProps {
  source: PickSixSource;
  onSourceChange: (next: PickSixSource) => void;
  manualValues: number[];
  onManualValuesChange: (values: number[]) => void;
  manualSimNumbers: number[];
  dgaSimNumbers: number[];
  onSimulateManual: (numbers: number[]) => void;
}

function clampNumber(n: number): number {
  if (!Number.isFinite(n)) return NaN;
  return Math.max(1, Math.min(45, Math.round(n)));
}

function generateCombos(nums: number[]): number[][] {
  if (nums.length !== 8) return [];
  const sorted = [...nums].sort((a, b) => a - b);
  const combos: number[][] = [];
  for (let i = 0; i < 7; i++) {
    for (let j = i + 1; j < 8; j++) {
      combos.push(sorted.filter((_, idx) => idx !== i && idx !== j));
    }
  }
  return combos;
}

function formatCombo(combo: number[]): string {
  return combo.join(", ");
}

export const PickSixPanel: React.FC<PickSixPanelProps> = ({
  source,
  onSourceChange,
  manualValues,
  onManualValuesChange,
  manualSimNumbers,
  dgaSimNumbers,
  onSimulateManual,
}) => {
  const manualSanitized = useMemo(() => {
    const next = Array.from({ length: 8 }, (_, i) => manualValues[i] ?? NaN).map((n) => clampNumber(n));
    return next;
  }, [manualValues]);

  const sourceNumbers = useMemo(() => {
    if (source === "manualSim") return manualSimNumbers.length === 8 ? manualSimNumbers.slice() : [];
    if (source === "dgaSim") return dgaSimNumbers.length === 8 ? dgaSimNumbers.slice() : [];
    return manualSanitized;
  }, [source, manualSanitized, manualSimNumbers, dgaSimNumbers]);

  const hasEight = sourceNumbers.length === 8 && sourceNumbers.every((n) => Number.isFinite(n));
  const uniqueCount = new Set(sourceNumbers).size;
  const hasDupes = hasEight && uniqueCount !== 8;
  const combos = useMemo(() => (hasEight && !hasDupes ? generateCombos(sourceNumbers) : []), [hasEight, hasDupes, sourceNumbers]);
  const canSimulateManual = source === "manual" && hasEight && !hasDupes;

  const availability = {
    manualSim: manualSimNumbers.length === 8,
    dgaSim: dgaSimNumbers.length === 8,
  };

  return (
    <div style={{ display: "grid", gap: 10, fontFamily: "sans-serif", fontSize: 13 }}>
      {/* Row 1: source toggles */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
        <strong>Number source:</strong>
        <label title="Use the 8 numbers from Manual Simulation (first 6 main, next 2 supp)">
          <input
            type="radio"
            name="pickSixSource"
            value="manualSim"
            checked={source === "manualSim"}
            onChange={() => onSourceChange("manualSim")}
            disabled={!availability.manualSim}
            style={{ marginRight: 6 }}
          />
          Manual Simulation {availability.manualSim ? "(8 ready)" : "(need 8 picks)"}
        </label>
        <label title="Use the 8 numbers from the DGA simulation column (simulated candidate)">
          <input
            type="radio"
            name="pickSixSource"
            value="dgaSim"
            checked={source === "dgaSim"}
            onChange={() => onSourceChange("dgaSim")}
            disabled={!availability.dgaSim}
            style={{ marginRight: 6 }}
          />
          DGA simulation {availability.dgaSim ? "(8 ready)" : "(simulate to enable)"}
        </label>
        <label title="Enter 8 numbers manually">
          <input
            type="radio"
            name="pickSixSource"
            value="manual"
            checked={source === "manual"}
            onChange={() => onSourceChange("manual")}
            style={{ marginRight: 6 }}
          />
          Manual input
        </label>
        <button
          type="button"
          onClick={() => onSimulateManual(manualSanitized)}
          disabled={!canSimulateManual}
          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc", background: canSimulateManual ? "#1976d2" : "#e0e0e0", color: canSimulateManual ? "#fff" : "#555" }}
          title={canSimulateManual ? "Simulate using manual inputs" : "Select Manual input and enter 8 unique numbers"}
        >
          Simulate
        </button>
      </div>

      {/* Row 2: manual inputs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6 }}>
        {Array.from({ length: 8 }, (_, idx) => (
          <input
            key={idx}
            type="number"
            min={1}
            max={45}
            value={Number.isFinite(sourceNumbers[idx]) ? sourceNumbers[idx] : ""}
            onChange={(e) => {
              const next = manualSanitized.slice();
              const v = Number(e.target.value);
              next[idx] = clampNumber(v);
              onManualValuesChange(next);
            }}
            disabled={source !== "manual"}
            style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #ccc", textAlign: "center" }}
          />
        ))}
      </div>

      {/* Row 3: results */}
      <div style={{ marginTop: 4 }}>
        {!hasEight && (
          <div style={{ color: "#c62828" }}>Need 8 unique numbers from the selected source to list combinations.</div>
        )}
        {hasDupes && (
          <div style={{ color: "#c62828" }}>Numbers must be unique. Remove duplicates to see combos.</div>
        )}
        {hasEight && !hasDupes && (
          <div>
            <div style={{ marginBottom: 6, color: "#444" }}>
              Showing all 28 combos of 6 from 8 (ordered lexicographically).
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 }}>
              {combos.map((combo, idx) => (
                <div key={idx} style={{ border: "1px solid #eee", borderRadius: 6, padding: "6px 8px", background: "#fafafa", fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ color: "#1976d2", marginRight: 6 }}>C{(idx + 1).toString().padStart(2, "0")}:</span>
                  {formatCombo(combo)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

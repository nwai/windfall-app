import React from "react";

interface WeightedTargetListPanelProps {
  userSelectedNumbers: number[];
  weightedTargets: Record<number, number>;
  setWeightedTargets: React.Dispatch<React.SetStateAction<Record<number, number>>>;
}

export const WeightedTargetListPanel: React.FC<WeightedTargetListPanelProps> = ({
  userSelectedNumbers,
  weightedTargets,
  setWeightedTargets
}) => {
  function setWeight(n: number, val: number) {
    setWeightedTargets(prev => ({ ...prev, [n]: val }));
  }
  function resetAll() {
    const next: Record<number, number> = {};
    userSelectedNumbers.forEach(n => (next[n] = 1));
    setWeightedTargets(next);
  }

  const total = userSelectedNumbers.reduce(
    (s, n) => s + (weightedTargets[n] ?? 1),
    0
  );

  return (
    <section style={panel}>
      <h3 style={{ margin: "0 0 6px" }}>Weighted Targets</h3>
      <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>
        Adjust weights (importance) of each selected number. Parameter search uses the sum of weights
        of matched numbers in scoring. Raw match threshold still applies in tandem.
      </div>
      <div style={grid}>
        {userSelectedNumbers.map(n => {
          const w = weightedTargets[n] ?? 1;
          return (
            <div key={n} style={item}>
              <div style={{ fontWeight: 600 }}>{n}</div>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={w}
                onChange={e =>
                  setWeight(
                    n,
                    Math.max(0.1, Number(e.target.value) || 1)
                  )
                }
                style={inp}
                title="Weight (importance factor in scoring)"
              />
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, marginTop: 6 }}>
        Total weight: {total.toFixed(2)}
      </div>
      <button
        type="button"
        onClick={resetAll}
        style={btn}
        title="Reset all weights to 1"
      >
        Reset Weights
      </button>
    </section>
  );
};

const panel: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 8,
  padding: 14,
  background: "#fff",
  marginTop: 16
};
const grid: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10
};
const item: React.CSSProperties = {
  border: "1px solid #d0d7e2",
  background: "#f9fbff",
  borderRadius: 6,
  padding: "6px 8px",
  minWidth: 60,
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12
};
const inp: React.CSSProperties = {
  width: 50,
  fontSize: 12
};
const btn: React.CSSProperties = {
  marginTop: 8,
  padding: "4px 10px",
  fontSize: 11,
  background: "#e3ecf9",
  border: "1px solid #b6c6df",
  borderRadius: 4,
  cursor: "pointer"
};
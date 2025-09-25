import React, { useMemo, useState } from "react";
import { Draw } from "../types";
import {
  buildGPWFNumberWeights,
  buildHC3PenaltyWeights,
  buildSDE1PenaltyWeights,
  combinePerNumberWeights,
} from "../lib/numberBiases";

type MCResult = { number: number; probability: number; count: number };
type LayoutMode = "grid" | "table";

export type MonteCarloAnalyzerProps = {
  history: Draw[];
  excludedNumbers: number[];
  defaultDrawsToUse?: number;
  trendWeights?: Record<number, number>;

  // Uncontrolled (defaults)
  defaultLayout?: LayoutMode;   // default "grid"
  defaultColumns?: number;      // default 12

  // Controlled (global override)
  layout?: LayoutMode;          // if provided, overrides local state and hides layout toggle
  columns?: number;             // if provided, overrides local state and hides columns input
  showLayoutControls?: boolean; // default true; set false to always hide local layout controls
};

function getEmpiricalWeights(history: Draw[], available: number[]): Map<number, number> {
  const freq = new Map<number, number>();
  available.forEach(n => freq.set(n, 0));
  history.forEach(draw => {
    [...draw.main, ...draw.supp].forEach(n => {
      if (freq.has(n)) freq.set(n, freq.get(n)! + 1);
    });
  });
  const total = Array.from(freq.values()).reduce((a, b) => a + b, 0);
  if (total === 0) {
    available.forEach(n => freq.set(n, 1));
    return freq;
  }
  return freq;
}

function weightedSampleWithoutReplacement(pool: number[], weights: number[], count: number) {
  const result: number[] = [];
  const available = [...pool];
  const availWeights = [...weights];
  for (let pick = 0; pick < count; ++pick) {
    const sum = availWeights.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    let idx = 0;
    while (idx < available.length && r >= availWeights[idx]) {
      r -= availWeights[idx];
      ++idx;
    }
    if (idx >= available.length) idx = available.length - 1; // defensive
    result.push(available[idx]);
    available.splice(idx, 1);
    availWeights.splice(idx, 1);
  }
  return result;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const MonteCarloAnalyzer: React.FC<MonteCarloAnalyzerProps> = ({
  history,
  excludedNumbers,
  defaultDrawsToUse = 20,
  defaultLayout = "grid",
  defaultColumns = 12,
  layout: layoutProp,
  columns: columnsProp,
  showLayoutControls = true,
  trendWeights,
}) => {
  // Controls
  const [drawsToUse, setDrawsToUse] = useState<number>(defaultDrawsToUse);
  const [customMode, setCustomMode] = useState<boolean>(false);
  const [simCount, setSimCount] = useState<number>(10000);

  // Bias toggles
  const [useTrendBias, setUseTrendBias] = useState<boolean>(true);
  const [useGPWF, setUseGPWF] = useState<boolean>(false);
  const [useHC3Bias, setUseHC3Bias] = useState<boolean>(true);
  const [useSDE1Bias, setUseSDE1Bias] = useState<boolean>(false);

  // Results
  const [results, setResults] = useState<MCResult[] | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // Local layout state (used only if not controlled)
  const [layoutState, setLayoutState] = useState<LayoutMode>(defaultLayout);
  const [columnsState, setColumnsState] = useState<number>(Math.max(1, defaultColumns || 12));

  // Controlled vs uncontrolled
  const isLayoutControlled = layoutProp !== undefined;
  const isColumnsControlled = columnsProp !== undefined;
  const layout = isLayoutControlled ? (layoutProp as LayoutMode) : layoutState;
  const columns = Math.max(1, isColumnsControlled ? Number(columnsProp) : columnsState);

  // Dense mode heuristics
  const isDense = columns >= 8;
  const probDecimals = columns >= 12 ? 0 : columns >= 8 ? 1 : 2;

  // Derived helpers
  const allNumbers = useMemo(() => Array.from({ length: 45 }, (_, i) => i + 1), []);
  const available = useMemo(
    () => allNumbers.filter(n => !excludedNumbers.includes(n)),
    [allNumbers, excludedNumbers]
  );
  const canRun = available.length >= 8 && drawsToUse > 0 && drawsToUse <= history.length;

  const presetOptions = useMemo(
    () => [5, 10, 15, 20, 30, 45].filter(n => n <= history.length),
    [history.length]
  );

  // Build per-number bias maps
  const recent = useMemo(() => history.slice(-drawsToUse), [history, drawsToUse]);

  const gpwfWeights = useMemo(
    () => buildGPWFNumberWeights(recent),
    [recent]
  );
  const hc3Weights = useMemo(
    () => buildHC3PenaltyWeights(history),
    [history]
  );
  const sde1Weights = useMemo(
    () => buildSDE1PenaltyWeights(history),
    [history]
  );

  const combinedBiasWeights = useMemo(() => {
    return combinePerNumberWeights(
      useTrendBias ? (trendWeights ?? undefined) : undefined,
      useGPWF ? gpwfWeights : undefined,
      useHC3Bias ? hc3Weights : undefined,
      useSDE1Bias ? sde1Weights : undefined
    );
  }, [useTrendBias, useGPWF, useHC3Bias, useSDE1Bias, trendWeights, gpwfWeights, hc3Weights, sde1Weights]);

  const runSimulation = () => {
    setIsRunning(true);
    setTimeout(() => {
      const recent = history.slice(-drawsToUse);
      const weightsMap = getEmpiricalWeights(recent, available);
      const weights = available.map(n => {
        const base = (weightsMap.get(n) ?? 0) + 1; // Laplace smoothing
        const mult = combinedBiasWeights[n] ?? 1;  // Bias multiplier(s)
        return base * mult;
      });
      const countMap = new Map<number, number>();
      available.forEach(n => countMap.set(n, 0));

      for (let sim = 0; sim < simCount; ++sim) {
        const draw = weightedSampleWithoutReplacement(available, weights, 8);
        draw.forEach(n => countMap.set(n, (countMap.get(n) || 0) + 1));
      }

      const resultsArr: MCResult[] = available.map(n => ({
        number: n,
        count: countMap.get(n)!,
        probability: countMap.get(n)! / (simCount * 8),
      }));
      resultsArr.sort((a, b) => b.probability - a.probability);

      setResults(resultsArr);
      setIsRunning(false);
    }, 50);
  };

  // Pre-chunk for table layout
  const rowsTable = useMemo(
    () => (results ? chunk(results, Math.max(1, columns)) : []),
    [results, columns]
  );

  // Compact sizing for dense modes
  const SZ = {
    pad: isDense ? 4 : 8,
    fsBase: isDense ? 11 : 15,
    fsRank: isDense ? 10 : 12,
    fsNum: isDense ? 14 : 20,
    fsLabel: isDense ? 10 : 12,
    fsValue: isDense ? 11 : 14,
  };

  const showControls = showLayoutControls && (!isLayoutControlled || !isColumnsControlled);

  return (
    <section
      style={{
        border: "2px solid #ffd700",
        borderRadius: 8,
        padding: 24,
        margin: "24px 0",
        background: "#fffbe6",
      }}
    >
      <h3>Monte Carlo Analyzer</h3>

      {/* Controls */}
      <div style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
        <label>
          <b>Draws to use:</b>{" "}
          <select
            value={customMode ? "custom" : String(drawsToUse)}
            onChange={e => {
              if (e.target.value === "custom") {
                setCustomMode(true);
                if (drawsToUse <= 0) setDrawsToUse(10);
              } else {
                setCustomMode(false);
                setDrawsToUse(Number(e.target.value));
              }
            }}
            style={{ fontSize: 15, marginRight: 10 }}
          >
            {presetOptions.map(n =>
              <option key={n} value={n}>{n} most recent</option>
            )}
            <option key="custom" value="custom">Custom…</option>
          </select>
          {customMode && (
            <input
              type="number"
              value={drawsToUse}
              min={1}
              max={history.length}
              onChange={e => setDrawsToUse(Number(e.target.value))}
              style={{ width: 70, marginLeft: 8 }}
              placeholder="Custom"
            />
          )}
        </label>

        <label>
          <b>Simulations:</b>{" "}
          <input
            type="number"
            min={1000}
            max={1000000}
            value={simCount}
            onChange={e => setSimCount(Number(e.target.value))}
            style={{ width: 100 }}
          />{" "}
          runs
        </label>

        {/* Layout Toggle (hidden if fully controlled) */}
        {showControls && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            {!isLayoutControlled && (
              <div style={{ display: "inline-flex", border: "1px solid #ccc", borderRadius: 6, overflow: "hidden" }}>
                <button
                  type="button"
                  onClick={() => setLayoutState("grid")}
                  style={{
                    padding: "6px 10px",
                    background: layout === "grid" ? "#ffd700" : "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: layout === "grid" ? 700 : 500,
                  }}
                  aria-pressed={layout === "grid"}
                >
                  Grid
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutState("table")}
                  style={{
                    padding: "6px 10px",
                    background: layout === "table" ? "#ffd700" : "#fff",
                    borderLeft: "1px solid #ccc",
                    borderRight: "none",
                    borderTop: "none",
                    borderBottom: "none",
                    cursor: "pointer",
                    fontWeight: layout === "table" ? 700 : 500,
                  }}
                  aria-pressed={layout === "table"}
                >
                  Table
                </button>
              </div>
            )}

            {!isColumnsControlled && (
              <label>
                <b>Columns:</b>{" "}
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={columns}
                  onChange={e =>
                    setColumnsState(Math.max(1, Math.min(12, Number(e.target.value) || 1)))
                  }
                  style={{ width: 60 }}
                />
              </label>
            )}
          </div>
        )}
      </div>

      {/* Biases */}
      <div
        style={{
          margin: "8px 0 14px 0",
          padding: "8px 10px",
          background: "#fff8d6",
          border: "1px solid #e0c36c",
          borderRadius: 6,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <b>Biases:</b>
        <label>
          <input
            type="checkbox"
            checked={useTrendBias}
            onChange={(e) => setUseTrendBias(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Trends (Δ 14→30)
        </label>
        <label>
          <input
            type="checkbox"
            checked={useGPWF}
            onChange={(e) => setUseGPWF(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          GPWF (recent freq)
        </label>
        <label>
          <input
            type="checkbox"
            checked={useHC3Bias}
            onChange={(e) => setUseHC3Bias(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          HC3 (last 2 draws)
        </label>
        <label>
          <input
            type="checkbox"
            checked={useSDE1Bias}
            onChange={(e) => setUseSDE1Bias(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          SDE1 (last-digit dupes)
        </label>
      </div>

      {/* Exclusions summary */}
      <div style={{ marginBottom: 10 }}>
        <b>Excluded numbers:</b>{" "}
        {excludedNumbers.length === 0 ? <span style={{color: '#888'}}>none</span> : excludedNumbers.join(", ")}
      </div>

      {/* Action */}
      <button
        onClick={runSimulation}
        disabled={!canRun || isRunning}
        style={{
          fontSize: 16,
          padding: "6px 22px",
          background: "#ffd700",
          border: "1px solid #aaa",
          borderRadius: 4,
          fontWeight: 700,
          opacity: canRun && !isRunning ? 1 : 0.5,
          cursor: canRun && !isRunning ? "pointer" : "default"
        }}
      >
        {isRunning ? "Running..." : "Run Monte Carlo"}
      </button>

      {/* Results */}
      <div style={{ marginTop: 26 }}>
        {results && (
          <div>
            <h4>Results ({results.length} numbers):</h4>

            {layout === "table" ? (
              // Table layout with fixed table and overflow-safe cells
              <table
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
                  tableLayout: "fixed",
                  fontSize: SZ.fsBase,
                }}
              >
                <tbody>
                  {rowsTable.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((res, cIdx) => {
                        const idxGlobal = rIdx * Math.max(1, columns) + cIdx;
                        const highlight = idxGlobal < 8;
                        return (
                          <td
                            key={res.number}
                            style={{
                              verticalAlign: "top",
                              width: `${100 / Math.max(1, columns)}%`,
                              padding: SZ.pad,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              boxSizing: "border-box",
                              border: "1px solid #eee",
                              background: highlight ? "#fff7d6" : "#fff",
                            }}
                            title={`#${res.number} • ${(res.probability * 100).toFixed(probDecimals)}% • ${res.count} hits`}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: SZ.fsRank, color: "#888", marginBottom: 2 }}>
                                R{idxGlobal + 1}
                              </div>
                              <div style={{ fontSize: SZ.fsNum, fontWeight: 800, marginBottom: 4 }}>
                                #{res.number}
                              </div>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr auto",
                                  gap: 4,
                                  alignItems: "baseline",
                                  minWidth: 0,
                                }}
                              >
                                <span style={{ fontSize: SZ.fsLabel, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                                  Prob
                                </span>
                                <b style={{ fontSize: SZ.fsValue }}>
                                  {(res.probability * 100).toFixed(probDecimals)}%
                                </b>
                                <span style={{ fontSize: SZ.fsLabel, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                                  Hits
                                </span>
                                <b style={{ fontSize: SZ.fsValue }}>{res.count}</b>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                      {Array.from({
                        length: Math.max(0, Math.max(1, columns) - row.length),
                      }).map((_, padIdx) => (
                        <td
                          key={`pad-${padIdx}`}
                          style={{
                            width: `${100 / Math.max(1, columns)}%`,
                            padding: SZ.pad,
                            boxSizing: "border-box",
                            border: "1px solid #eee",
                          }}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              // Grid layout with compact cards and safe overflow
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))`,
                  gap: 8,
                }}
              >
                {results.map((res, i) => {
                  const highlight = i < 8;
                  return (
                    <div
                      key={res.number}
                      style={{
                        border: "1px solid #eee",
                        borderRadius: 6,
                        padding: SZ.pad,
                        background: highlight ? "#fff7d6" : "#fff",
                        overflow: "hidden",
                        boxSizing: "border-box",
                        fontSize: SZ.fsBase,
                        minWidth: 0,
                      }}
                      title={`#${res.number} • ${(res.probability * 100).toFixed(probDecimals)}% • ${res.count} hits`}
                    >
                      <div style={{ fontSize: SZ.fsRank, color: "#888", marginBottom: 2 }}>R{i + 1}</div>
                      <div style={{ fontSize: SZ.fsNum, fontWeight: 800, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis" }}>
                        #{res.number}
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: 4,
                          alignItems: "baseline",
                          minWidth: 0,
                        }}
                      >
                        <span style={{ fontSize: SZ.fsLabel, overflow: "hidden", textOverflow: "ellipsis" }}>
                          Prob
                        </span>
                        <b style={{ fontSize: SZ.fsValue }}>
                          {(res.probability * 100).toFixed(probDecimals)}%
                        </b>
                        <span style={{ fontSize: SZ.fsLabel, overflow: "hidden", textOverflow: "ellipsis" }}>
                          Hits
                        </span>
                        <b style={{ fontSize: SZ.fsValue }}>{res.count}</b>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
              Probabilities are empirical, based on {simCount.toLocaleString()} simulations using weighted sampling
              from the last {drawsToUse} draws and current exclusions.
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
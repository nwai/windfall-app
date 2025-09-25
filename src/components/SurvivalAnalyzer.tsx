import React, { useState, useMemo } from "react";
import { Draw } from "../types";
import {
  buildGPWFNumberWeights,
  buildHC3PenaltyWeights,
  buildSDE1PenaltyWeights,
  combinePerNumberWeights,
} from "../lib/numberBiases";

// Helper: for a given number, build draw-wise event log (1 if drawn, 0 if not, for each draw)
function buildEventLog(history: Draw[], number: number) {
  return history.map(draw =>
    (draw.main.includes(number) || draw.supp.includes(number)) ? 1 : 0
  );
}

// Compute time-to-event per number, and right-censoring if never drawn in window
function buildSurvivalData(history: Draw[], number: number) {
  const events = buildEventLog(history, number);
  let times: number[] = [];
  let censored = false;
  let current = 0;
  for (let i = 0; i < events.length; ++i) {
    current++;
    if (events[i]) {
      times.push(current);
      current = 0;
    }
  }
  // If number not drawn in the window, treat as censored at window length
  if (current > 0) {
    times.push(current);
    censored = true;
  }
  return { times, censored };
}

// Kaplan-Meier estimator for a single number
function kaplanMeier(times: number[], window: number) {
  let n = times.length;
  let surv = 1.0;
  let km: number[] = [1.0];
  let sorted = times.slice().sort((a, b) => a - b);
  let last = 0;
  for (let i = 0; i < sorted.length; ++i) {
    let t = sorted[i];
    if (t === last) continue;
    surv *= (n - 1) / n;
    km.push(surv);
    n--;
    last = t;
  }
  // Probability of appearance in next draw is the first drop in survival curve
  return { curve: km, probNext: 1 - (km[1] ?? 1) };
}

export const SurvivalAnalyzer: React.FC<{
  history: Draw[];
  excludedNumbers: number[];
  defaultWindow?: number;
  probabilityHeading?: string;
  // New: external trend weights (Δ 14→30)
  trendWeights?: Record<number, number>;
}> = ({
  history,
  excludedNumbers,
  defaultWindow = 20,
  probabilityHeading,
  trendWeights,
}) => {
  const [windowSize, setWindowSize] = useState<number>(defaultWindow);
  const [customMode, setCustomMode] = useState<boolean>(false);
  const [pendingWindow, setPendingWindow] = useState<number>(defaultWindow);
  const [results, setResults] = useState<any[] | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // Bias toggles + gamma
  const [useTrendBias, setUseTrendBias] = useState<boolean>(true);
  const [useGPWF, setUseGPWF] = useState<boolean>(false);
  const [useHC3Bias, setUseHC3Bias] = useState<boolean>(true);
  const [useSDE1Bias, setUseSDE1Bias] = useState<boolean>(false);
  const [gamma, setGamma] = useState<number>(0.7);

  // Sort control
  const [sortBy, setSortBy] = useState<"biased" | "base" | "number">("biased");

  // Defensive: don't analyze if not enough draws
  const canRun = windowSize > 2 && windowSize <= history.length;
  const canCustomRun = pendingWindow > 2 && pendingWindow <= history.length;

  // Use only the N most recent draws
  const recent = useMemo(
    () => history.slice(-windowSize),
    [history, windowSize]
  );

  // Compute survival stats for all numbers 1–45
  const computeStats = (recentDraws: Draw[]) => {
    return Array.from({ length: 45 }, (_, i) => {
      const n = i + 1;
      if (excludedNumbers.includes(n))
        return { number: n, probNext: 0, times: [], censored: true, lastSeen: null };
      const { times, censored } = buildSurvivalData(recentDraws, n);
      const { probNext } = kaplanMeier(times, recentDraws.length);
      // Most recent draw where n appeared
      let lastSeen = null;
      for (let j = recentDraws.length - 1; j >= 0; --j) {
        if (recentDraws[j].main.includes(n) || recentDraws[j].supp.includes(n)) {
          lastSeen = recentDraws.length - j;
          break;
        }
      }
      return { number: n, probNext, times, censored, lastSeen };
    });
  };

  // Initial and whenever windowSize changes (but not in custom mode)
  React.useEffect(() => {
    if (!canRun || customMode) return;
    setIsRunning(true);
    setTimeout(() => {
      setResults(computeStats(recent));
      setIsRunning(false);
    }, 0);
    // eslint-disable-next-line
  }, [windowSize, excludedNumbers, history, customMode]);

  // Build per-number bias maps
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

  // Enrich with biased probabilities and sort
  const enriched = useMemo(() => {
    if (!results) return [];
    return results.map((r) => {
      const w = combinedBiasWeights[r.number] ?? 1;
      const biased = r.probNext * Math.pow(w, gamma);
      return { ...r, biasedProb: biased, baseProb: r.probNext };
    });
  }, [results, combinedBiasWeights, gamma]);

  const sortedStats = useMemo(() => {
    const arr = enriched.slice();
    if (sortBy === "biased") arr.sort((a, b) => b.biasedProb - a.biasedProb || a.number - b.number);
    else if (sortBy === "base") arr.sort((a, b) => b.baseProb - a.baseProb || a.number - b.number);
    else arr.sort((a, b) => a.number - b.number);
    return arr;
  }, [enriched, sortBy]);

  const presetOptions = [5, 10, 15, 20, 30, 45].filter(n => n <= history.length);

  const handleCustomRun = () => {
    setIsRunning(true);
    setWindowSize(pendingWindow);
    setTimeout(() => {
      setResults(computeStats(history.slice(-pendingWindow)));
      setIsRunning(false);
    }, 0);
  };

  // Prepare columns for 3-column display of all 45 numbers
  const numCols = 3;
  const rowsPerCol = 15;
  const columns = Array.from({ length: numCols }, (_, colIdx) =>
    sortedStats.slice(colIdx * rowsPerCol, (colIdx + 1) * rowsPerCol)
  );

  return (
    <section style={{
      border: "2px solid #00bcd4",
      borderRadius: 8,
      padding: 24,
      margin: "24px 0",
      background: "#e0f7fa"
    }}>
      <h3>Survival Analysis: Time-to-Event Probability</h3>
      <div style={{ marginBottom: 10 }}>
        <label>
          <b>Draws to analyze:</b>{" "}
          <select
            value={customMode ? "custom" : windowSize}
            onChange={e => {
              if (e.target.value === "custom") {
                setCustomMode(true);
                setPendingWindow(windowSize);
              } else {
                setCustomMode(false);
                setWindowSize(Number(e.target.value));
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
            <>
              <input
                type="number"
                value={pendingWindow}
                min={3}
                max={history.length}
                onChange={e => setPendingWindow(Number(e.target.value))}
                style={{ width: 70, marginLeft: 8 }}
                placeholder="Custom"
              />
              <button
                style={{ marginLeft: 10, fontWeight: 600, background: "#00bcd4", color: "#fff", border: "none", borderRadius: 3, padding: "4px 10px", cursor: canCustomRun && !isRunning ? "pointer" : "not-allowed", opacity: canCustomRun && !isRunning ? 1 : 0.5 }}
                disabled={!canCustomRun || isRunning}
                onClick={handleCustomRun}
              >
                {isRunning ? "Running..." : "Run Survival Analysis"}
              </button>
            </>
          )}
        </label>
      </div>

      {/* Biases */}
      <div
        style={{
          margin: "8px 0 10px 0",
          padding: "8px 10px",
          background: "#dbf5f9",
          border: "1px solid #90e0ef",
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
        <span style={{ marginLeft: 8 }}>
          <b>Gamma:</b>{" "}
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={gamma}
            onChange={(e) => setGamma(Number(e.target.value))}
            style={{ width: 70 }}
            title="Exponent for bias strength: Biased = Base × weight^gamma"
          />
        </span>
        <span style={{ marginLeft: "auto" }}>
          <b>Sort by:</b>{" "}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} style={{ fontSize: 14 }}>
            <option value="biased">Biased Prob</option>
            <option value="base">Base Prob</option>
            <option value="number">Number</option>
          </select>
        </span>
      </div>

      <div style={{ marginBottom: 8 }}>
        <b>Excluded numbers:</b>{" "}
        {excludedNumbers.length === 0 ? <span style={{ color: '#888' }}>none</span> :
          excludedNumbers.join(", ")}
      </div>
      {canRun && results ? (
        <div>
          <h4>{probabilityHeading ?? "Probability of Appearance in Next Draw (Per Number):"}</h4>
          <div style={{ display: "flex", gap: 28, marginTop: 18 }}>
            {columns.map((col, colIdx) => (
              <table
                key={colIdx}
                style={{
                  borderCollapse: "collapse",
                  fontSize: 15,
                  minWidth: 260,
                  background: "#fff",
                  border: "1px solid #b2ebf2",
                }}
              >
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "2px 8px" }}>#</th>
                    <th style={{ textAlign: "left", padding: "2px 8px" }}>Number</th>
                    <th style={{ textAlign: "right", padding: "2px 8px" }}>Base</th>
                    <th style={{ textAlign: "right", padding: "2px 8px" }}>Biased</th>
                    <th style={{ textAlign: "right", padding: "2px 8px" }}>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {col.map((res: any, i: number) => (
                    <tr key={res.number}>
                      <td style={{ padding: "2px 8px", color: "#1976d2" }}>{colIdx * rowsPerCol + i + 1}</td>
                      <td style={{ padding: "2px 8px" }}>
                        <b>{res.number}</b>
                      </td>
                      <td style={{ padding: "2px 8px", textAlign: "right" }}>
                        {(res.baseProb * 100).toFixed(2)}%
                      </td>
                      <td style={{ padding: "2px 8px", textAlign: "right", color: "#00796b", fontWeight: 700 }}>
                        {(res.biasedProb * 100).toFixed(2)}%
                      </td>
                      <td style={{ padding: "2px 8px", textAlign: "right" }}>
                        {res.lastSeen ? `${res.lastSeen} draws ago` : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
            Base = Kaplan–Meier probability. Biased = Base × weight^gamma using enabled per-number biases.
          </div>
        </div>
      ) : (
        <div style={{ color: "#c00" }}>Not enough draws to run analysis.</div>
      )}
    </section>
  );
};
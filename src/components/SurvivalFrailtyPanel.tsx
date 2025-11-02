/**
 * SurvivalFrailtyPanel Component
 * 
 * Implements frailty model for recurrent events (repeated appearances/disappearances)
 * Uses gamma frailty approximation
 */

import React, { useState, useMemo } from "react";
import { Draw } from "../types";

interface SurvivalFrailtyPanelProps {
  history: Draw[];
  excludedNumbers?: number[];
}

interface FrailtyResult {
  number: number;
  frailty: number; // unobserved heterogeneity factor
  eventCount: number; // number of recurrent events
  avgInterEventTime: number;
  hazardRate: number;
  nextEventProb: number;
}

export const SurvivalFrailtyPanel: React.FC<SurvivalFrailtyPanelProps> = ({
  history,
  excludedNumbers = [],
}) => {
  const [isCalculated, setIsCalculated] = useState(false);
  const [results, setResults] = useState<FrailtyResult[]>([]);
  const [sortBy, setSortBy] = useState<"frailty" | "number">("frailty");
  const [theta, setTheta] = useState<number>(1.0); // frailty variance parameter

  const numbers = useMemo(
    () => Array.from({ length: 45 }, (_, i) => i + 1).filter(n => !excludedNumbers.includes(n)),
    [excludedNumbers]
  );

  /**
   * Calculate gamma frailty model
   * Frailty represents unobserved heterogeneity - numbers with different "propensities" to appear
   */
  const calculateFrailtyModel = () => {
    const newResults: FrailtyResult[] = [];

    for (const num of numbers) {
      // Find all appearances (recurrent events)
      const events: number[] = [];
      history.forEach((draw, idx) => {
        if (draw.main.includes(num) || draw.supp.includes(num)) {
          events.push(idx);
        }
      });

      const eventCount = events.length;
      
      // Calculate inter-event times
      const interEventTimes: number[] = [];
      for (let i = 1; i < events.length; i++) {
        interEventTimes.push(events[i] - events[i - 1]);
      }

      const avgInterEventTime = interEventTimes.length > 0
        ? interEventTimes.reduce((s, t) => s + t, 0) / interEventTimes.length
        : 0;

      // Estimate frailty parameter (gamma distributed)
      // Higher frailty = higher propensity for events
      // Formula: frailty_i ~ Gamma(1/theta, 1/theta)
      // Estimate based on observed vs expected event rate
      const expectedRate = eventCount / history.length;
      const observedVariance = interEventTimes.length > 1
        ? calculateVariance(interEventTimes)
        : 0;

      // Frailty estimate (simplified)
      // Numbers that appear more consistently (lower variance) have lower frailty
      const frailty = expectedRate > 0
        ? 1 + (observedVariance / (avgInterEventTime * avgInterEventTime) - 1) * theta
        : 1;

      // Hazard rate with frailty
      const baseHazard = 1 / (avgInterEventTime || 1);
      const hazardRate = baseHazard * Math.max(0.1, frailty);

      // Probability of next event in next draw
      const nextEventProb = 1 - Math.exp(-hazardRate);

      newResults.push({
        number: num,
        frailty: Math.max(0.1, frailty),
        eventCount,
        avgInterEventTime,
        hazardRate,
        nextEventProb,
      });
    }

    setResults(newResults);
    setIsCalculated(true);
  };

  const sortedResults = useMemo(() => {
    const sorted = [...results];
    if (sortBy === "frailty") {
      sorted.sort((a, b) => b.frailty - a.frailty);
    } else {
      sorted.sort((a, b) => a.number - b.number);
    }
    return sorted;
  }, [results, sortBy]);

  const calculateVariance = (values: number[]): number => {
    if (values.length < 2) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
    return variance;
  };

  return (
    <section style={{ padding: "1rem", background: "#fff", borderRadius: "8px", marginBottom: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>🎲 Frailty Model (Recurrent Events)</h2>
      
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        Models repeated appearances/disappearances using gamma frailty to capture unobserved heterogeneity.
        Numbers with higher frailty have more variable appearance patterns.
      </p>

      {/* Model Info */}
      <div style={{ marginBottom: "1rem", padding: "1rem", background: "#fff3cd", borderRadius: "4px", fontSize: "0.85rem" }}>
        <strong>About Frailty Models:</strong>
        <ul style={{ marginTop: "0.5rem", marginBottom: 0, paddingLeft: "1.5rem" }}>
          <li>Captures unobserved heterogeneity (different "propensities" to appear)</li>
          <li>Gamma frailty is standard for recurrent event analysis</li>
          <li>High frailty: More variable, less predictable patterns</li>
          <li>Low frailty: More consistent, regular appearance patterns</li>
        </ul>
      </div>

      {/* Controls */}
      <div style={{ marginBottom: "1rem", padding: "1rem", background: "#f5f5f5", borderRadius: "4px" }}>
        <div style={{ marginBottom: "1rem" }}>
          <label>
            Frailty Variance (θ):
            <input
              type="range"
              min="0.1"
              max="5"
              step="0.1"
              value={theta}
              onChange={(e) => setTheta(parseFloat(e.target.value))}
              style={{ marginLeft: "0.5rem", width: "200px" }}
            />
            <span style={{ marginLeft: "0.5rem", fontWeight: "bold" }}>{theta.toFixed(1)}</span>
          </label>
          <div style={{ fontSize: "0.8rem", color: "#666", marginTop: "0.25rem" }}>
            Higher θ = more heterogeneity between numbers
          </div>
        </div>

        <button
          onClick={calculateFrailtyModel}
          disabled={history.length < 50}
          style={{
            padding: "0.5rem 1rem",
            background: isCalculated ? "#28a745" : "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          {isCalculated ? "✓ Recalculate" : "Calculate Frailty Model"}
        </button>
        
        {history.length < 50 && (
          <span style={{ marginLeft: "1rem", color: "#dc3545", fontSize: "0.9rem" }}>
            Need at least 50 draws
          </span>
        )}
      </div>

      {/* Results Table */}
      {isCalculated && results.length > 0 && (
        <>
          <div style={{ marginBottom: "1rem" }}>
            <label>
              Sort by:
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "frailty" | "number")}
                style={{ marginLeft: "0.5rem", padding: "0.25rem" }}
              >
                <option value="frailty">Frailty (High to Low)</option>
                <option value="number">Number</option>
              </select>
            </label>
          </div>

          <div style={{ maxHeight: "500px", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f8f9fa" }}>
                <tr>
                  <th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>Number</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Frailty</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Events</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Avg Gap</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Hazard Rate</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Next Event %</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((result) => {
                  const frailtyColor = result.frailty > 1.5 ? "#dc3545" : 
                                      result.frailty > 1.0 ? "#ffc107" : "#28a745";

                  return (
                    <tr key={result.number} style={{ borderBottom: "1px solid #dee2e6" }}>
                      <td style={{ padding: "0.5rem", fontWeight: "bold" }}>
                        {result.number}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right", color: frailtyColor, fontWeight: "bold" }}>
                        {result.frailty.toFixed(2)}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {result.eventCount}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {result.avgInterEventTime.toFixed(1)}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {result.hazardRate.toFixed(3)}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {(result.nextEventProb * 100).toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div style={{ marginTop: "1rem", padding: "1rem", background: "#f8f9fa", borderRadius: "4px" }}>
            <strong>Summary:</strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem", marginTop: "0.5rem", fontSize: "0.9rem" }}>
              <div>High Frailty (&gt;1.5): <strong>{results.filter(r => r.frailty > 1.5).length}</strong></div>
              <div>Medium (1.0-1.5): <strong>{results.filter(r => r.frailty >= 1.0 && r.frailty <= 1.5).length}</strong></div>
              <div>Low (&lt;1.0): <strong>{results.filter(r => r.frailty < 1.0).length}</strong></div>
            </div>
          </div>
        </>
      )}

      {!isCalculated && (
        <div style={{ padding: "2rem", textAlign: "center", color: "#6c757d" }}>
          Calculate frailty model to see results
        </div>
      )}
    </section>
  );
};

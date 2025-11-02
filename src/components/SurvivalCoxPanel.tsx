/**
 * SurvivalCoxPanel Component
 * 
 * Implements Cox Proportional Hazards model (simplified JS approximation)
 * For full implementation, would use Pyodide + Python lifelines
 */

import React, { useState, useMemo } from "react";
import { Draw } from "../types";
import { extractFeaturesForNumber } from "../lib/churnFeatures";

interface SurvivalCoxPanelProps {
  history: Draw[];
  excludedNumbers?: number[];
}

interface CoxResult {
  number: number;
  hazardRatio: number;
  survivalProbability: number;
  riskScore: number;
}

export const SurvivalCoxPanel: React.FC<SurvivalCoxPanelProps> = ({
  history,
  excludedNumbers = [],
}) => {
  const [isCalculated, setIsCalculated] = useState(false);
  const [results, setResults] = useState<CoxResult[]>([]);
  const [sortBy, setSortBy] = useState<"risk" | "number">("risk");

  const numbers = useMemo(
    () => Array.from({ length: 45 }, (_, i) => i + 1).filter(n => !excludedNumbers.includes(n)),
    [excludedNumbers]
  );

  /**
   * Simplified Cox PH approximation
   * Real implementation would use partial likelihood estimation
   * This uses a heuristic based on frequency and recency
   */
  const calculateCoxModel = () => {
    const currentIdx = history.length - 1;
    const newResults: CoxResult[] = [];

    for (const num of numbers) {
      const features = extractFeaturesForNumber(history, num, currentIdx);

      // Simple risk score based on features
      // Lower frequency and longer time since last = higher hazard
      const freqScore = features.freqTotal / history.length;
      const recencyScore = Math.exp(-features.timeSinceLast / 20);
      
      // Hazard ratio (relative to baseline)
      // Higher value = higher risk of "event" (not appearing)
      const hazardRatio = (1 - freqScore) * (1 - recencyScore) + 0.5;
      
      // Survival probability (inverse of hazard)
      const survivalProbability = Math.exp(-hazardRatio);
      
      // Risk score for ranking
      const riskScore = hazardRatio * (1 + features.timeSinceLast / 100);

      newResults.push({
        number: num,
        hazardRatio,
        survivalProbability,
        riskScore,
      });
    }

    setResults(newResults);
    setIsCalculated(true);
  };

  const sortedResults = useMemo(() => {
    const sorted = [...results];
    if (sortBy === "risk") {
      sorted.sort((a, b) => b.riskScore - a.riskScore);
    } else {
      sorted.sort((a, b) => a.number - b.number);
    }
    return sorted;
  }, [results, sortBy]);

  return (
    <section style={{ padding: "1rem", background: "#fff", borderRadius: "8px", marginBottom: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>📊 Cox Proportional Hazards Model</h2>
      
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        Semi-parametric survival model that estimates the hazard (risk) of a number not appearing.
        <strong> Note:</strong> This is a simplified JS approximation. For full Cox PH with covariates,
        use Pyodide + Python lifelines library.
      </p>

      {/* Model Info */}
      <div style={{ marginBottom: "1rem", padding: "1rem", background: "#e3f2fd", borderRadius: "4px", fontSize: "0.85rem" }}>
        <strong>About Cox PH Model:</strong>
        <ul style={{ marginTop: "0.5rem", marginBottom: 0, paddingLeft: "1.5rem" }}>
          <li>Estimates hazard ratio (HR) for each number relative to baseline</li>
          <li>HR &gt; 1: Higher risk of not appearing (compared to average)</li>
          <li>HR &lt; 1: Lower risk (more likely to appear)</li>
          <li>Takes into account time-varying patterns and covariates</li>
        </ul>
      </div>

      {/* Calculate Button */}
      <div style={{ marginBottom: "1rem" }}>
        <button
          onClick={calculateCoxModel}
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
          {isCalculated ? "✓ Recalculate" : "Calculate Cox Model"}
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
                onChange={(e) => setSortBy(e.target.value as "risk" | "number")}
                style={{ marginLeft: "0.5rem", padding: "0.25rem" }}
              >
                <option value="risk">Risk Score (High to Low)</option>
                <option value="number">Number</option>
              </select>
            </label>
          </div>

          <div style={{ maxHeight: "500px", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f8f9fa" }}>
                <tr>
                  <th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>Number</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Hazard Ratio</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Survival Prob</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Risk Score</th>
                  <th style={{ padding: "0.5rem", textAlign: "center", borderBottom: "2px solid #dee2e6" }}>Risk Level</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((result) => {
                  const riskLevel = result.hazardRatio > 1.2 ? "High" : 
                                   result.hazardRatio > 0.8 ? "Medium" : "Low";
                  const riskColor = result.hazardRatio > 1.2 ? "#dc3545" : 
                                   result.hazardRatio > 0.8 ? "#ffc107" : "#28a745";

                  return (
                    <tr key={result.number} style={{ borderBottom: "1px solid #dee2e6" }}>
                      <td style={{ padding: "0.5rem", fontWeight: "bold" }}>
                        {result.number}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {result.hazardRatio.toFixed(3)}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {(result.survivalProbability * 100).toFixed(1)}%
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {result.riskScore.toFixed(3)}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "center" }}>
                        <span style={{ 
                          padding: "0.25rem 0.5rem", 
                          background: riskColor, 
                          color: "white", 
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                        }}>
                          {riskLevel}
                        </span>
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
              <div>High Risk (HR&gt;1.2): <strong>{results.filter(r => r.hazardRatio > 1.2).length}</strong></div>
              <div>Medium Risk (0.8-1.2): <strong>{results.filter(r => r.hazardRatio >= 0.8 && r.hazardRatio <= 1.2).length}</strong></div>
              <div>Low Risk (HR&lt;0.8): <strong>{results.filter(r => r.hazardRatio < 0.8).length}</strong></div>
            </div>
          </div>
        </>
      )}

      {!isCalculated && (
        <div style={{ padding: "2rem", textAlign: "center", color: "#6c757d" }}>
          Calculate Cox model to see hazard ratios
        </div>
      )}
    </section>
  );
};

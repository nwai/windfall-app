/**
 * ConsensusPanel Component
 * 
 * Aggregates and visualizes predictions from all survival/churn models
 * Shows agreements and disagreements across models
 */

import React, { useState, useMemo } from "react";
import { Draw } from "../types";

interface ModelPrediction {
  modelName: string;
  score: number; // 0-1, higher = more likely to appear/lower churn risk
  rank: number;
}

interface ConsensusResult {
  number: number;
  predictions: ModelPrediction[];
  consensusScore: number; // average of all model scores
  consensusRank: number;
  agreement: number; // 0-1, how much models agree
  modelCount: number;
}

interface ConsensusPanelProps {
  history: Draw[];
  excludedNumbers?: number[];
  
  // Model predictions (injected from parent or other panels)
  churnPredictions?: Array<{ number: number; probability: number }>;
  returnPredictions?: Array<{ number: number; probability: number }>;
  coxPredictions?: Array<{ number: number; survivalProb: number }>;
  frailtyPredictions?: Array<{ number: number; nextEventProb: number }>;
  survivalPredictions?: Array<{ number: number; probability: number }>;
}

export const ConsensusPanel: React.FC<ConsensusPanelProps> = ({
  history,
  excludedNumbers = [],
  churnPredictions = [],
  returnPredictions = [],
  coxPredictions = [],
  frailtyPredictions = [],
  survivalPredictions = [],
}) => {
  const [sortBy, setSortBy] = useState<"consensus" | "agreement" | "number">("consensus");
  const [filterAgreement, setFilterAgreement] = useState<number>(0); // minimum agreement threshold
  const [showOnlyAgreement, setShowOnlyAgreement] = useState(false);

  const numbers = useMemo(
    () => Array.from({ length: 45 }, (_, i) => i + 1).filter(n => !excludedNumbers.includes(n)),
    [excludedNumbers]
  );

  const consensusResults = useMemo(() => {
    const results: ConsensusResult[] = [];

    for (const num of numbers) {
      const predictions: ModelPrediction[] = [];

      // Aggregate predictions from all available models
      // Convert all to 0-1 scale where 1 = high probability of appearing

      // Churn predictor: invert (1 - churnProb = appearance likelihood)
      const churnPred = churnPredictions.find(p => p.number === num);
      if (churnPred) {
        predictions.push({
          modelName: "Churn ML",
          score: 1 - churnPred.probability,
          rank: 0,
        });
      }

      // Return predictor: use directly (return = will appear)
      const returnPred = returnPredictions.find(p => p.number === num);
      if (returnPred) {
        predictions.push({
          modelName: "Return ML",
          score: returnPred.probability,
          rank: 0,
        });
      }

      // Cox survival: use survival probability
      const coxPred = coxPredictions.find(p => p.number === num);
      if (coxPred) {
        predictions.push({
          modelName: "Cox PH",
          score: coxPred.survivalProb,
          rank: 0,
        });
      }

      // Frailty: use next event probability
      const frailtyPred = frailtyPredictions.find(p => p.number === num);
      if (frailtyPred) {
        predictions.push({
          modelName: "Frailty",
          score: frailtyPred.nextEventProb,
          rank: 0,
        });
      }

      // Kaplan-Meier survival
      const survivalPred = survivalPredictions.find(p => p.number === num);
      if (survivalPred) {
        predictions.push({
          modelName: "K-M Survival",
          score: survivalPred.probability,
          rank: 0,
        });
      }

      if (predictions.length === 0) continue;

      // Calculate consensus score (average)
      const consensusScore = predictions.reduce((sum, p) => sum + p.score, 0) / predictions.length;

      // Calculate agreement (1 - coefficient of variation)
      const variance = predictions.reduce((sum, p) => sum + Math.pow(p.score - consensusScore, 2), 0) / predictions.length;
      const stdDev = Math.sqrt(variance);
      const cv = consensusScore > 0 ? stdDev / consensusScore : 0;
      const agreement = Math.max(0, 1 - cv);

      results.push({
        number: num,
        predictions,
        consensusScore,
        consensusRank: 0,
        agreement,
        modelCount: predictions.length,
      });
    }

    // Assign ranks based on consensus score
    const sorted = [...results].sort((a, b) => b.consensusScore - a.consensusScore);
    sorted.forEach((r, idx) => {
      r.consensusRank = idx + 1;
    });

    return results;
  }, [numbers, churnPredictions, returnPredictions, coxPredictions, frailtyPredictions, survivalPredictions]);

  const filteredAndSorted = useMemo(() => {
    let filtered = consensusResults;

    // Filter by agreement threshold
    if (showOnlyAgreement || filterAgreement > 0) {
      filtered = filtered.filter(r => r.agreement >= filterAgreement);
    }

    // Sort
    const sorted = [...filtered];
    if (sortBy === "consensus") {
      sorted.sort((a, b) => b.consensusScore - a.consensusScore);
    } else if (sortBy === "agreement") {
      sorted.sort((a, b) => b.agreement - a.agreement);
    } else {
      sorted.sort((a, b) => a.number - b.number);
    }

    return sorted;
  }, [consensusResults, sortBy, filterAgreement, showOnlyAgreement]);

  const hasAnyPredictions = consensusResults.length > 0 && consensusResults.some(r => r.modelCount > 0);

  const getAgreementColor = (agreement: number): string => {
    if (agreement > 0.8) return "#28a745";
    if (agreement > 0.6) return "#ffc107";
    return "#dc3545";
  };

  return (
    <section style={{ padding: "1rem", background: "#fff", borderRadius: "8px", marginBottom: "1rem", border: "2px solid #007bff" }}>
      <h2 style={{ marginTop: 0 }}>🎯 Consensus Panel - Model Comparison</h2>
      
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        Aggregates predictions from all survival and churn models. Higher consensus score = more likely to appear.
        Agreement shows how much models agree (1.0 = perfect agreement, 0.0 = high disagreement).
      </p>

      {!hasAnyPredictions && (
        <div style={{ padding: "2rem", textAlign: "center", background: "#fff3cd", borderRadius: "4px", marginBottom: "1rem" }}>
          <strong>⚠️ No model predictions available</strong>
          <p style={{ marginTop: "0.5rem", color: "#666" }}>
            Train at least one model (Churn, Return, Cox, Frailty, or Survival) to see consensus results
          </p>
        </div>
      )}

      {hasAnyPredictions && (
        <>
          {/* Controls */}
          <div style={{ marginBottom: "1rem", padding: "1rem", background: "#f5f5f5", borderRadius: "4px" }}>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
              <label>
                Sort by:
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "consensus" | "agreement" | "number")}
                  style={{ marginLeft: "0.5rem", padding: "0.25rem" }}
                >
                  <option value="consensus">Consensus Score</option>
                  <option value="agreement">Model Agreement</option>
                  <option value="number">Number</option>
                </select>
              </label>

              <label>
                Min Agreement:
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={filterAgreement}
                  onChange={(e) => setFilterAgreement(parseFloat(e.target.value))}
                  style={{ marginLeft: "0.5rem", width: "150px" }}
                />
                <span style={{ marginLeft: "0.5rem", fontWeight: "bold" }}>{filterAgreement.toFixed(1)}</span>
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={showOnlyAgreement}
                  onChange={(e) => setShowOnlyAgreement(e.target.checked)}
                  style={{ marginRight: "0.5rem" }}
                />
                Show only high agreement (&gt;0.8)
              </label>
            </div>
          </div>

          {/* Summary Stats */}
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", 
            gap: "1rem", 
            marginBottom: "1rem" 
          }}>
            <div style={{ padding: "1rem", background: "#e3f2fd", borderRadius: "4px" }}>
              <div style={{ fontSize: "0.8rem", color: "#666" }}>Active Models</div>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                {Math.max(...consensusResults.map(r => r.modelCount))}
              </div>
            </div>
            <div style={{ padding: "1rem", background: "#e8f5e9", borderRadius: "4px" }}>
              <div style={{ fontSize: "0.8rem", color: "#666" }}>High Agreement</div>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                {consensusResults.filter(r => r.agreement > 0.8).length}
              </div>
            </div>
            <div style={{ padding: "1rem", background: "#fff3cd", borderRadius: "4px" }}>
              <div style={{ fontSize: "0.8rem", color: "#666" }}>Medium Agreement</div>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                {consensusResults.filter(r => r.agreement >= 0.6 && r.agreement <= 0.8).length}
              </div>
            </div>
            <div style={{ padding: "1rem", background: "#ffebee", borderRadius: "4px" }}>
              <div style={{ fontSize: "0.8rem", color: "#666" }}>Low Agreement</div>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                {consensusResults.filter(r => r.agreement < 0.6).length}
              </div>
            </div>
          </div>

          {/* Results Table */}
          <div style={{ maxHeight: "500px", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f8f9fa" }}>
                <tr>
                  <th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>Number</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Consensus</th>
                  <th style={{ padding: "0.5rem", textAlign: "center", borderBottom: "2px solid #dee2e6" }}>Rank</th>
                  <th style={{ padding: "0.5rem", textAlign: "center", borderBottom: "2px solid #dee2e6" }}>Agreement</th>
                  <th style={{ padding: "0.5rem", textAlign: "center", borderBottom: "2px solid #dee2e6" }}>Models</th>
                  <th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>Model Scores</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map((result) => {
                  const agreementColor = getAgreementColor(result.agreement);

                  return (
                    <tr key={result.number} style={{ borderBottom: "1px solid #dee2e6" }}>
                      <td style={{ padding: "0.5rem", fontWeight: "bold" }}>
                        {result.number}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: "bold", color: "#007bff" }}>
                        {(result.consensusScore * 100).toFixed(1)}%
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "center" }}>
                        #{result.consensusRank}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "center" }}>
                        <span style={{
                          padding: "0.25rem 0.5rem",
                          background: agreementColor,
                          color: "white",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                        }}>
                          {(result.agreement * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "center" }}>
                        {result.modelCount}
                      </td>
                      <td style={{ padding: "0.5rem", fontSize: "0.75rem" }}>
                        {result.predictions.map((pred, idx) => (
                          <div key={idx} style={{ marginBottom: "0.25rem" }}>
                            <strong>{pred.modelName}:</strong> {(pred.score * 100).toFixed(1)}%
                          </div>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Visual Comparison */}
          <div style={{ marginTop: "1rem", padding: "1rem", background: "#f8f9fa", borderRadius: "4px" }}>
            <strong>Top 10 Consensus Numbers:</strong>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
              {filteredAndSorted.slice(0, 10).map((result) => (
                <div
                  key={result.number}
                  style={{
                    padding: "0.5rem 1rem",
                    background: getAgreementColor(result.agreement),
                    color: "white",
                    borderRadius: "4px",
                    fontWeight: "bold",
                    fontSize: "1rem",
                  }}
                  title={`Agreement: ${(result.agreement * 100).toFixed(0)}%, Score: ${(result.consensusScore * 100).toFixed(1)}%`}
                >
                  {result.number}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
};

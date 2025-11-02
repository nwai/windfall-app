/**
 * ChurnPredictor Component
 * 
 * Implements ML-based churn prediction using logistic regression
 * Predicts which numbers are likely to "churn" (not appear for extended period)
 */

import React, { useState, useMemo } from "react";
import { Draw } from "../types";
import {
  buildChurnDataset,
  trainTestSplit,
  extractFeaturesForNumber,
  normalizeFeatures,
  ChurnFeatures,
} from "../lib/churnFeatures";

interface ChurnPredictorProps {
  history: Draw[];
  excludedNumbers?: number[];
  churnThreshold?: number;
}

interface PredictionResult {
  number: number;
  churnProbability: number;
  features: ChurnFeatures;
  isMainRisk: boolean; // high risk of churning
}

interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
}

/**
 * Simple logistic regression implementation
 */
class LogisticRegression {
  weights: number[];
  bias: number;
  learningRate: number;
  epochs: number;

  constructor(numFeatures: number, learningRate = 0.01, epochs = 100) {
    this.weights = Array(numFeatures).fill(0);
    this.bias = 0;
    this.learningRate = learningRate;
    this.epochs = epochs;
  }

  sigmoid(z: number): number {
    return 1 / (1 + Math.exp(-z));
  }

  predict(features: number[]): number {
    const z = features.reduce((sum, f, i) => sum + f * this.weights[i], this.bias);
    return this.sigmoid(z);
  }

  train(X: number[][], y: number[]): void {
    for (let epoch = 0; epoch < this.epochs; epoch++) {
      for (let i = 0; i < X.length; i++) {
        const prediction = this.predict(X[i]);
        const error = y[i] - prediction;

        // Update weights
        for (let j = 0; j < this.weights.length; j++) {
          this.weights[j] += this.learningRate * error * X[i][j];
        }
        this.bias += this.learningRate * error;
      }
    }
  }
}

export const ChurnPredictor: React.FC<ChurnPredictorProps> = ({
  history,
  excludedNumbers = [],
  churnThreshold = 15,
}) => {
  const [isTraining, setIsTraining] = useState(false);
  const [isTrained, setIsTrained] = useState(false);
  const [model, setModel] = useState<LogisticRegression | null>(null);
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const [sortBy, setSortBy] = useState<"risk" | "number">("risk");

  const numbers = useMemo(
    () => Array.from({ length: 45 }, (_, i) => i + 1).filter(n => !excludedNumbers.includes(n)),
    [excludedNumbers]
  );

  const trainModel = async () => {
    setIsTraining(true);
    
    // Use setTimeout to allow UI to update
    setTimeout(() => {
      try {
        // Build dataset
        const dataset = buildChurnDataset(history, numbers, churnThreshold);
        
        if (dataset.length === 0) {
          alert("Not enough data to train model");
          setIsTraining(false);
          return;
        }

        // Split into train/test
        const { train, test } = trainTestSplit(dataset, 0.2);

        // Prepare training data
        const X_train = train.map(d => normalizeFeatures(d.features));
        const y_train = train.map(d => (d.label.willChurn ? 1 : 0));

        const X_test = test.map(d => normalizeFeatures(d.features));
        const y_test = test.map(d => (d.label.willChurn ? 1 : 0));

        // Train model
        const newModel = new LogisticRegression(X_train[0].length, 0.01, 100);
        newModel.train(X_train, y_train);

        // Evaluate on test set
        let tp = 0, fp = 0, tn = 0, fn = 0;
        
        for (let i = 0; i < X_test.length; i++) {
          const pred = newModel.predict(X_test[i]) > 0.5 ? 1 : 0;
          const actual = y_test[i];
          
          if (pred === 1 && actual === 1) tp++;
          else if (pred === 1 && actual === 0) fp++;
          else if (pred === 0 && actual === 0) tn++;
          else if (pred === 0 && actual === 1) fn++;
        }

        const accuracy = (tp + tn) / (tp + tn + fp + fn);
        const precision = tp / (tp + fp) || 0;
        const recall = tp / (tp + fn) || 0;
        const f1Score = 2 * (precision * recall) / (precision + recall) || 0;

        setMetrics({ accuracy, precision, recall, f1Score });
        setModel(newModel);
        setIsTrained(true);

        // Generate predictions for current state
        makePredictions(newModel);

      } catch (error) {
        console.error("Training error:", error);
        alert("Error training model: " + error);
      } finally {
        setIsTraining(false);
      }
    }, 100);
  };

  const makePredictions = (trainedModel: LogisticRegression) => {
    const currentIdx = history.length - 1;
    const results: PredictionResult[] = [];

    for (const num of numbers) {
      const features = extractFeaturesForNumber(history, num, currentIdx, churnThreshold);
      const normalized = normalizeFeatures(features);
      const probability = trainedModel.predict(normalized);
      
      results.push({
        number: num,
        churnProbability: probability,
        features,
        isMainRisk: probability > 0.7, // threshold for "high risk"
      });
    }

    setPredictions(results);
  };

  const sortedPredictions = useMemo(() => {
    const sorted = [...predictions];
    if (sortBy === "risk") {
      sorted.sort((a, b) => b.churnProbability - a.churnProbability);
    } else {
      sorted.sort((a, b) => a.number - b.number);
    }
    return sorted;
  }, [predictions, sortBy]);

  // Split into main and supp predictions
  const mainNumbers = useMemo(() => {
    if (history.length === 0) return [];
    const lastDraw = history[history.length - 1];
    return lastDraw.main;
  }, [history]);

  const suppNumbers = useMemo(() => {
    if (history.length === 0) return [];
    const lastDraw = history[history.length - 1];
    return lastDraw.supp;
  }, [history]);

  return (
    <section style={{ padding: "1rem", background: "#fff", borderRadius: "8px", marginBottom: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>🎯 Churn Predictor (ML-Based)</h2>
      
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        Predicts which numbers are likely to "churn" (disappear for {churnThreshold}+ draws) using logistic regression.
        Features include frequency patterns, time since last seen, trend slopes, and volatility.
      </p>

      {/* Training Controls */}
      <div style={{ marginBottom: "1rem", padding: "1rem", background: "#f5f5f5", borderRadius: "4px" }}>
        <button
          onClick={trainModel}
          disabled={isTraining || history.length < 100}
          style={{
            padding: "0.5rem 1rem",
            background: isTrained ? "#28a745" : "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isTraining ? "wait" : "pointer",
            marginRight: "1rem",
          }}
        >
          {isTraining ? "Training..." : isTrained ? "✓ Retrain Model" : "Train Model"}
        </button>

        {history.length < 100 && (
          <span style={{ color: "#dc3545", fontSize: "0.9rem" }}>
            Need at least 100 draws to train
          </span>
        )}

        {isTrained && metrics && (
          <div style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
            <strong>Model Performance:</strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem", marginTop: "0.5rem" }}>
              <div>Accuracy: <strong>{(metrics.accuracy * 100).toFixed(1)}%</strong></div>
              <div>Precision: <strong>{(metrics.precision * 100).toFixed(1)}%</strong></div>
              <div>Recall: <strong>{(metrics.recall * 100).toFixed(1)}%</strong></div>
              <div>F1: <strong>{(metrics.f1Score * 100).toFixed(1)}%</strong></div>
            </div>
          </div>
        )}
      </div>

      {/* Predictions Table */}
      {isTrained && predictions.length > 0 && (
        <>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ marginRight: "1rem" }}>
              Sort by:
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "risk" | "number")}
                style={{ marginLeft: "0.5rem", padding: "0.25rem" }}
              >
                <option value="risk">Churn Risk (High to Low)</option>
                <option value="number">Number</option>
              </select>
            </label>
          </div>

          <div style={{ maxHeight: "500px", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f8f9fa" }}>
                <tr>
                  <th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>Number</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Churn Risk</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Last Seen</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Freq (L20)</th>
                  <th style={{ padding: "0.5rem", textAlign: "center", borderBottom: "2px solid #dee2e6" }}>Status</th>
                  <th style={{ padding: "0.5rem", textAlign: "center", borderBottom: "2px solid #dee2e6" }}>Position</th>
                </tr>
              </thead>
              <tbody>
                {sortedPredictions.map((pred) => {
                  const isMain = mainNumbers.includes(pred.number);
                  const isSupp = suppNumbers.includes(pred.number);
                  const riskColor = pred.churnProbability > 0.7 ? "#dc3545" : 
                                   pred.churnProbability > 0.5 ? "#ffc107" : "#28a745";

                  return (
                    <tr key={pred.number} style={{ borderBottom: "1px solid #dee2e6" }}>
                      <td style={{ padding: "0.5rem", fontWeight: isMain || isSupp ? "bold" : "normal" }}>
                        {pred.number}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right", color: riskColor, fontWeight: "bold" }}>
                        {(pred.churnProbability * 100).toFixed(1)}%
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {pred.features.timeSinceLast} draws
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {pred.features.freqLast20}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "center" }}>
                        {pred.features.isActive ? "Active" : pred.features.hasChurned ? "Churned" : "Inactive"}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "center" }}>
                        {isMain && <span style={{ color: "#007bff", fontWeight: "bold" }}>MAIN</span>}
                        {isSupp && <span style={{ color: "#6c757d", fontWeight: "bold" }}>SUPP</span>}
                        {!isMain && !isSupp && <span style={{ color: "#ccc" }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary Stats */}
          <div style={{ marginTop: "1rem", padding: "1rem", background: "#f8f9fa", borderRadius: "4px" }}>
            <strong>Summary:</strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem", marginTop: "0.5rem", fontSize: "0.9rem" }}>
              <div>High Risk (&gt;70%): <strong>{predictions.filter(p => p.churnProbability > 0.7).length}</strong></div>
              <div>Medium Risk (50-70%): <strong>{predictions.filter(p => p.churnProbability >= 0.5 && p.churnProbability <= 0.7).length}</strong></div>
              <div>Low Risk (&lt;50%): <strong>{predictions.filter(p => p.churnProbability < 0.5).length}</strong></div>
            </div>
          </div>
        </>
      )}

      {!isTrained && (
        <div style={{ padding: "2rem", textAlign: "center", color: "#6c757d" }}>
          Train the model to see churn predictions
        </div>
      )}
    </section>
  );
};

/**
 * ReturnPredictor Component
 * 
 * Predicts which churned numbers are likely to return (reactivate)
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

interface ReturnPredictorProps {
  history: Draw[];
  excludedNumbers?: number[];
  churnThreshold?: number;
}

interface ReturnPrediction {
  number: number;
  returnProbability: number;
  features: ChurnFeatures;
  daysSinceChurn: number;
}

interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
}

/**
 * Simple logistic regression for return prediction
 */
class ReturnPredictor {
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

        for (let j = 0; j < this.weights.length; j++) {
          this.weights[j] += this.learningRate * error * X[i][j];
        }
        this.bias += this.learningRate * error;
      }
    }
  }
}

export const ReturnPredictorComponent: React.FC<ReturnPredictorProps> = ({
  history,
  excludedNumbers = [],
  churnThreshold = 15,
}) => {
  const [isTraining, setIsTraining] = useState(false);
  const [isTrained, setIsTrained] = useState(false);
  const [model, setModel] = useState<ReturnPredictor | null>(null);
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [predictions, setPredictions] = useState<ReturnPrediction[]>([]);
  const [sortBy, setSortBy] = useState<"probability" | "number">("probability");

  const numbers = useMemo(
    () => Array.from({ length: 45 }, (_, i) => i + 1).filter(n => !excludedNumbers.includes(n)),
    [excludedNumbers]
  );

  const trainModel = async () => {
    setIsTraining(true);
    
    setTimeout(() => {
      try {
        // Build dataset focusing on churned numbers
        const dataset = buildChurnDataset(history, numbers, churnThreshold);
        
        // Filter to only churned numbers for return prediction
        const churnedDataset = dataset.filter(d => d.features.hasChurned);
        
        if (churnedDataset.length < 50) {
          alert("Not enough churned numbers in history to train return model");
          setIsTraining(false);
          return;
        }

        const { train, test } = trainTestSplit(churnedDataset, 0.2);

        const X_train = train.map(d => normalizeFeatures(d.features));
        const y_train = train.map(d => (d.label.willReturn ? 1 : 0));

        const X_test = test.map(d => normalizeFeatures(d.features));
        const y_test = test.map(d => (d.label.willReturn ? 1 : 0));

        const newModel = new ReturnPredictor(X_train[0].length, 0.01, 150);
        newModel.train(X_train, y_train);

        // Evaluate
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

        makePredictions(newModel);

      } catch (error) {
        console.error("Training error:", error);
        alert("Error training return model: " + error);
      } finally {
        setIsTraining(false);
      }
    }, 100);
  };

  const makePredictions = (trainedModel: ReturnPredictor) => {
    const currentIdx = history.length - 1;
    const results: ReturnPrediction[] = [];

    for (const num of numbers) {
      const features = extractFeaturesForNumber(history, num, currentIdx, churnThreshold);
      
      // Only predict for churned numbers
      if (features.hasChurned) {
        const normalized = normalizeFeatures(features);
        const probability = trainedModel.predict(normalized);
        
        results.push({
          number: num,
          returnProbability: probability,
          features,
          daysSinceChurn: features.timeSinceLast,
        });
      }
    }

    setPredictions(results);
  };

  const sortedPredictions = useMemo(() => {
    const sorted = [...predictions];
    if (sortBy === "probability") {
      sorted.sort((a, b) => b.returnProbability - a.returnProbability);
    } else {
      sorted.sort((a, b) => a.number - b.number);
    }
    return sorted;
  }, [predictions, sortBy]);

  return (
    <section style={{ padding: "1rem", background: "#fff", borderRadius: "8px", marginBottom: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>🔄 Return Predictor (Reactivation)</h2>
      
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        Predicts which churned numbers are likely to return (reactivate) soon.
        Only shows numbers that have been inactive for {churnThreshold}+ draws.
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
      {isTrained && predictions.length > 0 ? (
        <>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ marginRight: "1rem" }}>
              Sort by:
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "probability" | "number")}
                style={{ marginLeft: "0.5rem", padding: "0.25rem" }}
              >
                <option value="probability">Return Probability (High to Low)</option>
                <option value="number">Number</option>
              </select>
            </label>
          </div>

          <div style={{ maxHeight: "400px", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f8f9fa" }}>
                <tr>
                  <th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>Number</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Return Prob</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Days Churned</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Historical Freq</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Avg Gap</th>
                </tr>
              </thead>
              <tbody>
                {sortedPredictions.map((pred) => {
                  const probColor = pred.returnProbability > 0.7 ? "#28a745" : 
                                   pred.returnProbability > 0.5 ? "#ffc107" : "#dc3545";

                  return (
                    <tr key={pred.number} style={{ borderBottom: "1px solid #dee2e6" }}>
                      <td style={{ padding: "0.5rem", fontWeight: "bold" }}>
                        {pred.number}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right", color: probColor, fontWeight: "bold" }}>
                        {(pred.returnProbability * 100).toFixed(1)}%
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {pred.daysSinceChurn}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {pred.features.freqTotal}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {pred.features.avgGap.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary Stats */}
          <div style={{ marginTop: "1rem", padding: "1rem", background: "#f8f9fa", borderRadius: "4px" }}>
            <strong>Currently Churned Numbers:</strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem", marginTop: "0.5rem", fontSize: "0.9rem" }}>
              <div>High Return Prob (&gt;70%): <strong>{predictions.filter(p => p.returnProbability > 0.7).length}</strong></div>
              <div>Medium (50-70%): <strong>{predictions.filter(p => p.returnProbability >= 0.5 && p.returnProbability <= 0.7).length}</strong></div>
              <div>Low (&lt;50%): <strong>{predictions.filter(p => p.returnProbability < 0.5).length}</strong></div>
            </div>
          </div>
        </>
      ) : isTrained ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "#6c757d" }}>
          No currently churned numbers found
        </div>
      ) : (
        <div style={{ padding: "2rem", textAlign: "center", color: "#6c757d" }}>
          Train the model to see return predictions
        </div>
      )}
    </section>
  );
};

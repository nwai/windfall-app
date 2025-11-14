/**
 * SurvivalCoxPanel Component
 * 
 * Implements Cox Proportional Hazards model with three modes:
 * - auto: Try Python (Pyodide + lifelines) first, fallback to JS if needed
 * - python: Python-only (Pyodide + lifelines)
 * - js: JavaScript-only (simplified approximation)
 * 
 * Version: cox-return-1
 */

import React, { useState, useMemo, useRef, useEffect } from "react";
import { Draw } from "../types";
import { extractFeaturesForNumber, buildChurnDataset } from "../lib/churnFeatures";

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

type ComputeMode = 'auto' | 'python' | 'js';

interface DiagState {
  mode_selected: ComputeMode;
  path_used: 'python' | 'js' | 'js_fallback' | null;
  python_ok?: boolean;
  python_empty_reason?: string;
  final_x_cols?: string[];
  n_obs?: number;
  n_events?: number;
  timing_ms_python?: number;
  timing_ms_js?: number;
  concordance?: number;
  partial_log_likelihood?: number;
}

interface PythonSummaryRow {
  covariate: string;
  coef: number;
  exp_coef: number;
  se_coef: number;
  z: number;
  p: number;
  lower_95: number;
  upper_95: number;
}

export const SurvivalCoxPanel: React.FC<SurvivalCoxPanelProps> = ({
  history,
  excludedNumbers = [],
}) => {
  const [isCalculated, setIsCalculated] = useState(false);
  const [results, setResults] = useState<CoxResult[]>([]);
  const [sortBy, setSortBy] = useState<"risk" | "number">("risk");
  const [mode, setMode] = useState<ComputeMode>("auto");
  const [penalizer, setPenalizer] = useState(0.01);
  const [l1Ratio, setL1Ratio] = useState(0.0);
  const [isComputing, setIsComputing] = useState(false);
  const [pythonSummary, setPythonSummary] = useState<PythonSummaryRow[]>([]);
  const [diag, setDiag] = useState<DiagState>({
    mode_selected: 'auto',
    path_used: null,
  });
  const [rawPayload, setRawPayload] = useState<string>('');
  const [showRawPayload, setShowRawPayload] = useState(false);
  
  const workerRef = useRef<Worker | null>(null);

  const numbers = useMemo(
    () => Array.from({ length: 45 }, (_, i) => i + 1).filter(n => !excludedNumbers.includes(n)),
    [excludedNumbers]
  );

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  /**
   * Build dataset with features for Cox model
   */
  const buildInputs = () => {
    const currentIdx = history.length - 1;
    const dataset = [];

    for (const num of numbers) {
      const features = extractFeaturesForNumber(history, num, currentIdx);
      
      // Build covariates
      const row: any = {
        number: num,
        duration: features.timeSinceLast,
        event: 1, // All numbers are "at risk"
        freq_fortnight: features.freqFortnight,
        freq_month: features.freqMonth,
        freq_quarter: features.freqQuarter,
        tenure: features.tenure,
        zpa_group: features.zpaGroup,
      };
      
      dataset.push(row);
    }

    return dataset;
  };

  /**
   * Run JS-based Cox approximation
   */
  const runJsCox = () => {
    const startTime = Date.now();
    const currentIdx = history.length - 1;
    const newResults: CoxResult[] = [];

    for (const num of numbers) {
      const features = extractFeaturesForNumber(history, num, currentIdx);

      // Simple risk score based on features
      // Lower frequency and longer time since last = higher hazard
      const BASELINE_HAZARD_RATIO = 0.5;
      const freqScore = features.freqTotal / history.length;
      const recencyScore = Math.exp(-features.timeSinceLast / 20);
      
      // Apply penalizer to regularize
      const regularization = penalizer * (features.freqFortnight + features.freqMonth);
      
      // Hazard ratio (relative to baseline)
      const hazardRatio = (1 - freqScore) * (1 - recencyScore) + BASELINE_HAZARD_RATIO - regularization * 0.01;
      
      // Survival probability
      const survivalProbability = Math.exp(-hazardRatio);
      
      // Risk score for ranking
      const riskScore = hazardRatio * (1 + features.timeSinceLast / 100);

      newResults.push({
        number: num,
        hazardRatio: Math.max(0.1, hazardRatio), // Ensure positive
        survivalProbability,
        riskScore,
      });
    }

    const timingMs = Date.now() - startTime;
    setResults(newResults);
    setPythonSummary([]);
    setRawPayload(JSON.stringify({ mode: 'js', results: newResults }, null, 2));
    
    return timingMs;
  };

  /**
   * Run Python-based Cox model using Pyodide worker
   */
  const runPythonCox = () => {
    return new Promise<boolean>((resolve) => {
      const startTime = Date.now();
      const dataset = buildInputs();

      // Create worker if not exists
      if (!workerRef.current) {
        try {
          workerRef.current = new Worker(
            new URL('../workers/coxPyodideWorker.return.ts', import.meta.url),
            { type: 'module' }
          );
        } catch (error) {
          console.error('Failed to create worker:', error);
          setDiag(prev => ({
            ...prev,
            python_ok: false,
            python_empty_reason: 'Worker creation failed',
          }));
          resolve(false);
          return;
        }
      }

      const worker = workerRef.current;

      const handleMessage = (event: MessageEvent) => {
        const response = event.data;
        const timingMs = Date.now() - startTime;
        
        setRawPayload(JSON.stringify(response, null, 2));

        if (!response.ok) {
          // Python failed
          setDiag(prev => ({
            ...prev,
            python_ok: false,
            python_empty_reason: response.diagnostics?.empty_reason || response.error || 'Unknown error',
            final_x_cols: response.diagnostics?.final_x_cols || [],
            n_obs: response.diagnostics?.n_obs || 0,
            n_events: response.diagnostics?.n_events || 0,
            timing_ms_python: timingMs,
          }));
          worker.removeEventListener('message', handleMessage);
          resolve(false);
          return;
        }

        // Python succeeded
        const hazardRatios = response.hazardRatios || {};
        const newResults: CoxResult[] = [];

        for (const num of numbers) {
          const hr = hazardRatios[num] || 1.0;
          newResults.push({
            number: num,
            hazardRatio: hr,
            survivalProbability: Math.exp(-hr),
            riskScore: hr,
          });
        }

        // Check if results are valid (not all identical)
        const uniqueHRs = new Set(newResults.map(r => r.hazardRatio));
        const isEmpty = uniqueHRs.size === 1 || (response.diagnostics?.final_x_cols || []).length === 0;

        if (isEmpty) {
          setDiag(prev => ({
            ...prev,
            python_ok: false,
            python_empty_reason: response.diagnostics?.empty_reason || 'All hazard ratios identical',
            final_x_cols: response.diagnostics?.final_x_cols || [],
            n_obs: response.diagnostics?.n_obs || 0,
            n_events: response.diagnostics?.n_events || 0,
            timing_ms_python: timingMs,
          }));
          worker.removeEventListener('message', handleMessage);
          resolve(false);
          return;
        }

        setResults(newResults);
        setPythonSummary(response.summary || []);
        setDiag(prev => ({
          ...prev,
          python_ok: true,
          final_x_cols: response.diagnostics?.final_x_cols || [],
          n_obs: response.diagnostics?.n_obs || 0,
          n_events: response.diagnostics?.n_events || 0,
          concordance: response.diagnostics?.concordance,
          partial_log_likelihood: response.diagnostics?.partial_log_likelihood,
          timing_ms_python: timingMs,
        }));

        worker.removeEventListener('message', handleMessage);
        resolve(true);
      };

      worker.addEventListener('message', handleMessage);

      // Send request to worker
      worker.postMessage({
        type: 'compute',
        dataset,
        penalizer,
        l1_ratio: l1Ratio,
      });
    });
  };

  /**
   * Main compute handler
   */
  const handleCompute = async () => {
    setIsComputing(true);
    setIsCalculated(false);

    const newDiag: DiagState = {
      mode_selected: mode,
      path_used: null,
    };
    setDiag(newDiag);

    // Check if dataset has 45 rows
    if (numbers.length !== 45) {
      alert(`Warning: Dataset has ${numbers.length} numbers (expected 45). Python mode skipped.`);
      if (mode === 'python') {
        setIsComputing(false);
        return;
      }
      // Force JS mode
      const timingMs = runJsCox();
      setDiag({
        ...newDiag,
        path_used: 'js_fallback',
        timing_ms_js: timingMs,
        python_empty_reason: `Dataset has ${numbers.length} numbers instead of 45`,
      });
      setIsCalculated(true);
      setIsComputing(false);
      return;
    }

    if (mode === 'js') {
      // JS only
      const timingMs = runJsCox();
      setDiag({
        ...newDiag,
        path_used: 'js',
        timing_ms_js: timingMs,
      });
      setIsCalculated(true);
      setIsComputing(false);
      return;
    }

    if (mode === 'python' || mode === 'auto') {
      // Try Python
      const success = await runPythonCox();
      
      if (success) {
        // Python succeeded
        setDiag(prev => ({
          ...prev,
          path_used: 'python',
        }));
        setIsCalculated(true);
        setIsComputing(false);
        return;
      }

      // Python failed or returned empty
      if (mode === 'python') {
        // Python-only mode: show warning but don't fallback
        alert('Python computation returned empty or invalid results. Check diagnostics.');
        setIsCalculated(true);
        setIsComputing(false);
        return;
      }

      if (mode === 'auto') {
        // Auto mode: fallback to JS
        const timingMs = runJsCox();
        setDiag(prev => ({
          ...prev,
          path_used: 'js_fallback',
          timing_ms_js: timingMs,
        }));
        setIsCalculated(true);
        setIsComputing(false);
        return;
      }
    }

    setIsComputing(false);
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

  // Path indicator chip
  const pathChip = () => {
    if (!diag.path_used) return null;

    const pathLabels: Record<string, { text: string; color: string }> = {
      python: { text: 'Python (lifelines)', color: '#28a745' },
      js: { text: 'JS Only', color: '#007bff' },
      js_fallback: { text: 'JS Fallback', color: '#ffc107' },
    };

    const info = pathLabels[diag.path_used] || { text: 'Unknown', color: '#6c757d' };

    return (
      <span style={{
        padding: '0.25rem 0.75rem',
        background: info.color,
        color: 'white',
        borderRadius: '12px',
        fontSize: '0.85rem',
        fontWeight: 'bold',
        marginLeft: '1rem',
      }}>
        {info.text}
      </span>
    );
  };

  return (
    <section style={{ padding: "1rem", background: "#fff", borderRadius: "8px", marginBottom: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>
        📊 Cox Proportional Hazards Model
        {pathChip()}
      </h2>
      
      <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "1rem" }}>
        Semi-parametric survival model that estimates the hazard (risk) of a number not appearing.
        Choose between full Python implementation (lifelines) or simplified JS approximation.
      </p>

      {/* Mode Selector */}
      <div style={{ marginBottom: "1rem", padding: "1rem", background: "#f8f9fa", borderRadius: "4px" }}>
        <div style={{ marginBottom: "0.5rem", fontWeight: "bold" }}>Computation Mode:</div>
        <div style={{ display: "flex", gap: "1rem" }}>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input
              type="radio"
              value="auto"
              checked={mode === 'auto'}
              onChange={(e) => setMode(e.target.value as ComputeMode)}
              style={{ marginRight: "0.5rem" }}
            />
            Auto (Python → JS fallback)
          </label>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input
              type="radio"
              value="python"
              checked={mode === 'python'}
              onChange={(e) => setMode(e.target.value as ComputeMode)}
              style={{ marginRight: "0.5rem" }}
            />
            Python Only
          </label>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input
              type="radio"
              value="js"
              checked={mode === 'js'}
              onChange={(e) => setMode(e.target.value as ComputeMode)}
              style={{ marginRight: "0.5rem" }}
            />
            JS Only
          </label>
        </div>
      </div>

      {/* Regularization Controls */}
      <div style={{ marginBottom: "1rem", padding: "1rem", background: "#e3f2fd", borderRadius: "4px" }}>
        <div style={{ fontWeight: "bold", marginBottom: "0.5rem" }}>Regularization Parameters:</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "0.85rem", marginBottom: "0.25rem" }}>
                Penalizer (Ridge): {penalizer.toFixed(3)}
              </span>
              <input
                type="range"
                min="0"
                max="0.1"
                step="0.001"
                value={penalizer}
                onChange={(e) => setPenalizer(parseFloat(e.target.value))}
                style={{ width: "100%" }}
              />
            </label>
          </div>
          <div>
            <label style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "0.85rem", marginBottom: "0.25rem" }}>
                L1 Ratio (Elastic Net): {l1Ratio.toFixed(2)}
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={l1Ratio}
                onChange={(e) => setL1Ratio(parseFloat(e.target.value))}
                style={{ width: "100%" }}
              />
            </label>
          </div>
        </div>
        <div style={{ fontSize: "0.75rem", color: "#666", marginTop: "0.5rem" }}>
          Note: Python mode uses both parameters; JS mode uses penalizer only
        </div>
      </div>

      {/* Calculate Button */}
      <div style={{ marginBottom: "1rem" }}>
        <button
          onClick={handleCompute}
          disabled={history.length < 50 || isComputing}
          style={{
            padding: "0.5rem 1rem",
            background: isComputing ? "#6c757d" : (isCalculated ? "#28a745" : "#007bff"),
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isComputing ? "wait" : "pointer",
            fontSize: "1rem",
          }}
        >
          {isComputing ? "⏳ Computing..." : (isCalculated ? "✓ Recalculate" : "Calculate Cox Model")}
        </button>
        
        {history.length < 50 && (
          <span style={{ marginLeft: "1rem", color: "#dc3545", fontSize: "0.9rem" }}>
            Need at least 50 draws
          </span>
        )}

        {isCalculated && (
          <button
            onClick={() => setShowRawPayload(!showRawPayload)}
            style={{
              marginLeft: "1rem",
              padding: "0.5rem 1rem",
              background: "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            {showRawPayload ? "Hide" : "Show"} Raw Payload
          </button>
        )}
      </div>

      {/* Raw Payload Viewer */}
      {isCalculated && showRawPayload && (
        <div style={{ marginBottom: "1rem", padding: "1rem", background: "#f8f9fa", borderRadius: "4px" }}>
          <div style={{ fontWeight: "bold", marginBottom: "0.5rem" }}>Raw Payload:</div>
          <pre style={{
            background: "#fff",
            padding: "0.5rem",
            borderRadius: "4px",
            fontSize: "0.75rem",
            overflow: "auto",
            maxHeight: "300px",
          }}>
            {rawPayload}
          </pre>
        </div>
      )}

      {/* Diagnostics */}
      {isCalculated && (
        <div style={{ marginBottom: "1rem", padding: "1rem", background: "#fff3cd", borderRadius: "4px", fontSize: "0.85rem" }}>
          <strong>Diagnostics:</strong>
          <ul style={{ marginTop: "0.5rem", marginBottom: 0, paddingLeft: "1.5rem" }}>
            <li>Mode Selected: <strong>{diag.mode_selected}</strong></li>
            <li>Path Used: <strong>{diag.path_used || 'N/A'}</strong></li>
            {diag.python_ok !== undefined && (
              <li>Python Status: <strong>{diag.python_ok ? '✓ Success' : '✗ Failed/Empty'}</strong></li>
            )}
            {diag.python_empty_reason && (
              <li>Python Empty Reason: <strong>{diag.python_empty_reason}</strong></li>
            )}
            {diag.final_x_cols && (
              <li>Final Covariates ({diag.final_x_cols.length}): <strong>{diag.final_x_cols.join(', ')}</strong></li>
            )}
            {diag.n_obs !== undefined && (
              <li>Observations: <strong>{diag.n_obs}</strong>, Events: <strong>{diag.n_events}</strong></li>
            )}
            {diag.concordance !== undefined && (
              <li>Concordance Index: <strong>{diag.concordance.toFixed(4)}</strong></li>
            )}
            {diag.timing_ms_python !== undefined && (
              <li>Python Timing: <strong>{diag.timing_ms_python}ms</strong></li>
            )}
            {diag.timing_ms_js !== undefined && (
              <li>JS Timing: <strong>{diag.timing_ms_js}ms</strong></li>
            )}
          </ul>
        </div>
      )}

      {/* Python Summary Table */}
      {isCalculated && pythonSummary.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "0.5rem" }}>
            📋 Python Lifelines Summary
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
              <thead style={{ background: "#f8f9fa" }}>
                <tr>
                  <th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>Covariate</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Coef</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>exp(Coef)</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>SE</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>z</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>p-value</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>95% CI</th>
                </tr>
              </thead>
              <tbody>
                {pythonSummary.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #dee2e6" }}>
                    <td style={{ padding: "0.5rem", fontWeight: "bold" }}>{row.covariate}</td>
                    <td style={{ padding: "0.5rem", textAlign: "right" }}>{row.coef.toFixed(4)}</td>
                    <td style={{ padding: "0.5rem", textAlign: "right" }}>{row.exp_coef.toFixed(4)}</td>
                    <td style={{ padding: "0.5rem", textAlign: "right" }}>{row.se_coef.toFixed(4)}</td>
                    <td style={{ padding: "0.5rem", textAlign: "right" }}>{row.z.toFixed(2)}</td>
                    <td style={{ padding: "0.5rem", textAlign: "right" }}>
                      {row.p < 0.001 ? '<0.001' : row.p.toFixed(3)}
                    </td>
                    <td style={{ padding: "0.5rem", textAlign: "right", fontSize: "0.7rem" }}>
                      [{row.lower_95.toFixed(2)}, {row.upper_95.toFixed(2)}]
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Warning banner if Python mode returned empty */}
      {isCalculated && diag.mode_selected === 'python' && diag.path_used === 'python' && 
       ((diag.final_x_cols && diag.final_x_cols.length === 0) || pythonSummary.length === 0) && (
        <div style={{ padding: "1rem", background: "#fff3cd", border: "1px solid #ffc107", borderRadius: "4px", marginBottom: "1rem" }}>
          <strong>⚠️ Warning:</strong> Python computation completed but returned no covariates or summary.
          {diag.python_empty_reason && ` Reason: ${diag.python_empty_reason}`}
        </div>
      )}

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
          Select a mode and calculate Cox model to see hazard ratios
        </div>
      )}
    </section>
  );
};

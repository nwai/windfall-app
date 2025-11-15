/**
 * SurvivalCoxPanel Component
 * 
 * Implements Cox Proportional Hazards model with Python/Pyodide (lifelines)
 * and JS fallback with mode selection.
 */

import React, { useState, useMemo, useRef, useCallback } from "react";
import { Draw } from "../types";
import { buildCoxDataset, buildNowDataset, CoxDatasetRow } from "../lib/coxDataset";
import { fitJsCox } from "../lib/jsCox";

interface SurvivalCoxPanelProps {
  history: Draw[];
  excludedNumbers?: number[];
}

interface CoxResult {
  number: number;
  hazardRatio: number;
  partialHazard: number;
}

interface CoxSummaryRow {
  covariate: string;
  coef: number;
  exp_coef: number;
  p?: number;
}

interface DiagInfo {
  mode_selected?: 'auto' | 'python' | 'js';
  path_used?: 'python' | 'js' | 'js_fallback';
  python_empty_reason?: string | null;
  timing_ms_python?: number;
  timing_ms_js?: number;
  rows?: number;
  cols?: number;
  events?: number;
  nowRows?: number;
  colNames?: string[];
  requested_cols?: string[];
  final_x_cols?: string[];
  removed_constants?: string[];
  has_zone_strata?: boolean;
  penalizer?: number;
  l1_ratio?: number;
}

export const SurvivalCoxPanel: React.FC<SurvivalCoxPanelProps> = ({
  history,
  excludedNumbers = [],
}) => {
  const [mode, setMode] = useState<'auto' | 'python' | 'js'>('auto');
  const [isCalculated, setIsCalculated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<CoxResult[]>([]);
  const [summary, setSummary] = useState<CoxSummaryRow[]>([]);
  const [sortBy, setSortBy] = useState<"risk" | "number">("risk");
  const [penalizer, setPenalizer] = useState(0.01);
  const [l1Ratio, setL1Ratio] = useState(0.0);
  const [useZoneStrata, setUseZoneStrata] = useState(false);
  const [diag, setDiag] = useState<DiagInfo>({});
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [pythonWarning, setPythonWarning] = useState<string | null>(null);
  const [rawPayload, setRawPayload] = useState<any>(null);
  const [showRawPayload, setShowRawPayload] = useState(false);

  const jsCoxInputRef = useRef<{
    durations: number[];
    events: number[];
    X: number[][];
    nowX: number[][];
    colNames: string[];
  } | null>(null);

  const numbers = useMemo(
    () => Array.from({ length: 45 }, (_, i) => i + 1).filter(n => !excludedNumbers.includes(n)),
    [excludedNumbers]
  );

  /**
   * Build inputs for Cox model - both dataset and JS inputs
   */
  const buildInputs = useCallback(() => {
    const dataset = buildCoxDataset(history, {
      includeZone: useZoneStrata,
      excludeNumbers: excludedNumbers,
    });

    const now = buildNowDataset(history, numbers, {
      includeZone: useZoneStrata,
    });

    // Extract JS Cox inputs
    const durations = dataset.rows.map(r => r.duration);
    const events = dataset.rows.map(r => r.event);
    
    // Column names (exclude duration, event, number, and zone if strata used)
    const allCovariates = [
      'freq_total_norm',
      'time_since_last_norm',
      'freq_fortnight_norm',
      'freq_month_norm',
      'freq_quarter_norm',
      'tenure_norm'
    ];
    
    const colNames = useZoneStrata 
      ? allCovariates.filter(c => c !== 'zone')
      : allCovariates;

    // Build X matrix
    const X = dataset.rows.map(row => 
      colNames.map(col => (row as any)[col] || 0)
    );

    // Build nowX matrix
    const nowX = now.map(row => 
      colNames.map(col => (row as any)[col] || 0)
    );

    // Store for fallback use
    jsCoxInputRef.current = { durations, events, X, nowX, colNames };

    // Update diagnostics with prep info
    setDiag(prev => ({
      ...prev,
      rows: dataset.rows.length,
      cols: colNames.length,
      events: events.filter(e => e === 1).length,
      nowRows: now.length,
      colNames,
    }));

    return { dataset, now };
  }, [history, numbers, excludedNumbers, useZoneStrata]);

  /**
   * Run JS Cox fallback
   */
  const runJsCox = useCallback((pathUsed: 'js' | 'js_fallback' = 'js') => {
    const startTime = performance.now();
    
    if (!jsCoxInputRef.current) {
      buildInputs();
    }

    const { durations, events, X, nowX, colNames } = jsCoxInputRef.current!;
    
    const result = fitJsCox(durations, events, X, nowX, colNames, { penalizer });
    
    const endTime = performance.now();

    // Build summary from coefficients
    const summaryRows: CoxSummaryRow[] = result.colNames.map((col, i) => ({
      covariate: col,
      coef: result.coefficients[i],
      exp_coef: result.hazardRatios[i],
    }));

    setSummary(summaryRows);

    // Build results with number and partial hazard
    const newResults: CoxResult[] = numbers.map((num, i) => ({
      number: num,
      hazardRatio: result.partialHazards[i] || 1.0,
      partialHazard: result.partialHazards[i] || 1.0,
    }));

    setResults(newResults);
    setPythonWarning(null);

    // Update diagnostics
    setDiag(prev => ({
      ...prev,
      path_used: pathUsed,
      mode_selected: mode,
      timing_ms_js: endTime - startTime,
      penalizer,
      l1_ratio: 0, // JS only uses ridge (L2)
    }));

    setIsCalculated(true);
    setIsLoading(false);
  }, [numbers, penalizer, mode, buildInputs]);

  /**
   * Run Python Cox via Pyodide worker
   */
  const runPythonCox = useCallback(() => {
    const startTime = performance.now();
    setIsLoading(true);
    setPythonWarning(null);

    const { dataset, now } = buildInputs();

    // Create worker
    const worker = new Worker(
      new URL('../workers/coxPyodideWorker.return.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event) => {
      const endTime = performance.now();
      const payload = event.data;
      setRawPayload(payload);

      if (
        payload.ok === true &&
        payload.numbers?.length === 45 &&
        payload.diag?.final_x_cols?.length > 0
      ) {
        // Success case
        const summaryRows: CoxSummaryRow[] = payload.coefficients.map((c: any) => ({
          covariate: c.covariate,
          coef: c.coef,
          exp_coef: c.exp_coef,
          p: c.p,
        }));

        setSummary(summaryRows);

        const newResults: CoxResult[] = payload.numbers.map((num: number, i: number) => ({
          number: num,
          hazardRatio: payload.partialHazards[i] || 1.0,
          partialHazard: payload.partialHazards[i] || 1.0,
        }));

        setResults(newResults);
        setPythonWarning(null);

        setDiag(prev => ({
          ...prev,
          path_used: 'python',
          mode_selected: mode,
          timing_ms_python: endTime - startTime,
          python_empty_reason: payload.diag.empty_reason,
          requested_cols: payload.diag.requested_cols,
          final_x_cols: payload.diag.final_x_cols,
          removed_constants: payload.diag.removed_constants,
          has_zone_strata: payload.diag.has_zone_strata,
          penalizer: payload.diag.penalizer,
          l1_ratio: payload.diag.l1_ratio,
        }));

        setIsCalculated(true);
        setIsLoading(false);
      } else {
        // Python failed or returned empty results
        if (mode === 'auto') {
          // Auto-fallback to JS
          runJsCox('js_fallback');
        } else if (mode === 'python') {
          // Show warning, don't fallback
          const errorMsg = payload.error || payload.diag?.empty_reason || 'Python Cox failed';
          setPythonWarning(`Python mode failed: ${errorMsg}. No results available.`);
          setResults([]);
          setSummary([]);
          setIsCalculated(false);
          setIsLoading(false);

          setDiag(prev => ({
            ...prev,
            path_used: 'python',
            mode_selected: mode,
            timing_ms_python: endTime - startTime,
            python_empty_reason: payload.diag?.empty_reason || errorMsg,
          }));
        }
      }

      worker.terminate();
    };

    worker.onerror = (error) => {
      const endTime = performance.now();
      console.error('Worker error:', error);

      if (mode === 'auto') {
        runJsCox('js_fallback');
      } else if (mode === 'python') {
        setPythonWarning(`Python worker error: ${error.message}. No results available.`);
        setResults([]);
        setSummary([]);
        setIsCalculated(false);
        setIsLoading(false);

        setDiag(prev => ({
          ...prev,
          path_used: 'python',
          mode_selected: mode,
          timing_ms_python: endTime - startTime,
          python_empty_reason: `worker_error: ${error.message}`,
        }));
      }

      worker.terminate();
    };

    // Post message to worker
    worker.postMessage({
      dataset: dataset.rows,
      now,
      fitConfig: {
        penalizer,
        l1_ratio: l1Ratio,
        useZoneStrata,
      },
    });
  }, [mode, penalizer, l1Ratio, useZoneStrata, buildInputs, runJsCox]);

  /**
   * Compute - main entry point
   */
  const compute = useCallback(() => {
    setIsLoading(true);
    setPythonWarning(null);
    setRawPayload(null);

    // Build inputs first (updates prep diagnostics)
    buildInputs();

    // Branch by mode
    if (mode === 'js') {
      runJsCox('js');
    } else if (mode === 'python') {
      runPythonCox();
    } else {
      // auto - try Python first
      runPythonCox();
    }
  }, [mode, buildInputs, runJsCox, runPythonCox]);

  const sortedResults = useMemo(() => {
    const sorted = [...results];
    if (sortBy === "risk") {
      sorted.sort((a, b) => b.partialHazard - a.partialHazard);
    } else {
      sorted.sort((a, b) => a.number - b.number);
    }
    return sorted;
  }, [results, sortBy]);

  return (
    <section style={{ padding: "1rem", background: "#fff", borderRadius: "8px", marginBottom: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>📊 Cox Proportional Hazards Model</h2>
      
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        Semi-parametric survival model using lifelines (Python/Pyodide) or JS ridge regression fallback.
      </p>

      {/* Mode Selector */}
      <div style={{ marginBottom: "1rem", padding: "1rem", background: "#f8f9fa", borderRadius: "4px" }}>
        <div style={{ marginBottom: "0.5rem" }}>
          <strong>Computation Mode:</strong>
        </div>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="radio"
              value="auto"
              checked={mode === 'auto'}
              onChange={(e) => setMode(e.target.value as any)}
            />
            <span>Auto (Python with JS fallback)</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="radio"
              value="python"
              checked={mode === 'python'}
              onChange={(e) => setMode(e.target.value as any)}
            />
            <span>Python only (lifelines)</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="radio"
              value="js"
              checked={mode === 'js'}
              onChange={(e) => setMode(e.target.value as any)}
            />
            <span>JS only (ridge approximation)</span>
          </label>
        </div>
      </div>

      {/* Configuration Controls */}
      <div style={{ marginBottom: "1rem", padding: "1rem", background: "#e3f2fd", borderRadius: "4px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.85rem" }}>
              Penalizer (Ridge L2):
            </label>
            <input
              type="number"
              value={penalizer}
              onChange={(e) => setPenalizer(parseFloat(e.target.value))}
              step="0.001"
              min="0"
              style={{ width: "100%", padding: "0.25rem" }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.85rem" }}>
              L1 Ratio (Python only):
            </label>
            <input
              type="number"
              value={l1Ratio}
              onChange={(e) => setL1Ratio(parseFloat(e.target.value))}
              step="0.1"
              min="0"
              max="1"
              style={{ width: "100%", padding: "0.25rem" }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                checked={useZoneStrata}
                onChange={(e) => setUseZoneStrata(e.target.checked)}
              />
              <span style={{ fontSize: "0.85rem" }}>Use Zone Strata</span>
            </label>
          </div>
        </div>
      </div>

      {/* Status Banner */}
      {(isCalculated || diag.rows) && (
        <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "#fff3cd", borderRadius: "4px", fontSize: "0.85rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <div><strong>Mode:</strong> {diag.mode_selected || mode}</div>
            {diag.path_used && (
              <div>
                <strong>Path:</strong>{' '}
                <span style={{
                  padding: "0.25rem 0.5rem",
                  background: diag.path_used === 'python' ? '#28a745' : '#007bff',
                  color: "white",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                }}>
                  {diag.path_used === 'python' ? 'Python' : diag.path_used === 'js_fallback' ? 'JS Fallback' : 'JS Only'}
                </span>
              </div>
            )}
            {diag.rows !== undefined && (
              <div><strong>Data:</strong> {diag.rows} rows, {diag.cols} covariates, {diag.events} events</div>
            )}
            {diag.timing_ms_python && (
              <div><strong>Python Time:</strong> {diag.timing_ms_python.toFixed(0)}ms</div>
            )}
            {diag.timing_ms_js && (
              <div><strong>JS Time:</strong> {diag.timing_ms_js.toFixed(0)}ms</div>
            )}
          </div>
        </div>
      )}

      {/* Python Warning */}
      {pythonWarning && (
        <div style={{ marginBottom: "1rem", padding: "1rem", background: "#f8d7da", border: "1px solid #f5c6cb", borderRadius: "4px", color: "#721c24" }}>
          <strong>⚠️ Warning:</strong> {pythonWarning}
        </div>
      )}

      {/* Calculate Button */}
      <div style={{ marginBottom: "1rem" }}>
        <button
          onClick={compute}
          disabled={history.length < 50 || isLoading}
          style={{
            padding: "0.5rem 1rem",
            background: isLoading ? "#6c757d" : (isCalculated ? "#28a745" : "#007bff"),
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: history.length < 50 || isLoading ? "not-allowed" : "pointer",
            opacity: history.length < 50 || isLoading ? 0.6 : 1,
          }}
        >
          {isLoading ? "⏳ Computing..." : (isCalculated ? "✓ Recalculate" : "Calculate Cox Model")}
        </button>
        
        {history.length < 50 && (
          <span style={{ marginLeft: "1rem", color: "#dc3545", fontSize: "0.9rem" }}>
            Need at least 50 draws
          </span>
        )}
      </div>

      {/* Coefficient Summary Table */}
      {summary.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Model Coefficients</h3>
          <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #dee2e6", borderRadius: "4px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f8f9fa" }}>
                <tr>
                  <th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>Covariate</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Coef</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>exp(coef)</th>
                  {summary[0]?.p !== undefined && (
                    <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>p-value</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.covariate} style={{ borderBottom: "1px solid #dee2e6" }}>
                    <td style={{ padding: "0.5rem" }}>{row.covariate}</td>
                    <td style={{ padding: "0.5rem", textAlign: "right" }}>{row.coef.toFixed(4)}</td>
                    <td style={{ padding: "0.5rem", textAlign: "right" }}>{row.exp_coef.toFixed(4)}</td>
                    {row.p !== undefined && (
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>{row.p.toFixed(4)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                <option value="risk">Partial Hazard (High to Low)</option>
                <option value="number">Number</option>
              </select>
            </label>
          </div>

          <div style={{ maxHeight: "400px", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f8f9fa" }}>
                <tr>
                  <th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>Number</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Partial Hazard</th>
                  <th style={{ padding: "0.5rem", textAlign: "center", borderBottom: "2px solid #dee2e6" }}>Risk Level</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((result) => {
                  const riskLevel = result.partialHazard > 1.2 ? "High" : 
                                   result.partialHazard > 0.8 ? "Medium" : "Low";
                  const riskColor = result.partialHazard > 1.2 ? "#dc3545" : 
                                   result.partialHazard > 0.8 ? "#ffc107" : "#28a745";

                  return (
                    <tr key={result.number} style={{ borderBottom: "1px solid #dee2e6" }}>
                      <td style={{ padding: "0.5rem", fontWeight: "bold" }}>
                        {result.number}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {result.partialHazard.toFixed(4)}
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

          {/* Summary Stats */}
          <div style={{ marginTop: "1rem", padding: "1rem", background: "#f8f9fa", borderRadius: "4px" }}>
            <strong>Summary:</strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem", marginTop: "0.5rem", fontSize: "0.9rem" }}>
              <div>High Risk (PH&gt;1.2): <strong>{results.filter(r => r.partialHazard > 1.2).length}</strong></div>
              <div>Medium Risk (0.8-1.2): <strong>{results.filter(r => r.partialHazard >= 0.8 && r.partialHazard <= 1.2).length}</strong></div>
              <div>Low Risk (PH&lt;0.8): <strong>{results.filter(r => r.partialHazard < 0.8).length}</strong></div>
            </div>
          </div>
        </>
      )}

      {!isCalculated && !isLoading && (
        <div style={{ padding: "2rem", textAlign: "center", color: "#6c757d" }}>
          Calculate Cox model to see hazard ratios
        </div>
      )}

      {/* Debug Panels */}
      <div style={{ marginTop: "1rem" }}>
        <button
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          style={{
            padding: "0.25rem 0.5rem",
            background: "#6c757d",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "0.75rem",
            marginRight: "0.5rem",
          }}
        >
          {showDiagnostics ? "Hide" : "Show"} Diagnostics
        </button>
        <button
          onClick={() => setShowRawPayload(!showRawPayload)}
          style={{
            padding: "0.25rem 0.5rem",
            background: "#6c757d",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "0.75rem",
          }}
        >
          {showRawPayload ? "Hide" : "Show"} Raw Payload
        </button>
      </div>

      {showDiagnostics && (
        <div style={{ marginTop: "0.5rem", padding: "1rem", background: "#f8f9fa", borderRadius: "4px", fontSize: "0.75rem", fontFamily: "monospace" }}>
          <strong>Diagnostics:</strong>
          <pre style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {JSON.stringify(diag, null, 2)}
          </pre>
        </div>
      )}

      {showRawPayload && rawPayload && (
        <div style={{ marginTop: "0.5rem", padding: "1rem", background: "#f8f9fa", borderRadius: "4px", fontSize: "0.75rem", fontFamily: "monospace" }}>
          <strong>Raw Python Payload:</strong>
          <pre style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {JSON.stringify(rawPayload, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
};

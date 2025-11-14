/**
 * coxPyodideWorker.return.ts
 * Version: cox-return-1
 * 
 * Pyodide worker that loads lifelines and fits Cox Proportional Hazards model.
 * Returns results as a JSON string directly from Python to avoid PyProxy issues.
 */

// Worker type declarations
/// <reference lib="webworker" />
declare const self: WorkerGlobalScope & typeof globalThis;

// Pyodide types
interface PyodideInterface {
  loadPackagesFromImports(code: string): Promise<void>;
  runPythonAsync(code: string): Promise<any>;
  globals: any;
}

interface WorkerMessage {
  dataset: Array<{
    number: number;
    duration: number;
    event: number;
    freq_total_norm: number;
    time_since_last_norm: number;
    freq_fortnight_norm: number;
    freq_month_norm: number;
    freq_quarter_norm: number;
    tenure_norm: number;
    zone?: number;
  }>;
  now: Array<{
    number: number;
    freq_total_norm: number;
    time_since_last_norm: number;
    freq_fortnight_norm: number;
    freq_month_norm: number;
    freq_quarter_norm: number;
    tenure_norm: number;
    zone?: number;
  }>;
  fitConfig: {
    penalizer?: number;
    l1_ratio?: number;
    useZoneStrata?: boolean;
  };
}

interface WorkerResponse {
  ok: boolean;
  numbers?: number[];
  hazardRatios?: number[];
  coefficients?: Array<{ covariate: string; coef: number; exp_coef: number; p: number }>;
  partialHazards?: number[];
  diag?: {
    requested_cols: string[];
    final_x_cols: string[];
    removed_constants: string[];
    empty_reason: string | null;
    has_zone_strata: boolean;
    df_shape: [number, number];
    df_now_shape: [number, number];
    penalizer: number;
    l1_ratio: number;
    version: string;
  };
  error?: string;
}

// Load Pyodide
importScripts('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js');

let pyodideReadyPromise: Promise<PyodideInterface>;

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  try {
    const { dataset, now, fitConfig } = event.data;
    const { penalizer = 0.01, l1_ratio = 0.0, useZoneStrata = false } = fitConfig;

    // Initialize Pyodide if not already done
    if (!pyodideReadyPromise) {
      pyodideReadyPromise = (self as any).loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/',
      });
    }

    const pyodide = await pyodideReadyPromise;

    // Install packages
    await pyodide.loadPackagesFromImports(`
      import numpy
      import pandas
      import json
    `);

    // Install lifelines via micropip
    await pyodide.runPythonAsync(`
      import micropip
      await micropip.install('lifelines')
    `);

    // Convert dataset to Python-friendly format
    const datasetJson = JSON.stringify(dataset);
    const nowJson = JSON.stringify(now);

    // Python code to fit Cox model
    const pythonCode = `
import json
import numpy as np
import pandas as pd
from lifelines import CoxPHFitter

# Parse input data
dataset = json.loads("""${datasetJson}""")
now_data = json.loads("""${nowJson}""")

# Build DataFrame
df = pd.DataFrame(dataset)
df_now = pd.DataFrame(now_data)

# Configuration
penalizer = ${penalizer}
l1_ratio = ${l1_ratio}
use_zone_strata = ${useZoneStrata ? 'True' : 'False'}

# Diagnostics
diag = {
    "version": "cox-return-1",
    "penalizer": penalizer,
    "l1_ratio": l1_ratio,
    "has_zone_strata": use_zone_strata,
    "df_shape": list(df.shape),
    "df_now_shape": list(df_now.shape),
    "requested_cols": [],
    "final_x_cols": [],
    "removed_constants": [],
    "empty_reason": None
}

# Define covariate columns
all_cols = ['freq_total_norm', 'time_since_last_norm', 'freq_fortnight_norm', 
            'freq_month_norm', 'freq_quarter_norm', 'tenure_norm']
diag["requested_cols"] = all_cols.copy()

# Drop 'number' from features
X_cols = [c for c in all_cols if c in df.columns]

# Remove constant columns
removed = []
for col in X_cols[:]:
    if df[col].nunique() <= 1:
        removed.append(col)
        X_cols.remove(col)

diag["removed_constants"] = removed

# Check if we have any covariates left
if len(X_cols) == 0:
    diag["empty_reason"] = "all_covariates_constant"
    diag["final_x_cols"] = []
    result = {
        "ok": False,
        "numbers": [],
        "hazardRatios": [],
        "coefficients": [],
        "partialHazards": [],
        "diag": diag,
        "error": "No non-constant covariates available for Cox model"
    }
    output_json = json.dumps(result)
else:
    diag["final_x_cols"] = X_cols
    
    # Prepare strata column if needed
    strata_col = 'zone' if use_zone_strata and 'zone' in df.columns else None
    
    # Fit Cox model
    try:
        cph = CoxPHFitter(penalizer=penalizer, l1_ratio=l1_ratio)
        
        if strata_col:
            cph.fit(df, duration_col='duration', event_col='event', 
                   strata=[strata_col], show_progress=False)
        else:
            cph.fit(df, duration_col='duration', event_col='event', 
                   show_progress=False)
        
        # Extract summary
        summary = cph.summary
        coefficients = []
        
        for col in X_cols:
            if col in summary.index:
                row = summary.loc[col]
                coefficients.append({
                    "covariate": col,
                    "coef": float(row['coef']),
                    "exp_coef": float(row['exp(coef)']),
                    "p": float(row['p']) if 'p' in row.index else 0.0
                })
        
        # Calculate hazard ratios (exp(coef))
        hazard_ratios = [c["exp_coef"] for c in coefficients]
        
        # Predict partial hazards for "now" data
        if len(df_now) > 0:
            # Ensure df_now has all required columns
            for col in X_cols:
                if col not in df_now.columns:
                    df_now[col] = 0.0
            
            partial_hazards = cph.predict_partial_hazard(df_now).tolist()
            numbers = df_now['number'].tolist()
        else:
            partial_hazards = []
            numbers = []
        
        result = {
            "ok": True,
            "numbers": numbers,
            "hazardRatios": hazard_ratios,
            "coefficients": coefficients,
            "partialHazards": partial_hazards,
            "diag": diag
        }
        output_json = json.dumps(result)
    
    except Exception as e:
        diag["empty_reason"] = f"fit_error: {str(e)}"
        result = {
            "ok": False,
            "numbers": [],
            "hazardRatios": [],
            "coefficients": [],
            "partialHazards": [],
            "diag": diag,
            "error": str(e)
        }
        output_json = json.dumps(result)

output_json
`;

    // Run Python code and get JSON string result
    const jsonResult = await pyodide.runPythonAsync(pythonCode);
    
    // Parse the JSON string returned from Python
    const result: WorkerResponse = JSON.parse(jsonResult);
    
    // Post result back to main thread
    self.postMessage(result);

  } catch (error: any) {
    const errorResponse: WorkerResponse = {
      ok: false,
      error: error.message || String(error),
      diag: {
        requested_cols: [],
        final_x_cols: [],
        removed_constants: [],
        empty_reason: 'worker_exception',
        has_zone_strata: false,
        df_shape: [0, 0],
        df_now_shape: [0, 0],
        penalizer: 0,
        l1_ratio: 0,
        version: 'cox-return-1',
      },
    };
    self.postMessage(errorResponse);
  }
};

export {};

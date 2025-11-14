/**
 * Cox Pyodide Worker (Return-based version)
 * Version: cox-return-1
 * 
 * Uses Pyodide + lifelines library to perform Cox Proportional Hazards analysis.
 * Returns JSON string to avoid PyProxy/global retrieval issues.
 */

const WORKER_VERSION = 'cox-return-1';

interface WorkerRequest {
  type: 'compute';
  dataset: Array<{
    number: number;
    duration: number;
    event: number;
    [key: string]: number; // covariates
  }>;
  penalizer?: number;
  l1_ratio?: number;
}

interface WorkerResponse {
  ok: boolean;
  version: string;
  summary?: Array<{
    covariate: string;
    coef: number;
    exp_coef: number;
    se_coef: number;
    z: number;
    p: number;
    lower_95: number;
    upper_95: number;
  }>;
  hazardRatios?: Record<number, number>;
  numbers?: number[];
  diagnostics?: {
    final_x_cols: string[];
    n_obs: number;
    n_events: number;
    concordance?: number;
    partial_log_likelihood?: number;
    empty_reason?: string;
  };
  error?: string;
}

let pyodide: any = null;
let isInitializing = false;
let initPromise: Promise<void> | null = null;

async function initPyodide(): Promise<void> {
  if (pyodide) return;
  if (isInitializing && initPromise) {
    return initPromise;
  }

  isInitializing = true;
  initPromise = (async () => {
    try {
      // Load Pyodide from CDN
      const pyodideModule = await import('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.mjs');
      pyodide = await pyodideModule.loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/',
      });

      // Install required packages
      await pyodide.loadPackage(['micropip']);
      const micropip = pyodide.pyimport('micropip');
      await micropip.install(['lifelines', 'pandas', 'numpy']);
    } catch (error) {
      console.error('Failed to initialize Pyodide:', error);
      throw error;
    } finally {
      isInitializing = false;
    }
  })();

  return initPromise;
}

async function computeCoxModel(request: WorkerRequest): Promise<WorkerResponse> {
  try {
    await initPyodide();

    const { dataset, penalizer = 0.01, l1_ratio = 0.0 } = request;

    if (!dataset || dataset.length === 0) {
      return {
        ok: false,
        version: WORKER_VERSION,
        error: 'Empty dataset',
        diagnostics: {
          final_x_cols: [],
          n_obs: 0,
          n_events: 0,
          empty_reason: 'No data provided',
        },
      };
    }

    // Build Python code that returns JSON string
    const pythonCode = `
import json
import pandas as pd
from lifelines import CoxPHFitter
import numpy as np

# Parse dataset
data = ${JSON.stringify(dataset)}

# Convert to DataFrame
df = pd.DataFrame(data)

# Identify covariates (all columns except number, duration, event)
covariate_cols = [col for col in df.columns if col not in ['number', 'duration', 'event']]

# Prepare result object
result = {
    'ok': False,
    'version': '${WORKER_VERSION}',
    'diagnostics': {
        'final_x_cols': covariate_cols,
        'n_obs': len(df),
        'n_events': int(df['event'].sum()),
    }
}

# Check if we have covariates
if len(covariate_cols) == 0:
    result['diagnostics']['empty_reason'] = 'No covariates after filtering'
    json.dumps(result)
else:
    try:
        # Fit Cox model
        cph = CoxPHFitter(penalizer=${penalizer}, l1_ratio=${l1_ratio})
        cph.fit(df, duration_col='duration', event_col='event')
        
        # Extract summary
        summary_df = cph.summary
        summary_list = []
        for idx in summary_df.index:
            summary_list.append({
                'covariate': str(idx),
                'coef': float(summary_df.loc[idx, 'coef']),
                'exp_coef': float(summary_df.loc[idx, 'exp(coef)']),
                'se_coef': float(summary_df.loc[idx, 'se(coef)']),
                'z': float(summary_df.loc[idx, 'z']),
                'p': float(summary_df.loc[idx, 'p']),
                'lower_95': float(summary_df.loc[idx, 'exp(coef) lower 95%']),
                'upper_95': float(summary_df.loc[idx, 'exp(coef) upper 95%']),
            })
        
        # Extract partial hazards for each number
        # Compute risk scores (linear predictor) for each row
        partial_hazards = cph.predict_partial_hazard(df).values
        
        hazard_ratios = {}
        numbers = []
        for i, row in df.iterrows():
            num = int(row['number'])
            numbers.append(num)
            hazard_ratios[num] = float(partial_hazards[i])
        
        result['ok'] = True
        result['summary'] = summary_list
        result['hazardRatios'] = hazard_ratios
        result['numbers'] = numbers
        result['diagnostics']['concordance'] = float(cph.concordance_index_)
        result['diagnostics']['partial_log_likelihood'] = float(cph.log_likelihood_)
        
        # Check if all hazard ratios are identical (variance issue)
        if len(set(partial_hazards)) == 1:
            result['diagnostics']['empty_reason'] = 'All partial hazards identical (no variation)'
    
    except Exception as e:
        result['diagnostics']['empty_reason'] = f'Cox fitting error: {str(e)}'
    
    json.dumps(result)
`;

    // Execute Python code and get result as string
    const resultStr = await pyodide.runPythonAsync(pythonCode);
    const result: WorkerResponse = JSON.parse(resultStr);

    return result;
  } catch (error) {
    return {
      ok: false,
      version: WORKER_VERSION,
      error: error instanceof Error ? error.message : String(error),
      diagnostics: {
        final_x_cols: [],
        n_obs: 0,
        n_events: 0,
        empty_reason: 'Worker exception',
      },
    };
  }
}

// Worker message handler
self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === 'compute') {
    const response = await computeCoxModel(request);
    self.postMessage(response);
  }
});

// Export empty object for TypeScript
export {};

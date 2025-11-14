# Cox Proportional Hazards Implementation

## Overview

This implementation adds a comprehensive Cox Proportional Hazards (Cox PH) model to the SurvivalCoxPanel component with three computation modes:

1. **Auto Mode** (default): Attempts Python computation first, automatically falls back to JS if Python returns empty/invalid results
2. **Python Mode**: Uses Pyodide + Python lifelines library for full Cox PH analysis
3. **JS Mode**: Uses simplified JavaScript approximation for quick computation

## Architecture

### Components

#### 1. Pyodide Worker (`src/workers/coxPyodideWorker.return.ts`)

**Version:** `cox-return-1`

A Web Worker that loads Pyodide and the Python lifelines library to perform Cox PH regression. Uses a return-based approach (JSON string) to avoid PyProxy/global retrieval issues.

**Features:**
- Loads Pyodide from CDN
- Installs lifelines, pandas, and numpy
- Fits Cox PH model with configurable penalizer and L1 ratio
- Returns JSON string with summary, hazard ratios, and diagnostics
- Handles edge cases (empty covariates, identical hazard ratios, etc.)

**Request Interface:**
```typescript
{
  type: 'compute',
  dataset: Array<{
    number: number,
    duration: number,
    event: number,
    [covariates]: number  // e.g., freq_fortnight, freq_month, etc.
  }>,
  penalizer?: number,    // Default: 0.01
  l1_ratio?: number      // Default: 0.0
}
```

**Response Interface:**
```typescript
{
  ok: boolean,
  version: string,
  summary?: Array<{
    covariate: string,
    coef: number,
    exp_coef: number,
    se_coef: number,
    z: number,
    p: number,
    lower_95: number,
    upper_95: number
  }>,
  hazardRatios?: Record<number, number>,
  numbers?: number[],
  diagnostics?: {
    final_x_cols: string[],
    n_obs: number,
    n_events: number,
    concordance?: number,
    partial_log_likelihood?: number,
    empty_reason?: string
  },
  error?: string
}
```

#### 2. Updated SurvivalCoxPanel (`src/components/SurvivalCoxPanel.tsx`)

**New Features:**

1. **Mode Toggle**: Radio buttons to select computation mode (auto/python/js)
2. **Regularization Controls**: Sliders for penalizer (Ridge) and L1 ratio (Elastic Net)
3. **Path Indicator Chip**: Color-coded badge showing which path was used:
   - 🟢 Green: Python (lifelines)
   - 🔵 Blue: JS Only
   - 🟡 Yellow: JS Fallback
4. **Raw Payload Viewer**: Toggle button to view the complete worker response
5. **Python Summary Table**: Displays covariate coefficients, p-values, and confidence intervals
6. **Comprehensive Diagnostics**: Shows mode, path, timing, covariates, concordance, etc.
7. **Warning Banners**: Alerts for edge cases (non-45 rows, empty results, etc.)

**Helper Functions:**

- `buildInputs()`: Extracts features for all numbers and builds dataset
- `runJsCox()`: Runs JavaScript-based Cox approximation
- `runPythonCox()`: Sends request to Pyodide worker and processes response
- `handleCompute()`: Main computation handler that branches by mode

#### 3. Enhanced churnFeatures (`src/lib/churnFeatures.ts`)

**New Function:**

```typescript
extractFeaturesForNumber(
  history: Draw[],
  number: number,
  currentIdx: number,
  churnThreshold?: number
): {
  freqFortnight: number,
  freqMonth: number,
  freqQuarter: number,
  freqTotal: number,
  tenure: number,
  timeSinceLast: number,
  zpaGroup: number,
  churned?: boolean
}
```

Extracts time-series features for a single number at a specific point in history. Used to build covariates for the Cox model.

## Usage

### Mode Selection

1. **Auto Mode (Recommended)**
   - Select "Auto (Python → JS fallback)"
   - Click "Calculate Cox Model"
   - System attempts Python computation first
   - If Python returns empty/invalid results, automatically runs JS fallback
   - Path indicator shows which computation was used

2. **Python Only Mode**
   - Select "Python Only"
   - Click "Calculate Cox Model"
   - Loads Pyodide and runs lifelines Cox PH
   - Shows warning if results are empty (no fallback)
   - View Python summary table for covariate details

3. **JS Only Mode**
   - Select "JS Only"
   - Click "Calculate Cox Model"
   - Runs simplified JS approximation immediately
   - No worker loading overhead
   - Useful for quick exploration

### Regularization Parameters

- **Penalizer (Ridge)**: Controls L2 regularization (0.0 to 0.1)
  - Higher values = stronger regularization
  - Helps prevent overfitting
  - Used in both Python and JS modes

- **L1 Ratio (Elastic Net)**: Controls L1 vs L2 mix (0.0 to 1.0)
  - 0.0 = Pure Ridge (L2)
  - 1.0 = Pure Lasso (L1)
  - 0.5 = Equal mix
  - Only used in Python mode

### Diagnostics

After computation, the diagnostics panel shows:

- **Mode Selected**: Which mode was chosen
- **Path Used**: Actual computation path (python/js/js_fallback)
- **Python Status**: Success or failure (if Python was attempted)
- **Python Empty Reason**: Explanation if Python returned empty results
- **Final Covariates**: List of features used in the model
- **Observations & Events**: Dataset size and event count
- **Concordance Index**: Model discrimination ability (Python only)
- **Timing**: Computation time in milliseconds

### Viewing Results

1. **Results Table**: Shows hazard ratios, survival probabilities, and risk scores for all numbers
2. **Python Summary Table**: Displays detailed covariate analysis (Python mode only)
3. **Raw Payload**: Toggle to view the complete worker response JSON
4. **Summary Stats**: Count of high/medium/low risk numbers

## Edge Cases

### Non-45 Rows
If the dataset doesn't have exactly 45 numbers (due to exclusions):
- Auto mode: Skips Python, runs JS fallback
- Python mode: Shows warning and skips computation
- JS mode: Runs normally with available numbers

### Zero Covariates
If all covariates are filtered out (e.g., zero variance):
- Python returns `empty_reason: "No covariates after filtering"`
- Auto mode: Falls back to JS
- Python mode: Shows warning banner

### Identical Hazard Ratios
If all partial hazards are the same (no variation):
- Python returns `empty_reason: "All partial hazards identical"`
- Auto mode: Falls back to JS
- Python mode: Shows warning but displays results

## Implementation Notes

1. **Worker Lifecycle**: Worker is created on first Python computation and reused
2. **Cleanup**: Worker is terminated when component unmounts
3. **Error Handling**: All worker errors are caught and displayed in diagnostics
4. **Fallback Logic**: Auto mode only falls back if Python explicitly returns empty/invalid, not on worker errors
5. **Type Safety**: All interfaces are strongly typed with TypeScript
6. **No New Errors**: Implementation doesn't introduce new TypeScript errors beyond pre-existing JSX issues

## Testing

Manual testing required (no automated test infrastructure available):

1. **Test JS Mode**:
   - Select "JS Only" mode
   - Click calculate
   - Verify immediate results without worker loading
   - Check that hazard ratios vary between numbers

2. **Test Python Mode** (requires Pyodide support):
   - Select "Python Only" mode
   - Click calculate
   - Wait for Pyodide to load (first time only)
   - Verify Python summary table appears
   - Check diagnostics for concordance index

3. **Test Auto Mode**:
   - Select "Auto" mode
   - Click calculate
   - Verify it attempts Python first
   - If Python succeeds, path indicator shows "Python (lifelines)"
   - If Python fails, path indicator shows "JS Fallback"

4. **Test Edge Cases**:
   - Exclude some numbers to create non-45 dataset
   - Verify warning appears
   - Check that computation still completes

## Version

- Worker Version: `cox-return-1`
- Implementation Date: 2024
- Compatibility: Modern browsers with Web Worker and ES6 module support

## Future Enhancements

Potential improvements:
- Caching of Pyodide initialization
- Progressive worker loading indicator
- Configurable covariates selection
- Export results to CSV/JSON
- Survival curve visualization
- Time-dependent covariates support

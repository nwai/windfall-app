# Cox Proportional Hazards Implementation

## Overview

This implementation adds a return-based Pyodide lifelines Cox worker with a seamless JS fallback and mode toggle integration into SurvivalCoxPanel.

## Architecture

### Components

#### 1. Dataset Builder (`src/lib/coxDataset.ts`)

Builds datasets suitable for Cox Proportional Hazards modeling from lottery draw history.

**Key Functions:**
- `buildCoxDataset(history, options)` - Creates training dataset with survival times and covariates
- `buildNowDataset(history, numbers, options)` - Creates prediction dataset for current candidates

**Features:**
- Normalized covariates: freq_total, time_since_last, freq_fortnight, freq_month, freq_quarter, tenure
- Optional zone stratification (1-45 divided into 9 zones)
- Automatic exclusion of specified numbers
- Proper normalization of all features (0-1 range)

**Dataset Structure:**
```typescript
{
  number: number;          // Lottery number (1-45)
  duration: number;        // Time since last appearance
  event: number;           // 1 = appeared, 0 = never appeared (censored)
  freq_total_norm: number; // Normalized total frequency
  time_since_last_norm: number;
  freq_fortnight_norm: number;
  freq_month_norm: number;
  freq_quarter_norm: number;
  tenure_norm: number;
  zone?: number;           // Optional zone for stratification
}
```

#### 2. JS Cox Fallback (`src/lib/jsCox.ts`)

JavaScript-based Cox Proportional Hazards approximation using ridge regression.

**Algorithm:**
- Newton-Raphson optimization for partial likelihood
- Ridge penalty (L2 regularization) for stability
- Gaussian elimination with partial pivoting for linear system solving

**Key Function:**
```typescript
fitJsCox(
  durations: number[],
  events: number[],
  X: number[][],
  nowX: number[][],
  colNames: string[],
  options?: { penalizer?: number }
)
```

**Returns:**
```typescript
{
  coefficients: number[];      // Beta coefficients
  hazardRatios: number[];      // exp(beta)
  partialHazards: number[];    // exp(beta * X_now) for predictions
  colNames: string[];
}
```

#### 3. Pyodide Worker (`src/workers/coxPyodideWorker.return.ts`)

Web Worker that loads Pyodide and uses Python's lifelines library for true Cox PH modeling.

**Version:** cox-return-1

**Features:**
- Loads Pyodide + numpy/pandas/scipy + lifelines via micropip
- Returns results as JSON string from Python (avoids PyProxy issues)
- Robust diagnostics and error handling
- Support for penalizer, l1_ratio, and zone stratification

**Message Format:**
```typescript
// Input
{
  dataset: CoxDatasetRow[];
  now: CoxDatasetRow[];
  fitConfig: {
    penalizer?: number;
    l1_ratio?: number;
    useZoneStrata?: boolean;
  };
}

// Output
{
  ok: boolean;
  numbers?: number[];
  hazardRatios?: number[];
  coefficients?: Array<{
    covariate: string;
    coef: number;
    exp_coef: number;
    p: number;
  }>;
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
```

#### 4. SurvivalCoxPanel (`src/components/SurvivalCoxPanel.tsx`)

React component with mode selector and dual implementation support.

**Modes:**
1. **auto** - Tries Python first, automatically falls back to JS on failure
2. **python** - Python only, shows warning on failure (no auto fallback)
3. **js** - JavaScript only, immediate results

**UI Components:**
- Mode selector (radio buttons)
- Configuration controls (penalizer, l1_ratio, zone strata)
- Status banner (mode, path used, timing, data info)
- Coefficient table (model summary)
- Results table (partial hazards per number)
- Debug panels (diagnostics, raw payload)

**Key Functions:**
- `buildInputs()` - Builds dataset and prepares JS Cox inputs
- `runJsCox(pathUsed)` - Executes JS Cox fallback
- `runPythonCox()` - Spawns Pyodide worker and handles results
- `compute()` - Main entry point that branches by mode

## Usage

### Basic Usage

```tsx
<SurvivalCoxPanel 
  history={drawHistory}
  excludedNumbers={[13, 44]}
/>
```

### Mode Behavior

#### Mode: js
1. User selects "JS only" mode
2. Clicks "Calculate Cox Model"
3. `compute()` → `runJsCox('js')`
4. Immediate results using ridge regression
5. Status shows "JS Only"

#### Mode: python
1. User selects "Python only" mode
2. Clicks "Calculate Cox Model"
3. `compute()` → `runPythonCox()`
4. Worker loads Pyodide and lifelines
5. On success: displays Python results, status shows "Python"
6. On failure: displays warning, no auto fallback

#### Mode: auto (default)
1. User selects "Auto" mode (or default)
2. Clicks "Calculate Cox Model"
3. `compute()` → `runPythonCox()`
4. Worker attempts Python Cox fit
5. On success: displays Python results, status shows "Python"
6. On failure: automatically calls `runJsCox('js_fallback')`, status shows "JS Fallback"

## Diagnostics

The component tracks comprehensive diagnostics:

```typescript
{
  mode_selected: 'auto' | 'python' | 'js';
  path_used: 'python' | 'js' | 'js_fallback';
  python_empty_reason?: string;
  timing_ms_python?: number;
  timing_ms_js?: number;
  rows?: number;
  cols?: number;
  events?: number;
  nowRows?: number;
  colNames?: string[];
  // Python-specific
  requested_cols?: string[];
  final_x_cols?: string[];
  removed_constants?: string[];
  has_zone_strata?: boolean;
  penalizer?: number;
  l1_ratio?: number;
}
```

## Configuration Options

### Penalizer (Ridge L2)
- Range: 0 to ∞
- Default: 0.01
- Used by: Both Python and JS
- Purpose: Prevents overfitting by penalizing large coefficients

### L1 Ratio
- Range: 0 to 1
- Default: 0.0
- Used by: Python only
- Purpose: Controls elastic net mixing (0=ridge, 1=lasso)

### Use Zone Strata
- Type: Boolean
- Default: false
- Used by: Both Python and JS
- Purpose: Stratifies model by zone (1-9) to control for zone effects

## Error Handling

### Python Errors
1. **Worker fails to load**: Auto fallback to JS (in auto mode)
2. **All covariates constant**: Returns ok=false with empty_reason
3. **Fit error**: Returns ok=false with error message
4. **Invalid data**: Returns ok=false with diagnostics

### JS Errors
1. **Singular matrix**: Stops iterations, returns current coefficients
2. **Empty input**: Returns empty arrays
3. **Invalid data**: Handled gracefully with zero defaults

## Testing

### Unit Tests

**coxDataset.test.ts:**
- ✅ Correct number of rows (45 or excluded count)
- ✅ Normalization (all values 0-1)
- ✅ Event marking (1 for appeared, 0 for never)
- ✅ Exclusion of specified numbers
- ✅ Zone inclusion when requested

**jsCox.test.ts:**
- ✅ Returns correct structure
- ✅ Hazard ratios = exp(coefficients)
- ✅ Handles empty input
- ✅ Applies ridge penalty correctly

### Integration Testing

To test the full implementation:

1. **Mode: js**
   - Select "JS only" mode
   - Click "Calculate Cox Model"
   - Verify immediate results appear
   - Check status shows "JS Only"
   - Verify partial hazards are non-uniform

2. **Mode: python**
   - Select "Python only" mode
   - Click "Calculate Cox Model"
   - Wait for Pyodide to load (~10-30 seconds first time)
   - Verify Python results appear with p-values
   - Check status shows "Python"
   - Verify diagnostics show final_x_cols

3. **Mode: auto**
   - Select "Auto" mode
   - Click "Calculate Cox Model"
   - If Python succeeds: status shows "Python"
   - If Python fails: status shows "JS Fallback"
   - Verify seamless transition in case of failure

## Performance

### JS Cox
- **Time**: ~10-100ms
- **Memory**: Minimal
- **Accuracy**: Approximation, suitable for quick analysis

### Python Cox
- **First Load**: ~10-30 seconds (Pyodide + packages)
- **Subsequent**: ~2-5 seconds
- **Memory**: ~100MB (Pyodide runtime)
- **Accuracy**: True Cox PH with p-values and full statistics

## Limitations

### JS Implementation
- Approximation using Newton-Raphson
- No p-values or confidence intervals
- Ridge penalty only (no lasso)
- May not converge on difficult datasets

### Python Implementation
- Long initial load time
- Requires modern browser with Web Workers
- No offline support (needs CDN for Pyodide)
- Memory intensive

## Future Enhancements

1. **Caching**: Cache Pyodide and packages in IndexedDB
2. **Progress**: Show loading progress for Pyodide
3. **Visualization**: Plot baseline hazard and survival curves
4. **Export**: Export coefficients and predictions to CSV
5. **Comparison**: Side-by-side comparison of Python vs JS results

## Technical Notes

### Why Return JSON String from Python?

The worker returns `json.dumps(result)` from Python instead of returning Python objects directly. This avoids PyProxy serialization issues and ensures clean, predictable data transfer between Python and JavaScript.

### Why Ridge Penalty in JS?

The JS implementation uses only ridge (L2) penalty because:
1. Simpler to implement (no proximal gradient needed)
2. More stable convergence
3. Sufficient for most lottery analysis use cases

### Zone Stratification

Zone stratification treats each zone (1-9) as a separate stratum in the Cox model, which:
1. Controls for systematic zone effects
2. Allows hazard ratios to vary by zone
3. More flexible than including zone as a covariate

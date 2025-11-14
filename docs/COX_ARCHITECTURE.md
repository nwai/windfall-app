# Cox Pyodide Worker Architecture

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SurvivalCoxPanel Component                    │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      User Interface                       │   │
│  │                                                            │   │
│  │  ┌──────────────┐  ┌─────────────┐  ┌────────────────┐   │   │
│  │  │ Mode Toggle  │  │Regularization│  │ Path Indicator │   │   │
│  │  │ ○ Auto       │  │  Penalizer   │  │ 🟢 Python     │   │   │
│  │  │ ○ Python     │  │  L1 Ratio    │  │ 🔵 JS Only    │   │   │
│  │  │ ○ JS         │  │              │  │ 🟡 JS Fallback│   │   │
│  │  └──────────────┘  └─────────────┘  └────────────────┘   │   │
│  │                                                            │   │
│  │  ┌───────────────────────────────────────────────────┐   │   │
│  │  │        Calculate Cox Model Button                 │   │   │
│  │  └───────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Computation Logic                      │   │
│  │                                                            │   │
│  │  handleCompute()                                          │   │
│  │       │                                                    │   │
│  │       ├─[mode=js]────────────► runJsCox()                │   │
│  │       │                              │                     │   │
│  │       │                              └─► JS Approximation │   │
│  │       │                                                    │   │
│  │       ├─[mode=python]────────► runPythonCox()            │   │
│  │       │                              │                     │   │
│  │       │                              └─► Pyodide Worker   │   │
│  │       │                                                    │   │
│  │       └─[mode=auto]──────────► runPythonCox()            │   │
│  │                                      │                     │   │
│  │                                 [if empty/invalid]         │   │
│  │                                      │                     │   │
│  │                                      └─► runJsCox()        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     Results Display                       │   │
│  │                                                            │   │
│  │  • Hazard Ratios Table                                    │   │
│  │  • Python Summary Table (if Python mode)                  │   │
│  │  • Diagnostics Panel                                      │   │
│  │  • Raw Payload Viewer                                     │   │
│  │  • Warning Banners (for edge cases)                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ postMessage()
                              ▼
        ┌─────────────────────────────────────────┐
        │   coxPyodideWorker.return.ts (Worker)   │
        │                                          │
        │  ┌────────────────────────────────────┐ │
        │  │  Initialize Pyodide (once)         │ │
        │  │  • Load pyodide.mjs from CDN       │ │
        │  │  • Install micropip                │ │
        │  │  • Install lifelines, pandas, numpy│ │
        │  └────────────────────────────────────┘ │
        │                                          │
        │  ┌────────────────────────────────────┐ │
        │  │  Compute Cox Model                 │ │
        │  │  • Parse dataset                   │ │
        │  │  • Identify covariates             │ │
        │  │  • Fit CoxPHFitter                 │ │
        │  │  • Extract summary & hazard ratios │ │
        │  │  • Return JSON string              │ │
        │  └────────────────────────────────────┘ │
        │                                          │
        │  ┌────────────────────────────────────┐ │
        │  │  Edge Case Detection               │ │
        │  │  • Check for empty covariates      │ │
        │  │  • Detect identical hazards        │ │
        │  │  • Handle fitting errors           │ │
        │  └────────────────────────────────────┘ │
        └─────────────────────────────────────────┘
                              │
                              │ response
                              ▼
                     (back to Component)
```

## Data Flow

### Input: Draw History
```
history: Draw[] = [
  { main: [1,2,3,4,5,6], supp: [7], date: '...' },
  { main: [8,9,10,11,12,13], supp: [14], date: '...' },
  ...
]
```

### Step 1: Extract Features (buildInputs)
```typescript
for each number 1-45:
  features = extractFeaturesForNumber(history, number, currentIdx)
  dataset.push({
    number,
    duration: features.timeSinceLast,
    event: 1,
    freq_fortnight: features.freqFortnight,
    freq_month: features.freqMonth,
    freq_quarter: features.freqQuarter,
    tenure: features.tenure,
    zpa_group: features.zpaGroup
  })
```

### Step 2: Compute Cox Model

#### Option A: JavaScript (runJsCox)
```typescript
for each number:
  freqScore = features.freqTotal / history.length
  recencyScore = exp(-timeSinceLast / 20)
  regularization = penalizer * (freqFortnight + freqMonth)
  hazardRatio = (1 - freqScore) * (1 - recencyScore) + 
                BASELINE - regularization * 0.01
  survivalProbability = exp(-hazardRatio)
  riskScore = hazardRatio * (1 + timeSinceLast / 100)
```

#### Option B: Python (runPythonCox → Worker)
```python
# In worker (Python)
df = pd.DataFrame(dataset)
cph = CoxPHFitter(penalizer=0.01, l1_ratio=0.0)
cph.fit(df, duration_col='duration', event_col='event')

summary = cph.summary  # Covariate statistics
partial_hazards = cph.predict_partial_hazard(df)  # Per-number HRs

return {
  ok: true,
  summary: [...],
  hazardRatios: { 1: 1.234, 2: 0.987, ... },
  diagnostics: {
    final_x_cols: ['freq_fortnight', 'freq_month', ...],
    concordance: 0.67,
    ...
  }
}
```

### Step 3: Display Results
```
Results Table:
┌────────┬──────────────┬───────────────┬────────────┬────────────┐
│ Number │ Hazard Ratio │ Survival Prob │ Risk Score │ Risk Level │
├────────┼──────────────┼───────────────┼────────────┼────────────┤
│   42   │    1.456     │    23.3%      │   1.789    │    High    │
│   13   │    1.234     │    29.1%      │   1.456    │    High    │
│    7   │    0.987     │    37.3%      │   0.987    │   Medium   │
│   ...  │    ...       │    ...        │   ...      │    ...     │
└────────┴──────────────┴───────────────┴────────────┴────────────┘

Python Summary (if mode=python or auto→python):
┌──────────────┬────────┬──────────┬────────┬───────┬─────────┬──────────────┐
│  Covariate   │  Coef  │ exp(Coef)│   SE   │   z   │ p-value │  95% CI      │
├──────────────┼────────┼──────────┼────────┼───────┼─────────┼──────────────┤
│freq_fortnight│ -0.123 │  0.884   │ 0.045  │ -2.73 │  0.006  │ [0.81, 0.96] │
│  freq_month  │  0.089 │  1.093   │ 0.032  │  2.78 │  0.005  │ [1.03, 1.16] │
│    tenure    │ -0.002 │  0.998   │ 0.001  │ -2.00 │  0.046  │ [0.996, 1.0] │
│   ...        │  ...   │   ...    │  ...   │  ...  │   ...   │     ...      │
└──────────────┴────────┴──────────┴────────┴───────┴─────────┴──────────────┘

Diagnostics:
• Mode Selected: auto
• Path Used: python
• Python Status: ✓ Success
• Final Covariates (6): freq_fortnight, freq_month, freq_quarter, tenure, 
                         timeSinceLast, zpa_group
• Observations: 45, Events: 45
• Concordance Index: 0.6734
• Python Timing: 1847ms
```

## Mode Behavior Matrix

| Mode   | Dataset=45 | Covariates>0 | Python Result | Action Taken        | Path Indicator |
|--------|------------|--------------|---------------|---------------------|----------------|
| js     | Any        | Any          | N/A           | Run JS only         | 🔵 JS Only     |
| python | Yes        | Yes          | Valid         | Use Python          | 🟢 Python      |
| python | Yes        | Yes          | Empty         | Show warning        | 🟢 Python      |
| python | Yes        | No           | Empty         | Show warning        | 🟢 Python      |
| python | No         | Any          | N/A           | Show warning, skip  | (none)         |
| auto   | Yes        | Yes          | Valid         | Use Python          | 🟢 Python      |
| auto   | Yes        | Yes          | Empty         | Fallback to JS      | 🟡 JS Fallback |
| auto   | Yes        | No           | Empty         | Fallback to JS      | 🟡 JS Fallback |
| auto   | No         | Any          | N/A           | Skip Python, use JS | 🟡 JS Fallback |

## Version Information

- **Worker Version**: cox-return-1
- **Component Version**: 2024 (complete rewrite)
- **Pyodide Version**: v0.24.1
- **Python Packages**: lifelines, pandas, numpy

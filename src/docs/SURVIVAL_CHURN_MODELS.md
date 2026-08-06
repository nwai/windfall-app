# Advanced Survival Analysis and Churn/Return Diagnostic Models

This document describes the survival analysis and churn/return diagnostic models integrated into the Windfall app.

## Overview

The Windfall app includes historical diagnostic models for analyzing number "churn" (departure/inactivity), "return" (reactivation), and absence duration. These tools compare historical evidence across methods and expose where the methods agree or disagree. Their outputs are descriptive scores from the selected draw history, not calibrated next-draw probabilities.

All diagnostic paths should use real historical draw rows only. Simulated fallback rows are excluded before the models build features or backtests.

## Phase 1: ML-based Churn & Return Diagnostics

### Churn Diagnostic (`ChurnPredictor.tsx`)

**Purpose:** Scores which numbers currently have stronger churn or inactivity evidence under the selected churn threshold.

**Method:** Logistic regression by default, with optional random forest support when the optional dependency is available. The model is trained on historical appearance features and held-out labels from the active real-history window.

**Features Used:**
- Appearances in recent count windows: `freqFortnight`, `freqMonth`, and `freqQuarter`
- Tenure since first observed in the selected history
- Time since last appearance
- ZPA group index when supplied
- Current churn label under the selected threshold

**Metrics:**
- Accuracy: held-out label hit rate for the train/test split
- Precision: of rows scored as churn, how many were churn labels in the held-out split
- Recall: of held-out churn labels, how many were selected by the score threshold

**Output:** Churn score (0-100%) for each held-out number. The score is descriptive and model-relative; it is not a promise that the number will disappear next.

### Return Diagnostic (`ReturnPredictor.tsx`)

**Purpose:** Scores currently churned numbers by historical reactivation evidence when return labels have been computed.

**Method:** Logistic regression by default, with optional random forest support when available. The component stays disabled when return labels are absent, rather than emitting unsupported scores.

**Features:** Same current feature set as the churn diagnostic, applied only to rows with a churn label and a computed return label.

**Output:** Return score (0-100%) for eligible churned numbers. The score is descriptive; it should be read as model support in the held-out split, not a calibrated next-draw probability.

### Multi-State Churn Panel (`MultiStateChurnPanel.tsx`)

**Purpose:** Provides discrete-time multi-state analysis tracking numbers through lifecycle states.

**States:**
- **Active:** Appeared recently within the churn threshold
- **Churned:** Inactive for at least the churn threshold
- **Returned:** Was churned and later appeared again

**Metrics:**
- Current state for each number
- Times churned
- Times returned
- Current streak in the current state

**State Transition View:**

```text
Active -> Churned -> Returned
```

This is a state accounting view. It summarizes observed movement between states and does not assert that the next transition is knowable.

## Phase 2: Classic Survival Models

### Cox Proportional Hazards (`SurvivalCoxPanel.tsx`)

**Purpose:** Semi-parametric survival-style model estimating relative absence hazard.

**Method:** Simplified JavaScript approximation of a Cox proportional-hazards style ranking. A full covariate-rich Cox implementation would require a survival-analysis library such as Python lifelines via Pyodide or a server-side runtime.

**Output:**
- **Hazard Ratio (HR):** Relative modeled absence hazard compared with baseline
  - HR > 1: higher modeled absence hazard
  - HR < 1: lower modeled absence hazard
- **Survival Estimate:** Historical estimate of continuing in the absence state
- **Risk Score:** Combined ranking metric for comparison

**Use Case:** Useful for comparing relative absence behavior across numbers, not for claiming deterministic next-draw behavior.

### Frailty Model (`SurvivalFrailtyPanel.tsx`)

**Purpose:** Models repeated appearances and disappearances using gamma-frailty style estimates to capture unobserved heterogeneity.

**Method:** Gamma frailty model for recurrent event diagnostics.

**Key Concept:** "Frailty" represents unobserved factors that make some historical number patterns more variable than others.

**Frailty Interpretation:**
- High frailty (>1.5): more variable historical spacing
- Medium frailty (1.0-1.5): moderate historical variability
- Low frailty (<1.0): more regular historical spacing

**Parameters:**
- theta: frailty variance parameter; higher values indicate more heterogeneity between numbers

**Output:**
- Frailty estimate for each number
- Event count
- Average inter-event time
- Hazard rate
- Next-event score

## Phase 3: Consensus Visualization & Model Comparison

### Consensus Panel (`ConsensusPanel.tsx`)

**Purpose:** Aggregates scores from survival/churn diagnostics and visualizes agreements or disagreements.

**Consensus Score:** Average of normalized model scores. A high score means stronger shared support inside the selected diagnostics, not a calibrated future probability.

**Agreement Metric:** Measures how similar the model scores are.
- Calculated as: `1 - coefficient_of_variation`

**Features:**
- **Model Comparison Table:** Shows per-number consensus ranks with individual model scores
- **Agreement Filtering:** Filters to rows where model scores are similar
- **Visual Indicators:**
  - Green: high agreement
  - Yellow: medium agreement
  - Red: low agreement
- **Top Display:** Shows highest-scoring numbers color-coded by agreement

**Supported Inputs:**
- Churn diagnostic score (inverted when interpreting appearance support)
- Return diagnostic score
- Cox PH survival estimate
- Frailty next-event score
- Kaplan-Meier survival estimate

## Feature Engineering

The current ML diagnostic feature set is defined in `churnFeatures.ts`.

### Core Features

1. **Frequency Features**
   - `freqFortnight`: appearances in the recent 6-draw window
   - `freqMonth`: appearances in the recent 12-draw window
   - `freqQuarter`: appearances in the recent 36-draw window

2. **Tenure Features**
   - `tenure`: draws since first observed in the selected history
   - `timeSinceLast`: draws since last observed

3. **Grouping Feature**
   - `zpaGroup`: optional zone-pattern group index

4. **Labels**
   - `churnLabel`: whether the number is inactive beyond the churn threshold
   - `returnLabel`: reserved until a return-labeling pass computes it

## Usage Guide

### Training and Scoring

1. Use a real-history window with enough rows for the selected model.
2. Click "Train & Score" on the diagnostic panel.
3. Review held-out metrics before interpreting score ranks.
4. Treat scores as historical model diagnostics, not guarantees.

### Interpreting Results

**For Churn Diagnostic:**
- High score: stronger churn evidence under the selected threshold
- Medium score: mixed churn evidence
- Low score: weaker churn evidence

**For Return Diagnostic:**
- High score: stronger historical reactivation evidence when labels exist
- Low score: weaker historical reactivation evidence

**For Cox PH:**
- Focus on hazard ratios relative to 1.0
- Higher HR means higher modeled absence hazard

**For Frailty:**
- High frailty numbers have more variable historical spacing
- Low frailty numbers have more regular historical spacing

**For Consensus:**
- High agreement plus high score means several diagnostics are pointing in the same direction
- Low agreement means the diagnostics disagree
- Model agreement means shared evidence or shared assumptions, not reliability by itself

## Integration with WFMQYH Data

All diagnostics work with the standard WFMQYH windowing:
- Models use the current filtered history window
- Simulated fallback rows are ignored
- Excluded numbers are handled by the calling panels where applicable
- Main and supplementary numbers are tracked separately only where the specific panel supports that distinction

## Best Practices

1. **Refresh diagnostics periodically:** New draws can change current-window scores.
2. **Check provenance first:** Confirm how many real rows are being used and whether simulated rows were ignored.
3. **Compare multiple methods:** Agreement is useful context, but not proof.
4. **Tune churn threshold carefully:** The default threshold is a modeling choice, not a universal law.
5. **Check held-out metrics:** Low metrics mean the score should be treated with extra caution.

## Technical Notes

- Models run in-browser.
- Training is client-side TypeScript/JavaScript.
- Optional random forest support depends on runtime availability.
- Larger datasets may benefit from Web Workers, IndexedDB model caching, or a dedicated statistical runtime.

## Future Enhancements

Potential improvements:
- Walk-forward validation for each diagnostic model
- Explicit return-label generation and tests
- Cross-validation and hyperparameter tuning UI
- Export/import trained model diagnostics
- Rolling evaluation over time
- Zone-aware diagnostics
- Sequence diagnostics with clear out-of-sample validation

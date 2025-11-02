# Advanced Survival Analysis and Churn/Return Prediction Models

This document describes the advanced survival analysis and churn/return prediction models integrated into the Windfall app.

## Overview

The Windfall app now includes multiple predictive models for analyzing number "churn" (departure/inactivity) and "return" (reactivation), along with consensus visualizations that compare outputs across all models for robust, interpretable insights.

## Phase 1: ML-based Churn & Return Predictors

### Churn Predictor (`ChurnPredictor.tsx`)

**Purpose:** Predicts which numbers are likely to "churn" (disappear for an extended period, typically 15+ draws).

**Method:** Logistic regression trained on historical appearance patterns.

**Features Used:**
- Frequency of appearances in recent windows (last 5, 10, 20, 50 draws)
- Time since last appearance
- Average gap between appearances
- Trend slope (increasing/decreasing frequency)
- Volatility of appearance patterns
- Current state (active/churned/returned)

**Metrics:**
- Accuracy: Percentage of correct predictions
- Precision: Of predicted churns, how many actually churned
- Recall: Of actual churns, how many were predicted
- F1 Score: Harmonic mean of precision and recall

**Output:** Churn probability (0-100%) for each number with risk categorization (High/Medium/Low).

### Return Predictor (`ReturnPredictor.tsx`)

**Purpose:** Predicts which currently churned numbers are likely to return (reactivate) soon.

**Method:** Logistic regression trained specifically on churned numbers from historical data.

**Features:** Same as Churn Predictor, but applied only to numbers that have been inactive for the churn threshold period.

**Output:** Return probability (0-100%) for churned numbers, showing which ones are most likely to reappear.

### Multi-State Churn Panel (`MultiStateChurnPanel.tsx`)

**Purpose:** Provides discrete-time multi-state analysis tracking numbers through lifecycle states.

**States:**
- **Active:** Appeared recently (within churn threshold)
- **Churned:** Inactive for extended period (≥ churn threshold)
- **Returned:** Was churned but came back

**Metrics:**
- Current state for each number
- Times churned (number of times entered churned state)
- Times returned (number of times reactivated after churning)
- Current streak (consecutive draws in current state)

**State Transition Model:**
```
Active → Churned (15+ draws) → Returned
```

## Phase 2: Classic Survival Models

### Cox Proportional Hazards (`SurvivalCoxPanel.tsx`)

**Purpose:** Semi-parametric survival model estimating the hazard (risk) of a number not appearing.

**Method:** Simplified JS approximation of Cox PH model. For full implementation with covariates, would use Pyodide + Python lifelines library.

**Output:**
- **Hazard Ratio (HR):** Relative risk compared to baseline
  - HR > 1: Higher risk of not appearing
  - HR < 1: Lower risk (more likely to appear)
- **Survival Probability:** Likelihood of continuing to appear
- **Risk Score:** Combined metric for ranking

**Use Case:** Best for understanding relative risks between numbers and comparing covariate effects.

### Frailty Model (`SurvivalFrailtyPanel.tsx`)

**Purpose:** Models repeated appearances/disappearances using gamma frailty to capture unobserved heterogeneity.

**Method:** Gamma frailty model for recurrent events.

**Key Concept:** "Frailty" represents unobserved factors that make some numbers more or less likely to appear regularly.

**Frailty Interpretation:**
- High frailty (>1.5): More variable, less predictable patterns
- Medium frailty (1.0-1.5): Moderate variability
- Low frailty (<1.0): Consistent, regular appearance patterns

**Parameters:**
- θ (theta): Frailty variance parameter - higher values indicate more heterogeneity between numbers

**Output:**
- Frailty estimate for each number
- Event count (total appearances)
- Average inter-event time
- Hazard rate
- Next event probability

## Phase 3: Consensus Visualization & Model Comparison

### Consensus Panel (`ConsensusPanel.tsx`)

**Purpose:** Aggregates predictions from all survival/churn models and visualizes agreements/disagreements.

**Consensus Score:** Average of all model predictions (normalized to 0-1 scale where 1 = high probability of appearing).

**Agreement Metric:** Measures how much models agree (1.0 = perfect agreement, 0.0 = high disagreement).
- Calculated as: `1 - coefficient_of_variation`

**Features:**
- **Model Comparison Table:** Shows per-number consensus ranks with individual model scores
- **Agreement Filtering:** Filter to show only numbers where models agree (adjustable threshold)
- **Visual Indicators:**
  - Green: High agreement (>80%)
  - Yellow: Medium agreement (60-80%)
  - Red: Low agreement (<60%)
- **Top 10 Display:** Visual badges showing consensus top numbers color-coded by agreement

**Supported Models:**
- Churn ML (inverted - high churn = low appearance probability)
- Return ML
- Cox PH (survival probability)
- Frailty (next event probability)
- Kaplan-Meier Survival

## Feature Engineering

All ML models use a common feature set defined in `churnFeatures.ts`:

### Core Features:
1. **Frequency Features:**
   - `freqLast5`: Appearances in last 5 draws
   - `freqLast10`: Appearances in last 10 draws
   - `freqLast20`: Appearances in last 20 draws
   - `freqLast50`: Appearances in last 50 draws
   - `freqTotal`: Total appearances in history

2. **Tenure Features:**
   - `timeSinceLast`: Draws since last appearance
   - `longestGap`: Longest gap between appearances
   - `avgGap`: Average gap between appearances

3. **Pattern Features:**
   - `trendSlope`: Linear trend of recent appearances
   - `volatility`: Standard deviation of inter-appearance gaps

4. **State Features:**
   - `isActive`: Appeared recently
   - `hasChurned`: Currently inactive for extended period
   - `hasReturned`: Previously churned but came back

## Usage Guide

### Training Models:
1. Ensure you have sufficient history (minimum 100 draws recommended)
2. Click "Train Model" button on each panel
3. Wait for training to complete
4. Review model metrics (accuracy, precision, recall, F1)

### Interpreting Results:

**For Churn Predictor:**
- High risk (>70%): Number likely to disappear
- Medium risk (50-70%): Moderate churn probability
- Low risk (<50%): Number likely to remain active

**For Return Predictor:**
- High probability (>70%): Churned number likely to return soon
- Low probability (<50%): May remain inactive longer

**For Cox PH:**
- Focus on hazard ratios relative to 1.0
- Higher HR = higher risk of not appearing

**For Frailty:**
- High frailty numbers have unpredictable patterns
- Low frailty numbers are more consistent

**For Consensus:**
- High agreement + high score = strong prediction
- Low agreement = models disagree, use caution
- Filter by agreement threshold to focus on reliable predictions

## Integration with WFMQY Data

All models work with the standard WFMQY (Weekly/Fortnightly/Monthly/Quarterly/Yearly) windowing:
- Models automatically use the `filteredHistory` from the current window selection
- Excluded numbers are properly handled across all models
- Main and supplementary numbers are tracked separately where applicable

## Best Practices

1. **Train models periodically:** As new draws are added, retrain to keep predictions current
2. **Use consensus panel:** When models agree, predictions are more reliable
3. **Consider multiple metrics:** Don't rely on a single model - compare across methods
4. **Adjust churn threshold:** Default is 15 draws, but can be tuned based on your analysis needs
5. **Check model metrics:** If accuracy is low (<60%), model may need more data or different features

## Technical Notes

- All models run in-browser (no server required)
- Training is performed client-side using vanilla JavaScript/TypeScript
- For production use with large datasets, consider:
  - Web Workers for training (avoid UI blocking)
  - IndexedDB for caching trained models
  - Pyodide integration for full Python lifelines/scikit-learn support

## Future Enhancements

Potential improvements:
- Random Forest models (via TensorFlow.js or ml.js)
- Neural network approaches for sequence prediction
- Full Pyodide integration for lifelines/scikit-learn
- Cross-validation and hyperparameter tuning UI
- Export/import trained models
- Rolling evaluation over time
- Zone-aware predictions (integrate with ZPA groups)

# Zone Pattern Analysis (ZPA) & Zone Weighting

This document describes the Zone Pattern Analysis panel and zone weighting utilities implemented for the Windfall app.

## Overview

The ZPA feature divides lottery numbers (1-45) into 9 zones and analyzes patterns and trends over time. This information can be used to weight numbers for candidate generation and other downstream applications.

## Zone Definition

Numbers 1-45 are divided into 9 equal zones:

- **Zone 1**: 1-5
- **Zone 2**: 6-10
- **Zone 3**: 11-15
- **Zone 4**: 16-20
- **Zone 5**: 21-25
- **Zone 6**: 26-30
- **Zone 7**: 31-35
- **Zone 8**: 36-40
- **Zone 9**: 41-45

## Components

### GroupPatternPanel

The main UI component that displays zone pattern analysis.

**Features:**

1. **Top Patterns Table**
   - Shows the most frequent zone patterns
   - **Count Column**: Number of draws where that exact 9-zone pattern occurred (with tooltip explaining percentage)
   - **R² Column**: Coefficient of determination showing trend fit quality (0-1, with descriptive tooltips)
   - **p-value Column**: Statistical significance of trends (with interpretation tooltips)
   - **Trend Column**: Direction arrows with adaptive logic:
     - If p-value < 0.1: Use slope sign (significant trends)
     - Otherwise: Use magnitude threshold `TH = max(0.01, 0.06 / sqrt(n))` where n = draws analyzed
     - ↑ = increasing, ↓ = decreasing, → = flat/stable
   - Larger arrow size (1.5rem) for better visibility

2. **Zone Membership Heatmap**
   - Visual grid showing all 9 zones
   - Color-coded by trend direction:
     - Green (↑): Trending up
     - Red (↓): Trending down
     - Gray (→): Flat/stable
   - Opacity indicates significance (more opaque = more significant)

3. **Dynamic Explanatory Text**
   - Shows number of draws analyzed
   - Lists zones trending up/down
   - Displays sum(mains) slope and p-value

**Usage:**

```tsx
import { GroupPatternPanel } from './components/GroupPatternPanel';

<GroupPatternPanel 
  draws={filteredHistory} 
  maxPatterns={15} 
/>
```

## Utilities

### Zone Analysis (`src/lib/zoneAnalysis.ts`)

Core utilities for analyzing zone patterns and trends:

```typescript
import {
  getZoneIndex,        // Get zone index (0-8) for a number
  getZoneLabel,        // Get zone label (e.g., "Zone 1 (1-5)")
  drawToZonePattern,   // Convert draw to boolean array of zones hit
  zonePatternToKey,    // Convert pattern to string key
  countZonePatterns,   // Count pattern occurrences
  analyzeZoneTrends,   // Analyze per-zone trends with linear regression
  linearRegression,    // Perform linear regression
  calculateSumMainsTrend, // Aggregate trend across all zones
} from './lib/zoneAnalysis';
```

**Example:**

```typescript
const trends = analyzeZoneTrends(draws, {
  significanceThreshold: 0.1,     // p-value threshold
  minMagnitudeThreshold: 0.01,    // Minimum slope magnitude
  dynamicFactor: 0.06,            // Factor for adaptive threshold
});

trends.forEach(trend => {
  console.log(`Zone ${trend.zoneIdx + 1}: ${trend.direction}, 
    slope=${trend.slope.toFixed(4)}, 
    p=${trend.pValue.toFixed(3)}`);
});
```

### Zone Weighting (`src/lib/zoneWeighting.ts`)

Utilities for converting zone trends to weights for downstream use:

```typescript
import {
  suggestZoneWeightsFromTrends,  // Convert trends to zone weights
  mapZoneWeightsToNumbers,        // Map zone weights to number weights
  getNumberWeightsFromTrends,     // Direct trend→number weights
  normalizeWeights,               // Normalize weights to sum
  weightsToArray,                 // Convert to array format
} from './lib/zoneWeighting';
```

**Example:**

```typescript
// Get per-number weights from zone trends
const numberWeights = getNumberWeightsFromTrends(trends, {
  baseWeight: 1.0,              // Base weight for all zones
  trendScale: 0.5,              // How much to scale by trend
  minWeight: 0.1,               // Minimum allowed weight
  maxWeight: 2.0,               // Maximum allowed weight
  significanceThreshold: 0.05,  // Only weight significant trends
});

// Use weights for TTP, candidate generation, etc.
console.log(`Weight for number 1: ${numberWeights[1]}`);
console.log(`Weight for number 45: ${numberWeights[45]}`);

// Export as array for other systems
const weightsArray = weightsToArray(numberWeights);
console.log(`Weights array length: ${weightsArray.length}`); // 45
```

### Public API (`src/lib/zoneIndex.ts`)

Convenient re-exports of all zone-related utilities:

```typescript
import {
  // Analysis
  analyzeZoneTrends,
  getZoneIndex,
  getZoneLabel,
  // Weighting
  suggestZoneWeightsFromTrends,
  getNumberWeightsFromTrends,
} from './lib/zoneIndex';
```

## Adaptive Direction Logic

The trend direction arrows use an adaptive approach:

1. **If trend is statistically significant** (p < 0.1):
   - Use the **slope sign** to determine direction
   - Any positive slope → ↑
   - Any negative slope → ↓
   - Zero slope → →

2. **If trend is not significant**:
   - Use a **dynamic magnitude threshold**: `TH = max(0.01, 0.06 / sqrt(n))`
   - Only show directional arrow if `|slope| >= TH`
   - This threshold adapts to sample size:
     - Small n (e.g., 50 draws): TH ≈ 0.0085
     - Large n (e.g., 500 draws): TH ≈ 0.0027

This approach balances statistical rigor with practical interpretability.

## Statistical Methods

### Linear Regression

The implementation includes:
- Least squares linear regression
- R² (coefficient of determination)
- p-value calculation using t-distribution
- Approximations for t-CDF, normal CDF, incomplete beta function

### Trend Aggregation

The "sum(mains)" trend combines individual zone trends using:
- Averaged slopes and R² values
- Fisher's method for combining p-values
- Chi-squared distribution approximation

## Testing

All utilities have comprehensive test coverage:

```bash
# Run zone analysis tests
npx tsx src/lib/zoneAnalysis.test.ts

# Run zone weighting tests
npx tsx src/lib/zoneWeighting.test.ts
```

Test coverage includes:
- Zone index calculation
- Pattern conversion and counting
- Linear regression accuracy
- Trend analysis with various scenarios
- Weight calculation with bounds
- Weight normalization
- Array conversions

## Integration with Existing Features

The zone weighting system is designed to integrate with:

1. **TTP (Temperature Transition Predictions)**
   - Use `getNumberWeightsFromTrends()` to nudge probabilities
   - Apply weights as multipliers to transition probabilities

2. **Candidate Generation**
   - Pass weights to `generateCandidates()` or similar functions
   - Bias selection toward trending zones

3. **GPWF (Global Pattern Weight Factor)**
   - Combine zone weights with existing pattern weights
   - Create hybrid weighting schemes

## Future Enhancements

Potential improvements:
- Zone definitions configurable (currently fixed 9 zones)
- Moving window analysis (trends over recent N draws)
- Multiple timescales (short-term vs long-term trends)
- Zone correlation analysis
- Pattern prediction (which patterns likely to appear next)
- Export functionality (CSV, JSON)

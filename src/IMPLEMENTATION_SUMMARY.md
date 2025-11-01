# Zone Pattern Analysis (ZPA) - Implementation Summary

## Overview

This implementation adds a comprehensive Zone Pattern Analysis (ZPA) system to the Windfall app, including:

1. **GroupPatternPanel Component** - A UI panel displaying zone pattern analysis
2. **Zone Analysis Utilities** - Functions for analyzing zone patterns and trends
3. **Zone Weighting Utilities** - Functions for converting trends to per-number weights

## Visual Preview

![ZPA Panel Mockup](https://github.com/user-attachments/assets/ee07f5bb-72e7-43f6-80da-416a3b594bf8)

The panel displays:
- Top zone patterns with statistical measures (Count, R², p-value)
- Adaptive trend arrows (↑↓→) based on significance and magnitude
- Zone membership heatmap with color-coded trends
- Dynamic explanatory text

## Key Files Added

### Components
- `src/components/GroupPatternPanel.tsx` - Main UI component

### Libraries
- `src/lib/zoneAnalysis.ts` - Zone pattern and trend analysis utilities
- `src/lib/zoneWeighting.ts` - Zone-to-number weight mapping
- `src/lib/zoneIndex.ts` - Public API exports

### Tests
- `src/lib/zoneAnalysis.test.ts` - Tests for zone analysis (all passing)
- `src/lib/zoneWeighting.test.ts` - Tests for weighting (all passing)

### Documentation
- `docs/ZPA.md` - Comprehensive documentation
- `src/lib/ZPA_README.md` - Quick reference guide
- `src/lib/zoneDemo.ts` - Demonstration script
- `docs/ZPA_UI_Mockup.html` - Interactive UI mockup

## Features Implemented

### 1. Zone Definition
Numbers 1-45 divided into 9 zones:
- Zone 1: 1-5, Zone 2: 6-10, Zone 3: 11-15
- Zone 4: 16-20, Zone 5: 21-25, Zone 6: 26-30
- Zone 7: 31-35, Zone 8: 36-40, Zone 9: 41-45

### 2. GroupPatternPanel Features

#### Top Patterns Table
- **Count Column**: Shows number of draws with exact pattern
  - Tooltips explain percentage of total draws
- **R² Column**: Coefficient of determination (0-1)
  - Tooltips describe fit quality (Strong/Moderate/Weak)
- **p-value Column**: Statistical significance
  - Tooltips indicate significance level (Highly/Marginally/Not significant)
- **Trend Column**: Direction arrows with adaptive logic
  - **If p < 0.1**: Use slope sign (significant trends)
  - **Otherwise**: Use magnitude threshold `max(0.01, 0.06/√n)`
  - Larger arrows (1.5rem) for visibility
  - Color-coded: Green (↑), Red (↓), Gray (→)

#### Zone Membership Heatmap
- 9-zone grid visualization
- Color-coded by trend direction
- Opacity indicates significance
- Interactive tooltips with slope, p-value, direction

#### Dynamic Explanatory Text
- Number of draws analyzed
- Zones trending up/down
- Sum(mains) aggregate slope and p-value

### 3. Zone Analysis Utilities

```typescript
// Analyze zone trends
const trends = analyzeZoneTrends(draws, {
  significanceThreshold: 0.1,
  minMagnitudeThreshold: 0.01,
  dynamicFactor: 0.06,
});

// Each trend includes:
// - slope, intercept, rSquared, pValue
// - direction: 'up' | 'down' | 'flat'
```

### 4. Zone Weighting Utilities

```typescript
// Convert trends to per-number weights
const weights = getNumberWeightsFromTrends(trends, {
  baseWeight: 1.0,
  trendScale: 0.5,
  minWeight: 0.1,
  maxWeight: 2.0,
  significanceThreshold: 0.05,
});

// Returns Record<number, number> for numbers 1-45
```

### 5. Statistical Methods

- **Linear Regression**: Least squares with R² and p-value
- **Trend Analysis**: Per-zone frequency trends over time
- **Adaptive Direction Logic**: Significance-based or magnitude-based
- **Trend Aggregation**: Fisher's method for combining p-values

## Usage Examples

### In the App
```typescript
import { GroupPatternPanel } from './components/GroupPatternPanel';

<GroupPatternPanel draws={filteredHistory} maxPatterns={15} />
```

### For Weighting
```typescript
import { analyzeZoneTrends, getNumberWeightsFromTrends } from './lib/zoneIndex';

const trends = analyzeZoneTrends(draws);
const weights = getNumberWeightsFromTrends(trends);

// Use weights in TTP, candidate generation, etc.
```

## Testing

All utilities have comprehensive test coverage:

```bash
# Run tests
npx tsx src/lib/zoneAnalysis.test.ts
npx tsx src/lib/zoneWeighting.test.ts

# Run demo
npx tsx src/lib/zoneDemo.ts
```

**Test Results**: ✅ All tests passing

## Integration Points

The zone weighting system is designed to integrate with:

1. **TTP (Temperature Transition Predictions)**
   - Multiply transition probabilities by zone weights
   - Nudge predictions toward trending zones

2. **Candidate Generation**
   - Use weights in weighted random sampling
   - Bias selection toward favorable zones

3. **GPWF (Global Pattern Weight Factor)**
   - Combine zone weights with existing pattern weights
   - Create hybrid weighting schemes

## TypeScript Compilation

✅ All code compiles without errors: `npx tsc --noEmit`

## Code Quality

- Fully typed with TypeScript
- Comprehensive inline documentation
- Consistent with existing codebase patterns
- Follows React best practices
- Uses useMemo for performance optimization

## Performance Considerations

- Memoized computations prevent unnecessary recalculations
- Efficient pattern counting with Map data structures
- O(n) linear regression algorithms
- Minimal re-renders with React.useMemo

## Future Enhancements

Potential improvements:
- Configurable zone definitions (currently fixed 9 zones)
- Moving window analysis for time-based trends
- Multiple timescales (short-term vs long-term)
- Zone correlation analysis
- Pattern prediction capabilities
- Export functionality (CSV, JSON)

## Documentation

Complete documentation available in:
- **Full Guide**: `docs/ZPA.md`
- **Quick Reference**: `src/lib/ZPA_README.md`
- **Interactive Demo**: `src/lib/zoneDemo.ts`
- **UI Mockup**: `docs/ZPA_UI_Mockup.html`

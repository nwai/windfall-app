# Zone Pattern Analysis (ZPA) Quick Reference

## Quick Start

```typescript
import { analyzeZoneTrends, getNumberWeightsFromTrends } from './lib/zoneIndex';

// Analyze zone trends from historical draws
const trends = analyzeZoneTrends(draws);

// Convert trends to per-number weights
const weights = getNumberWeightsFromTrends(trends, {
  trendScale: 0.5,              // How aggressively to weight trends
  significanceThreshold: 0.1,   // Only weight significant trends
});

// Use weights in your application
console.log(`Weight for number 1: ${weights[1]}`);
```

## Run Demo

```bash
npx tsx src/lib/zoneDemo.ts
```

## Run Tests

```bash
npx tsx src/lib/zoneAnalysis.test.ts
npx tsx src/lib/zoneWeighting.test.ts
```

## Zone Definitions

- **Zone 1**: 1-5
- **Zone 2**: 6-10
- **Zone 3**: 11-15
- **Zone 4**: 16-20
- **Zone 5**: 21-25
- **Zone 6**: 26-30
- **Zone 7**: 31-35
- **Zone 8**: 36-40
- **Zone 9**: 41-45

## Key Features

### GroupPatternPanel Component
- Top zone patterns with counts and statistics
- R² and p-value columns with tooltips
- Adaptive direction arrows (↑↓→)
- Zone membership heatmap
- Dynamic explanatory text

### Zone Weighting Utilities
- `suggestZoneWeightsFromTrends()` - Convert trends to zone weights
- `mapZoneWeightsToNumbers()` - Map zone weights to numbers
- `getNumberWeightsFromTrends()` - Direct conversion
- `normalizeWeights()` - Normalize to target sum
- `weightsToArray()` - Export as array

## Documentation

See [docs/ZPA.md](../docs/ZPA.md) for complete documentation.

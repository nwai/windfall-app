import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

describe("panel title hierarchy", () => {
  it("keeps CollapsibleSection titles as the visible panel title source", () => {
    const visualDuplicatePatterns: Array<[string, RegExp]> = [
      ["src/components/candidates/PortfolioCompressionPanel.tsx", />Portfolio Compression \/ 12-Game Distiller</],
      ["src/components/candidates/PasteWeightedCandidatesPanel.tsx", />Paste-Weighted Candidate Generator</],
      ["src/components/OddEvenRatioCadencePanel.tsx", />Odd\/Even Ratio Cadence</],
      ["src/components/candidates/GeneratedCandidatesPanel.tsx", />\s*Generated Candidates\s*</],
      ["src/components/BatesPanel.tsx", />Bates Weighting Panel</],
      ["src/components/UserSelectedNumbersPanel.tsx", /<h3[^>]*>\{title\}<\/h3>/],
      ["src/components/SelectionInsightsPanel.tsx", />Selection Insights</],
      ["src/components/candidates/PatternStatsPanel.tsx", />Pattern Stats</],
      ["src/components/candidates/TargetSetQuickStatsPanel.tsx", />\s*Target Set Quick Stats\s*</],
      ["src/components/MostLikelyNotDrawnPanel.tsx", /<h3[^>]*>\{title\}<\/h3>/],
      ["src/components/GroupPatternPanel.tsx", /<h3[^>]*>\{title\}<\/h3>/],
      ["src/components/ParameterSearchPanel.tsx", />Parameter Search Helper</],
      ["src/components/WeightedTargetListPanel.tsx", />Weighted Targets</],
      ["src/components/SurvivalAnalyzer.tsx", />Survival Analysis</],
      ["src/components/TemperatureTransitionPanel.tsx", />Temperature Transition Diagnostics</],
      ["src/components/candidates/MonteCarloPanel.tsx", />Monte Carlo Simulation</],
      ["src/components/HotColdRankingPanel.tsx", />Hot vs Cold Ranking</],
      ["src/components/WindowStatsPanel.tsx", />Window Stats \(Low\/High \+ Odd\/Even \+ Sum\)</],
      ["src/components/MonthlyDrawsSummaryPanel.tsx", />Monthly Draws Summary</],
      ["src/components/MonthEndCarryOverBucketsPanel.tsx", />Month-End Carry-Over Buckets</],
      ["src/components/MonthlyOverlapPanel.tsx", />Monthly Numbers Overlap</],
      ["src/components/MonthlyFirstLastPanel.tsx", />Monthly First ↔ Last Draw Hits</],
      ["src/components/MonthlyDigitOccurrencePanel.tsx", />Monthly 1-Digit vs 2-Digit Occurrences</],
      ["src/components/AdjacentCombosPanel.tsx", />\{title\}</],
      ["src/components/NextDrawProbabilitiesPanel.tsx", /<h4[^>]*>\{title\}<\/h4>/],
      ["src/components/DrawBucketPatternPanel.tsx", />Draw Bucket Pattern Explorer</],
      ["src/components/NextHotBlocksPanel.tsx", />\s*Next Hot Blocks\s*</],
    ];

    for (const [path, pattern] of visualDuplicatePatterns) {
      expect(source(path), path).not.toMatch(pattern);
    }
  });
});

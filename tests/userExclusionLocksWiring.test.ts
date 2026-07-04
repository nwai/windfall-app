import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP_SOURCE = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");

describe("app-wide user exclusion lock wiring", () => {
  it("passes WFMQYH user exclusions into selectable number surfaces", () => {
    expect(APP_SOURCE).toContain("removeUserExcludedNumbers");
    expect(APP_SOURCE).toContain("formatUserExclusionReminder");
    expect(APP_SOURCE).toContain("<NumberTrendsTable");
    expect(APP_SOURCE).toContain("excludedNumbers={excludedNumbers}");
    expect(APP_SOURCE).toContain("<DroughtHazardPanel");
    expect(APP_SOURCE).toContain("<MonthlyDrawsSummaryPanel");
    expect(APP_SOURCE).toContain("<MonthEndCarryOverBucketsPanel");
    expect(APP_SOURCE).toContain("<HotColdRankingPanel");
    expect(APP_SOURCE).toContain("lockedExcludedNumbers={excludedNumbers}");
    expect(APP_SOURCE).toContain("<UserSelectedNumbersPanel");
    expect(APP_SOURCE).toContain("<GeneratedCandidatesPanel");
    expect(APP_SOURCE).toContain("<DGASimulateStrip");
  });

  it("prunes user-excluded numbers from conflicting forced inclusion and simulation lists", () => {
    const pruneTargets = [
      "setTrendSelectedNumbers((current) => removeUserExcludedNumbers(current, excludedNumbers));",
      "setPreviousNeighbourConstraintNumbers((current) => removeUserExcludedNumbers(current, excludedNumbers));",
      "setHotColdForcedNumbers((current) => removeUserExcludedNumbers(current, excludedNumbers));",
      "setDroughtBreakSelectedNumbers((current) => removeUserExcludedNumbers(current, excludedNumbers).slice(0, MAX_DROUGHT_BREAK_FORCED_NUMBERS));",
      "setUserSelectedNumbers((current) => removeUserExcludedNumbers(current, excludedNumbers));",
      "setManualSimSelected((current) => removeUserExcludedNumbers(current, excludedNumbers).slice(0, 8));",
      "setSelectedCarryOverBoostNumbers((current) => removeUserExcludedNumbers(current, excludedNumbers));",
    ];

    pruneTargets.forEach((expectedSource) => {
      expect(APP_SOURCE).toContain(expectedSource);
    });
    expect(APP_SOURCE).toContain("() => removeUserExcludedNumbers(normalizeDgaSelectedNumbers(userSelectedNumbers), excludedNumbers)");
  });

  it("builds the global number conflict ledger and passes it into Next Hot Blocks", () => {
    expect(APP_SOURCE).toContain("buildNumberConflictLedger");
    expect(APP_SOURCE).toContain("const numberConflictLedger = useMemo");
    expect(APP_SOURCE).toContain("numberConflictLedger={numberConflictLedger}");
  });
});

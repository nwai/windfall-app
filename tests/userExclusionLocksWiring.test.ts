import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP_SOURCE = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");

describe("app-wide user exclusion lock wiring", () => {
  it("passes active hard exclusions into selectable number surfaces", () => {
    expect(APP_SOURCE).toContain("removeUserExcludedNumbers");
    expect(APP_SOURCE).toContain("formatUserExclusionReminder");
    expect(APP_SOURCE).toContain("const selectionUnavailableNumbers = allExclusions");
    expect(APP_SOURCE).toContain("<NumberTrendsTable");
    expect(APP_SOURCE).toContain("excludedNumbers={selectionUnavailableNumbers}");
    expect(APP_SOURCE).toContain("<DroughtHazardPanel");
    expect(APP_SOURCE).toContain("<MonthlyDrawsSummaryPanel");
    expect(APP_SOURCE).toContain("<MonthEndCarryOverBucketsPanel");
    expect(APP_SOURCE).toContain("<HotColdRankingPanel");
    expect(APP_SOURCE).toContain("lockedExcludedNumbers={selectionUnavailableNumbers}");
    expect(APP_SOURCE).toContain("<UserSelectedNumbersPanel");
    expect(APP_SOURCE).toContain("<GeneratedCandidatesPanel");
    expect(APP_SOURCE).toContain("<DGASimulateStrip");
  });

  it("locks rule-only active exclusions in the WFMQYH user exclusions strip", () => {
    const wfmqyhStripStart = APP_SOURCE.indexOf("{/* User Exclusions */}");
    const wfmqyhStripEnd = APP_SOURCE.indexOf("{(knobs.enableSDE1 || knobs.enableHC3)", wfmqyhStripStart);
    const wfmqyhStripSource = APP_SOURCE.slice(wfmqyhStripStart, wfmqyhStripEnd);

    expect(wfmqyhStripStart).toBeGreaterThanOrEqual(0);
    expect(wfmqyhStripEnd).toBeGreaterThan(wfmqyhStripStart);
    expect(wfmqyhStripSource).toContain("const isLockedByActiveRule = selectionUnavailableSet.has(n) && !isManualExcluded;");
    expect(wfmqyhStripSource).toContain("const checked = selectionUnavailableSet.has(n);");
    expect(wfmqyhStripSource).toContain("disabled={isLockedByActiveRule}");
    expect(wfmqyhStripSource).toContain("Exclude ${n} (locked by active exclusion rule)");
    expect(wfmqyhStripSource).toContain("if (isLockedByActiveRule) return;");
    expect(wfmqyhStripSource).toContain("Excluded by active SDE1");
    expect(wfmqyhStripSource).toContain("Excluded by active HC3");
    expect(wfmqyhStripSource).toContain("Excluded from Hot/Cold row selection");
  });

  it("prunes active hard exclusions from conflicting forced inclusion and simulation lists", () => {
    const pruneTargets = [
      "setTrendSelectedNumbers((current) => pruneSelectionUnavailableNumbers(current));",
      "setPreviousNeighbourConstraintNumbers((current) => pruneSelectionUnavailableNumbers(current));",
      "setHotColdForcedNumbers((current) => pruneSelectionUnavailableNumbers(current));",
      "setDroughtBreakSelectedNumbers((current) => pruneSelectionUnavailableNumbers(current, MAX_DROUGHT_BREAK_FORCED_NUMBERS));",
      "setUserSelectedNumbers((current) => pruneSelectionUnavailableNumbers(current));",
      "setManualSimSelected((current) => pruneSelectionUnavailableNumbers(current, 8));",
      "setSelectedCarryOverBoostNumbers((current) => pruneSelectionUnavailableNumbers(current));",
    ];

    expect(APP_SOURCE).toContain("const pruneSelectionUnavailableNumbers = useCallback");
    pruneTargets.forEach((expectedSource) => {
      expect(APP_SOURCE).toContain(expectedSource);
    });
    expect(APP_SOURCE).toContain("() => removeUserExcludedNumbers(normalizeDgaSelectedNumbers(userSelectedNumbers), selectionUnavailableNumbers)");
  });

  it("builds the global number conflict ledger and passes it into Next Hot Blocks", () => {
    expect(APP_SOURCE).toContain("buildNumberConflictLedger");
    expect(APP_SOURCE).toContain("const numberConflictLedger = useMemo");
    expect(APP_SOURCE).toContain("numberConflictLedger={numberConflictLedger}");
  });
});

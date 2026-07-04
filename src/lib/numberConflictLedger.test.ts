import { describe, expect, it } from "vitest";

import {
  buildNumberConflictLedger,
  summarizeNumberRangeConflicts,
} from "./numberConflictLedger";

describe("numberConflictLedger", () => {
  it("groups source labels by number and flags hard include/exclude conflicts", () => {
    const ledger = buildNumberConflictLedger([
      { kind: "hardInclude", label: "Drought-break shortlist", numbers: [7, 7, 99] },
      { kind: "hardExclude", label: "User Exclusions", numbers: [7, 8] },
      { kind: "softInclude", label: "User selected boost", numbers: [8] },
      { kind: "simulation", label: "DGA simulation strip", numbers: [12] },
    ]);

    expect(ledger.byNumber[7]).toMatchObject({
      number: 7,
      hardIncludeSources: ["Drought-break shortlist"],
      hardExcludeSources: ["User Exclusions"],
      hasHardConflict: true,
    });
    expect(ledger.byNumber[8]).toMatchObject({
      number: 8,
      hardExcludeSources: ["User Exclusions"],
      softIncludeSources: ["User selected boost"],
      hasSoftConflict: true,
    });
    expect(ledger.byNumber[12]).toMatchObject({
      number: 12,
      simulationSources: ["DGA simulation strip"],
      hasHardConflict: false,
    });
    expect(ledger.conflicts).toEqual([
      expect.objectContaining({
        number: 7,
        severity: "error",
        message: expect.stringContaining("Drought-break shortlist"),
      }),
      expect.objectContaining({
        number: 8,
        severity: "warning",
        message: expect.stringContaining("User selected boost"),
      }),
    ]);
  });

  it("summarizes block-level conflicts so block exclusions can be blocked safely", () => {
    const ledger = buildNumberConflictLedger([
      { kind: "hardInclude", label: "Latest ±1/±2", numbers: [7] },
      { kind: "hardExclude", label: "User Exclusions", numbers: [8] },
      { kind: "softInclude", label: "Carry-over boost", numbers: [9] },
    ]);

    const summary = summarizeNumberRangeConflicts(ledger, {
      start: 6,
      end: 10,
      label: "6-10",
    });

    expect(summary.hardIncludedNumbers).toEqual([7]);
    expect(summary.hardExcludedNumbers).toEqual([8]);
    expect(summary.softIncludedNumbers).toEqual([9]);
    expect(summary.canApplyHardExclude).toBe(false);
    expect(summary.blockingReason).toContain("Latest ±1/±2");
  });
});

import { describe, expect, it } from "vitest";

import type { CandidateSet, Draw } from "../types";
import {
  parseSettingsReplayTarget,
  runSettingsSensitivityReplay,
  scoreSettingsReplaySelection,
} from "./settingsSensitivityReplay";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({
  date,
  main,
  supp,
});

describe("settingsSensitivityReplay", () => {
  it("requires exactly eight unique 1-45 target numbers", () => {
    const valid = parseSettingsReplayTarget("4, 42, 28, 14, 43, 25, 44, 26");
    expect(valid.valid).toBe(true);
    expect(valid.main).toEqual([4, 42, 28, 14, 43, 25]);
    expect(valid.supp).toEqual([44, 26]);

    const invalid = parseSettingsReplayTarget("4, 42, 28, 14, 43, 25, 44, 26, 27");
    expect(invalid.valid).toBe(false);
    expect(invalid.warnings.join(" ")).toContain("exactly 8 unique target numbers");
  });

  it("scores current candidate rows with the shared Weekday Windfall prize ladder", () => {
    const target = parseSettingsReplayTarget("4, 42, 28, 14, 43, 25, 44, 26");
    const row = scoreSettingsReplaySelection({
      source: "generated",
      label: "Generated #1",
      selection: [4, 42, 28, 14, 43, 1, 26, 2],
      target,
    });

    expect(row.totalHits).toBe(6);
    expect(row.mainHits).toBe(5);
    expect(row.suppHits).toBe(1);
    expect(row.division).toBe("Div2");
  });

  it("builds pre-registered profiles from real history and scores supplied current candidates", () => {
    const history = [
      draw("2026-01-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-03", [1, 2, 3, 9, 10, 11], [12, 13]),
      draw("2026-01-05", [1, 2, 14, 15, 16, 17], [18, 19]),
      draw("2026-01-08", [20, 21, 22, 23, 24, 25], [26, 27]),
      { ...draw("2026-01-10", [44, 45, 43, 42, 41, 40], [39, 38]), isSimulated: true },
    ];
    const generatedCandidates: CandidateSet[] = [{
      main: [4, 42, 28, 14, 43, 25],
      supp: [44, 26],
    }];

    const result = runSettingsSensitivityReplay({
      targetInput: "4,42,28,14,43,25,44,26",
      history,
      activeHistory: history.slice(0, 4),
      generatedCandidates,
    });

    expect(result.target.valid).toBe(true);
    expect(result.profileRows.length).toBeGreaterThan(0);
    expect(result.candidateRows).toHaveLength(1);
    expect(result.bestCandidate?.division).toBe("Div1");
    expect(result.warnings.join(" ")).toContain("Ignored 1 simulated fallback draw row");
    expect(result.methodology.join(" ")).toContain("Retrospective replay only");
  });
});

import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { summarizeDrawHistoryProvenance } from "./drawHistoryProvenance";

const draw = (date: string, isSimulated = false): Draw => ({
  date,
  main: [1, 2, 3, 4, 5, 6],
  supp: [7, 8],
  isSimulated,
});

describe("summarizeDrawHistoryProvenance", () => {
  it("labels an empty history as not analysis-ready", () => {
    const summary = summarizeDrawHistoryProvenance([]);

    expect(summary.status).toBe("empty");
    expect(summary.analysisReady).toBe(false);
    expect(summary.headline).toContain("No draw history loaded");
  });

  it("reports real-only history as verified enough for analysis", () => {
    const summary = summarizeDrawHistoryProvenance([
      draw("2026-01-01"),
      draw("2026-01-03"),
    ]);

    expect(summary.status).toBe("real");
    expect(summary.analysisReady).toBe(true);
    expect(summary.realDraws).toBe(2);
    expect(summary.simulatedDraws).toBe(0);
    expect(summary.latestRealDate).toBe("2026-01-03");
  });

  it("warns when simulated fallback rows are mixed into loaded history", () => {
    const summary = summarizeDrawHistoryProvenance([
      draw("2026-01-01"),
      draw("2026-01-03", true),
    ]);

    expect(summary.status).toBe("mixed");
    expect(summary.analysisReady).toBe(false);
    expect(summary.warning).toContain("simulated fallback");
    expect(summary.detail).toContain("1 real");
    expect(summary.detail).toContain("1 simulated");
  });

  it("blocks simulated-only history from being described as real evidence", () => {
    const summary = summarizeDrawHistoryProvenance([
      draw("2026-01-01", true),
      draw("2026-01-03", true),
    ]);

    expect(summary.status).toBe("simulated-only");
    expect(summary.analysisReady).toBe(false);
    expect(summary.realDraws).toBe(0);
    expect(summary.warning).toContain("demo fallback");
  });
});

import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  backtestTemperatureTransitionsThreshold,
  backtestTemperatureTransitionsTopK,
} from "./backtestTemperatureTransitions";

const draw = (date: string, main: number[], supp: number[] = [], isSimulated = false): Draw => ({
  date,
  main,
  supp,
  isSimulated,
});

describe("temperature transition backtests", () => {
  it("ignores simulated fallback rows so they cannot create false out-of-sample windows", () => {
    const history = [
      draw("2026-01-01", [1, 2, 3, 4, 5, 6]),
      draw("2026-01-08", [7, 8, 9, 10, 11, 12]),
      draw("2026-01-15", [13, 14, 15, 16, 17, 18]),
      draw("2026-01-22", [19, 20, 21, 22, 23, 24]),
      draw("2026-01-29", [45, 44, 43, 42, 41, 40], [], true),
    ];

    const thresholdSummary = backtestTemperatureTransitionsThreshold(history, 3, 0.2);
    const topKSummary = backtestTemperatureTransitionsTopK(history, 3, 8);

    expect(thresholdSummary.windows).toHaveLength(1);
    expect(topKSummary.windows).toHaveLength(1);
    expect(thresholdSummary.warnings).toContain("Ignored 1 simulated fallback draw row; temperature-transition backtests use real historical draws only.");
    expect(topKSummary.warnings).toContain("Ignored 1 simulated fallback draw row; temperature-transition backtests use real historical draws only.");
  });
});

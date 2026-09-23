import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import { buildTemperatureVolcanicPrecursorAdvisor } from "./temperatureVolcanicPrecursors";

const draw = (date: string, numbers: number[]): Draw => ({
  date,
  main: numbers.slice(0, 6),
  supp: numbers.slice(6, 8),
});

const filler = (date: string): Draw => draw(date, [2, 3, 4, 5, 6, 7, 8, 9]);

describe("temperature volcanic precursor advisor", () => {
  it("counts the immediate prior temperature before a number becomes volcanic", () => {
    const history = [
      draw("2026-01-01", [1, 2, 3, 4, 5, 6, 7, 8]),
      filler("2026-01-02"),
      filler("2026-01-03"),
      draw("2026-01-04", [1, 10, 11, 12, 13, 14, 15, 16]),
    ];

    const advisor = buildTemperatureVolcanicPrecursorAdvisor({
      history,
      scopeLabel: "Test scope",
      selectedNumbers: [1],
    });
    const recency = advisor.metricResults.find((result) => result.metric === "recency");
    const hot = recency?.rows.find((row) => row.label === "hot");

    expect(recency?.totalHits).toBe(24);
    expect(hot?.hits).toBeGreaterThanOrEqual(1);
    expect(hot?.hitRate).toBeGreaterThan(0);
    expect(advisor.selectedReads[0].metrics.find((metric) => metric.metric === "recency")?.currentLabel).toBe("volcanic");
  });

  it("reports all three metric families side by side", () => {
    const history = [
      draw("2026-01-01", [1, 2, 3, 4, 5, 6, 7, 8]),
      filler("2026-01-02"),
      filler("2026-01-03"),
      draw("2026-01-04", [1, 10, 11, 12, 13, 14, 15, 16]),
      filler("2026-01-05"),
    ];

    const advisor = buildTemperatureVolcanicPrecursorAdvisor({
      history,
      scopeLabel: "Test scope",
      selectedNumbers: [1, 17],
    });

    expect(advisor.metricResults.map((result) => result.metric)).toEqual(["recency", "ema", "hybrid"]);
    expect(advisor.metricResults.every((result) => result.rows.length === 10)).toBe(true);
    expect(advisor.selectedReads).toHaveLength(2);
    expect(advisor.selectedReads[0].metrics).toHaveLength(3);
  });

  it("ignores simulated rows and warns when it does so", () => {
    const history = [
      draw("2026-01-01", [1, 2, 3, 4, 5, 6, 7, 8]),
      { ...filler("2026-01-02"), isSimulated: true },
      filler("2026-01-03"),
      draw("2026-01-04", [1, 10, 11, 12, 13, 14, 15, 16]),
    ];

    const advisor = buildTemperatureVolcanicPrecursorAdvisor({
      history,
      scopeLabel: "Real only",
    });

    expect(advisor.drawCount).toBe(3);
    expect(advisor.warnings.join(" ")).toContain("Ignored 1 simulated fallback draw row");
  });
});

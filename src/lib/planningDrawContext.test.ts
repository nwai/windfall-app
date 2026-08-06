import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { buildPlanningDrawContext } from "./planningDrawContext";

const draw = (date: string): Draw => ({
  date,
  main: [1, 2, 3, 4, 5, 6],
  supp: [7, 8],
});

describe("planningDrawContext", () => {
  it("resolves a completed July 2026 history to August D1 planning reset", () => {
    const history = [
      "2026-07-01",
      "2026-07-03",
      "2026-07-06",
      "2026-07-08",
      "2026-07-10",
      "2026-07-13",
      "2026-07-15",
      "2026-07-17",
      "2026-07-20",
      "2026-07-22",
      "2026-07-24",
      "2026-07-27",
      "2026-07-29",
      "2026-07-31",
    ].map(draw);

    const context = buildPlanningDrawContext(history, { now: "2026-08-01" });

    expect(context.latestRecordedDrawDate).toBe("2026-07-31");
    expect(context.latestRecordedMonthLabel).toBe("2026-07");
    expect(context.latestRecordedMonthDrawCount).toBe(14);
    expect(context.latestRecordedMonthExpectedDrawCount).toBe(14);
    expect(context.latestRecordedMonthIsComplete).toBe(true);
    expect(context.targetDrawDate).toBe("2026-08-03");
    expect(context.targetMonthLabel).toBe("2026-08");
    expect(context.targetDrawOrdinal).toBe(1);
    expect(context.targetMonthExpectedDrawCount).toBe(13);
    expect(context.completedDrawsInTargetMonth).toBe(0);
    expect(context.isPlanningReset).toBe(true);
    expect(context.isPlanningLastDraw).toBe(false);
  });

  it("advances after a completed 13-draw month without relying on the historical max month length", () => {
    const history = [
      "2025-10-01",
      "2025-10-03",
      "2025-10-06",
      "2025-10-08",
      "2025-10-10",
      "2025-10-13",
      "2025-10-15",
      "2025-10-17",
      "2025-10-20",
      "2025-10-22",
      "2025-10-24",
      "2025-10-27",
      "2025-10-29",
      "2025-10-31",
      "2026-06-01",
      "2026-06-03",
      "2026-06-05",
      "2026-06-08",
      "2026-06-10",
      "2026-06-12",
      "2026-06-15",
      "2026-06-17",
      "2026-06-19",
      "2026-06-22",
      "2026-06-24",
      "2026-06-26",
      "2026-06-29",
    ].map(draw);

    const context = buildPlanningDrawContext(history, { now: "2026-06-30" });

    expect(context.latestRecordedMonthLabel).toBe("2026-06");
    expect(context.latestRecordedMonthDrawCount).toBe(13);
    expect(context.latestRecordedMonthExpectedDrawCount).toBe(13);
    expect(context.targetDrawDate).toBe("2026-07-01");
    expect(context.targetMonthLabel).toBe("2026-07");
    expect(context.targetDrawOrdinal).toBe(1);
    expect(context.targetMonthExpectedDrawCount).toBe(14);
    expect(context.isPlanningReset).toBe(true);
    expect(context.isPlanningLastDraw).toBe(false);
  });
});

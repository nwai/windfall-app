import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  analyzeMonthlyDrawSummary,
  analyzeStageIdealDrawModel,
  analyzeStageMatchAcceptancePlaybook,
  computeIdealMonthlyDraw,
  createEmptyMonthlyBucketSets,
  MONTHLY_BUCKET_KEYS,
  projectMonthlyBucketCounts,
} from "./monthlyDrawSummary";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({
  date,
  main,
  supp,
});

const repeatDraws = (month: string, count: number, start = 1): Draw[] => (
  Array.from({ length: count }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    const base = ((start + index * 3 - 1) % 45) + 1;
    return draw(`${month}-${day}`, [
      base,
      ((base + 1 - 1) % 45) + 1,
      ((base + 2 - 1) % 45) + 1,
      ((base + 3 - 1) % 45) + 1,
      ((base + 4 - 1) % 45) + 1,
      ((base + 5 - 1) % 45) + 1,
    ], [
      ((base + 6 - 1) % 45) + 1,
      ((base + 7 - 1) % 45) + 1,
    ]);
  })
);

const weekdayDraws = (month: string, weekdays: number[], start = 1): Draw[] => {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  const draws: Draw[] = [];
  for (let day = 1; day <= 31; day++) {
    const date = new Date(year, monthIndex, day);
    if (date.getMonth() !== monthIndex) break;
    if (!weekdays.includes(date.getDay())) continue;
    const base = ((start + draws.length * 3 - 1) % 45) + 1;
    draws.push(draw(`${month}-${String(day).padStart(2, "0")}`, [
      base,
      ((base + 1 - 1) % 45) + 1,
      ((base + 2 - 1) % 45) + 1,
      ((base + 3 - 1) % 45) + 1,
      ((base + 4 - 1) % 45) + 1,
      ((base + 5 - 1) % 45) + 1,
    ], [
      ((base + 6 - 1) % 45) + 1,
      ((base + 7 - 1) % 45) + 1,
    ]));
  }
  return draws;
};

describe("analyzeMonthlyDrawSummary", () => {
  it("adds a synthetic planning row while keeping latestRow anchored to observed draw history", () => {
    const summary = analyzeMonthlyDrawSummary(
      [
        draw("2024-01-03", [1, 2, 3, 4, 5, 6], [7, 8]),
        draw("2024-02-07", [9, 10, 11, 12, 13, 14], [15, 16]),
      ],
      { today: new Date("2026-05-26T00:00:00Z") },
    );

    expect(summary.rows.map((row) => row.monthLabel)).toEqual(["2024-01", "2024-02", "2026-05"]);
    expect(summary.latestRow?.monthLabel).toBe("2024-02");
    expect(summary.rows.at(-1)).toMatchObject({
      monthLabel: "2026-05",
      drawCount: 0,
      totalDrawCount: 1,
    });
    expect(summary.effectiveMonthLabel).toBe("2026-05");
    expect(summary.effectiveMonthIsSynthetic).toBe(true);
    expect(summary.currentDistribution[0]).toBe(45);
    expect(summary.latestBucketSets.undrawn.size).toBe(37);
    expect([...summary.latestBucketSets.times1]).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
    expect(summary.latestBucketSets.undrawn.has(1)).toBe(true);
    expect(summary.latestBucketSets.undrawn.has(9)).toBe(false);
    expect(summary.idealDraw?.bucketCounts.find((bucket) => bucket.times === 0)?.count).toBe(8);
    expect(summary.quality.syntheticMonthCount).toBe(1);
  });

  it("rolls a completed latest month into a next-month planning row before the calendar month changes", () => {
    const summary = analyzeMonthlyDrawSummary([
      ...repeatDraws("2026-01", 13, 1),
      ...repeatDraws("2026-03", 13, 4),
      ...repeatDraws("2026-06", 13, 7),
    ], {
      today: new Date("2026-06-30T12:00:00"),
      averageDrawCountFilter: 13,
    });

    const planningRow = summary.rows.find((row) => row.monthLabel === "2026-07");
    expect(summary.latestRow?.monthLabel).toBe("2026-06");
    expect(summary.effectiveMonthLabel).toBe("2026-07");
    expect(summary.effectiveMonthDrawCount).toBe(0);
    expect(summary.effectiveMonthIsSynthetic).toBe(true);
    expect(planningRow).toMatchObject({
      monthLabel: "2026-07",
      drawCount: 0,
      totalDrawCount: 13,
      validNumberOccurrences: 0,
      expectedNumberSlots: 0,
    });
    expect(planningRow?.undrawn).toHaveLength(45);
    expect(planningRow?.distribution[0]).toBe(45);
    expect(summary.effectiveBucketSets.undrawn.size).toBe(45);
    expect(summary.effectiveBucketSets.times1.size).toBe(0);
    expect(summary.eligibleRows.map((row) => row.monthLabel)).toEqual(["2026-01", "2026-03", "2026-06"]);
    expect(summary.drawCountOptions).toEqual([13]);
    expect(summary.idealDraw?.bucketCounts.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(8);
  });

  it("uses the latest month's weekday rhythm instead of the historical max when deciding completion", () => {
    const mondayWednesdayFriday = [1, 3, 5];
    const summary = analyzeMonthlyDrawSummary([
      ...weekdayDraws("2025-10", mondayWednesdayFriday, 1),
      ...weekdayDraws("2026-01", mondayWednesdayFriday, 4),
      ...weekdayDraws("2026-03", mondayWednesdayFriday, 7),
      ...weekdayDraws("2026-06", mondayWednesdayFriday, 10),
    ], {
      today: new Date("2026-06-30T12:00:00"),
      averageDrawCountFilter: 13,
    });

    const juneRow = summary.rows.find((row) => row.monthLabel === "2026-06");
    const planningRow = summary.rows.find((row) => row.monthLabel === "2026-07");
    expect(summary.maxObservedDrawsPerMonth).toBe(14);
    expect(juneRow?.totalDrawCount).toBe(13);
    expect(summary.effectiveMonthLabel).toBe("2026-07");
    expect(summary.effectiveMonthIsSynthetic).toBe(true);
    expect(planningRow).toMatchObject({
      monthLabel: "2026-07",
      drawCount: 0,
      totalDrawCount: 14,
    });
    expect(summary.effectiveBucketSets.undrawn.size).toBe(45);
  });

  it("uses the latest observed month rhythm when older recent rows include extra weekdays", () => {
    const mondayWednesdayFriday = [1, 3, 5];
    const summary = analyzeMonthlyDrawSummary([
      ...weekdayDraws("2025-10", mondayWednesdayFriday, 1),
      ...weekdayDraws("2026-04", [0, 2], 4),
      ...weekdayDraws("2026-05", mondayWednesdayFriday, 7),
      ...weekdayDraws("2026-06", mondayWednesdayFriday, 10),
    ], {
      today: new Date("2026-06-30T12:00:00"),
    });

    expect(summary.maxObservedDrawsPerMonth).toBe(14);
    expect(summary.rows.find((row) => row.monthLabel === "2026-06")?.totalDrawCount).toBe(13);
    expect(summary.effectiveMonthLabel).toBe("2026-07");
    expect(summary.rows.find((row) => row.monthLabel === "2026-07")?.totalDrawCount).toBe(14);
  });

  it("deduplicates numbers within a draw and reports invalid input instead of overcounting", () => {
    const summary = analyzeMonthlyDrawSummary([
      draw("2024-03-01", [1, 1, 2, 46, 2, 3], [3, 4, Number.NaN]),
      draw("invalid-date", [5, 6, 7, 8, 9, 10], [11, 12]),
    ], {
      today: new Date("2024-03-02T12:00:00"),
    });

    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].numbers).toEqual([
      { n: 1, c: 1 },
      { n: 2, c: 1 },
      { n: 3, c: 1 },
      { n: 4, c: 1 },
    ]);
    expect(summary.rows[0].frequencyCounts).toEqual([{ times: 1, count: 4 }]);
    expect(summary.rows[0].undrawn).toHaveLength(41);
    expect(summary.quality.invalidDateCount).toBe(1);
    expect(summary.quality.invalidNumberCount).toBe(2);
    expect(summary.quality.duplicateNumberCount).toBe(3);
    expect(summary.quality.warnings).toEqual([
      "1 draw row ignored because its date could not be parsed.",
      "2 invalid number entries ignored.",
      "3 duplicate entries within a draw ignored before monthly counts were calculated.",
    ]);
  });

  it("builds robust monthly targets from medians so one extreme month does not dominate the ideal draw", () => {
    const summary = analyzeMonthlyDrawSummary([
      draw("2024-01-03", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-02-07", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-03-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-03-08", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-03-15", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-03-22", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-03-29", [1, 2, 3, 4, 5, 6], [7, 8]),
    ], {
      today: new Date("2024-02-29T12:00:00"),
    });

    expect(summary.bucketTargets.find((bucket) => bucket.times === 0)?.targetCount).toBe(37);
    expect(summary.bucketTargets.find((bucket) => bucket.times === 1)?.targetCount).toBe(8);
    expect(summary.bucketTargets.find((bucket) => bucket.times === 5)?.targetCount).toBe(0);
    expect(summary.idealDraw?.bucketCounts.find((bucket) => bucket.times === 0)?.count).toBe(4);
    expect(summary.idealDraw?.bucketCounts.find((bucket) => bucket.times === 5)?.count).toBe(4);
    expect(summary.idealDraw?.freePicks).toBe(0);
  });

  it("excludes the opening partial month from all-history baseline and ideal-draw calculations", () => {
    const summary = analyzeMonthlyDrawSummary([
      draw("2024-05-10", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-05-17", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2024-05-24", [17, 18, 19, 20, 21, 22], [23, 24]),
      draw("2024-06-05", [25, 26, 27, 28, 29, 30], [31, 32]),
      draw("2024-07-03", [33, 34, 35, 36, 37, 38], [39, 40]),
    ], {
      today: new Date("2024-07-10T12:00:00Z"),
    });

    expect(summary.rows.map((row) => row.monthLabel)).toEqual(["2024-05", "2024-06", "2024-07"]);
    expect(summary.effectiveMonthLabel).toBe("2024-07");
    expect(summary.eligibleRows.map((row) => row.monthLabel)).toEqual(["2024-06"]);
    expect(summary.excludedMonthCount).toBe(1);
    expect(summary.bucketTargets.find((bucket) => bucket.times === 0)?.targetCount).toBe(37);
    expect(summary.bucketTargets.find((bucket) => bucket.times === 1)?.targetCount).toBe(8);
    expect(summary.idealDraw?.bucketCounts.find((bucket) => bucket.times === 0)?.count).toBe(4);
    expect(summary.idealDraw?.bucketCounts.find((bucket) => bucket.times === 1)?.count).toBe(4);
  });

  it("keeps the observed current month active while it is still in progress", () => {
    const summary = analyzeMonthlyDrawSummary([
      draw("2026-04-03", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-04-10", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2026-05-01", [17, 18, 19, 20, 21, 22], [23, 24]),
    ], {
      today: new Date("2026-05-05T12:00:00"),
    });

    expect(summary.effectiveMonthLabel).toBe("2026-05");
    expect(summary.effectiveMonthIsSynthetic).toBe(false);
    expect(summary.effectiveMonthDrawCount).toBe(1);
    expect(summary.currentDistribution[0]).toBe(37);
    expect(summary.currentDistribution[1]).toBe(8);
  });

  it("forwards the ideal-draw planning month when the current month has already reached the observed monthly max", () => {
    const summary = analyzeMonthlyDrawSummary([
      draw("2026-04-03", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-04-10", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2026-05-01", [17, 18, 19, 20, 21, 22], [23, 24]),
      draw("2026-05-08", [25, 26, 27, 28, 29, 30], [31, 32]),
    ], {
      today: new Date("2026-05-30T12:00:00"),
    });

    expect(summary.latestRow?.monthLabel).toBe("2026-05");
    expect(summary.effectiveMonthLabel).toBe("2026-06");
    expect(summary.effectiveMonthIsSynthetic).toBe(true);
    expect(summary.currentDistribution[0]).toBe(45);
    expect(summary.idealDraw?.bucketCounts.find((bucket) => bucket.times === 0)?.count).toBe(8);
  });

  it("parses slash-formatted dates consistently when building monthly buckets", () => {
    const summary = analyzeMonthlyDrawSummary([
      draw("4/03/26", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("4/10/26", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("5/01/26", [17, 18, 19, 20, 21, 22], [23, 24]),
    ], {
      today: new Date("2026-05-05T12:00:00"),
    });

    expect(summary.rows.map((row) => row.monthLabel)).toEqual(["2026-04", "2026-05"]);
    expect(summary.latestRow?.monthLabel).toBe("2026-05");
    expect(summary.effectiveMonthLabel).toBe("2026-05");
    expect(summary.effectiveMonthIsSynthetic).toBe(false);
  });

  it("returns all monthly bucket keys with disjoint sets covering numbers one through forty-five", () => {
    const summary = analyzeMonthlyDrawSummary([
      draw("2024-04-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2024-04-08", [1, 2, 9, 10, 11, 12], [13, 14]),
    ]);

    const seen = new Set<number>();
    for (const key of MONTHLY_BUCKET_KEYS) {
      for (const n of summary.latestBucketSets[key]) {
        expect(seen.has(n)).toBe(false);
        seen.add(n);
      }
    }
    expect(seen.size).toBe(45);
    expect([...summary.latestBucketSets.times2]).toEqual([1, 2]);
    expect([...summary.latestBucketSets.times1]).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });
});

describe("analyzeStageIdealDrawModel", () => {
  it("targets the next draw stage using only comparable same-size months", () => {
    const history = [
      ...repeatDraws("2026-01", 13, 1),
      ...repeatDraws("2026-02", 12, 2),
      ...repeatDraws("2026-03", 13, 3),
      ...repeatDraws("2026-06", 5, 4),
    ];

    const state = analyzeStageIdealDrawModel(history, {
      today: new Date("2026-06-11T12:00:00"),
      expectedDrawCountOverride: 13,
    });

    expect(state).not.toBeNull();
    expect(state?.workingMonthLabel).toBe("2026-06");
    expect(state?.expectedDrawCount).toBe(13);
    expect(state?.expectedDrawCountSource).toBe("override");
    expect(state?.completedDrawCount).toBe(5);
    expect(state?.targetStageDrawCount).toBe(6);
    expect(state?.comparableMonthCount).toBe(2);
    expect(state?.targetDistribution.reduce((sum, value) => sum + value, 0)).toBe(45);
    expect(state?.idealDrawBucketCounts.reduce((sum, value) => sum + value, 0)).toBe(8);
  });

  it("returns null when no comparable months exist", () => {
    const state = analyzeStageIdealDrawModel([
      ...repeatDraws("2026-02", 12, 2),
      ...repeatDraws("2026-06", 5, 4),
    ], {
      today: new Date("2026-06-11T12:00:00"),
      expectedDrawCountOverride: 13,
    });

    expect(state).toBeNull();
  });

  it("clamps the target stage to the expected draw count", () => {
    const state = analyzeStageIdealDrawModel([
      ...repeatDraws("2026-01", 13, 1),
      ...repeatDraws("2026-03", 13, 3),
      ...repeatDraws("2026-06", 13, 4),
    ], {
      today: new Date("2026-06-30T12:00:00"),
      expectedDrawCountOverride: 13,
      forceWorkingMonthLabel: "2026-06",
    });

    expect(state?.completedDrawCount).toBe(13);
    expect(state?.targetStageDrawCount).toBe(13);
    expect(state?.warnings).toContain("Target stage was clamped to the expected 13 draws.");
  });

  it("rolls the stage working month forward when the latest month is cadence-complete", () => {
    const mondayWednesdayFriday = [1, 3, 5];
    const state = analyzeStageIdealDrawModel([
      ...weekdayDraws("2025-10", mondayWednesdayFriday, 1),
      ...weekdayDraws("2026-06", mondayWednesdayFriday, 4),
    ], {
      today: new Date("2026-06-30T12:00:00"),
    });

    expect(state).not.toBeNull();
    expect(state?.workingMonthLabel).toBe("2026-07");
    expect(state?.expectedDrawCount).toBe(14);
    expect(state?.completedDrawCount).toBe(0);
    expect(state?.targetStageDrawCount).toBe(1);
  });
});

describe("analyzeStageMatchAcceptancePlaybook", () => {
  it("builds historical stage-path rows without using future or wrong-size months", () => {
    const history = [
      ...repeatDraws("2026-01", 13, 1),
      ...repeatDraws("2026-02", 12, 2),
      ...repeatDraws("2026-03", 13, 3),
      ...repeatDraws("2026-06", 5, 4),
    ];

    const playbook = analyzeStageMatchAcceptancePlaybook(history, {
      today: new Date("2026-06-11T12:00:00"),
      expectedDrawCountOverride: 13,
    });

    expect(playbook).not.toBeNull();
    expect(playbook?.workingMonthLabel).toBe("2026-06");
    expect(playbook?.expectedDrawCount).toBe(13);
    expect(playbook?.targetStageDrawCount).toBe(6);
    expect(playbook?.comparableMonthCount).toBe(2);
    expect(playbook?.rows.length).toBeGreaterThan(0);
    expect(playbook?.rows.every((row) => row.totalComparableCount === 2)).toBe(true);
    expect(playbook?.rows.every((row) => row.historicalMonthLabel !== "2026-02")).toBe(true);
    expect(playbook?.rows.every((row) => row.acceptanceNeedsBucketCounts.reduce((sum, count) => sum + count, 0) === 8)).toBe(true);
    expect(playbook?.rows.every((row) => row.projectedDistribution.reduce((sum, count) => sum + count, 0) === 45)).toBe(true);
    expect(playbook?.rows.every((row) => row.historicalDistribution.reduce((sum, count) => sum + count, 0) === 45)).toBe(true);
  });

  it("returns one best row per target undrawn count with support counts", () => {
    const playbook = analyzeStageMatchAcceptancePlaybook([
      ...repeatDraws("2026-01", 13, 1),
      ...repeatDraws("2026-03", 13, 1),
      ...repeatDraws("2026-06", 5, 4),
    ], {
      today: new Date("2026-06-11T12:00:00"),
      expectedDrawCountOverride: 13,
    });

    expect(playbook).not.toBeNull();
    expect(playbook?.rows).toHaveLength(1);
    expect(playbook?.rows[0].supportCount).toBe(2);
    expect(playbook?.rows[0].sameUndrawnMonthLabels).toEqual(["2026-03", "2026-01"]);
  });
});

describe("computeIdealMonthlyDraw", () => {
  it("exhaustively selects the bucket allocation that best moves the current distribution toward target", () => {
    const result = computeIdealMonthlyDraw({
      currentDistribution: [37, 8, 0, 0, 0, 0, 0, 0, 0],
      targetDistribution: [37, 0, 8, 0, 0, 0, 0, 0, 0],
      drawSize: 8,
    });

    expect(result.bucketCounts).toEqual([
      { times: 0, count: 0 },
      { times: 1, count: 8 },
      { times: 2, count: 0 },
      { times: 3, count: 0 },
      { times: 4, count: 0 },
      { times: 5, count: 0 },
      { times: 6, count: 0 },
      { times: 7, count: 0 },
      { times: 8, count: 0 },
    ]);
    expect(result.projectedDistribution).toEqual([37, 0, 8, 0, 0, 0, 0, 0, 0]);
    expect(result.freePicks).toBe(0);
    expect(result.scoreAfter).toBe(0);
  });
});

describe("projectMonthlyBucketCounts", () => {
  it("shows running what-if bucket totals as clicked numbers move into the next bucket", () => {
    const bucketSets = createEmptyMonthlyBucketSets();
    [1, 2, 3].forEach((n) => bucketSets.undrawn.add(n));
    [4, 5].forEach((n) => bucketSets.times2.add(n));
    [6, 7, 8, 9].forEach((n) => bucketSets.times3.add(n));
    [10, 11].forEach((n) => bucketSets.times8.add(n));

    const projection = projectMonthlyBucketCounts(bucketSets, {
      undrawn: [1, 1, 99],
      times1: [],
      times2: [4],
      times3: [6, 7],
      times4: [],
      times5: [],
      times6: [],
      times7: [],
      times8: [10],
    });

    expect(projection.undrawn).toEqual({
      baseCount: 3,
      projectedCount: 2,
      delta: -1,
      selectedCount: 1,
    });
    expect(projection.times1).toEqual({
      baseCount: 0,
      projectedCount: 1,
      delta: 1,
      selectedCount: 0,
    });
    expect(projection.times2).toEqual({
      baseCount: 2,
      projectedCount: 1,
      delta: -1,
      selectedCount: 1,
    });
    expect(projection.times3).toEqual({
      baseCount: 4,
      projectedCount: 3,
      delta: -1,
      selectedCount: 2,
    });
    expect(projection.times4).toEqual({
      baseCount: 0,
      projectedCount: 2,
      delta: 2,
      selectedCount: 0,
    });
    expect(projection.times8).toEqual({
      baseCount: 2,
      projectedCount: 2,
      delta: 0,
      selectedCount: 1,
    });
  });
});

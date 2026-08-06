import { describe, expect, it } from "vitest";

import {
  buildSelectionInsightPredictedCompanions,
  buildSelectionInsightsAnalytics,
  buildSelectionInsightsSnapshot,
} from "./selectionInsights";
import type { Draw } from "../types";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("selectionInsights", () => {
  it("keeps all observed companion numbers instead of capping the list at 12", () => {
    const history: Draw[] = [];
    for (let companion = 2; companion <= 45; companion += 3) {
      history.push(draw(`6/${companion}/26`, [1, companion, Math.min(45, companion + 1), Math.min(45, companion + 2), 10, 20], [30, 40]));
    }

    const analytics = buildSelectionInsightsAnalytics(history, [1]);

    expect(analytics.companionRows.length).toBeGreaterThan(12);
    expect(analytics.companionRows).toContainEqual(expect.objectContaining({ n: 2, count: 1 }));
    expect(analytics.companionRows.at(-1)?.count).toBeGreaterThan(0);
  });

  it("sorts predicted companion support from blended window and all-history evidence", () => {
    const allHistory = [
      draw("6/1/26", [1, 9, 10, 11, 12, 13], [14, 15]),
      draw("6/3/26", [1, 8, 10, 16, 17, 18], [19, 20]),
      draw("6/5/26", [1, 9, 21, 22, 23, 24], [25, 26]),
    ];
    const windowHistory = [
      draw("6/3/26", [1, 8, 10, 16, 17, 18], [19, 20]),
      draw("6/5/26", [1, 9, 21, 22, 23, 24], [25, 26]),
    ];

    const predicted = buildSelectionInsightPredictedCompanions(
      buildSelectionInsightsAnalytics(windowHistory, [1]),
      buildSelectionInsightsAnalytics(allHistory, [1]),
    );

    expect(predicted[0].supportScore).toBeGreaterThanOrEqual(predicted[1].supportScore);
    expect(predicted.map((row) => row.n)).toContain(9);
    expect(predicted.find((row) => row.n === 9)).toMatchObject({ windowCount: 1, allCount: 2 });
  });

  it("omits selected pairs and triplets that have zero observed co-draws", () => {
    const history = [
      draw("6/1/26", [1, 2, 10, 11, 12, 13], [14, 15]),
      draw("6/3/26", [1, 2, 3, 20, 21, 22], [23, 24]),
    ];

    const analytics = buildSelectionInsightsAnalytics(history, [1, 2, 3, 4]);

    expect(analytics.pairRows).toEqual([
      expect.objectContaining({ a: 1, b: 2, total: 2 }),
      expect.objectContaining({ a: 1, b: 3, total: 1 }),
      expect.objectContaining({ a: 2, b: 3, total: 1 }),
    ]);
    expect(analytics.pairRows.some((row) => row.a === 4 || row.b === 4)).toBe(false);
    expect(analytics.tripletRows).toEqual([
      expect.objectContaining({ a: 1, b: 2, c: 3, total: 1 }),
    ]);
    expect(analytics.tripletRows.some((row) => row.a === 4 || row.b === 4 || row.c === 4)).toBe(false);
  });

  it("builds a compact structured snapshot for prediction journal capture", () => {
    const history = [
      draw("6/1/26", [1, 9, 10, 11, 12, 13], [14, 15]),
      draw("6/3/26", [1, 8, 10, 16, 17, 18], [19, 20]),
    ];

    const snapshot = buildSelectionInsightsSnapshot({
      enabled: true,
      selected: [1],
      windowLabel: "Custom 2",
      windowHistory: history,
      allHistory: history,
      maxRows: 3,
    });

    expect(snapshot).toMatchObject({
      version: 1,
      enabled: true,
      selectedNumbers: [1],
      windowLabel: "Custom 2",
      windowDrawCount: 2,
      allDrawCount: 2,
    });
    expect(snapshot.predictedCompanions).toHaveLength(3);
    expect(snapshot.predictedCompanionNumbers).toEqual(snapshot.predictedCompanions.map((row) => row.number));
  });
});

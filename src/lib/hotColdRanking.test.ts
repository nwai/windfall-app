import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Draw } from "../types";
import { HotColdRankingPanel } from "../components/HotColdRankingPanel";
import {
  analyzeHotColdRanking,
  formatHotColdWindowChoiceLabel,
  resolveHotColdWindowChoice,
} from "./hotColdRanking";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("analyzeHotColdRanking", () => {
  const history: Draw[] = [
    draw("2026-01-01", [1, 7, 11, 20, 30, 40]),
    draw("2026-01-08", [1, 8, 11, 21, 31, 41]),
    draw("2026-01-15", [1, 9, 12, 22, 32, 42]),
    draw("2026-01-22", [1, 5, 13, 23, 33, 43]),
    draw("2026-01-29", [4, 6, 11, 20, 34, 44]),
    draw("2026-02-05", [4, 7, 11, 20, 35, 45]),
    draw("2026-02-12", [4, 7, 14, 24, 36, 42]),
    draw("2026-02-19", [4, 7, 11, 20, 37, 42]),
  ];

  it("separates historical frequency from recent and weighted hotness", () => {
    const summary = analyzeHotColdRanking(history, { includeSupp: false, recentWindow: 4, halfLife: 3 });

    expect(summary.totalDraws).toBe(8);
    expect(summary.recentWindow).toBe(4);
    expect(summary.priorWindow).toBe(4);

    const one = summary.rows.find((row) => row.number === 1);
    const four = summary.rows.find((row) => row.number === 4);
    const eleven = summary.rows.find((row) => row.number === 11);
    const twenty = summary.rows.find((row) => row.number === 20);

    expect(one?.totalCount).toBe(4);
    expect(four?.recentCount).toBe(4);
    expect(four?.status).toBe("hot");
    expect(one?.status).toBe("cold");
    expect(eleven?.historicalRank).toBeLessThanOrEqual(3);
    expect(twenty?.historicalRank).toBeLessThanOrEqual(5);
    expect(summary.topHistorical[0]?.number).toBe(11);
    expect(summary.topRecent[0]?.number).toBe(4);
    expect(summary.topWeighted[0]?.number).toBe(4);
    expect(summary.topHot[0]?.number).toBe(4);
    expect(summary.topCold[0]?.number).toBe(1);
  });

  it("supports supplementary inclusion in the counts", () => {
    const withSupp: Draw[] = [
      draw("2026-03-01", [1, 2, 3, 4, 5, 6], [11, 12]),
      draw("2026-03-08", [1, 2, 3, 4, 7, 8], [11, 13]),
      draw("2026-03-15", [1, 2, 3, 9, 10, 14], [11, 15]),
      draw("2026-03-22", [16, 17, 18, 19, 20, 21], [11, 22]),
    ];

    const mainsOnly = analyzeHotColdRanking(withSupp, { includeSupp: false, recentWindow: 2, halfLife: 2 });
    const mainPlusSupp = analyzeHotColdRanking(withSupp, { includeSupp: true, recentWindow: 2, halfLife: 2 });

    const elevenMainsOnly = mainsOnly.rows.find((row) => row.number === 11);
    const elevenWithSupp = mainPlusSupp.rows.find((row) => row.number === 11);

    expect(elevenMainsOnly?.totalCount).toBe(0);
    expect(elevenWithSupp?.totalCount).toBe(4);
    expect(elevenWithSupp?.historicalRank).toBe(1);
  });

  it("clamps the recent window safely when the history is shorter than requested", () => {
    const shortHistory: Draw[] = [
      draw("2026-04-01", [1, 2, 3, 4, 5, 6]),
      draw("2026-04-08", [7, 8, 9, 10, 11, 12]),
    ];

    const summary = analyzeHotColdRanking(shortHistory, { recentWindow: 20, halfLife: 5 });

    expect(summary.recentWindow).toBe(2);
    expect(summary.priorWindow).toBe(0);
    expect(summary.rows.find((row) => row.number === 1)?.recentCount).toBe(1);
  });

  it("supports zero half-life as latest-draw-only weighted evidence", () => {
    const zeroHalfLife = analyzeHotColdRanking(history, { includeSupp: false, recentWindow: 4, halfLife: 0 });

    const latestOnlyNumber = zeroHalfLife.rows.find((row) => row.number === 37);
    const historicalOnlyNumber = zeroHalfLife.rows.find((row) => row.number === 1);

    expect(latestOnlyNumber?.weightedRate).toBe(1);
    expect(latestOnlyNumber?.weightedRank).toBeLessThanOrEqual(6);
    expect(historicalOnlyNumber?.weightedRate).toBe(0);
    expect(formatHotColdWindowChoiceLabel(0, 80, 10, "halfLife")).toBe("0 · Latest draw only");
  });

  it("renders zero as a weighted half-life selector choice", () => {
    const html = renderToStaticMarkup(React.createElement(HotColdRankingPanel, { history }));

    expect(html).toContain("0 · latest draw only");
  });

  it("renders include/exclude generation selectors for hot/cold breakdown rows", () => {
    const html = renderToStaticMarkup(React.createElement(HotColdRankingPanel as any, {
      history,
      forcedNumbers: [4],
      excludedNumbers: [1],
      onToggleForcedNumber: () => undefined,
      onToggleExcludedNumber: () => undefined,
    }));

    expect(html).toContain("Include selected rows");
    expect(html).toContain("Exclude selected rows");
    expect(html).toContain("Forced in");
    expect(html).toContain("Excluded");
  });

  it("resolves WFMQYH shortcut choices to draw counts", () => {
    expect(resolveHotColdWindowChoice("W", 80, 20)).toBe(3);
    expect(resolveHotColdWindowChoice("F", 80, 20)).toBe(6);
    expect(resolveHotColdWindowChoice("M", 80, 20)).toBe(12);
    expect(resolveHotColdWindowChoice("Q", 80, 20)).toBe(36);
    expect(resolveHotColdWindowChoice("Y", 200, 20)).toBe(156);
    expect(resolveHotColdWindowChoice("H", 80, 20)).toBe(80);
    expect(resolveHotColdWindowChoice("H", 0, 20)).toBe(20);
    expect(resolveHotColdWindowChoice("WFMQYH", 80, 20, 27)).toBe(27);
    expect(resolveHotColdWindowChoice("WFMQYH", 80, 20, 0)).toBe(20);
  });

  it("formats WFMQYH shortcut labels clearly for recent windows and half-life", () => {
    expect(formatHotColdWindowChoiceLabel("W", 80, 20, "recentWindow")).toBe("W · Weekly (3 draws)");
    expect(formatHotColdWindowChoiceLabel("H", 80, 20, "recentWindow")).toBe("H · Full history (all loaded draws · 80)");
    expect(formatHotColdWindowChoiceLabel("H", 80, 10, "halfLife")).toBe("H · Full history (80 draws)");
    expect(formatHotColdWindowChoiceLabel("WFMQYH", 80, 20, "recentWindow", 27)).toBe("WFMQYH · Current custom window (27 active draws)");
    expect(formatHotColdWindowChoiceLabel("WFMQYH", 80, 10, "halfLife", 27)).toBe("WFMQYH · Current custom window (27 draws)");
  });
});

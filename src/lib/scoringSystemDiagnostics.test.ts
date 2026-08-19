import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import {
  analyzeJournalTerminalDigitHistory,
  analyzeScoringSystemDiagnostics,
  buildOddEvenBlueprint,
  buildTerminalDigitSets,
  combination,
  isStraightTerminalDigitRun,
  normalizeScoringMonthSearch,
  normalizeTerminalDigitSetSearch,
  scoreFromPercent,
  terminalDigitBaseScoreForNumber,
  terminalDigitForNumber,
} from "./scoringSystemDiagnostics";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("scoring system diagnostics analytics", () => {
  it("computes exact eight-number odd/even blueprint rows", () => {
    const rows = buildOddEvenBlueprint(8);

    expect(combination(45, 8)).toBe(215553195);
    expect(rows.map((row) => row.ratio)).toEqual([
      "8:0", "7:1", "6:2", "5:3", "4:4", "3:5", "2:6", "1:7", "0:8",
    ]);
    expect(rows.find((row) => row.ratio === "4:4")).toMatchObject({
      totalCombinations: 64774325,
      baselinePercent: 30.05,
      baseScore: 3005,
    });
    expect(rows.find((row) => row.ratio === "0:8")).toMatchObject({
      totalCombinations: 319770,
      baselinePercent: 0.15,
      baseScore: 15,
    });
    expect(rows.reduce((sum, row) => sum + row.totalCombinations, 0)).toBe(215553195);
  });

  it("computes six-number odd/even blueprint separately from the eight-number blueprint", () => {
    const rows = buildOddEvenBlueprint(6);

    expect(rows.map((row) => row.ratio)).toEqual([
      "6:0", "5:1", "4:2", "3:3", "2:4", "1:5", "0:6",
    ]);
    expect(rows.reduce((sum, row) => sum + row.totalCombinations, 0)).toBe(combination(45, 6));
    expect(rows.find((row) => row.ratio === "3:3")?.baseScore).not.toBe(3005);
  });

  it("scores from observed percentages on the blueprint scale", () => {
    expect(scoreFromPercent(30.05)).toBe(3005);
    expect(scoreFromPercent(7.5)).toBe(750);
    expect(scoreFromPercent(0)).toBe(0);
  });

  it("applies terminal digit labels without pretending they are number probabilities", () => {
    expect(terminalDigitForNumber(10)).toBe(0);
    expect(terminalDigitForNumber(45)).toBe(5);
    expect(terminalDigitBaseScoreForNumber(1)).toBe(11.11);
    expect(terminalDigitBaseScoreForNumber(25)).toBe(11.11);
    expect(terminalDigitBaseScoreForNumber(30)).toBe(8.89);
    expect(terminalDigitBaseScoreForNumber(44)).toBe(11.11);
  });

  it("generates all 1002 unordered terminal digit sets from length 2 through 8", () => {
    const sets = buildTerminalDigitSets();
    const byLength = new Map<number, number>();
    for (const set of sets) {
      byLength.set(set.digits.length, (byLength.get(set.digits.length) ?? 0) + 1);
    }

    expect(sets).toHaveLength(1002);
    expect(byLength.get(2)).toBe(45);
    expect(byLength.get(3)).toBe(120);
    expect(byLength.get(4)).toBe(210);
    expect(byLength.get(5)).toBe(252);
    expect(byLength.get(6)).toBe(210);
    expect(byLength.get(7)).toBe(120);
    expect(byLength.get(8)).toBe(45);
    expect(new Set(sets.map((set) => set.key)).size).toBe(1002);
  });

  it("identifies 42 unordered straight terminal digit runs without double-counting descending labels", () => {
    const straightSets = buildTerminalDigitSets().filter((set) => isStraightTerminalDigitRun(set.digits));
    const byLength = new Map<number, number>();
    for (const set of straightSets) {
      byLength.set(set.digits.length, (byLength.get(set.digits.length) ?? 0) + 1);
    }

    expect(straightSets).toHaveLength(42);
    expect(byLength.get(2)).toBe(9);
    expect(byLength.get(3)).toBe(8);
    expect(byLength.get(8)).toBe(3);
    expect(isStraightTerminalDigitRun([0, 1, 2])).toBe(true);
    expect(isStraightTerminalDigitRun([2, 1, 0])).toBe(true);
    expect(isStraightTerminalDigitRun([0, 2, 3])).toBe(false);
  });

  it("keeps absent WFMQYH ratios at zero while preserving base and full-history scores", () => {
    const full = [
      draw("D1", [1, 3, 5, 7, 9, 11], [2, 4]),
      draw("D2", [1, 3, 5, 7, 2, 4], [6, 8]),
      draw("D3", [2, 4, 6, 8, 10, 12], [1, 3]),
    ];
    const filtered = [
      draw("D3", [2, 4, 6, 8, 10, 12], [1, 3]),
    ];

    const result = analyzeScoringSystemDiagnostics(full, filtered);
    const sixTwo = result.ratioRows.find((row) => row.ratio === "6:2");

    expect(sixTwo?.fullHistoryCount).toBe(1);
    expect(sixTwo?.fullHistoryScore).toBeGreaterThan(0);
    expect(sixTwo?.wfmqyhCount).toBe(0);
    expect(sixTwo?.wfmqyhScore).toBe(0);
    expect(sixTwo?.baseScore).toBeGreaterThan(0);
  });

  it("scores number rows and rank movement from full history versus WFMQYH only", () => {
    const full = [
      draw("D1", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("D2", [1, 2, 9, 10, 11, 12], [13, 14]),
      draw("D3", [20, 21, 22, 23, 24, 25], [26, 27]),
    ];
    const filtered = [
      draw("D3", [20, 21, 22, 23, 24, 25], [26, 27]),
    ];

    const result = analyzeScoringSystemDiagnostics(full, filtered);
    const one = result.numberRows.find((row) => row.number === 1);
    const twentyFour = result.numberRows.find((row) => row.number === 24);

    expect(one?.fullHistoryCount).toBe(2);
    expect(one?.wfmqyhCount).toBe(0);
    expect(twentyFour?.fullHistoryCount).toBe(1);
    expect(twentyFour?.wfmqyhCount).toBe(1);
    expect(twentyFour?.rankMovement).not.toBeNull();
  });

  it("builds terminal digit set rows using unique digits from each draw", () => {
    const full = [
      draw("D1", [1, 11, 21, 31, 41, 2], [12, 22]),
      draw("D2", [3, 13, 23, 33, 43, 4], [14, 24]),
    ];
    const result = analyzeScoringSystemDiagnostics(full, full);

    const digitSet = result.terminalDigitSetRows.find((row) => row.key === "1,2");
    expect(digitSet?.fullHistoryCount).toBe(1);
    expect(digitSet?.wfmqyhCount).toBe(1);
    expect(digitSet?.length).toBe(2);
    expect(digitSet?.fullHistoryExamples[0]).toEqual({
      date: "D1",
      main: [1, 11, 21, 31, 41, 2],
      supp: [12, 22],
    });
  });

  it("counts contained terminal digit combinations inside larger exact draw sets", () => {
    const full = [
      draw("6/15/26", [44, 43, 32, 34, 38, 24], [33, 40]),
    ];
    const result = analyzeScoringSystemDiagnostics(full, full);

    const exactSet = result.terminalDigitSetRows.find((row) => row.key === "0,2,3,4,8");
    const containedSet = result.terminalDigitSetRows.find((row) => row.key === "3,4");

    expect(exactSet?.fullHistoryCount).toBe(1);
    expect(exactSet?.fullContainedCount).toBe(1);
    expect(containedSet?.fullHistoryCount).toBe(0);
    expect(containedSet?.fullContainedCount).toBe(1);
    expect(containedSet?.wfmqyhContainedCount).toBe(1);
    expect(containedSet?.fullContainedExamples[0]).toEqual({
      date: "6/15/26",
      main: [44, 43, 32, 34, 38, 24],
      supp: [33, 40],
    });
    expect(containedSet?.fullContainedMonths).toEqual(["2026-06"]);
    expect(containedSet?.wfmqyhContainedMonths).toEqual(["2026-06"]);
  });

  it("keeps the most recent contained examples by input order", () => {
    const full = [
      draw("oldest", [3, 14, 20, 21, 22, 25], [26, 27]),
      draw("middle", [13, 24, 20, 21, 22, 25], [26, 27]),
      draw("newer", [23, 34, 20, 21, 22, 25], [26, 27]),
      draw("newest", [33, 44, 20, 21, 22, 25], [26, 27]),
    ];

    const result = analyzeScoringSystemDiagnostics(full, full);
    const containedSet = result.terminalDigitSetRows.find((row) => row.key === "3,4");

    expect(containedSet?.fullContainedExamples.map((example) => example.date)).toEqual([
      "middle",
      "newer",
      "newest",
    ]);
  });

  it("summarizes prediction terminal digit history as exact, contained, or never seen", () => {
    const full = [
      draw("D1", [1, 11, 21, 31, 41, 2], [12, 22]),
      draw("D2", [44, 43, 32, 34, 38, 24], [33, 40]),
      draw("D3", [5, 15, 25, 35, 45, 6], [16, 26]),
    ];

    const exact = analyzeJournalTerminalDigitHistory(full, [1, 2]);
    expect(exact?.key).toBe("1,2");
    expect(exact?.exactCount).toBe(1);
    expect(exact?.containedCount).toBe(1);
    expect(exact?.latestExactExample?.date).toBe("D1");

    const contained = analyzeJournalTerminalDigitHistory(full, [3, 4]);
    expect(contained?.exactCount).toBe(0);
    expect(contained?.containedCount).toBe(1);
    expect(contained?.containedPercent).toBe(33.33);
    expect(contained?.latestContainedExample?.date).toBe("D2");

    const neverSeen = analyzeJournalTerminalDigitHistory(full, [7, 9]);
    expect(neverSeen?.exactCount).toBe(0);
    expect(neverSeen?.containedCount).toBe(0);
    expect(neverSeen?.band).toBe("never-seen");
  });

  it("normalizes scoring search inputs for months and unique terminal digits", () => {
    expect(normalizeScoringMonthSearch("6/26")).toEqual({ key: "2026-06", label: "Jun 2026" });
    expect(normalizeScoringMonthSearch("06/2026")).toEqual({ key: "2026-06", label: "Jun 2026" });
    expect(normalizeScoringMonthSearch("2026-06")).toEqual({ key: "2026-06", label: "Jun 2026" });
    expect(normalizeScoringMonthSearch("June 2026")).toEqual({ key: "2026-06", label: "Jun 2026" });
    expect(normalizeScoringMonthSearch("not a month")).toBeNull();

    expect(normalizeTerminalDigitSetSearch("3,4")).toBe("3,4");
    expect(normalizeTerminalDigitSetSearch("4 3")).toBe("3,4");
    expect(normalizeTerminalDigitSetSearch("34")).toBe("3,4");
    expect(normalizeTerminalDigitSetSearch("3,3,4")).toBe("3,4");
    expect(normalizeTerminalDigitSetSearch("3")).toBeNull();
    expect(normalizeTerminalDigitSetSearch("1,2,3,4,5,6,7,8,9")).toBeNull();
  });

  it("skips invalid rows and reports provenance for each history", () => {
    const full = [
      draw("bad duplicate", [1, 1, 2, 3, 4, 5], [6, 7]),
      draw("good", [1, 2, 3, 4, 5, 6], [7, 8]),
    ];
    const result = analyzeScoringSystemDiagnostics(full, full);

    expect(result.provenance.fullValidDraws).toBe(1);
    expect(result.provenance.fullSkippedDraws).toBe(1);
    expect(result.provenance.filteredValidDraws).toBe(1);
    expect(result.provenance.filteredSkippedDraws).toBe(1);
  });
});

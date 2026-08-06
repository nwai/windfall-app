import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  analyzeD1TerminalMomentum,
  analyzeEndingDigitSequences,
  analyzeEndingDigitMonthStage,
  buildEndingDigitMonthOptions,
  predictNextEndingDigitSequence,
} from "./endingDigitSequences";

describe("analyzeEndingDigitSequences", () => {
  const history: Draw[] = [
    { date: "2024-01-01", main: [12, 23, 34, 45, 8, 19], supp: [20, 7] },
    { date: "2024-01-08", main: [16, 27, 38, 9, 10, 21], supp: [32, 43] },
    { date: "2024-01-15", main: [1, 12, 24, 35, 26, 8], supp: [19, 30] },
  ];

  it("finds circular ending-digit runs for main+supp draws", () => {
    const summary = analyzeEndingDigitSequences(history, { includeSupp: true });

    expect(summary.totalDraws).toBe(3);
    expect(summary.drawsWithMaxRunAtLeast3).toBe(3);
    expect(summary.drawsWithMaxRunAtLeast4).toBe(3);
    expect(summary.drawsWithCoveredNumbersAtLeast4).toBe(3);
    expect(summary.maxRunLengthFrequency).toEqual({ 4: 1, 5: 1, 8: 1 });
    expect(summary.coveredNumbersFrequency).toEqual({ 4: 1, 5: 1, 8: 1 });

    expect(summary.perDraw[0].maxRuns.map((run) => run.digits)).toEqual([[2, 3, 4, 5], [7, 8, 9, 0]]);
    expect(summary.perDraw[0].coveredNumbers).toBe(4);
  });

  it("supports main-only analysis", () => {
    const summary = analyzeEndingDigitSequences(history, { includeSupp: false });

    expect(summary.totalDraws).toBe(3);
    expect(summary.perDraw[0].numbers).toEqual([12, 23, 34, 45, 8, 19]);
    expect(summary.perDraw[0].maxRunLength).toBe(4);
    expect(summary.perDraw[0].coveredNumbers).toBe(4);
    expect(summary.maxRunLengthFrequency).toEqual({ 3: 1, 4: 1, 6: 1 });
    expect(summary.coveredNumbersFrequency).toEqual({ 3: 1, 4: 1, 6: 1 });
  });

  it("handles empty draw history", () => {
    const summary = analyzeEndingDigitSequences([]);

    expect(summary.totalDraws).toBe(0);
    expect(summary.drawsWithMaxRunAtLeast3).toBe(0);
    expect(summary.maxRunLengthFrequency).toEqual({});
    expect(summary.coveredNumbersFrequency).toEqual({});
    expect(summary.perDraw).toEqual([]);
  });

  it("ignores invalid draw numbers instead of letting impossible endings affect results", () => {
    const summary = analyzeEndingDigitSequences([
      { date: "2024-02-01", main: [1, 12, 46, 0, 35, 35], supp: [20, 99] },
    ]);

    expect(summary.perDraw[0].numbers).toEqual([1, 12, 35, 20]);
    expect(summary.perDraw[0].endings).toEqual([1, 2, 5, 0]);
  });
});

describe("analyzeEndingDigitMonthStage", () => {
  const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

  it("builds selectable months newest first with their loaded draw counts", () => {
    const options = buildEndingDigitMonthOptions([
      draw("2026-05-01", [1, 2, 3, 4, 5, 6]),
      draw("2026-06-01", [11, 12, 13, 14, 15, 16]),
      draw("2026-06-03", [21, 22, 23, 24, 25, 26]),
    ], { includeSupp: false });

    expect(options.map((option) => [option.monthKey, option.drawCount])).toEqual([
      ["2026-06", 2],
      ["2026-05", 1],
    ]);
  });

  it("shows first-N terminal digit movement from early month hits to month-end buckets", () => {
    const analysis = analyzeEndingDigitMonthStage([
      draw("2026-05-01", [12, 22, 31, 44, 5, 6], [32, 42]),
      draw("2026-05-03", [2, 12, 13, 24, 35, 40], [7, 8]),
      draw("2026-06-01", [12, 22, 32, 42, 5, 6], [1, 3]),
      draw("2026-06-03", [2, 12, 13, 24, 35, 40], [7, 8]),
    ], { includeSupp: true, monthKey: "2026-06", drawCount: 1 });

    expect(analysis?.monthKey).toBe("2026-06");
    expect(analysis?.selectedDrawCount).toBe(1);

    const digitTwo = analysis?.rows.find((row) => row.digit === 2);
    expect(digitTwo?.familyNumbers).toEqual([2, 12, 22, 32, 42]);
    expect(digitTwo?.firstDrawNumbers).toEqual([12, 22, 32, 42]);
    expect(digitTwo?.firstDrawHits).toBe(4);
    expect(digitTwo?.firstDrawMultiple).toBe(true);
    expect(digitTwo?.stageHits).toBe(4);
    expect(digitTwo?.stageUnique).toBe(4);
    expect(digitTwo?.stageBucketMix).toEqual([1, 4, 0, 0, 0, 0, 0, 0, 0]);
    expect(digitTwo?.monthEndHits).toBe(6);
    expect(digitTwo?.monthEndUnique).toBe(5);
    expect(digitTwo?.monthEndBucketMix).toEqual([0, 4, 1, 0, 0, 0, 0, 0, 0]);
    expect(digitTwo?.postStageHits).toBe(2);
    expect(digitTwo?.numbersAdvancedAfterStage).toBe(2);
  });

  it("builds D1 multi context from prior months only", () => {
    const analysis = analyzeEndingDigitMonthStage([
      draw("2026-03-01", [1, 13, 24, 35, 40, 41]),
      draw("2026-03-03", [2, 12, 23, 34, 45, 6]),
      draw("2026-04-01", [12, 22, 31, 44, 5, 6], [32, 42]),
      draw("2026-04-03", [2, 12, 13, 24, 35, 40], [7, 8]),
      draw("2026-05-01", [12, 22, 32, 42, 5, 6]),
      draw("2026-05-03", [2, 12, 13, 24, 35, 40]),
      draw("2026-06-01", [12, 22, 32, 42, 2, 6]),
      draw("2026-06-03", [2, 12, 22, 32, 42, 40]),
    ], { includeSupp: true, monthKey: "2026-05", drawCount: 1 });

    const digitTwo = analysis?.rows.find((row) => row.digit === 2);

    expect(digitTwo?.context.priorMonthsWithFirstDrawMultiple).toBe(1);
    expect(digitTwo?.context.priorMonthsWithoutFirstDrawMultiple).toBe(1);
    expect(digitTwo?.context.avgPostD1HitsWhenMultiple).toBe(2);
    expect(digitTwo?.context.avgPostD1HitsWhenNotMultiple).toBe(2);
    expect(digitTwo?.context.lift).toBe(1);
  });
});

describe("analyzeD1TerminalMomentum", () => {
  const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

  it("classifies early D1 multi terminal families as strong when prior same-stage unique expansion is consistent", () => {
    const analysis = analyzeD1TerminalMomentum([
      draw("2026-02-01", [12, 22, 1, 3, 4, 5]),
      draw("2026-02-03", [2, 13, 24, 35, 40, 41]),
      draw("2026-03-01", [12, 22, 1, 3, 4, 5]),
      draw("2026-03-03", [32, 13, 24, 35, 40, 41]),
      draw("2026-04-01", [12, 22, 1, 3, 4, 5]),
      draw("2026-04-03", [42, 13, 24, 35, 40, 41]),
      draw("2026-05-01", [12, 22, 1, 3, 4, 5]),
      draw("2026-05-03", [7, 13, 24, 35, 40, 41]),
    ], { includeSupp: false, monthKey: "2026-05", drawCount: 1 });

    const digitTwo = analysis?.activeRows.find((row) => row.digit === 2);

    expect(analysis?.stageMode).toBe("early-unique");
    expect(analysis?.overallSuggestedStrength).toBe("strong");
    expect(digitTwo?.suggestedStrength).toBe("strong");
    expect(digitTwo?.prior.d1MultiTrials).toBe(3);
    expect(digitTwo?.prior.nextHitRate).toBe(1);
    expect(digitTwo?.prior.nextUniqueRate).toBe(1);
  });

  it("uses prior months only for D1 terminal momentum context", () => {
    const analysis = analyzeD1TerminalMomentum([
      draw("2026-04-01", [12, 22, 1, 3, 4, 5]),
      draw("2026-04-03", [2, 13, 24, 35, 40, 41]),
      draw("2026-05-01", [12, 22, 1, 3, 4, 5]),
      draw("2026-05-03", [7, 13, 24, 35, 40, 41]),
      draw("2026-06-01", [12, 22, 1, 3, 4, 5]),
      draw("2026-06-03", [32, 13, 24, 35, 40, 41]),
    ], { includeSupp: false, monthKey: "2026-05", drawCount: 1 });

    const digitTwo = analysis?.activeRows.find((row) => row.digit === 2);

    expect(digitTwo?.prior.d1MultiTrials).toBe(1);
    expect(digitTwo?.prior.avgNextHits).toBe(1);
  });

  it("turns the SGI preview off when the selected month stage is already closed", () => {
    const analysis = analyzeD1TerminalMomentum([
      draw("2026-04-01", [12, 22, 1, 3, 4, 5]),
      draw("2026-04-03", [2, 13, 24, 35, 40, 41]),
      draw("2026-05-01", [12, 22, 1, 3, 4, 5]),
      draw("2026-05-03", [7, 13, 24, 35, 40, 41]),
    ], { includeSupp: false, monthKey: "2026-05", drawCount: 2 });

    expect(analysis?.stageMode).toBe("closed-review");
    expect(analysis?.overallSuggestedStrength).toBe("off");
    expect(analysis?.activeRows[0]?.suggestedStrength).toBe("off");
  });

  it("uses the expected planning-month draw count so live next draws are not mistaken for closed months", () => {
    const analysis = analyzeD1TerminalMomentum([
      draw("2026-04-01", [12, 22, 1, 3, 4, 5]),
      draw("2026-04-03", [2, 13, 24, 35, 40, 41]),
      draw("2026-05-01", [12, 22, 1, 3, 4, 5]),
    ], { includeSupp: false, monthKey: "2026-05", drawCount: 1, expectedDrawCount: 13 });

    expect(analysis?.stageMode).toBe("early-unique");
    expect(analysis?.targetDrawNumber).toBe(2);
    expect(analysis?.totalDrawsInMonth).toBe(13);
  });
});

describe("predictNextEndingDigitSequence", () => {
  const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

  it("does not invent a recommendation when the selected history is empty", () => {
    const prediction = predictNextEndingDigitSequence([]);

    expect(prediction.totalDraws).toBe(0);
    expect(prediction.topSequence).toBeNull();
    expect(prediction.alternatives).toEqual([]);
  });

  it("favours the ending sequence supported by recent runs, adjacent combos, and hot/cold movement", () => {
    const prediction = predictNextEndingDigitSequence([
      draw("2026-01-01", [1, 12, 23, 34, 41, 45]),
      draw("2026-01-08", [2, 13, 24, 35, 42, 44]),
      draw("2026-01-15", [3, 14, 25, 36, 43, 45]),
      draw("2026-01-22", [12, 23, 34, 32, 33, 44]),
      draw("2026-01-29", [12, 23, 34, 22, 33, 44]),
      draw("2026-02-05", [12, 23, 34, 22, 33, 42]),
    ], { includeSupp: false, sequenceLength: 3, recentWindow: 3, halfLife: 3 });

    expect(prediction.topSequence?.digits).toEqual([2, 3, 4]);
    expect(prediction.topSequence?.components.adjacentCombos).toBeGreaterThan(0);
    expect(prediction.topSequence?.components.hotCold).toBeGreaterThan(0);
    expect(prediction.topSequence?.drivers.join(" ")).toContain("Adjacent");
  });

  it("uses latest-state transitions when historical next draws repeatedly followed the same state", () => {
    const prediction = predictNextEndingDigitSequence([
      draw("2026-04-01", [8, 19, 30, 5, 16, 27]),
      draw("2026-04-08", [12, 23, 34, 6, 17, 28]),
      draw("2026-04-15", [5, 16, 27, 8, 19, 30]),
      draw("2026-04-22", [12, 23, 34, 7, 18, 29]),
      draw("2026-04-29", [5, 16, 27, 8, 19, 30]),
      draw("2026-05-06", [12, 23, 34, 11, 21, 31]),
      draw("2026-05-13", [8, 19, 30, 41, 42, 43]),
    ], { includeSupp: false, sequenceLength: 3, recentWindow: 4, halfLife: 4 });

    expect(prediction.topSequence?.digits).toEqual([2, 3, 4]);
    expect(prediction.topSequence?.components.transition).toBeGreaterThan(0);
    expect(prediction.topSequence?.drivers.join(" ")).toContain("Transition");
  });

  it("reports WFMQYH window-shape evidence for the selected top sequence", () => {
    const prediction = predictNextEndingDigitSequence([
      draw("2026-03-01", [4, 15, 26, 37, 41, 42]),
      draw("2026-03-08", [4, 15, 26, 37, 43, 44]),
      draw("2026-03-15", [14, 25, 36, 37, 43, 44]),
      draw("2026-03-22", [14, 25, 36, 37, 43, 44]),
    ], { includeSupp: false, sequenceLength: 4, recentWindow: 2, halfLife: 2 });

    expect(prediction.topSequence?.digits).toEqual([4, 5, 6, 7]);
    expect(prediction.windowShape.target.lowMidHigh.low).toBeGreaterThan(0);
    expect(prediction.windowShape.target.lowMidHigh.mid).toBeGreaterThan(0);
    expect(prediction.windowShape.target.lowMidHigh.high).toBeGreaterThan(0);
    expect(prediction.topSequence?.components.observedShape).toBeGreaterThan(0);
  });

  it("uses observed run-length priors in auto mode", () => {
    const prediction = predictNextEndingDigitSequence([
      draw("2026-06-01", [1, 12, 23, 35, 37, 39]),
      draw("2026-06-08", [2, 13, 24, 36, 38, 40]),
      draw("2026-06-15", [3, 14, 25, 37, 39, 41]),
      draw("2026-06-22", [4, 15, 26, 38, 40, 42]),
      draw("2026-06-29", [5, 16, 27, 39, 41, 43]),
    ], { includeSupp: false, sequenceLength: "auto", recentWindow: 5, halfLife: 5 });

    expect(prediction.topSequence?.components.runLengthPrior).toBeGreaterThan(0);
    expect(prediction.runLengthPrior[3]).toBeGreaterThan(prediction.runLengthPrior[5]);
  });

  it("normalizes hot/cold ending support by ending bucket size", () => {
    const prediction = predictNextEndingDigitSequence([
      draw("2026-07-01", [10, 20, 30, 40, 1, 11]),
      draw("2026-07-08", [10, 20, 30, 40, 2, 12]),
      draw("2026-07-15", [10, 20, 30, 40, 3, 13]),
      draw("2026-07-22", [10, 20, 30, 40, 4, 14]),
    ], { includeSupp: false, sequenceLength: 3, recentWindow: 4, halfLife: 4 });

    const zero = prediction.digitScores.find((row) => row.digit === 0);
    expect(zero?.hotCold).toBeGreaterThan(80);
  });

  it("returns walk-forward backtest evidence for confidence labels", () => {
    const prediction = predictNextEndingDigitSequence([
      draw("2026-08-01", [1, 12, 23, 31, 35, 39]),
      draw("2026-08-08", [2, 13, 24, 32, 36, 40]),
      draw("2026-08-15", [3, 14, 25, 33, 37, 41]),
      draw("2026-08-22", [1, 12, 23, 34, 38, 42]),
      draw("2026-08-29", [2, 13, 24, 35, 39, 43]),
      draw("2026-09-05", [3, 14, 25, 36, 40, 44]),
      draw("2026-09-12", [4, 15, 26, 37, 41, 45]),
      draw("2026-09-19", [5, 16, 27, 38, 42, 44]),
      draw("2026-09-26", [6, 17, 28, 39, 43, 45]),
    ], { includeSupp: false, sequenceLength: 3, recentWindow: 4, halfLife: 4 });

    expect(prediction.backtest.evaluatedTransitions).toBeGreaterThan(0);
    expect(prediction.backtest.partialHitRate).toBeGreaterThanOrEqual(prediction.backtest.exactHitRate);
    expect(prediction.topSequence?.confidenceLabel).toBe(prediction.backtest.calibratedLabel);
  });
});

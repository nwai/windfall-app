import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { TerminalDigitStageSplitCard } from "../src/components/TerminalDigitStageSplitCard";

const juneHistory = () => {
  const juneDates = ["6/1/26", "6/3/26", "6/5/26", "6/8/26", "6/10/26", "6/12/26", "6/15/26", "6/17/26", "6/19/26", "6/22/26", "6/24/26", "6/26/26", "6/29/26"];
  return juneDates.map((date, index) => ({
    date,
    main: [1, 2, 3, 4, 5, 6].map((number) => ((number + index - 1) % 45) + 1),
    supp: [7, 8].map((number) => ((number + index - 1) % 45) + 1),
  }));
};

const openJuneHistory = () => {
  const mayDates = ["5/1/26", "5/4/26", "5/6/26", "5/8/26", "5/11/26", "5/13/26", "5/15/26", "5/18/26", "5/20/26", "5/22/26", "5/25/26", "5/27/26", "5/29/26"];
  const may = mayDates.map((date, index) => ({
    date,
    main: [1, 2, 3, 4, 5, 6].map((number) => ((number + index + 7) % 45) + 1),
    supp: [7, 8].map((number) => ((number + index + 7) % 45) + 1),
  }));
  return [...may, ...juneHistory().slice(0, 6)];
};

const stageState = (targetStageDrawCount: number) => ({
  bucketSets: {
    undrawn: new Set(Array.from({ length: 15 }, (_, index) => index + 31)),
    times1: new Set(Array.from({ length: 10 }, (_, index) => index + 21)),
    times2: new Set(Array.from({ length: 10 }, (_, index) => index + 11)),
    times3: new Set(Array.from({ length: 10 }, (_, index) => index + 1)),
    times4: new Set<number>(),
    times5: new Set<number>(),
    times6: new Set<number>(),
    times7: new Set<number>(),
    times8: new Set<number>(),
  },
  currentDistribution: [15, 10, 10, 10, 0, 0, 0, 0, 0],
  targetDistribution: [12, 12, 11, 10, 0, 0, 0, 0, 0],
  idealDrawBucketCounts: [3, 2, 2, 1, 0, 0, 0, 0, 0],
  workingMonthLabel: "2026-06",
  expectedDrawCount: 13,
  targetStageDrawCount,
  completedDrawCount: targetStageDrawCount - 1,
  comparableMonthCount: 7,
  expectedDrawCountSource: "auto" as const,
  warnings: [],
});

describe("TerminalDigitStageSplitCard", () => {
  it("explains when the selected history has no complete comparable months", () => {
    const html = renderToStaticMarkup(React.createElement(TerminalDigitStageSplitCard, {
      draws: [],
      allDraws: [],
      includeSupp: true,
    }));

    expect(html).toContain("Monthly Terminal Digit Stage-Split Diagnostic");
    expect(html).toContain("Observe only");
    expect(html).toContain("Early block ends");
    expect(html).toContain("Bottom 3 + ties");
    expect(html).toContain("Draw presence");
    expect(html).toContain("Early quiet is not an avoid list");
    expect(html).toContain("No comparable next-draw transitions for this setup");
    expect(html).toContain("No comparable completed months for the remainder test");
    expect(html).toContain("No estimate has been substituted");
    expect(html).toContain("Candidate translation replay");
    expect(html).toContain("has not inserted a simulated or fallback result");
    expect(html).not.toContain("Comparable transitions");
  });

  it("renders the two response horizons when complete history is available", () => {
    const history = juneHistory();
    const html = renderToStaticMarkup(React.createElement(TerminalDigitStageSplitCard, {
      draws: history,
      allDraws: history,
      includeSupp: true,
    }));

    expect(html).toContain("Immediate next-draw response");
    expect(html).toContain("Candidate translation replay");
    expect(html).toContain("Next-draw hit-count distribution");
    expect(html).toContain("Real-draw audit ledger");
    expect(html).toContain("there is no manual success entry");
    expect(html).toContain("Remainder-of-month response");
    expect(html).toContain("Cutoff comparison");
    expect(html).toContain("No score from this card changes candidate generation");
    expect(html).toContain("not corrected for trying several split points");
  });

  it("refuses to compare Candidate Translation with a different Stage IDM target draw", () => {
    const history = openJuneHistory();
    const html = renderToStaticMarkup(React.createElement(TerminalDigitStageSplitCard, {
      draws: history,
      allDraws: history,
      includeSupp: true,
      stageIdealDrawState: stageState(10),
    }));

    expect(html).toContain("Not directly comparable yet");
    expect(html).toContain("Candidate Translation targets 2026-06 D7");
    expect(html).toContain("Stage IDM targets 2026-06 D10");
    expect(html).toContain("Set Early block ends to D9");
    expect(html).not.toContain("Composition-compatible");
  });

  it("shows a bucket-by-bucket compatibility table for an aligned target draw", () => {
    const history = openJuneHistory();
    const html = renderToStaticMarkup(React.createElement(TerminalDigitStageSplitCard, {
      draws: history,
      allDraws: history,
      includeSupp: true,
      stageIdealDrawState: stageState(7),
    }));

    expect(html).toContain("Candidate Translation × Monthly Draw Summary");
    expect(html).toContain("Same target: 2026-06 D7");
    expect(html).toContain("Monthly bucket");
    expect(html).toContain("Translation overlap");
    expect(html).toContain("Stage IDM target");
    expect(html).toContain("not proof that either is accurate");
  });

  it("is mounted inside Ending Digit Sequences with baseline and WFMQYH inputs", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/EndingDigitSequencePanel.tsx"), "utf8");

    expect(source).toContain("<TerminalDigitStageSplitCard");
    expect(source).toContain("draws={draws}");
    expect(source).toContain("allDraws={allDraws}");
    expect(source).toContain("includeSupp={includeSupp}");
    expect(source).toContain("stageIdealDrawState={stageIdealDrawState}");
  });
});

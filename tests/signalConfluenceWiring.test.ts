import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignalConfluencePanel } from "../src/components/SignalConfluencePanel";
import { createEmptyMonthlyBucketSets } from "../src/lib/monthlyDrawSummary";
import { buildPreviousNeighbourConstraintRows } from "../src/lib/previousNeighbourTargets";
import type { PreviousNeighbourAtlasEvidenceSnapshot } from "../src/lib/previousNeighbourAtlasEvidence";
import type { Draw } from "../src/types";

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");
const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

const atlasEvidence: PreviousNeighbourAtlasEvidenceSnapshot = {
  version: 1,
  observeOnly: true,
  historySource: "baseline",
  historySourceLabel: "Baseline history",
  scope: "mains-plus-supps",
  lookbackDraws: 1,
  transitionCount: 30,
  validDraws: 31,
  excludedTargetDraws: 0,
  excludedTargetMonthLabels: [],
  targetDrawOrdinal: 8,
  overall: { averageUniqueHits: 3, averageExpectedUniqueHits: 2.8, averageDirectionalHits: 3.2, lift: 1.071 },
  composition: { oddLift: 1, evenLift: 1.1, oneDigitLift: 0.9, twoDigitLift: 1.1 },
  ordinalEvidence: {
    drawOrdinal: 8,
    label: "D8",
    trials: 3,
    sampleQuality: "Thin",
    averageUniqueHits: 3,
    averageExpectedUniqueHits: 2.8,
    lift: 1.071,
    atLeastOneRate: 1,
    atLeastThreeRate: 0.67,
    atLeastFourRate: 0.33,
    topPattern: "1/1/1/0",
    topPatternCount: 1,
  },
  currentCloud: {
    sourceDateLabel: "1/26/26",
    sourceNumbers: [10, 12],
    targetNumbers: [8, 9, 11, 13, 14],
    ambiguousTargetNumbers: [11],
    targetCount: 5,
    oddTargetCount: 3,
    evenTargetCount: 2,
    oneDigitTargetCount: 2,
    twoDigitTargetCount: 3,
    numbers: [
      { number: 8, directions: ["-2"], ambiguous: false },
      { number: 9, directions: ["-1"], ambiguous: false },
      { number: 11, directions: ["-1", "+1"], ambiguous: true },
      { number: 13, directions: ["+1"], ambiguous: false },
      { number: 14, directions: ["+2"], ambiguous: false },
    ],
  },
  warnings: ["Thin evidence"],
};

describe("Signal Confluence / Number Consensus Ledger wiring", () => {
  it("renders as an observe-only capped evidence ledger", () => {
    const html = renderToStaticMarkup(React.createElement(SignalConfluencePanel, {
      activeHistory: [],
      allHistoryDrawCount: 0,
      latestNeighbourMode: "pm1pm2",
      latestNeighbourRows: [],
      strictDroughtNumbers: [],
      empiricalDroughtNumbers: [],
      sharedAnalysisSelectionNumbers: [],
      hotColdRows: [],
      drawBucketPatternRows: [],
      scoringNumberRows: [],
      selectionInsightRows: [],
      nextDrawEvidenceResult: null,
      userSelectedNumbers: [],
      forcedNumbers: [],
      excludedNumbers: [],
    }));

    expect(html).toContain("Observe-only ledger");
    expect(html).toContain("changes candidate generation only when");
    expect(html).toContain("Bounded score counts at most one capped contribution per registered independence group");
    expect(html).toContain("WF-EVIDENCE-1.0.0");
    expect(html).toContain("No outcome-selected family or weight");
    expect(html).toContain("Support sort");
    expect(html).toContain("NDEE source");
    expect(html).toContain("not run");
    expect(html).toContain("Click a supported number pill");
    expect(html).toContain('aria-label="Ledger row visibility"');
    expect(html).toContain("Evidence/context");
    expect(html).toContain("All 45");
    expect(html).toContain("Signal Confluence Independence Audit");
    expect(html).toContain("current-set redundancy check");
    expect(html).toContain("scored independence groups");
    expect(html).toContain("Ledger effect");
    expect(html).toContain("Review audit");
    expect(html).toContain("not proof that any pair is independent");
    expect(html).toContain("Context-only sources");
    expect(html).toContain("Context");
    expect(html).not.toContain("Hide zero-support numbers");
  });

  it("renders Signal Confluence forced numbers as explicit user-controlled state", () => {
    const monthlyBuckets = createEmptyMonthlyBucketSets();
    monthlyBuckets.times2.add(7);

    const html = renderToStaticMarkup(React.createElement(SignalConfluencePanel, {
      activeHistory: [],
      allHistoryDrawCount: 0,
      latestNeighbourMode: "pm1pm2",
      latestNeighbourRows: [],
      strictDroughtNumbers: [7],
      empiricalDroughtNumbers: [],
      sharedAnalysisSelectionNumbers: [],
      hotColdRows: [],
      drawBucketPatternRows: [],
      scoringNumberRows: [],
      selectionInsightRows: [],
      nextDrawEvidenceResult: null,
      monthlyBuckets,
      userSelectedNumbers: [],
      forcedNumbers: [7],
      excludedNumbers: [],
      signalConfluenceForcedNumbers: [7],
      onToggleForcedNumber: () => {},
      maxForcedNumbers: 8,
    }));

    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Confluence");
    expect(html).toContain("Bucket 2x");
    expect(html).toContain("Context only; it does not add Signal Confluence support");
    expect(html).toContain("Remove 7 as a Signal Confluence forced inclusion");
  });

  it("adds target-weekday neighbour support only when the active window has a positive weekday lift", () => {
    const activeHistory = [
      draw("2026-01-05", [10, 12, 20, 30, 40, 1], [33, 35]),
      draw("2026-01-07", [11, 13, 19, 29, 39, 2], [34, 36]),
      draw("2026-01-09", [5, 7, 15, 25, 45, 27], [31, 43]),
      draw("2026-01-12", [10, 14, 22, 28, 37, 41], [3, 44]),
      draw("2026-01-14", [9, 13, 21, 27, 38, 42], [4, 43]),
      draw("2026-01-16", [6, 8, 16, 24, 26, 32], [35, 45]),
      draw("2026-01-19", [1, 5, 11, 17, 29, 33], [37, 41]),
      draw("2026-01-21", [2, 6, 10, 18, 28, 34], [36, 40]),
      draw("2026-01-23", [7, 15, 23, 31, 39, 43], [44, 45]),
      draw("2026-01-26", [3, 12, 20, 25, 30, 35], [40, 45]),
    ];
    const latestNeighbourRows = buildPreviousNeighbourConstraintRows(activeHistory[activeHistory.length - 1], "mains-plus-supps");
    const html = renderToStaticMarkup(React.createElement(SignalConfluencePanel, {
      activeHistory,
      allHistoryDrawCount: activeHistory.length,
      latestDrawDate: "2026-01-26",
      targetDrawDate: "2026-01-28",
      latestNeighbourMode: "pm1pm2",
      latestNeighbourRows,
      strictDroughtNumbers: [],
      empiricalDroughtNumbers: [],
      sharedAnalysisSelectionNumbers: [],
      hotColdRows: [],
      drawBucketPatternRows: [],
      scoringNumberRows: [],
      selectionInsightRows: [],
      nextDrawEvidenceResult: null,
      userSelectedNumbers: [],
      forcedNumbers: [],
      excludedNumbers: [],
    }));

    expect(html).toContain("Wed ±1/±2 lift");
    expect(html).toContain("Previous-neighbour weekday diagnostic");
    expect(html).toContain("active WFMQYH transitions");
  });

  it("replaces the older latest-neighbour family with the shared Atlas snapshot", () => {
    const latestNeighbourRows = buildPreviousNeighbourConstraintRows(
      draw("1/26/26", [10, 12, 20, 24, 32, 40], [5, 45]),
      "mains-plus-supps",
    );
    const html = renderToStaticMarkup(React.createElement(SignalConfluencePanel, {
      activeHistory: [],
      allHistoryDrawCount: 31,
      latestNeighbourMode: "pm1pm2",
      latestNeighbourRows,
      strictDroughtNumbers: [],
      empiricalDroughtNumbers: [],
      sharedAnalysisSelectionNumbers: [],
      hotColdRows: [],
      drawBucketPatternRows: [],
      scoringNumberRows: [],
      selectionInsightRows: [],
      nextDrawEvidenceResult: null,
      neighbourAtlasEvidence: atlasEvidence,
      userSelectedNumbers: [],
      forcedNumbers: [],
      excludedNumbers: [],
    }));

    expect(html).toContain("Neighbour Atlas bridge");
    expect(html).toContain("It replaces the older latest-neighbour mention");
    expect(html).toContain("Neighbour Atlas +/-1 and +/-2");
    expect(html).not.toContain("Latest draw +/-1 and +/-2");
    expect(html).toContain("stage evidence adds no score");
  });

  it("is mounted in Validation and receives the explicit NDEE replay result", () => {
    const app = source("src/App.tsx");
    const ndee = source("src/components/NextDrawEvidenceEnsemblePanel.tsx");
    const registry = source("src/lib/panelFavorites.ts");
    const manual = source("public/user-manual.html");

    expect(app).toContain('panelId="signal-confluence-ledger"');
    expect(app).toContain("nextDrawEvidenceResultForConfluence");
    expect(app).toContain("setNextDrawEvidenceResultForConfluence");
    expect(app).toContain("neighbourAtlasEvidence={previousNeighbourAtlasEvidence}");
    expect(app).toContain("signalConfluenceForcedNumbers");
    expect(app).toContain("monthlyBuckets={monthlyBucketSetsAlways ?? monthlyConstraintPayload?.buckets ?? null}");
    expect(app).toContain("onToggleForcedNumber={toggleSignalConfluenceForcedNumber}");
    expect(ndee).toContain("onResultChange");
    expect(registry).toContain('id: "signal-confluence-ledger"');
    expect(manual).toContain('id="signal-confluence-ledger"');
    expect(manual).toContain("Signal Confluence / Number Consensus Ledger");
  });
});

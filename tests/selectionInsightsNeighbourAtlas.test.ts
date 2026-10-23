import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SelectionInsightsNeighbourAtlasCard } from "../src/components/SelectionInsightsPanel";
import type { PreviousNeighbourAtlasEvidenceSnapshot } from "../src/lib/previousNeighbourAtlasEvidence";

const evidence: PreviousNeighbourAtlasEvidenceSnapshot = {
  version: 1,
  observeOnly: true,
  historySource: "baseline",
  historySourceLabel: "342 baseline draws",
  scope: "mains-plus-supps",
  lookbackDraws: 1,
  transitionCount: 341,
  validDraws: 342,
  excludedTargetDraws: 0,
  excludedTargetMonthLabels: [],
  targetDrawOrdinal: 8,
  targetMonthExpectedDrawCount: 13,
  overall: { averageUniqueHits: 3.1, averageExpectedUniqueHits: 2.8, averageDirectionalHits: 3.4, lift: 1.107 },
  composition: { oddLift: 1.02, evenLift: 1.08, oneDigitLift: 0.97, twoDigitLift: 1.11 },
  ordinalEvidence: {
    drawOrdinal: 8,
    label: "D8",
    trials: 27,
    sampleQuality: "Broad",
    averageUniqueHits: 3.2,
    averageExpectedUniqueHits: 2.8,
    lift: 1.143,
    atLeastOneRate: 0.96,
    atLeastThreeRate: 0.62,
    atLeastFourRate: 0.35,
    topPattern: "1/1/1/0",
    topPatternCount: 3,
  },
  currentCloud: {
    sourceDateLabel: "9/28/26",
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
  warnings: [],
};

describe("SelectionInsightsNeighbourAtlasCard", () => {
  it("shows shared stage context without changing companion ranking", () => {
    const html = renderToStaticMarkup(React.createElement(SelectionInsightsNeighbourAtlasCard, {
      evidence,
      selected: [11, 22],
    }));

    expect(html).toContain("Neighbour Atlas context");
    expect(html).toContain("Observe-only");
    expect(html).toContain("342 baseline draws");
    expect(html).toContain("D8/13");
    expect(html).toContain("11 · -1/+1 · ambiguous");
    expect(html).toContain("never adds a boost here");
  });
});

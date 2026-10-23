import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PreviousNeighbourBacktestPanel } from "../src/components/PreviousNeighbourBacktestPanel";
import { analyzePreviousNeighbourCountShapeAtlas } from "../src/lib/previousNeighbourCountShapeAtlas";
import type { Draw } from "../src/types";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("PreviousNeighbourBacktestPanel", () => {
  it("renders the ±1/±2 neighbour diagnostic as observe-only and anti-lookahead", () => {
    const draws = [
      draw("2026-01-01", [10, 12, 20, 30, 40, 1], [33, 35]),
      draw("2026-01-03", [11, 34, 21, 5, 6, 7], [2, 44]),
      draw("2026-01-05", [9, 13, 19, 31, 39, 41], [32, 36]),
      draw("2026-01-08", [8, 14, 18, 32, 38, 42], [3, 37]),
      draw("2026-01-10", [7, 15, 17, 33, 37, 43], [4, 29]),
      draw("2026-01-12", [6, 16, 22, 34, 36, 44], [5, 28]),
    ];

    const html = renderToStaticMarkup(React.createElement(PreviousNeighbourBacktestPanel, {
      draws,
      userSelectedNumbers: [14],
      excludedNumbers: [18],
      onToggleUserSelectedNumber: () => undefined,
      atlasAnalysis: analyzePreviousNeighbourCountShapeAtlas(draws),
      scope: "mains-plus-supps",
      onScopeChange: () => undefined,
      directionalLookback: 1,
      onDirectionalLookbackChange: () => undefined,
      atlasHistorySource: "baseline",
      onAtlasHistorySourceChange: () => undefined,
    }));

    expect(html).toContain("Neighbour Count &amp; Shape Atlas");
    expect(html).toContain("Count &amp; stage");
    expect(html).toContain("Transition ledger");
    expect(html).toContain("Unique-hit count by monthly draw ordinal");
    expect(html).toContain("Avg cloud");
    expect(html).toContain("Immediate next-draw translation");
    expect(html).toContain("The draw-stage table estimates a count, not which members will appear");
    expect(html).toContain("Cloud-size-controlled draw-stage evidence");
    expect(html).toContain("95% excess interval");
    expect(html).toContain("intentionally unranked");
    expect(html).toContain("Read lift, not raw totals");
    expect(html).toContain("Unique numbers and directional paths are deliberately separate");
    expect(html).toContain("Auditable transition ledger");
    expect(html).toContain("No future result used");
    expect(html).toContain("Live hand-off read + latest ±1/±2 targets");
    expect(html).toContain("hit-side wins / miss-side wins / ties");
    expect(html).toContain("Possible latest-draw ±1/±2 numbers");
    expect(html).toContain("All targets from 2026-01-12");
    expect(html).toContain("Selectable helper");
    expect(html).toContain("aria-pressed=\"true\"");
    expect(html).toContain("Number 18 is unavailable because it is currently excluded.");
    expect(html).toContain("Prev");
    expect(html).toContain("Observe-only");
    expect(html).toContain("Anti-lookahead");
    expect(html).toContain("Advanced soft-rule replay settings");
    expect(html).not.toContain("Soft-rule candidate check");
    expect(html).toContain("does not alter candidate generation");
    expect(html).toContain("Hit vs missed neighbour hand-off test");
    expect(html).toContain("Observe-only hand-off");
    expect(html).toContain("Clean exclusive comparison");
    expect(html).toContain("Current missed-side helper");
    expect(html).toContain("Fresh ±1/±2 cloud from missed sources");
    expect(html).toContain("Helper only");
    expect(html).not.toContain("±1 History Table");
    expect(html).toContain("34");
  });
});

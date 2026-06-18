import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PreviousNeighbourBacktestPanel } from "../src/components/PreviousNeighbourBacktestPanel";
import type { Draw } from "../src/types";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("PreviousNeighbourBacktestPanel", () => {
  it("renders the ±1 neighbour diagnostic as observe-only and anti-lookahead", () => {
    const draws = [
      draw("2026-01-01", [10, 12, 20, 30, 40, 1], [33, 35]),
      draw("2026-01-03", [11, 34, 21, 5, 6, 7], [2, 44]),
      draw("2026-01-05", [9, 13, 19, 31, 39, 41], [32, 36]),
      draw("2026-01-08", [8, 14, 18, 32, 38, 42], [3, 37]),
      draw("2026-01-10", [7, 15, 17, 33, 37, 43], [4, 29]),
      draw("2026-01-12", [6, 16, 22, 34, 36, 44], [5, 28]),
    ];

    const html = renderToStaticMarkup(React.createElement(PreviousNeighbourBacktestPanel, { draws }));

    expect(html).toContain("Previous ±1 Neighbour Backtest");
    expect(html).toContain("Observe-only");
    expect(html).toContain("Anti-lookahead");
    expect(html).toContain("Duplicated neighbours");
    expect(html).toContain("Soft-rule candidate check");
    expect(html).toContain("does not alter candidate generation");
    expect(html).toContain("±1 History Table");
    expect(html).toContain("Previous draw");
    expect(html).toContain("Current draw");
    expect(html).toContain("34");
  });
});

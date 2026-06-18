import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NextDrawProbabilitiesPanel } from "../src/components/NextDrawProbabilitiesPanel";
import type { Draw } from "../src/types";

const draw = (date: string, main: number[], supp: number[] = [], isSimulated = false): Draw => ({
  date,
  main,
  supp,
  isSimulated,
});

describe("NextDrawProbabilitiesPanel truthfulness", () => {
  it("uses real draw rows only and labels output as empirical diagnostics", () => {
    const history: Draw[] = [
      draw("2026-01-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-08", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2026-01-15", [39, 40, 41, 42, 43, 44], [1, 2], true),
    ];

    const html = renderToStaticMarkup(
      React.createElement(NextDrawProbabilitiesPanel, {
        history,
        allHistory: history,
      }),
    );

    expect(html).toContain("Next Draw Empirical Diagnostics");
    expect(html).toContain("Ignored 1 simulated fallback draw row");
    expect(html).toContain("Window: 2 real draws");
    expect(html).toContain("KDE support %");
    expect(html).toContain("Empirical share %");
    expect(html).not.toContain("Next Draw Probabilities");
    expect(html).not.toContain("Next OGA probabilities");
    expect(html).not.toContain("Prob%");
  });
});

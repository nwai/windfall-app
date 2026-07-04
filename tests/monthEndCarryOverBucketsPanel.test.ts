import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import MonthEndCarryOverBucketsPanel from "../src/components/MonthEndCarryOverBucketsPanel";
import type { Draw } from "../src/types";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("MonthEndCarryOverBucketsPanel", () => {
  it("renders carry-over numbers as selectable pressed buttons", () => {
    const history: Draw[] = [
      draw("2026-01-01", [2, 6, 10, 11, 12, 13]),
      draw("2026-01-08", [2, 6, 14, 15, 16, 17]),
      draw("2026-01-15", [6, 18, 19, 20, 21, 22]),
      draw("2026-01-22", [6, 23, 24, 25, 26, 27]),
      draw("2026-01-29", [1, 2, 6, 28, 29, 30]),
      draw("2026-02-02", [1, 2, 6, 31, 32, 33]),
    ];

    const html = renderToStaticMarkup(
      React.createElement(MonthEndCarryOverBucketsPanel, {
        history,
        selectedBoostNumbers: [6],
        onToggleBoostNumber: () => undefined,
      }),
    );

    expect(html).toContain("button");
    expect(html).toContain("Last-draw obs");
    expect(html).toContain("25.0%");
    expect(html).toContain("1x / 3x / 5x");
    expect(html).toContain("aria-pressed=\"true\"");
    expect(html).toContain("Remove carry-over boost for 6");
    expect(html).toContain("Add carry-over boost for 1");
  });

  it("locks carry-over boost chips for user-excluded numbers", () => {
    const history: Draw[] = [
      draw("2026-01-01", [2, 6, 10, 11, 12, 13]),
      draw("2026-01-08", [2, 6, 14, 15, 16, 17]),
      draw("2026-01-15", [6, 18, 19, 20, 21, 22]),
      draw("2026-01-22", [6, 23, 24, 25, 26, 27]),
      draw("2026-01-29", [1, 2, 6, 28, 29, 30]),
      draw("2026-02-02", [1, 2, 6, 31, 32, 33]),
    ];

    const html = renderToStaticMarkup(
      React.createElement(MonthEndCarryOverBucketsPanel, {
        history,
        selectedBoostNumbers: [6],
        excludedNumbers: [1],
        onToggleBoostNumber: () => undefined,
      }),
    );

    expect(html).toContain("User exclusions active: 1");
    expect(html).toContain("Number 1 is excluded by User Exclusions");
    expect(html).toContain("disabled");
  });
});

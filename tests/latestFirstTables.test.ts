import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import MonthlyDrawsSummaryPanel from "../src/components/MonthlyDrawsSummaryPanel";
import MonthlyOverlapPanel from "../src/components/MonthlyOverlapPanel";
import { WindowStatsPanel } from "../src/components/WindowStatsPanel";
import type { Draw } from "../src/types";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

const parseHtml = (html: string): Document => new DOMParser().parseFromString(html, "text/html");

const firstBodyRowText = (html: string): string => {
  const doc = parseHtml(html);
  return doc.querySelector("tbody tr")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
};

describe("chronological tables display latest rows first", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("shows the latest month first in Monthly Draws Summary", () => {
    const html = renderToStaticMarkup(React.createElement(MonthlyDrawsSummaryPanel, {
      history: [
        draw("2026-04-01", [1, 2, 3, 4, 5, 6], [7, 8]),
        draw("2026-05-01", [9, 10, 11, 12, 13, 14], [15, 16]),
        draw("2026-06-01", [17, 18, 19, 20, 21, 22], [23, 24]),
      ],
    }));

    expect(firstBodyRowText(html)).toContain("2026-06");
  });

  it("shows the latest month first in Monthly Numbers Overlap", () => {
    const history: Draw[] = [
      draw("2026-04-01", [1, 2, 3, 4, 5, 6]),
      draw("2026-04-08", [1, 7, 8, 9, 10, 11]),
      draw("2026-04-15", [2, 12, 13, 14, 15, 16]),
      draw("2026-04-22", [3, 17, 18, 19, 20, 21]),
      draw("2026-05-01", [4, 5, 6, 7, 8, 9]),
      draw("2026-05-08", [4, 10, 11, 12, 13, 14]),
      draw("2026-05-15", [5, 15, 16, 17, 18, 19]),
      draw("2026-05-22", [6, 20, 21, 22, 23, 24]),
    ];

    const html = renderToStaticMarkup(React.createElement(MonthlyOverlapPanel, { history }));

    expect(firstBodyRowText(html)).toContain("2026-06");
  });

  it("shows the latest draw first in Window Stats", () => {
    const html = renderToStaticMarkup(React.createElement(WindowStatsPanel, {
      draws: [
        draw("2026-04-01", [1, 2, 3, 4, 5, 6]),
        draw("2026-05-01", [7, 8, 9, 10, 11, 12]),
        draw("2026-06-01", [13, 14, 15, 16, 17, 18]),
      ],
    }));

    expect(firstBodyRowText(html)).toContain("2026-06-01");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NumberTrendsTable, type NumberTrend } from "../src/components/NumberTrendsTable";
import type { Draw } from "../src/types";

const readProjectFile = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

const buildTrends = (): NumberTrend[] =>
  Array.from({ length: 45 }, (_, index) => {
    const number = index + 1;
    return {
      number,
      d3: number % 3,
      d9: number % 9,
      d15: number % 15,
      fortnight: number % 6,
      month: number % 13,
      quarter: number % 36,
      year: number % 20,
      all: number + 10,
    };
  });

const buildHistory = (drawCount: number): Draw[] =>
  Array.from({ length: drawCount }, (_, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    main: [1, 2, 3, 4, 5, 6],
    supp: [7, 8],
  }));

describe("NumberTrendsTable", () => {
  it("renders number trends as nine five-number HIG blocks instead of wide tables", () => {
    const html = renderToStaticMarkup(
      React.createElement(NumberTrendsTable, {
        trends: buildTrends(),
        selected: [7],
      }),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const blocks = Array.from(document.querySelectorAll("[data-testid='number-trend-block']"));
    const rows = Array.from(document.querySelectorAll("[data-testid='number-trend-row']"));

    expect(blocks).toHaveLength(9);
    expect(blocks.map((block) => block.getAttribute("aria-label"))).toEqual([
      "Number trends 1-5",
      "Number trends 6-10",
      "Number trends 11-15",
      "Number trends 16-20",
      "Number trends 21-25",
      "Number trends 26-30",
      "Number trends 31-35",
      "Number trends 36-40",
      "Number trends 41-45",
    ]);
    expect(blocks.map((block) => block.querySelectorAll("[data-testid='number-trend-row']").length))
      .toEqual([5, 5, 5, 5, 5, 5, 5, 5, 5]);
    expect(rows).toHaveLength(45);
    expect(document.querySelectorAll("table")).toHaveLength(0);
    expect(document.body.textContent).toContain("13D");
    expect(document.body.textContent).not.toContain("12D");

    const selectedRow = document.querySelector("[aria-label='Toggle forced inclusion for number 7']");
    expect(selectedRow?.getAttribute("aria-pressed")).toBe("true");
    expect(selectedRow?.textContent).toContain("Forced");
    expect(selectedRow?.textContent).toContain("7");

    const numberOneRow = document.querySelector("[aria-label='Toggle forced inclusion for number 1']");
    expect(numberOneRow?.getAttribute("style") ?? "").toContain("--number-trend-color:hsl(23, 70%, 45%)");
    expect(numberOneRow?.querySelector(".windfall-number-trend-row__number")).not.toBeNull();
    expect(numberOneRow?.querySelector(".windfall-number-trend-row__delta")).not.toBeNull();
    expect(numberOneRow?.querySelector(".windfall-number-trend-row__delta")?.getAttribute("aria-label")).toContain("versus 13D");
  });

  it("computes the month comparison window from 13 draws", () => {
    const html = renderToStaticMarkup(
      React.createElement(NumberTrendsTable, {
        history: buildHistory(13),
      }),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const numberOneRow = document.querySelector("[aria-label='Toggle forced inclusion for number 1']");

    expect(numberOneRow?.textContent).toContain("13D13");
    expect(numberOneRow?.querySelector(".windfall-number-trend-row__delta")?.getAttribute("aria-label")).toContain("13D 100.0 percent");
  });

  it("shows externally forced drought-break numbers as locked selected rows", () => {
    const html = renderToStaticMarkup(
      React.createElement(NumberTrendsTable, {
        trends: buildTrends(),
        selected: [],
        externalSelectedNumbers: [11],
        externalSelectedLabel: "Drought-break shortlist",
      }),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const droughtRow = document.querySelector("[aria-label='Number 11 is forced by Drought-break shortlist']");

    expect(droughtRow?.getAttribute("aria-pressed")).toBe("true");
    expect(droughtRow?.getAttribute("data-external-selected")).toBe("true");
    expect(droughtRow?.getAttribute("disabled")).not.toBeNull();
    expect(droughtRow?.textContent).toContain("Drought-break shortlist");
  });

  it("flags user-excluded numbers as unavailable for forced inclusion", () => {
    const html = renderToStaticMarkup(
      React.createElement(NumberTrendsTable, {
        trends: buildTrends(),
        selected: [7],
        excludedNumbers: [11],
      }),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const excludedRow = document.querySelector("[aria-label='Number 11 is unavailable because it is excluded']");

    expect(document.body.textContent).toContain("Active exclusions: 11");
    expect(excludedRow?.getAttribute("aria-pressed")).toBe("false");
    expect(excludedRow?.getAttribute("data-user-excluded")).toBe("true");
    expect(excludedRow?.getAttribute("disabled")).not.toBeNull();
    expect(excludedRow?.textContent).toContain("Excluded");
  });

  it("documents the trend arrow delta in the user manual", () => {
    const manual = readProjectFile("public/user-manual.html");

    expect(manual).toContain('id="number-trends-table"');
    expect(manual).toContain("Δ 3→13");
    expect(manual).toContain("(3D count / 3 × 100) - (13D count / 13 × 100)");
    expect(manual).toContain("percentage-point difference");
    expect(manual).toContain("not a calibrated probability");
  });
});

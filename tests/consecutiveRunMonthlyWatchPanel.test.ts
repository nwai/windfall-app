import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ConsecutiveRunMonthlyWatchPanel from "../src/components/ConsecutiveRunMonthlyWatchPanel";
import { analyzeConsecutiveRunMonthlyWatch } from "../src/lib/consecutiveRunMonthlyWatch";
import type { Draw } from "../src/types";

const safeNumbers = [1, 5, 9, 13, 17, 21, 25, 29];
const runNumbers = [1, 2, 3, 13, 17, 21, 25, 29];

const scheduledMonth = (year: number, month: number, eventOrdinals: readonly number[] = []): Draw[] => {
  const rows: Draw[] = [];
  const lastDay = new Date(year, month, 0).getDate();
  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month - 1, day);
    if (![1, 3, 5].includes(date.getDay())) continue;
    const values = eventOrdinals.includes(rows.length + 1) ? runNumbers : safeNumbers;
    rows.push({
      date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      main: values.slice(0, 6),
      supp: values.slice(6),
    });
  }
  return rows;
};

describe("ConsecutiveRunMonthlyWatchPanel", () => {
  it("shows first-occurrence denominators, exact baseline provenance, and no generation claim", () => {
    const analysis = analyzeConsecutiveRunMonthlyWatch([
      ...scheduledMonth(2024, 8, [13]),
      ...scheduledMonth(2024, 9),
      ...scheduledMonth(2024, 10, [13]),
    ], { now: "2024-11-01" });
    const html = renderToStaticMarkup(React.createElement(ConsecutiveRunMonthlyWatchPanel, { analysis }));

    expect(html).toContain("CRMW-1");
    expect(html).toContain("Observe-only · mains + supps");
    expect(html).toContain("No generation influence");
    expect(html).toContain("D13 · FIRST-RUN WATCH");
    expect(html).toContain("2/3");
    expect(html).toContain("very thin sample");
    expect(html).toContain("unordered 8-from-45 combinations");
    expect(html).toContain("Drought key cross-check");
    expect(html).toContain("CRMW-DK-1");
    expect(html).toContain("Strict top 8");
    expect(html).toContain("Empirical top 8");
    expect(html).toContain("Expanding all-prior-real-history replay");
    expect(html).toContain("not extra Signal Confluence support");
    expect(html).toContain("must not be counted as independent votes");
  });

  it("is wired into Validation as one documented observe-only evidence family", () => {
    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const manual = readFileSync(resolve(process.cwd(), "public/user-manual.html"), "utf8");

    expect(app).toContain('panelId="consecutive-run-monthly-watch"');
    expect(app).toContain("analyzeConsecutiveRunMonthlyWatch(realHistory");
    expect(app.indexOf('id="workflow-validation"')).toBeLessThan(
      app.indexOf('panelId="consecutive-run-monthly-watch"'),
    );
    expect(app).toContain("<ConsecutiveRunMonthlyWatchPanel analysis={consecutiveRunMonthlyWatch} />");
    expect(manual).toContain('id="consecutive-run-monthly-watch"');
    expect(manual).toContain("One evidence family");
    expect(manual).toContain("Drought key cross-check");
    expect(manual).toContain("does not sample, rank, reject, boost or construct candidates");
  });
});

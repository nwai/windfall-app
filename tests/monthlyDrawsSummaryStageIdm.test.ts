import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("MonthlyDrawsSummaryPanel Stage IDM wiring", () => {
  it("renders and emits Stage IDM state", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/MonthlyDrawsSummaryPanel.tsx"), "utf8");

    expect(source).toContain("analyzeStageIdealDrawModel");
    expect(source).toContain("onStageIdealDrawStateChange");
    expect(source).toContain("Stage IDM");
    expect(source).toContain("Expected Draw Count");
  });
});

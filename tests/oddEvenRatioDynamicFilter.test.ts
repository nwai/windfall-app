import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

describe("dynamic odd/even ratio filter wiring", () => {
  it("shows source evidence separately from the rebalanced active share and quota", () => {
    const appSource = readProjectFile("src/App.tsx");

    expect(appSource).toContain("buildOddEvenRatioActiveShares");
    expect(appSource).toContain("Source: {count} draw");
    expect(appSource).toContain("Active: {activeShare.toFixed(1)}% · quota target {target}/{numCandidates}");
    expect(appSource).toContain("Selected ratios are rebalanced to 100% from their relative WFMQYH draw counts.");
  });

  it("records source, active share, and exact requested quota in Trace", () => {
    const appSource = readProjectFile("src/App.tsx");

    expect(appSource).toContain("ratioSharesForTrace");
    expect(appSource).toContain("ratioQuotasForTrace");
    expect(appSource).toContain("% active, target ${target}/${options.requested}");
  });

  it("documents proportional redistribution and downstream shortfalls", () => {
    const manual = readProjectFile("public/user-manual.html");

    expect(manual).toContain("The <strong>Active</strong> share is recalculated across only the ratios still selected");
    expect(manual).toContain("largest-remainder rounding");
    expect(manual).toContain("later hard filters can still cause a shortfall");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP_SOURCE = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");

describe("DGA simulation strip user exclusion locks", () => {
  it("feeds WFMQYH user exclusions into both DGA simulation strips", () => {
    const calls = APP_SOURCE.match(/<DGASimulateStrip[\s\S]*?\/>/g) ?? [];

    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls.filter((call) => call.includes("excludedNumbers={excludedNumbers}")).length).toBeGreaterThanOrEqual(2);
  });

  it("keeps excluded DGA strip numbers out of simulation state", () => {
    expect(APP_SOURCE).toContain("() => removeUserExcludedNumbers(normalizeDgaSelectedNumbers(userSelectedNumbers), excludedNumbers)");
    expect(APP_SOURCE).toContain("const sorted = removeUserExcludedNumbers(normalizeDgaSelectedNumbers(nums), excludedNumbers);");
    expect(APP_SOURCE).toContain("const simulationNumbers = sorted.slice(0, 8);");
  });
});

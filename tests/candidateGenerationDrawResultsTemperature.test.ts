import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readAppSource = () => readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("Candidate Generation draw-result temperature wiring", () => {
  it("colors Ending Digit Limits and Decade Bias draw-result rows with the shared temperature scale", () => {
    const appSource = readAppSource();

    expect(appSource).toContain('import { drawResultTemperatureStyle } from "./lib/drawResultTemperature";');

    const helperUsages = appSource.match(/drawResultTemperatureStyle\(drawCount, maxDrawResultCount\)/g) ?? [];
    expect(helperUsages).toHaveLength(2);

    const maxCountDeclarations = appSource.match(/const maxDrawResultCount = Math\.max\(/g) ?? [];
    expect(maxCountDeclarations).toHaveLength(2);
    expect(appSource).toContain("Observed WFMQYH draw-result count");
  });
});

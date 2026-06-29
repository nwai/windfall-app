import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Odd/even ratio selection state", () => {
  it("filters selected WFMQYH ratios against the freshly computed ratio options", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(appSource).toContain("const nextRatioOptions = computeOddEvenRatios(realFilteredHistory);");
    expect(appSource).toContain("setRatioOptions(nextRatioOptions);");
    expect(appSource).toContain("nextRatioOptions.some((opt) => opt.ratio === r)");
    expect(appSource).not.toContain("setSelectedRatios((ratios) => ratios.filter((r) => ratioOptions.some((opt) => opt.ratio === r)))");
  });
});

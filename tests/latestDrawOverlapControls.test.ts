import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Latest-draw overlap controls", () => {
  it("shows and enforces the newest-draw union pool maximum for repeat-union M", () => {
    const appSource = source("src/App.tsx");
    const manualSource = source("public/user-manual.html");

    expect(appSource).toContain("const repeatUnionUniqueCount = useMemo");
    expect(appSource).toContain("realFilteredHistory.slice(realFilteredHistory.length - effectiveRepeatWindowSizeW)");
    expect(appSource).toContain("const repeatUnionCandidateMax = Math.min(8, repeatUnionUniqueCount)");
    expect(appSource).toContain("setMinFromRecentUnionM((previous)");
    expect(appSource).toContain("max={repeatUnionCandidateMax}");
    expect(appSource).toContain("Unique numbers in this newest-draw pool");
    expect(appSource).toContain("Usable minimum range is");

    expect(manualSource).toContain("The control shows the count of <strong>unique numbers</strong>");
    expect(manualSource).toContain("the smaller of that unique count and the candidate's eight total number slots");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("src/App.tsx", "utf8");

describe("RwR45 Generated Candidates wiring", () => {
  it("routes Generated Candidates through the RwR45 generator when the mode is enabled", () => {
    expect(appSource).toContain("generateRwR45Candidates");
    expect(appSource).toContain("rwr45Enabled");
    expect(appSource).toContain("setRwr45Enabled");
    expect(appSource).toContain("if (rwr45Enabled)");
    expect(appSource).toMatch(/summarizeOddEvenRatios\(\s*processedCandidates,\s*RWR45_CANDIDATE_COUNT/);
  });

  it("passes active forced inclusions and combined exclusions into RwR45", () => {
    const rwr45Block = appSource.match(/if \(rwr45Enabled\) \{[\s\S]*?return;\s*\}/)?.[0] ?? "";

    expect(rwr45Block).toContain("rwr45ExcludedNumbers");
    expect(rwr45Block).toContain("allExclusions");
    expect(rwr45Block).toContain("getMianHardExclusions()");
    expect(rwr45Block).toContain("forcedNumbers: generationForcedNumbers");
    expect(rwr45Block).toContain("excludedNumbers: rwr45ExcludedNumbers");
  });

  it("passes the RwR45 toggle state into GeneratedCandidatesPanel", () => {
    const panelBlock = appSource.match(/<GeneratedCandidatesPanel[\s\S]*?\/>/)?.[0] ?? "";

    expect(panelBlock).toContain("rwr45Enabled={rwr45Enabled}");
    expect(panelBlock).toContain("setRwr45Enabled={setRwr45Enabled}");
  });
});

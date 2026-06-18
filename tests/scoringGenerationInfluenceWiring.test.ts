import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (path: string): string => (
  readFileSync(resolve(process.cwd(), path), "utf8")
);

describe("Scoring Diagnostics generation influence wiring", () => {
  it("defaults the generation influence off and labels it as diagnostic evidence", () => {
    const appSource = readProjectFile("src/App.tsx");

    expect(appSource).toContain('useState<ScoringGenerationInfluence>("off")');
    expect(appSource).toContain("Scoring diagnostics influence");
    expect(appSource).toContain("diagnostic evidence weighting");
    expect(appSource).toContain("not a probability");
    expect(appSource).not.toMatch(/scoring diagnostics influence.*predict/i);
  });

  it("passes the selected influence into the diagnostics panel and trace", () => {
    const appSource = readProjectFile("src/App.tsx");

    expect(appSource).toContain("generationInfluence={scoringGenerationInfluence}");
    expect(appSource).toContain("Scoring Diagnostics influence changed:");
    expect(appSource).toContain("affects generation weighting");
  });

  it("passes the serializable scoring profile through worker and fallback paths", () => {
    const appSource = readProjectFile("src/App.tsx");
    const workerSource = readProjectFile("src/workers/generateWorker.ts");
    const hookSource = readProjectFile("src/hooks/useGenerateWorker.ts");

    expect(appSource).toContain("scoringGenerationProfile: activeScoringGenerationProfile");
    expect(workerSource).toContain("scoringGenerationProfile?: ScoringGenerationProfile");
    expect(workerSource).toContain("args.scoringGenerationProfile");
    expect(hookSource).toContain("args.scoringGenerationProfile");
  });

  it("keeps odd/even quota application after score-aware survivor sorting", () => {
    const appSource = readProjectFile("src/App.tsx");
    const scoreSortIndex = appSource.indexOf("b.scoreEvidence");
    const quotaIndex = appSource.indexOf("applyOddEvenRatioQuotas(processedCandidates, numCandidates");

    expect(scoreSortIndex).toBeGreaterThan(0);
    expect(quotaIndex).toBeGreaterThan(scoreSortIndex);
  });
});

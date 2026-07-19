import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (path: string): string => (
  readFileSync(resolve(process.cwd(), path), "utf8")
);

describe("generation survivor selection truthfulness", () => {
  it("does not use selected or recent hits as hidden survivor tie-breakers", () => {
    const appSource = readProjectFile("src/App.tsx");

    expect(appSource).toContain("function getSurvivorSelectionState()");
    expect(appSource).toContain("function compareFinalSurvivorCandidates");
    expect(appSource).toContain("function buildSurvivorSelectionTrace");
    expect(appSource).toContain("selHitsEnabled: false");
    expect(appSource).toContain("recentHitsEnabled: false");
    expect(appSource).toContain("rankingWeights.selHitsEnabled && userSelectedNumbers.length > 0");
    expect(appSource).toContain("rankingWeights.recentHitsEnabled && hasRecentDraw");
    expect(appSource).toContain("survivorState.selected && b.selHits !== a.selHits");
    expect(appSource).toContain("survivorState.recent && b.recentHits !== a.recentHits");
    expect(appSource).not.toContain("if (b.selHits !== a.selHits) return b.selHits - a.selHits;");
    expect(appSource).not.toContain("if (b.recentHits !== a.recentHits) return b.recentHits - a.recentHits;");
  });

  it("traces the active final survivor-selection signals", () => {
    const appSource = readProjectFile("src/App.tsx");
    const manual = readProjectFile("public/user-manual.html");

    expect(appSource).toContain("survivor selection:");
    expect(appSource).toContain("no active survivor-ranking signals; generated order preserved");
    expect(appSource.match(/sort\(compareFinalSurvivorCandidates\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(appSource.match(/buildSurvivorSelectionTrace\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(manual).toContain("Final survivor selection");
    expect(manual).toContain("Trace");
    expect(manual).toContain("SelHits and RecentHits default <strong>OFF</strong>");
    expect(manual).toContain("silently using selected-number or latest-draw overlap as hidden tie-breakers");
  });

  it("persists the explicit SelHits and RecentHits survivor switches in presets", () => {
    const appSource = readProjectFile("src/App.tsx");
    const presetsSource = readProjectFile("src/lib/presets.ts");

    expect(appSource).toContain("rankingWeights: { ...rankingWeights }");
    expect(appSource).toContain("selHitsEnabled: s.rankingWeights?.selHitsEnabled ?? false");
    expect(appSource).toContain("recentHitsEnabled: s.rankingWeights?.recentHitsEnabled ?? false");
    expect(presetsSource).toContain("selHitsEnabled?: boolean");
    expect(presetsSource).toContain("recentHitsEnabled?: boolean");
    expect(presetsSource).toContain("selHitsEnabled: !!snapshot.rankingWeights?.selHitsEnabled");
    expect(presetsSource).toContain("recentHitsEnabled: !!snapshot.rankingWeights?.recentHitsEnabled");
  });
});

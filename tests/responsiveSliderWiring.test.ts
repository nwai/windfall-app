import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

describe("responsive slider wiring", () => {
  it("uses the shared HIG slider for heavy Candidate Generation Setup sliders", () => {
    const app = source("src/App.tsx");
    const hardFiltersStart = app.indexOf('title="Hard Filters"');
    const hardFiltersEnd = app.indexOf('title="Active Setup Summary"', hardFiltersStart);
    const engineStart = app.indexOf('title="Engine & Ranking"');
    const engineEnd = app.indexOf('title="Number Biases"', engineStart);
    expect(app).toContain("HigSlider");
    expect(hardFiltersStart).toBeGreaterThanOrEqual(0);
    expect(hardFiltersEnd).toBeGreaterThan(hardFiltersStart);
    expect(engineStart).toBeGreaterThanOrEqual(0);
    expect(engineEnd).toBeGreaterThan(engineStart);

    const hardFiltersBlock = app.slice(hardFiltersStart, hardFiltersEnd);
    const engineBlock = app.slice(engineStart, engineEnd);

    expect(engineBlock).toContain("onCommit={setLambda}");
    expect(engineBlock).toContain("Readiness (Rdy) Scoring");
    expect(hardFiltersBlock.match(/<HigSlider/g)).toHaveLength(4);
    expect(hardFiltersBlock).toContain("READINESS_HARD_FILTER_KEYS.map");
    expect(hardFiltersBlock).not.toContain("Readiness (Rdy) Scoring");
    expect(hardFiltersBlock).not.toContain('type="range"');
  });
});

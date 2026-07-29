import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Core Filters layout", () => {
  it("keeps Entropy, Hamming, and Jaccard as three peer columns in Hard Filters", () => {
    const app = source("src/App.tsx");
    const css = source("src/index.css");

    const coreFiltersIndex = app.indexOf("Entropy & Distance");
    const readinessIndex = app.indexOf("Readiness component hard filters", coreFiltersIndex);
    expect(coreFiltersIndex).toBeGreaterThanOrEqual(0);
    expect(readinessIndex).toBeGreaterThan(coreFiltersIndex);

    const coreFiltersBlock = app.slice(coreFiltersIndex, readinessIndex);
    expect(coreFiltersBlock).toContain('className="windfall-core-filter-grid"');
    expect(coreFiltersBlock).toContain('className="windfall-core-filter-control"');
    expect(coreFiltersBlock).toContain("Entropy (threshold");
    expect(coreFiltersBlock).toContain("Hamming (min");
    expect(coreFiltersBlock).toContain("Jaccard (max");

    expect(css).toContain(".windfall-core-filter-grid");
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(css).toContain(".windfall-core-filter-control");
  });

  it("keeps Rdy weight scoring out of the Hard Filters panel", () => {
    const app = source("src/App.tsx");
    const hardFiltersStart = app.indexOf('title="Hard Filters"');
    const hardFiltersEnd = app.indexOf('title="Active Setup Summary"', hardFiltersStart);
    const engineStart = app.indexOf('title="Engine & Ranking"');
    const engineEnd = app.indexOf('title="Number Biases"', engineStart);

    expect(hardFiltersStart).toBeGreaterThanOrEqual(0);
    expect(hardFiltersEnd).toBeGreaterThan(hardFiltersStart);
    expect(engineStart).toBeGreaterThanOrEqual(0);
    expect(engineEnd).toBeGreaterThan(engineStart);

    const hardFiltersBlock = app.slice(hardFiltersStart, hardFiltersEnd);
    const engineBlock = app.slice(engineStart, engineEnd);

    expect(hardFiltersBlock).not.toContain("Readiness (Rdy) Scoring");
    expect(engineBlock).toContain("Readiness (Rdy) Scoring");
    expect(engineBlock).toContain('gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))"');
    expect(engineBlock).toContain("RDY_WEIGHT_KEYS.map");
  });
});

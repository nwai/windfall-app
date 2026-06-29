import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Core Filters layout", () => {
  it("keeps Entropy, Hamming, and Jaccard as three peer columns in Candidate Generation Setup", () => {
    const app = source("src/App.tsx");
    const css = source("src/index.css");

    const coreFiltersIndex = app.indexOf("Core Filters");
    const readinessIndex = app.indexOf("Readiness (Rdy) Scoring", coreFiltersIndex);
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
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const blockBetween = (source: string, start: string, end: string): string => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
};

describe("Candidate Generation Influences constraints layout", () => {
  it("groups generation constraints into compact, named control sections without disconnecting existing controls", () => {
    const appSource = readRepoFile("src/App.tsx");
    const cssSource = readRepoFile("src/index.css");
    const influencesBlock = blockBetween(
      appSource,
      'panelId="candidate-generation-influences"',
      '<TracePanel',
    );
    const constraintsBlock = blockBetween(
      influencesBlock,
      "Generation Constraints",
      "{/* Column 2: Composition & Recency + OGA Bias */}",
    );

    expect(constraintsBlock).toContain("Ending Digit Limits");
    expect(constraintsBlock).toContain("Decade Bias");
    expect(constraintsBlock).toContain("Shape / Bucket Quotas");
    expect(constraintsBlock).toContain("Monthly Timing Bias");

    expect(constraintsBlock).toContain('className="windfall-constraint-sections"');
    expect(constraintsBlock).toContain('className="windfall-constraint-section__grid windfall-constraint-section__grid--ending"');
    expect(constraintsBlock).toContain('className="windfall-constraint-section__grid windfall-constraint-section__grid--decade"');
    expect(cssSource).toContain(".windfall-constraint-sections");
    expect(cssSource).toContain(".windfall-constraint-section__grid--ending");
    expect(cssSource).toContain(".windfall-constraint-section__grid--decade");

    expect(constraintsBlock).toContain("exactConstraintRows.map");
    expect(constraintsBlock).toContain("mainDecadeConstraintRows.map");
    expect(constraintsBlock).toContain("MRB_BUCKET_KEYS.map");
    expect(constraintsBlock).toContain("monthEndCarryOverBiasEnabled");
    expect(constraintsBlock).toContain("acceptanceNeedsEnabled");
    expect(constraintsBlock).toContain("digitWidthConstraintEnabled");
  });
});

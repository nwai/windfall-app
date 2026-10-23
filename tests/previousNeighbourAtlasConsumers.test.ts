import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string): string => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Previous Neighbour Atlas shared consumers", () => {
  it("exposes one observe-only snapshot across setup, builder, generation trace, monthly context, and DGA", () => {
    const app = read("src/App.tsx");
    const monthly = read("src/components/MonthlyDrawsSummaryPanel.tsx");
    const generated = read("src/components/candidates/GeneratedCandidatesPanel.tsx");
    const dga = read("src/components/DGAVisualizer.tsx");

    expect(app).toContain('label: "Neighbour Atlas"');
    expect(app).toContain('data-testid="latest-neighbour-atlas-reference"');
    expect(app).toContain("Neighbour Atlas reference (observe-only)");
    expect(app).toContain("Post-generation observation only; Atlas did not influence construction, filtering, or survivor ranking.");
    expect(app).toContain('data-testid="dga-neighbour-atlas-overlay-control"');
    expect(monthly).toContain('data-testid="monthly-neighbour-atlas-context"');
    expect(generated).toContain('data-testid="generated-candidates-neighbour-atlas"');
    expect(dga).toContain("observe-only next-draw overlay");
  });

  it("documents the shared-family boundary and every new consumer", () => {
    const manual = read("public/user-manual.html");

    expect(manual).toContain("Neighbour Atlas candidate reference");
    expect(manual).toContain("Neighbour Atlas draw-stage comparison");
    expect(manual).toContain("Neighbour Atlas next-column overlay");
    expect(manual).toContain("Neighbour Atlas usage audit");
    expect(manual).toContain("never replace the automatic history replay");
  });
});

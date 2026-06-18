import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = (): string => readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const manualSource = (): string => readFileSync(resolve(process.cwd(), "public/user-manual.html"), "utf8");

describe("Previous ±1/±2 latest-draw constraint wiring", () => {
  it("uses selected latest-draw ±1/±2 targets as forced generation numbers", () => {
    const app = appSource();

    expect(app).toContain("previousNeighbourConstraintNumbers");
    expect(app).toContain("Latest Draw ±1/±2 Constraint Builder");
    expect(app).toContain("Required ±1/±2 targets");
    expect(app).toContain("exact -2, -1, +1, or +2 target numbers");
    expect(app).toContain("windfall-previous-neighbour-target-value");
    expect(app).toContain("Latest draw used");
    expect(app).toContain("Latest main numbers");
    expect(app).toContain("Latest supp numbers");
    expect(app).toContain("Latest draw ±1/±2 legend");
    expect(app).toContain("Duplicate target");
    expect(app).toContain("Selected required target");
    expect(app).toContain("generationForcedNumbers");
    expect(app).toContain("generateCandidates(");
    expect(app).toContain("generationForcedNumbers,");
    expect(app).not.toContain("Current 13-candidate quota preview");
    expect(app).not.toContain("Previous ±1 shape guard");
  });

  it("documents the latest-draw ±1/±2 colour legend in the user manual", () => {
    const manual = manualSource();

    expect(manual).toContain("Latest Draw ±1/±2 Constraint Builder");
    expect(manual).toContain("Colour and status legend");
    expect(manual).toContain("White source pills");
    expect(manual).toContain("Amber target buttons");
    expect(manual).toContain("Green target buttons");
    expect(manual).toContain("Magenta numbers");
    expect(manual).toContain("not a probability or prediction signal");
  });
});

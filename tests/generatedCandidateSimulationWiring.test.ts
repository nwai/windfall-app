import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readAppSource = () => readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("generated candidate simulation wiring", () => {
  it("replaces stale shared strip selections without overwriting the manual prize simulation when simulating a generated candidate", () => {
    const appSource = readAppSource();
    const handlerStart = appSource.indexOf("const handleSimulateCandidate = (idx: number) => {");
    const handlerEnd = appSource.indexOf("const handleSimulatePickSixManual", handlerStart);
    const handlerBlock = appSource.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerBlock).toContain("const simulatedNumbers = [...cand.main, ...cand.supp].slice(0, 8);");
    expect(handlerBlock).toContain("setUserSelectedNumbers(simulatedNumbers);");
    expect(handlerBlock).not.toContain("setManualSimSelected(");
    expect(handlerBlock.indexOf("setUserSelectedNumbers(simulatedNumbers);")).toBeLessThan(handlerBlock.indexOf("setSimulatedDraw("));
  });

  it("replaces stale shared strip selections without overwriting the manual prize simulation when simulating an eight-number generator list", () => {
    const appSource = readAppSource();
    const handlerStart = appSource.indexOf("const handleSimulatePickSixManual = (nums: number[]) => {");
    const handlerEnd = appSource.indexOf("const activeSimulatedDraw", handlerStart);
    const handlerBlock = appSource.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerBlock).toContain("const simulatedNumbers = nums.slice(0, 8);");
    expect(handlerBlock).toContain("setUserSelectedNumbers(simulatedNumbers);");
    expect(handlerBlock).not.toContain("setManualSimSelected(");
    expect(handlerBlock.indexOf("setUserSelectedNumbers(simulatedNumbers);")).toBeLessThan(handlerBlock.indexOf("setSimulatedDraw("));
  });

  it("keeps the manual prize simulation out of app-wide simulation overlays and conflict ledgers", () => {
    const appSource = readAppSource();

    expect(appSource).not.toContain("Generated-candidate simulation\", numbers: manualSimSelected");
    expect(appSource).not.toContain("setSimNumbers(manualSimSelected");
    expect(appSource).not.toContain("manual simulation drives heatmap/NextHotBlocks overlays only");
  });
});

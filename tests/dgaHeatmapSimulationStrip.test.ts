import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readAppSource = () => readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("DGA heatmap simulation strip wiring", () => {
  it("uses the shared user-selected numbers in every DGA user selection strip", () => {
    const appSource = readAppSource();
    const heatmapStart = appSource.indexOf('title="DGA heatmap"');
    const gridStart = appSource.indexOf('title="DGA grid"');

    expect(heatmapStart).toBeGreaterThanOrEqual(0);
    expect(gridStart).toBeGreaterThan(heatmapStart);

    const heatmapBlock = appSource.slice(heatmapStart, gridStart);
    const gridBlock = appSource.slice(gridStart, appSource.indexOf("<DGAMonthlyBucketStateGrid", gridStart));
    const monthlyBucketBlock = appSource.slice(appSource.indexOf("<DGAMonthlyBucketStateGrid", gridStart), appSource.indexOf("</CollapsibleSection>", gridStart));
    const handlerStart = appSource.indexOf("const handleDgaStripChange");
    const handlerBlock = appSource.slice(handlerStart, appSource.indexOf("}, [", handlerStart));

    expect(heatmapBlock).toContain("simulation strip");
    expect(heatmapBlock).toContain("<DGASimulateStrip");
    expect(heatmapBlock).toContain("selectedNumbers={dgaStripSelectedNumbers}");
    expect(heatmapBlock).toContain("onChange={handleDgaStripChange}");
    expect(heatmapBlock).not.toContain("<UserExclusionsStrip");
    expect(gridBlock).toContain("selectedNumbers={dgaStripSelectedNumbers}");
    expect(gridBlock).toContain("onChange={handleDgaStripChange}");
    expect(monthlyBucketBlock).toContain("selectedNumbers={dgaStripSelectedNumbers}");
    expect(handlerBlock).toContain("setUserSelectedNumbers(sorted);");
    expect(handlerBlock).toContain("const simulationNumbers = sorted.slice(0, 8);");
  });

  it("can mirror DGA strip selections into the latest draw ±1/±2 constraint builder", () => {
    const appSource = readAppSource();
    const gridStart = appSource.indexOf('title="DGA grid"');
    const monthlyGridStart = appSource.indexOf("<DGAMonthlyBucketStateGrid", gridStart);
    const gridBlock = appSource.slice(gridStart, monthlyGridStart);

    expect(appSource).toContain("mirrorDgaStripToPreviousNeighbour");
    expect(appSource).toContain("applyDgaStripMirrorToPreviousNeighbour");
    expect(appSource).toContain("setPreviousNeighbourConstraintNumbers(");
    expect(gridBlock).toContain("Mirror strip to ±1/±2 builder");
    expect(gridBlock).toContain("aria-pressed={mirrorDgaStripToPreviousNeighbour}");
    expect(gridBlock).toContain("only valid latest-draw ±1/±2 targets");
  });

  it("keeps active DGA strip simulation aligned with shared user selections", () => {
    const appSource = readAppSource();
    const effectStart = appSource.indexOf('if (simSource !== "dga-strip") return;');
    const effectBlock = appSource.slice(effectStart, appSource.indexOf("}, [dgaStripSelectedNumbers", effectStart));

    expect(effectStart).toBeGreaterThanOrEqual(0);
    expect(effectBlock).toContain("const simulationNumbers = dgaStripSelectedNumbers.slice(0, 8);");
    expect(effectBlock).toContain("setSimulatedDraw(null);");
    expect(effectBlock).toContain("setSimSource(\"none\");");
    expect(effectBlock).toContain("main: simulationNumbers.slice(0, 6)");
    expect(effectBlock).toContain("supp: simulationNumbers.slice(6, 8)");
  });

  it("aligns heatmap strip rows to the heatmap canvas row gutter", () => {
    const appSource = readAppSource();
    const heatmapStart = appSource.indexOf('title="DGA heatmap"');
    const gridStart = appSource.indexOf('title="DGA grid"');
    const heatmapBlock = appSource.slice(heatmapStart, gridStart);

    expect(appSource).toContain("const DGA_HEATMAP_GUTTER = 15");
    expect(heatmapBlock).toContain("gutter={DGA_HEATMAP_GUTTER}");
    expect(heatmapBlock).toContain("topOffsetPx={DGA_HEATMAP_GUTTER}");
    expect(heatmapBlock).toContain("includeHeaderSpacer={false}");
  });

  it("aligns the main DGA grid strip to the table header without adding row drift", () => {
    const appSource = readAppSource();
    const gridStart = appSource.indexOf('title="DGA grid"');
    const monthlyGridStart = appSource.indexOf("<DGAMonthlyBucketStateGrid", gridStart);
    const gridBlock = appSource.slice(gridStart, monthlyGridStart);

    expect(gridBlock).toContain("<DGASimulateStrip");
    expect(gridBlock).toContain("cellSize={DGA_CELL_SIZE}");
    expect(gridBlock).toContain("topOffsetPx={DGA_CELL_SIZE}");
    expect(gridBlock).toContain("includeHeaderSpacer={false}");
  });
});

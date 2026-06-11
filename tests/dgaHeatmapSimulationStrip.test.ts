import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readAppSource = () => readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("DGA heatmap simulation strip wiring", () => {
  it("uses the DGA simulation strip beside the heatmap instead of user exclusions", () => {
    const appSource = readAppSource();
    const heatmapStart = appSource.indexOf('title="DGA heatmap"');
    const gridStart = appSource.indexOf('title="DGA grid"');

    expect(heatmapStart).toBeGreaterThanOrEqual(0);
    expect(gridStart).toBeGreaterThan(heatmapStart);

    const heatmapBlock = appSource.slice(heatmapStart, gridStart);
    const gridBlock = appSource.slice(gridStart, appSource.indexOf("<DGAMonthlyBucketStateGrid", gridStart));

    expect(heatmapBlock).toContain("simulation strip");
    expect(heatmapBlock).toContain("<DGASimulateStrip");
    expect(heatmapBlock).toContain("selectedNumbers={dgaStripSelected}");
    expect(heatmapBlock).toContain("onChange={handleDgaStripChange}");
    expect(heatmapBlock).not.toContain("<UserExclusionsStrip");
    expect(gridBlock).toContain("onChange={handleDgaStripChange}");
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

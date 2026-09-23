import { describe, expect, it } from "vitest";

import {
  buildDrawSlotAxisLabels,
  buildTemperatureHeatmapColumnLabels,
  getTemperatureHeatmapDisplayColumnCount,
  getTemperatureOverlayBucketIndex,
  getTemperatureOverlayLetter,
} from "../src/components/TemperatureHeatmap";
import {
  normalizeHeatmapLegendHiddenIndexes,
  toggleHeatmapLegendHiddenIndex,
} from "../src/components/HeatmapLegendBar";
import type { Draw } from "../src/types";

const draw = (date: string, isSimulated = false): Draw => ({
  date,
  main: [1, 2, 3, 4, 5, 6],
  supp: [7, 8],
  isSimulated,
});

describe("TemperatureHeatmap draw-slot x-axis labels", () => {
  it("labels each chronological draw by its ordinal inside the calendar month", () => {
    const labels = buildDrawSlotAxisLabels([
      draw("7/3/26"),
      draw("6/3/26"),
      draw("7/6/26"),
      draw("6/1/26"),
      draw("7/8/26", true),
    ]);

    expect(labels).toEqual(["1", "2", "1", "2", "3"]);
  });

  it("can append a non-historical next-draw planning column", () => {
    const labels = buildTemperatureHeatmapColumnLabels([
      draw("6/1/26"),
      draw("6/3/26"),
    ], true);

    expect(labels).toEqual(["1", "2", "Next"]);
    expect(getTemperatureHeatmapDisplayColumnCount(2, true)).toBe(3);
    expect(getTemperatureHeatmapDisplayColumnCount(2, false)).toBe(2);
  });
});

describe("TemperatureHeatmap observe-only temperature badges", () => {
  it("maps temperature values into compact and detailed badge letters", () => {
    expect(getTemperatureOverlayLetter(getTemperatureOverlayBucketIndex(0.02), "detailed")).toBe("pR");
    expect(getTemperatureOverlayLetter(getTemperatureOverlayBucketIndex(0.52), "compact")).toBe("N");
    expect(getTemperatureOverlayLetter(getTemperatureOverlayBucketIndex(0.72), "detailed")).toBe("H");
    expect(getTemperatureOverlayLetter(getTemperatureOverlayBucketIndex(0.72), "compact")).toBe("H");
    expect(getTemperatureOverlayLetter(getTemperatureOverlayBucketIndex(0.99), "detailed")).toBe("V");
    expect(getTemperatureOverlayLetter(7, "off")).toBe("");
  });
});

describe("Temperature heatmap legend visibility filter", () => {
  it("toggles hidden bands while keeping at least one bucket visible", () => {
    expect(toggleHeatmapLegendHiddenIndex([], 1, 4)).toEqual([1]);
    expect(toggleHeatmapLegendHiddenIndex([1], 3, 4)).toEqual([1, 3]);
    expect(toggleHeatmapLegendHiddenIndex([1, 3], 1, 4)).toEqual([3]);
    expect(toggleHeatmapLegendHiddenIndex([0, 1, 2], 3, 4)).toEqual([0, 1, 2]);
    expect(normalizeHeatmapLegendHiddenIndexes([0, 1, 2, 3], 4)).toEqual([0, 1, 2]);
  });
});

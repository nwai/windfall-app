import { describe, expect, it } from "vitest";

import {
  getHeatmapColumnOpacity,
  normalizeHeatmapContextWindow,
} from "./heatmapContextWindow";

describe("normalizeHeatmapContextWindow", () => {
  it("returns null when the full range stays active", () => {
    expect(normalizeHeatmapContextWindow(12)).toBeNull();
    expect(normalizeHeatmapContextWindow(12, 0, 11)).toBeNull();
  });

  it("clamps partial ranges into the valid column bounds", () => {
    expect(normalizeHeatmapContextWindow(12, -4, 20)).toBeNull();
    expect(normalizeHeatmapContextWindow(12, 3, 30)).toEqual({ start: 3, end: 11 });
    expect(normalizeHeatmapContextWindow(12, 9, 4)).toEqual({ start: 9, end: 9 });
  });

  it("returns null when there are no columns", () => {
    expect(normalizeHeatmapContextWindow(0, 2, 4)).toBeNull();
  });
});

describe("getHeatmapColumnOpacity", () => {
  it("keeps active window columns fully opaque and dims context columns", () => {
    const window = normalizeHeatmapContextWindow(10, 3, 7);

    expect(getHeatmapColumnOpacity(2, window)).toBe(0.35);
    expect(getHeatmapColumnOpacity(3, window)).toBe(1);
    expect(getHeatmapColumnOpacity(7, window)).toBe(1);
    expect(getHeatmapColumnOpacity(8, window)).toBe(0.35);
  });

  it("clamps custom dim opacity into the 0..1 range", () => {
    const window = normalizeHeatmapContextWindow(10, 5, 9);

    expect(getHeatmapColumnOpacity(2, window, -1)).toBe(0);
    expect(getHeatmapColumnOpacity(2, window, 2)).toBe(1);
  });

  it("returns 1 when no contextual dimming window is active", () => {
    expect(getHeatmapColumnOpacity(4, null)).toBe(1);
  });

  it("keeps explicitly highlighted columns bright even outside the active window", () => {
    const window = normalizeHeatmapContextWindow(12, 3, 7);

    expect(getHeatmapColumnOpacity(11, window, 0.35, [11])).toBe(1);
    expect(getHeatmapColumnOpacity(2, window, 0.35, [11])).toBe(0.35);
  });
});

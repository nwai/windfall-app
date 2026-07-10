import { describe, expect, it } from "vitest";

import { buildDrawSlotAxisLabels } from "../src/components/TemperatureHeatmap";
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
});

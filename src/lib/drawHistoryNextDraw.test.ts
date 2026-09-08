import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { findNextHistoryDrawDate } from "./drawHistoryNextDraw";

const draw = (date: string): Draw => ({
  date,
  main: [1, 2, 3, 4, 5, 6],
  supp: [7, 8],
});

describe("findNextHistoryDrawDate", () => {
  it("targets the first missing scheduled draw after the latest recorded row", () => {
    const result = findNextHistoryDrawDate([
      draw("2026-08-31"),
      draw("2026-09-02"),
    ], "2026-09-05");

    expect(result.latestRecordedDate).toBe("2026-09-02");
    expect(result.targetDate).toBe("2026-09-04");
    expect(result.isFuture).toBe(false);
  });

  it("flags the next chronological draw as future when history is already current", () => {
    const result = findNextHistoryDrawDate([
      draw("2026-09-02"),
      draw("2026-09-04"),
    ], "2026-09-05");

    expect(result.latestRecordedDate).toBe("2026-09-04");
    expect(result.targetDate).toBe("2026-09-07");
    expect(result.isFuture).toBe(true);
  });

  it("ignores simulated rows when deciding the next real history date", () => {
    const result = findNextHistoryDrawDate([
      draw("2026-09-02"),
      { ...draw("2026-09-04"), isSimulated: true },
    ], "2026-09-05");

    expect(result.latestRecordedDate).toBe("2026-09-02");
    expect(result.targetDate).toBe("2026-09-04");
  });
});

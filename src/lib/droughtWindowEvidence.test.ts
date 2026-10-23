import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import {
  analyzeDroughtWindowEvidence,
  DROUGHT_WINDOW_EVIDENCE_VERSION,
} from "./droughtWindowEvidence";

const buildHistory = (count: number): Draw[] => {
  const draws: Draw[] = [];
  let time = new Date(2024, 0, 1).getTime();
  while (draws.length < count) {
    const date = new Date(time);
    if ([1, 3, 5].includes(date.getDay())) {
      const index = draws.length;
      const start = (index * 8) % 45;
      const numbers = Array.from({ length: 8 }, (__, offset) => ((start + offset) % 45) + 1);
      draws.push({
        date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
        main: numbers.slice(0, 6),
        supp: numbers.slice(6, 8),
      });
    }
    time += 86_400_000;
  }
  return draws;
};

describe("analyzeDroughtWindowEvidence", () => {
  it("groups nested WFMQYH windows into three dependence-controlled scales", () => {
    const result = analyzeDroughtWindowEvidence(buildHistory(180), 8);

    expect(result.version).toBe(DROUGHT_WINDOW_EVIDENCE_VERSION);
    expect(result.sources.map((source) => source.definition.scale)).toEqual([
      "short",
      "short",
      "medium",
      "medium",
      "long",
      "long",
    ]);
    expect(result.sources.filter((source) => source.thinWindow).map((source) => source.definition.id)).toEqual(["W", "F"]);
    expect(result.numbers.every((row) => row.scaleCount <= 3)).toBe(true);
  });

  it("does not count W and F as two distinct evidence scales", () => {
    const result = analyzeDroughtWindowEvidence(buildHistory(30), 45);
    const row = result.numbers[0];

    expect(row.memberships).toHaveLength(6);
    expect(row.sourceCount).toBe(6);
    expect(row.scaleCount).toBe(3);
  });

  it("excludes simulated rows from every source window", () => {
    const history = buildHistory(20);
    const result = analyzeDroughtWindowEvidence([
      ...history,
      { ...history[0], date: "2026-02-01", isSimulated: true },
    ], 8);

    expect(result.historyDraws).toBe(history.length);
    expect(result.sources.find((source) => source.definition.id === "H")?.effectiveDraws).toBe(history.length);
  });

  it("does not invent a top list when there are too few real draws for a transition", () => {
    const result = analyzeDroughtWindowEvidence(buildHistory(1), 8);

    expect(result.unionSize).toBe(0);
    expect(result.sources.every((source) => source.rows.length === 0)).toBe(true);
  });
});

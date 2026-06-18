import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import { analyzeScoringRankDrift } from "./scoringRankDrift";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("scoring rank drift", () => {
  const history = [
    draw("1/1/26", [1, 2, 3, 4, 5, 6], [7, 8]),
    draw("1/3/26", [1, 2, 11, 12, 21, 22], [31, 32]),
    draw("1/5/26", [1, 11, 21, 31, 41, 2], [12, 22]),
    draw("1/7/26", [3, 13, 23, 33, 43, 4], [14, 24]),
    draw("1/10/26", [5, 15, 25, 35, 45, 6], [16, 26]),
    draw("1/12/26", [7, 17, 27, 37, 8, 18], [28, 38]),
  ];

  it("builds strict walk-forward snapshots without using future draws", () => {
    const result = analyzeScoringRankDrift(history, {
      entity: "terminal-digits",
      key: "1",
      scope: "mains-plus-supps",
      startAfter: 2,
      step: "draw",
      filteredWindow: 2,
    });

    expect(result.snapshots.map((row) => row.drawCount)).toEqual([3, 4, 5, 6]);
    expect(result.snapshots[0]).toMatchObject({
      date: "1/5/26",
      drawCount: 3,
      rowKey: "1",
    });
    expect(result.provenance.validDraws).toBe(6);
    expect(result.provenance.usedSnapshots).toBe(4);
    expect(result.summary.firstRank).toBe(result.snapshots[0].rank);
    expect(result.summary.currentRank).toBe(result.snapshots.at(-1)?.rank);
  });

  it("supports numbers, terminal digits, digit sets, and straight-run selections", () => {
    expect(analyzeScoringRankDrift(history, {
      entity: "numbers",
      key: "1",
      startAfter: 2,
    }).selectedLabel).toBe("Number 1");

    expect(analyzeScoringRankDrift(history, {
      entity: "terminal-digits",
      key: "1",
      startAfter: 2,
    }).selectedLabel).toBe("Terminal digit 1");

    expect(analyzeScoringRankDrift(history, {
      entity: "digit-sets",
      key: "1,2",
      startAfter: 2,
    }).selectedLabel).toBe("Unique terminal digits 1,2");

    expect(analyzeScoringRankDrift(history, {
      entity: "straight-runs",
      key: "1,2",
      startAfter: 2,
    }).selectedLabel).toBe("Straight run 1,2");
  });

  it("reports diagnostic direction without probability language", () => {
    const result = analyzeScoringRankDrift(history, {
      entity: "terminal-digits",
      key: "1",
      startAfter: 2,
      filteredWindow: 2,
    });

    expect(["Progressing", "Regressing", "Flat"]).toContain(result.summary.direction);
    expect(result.summary.direction).not.toMatch(/prob|likely|due/i);
  });

  it("reports insufficient history when fewer than three snapshots are available", () => {
    const result = analyzeScoringRankDrift(history.slice(0, 3), {
      entity: "terminal-digits",
      key: "1",
      startAfter: 2,
    });

    expect(result.summary.direction).toBe("Insufficient history");
    expect(result.warnings).toContain("Fewer than three walk-forward snapshots are available.");
  });

  it("returns warnings for invalid selected keys", () => {
    const result = analyzeScoringRankDrift(history, {
      entity: "terminal-digits",
      key: "99",
      startAfter: 2,
    });

    expect(result.snapshots).toHaveLength(0);
    expect(result.summary.direction).toBe("Insufficient history");
    expect(result.warnings).toContain("Selected item was not found in the available walk-forward snapshots.");
  });

  it("supports every-three-draw and monthly stepping while retaining the final snapshot", () => {
    const everyThree = analyzeScoringRankDrift(history, {
      entity: "terminal-digits",
      key: "1",
      startAfter: 2,
      step: "weekly",
    });
    const monthly = analyzeScoringRankDrift(history, {
      entity: "terminal-digits",
      key: "1",
      startAfter: 2,
      step: "month",
    });

    expect(everyThree.snapshots.at(-1)?.drawCount).toBe(6);
    expect(monthly.snapshots.at(-1)?.drawCount).toBe(6);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildSignalConfluenceRows,
  normalizeSignalConfluenceNumbers,
  rankedStrength,
  sortSignalConfluenceRows,
} from "../src/lib/signalConfluence";

describe("signal confluence ledger", () => {
  it("caps repeated mentions from the same family while preserving the raw mention count", () => {
    const rows = buildSignalConfluenceRows([
      { number: 7, family: "drought", source: "strict", label: "Strict #1", strength: 1 },
      { number: 7, family: "drought", source: "empirical", label: "Emp #1", strength: 1 },
      { number: 7, family: "latest-neighbour", source: "latest", label: "+1", strength: 0.8 },
      { number: 8, family: "drought", source: "strict", label: "Strict #2", strength: 1 },
    ]);

    const seven = rows.find((row) => row.number === 7);
    const eight = rows.find((row) => row.number === 8);

    expect(seven?.rawMentionCount).toBe(3);
    expect(seven?.familyCount).toBe(2);
    expect(seven?.familyScore).toBeCloseTo(1.8, 5);
    expect(eight?.familyScore).toBe(1);
    expect(seven?.rank).toBeLessThan(eight?.rank ?? 99);
  });

  it("marks user state and moves active exclusions below equally supported available numbers", () => {
    const rows = buildSignalConfluenceRows([
      { number: 11, family: "scoring-numbers", source: "score", label: "Score #1", strength: 1 },
      { number: 12, family: "scoring-numbers", source: "score", label: "Score #2", strength: 1 },
    ], {
      excludedNumbers: [11],
      forcedNumbers: [12],
      userSelectedNumbers: [12],
    });

    const eleven = rows.find((row) => row.number === 11);
    const twelve = rows.find((row) => row.number === 12);

    expect(eleven?.isExcluded).toBe(true);
    expect(twelve?.isForced).toBe(true);
    expect(twelve?.isUserSelected).toBe(true);
    expect(twelve?.rank).toBeLessThan(eleven?.rank ?? 99);
  });

  it("normalizes valid lottery numbers and grades ranked support monotonically", () => {
    expect(normalizeSignalConfluenceNumbers([9, 9, 0, 46, 3, "4"])).toEqual([3, 9]);
    expect(rankedStrength(0, 8)).toBeGreaterThan(rankedStrength(7, 8));
  });

  it("sorts the Support column by raw mentions while keeping active exclusions below available numbers", () => {
    const rows = buildSignalConfluenceRows([
      { number: 4, family: "drought", source: "strict", label: "Strict #1", strength: 1 },
      { number: 8, family: "drought", source: "strict", label: "Strict #2", strength: 1 },
      { number: 8, family: "latest-neighbour", source: "latest", label: "+1", strength: 1 },
      { number: 12, family: "drought", source: "strict", label: "Strict #3", strength: 1 },
      { number: 12, family: "latest-neighbour", source: "latest", label: "+1", strength: 1 },
      { number: 12, family: "temperature", source: "hot", label: "Hot #1", strength: 1 },
    ], {
      excludedNumbers: [12],
    });

    const sortedDescending = sortSignalConfluenceRows(rows, "support", "descending");
    const sortedAscending = sortSignalConfluenceRows(rows, "support", "ascending");

    expect(sortedDescending[0].number).toBe(8);
    expect(sortedDescending.findIndex((row) => row.number === 12)).toBeGreaterThan(sortedDescending.findIndex((row) => row.number === 4));
    expect(sortedAscending[0].rawMentionCount).toBe(0);
    expect(sortedAscending.findIndex((row) => row.number === 12)).toBeGreaterThan(sortedAscending.findIndex((row) => row.number === 8));
  });
});

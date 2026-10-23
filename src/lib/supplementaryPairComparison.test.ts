import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import { buildDgaSuppSuggestion } from "./dgaSuppSuggestion";
import { rankSupplementaryPairs } from "./nextDrawEvidenceEnsemble";
import { buildSupplementaryPairComparison, orderSupplementaryPairRows, supplementaryPairForPolicy } from "./supplementaryPairComparison";

const selected = [1, 2, 3, 4, 5, 6, 7, 8];
const draw = (date: string, main: number[], supp: number[]): Draw => ({ date, main, supp });
const history = [
  draw("2026-06-01", [1, 2, 10, 11, 12, 13], [7, 8]),
  draw("2026-06-03", [1, 2, 14, 15, 16, 17], [3, 4]),
  draw("2026-06-05", [1, 2, 18, 19, 20, 21], [7, 8]),
];

describe("supplementary pair comparison", () => {
  it("uses the displayed sorting policies for replay and distinguishes no-evidence fallbacks", () => {
    const comparison = buildSupplementaryPairComparison(selected, history, history)!;
    expect(supplementaryPairForPolicy(comparison, "auto").pair).toEqual(buildDgaSuppSuggestion(selected, history, history)!.supp);
    expect(supplementaryPairForPolicy(comparison, "blend").pair).toEqual(rankSupplementaryPairs(selected, history)[0].numbers);
    const ordered = orderSupplementaryPairRows(comparison.rows, "co-draws");
    expect(supplementaryPairForPolicy(comparison, "co-draws").pair).toEqual(ordered[0].pair);
    expect(ordered[0].fullCoDraws).toBe(3);
    const empty = buildSupplementaryPairComparison(selected, [], [])!;
    for (const policy of ["auto", "blend", "co-draws"] as const) {
      expect(supplementaryPairForPolicy(empty, policy)).toEqual({ pair: [7, 8], numericalTie: false, noEvidenceFallback: true });
    }
  });
  it("lists all 28 unique pairs including zero-observed rows and separates co-draws from supp pairs", () => {
    const result = buildSupplementaryPairComparison(selected, history.slice(-1), history)!;
    expect(result.rows).toHaveLength(28);
    expect(new Set(result.rows.map((row) => row.pair.join("-"))).size).toBe(28);
    expect(result.rows.find((row) => row.pair.join("-") === "1-2")).toMatchObject({
      windowCoDraws: 1, fullCoDraws: 3, activePairSuppCount: 0, fullPairSuppCount: 0,
      individualActiveSuppCount: 0, individualFullSuppCount: 0,
    });
    expect(result.rows.find((row) => row.pair.join("-") === "7-8")).toMatchObject({
      windowCoDraws: 1, fullCoDraws: 2, activePairSuppCount: 1, fullPairSuppCount: 2,
      individualActiveSuppCount: 2, individualFullSuppCount: 4,
    });
    expect(result.rows.find((row) => row.pair.join("-") === "5-6")?.fullCoDraws).toBe(0);
  });

  it("uses the same current choice and pair-blend alternative as the existing methods", () => {
    const active = history.slice(-1);
    const result = buildSupplementaryPairComparison(selected, active, history)!;
    expect(result.current.pair).toEqual(buildDgaSuppSuggestion(selected, active, history)?.supp);
    expect(result.alternative.pair).toEqual(rankSupplementaryPairs(selected, history)[0].numbers);
    for (const row of result.rows) {
      expect(row.blendScore).toBe(rankSupplementaryPairs(selected, history).find((blend) => blend.numbers.join("-") === row.pair.join("-"))?.score);
    }
  });

  it("uses full-history evidence for fixed-window ties without resizing the window", () => {
    const active = [draw("2026-06-05", [10, 11, 12, 13, 14, 15], [1, 9])];
    const full = [draw("2026-06-03", [10, 11, 12, 13, 14, 15], [2, 9]), ...active];
    const result = buildSupplementaryPairComparison(selected, active, full)!;
    expect(result.current.pair).toEqual([1, 2]);
    expect(result.windowDrawCount).toBe(1);
  });

  it("keeps equal evidence tied and explains numerical fallback", () => {
    const tiedHistory = [draw("2026-06-01", [10, 11, 12, 13, 14, 15], [1, 9])];
    const result = buildSupplementaryPairComparison(selected, tiedHistory, tiedHistory)!;
    expect(result.current.pair).toEqual([1, 2]);
    expect(result.current.tiedPairs).toHaveLength(7);
    expect(result.current.reason).toContain("not stronger evidence");
    const top = result.rows.filter((row) => row.autoRank === 1);
    expect(top).toHaveLength(7);
    expect(top.every((row) => row.autoTies === 7)).toBe(true);
  });

  it("does not invent a recommendation or historical counts with no supplementary observations", () => {
    const noRoleHistory = [draw("2026-06-01", [1, 2, 3, 4, 5, 6], [44, 45])];
    const result = buildSupplementaryPairComparison(selected, noRoleHistory, noRoleHistory)!;
    expect(result.current.pair).toBeNull();
    expect(result.alternative.pair).toBeNull();
    expect(result.rows.every((row) => row.autoRank === 1 && row.autoTies === 28 && row.fullPairSuppCount === 0)).toBe(true);
    expect(result.rows.find((row) => row.pair.join("-") === "1-2")?.fullCoDraws).toBe(1);
  });

  it("screens simulated, malformed, off-schedule, duplicate and conflicting records", () => {
    const excluded: Draw[] = [
      { ...history[0], date: "2026-06-08", isSimulated: true },
      { ...history[0], date: "bad date" },
      { ...history[0], date: "2026-06-09" },
      { ...history[0], date: "2026-06-10", main: [1, 2] },
      history[0],
      draw("2026-06-12", [10, 11, 12, 13, 14, 15], [7, 8]),
      draw("2026-06-12", [20, 21, 22, 23, 24, 25], [7, 8]),
    ];
    const result = buildSupplementaryPairComparison(selected, [...history, ...excluded], [...history, ...excluded])!;
    expect(result.windowDrawCount).toBe(3);
    expect(result.fullDrawCount).toBe(3);
    expect(result.ignoredFullRows).toBe(7);
    expect(result.rows.find((row) => row.pair.join("-") === "7-8")?.fullPairSuppCount).toBe(2);
  });

  it("only includes window records consistent with qualifying full history", () => {
    const inconsistent = draw(history[0].date, [10, 11, 12, 13, 14, 15], [1, 2]);
    const result = buildSupplementaryPairComparison(selected, [inconsistent], history)!;
    expect(result.windowDrawCount).toBe(0);
    expect(result.ignoredWindowRows).toBe(1);
  });

  it("updates with an added real draw without modifying selected numbers or history", () => {
    const before = JSON.stringify({ selected, history });
    const first = buildSupplementaryPairComparison(selected, history, history)!;
    const next = [...history, draw("2026-06-08", [10, 11, 12, 13, 14, 15], [7, 8])];
    const updated = buildSupplementaryPairComparison(selected, next, next)!;
    expect(updated.rows.find((row) => row.pair.join("-") === "7-8")?.fullPairSuppCount).toBe(3);
    expect(first.rows.find((row) => row.pair.join("-") === "7-8")?.fullPairSuppCount).toBe(2);
    expect(JSON.stringify({ selected, history })).toBe(before);
  });

  it("requires exactly eight distinct valid numbers", () => {
    expect(buildSupplementaryPairComparison(selected.slice(1), history, history)).toBeNull();
    expect(buildSupplementaryPairComparison([...selected, 9], history, history)).toBeNull();
    expect(buildSupplementaryPairComparison([...selected, 1], history, history)?.rows).toHaveLength(28);
    expect(buildSupplementaryPairComparison([0, 1, 2, 3, 4, 5, 6, 46], history, history)).toBeNull();
  });
});

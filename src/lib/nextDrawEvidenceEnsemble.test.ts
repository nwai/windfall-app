import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import { parseCSVorJSON } from "../parseCSVorJSON";
import {
  NEXT_DRAW_EVIDENCE_MODEL_VERSION,
  deriveNextScheduledDrawDateAfterCutoff,
  prepareNextDrawEvidenceHistory,
  rankSupplementaryPairs,
  runNextDrawEvidenceEnsemble,
} from "./nextDrawEvidenceEnsemble";

const draw = (date: string, main: number[], supp: number[], isSimulated = false): Draw => ({
  date,
  main,
  supp,
  isSimulated,
});

describe("prepareNextDrawEvidenceHistory", () => {
  it("anchors the forecast to the first scheduled draw after the history cutoff", () => {
    expect(deriveNextScheduledDrawDateAfterCutoff("8/26/26")).toBe("2026-08-28");
    expect(deriveNextScheduledDrawDateAfterCutoff("8/28/26")).toBe("2026-08-31");
  });

  it("uses only strict real rows and does not choose between conflicting records", () => {
    const valid = draw("2026-01-02", [1, 2, 3, 4, 5, 6], [7, 8]);
    const conflict = draw("2026-01-05", [9, 10, 11, 12, 13, 14], [15, 16]);
    const prepared = prepareNextDrawEvidenceHistory([
      valid,
      { ...valid },
      conflict,
      draw("2026-01-05", [17, 18, 19, 20, 21, 22], [23, 24]),
      draw("2026-01-07", [1, 2, 3], [4, 5]),
      draw("2026-01-09", [1, 2, 3, 4, 5, 6], [7, 8], true),
    ]);

    expect(prepared.draws).toEqual([valid]);
    expect(prepared.ignoredDuplicateRows).toBe(1);
    expect(prepared.ignoredConflictingDateRows).toBe(2);
    expect(prepared.ignoredInvalidRows).toBe(1);
    expect(prepared.ignoredSimulatedRows).toBe(1);
  });
});

describe("rankSupplementaryPairs", () => {
  it("uses repeated supplementary-pair evidence as a shrunk tie-breaker", () => {
    const history: Draw[] = [];
    for (let index = 0; index < 30; index += 1) {
      history.push(draw(
        `2026-01-${String(index + 1).padStart(2, "0")}`,
        [1, 2, 3, 4, 5, 6],
        [7, 8],
      ));
    }

    const ranked = rankSupplementaryPairs([1, 2, 3, 4, 5, 6, 7, 8], history);
    expect(ranked).toHaveLength(28);
    expect(ranked[0].numbers).toEqual([7, 8]);
    expect(ranked[0].pairSuppHits).toBe(30);
    expect(ranked[0].pairExposure).toBe(30);
    expect(Number.isFinite(ranked[0].score)).toBe(true);
  });
});

describe("runNextDrawEvidenceEnsemble", () => {
  it("builds a deterministic 6+2 evidence forecast from the real CSV", () => {
    const csv = readFileSync(resolve(process.cwd(), "src/windfall_history_lottolyzer.csv"), "utf8");
    const history = parseCSVorJSON(csv) as Draw[];
    const result = runNextDrawEvidenceEnsemble(history, { targetDate: "2026-08-28" });
    const selected = [...result.main, ...result.supp];
    const estimateTotal = result.numberRows.reduce((sum, row) => sum + row.inclusionEstimate, 0);

    expect(result.modelVersion).toBe(NEXT_DRAW_EVIDENCE_MODEL_VERSION);
    expect(result.validDraws).toBeGreaterThan(300);
    expect(result.main).toHaveLength(6);
    expect(result.supp).toHaveLength(2);
    expect(new Set(selected).size).toBe(8);
    expect(result.numberRows).toHaveLength(45);
    expect(result.numberRows.map((row) => row.rank)).toEqual(Array.from({ length: 45 }, (_, index) => index + 1));
    expect(estimateTotal).toBeCloseTo(8, 8);
    expect(result.validation.drawsEvaluated).toBeGreaterThan(200);
    expect(result.validation.latestRows).toHaveLength(20);
    expect(result.methodology.join(" ")).toContain("before that draw");
  }, 30_000);
});

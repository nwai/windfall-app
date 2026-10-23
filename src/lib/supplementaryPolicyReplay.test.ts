import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Draw } from "../types";
import { parseCSVorJSON } from "../parseCSVorJSON";
import { buildEvidencePortfolioCandidatesForReplay, portfolioIsoDate, preparePortfolioHistory } from "./evidencePortfolio";
import { computeWeekdayWindfallPrizeDivision } from "./prizeDivisions";
import {
  evaluateSupplementaryReplayGate, exactRandomAssignmentReference, runSupplementaryPolicyReplay,
  summarizeRandomReplay, summarizeSupplementaryReplay, type SupplementaryPolicyReplayResult,
} from "./supplementaryPolicyReplay";

const recorded = preparePortfolioHistory(parseCSVorJSON(readFileSync(resolve(process.cwd(), "src/windfall_history_lottolyzer.csv"), "utf8")) as Draw[]).draws;
const history = recorded.slice(0, 64);
const options = { windowSize: 26, seed: 1 };
let result: SupplementaryPolicyReplayResult;

describe("supplementary policy replay using recorded real CSV targets", () => {
  beforeAll(async () => { result = await runSupplementaryPolicyReplay(history, options); }, 30_000);

  it("fixes the warm-up, chronological split and complete target ledger", () => {
    expect(result.records).toHaveLength(4);
    expect(result.records.map(row => row.phase)).toEqual(["development", "development", "confirmation", "confirmation"]);
    expect(result.records.every(row => row.priorDraws >= 60 && row.windowDraws === 26)).toBe(true);
    expect(result.records.every(row => row.cutoffDate < row.targetDate)).toBe(true);
    expect(result.records.map(row => row.targetDate)).toEqual(history.slice(60).map(row => portfolioIsoDate(row.date)));
    expect(result.gate.status).toBe("insufficient");
  });

  it("freezes the exact production EP-1 eight-number sets for all policies", () => {
    const expected = buildEvidencePortfolioCandidatesForReplay({ history: history.slice(0, 60), activeHistory: history.slice(34, 60),
      targetDate: portfolioIsoDate(history[60].date), seed: 1 });
    const first = result.records[0];
    for (const policy of ["auto", "blend", "co-draws"] as const) {
      expect(first.portfolio![policy]).toHaveLength(4);
      expect(first.portfolio![policy].map(row => [...row.main, ...row.supp].sort((a, b) => a - b)))
        .toEqual(expected.map(row => [...row.main, ...row.supp].sort((a, b) => a - b)));
    }
    expect(first.portfolio!.auto.map(row => row.supp)).toEqual(expected.map(row => row.supp));
  });

  it("scores real revealed roles only and uses six mains for playable prize checks", () => {
    result.records.forEach(record => {
      const actual = history.find(row => portfolioIsoDate(row.date) === record.targetDate)!;
      for (const policy of ["auto", "blend", "co-draws"] as const) {
        const rows = [record.role[policy], ...(record.portfolio?.[policy] ?? [])];
        rows.forEach(row => {
          expect(row.suppHits).toBe(row.supp.filter(n => actual.supp.includes(n)).length);
          expect(row.mainHits).toBe(row.main.filter(n => actual.main.includes(n)).length);
          expect(row.division).toBe(computeWeekdayWindfallPrizeDivision(row.main, [], new Set(actual.main), new Set(actual.supp)));
          expect(row.main).toHaveLength(6);
          expect(row.supp).toHaveLength(2);
          expect(new Set([...row.main, ...row.supp]).size).toBe(8);
        });
      }
    });
  });

  it("calculates exact random references without sampled or invented target draws", () => {
    const target = history[60];
    const selected = [...target.main, ...target.supp];
    expect(exactRandomAssignmentReference(selected, target).meanSuppHits).toBeCloseTo(0.5);
    expect(exactRandomAssignmentReference(selected, target).exactSuppRate).toBeCloseTo(1 / 28);
    expect(exactRandomAssignmentReference(selected, target).meanMainHits).toBeCloseTo(4.5);
    const nonTargets = Array.from({ length: 45 }, (_, i) => i + 1).filter(n => !selected.includes(n));
    expect(exactRandomAssignmentReference(nonTargets.slice(0, 8), target).meanSuppHits).toBe(0);
    expect(exactRandomAssignmentReference([target.supp[0], ...nonTargets.slice(0, 7)], target).meanSuppHits).toBeCloseTo(0.25);
    expect(exactRandomAssignmentReference([target.supp[0], ...nonTargets.slice(0, 7)], target).exactSuppRate).toBe(0);
    expect(() => exactRandomAssignmentReference([1, 1], target)).toThrow(/eight unique/);
  });

  it("does not let later outcomes or hidden target roles change an earlier assignment", async () => {
    const extended = await runSupplementaryPolicyReplay(recorded.slice(0, 65), options);
    expect(extended.records[0].portfolio).toEqual(result.records[0].portfolio);
    expect(extended.records[0].role).toEqual(result.records[0].role);
    // Counterfactual role metadata is used solely for this information-leak unit test, never as audit evidence.
    const target = history[60];
    const changed = history.map((row, index) => index === 60 ? { ...row, main: [...target.main.slice(2), ...target.supp], supp: target.main.slice(0, 2) } : row);
    const rerun = await runSupplementaryPolicyReplay(changed, options);
    for (const policy of ["auto", "blend", "co-draws"] as const) {
      expect(rerun.records[0].role[policy].supp).toEqual(result.records[0].role[policy].supp);
      expect(rerun.records[0].portfolio![policy].map(row => ({ main: row.main, supp: row.supp })))
        .toEqual(result.records[0].portfolio![policy].map(row => ({ main: row.main, supp: row.supp })));
    }
  }, 30_000);

  it("screens invalid evidence and retains missing-stage targets with explicit skip reasons", async () => {
    const first = history[0];
    const screened = await runSupplementaryPolicyReplay([...history, first, { ...first, isSimulated: true }, { ...first, date: "bad" }, { ...first, date: "2026-10-06" }], options);
    expect(screened.excludedRows).toBe(4);
    expect(screened.records).toEqual(result.records);
    const hole = history.filter((_, index) => index !== 60);
    const missing = await runSupplementaryPolicyReplay(hole, options);
    expect(missing.records[0].portfolio).toBeNull();
    expect(missing.records[0].portfolioRandom).toBeNull();
    expect(missing.records[0].portfolioSkippedReason).toMatch(/missing|behind/);
    expect(missing.records[0].role.auto).toBeDefined();
  }, 30_000);

  it("preserves reproducibility, inputs, true progress and bounds", async () => {
    const original = JSON.stringify(history);
    const progress: number[] = [];
    const rerun = await runSupplementaryPolicyReplay(history, options, (completed, total) => { expect(total).toBe(4); progress.push(completed); });
    expect(rerun).toEqual(result);
    expect(progress).toEqual([1, 2, 3, 4]);
    expect(JSON.stringify(history)).toBe(original);
    await expect(runSupplementaryPolicyReplay(history, { ...options, windowSize: 0 })).rejects.toThrow(/window/);
    await expect(runSupplementaryPolicyReplay(history, { ...options, seed: 1.5 })).rejects.toThrow(/seed/);
    const early = await runSupplementaryPolicyReplay(history.slice(0, 60), { windowSize: 60, seed: 0 });
    expect(early.records).toHaveLength(0);
    expect(early.gate.status).toBe("insufficient");
    expect(early.firstTarget).toBeNull();
  }, 30_000);

  it("keeps the development choice fixed even when confirmation favours another policy", () => {
    const chosen = evaluateSupplementaryReplayGate(result.records);
    // Extreme outcomes exercise winner-selection guards only; they are not published replay results.
    const changedConfirmation = result.records.map(row => row.phase === "development" ? row : { ...row,
      portfolio: row.portfolio && Object.fromEntries(Object.entries(row.portfolio).map(([policy, rows]) => [policy, rows.map(outcome => ({ ...outcome, suppHits: policy === chosen.candidate ? 0 : 2 }))])) as typeof row.portfolio });
    expect(evaluateSupplementaryReplayGate(changedConfirmation).candidate).toBe(chosen.candidate);
    expect(evaluateSupplementaryReplayGate(changedConfirmation).status).toBe("insufficient");
  });

  it("summarizes observed counts separately from mathematical references", () => {
    const summary = summarizeSupplementaryReplay(result.records, "portfolio", "auto");
    expect(summary.rows).toBe(16);
    expect(summary.zeroHits + summary.oneHit + summary.twoHits).toBe(16);
    expect(summary.draws).toBe(4);
    expect(summary.meanSuppHits).toBeCloseTo((summary.oneHit + 2 * summary.twoHits) / 16);
    expect(summarizeRandomReplay(result.records, "role").exactSuppRate).toBeCloseTo(1 / 28);
    expect(summarizeSupplementaryReplay([], "role", "auto").rows).toBe(0);
  });
});

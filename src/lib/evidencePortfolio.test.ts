import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Draw } from "../types";
import type { AppPresetSnapshot } from "./presets";
import { parseCSVorJSON } from "../parseCSVorJSON";
import {
  buildEvidencePortfolio, buildEvidencePortfolioCandidatesForReplay, scoreEvidencePortfolio, preparePortfolioHistory,
  auditEvidencePortfolios, isEvidencePortfolioSnapshot, portfolioIsoDate, portfolioCalendarDate,
  type BuildEvidencePortfolioOptions, type EvidencePortfolioSnapshot,
  tieFairFrequencySupport, buildEvidencePortfolioComparisonForReplay, scorePortfolioRows,
} from "./evidencePortfolio";
import { buildPredictionJournalEntry, parsePredictionJournalBackup, serializePredictionJournalBackup } from "./predictionJournal";

const recorded = preparePortfolioHistory(parseCSVorJSON(readFileSync(resolve(process.cwd(), "src/windfall_history_lottolyzer.csv"), "utf8")) as Draw[]).draws;
const history = recorded.slice(0, 80);
const target = recorded[80];
const now = `${portfolioIsoDate(history[history.length - 1].date)}T01:00:00.000Z`;
const options: BuildEvidencePortfolioOptions = { history, activeHistory: history.slice(-26), targetDate: portfolioIsoDate(target.date), seed: 17, now, windowLabel: "Test recorded 26-draw window", settingsSnapshot: { windowMode: "Custom", customDrawCount: 26 } as unknown as AppPresetSnapshot };
let snapshot: EvidencePortfolioSnapshot;

describe("Evidence Portfolio fixed policy against recorded CSV history", () => {
  beforeAll(() => { snapshot = buildEvidencePortfolio(options); }, 30_000);

  it("freezes four valid rows, four distinct controls and per-group ablations from real evidence", () => {
    expect(snapshot.candidates).toHaveLength(4);
    expect(snapshot.shadowBaseline).toHaveLength(4);
    expect(snapshot.registryVersion).toMatch(/^WF-EVIDENCE-/);
    expect(isEvidencePortfolioSnapshot(snapshot)).toBe(true);
    for (const rows of [snapshot.candidates, snapshot.shadowBaseline, ...Object.values(snapshot.ablations)]) {
      expect(new Set(rows.map(row => row.main.join(","))).size).toBe(4);
      rows.forEach(row => { expect(row.main).toHaveLength(6); expect(row.supp).toHaveLength(2); expect(new Set([...row.main, ...row.supp]).size).toBe(8); });
    }
    expect(snapshot.groups.filter(group => group.active).every(group => group.scores.every(value => value >= 0 && value <= 1))).toBe(true);
    expect(snapshot.groups.find(group => group.id === "monthly-stage")?.active).toBe(false);
    expect(snapshot.candidates[2].stageFallback).toBe(true);
  });

  it("reproduces the same rows and ablations with the same seed and cutoff", () => {
    const again = buildEvidencePortfolio(options);
    expect(again).toEqual(snapshot);
    expect(options.history).toEqual(history);
  }, 30_000);

  it("replay uses exactly the production construction without a fabricated saved setup", () => {
    const candidates = buildEvidencePortfolioCandidatesForReplay({ history, activeHistory: options.activeHistory,
      targetDate: options.targetDate, seed: options.seed });
    expect(candidates).toEqual(snapshot.candidates);
  }, 30_000);

  it("uses WFMQYH for frequency and empirical evidence without changing full-history context", () => {
    const shorter = buildEvidencePortfolio({ ...options, activeHistory: history.slice(-13), windowLabel: "Recorded 13-draw window" });
    expect(shorter.scopes.active).toBe(13);
    expect(shorter.scopes.allReal).toBe(snapshot.scopes.allReal);
    expect(shorter.scopes.baseline).toBe(snapshot.scopes.baseline);
    expect(shorter.groups[0].scores).not.toEqual(snapshot.groups[0].scores);
    expect(shorter.groups[1].reason).toContain("empirical [].");
    expect(shorter.groups[2]).toEqual(snapshot.groups[2]);
    expect(shorter.groups[3]).toEqual(snapshot.groups[3]);
    expect(shorter.numberBuckets).toEqual(snapshot.numberBuckets);
  }, 30_000);

  it("honours forced inclusions and exclusions on the portfolio, control and ablations", () => {
    const constrained = buildEvidencePortfolio({ ...options, forcedNumbers: [1, 45], excludedNumbers: [2, 44] });
    expect(constrained.id).not.toBe(snapshot.id);
    expect(isEvidencePortfolioSnapshot(constrained)).toBe(true);
    for (const rows of [constrained.candidates, constrained.shadowBaseline, ...Object.values(constrained.ablations),
      constrained.challenger!.candidates, ...Object.values(constrained.challenger!.ablations)]) {
      rows.forEach(row => { const numbers = [...row.main, ...row.supp]; expect(numbers).toContain(1); expect(numbers).toContain(45); expect(numbers).not.toContain(2); expect(numbers).not.toContain(44); });
    }
  }, 30_000);

  it("rejects lookahead, conflicts, too few distinct candidates and incomplete stages", () => {
    expect(() => buildEvidencePortfolio({ ...options, history: [...history, target] })).toThrow(/already loaded/);
    expect(() => buildEvidencePortfolio({ ...options, forcedNumbers: [1], excludedNumbers: [1] })).toThrow(/both forced and excluded/);
    expect(() => buildEvidencePortfolio({ ...options, forcedNumbers: [1, 2, 3, 4, 5, 6, 7, 8] })).toThrow(/fewer than four/);
    expect(() => buildEvidencePortfolio({ ...options, history: history.slice(0, -1) })).toThrow(/missing|behind/);
  });

  it("filters simulated, malformed, off-schedule and conflicting records without substituting data", () => {
    const first = history[0];
    const validIso = portfolioIsoDate(first.date);
    const cleaned = preparePortfolioHistory([first, { ...first }, { ...first, date: "2026-10-06" }, { ...first, date: "bad" }, { ...first, date: "2026-10-07", isSimulated: true }, { ...first, date: validIso, main: [1] }]);
    expect(cleaned.draws).toHaveLength(1);
    expect(cleaned.warnings.length).toBeGreaterThan(0);
  });

  it("scores the exact future real draw only and withholds scoring when prior history changed", () => {
    expect(scoreEvidencePortfolio(snapshot, history).status).toBe("pending");
    const result = scoreEvidencePortfolio(snapshot, [...history, target]);
    expect(result.status).toBe("scored");
    expect(result.candidates[0].uniqueHits).toBe([...snapshot.candidates[0].main, ...snapshot.candidates[0].supp].filter(number => [...target.main, ...target.supp].includes(number)).length);
    expect(result.attribution).toHaveLength(Object.keys(snapshot.ablations).length);
    expect(scoreEvidencePortfolio(snapshot, [...history, { ...target, isSimulated: true }]).status).toBe("pending");
    expect(scoreEvidencePortfolio(snapshot, [...history.slice(1), target]).status).toBe("invalidated");
  });

  it("retains frozen attribution in journal backup and does not learn from repeated copies of one draw", () => {
    const entry = buildPredictionJournalEntry({ latestDraw: history[history.length - 1], targetKind: "nextDraw", now, inputs: { notes: "Four forecast hypotheses" }, evidencePortfolio: snapshot });
    const backup = parsePredictionJournalBackup(serializePredictionJournalBackup([entry]));
    expect(backup.entries[0].evidencePortfolio).toEqual(snapshot);
    const edited = buildPredictionJournalEntry({ previousEntry: entry, latestDraw: history[history.length - 1], targetKind: "next3Draws", now,
      inputs: { notes: "Reviewed the original recipe" }, setupSnapshot: { windowMode: "Custom", customDrawCount: 99 } as unknown as AppPresetSnapshot,
      evidencePortfolio: null });
    expect(edited.evidencePortfolio).toEqual(snapshot);
    expect(edited.targetKind).toBe("nextDraw");
    expect(edited.setupSnapshot).toEqual(snapshot.settingsSnapshot);
    const audit = auditEvidencePortfolios(Array.from({ length: 35 }, () => ({ snapshot, reviewed: true, savedAt: now, reviewedAt: now })), [...history, target]);
    expect(audit.eligibleDraws).toBe(1);
    expect(audit.families.every(row => row.verdict === "insufficient")).toBe(true);
    expect(auditEvidencePortfolios([{ snapshot, reviewed: true, savedAt: `${snapshot.targetDate}T01:00:00Z`, reviewedAt: now }], [...history, target]).eligibleDraws).toBe(0);
  });

  it("rejects damaged imports rather than inventing missing evidence or attribution", () => {
    const damaged: unknown[] = [null, {}, { ...snapshot, groups: [null] }, { ...snapshot, appliedConstraints: null },
      { ...snapshot, ablations: {} }, { ...snapshot, candidates: snapshot.candidates.map(row => ({ ...row, contributions: null })) },
      { ...snapshot, scopes: { ...snapshot.scopes, activeDates: [] } }, { ...snapshot, familyAvailability: [null] },
      { ...snapshot, targetDate: "2026-10-06" }, { ...snapshot, numberBuckets: Array(46).fill(9) },
      { ...snapshot, challenger: {} }, { ...snapshot, challenger: { ...snapshot.challenger, ablations: {} } },
      { ...snapshot, challenger: { ...snapshot.challenger, groups: [null] } }];
    damaged.forEach(value => expect(isEvidencePortfolioSnapshot(value)).toBe(false));
  });

  it("freezes a clearly versioned unplayed challenger without altering legacy EP-1 rows", () => {
    const index = recorded.findIndex(draw => portfolioIsoDate(draw.date) === "2026-10-07");
    const prior = recorded.slice(0, index);
    const legacyProfile = buildEvidencePortfolio({ ...options, history: prior, activeHistory: prior.slice(-16),
      targetDate: "2026-10-07", seed: 1 });
    expect(legacyProfile.candidates.map(row => [row.main, row.supp])).toEqual([
      [[22, 24, 31, 34, 35, 38], [14, 28]], [[14, 16, 21, 22, 29, 32], [2, 37]],
      [[10, 17, 18, 30, 31, 32], [14, 28]], [[9, 17, 25, 26, 27, 43], [8, 20]],
    ]);
    expect(legacyProfile.shadowBaseline.map(row => [row.main, row.supp])).toEqual([
      [[1, 27, 29, 33, 43, 45], [13, 24]], [[6, 7, 18, 20, 23, 45], [11, 21]],
      [[3, 13, 18, 22, 23, 36], [2, 9]], [[8, 13, 24, 30, 35, 37], [9, 27]],
    ]);
    expect(legacyProfile.challenger?.modelVersion).toBe("EP-R1");
    expect(legacyProfile.challenger?.candidates[2].stageFallback).toBe(true);
    expect(legacyProfile.challenger?.groups[2].reason).toContain("uncovered share");
    expect(isEvidencePortfolioSnapshot(legacyProfile)).toBe(true);
  }, 30_000);

  it("retains legacy records and never creates a missing challenger after observing the target", () => {
    const { challenger: _challenger, ...legacy } = snapshot;
    expect(isEvidencePortfolioSnapshot(legacy)).toBe(true);
    expect(scoreEvidencePortfolio(legacy, [...history, target]).challenger).toEqual([]);
    const backup = buildPredictionJournalEntry({ latestDraw: history[history.length - 1], targetKind: "nextDraw", now,
      inputs: { notes: "Recorded legacy portfolio" }, evidencePortfolio: legacy });
    expect(parsePredictionJournalBackup(serializePredictionJournalBackup([backup])).entries[0].evidencePortfolio?.challenger).toBeUndefined();
    expect(scoreEvidencePortfolio(snapshot, [...history, target]).challenger).toHaveLength(4);
  });

  it("reuses the unchanged production path for each declared seed in the comparative replay", () => {
    const comparisons = buildEvidencePortfolioComparisonForReplay({ history, activeHistory: options.activeHistory,
      targetDate: options.targetDate, seeds: [1, 17] });
    expect(comparisons.map(item => item.seed)).toEqual([1, 17]);
    expect(comparisons[1].models[0].candidates).toEqual(snapshot.candidates);
    expect(comparisons[1].models[1].candidates).toEqual(snapshot.challenger!.candidates);
    expect(comparisons[1].shadowBaseline).toEqual(snapshot.shadowBaseline);
    expect(() => buildEvidencePortfolioComparisonForReplay({ history, activeHistory: history, targetDate: options.targetDate, seeds: [1, 1] })).toThrow(/distinct/);
  }, 30_000);

  it("keeps ticket main, ticket supplementary and extra-role matches as distinct real-result measures", () => {
    const draw = recorded.find(draw => portfolioIsoDate(draw.date) === "2026-10-07")!;
    const row = { ...snapshot.candidates[1], main: [14, 16, 21, 22, 29, 32], supp: [2, 37] };
    expect(scorePortfolioRows([row], draw)[0]).toMatchObject({ mainHits: 2, ticketSuppHits: 0, uniqueHits: 3,
      supplementaryRoleHits: 0, division: "—" });
  });

  it("uses the Melbourne calendar consistently for the conservative pre-draw audit cutoff", () => {
    expect(portfolioCalendarDate("2026-10-06T13:30:00.000Z")).toBe("2026-10-07");
    expect(portfolioCalendarDate("2026-10-06T12:30:00.000Z")).toBe("2026-10-06");
    expect(portfolioCalendarDate("invalid")).toBe("");
    const sameDay = { ...snapshot, frozenAt: `${snapshot.targetDate}T00:00:00+11:00`, formalTimingEligible: false };
    expect(auditEvidencePortfolios([{ snapshot: sameDay, reviewed: true, savedAt: now, reviewedAt: now }], [...history, target]).eligibleDraws).toBe(0);
  });
});

describe("Tie-fair frequency support", () => {
  it("returns no fabricated support without observations", () => {
    expect(tieFairFrequencySupport(Array(46).fill(0))).toEqual({ leaders: [], scores: Array(46).fill(0) });
  });
  it("includes the whole top-12 boundary tie and gives equal counts equal scores", () => {
    const counts = Array(46).fill(0);
    for (let number = 1; number <= 11; number += 1) counts[number] = 4;
    counts[12] = counts[44] = counts[45] = 3;
    counts[13] = 2;
    const result = tieFairFrequencySupport(counts);
    expect(result.leaders).toHaveLength(14);
    expect(result.scores[12]).toBe(result.scores[44]);
    expect(result.scores[44]).toBe(result.scores[45]);
    expect(result.scores[1]).toBe(result.scores[11]);
    expect(result.scores[13]).toBe(0);
  });
  it("does not arbitrarily pick twelve numbers when all 45 counts are tied", () => {
    const result = tieFairFrequencySupport([0, ...Array(45).fill(8)]);
    expect(result.leaders).toHaveLength(45);
    expect(new Set(result.scores.slice(1)).size).toBe(1);
  });
});

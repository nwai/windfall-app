import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Draw } from "../types";
import { parseCSVorJSON } from "../parseCSVorJSON";
import { portfolioIsoDate, preparePortfolioHistory, buildEvidencePortfolioCandidatesForReplay, scorePortfolioRows } from "./evidencePortfolio";
import { PORTFOLIO_REPLAY_PROTOCOL, runEvidencePortfolioReplay, summarizePortfolioReplay, summarizePortfolioRemovals,
  type PortfolioReplayResult } from "./evidencePortfolioReplay";

const recorded = preparePortfolioHistory(parseCSVorJSON(readFileSync(resolve(process.cwd(), "src/windfall_history_lottolyzer.csv"), "utf8")) as Draw[]).draws;
const history = recorded.slice(0, 66);
let result: PortfolioReplayResult;

describe("Fixed portfolio comparison with real CSV outcomes", () => {
  beforeAll(async () => { result = await runEvidencePortfolioReplay(history, 16); }, 60_000);

  it("declares every seed and records every real eligible target without selecting a winning seed", () => {
    expect(result.protocol.seeds).toEqual([0, 1, 17, 42]);
    expect(result.records).toHaveLength(6);
    expect(result.skipped).toEqual([]);
    expect(result.records.map(row => row.targetDate)).toEqual(history.slice(60).map(draw => portfolioIsoDate(draw.date)));
    result.records.forEach((row, index) => {
      expect(row.actualMain).toEqual(history[index + 60].main);
      expect(row.actualSupp).toEqual(history[index + 60].supp);
      expect(row.cutoffDate).toBe(portfolioIsoDate(history[index + 59].date));
      expect(row.priorDraws).toBe(index + 60);
      expect(row.windowDraws).toBe(16);
      expect(row.seeds.map(item => item.seed)).toEqual(PORTFOLIO_REPLAY_PROTOCOL.seeds);
      expect(row.metrics["EP-1"].rows).toBe(16);
      expect(row).not.toHaveProperty("settingsSnapshot");
      expect(row).not.toHaveProperty("frozenAt");
    });
  });
  it("retains exactly the original production rows and separately scores the six-ticket and eight-number measures", () => {
    const first = result.records[0];
    const candidates = buildEvidencePortfolioCandidatesForReplay({ history: history.slice(0, 60), activeHistory: history.slice(44, 60),
      targetDate: first.targetDate, seed: 1 });
    const replayRows = first.seeds.find(item => item.seed === 1)!.models["EP-1"].rows;
    expect(replayRows.map(row => [row.main, row.supp])).toEqual(candidates.map(row => [row.main, row.supp]));
    const score = scorePortfolioRows(candidates, history[60]);
    replayRows.forEach((row, index) => expect(row).toMatchObject({ mainHits: score[index].mainHits,
      ticketSuppHits: score[index].ticketSuppHits, eightHits: score[index].uniqueHits, division: score[index].division }));
  }, 30_000);
  it("uses a chronological block and counts draws, not rows or seeds, for evidence sufficiency", () => {
    expect(result.records.map(row => row.phase)).toEqual(["development", "development", "development", "development", "confirmation", "confirmation"]);
    expect(result.gate.status).toBe("insufficient");
    expect(summarizePortfolioReplay(result.records).map(row => row.targets)).toEqual([6, 6, 6]);
    const summary = summarizePortfolioReplay(result.records)[0];
    expect(summary.metrics!.rows).toBe(96);
    const prizes = result.records.flatMap(row => row.seeds.flatMap(seed => seed.models["EP-1"].rows)).filter(row => row.division !== "—").length;
    expect(summary.metrics!.prizeRate * summary.metrics!.rows).toBeCloseTo(prizes);
    expect(summarizePortfolioRemovals(result.records).every(row => row.targets === 6)).toBe(true);
  });
  it("cannot silently reduce a requested window when too few training draws exist", async () => {
    const insufficient = await runEvidencePortfolioReplay(history, 66);
    expect(insufficient.records).toEqual([]);
    expect(insufficient.gate.status).toBe("insufficient");
    await expect(runEvidencePortfolioReplay(history, -1)).rejects.toThrow(/Window/);
    await expect(runEvidencePortfolioReplay(history, 1.5)).rejects.toThrow(/Window/);
  });
  it("ignores simulated and malformed rows rather than presenting their outcomes as real", async () => {
    const extra: Draw[] = [{ ...history[0], date: "2026-10-07", isSimulated: true },
      { ...history[0], date: "2026-10-06" }, { ...history[0], date: "bad" }];
    const replay = await runEvidencePortfolioReplay([...history.slice(0, 61), ...extra], 16);
    expect(replay.validDraws).toBe(61);
    expect(replay.records).toHaveLength(1);
    expect(replay.records[0].seeds).toEqual(result.records[0].seeds);
    expect(replay.warnings.length).toBeGreaterThan(0);
  }, 30_000);
  it("does not substitute a guessed history when a stage has a missing real draw", async () => {
    const missing = [...history.slice(0, 60), ...history.slice(61)];
    const replay = await runEvidencePortfolioReplay(missing, 16);
    expect(replay.skipped.length).toBeGreaterThan(0);
    expect(replay.records.length + replay.skipped.length).toBe(5);
    expect(replay.skipped.every(row => /missing|behind/.test(row.reason))).toBe(true);
  }, 30_000);
  it("supports cancellation without adopting a model or returning a partial success", async () => {
    await expect(runEvidencePortfolioReplay(history, 16, undefined, () => true)).rejects.toThrow(/cancelled/);
    expect(history).toEqual(recorded.slice(0, 66));
  });
});

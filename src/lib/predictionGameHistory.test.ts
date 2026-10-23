import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import { analyzePredictionGameHistory, looksLikePastedGameRows } from "./predictionGameHistory";
import { buildPredictionCaptureBatch, parsePredictionCaptureRows } from "./predictionCapture";

const draw: Draw = { date: "2026-10-12", main: [10, 12, 1, 14, 39, 37], supp: [35, 45] };
const games = (text: string) => buildPredictionCaptureBatch({ externalRows: parsePredictionCaptureRows(text, { playedOnly: true }) }).games;

describe("per-game history versus across-games coverage", () => {
  it("does not manufacture a prize from the user's four-line combined pool", () => {
    const rows = games("3,37,35,29,10,22\n1,14,22,28,30,39\n45,40,1,22,30,39\n6,10,11,15,12,43");
    const result = analyzePredictionGameHistory([draw], rows, "2026-10-19");
    expect(Object.values(result.matchesByGame).every(matches => matches.length === 0)).toBe(true);
    expect(result.portfolioCoverage).toHaveLength(1);
    expect(result.portfolioCoverage[0].mainHits).toHaveLength(6);
    expect(result.portfolioCoverage[0].suppHits).toHaveLength(2);
    expect(result.portfolioCoverage[0].contributingGames).toHaveLength(4);
    expect(result.portfolioCoverage[0]).not.toHaveProperty("division");
  });

  it("finds a genuine six-number D2 game, including a supplementary hit among its six numbers", () => {
    const rows = games("10,12,1,14,39,35\n2,3,4,5,6,7");
    const result = analyzePredictionGameHistory([draw], rows, "2026-10-19");
    expect(result.matchesByGame[rows[0].mainKey][0]).toMatchObject({ division: "Div2", suppHits: [35] });
    expect(result.portfolioCoverage).toEqual([]);
  });

  it("keeps later outcomes out of a saved entry's historical match check", () => {
    const rows = games(draw.main.join(","));
    expect(analyzePredictionGameHistory([draw], rows, "2026-10-09").matchesByGame[rows[0].mainKey]).toEqual([]);
    expect(analyzePredictionGameHistory([draw], rows, "2026-10-12").matchesByGame[rows[0].mainKey][0].division).toBe("Div1");
  });

  it("excludes simulated, malformed, off-schedule, duplicate-date and post-cutoff evidence", () => {
    const source = [draw, { ...draw, date: "2026-10-14", isSimulated: true }, { ...draw, date: "2026-10-16", supp: [35, 35] },
      { ...draw, date: "2026-10-13" }, { ...draw, date: "2026-10-09" }, { ...draw, date: "2026-10-09" }, { ...draw, date: "2026-10-21" }];
    const result = analyzePredictionGameHistory(source, games(draw.main.join(",")), "2026-10-19");
    expect(result.checkedDraws).toBe(1); expect(result.skippedDraws).toBe(5); expect(result.afterCutoff).toBe(1);
    expect(analyzePredictionGameHistory(source, games(draw.main.join(",")), "not a date").checkedDraws).toBe(0);
  });

  it("offers conversion for game-like rows but not eight numbers written one per line", () => {
    expect(looksLikePastedGameRows("1,2,3,4,5,6\n7,8,9,10,11,12")).toBe(true);
    expect(looksLikePastedGameRows("1,2,3,4,5,6\n45,40,1.22.30,39")).toBe(true);
    expect(looksLikePastedGameRows("1\n2\n3\n4\n5\n6\n7\n8")).toBe(false);
    expect(looksLikePastedGameRows("1,2,3\n4,5,6")).toBe(false);
  });
});

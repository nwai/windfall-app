import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCSVorJSON } from "../parseCSVorJSON";
import type { Draw } from "../types";
import { preparePortfolioHistory, portfolioIsoDate } from "./evidencePortfolio";
import { buildWindfallPredictor, isWindfallPredictorSnapshot, learnPredictorEvidence, predictorHistoryScope, scoreWindfallPredictor, type BuildWindfallPredictorOptions } from "./windfallPredictor";
import { createWindfallPredictorEntry, auditSavedWindfallPredictors } from "./windfallPredictorJournal";
import { buildPredictionJournalEntry, loadPredictionJournalEntries, savePredictionJournalEntries, parsePredictionJournalBackup, serializePredictionJournalBackup, scorePredictionJournalEntry } from "./predictionJournal";

// Real CSV replay, with the target strictly withheld. Fixture-only outcomes below test scoring arithmetic.
const recorded = preparePortfolioHistory(parseCSVorJSON(readFileSync("src/windfall_history_lottolyzer.csv", "utf8")) as Draw[]).draws;
const holdoutIndex = recorded.findIndex(draw => portfolioIsoDate(draw.date) === "2026-10-19");
const prior = recorded.slice(0, holdoutIndex);
const options: BuildWindfallPredictorOptions = { history: prior, targetDate: "2026-10-19", now: "2026-10-16T01:00:00Z", seed: 17 };
const snapshot = buildWindfallPredictor(options);

describe("Windfall Predictor integrity", () => {
  it("uses current-month live context and only complete earlier months for learned evidence", () => {
    expect(snapshot.liveDates.length).toBe(snapshot.ordinal - 1);
    expect(snapshot.liveDates.every(date => date.startsWith("2026-10"))).toBe(true);
    expect(snapshot.trainingMonths.every(month => month < "2026-10")).toBe(true);
    expect(snapshot.excludedMonths).toContain("2024-05");
    expect(snapshot.trainingMonths).not.toContain("2024-05");
    expect(isWindfallPredictorSnapshot(snapshot)).toBe(true);
    expect(snapshot.games).toHaveLength(4); expect(snapshot.controls).toHaveLength(4);
    for (const game of [...snapshot.games, ...snapshot.controls]) {
      expect(game.main).toHaveLength(6); expect(game.supp).toHaveLength(2);
      expect(new Set([...game.main, ...game.supp]).size).toBe(8);
    }
  });
  it("is reproducible and does not mutate the recorded source", () => {
    const before = JSON.stringify(prior);
    expect(buildWindfallPredictor(options)).toEqual(snapshot);
    expect(JSON.stringify(prior)).toBe(before);
    expect(buildWindfallPredictor({...options, seed:18}).games).not.toEqual(snapshot.games);
  });
  it("does not train on the current month, even when more live outcomes arrive", () => {
    const earlier = buildWindfallPredictor({...options, history: prior.slice(0, -1), targetDate: portfolioIsoDate(prior[prior.length - 1].date)});
    expect(earlier.audits).toEqual(snapshot.audits);
    expect(earlier.roleAudit).toEqual(snapshot.roleAudit);
    expect(earlier.trainingMonths).toEqual(snapshot.trainingMonths);
    expect(earlier.liveDates).toEqual(snapshot.liveDates.slice(0, -1));
  });
  it("freezes historical training before each held-out test month", () => {
    const scope = predictorHistoryScope(prior, options.targetDate);
    const before = learnPredictorEvidence(scope.complete.slice(0, 6));
    const revised = scope.complete.slice(0, 6).map((month, i) => i === 5 ? {...month, draws: month.draws.map(draw => ({...draw, main: [1,2,3,4,5,6], supp:[7,8]}))} : month);
    const after = learnPredictorEvidence(revised);
    // Scores may change because held-out outcomes changed; target counts and earlier training exposure do not.
    expect(before.audits.map(row => [row.targets,row.months,row.trainingStates])).toEqual(after.audits.map(row => [row.targets,row.months,row.trainingStates]));
    expect(scope.complete.map(month => month.month)).not.toContain("2026-10");
  });
  it("keeps failed evidence gates neutral and never invents sparse evidence", () => {
    for (const audit of snapshot.audits) {
      for (const row of snapshot.numberEvidence) {
        expect(row.factors[audit.family]).toBeGreaterThanOrEqual(0.8);
        expect(row.factors[audit.family]).toBeLessThanOrEqual(1.2);
        if (!audit.cleared || row.stateTrials[audit.family] < 20) expect(row.factors[audit.family]).toBe(1);
      }
    }
    const firstMonth = recorded.filter(draw => portfolioIsoDate(draw.date) < "2024-06-03");
    const thin = buildWindfallPredictor({...options, history:firstMonth,targetDate:"2024-06-03",now:"2024-06-01T00:00:00Z"});
    expect(thin.audits.every(audit => !audit.cleared && audit.brier === null)).toBe(true);
    expect(thin.warnings.join(" ")).toContain("No evidence family cleared");
    expect(thin.roleAudit).toMatchObject({targets:0,months:0,meanHits:null,exactPairRate:null,cleared:false});
    expect([...thin.games,...thin.controls].every(game => game.suppMethod.includes("Seeded uniform role assignment"))).toBe(true);
  });
  it("honours shared hard numbers in all hypotheses and controls", () => {
    const constrained = buildWindfallPredictor({...options,forced:[1,45],excluded:[2,3,4]});
    for (const row of [...constrained.games,...constrained.controls]) {
      expect([...row.main,...row.supp]).toEqual(expect.arrayContaining([1,45]));
      expect([...row.main,...row.supp].some(n => [2,3,4].includes(n))).toBe(false);
    }
    expect(() => buildWindfallPredictor({...options,forced:[1],excluded:[1]})).toThrow(/conflicts/);
    expect(() => buildWindfallPredictor({...options,excluded:Array.from({length:38},(_,i)=>i+1)})).toThrow(/at least eight/);
    expect(() => buildWindfallPredictor({...options,forced:[1,2,3,4,5,6,7,8]})).toThrow(/four distinct/);
  });
  it("does not quietly cross month boundaries or accept missing stages and loaded targets", () => {
    const firstOctober = recorded.findIndex(draw => portfolioIsoDate(draw.date) === "2026-10-02");
    const reset = buildWindfallPredictor({...options,history:recorded.slice(0,firstOctober),targetDate:"2026-10-02",now:"2026-10-01T00:00:00Z"});
    expect(reset.liveDates).toEqual([]); expect(reset.ordinal).toBe(1);
    expect(reset.warnings.join(" ")).toContain("No draws have been recorded in the target month");
    expect(() => buildWindfallPredictor({...options,history:recorded})).toThrow(/already loaded/);
    expect(() => buildWindfallPredictor({...options,history:prior.filter(draw=>portfolioIsoDate(draw.date)!=="2026-10-05")})).toThrow(/missing scheduled/);
    expect(() => buildWindfallPredictor({...options,targetDate:"2026-10-20"})).toThrow(/scheduled draw/);
    expect(() => buildWindfallPredictor({...options,targetDate:"2026-10-21"})).toThrow(/missing official/);
  });
  it("ignores simulated, invalid and off-schedule rows rather than learning from them", () => {
    const polluted = buildWindfallPredictor({...options,history:[...prior,
      {date:"2026-10-18",main:[1,2,3,4,5,6],supp:[7,8]},
      {date:"2026-10-19",main:[1,2,3,4,5,6],supp:[7,8],isSimulated:true},
      {date:"not-a-date",main:[1,1],supp:[]},
    ]});
    expect(polluted.games).toEqual(snapshot.games); expect(polluted.audits).toEqual(snapshot.audits);
    expect(polluted.warnings.length).toBeGreaterThan(snapshot.warnings.length);
  });
  it("scores only the exact real target and separates eight-overlap, six-main prize and supp roles", () => {
    const pending = scoreWindfallPredictor(snapshot, prior); expect(pending.games.every(game=>game.status==="Pending")).toBe(true);
    const row = snapshot.games[0];
    const fixture: Draw = {date:options.targetDate,main:row.main,supp:row.supp};
    const score = scoreWindfallPredictor(snapshot,[...prior,fixture]);
    expect(score.games[0]).toMatchObject({status:"Hit",hits:8,mainHits:6,suppHits:2,division:"Div1"});
    expect(scoreWindfallPredictor(snapshot,[...prior,{...fixture,date:"2026-10-21"}]).actual).toBeUndefined();
    expect(scoreWindfallPredictor(snapshot,[...prior,{...fixture,isSimulated:true}]).actual).toBeUndefined();
    expect(scoreWindfallPredictor(snapshot,[...prior.slice(1),fixture]).historyMatches).toBe(false);
  });
  it("rejects malformed saved receipts without throwing or promoting invalid weights", () => {
    const bad = structuredClone(snapshot); bad.numberEvidence[0].factors["monthly-stage"] = 2;
    expect(isWindfallPredictorSnapshot(bad)).toBe(false);
    expect(isWindfallPredictorSnapshot({...snapshot,games:[{main:"bad"}]})).toBe(false);
    expect(isWindfallPredictorSnapshot({...snapshot,liveDates:["2026-09-01"]})).toBe(false);
    expect(isWindfallPredictorSnapshot({...snapshot,roleAudit:undefined})).toBe(false);
    expect(isWindfallPredictorSnapshot({...snapshot,roleAudit:{...snapshot.roleAudit,targets:0,cleared:true}})).toBe(false);
  });
});

describe("Predictor journal provenance and self-review", () => {
  it("persists the source flag, four immutable games and controls through backup and editing", () => {
    const entry = createWindfallPredictorEntry(snapshot,true,"2026-10-16T02:00:00Z");
    const backup = parsePredictionJournalBackup(serializePredictionJournalBackup([entry]));
    expect(backup.entries[0].windfallPredictor).toEqual(snapshot);
    expect(entry.provenance).toBeUndefined();
    expect(backup.entries[0].provenance).toBeUndefined();
    expect(backup.entries[0].inputs.selectionReason?.key).toBe("windfallPredictor");
    const edited = buildPredictionJournalEntry({previousEntry:entry,latestDraw:prior[prior.length-1],targetKind:"next3Draws",inputs:{notes:"Reviewed notes"},now:"2026-10-17T00:00:00Z"});
    expect(edited.targetKind).toBe("nextDraw"); expect(edited.windfallPredictor).toEqual(snapshot);
    const corrupt = {...entry,windfallPredictor:{...snapshot,version:"unknown"}};
    expect(parsePredictionJournalBackup(JSON.stringify([entry,corrupt])).rejectedCount).toBe(1);
    expect(entry.windfallPredictor).not.toBe(snapshot);
  });
  it("creates four journal score flags and includes one reviewed pre-draw receipt per target", () => {
    const fixture: Draw = {date:options.targetDate,main:snapshot.games[0].main,supp:snapshot.games[0].supp};
    const history = [...prior,fixture], entry = createWindfallPredictorEntry(snapshot,true,"2026-10-16T02:00:00Z");
    const scored = scorePredictionJournalEntry(entry,history);
    expect(scored.status).toBe("scored"); expect(scored.scores).toHaveLength(4); expect(scored.scores[0].result).toBe("hit");
    const audit = auditSavedWindfallPredictors([entry,{...entry,id:"duplicate",createdAt:"2026-10-17T02:00:00Z"}],history);
    expect(audit.targets).toBe(1); expect(audit.verdict).toContain("Learning");
    expect(auditSavedWindfallPredictors([{...entry,archivedAt:"2026-10-20"}],history).targets).toBe(0);
    expect(auditSavedWindfallPredictors([{...entry,reviewStatus:"notReviewed"}],history).targets).toBe(0);
    expect(auditSavedWindfallPredictors([{...entry,reviewedAt:"2026-10-19T01:00:00Z"}],history).targets).toBe(0);
    expect(auditSavedWindfallPredictors([entry],history.slice(1)).targets).toBe(0);
  });
  it("retains predictor metadata in local storage without affecting unrelated entries", () => {
    const entry = createWindfallPredictorEntry(snapshot,false,"2026-10-16T02:00:00Z");
    const values = new Map<string,string>();
    const storage = {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}} as Storage;
    savePredictionJournalEntries([entry],storage);
    expect(loadPredictionJournalEntries(storage)[0].windfallPredictor).toEqual(snapshot);
  });
});

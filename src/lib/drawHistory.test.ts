import { describe, expect, it } from "vitest";
import { drawHistoryTerminalComposition, formatRow, isFilePickerCancelError, parseCsv, prependRowToCsv, toCsv } from "./drawHistory";
import { parseCSVorJSON } from "../parseCSVorJSON";
import { readFileSync } from "node:fs";

describe("drawHistory file picker helpers", () => {
  it("blocks bad weekdays and duplicate dates before creating a CSV", () => {
    const row = { date: "4/28/26", mains: [8, 26, 43, 33, 10, 24], supps: [11, 5] };
    expect(() => toCsv([row])).toThrow("Tuesday");
    const corrected = { ...row, date: "4/27/26" };
    expect(toCsv([corrected])).toContain("4/27/26,8,26,43,33,10,24,11,5");
    expect(() => toCsv([corrected, { ...corrected, date: "2026-04-27" }])).toThrow("More than one result");
  });
  it("recognizes user cancellation errors from file picker APIs", () => {
    expect(isFilePickerCancelError({ name: "AbortError", message: "The user aborted a request." })).toBe(true);
    expect(isFilePickerCancelError({ name: "Error", message: "User cancelled file selection." })).toBe(true);
  });

  it("does not treat write failures as user cancellation", () => {
    expect(isFilePickerCancelError(new Error("Write permission denied."))).toBe(false);
    expect(isFilePickerCancelError(null)).toBe(false);
  });
});

describe("draw-history terminal composition CSV", () => {
  const row = {date:"10/9/26",mains:[28,33,36,15,40,18],supps:[44,4]};
  const legacy = "date,main1,main2,main3,main4,main5,main6,supp1,supp2\n10/9/26,28,33,36,15,40,18,44,4";
  it("appends deterministic full-eight shape and exact maximal runs without changing the draw", () => {
    expect(formatRow(row)).toBe("10/9/26,28,33,36,15,40,18,44,4,2+2+1+1+1+1,3-4-5-6");
    const csv=toCsv([row]);
    expect(csv.split("\n")[0]).toBe("date,main1,main2,main3,main4,main5,main6,supp1,supp2,terminal_shape,terminal_runs");
    expect(parseCsv(csv).rows).toEqual([row]);
    expect(parseCSVorJSON(csv)).toEqual([{date:row.date,main:row.mains,supp:row.supps}]);
    expect(toCsv(parseCsv(csv).rows,parseCsv(csv).header)).toBe(csv);
    expect(toCsv(parseCsv(legacy).rows,parseCsv(legacy).header)).toBe(csv);
    expect(parseCSVorJSON(legacy)).toEqual([{date:row.date,main:row.mains,supp:row.supps}]);
  });
  it("stores separate runs in one field, preserves circular maximal runs and leaves no-run cells empty", () => {
    expect(formatRow({date:"10/7/26",mains:[10,11,12,24,25,26],supps:[18,38]}).split(",").slice(9))
      .toEqual(["2+1+1+1+1+1+1","0-1-2; 4-5-6"]);
    expect(drawHistoryTerminalComposition([9,10,21,32,14,24],[37,17]).runs).toEqual(["9-0-1-2"]);
    expect(formatRow({date:"10/5/26",mains:[1,11,21,31,4,14],supps:[7,17]}).split(",").slice(9))
      .toEqual(["4+2+2",""]);
  });
  it("recalculates changed numbers instead of trusting imported diagnostic text", () => {
    const falsified=legacy.replace("supp1,supp2","supp1,supp2,terminal_shape,terminal_runs")+",fabricated,1-2-3-4-5-6-7-8";
    expect(toCsv(parseCsv(falsified).rows)).toBe(toCsv([row]));
    const update={date:"10/12/26",mains:[10,11,12,24,25,26],supps:[18,38]};
    const csv=prependRowToCsv(falsified,update);
    expect(parseCsv(csv).rows).toEqual([update,row]);
    expect(csv.split("\n")[1]).toContain(",2+1+1+1+1+1+1,0-1-2; 4-5-6");
  });
  it("never publishes malformed or simulated rows as official CSV evidence", () => {
    for (const invalid of [{...row,supps:[44]}, {...row,supps:[44,28]}, {...row,mains:[0,33,36,15,40,18]}, {...row,mains:[1.5,33,36,15,40,18]}]) {
      expect(drawHistoryTerminalComposition(invalid.mains,invalid.supps)).toEqual({shape:null,runs:null});
      expect(()=>toCsv([invalid])).toThrow("all unique whole numbers from 1 to 45");
    }
    expect(toCsv([row,{...row,date:"bad",isSimulated:true}])).toBe(toCsv([row]));
    expect(parseCsv(toCsv([{...row,isSimulated:true}])).rows).toEqual([]);
  });
  it("round trips every bundled real row through both importers with the number order unchanged", () => {
    const existing=readFileSync("src/windfall_history_lottolyzer.csv","utf8"),rows=parseCsv(existing).rows;
    const enriched=toCsv(rows,parseCsv(existing).header);
    expect(parseCsv(enriched).rows).toEqual(rows);
    expect(parseCSVorJSON(enriched)).toEqual(rows.map(row=>({date:row.date,main:row.mains,supp:row.supps})));
    expect(enriched.split("\n").slice(1).every(line=>line.split(",").length===11)).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { parseCSVorJSON } from "../src/parseCSVorJSON";
import { auditHistorySchedule } from "../src/lib/historyScheduleAudit";
import { isScheduledDrawDate, parseDrawDateParts } from "../src/lib/planningDrawContext";

const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

describe("bundled Windfall history schedule validation", () => {
  it("has no missing scheduled draws between the first and latest recorded dates", () => {
    const csv = readFileSync(resolve(process.cwd(), "src/windfall_history_lottolyzer.csv"), "utf8");
    expect(auditHistorySchedule(parseCSVorJSON(csv)).missingDates).toEqual([]);
  });

  it("keeps real draw rows dated, unique, in range, and on scheduled draw weekdays", () => {
    const csv = readFileSync(resolve(process.cwd(), "src/windfall_history_lottolyzer.csv"), "utf8");
    const rows = parseCSVorJSON(csv);
    const seenDates = new Set<string>();
    const invalidRows: string[] = [];
    const duplicateDates: string[] = [];
    const offScheduleRows: string[] = [];
    const invalidNumberRows: string[] = [];

    rows.forEach((row, index) => {
      const lineNumber = index + 2;
      const parts = parseDrawDateParts(row.date);
      if (!parts) {
        invalidRows.push(`line ${lineNumber}: ${row.date || "(blank)"}`);
        return;
      }

      const dateKey = [
        parts.year,
        String(parts.month).padStart(2, "0"),
        String(parts.day).padStart(2, "0"),
      ].join("-");
      if (seenDates.has(dateKey)) {
        duplicateDates.push(`line ${lineNumber}: ${row.date}`);
      }
      seenDates.add(dateKey);

      if (!isScheduledDrawDate(parts)) {
        const weekday = new Date(parts.year, parts.month - 1, parts.day).getDay();
        offScheduleRows.push(`line ${lineNumber}: ${row.date} (${weekdayNames[weekday]})`);
      }

      const numbers = [...row.main, ...row.supp];
      const validNumbers = numbers.filter((value) => (
        Number.isInteger(value) && value >= 1 && value <= 45
      ));
      if (numbers.length !== 8 || validNumbers.length !== 8 || new Set(numbers).size !== 8) {
        invalidNumberRows.push(`line ${lineNumber}: ${row.date}`);
      }
    });

    expect(invalidRows).toEqual([]);
    expect(duplicateDates).toEqual([]);
    expect(offScheduleRows).toEqual([]);
    expect(invalidNumberRows).toEqual([]);
  });
});

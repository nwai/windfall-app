import { isParseableDrawDate } from "./strictDrawValidation";
import { datePartsToIso, isScheduledDrawDate, parseDrawDateParts } from "./planningDrawContext";

export interface HistoryScheduleAudit {
  invalidDateRows: number[];
  offScheduleRows: number[];
  missingDates: string[];
}

export function drawScheduleDateError(date: string): string | null {
  const parts = isParseableDrawDate(date) ? parseDrawDateParts(date) : null;
  if (!parts) return `Invalid draw date: ${date || "(blank)"}.`;
  if (!isScheduledDrawDate(parts)) {
    const day = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
      new Date(parts.year, parts.month - 1, parts.day).getDay()
    ];
    return `${date} is a ${day}. Weekly Windfall draws are scheduled on Monday, Wednesday and Friday. Check the official result date.`;
  }
  return null;
}

export function auditHistorySchedule(rows: readonly { date: string; isSimulated?: boolean }[]): HistoryScheduleAudit {
  const invalidDateRows: number[] = [];
  const offScheduleRows: number[] = [];
  const dates = new Set<string>();
  rows.forEach((row, index) => {
    if (row.isSimulated) return;
    const parts = isParseableDrawDate(row.date) ? parseDrawDateParts(row.date) : null;
    if (!parts) { invalidDateRows.push(index); return; }
    dates.add(datePartsToIso(parts));
    if (!isScheduledDrawDate(parts)) offScheduleRows.push(index);
  });
  const ordered = [...dates].sort();
  const first = ordered.length ? parseDrawDateParts(ordered[0]) : null;
  const last = ordered[ordered.length - 1];
  const missingDates: string[] = [];
  // Calendar stepping preserves local dates across daylight-saving boundaries.
  if (first && last) {
    const cursor = new Date(first.year, first.month - 1, first.day);
    for (let guard = 0; guard < 366 * 201; guard += 1) {
      const parts = { year: cursor.getFullYear(), month: cursor.getMonth() + 1, day: cursor.getDate() };
      const key = datePartsToIso(parts);
      if (key > last) break;
      if (isScheduledDrawDate(parts) && !dates.has(key)) missingDates.push(key);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return { invalidDateRows, offScheduleRows, missingDates };
}

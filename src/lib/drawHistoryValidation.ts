import { parseCSVorJSON } from "../parseCSVorJSON";
import type { DrawRow } from "./drawHistory";
import {
  analyzeDrawHistoryRows,
  formatIsoDateAsMdyy,
  sortHistoryRows,
} from "./drawHistoryReview";

export type DrawHistoryDateFormat = "iso" | "mdyy";

export interface DrawHistoryValidationOptions {
  mainCount: number;
  suppCount: number;
  minNumber: number;
  maxNumber: number;
  outputDateFormat: DrawHistoryDateFormat;
}

export interface DrawEntryInput {
  date: string;
  mains: string[];
  supps: string[];
}

export type DrawEntryValidationResult =
  | { ok: true; row: DrawRow }
  | { ok: false; message: string };

export interface ReferenceDrawRowsParseResult {
  rows: DrawRow[];
  rejectedRowCount: number;
}

export interface DrawHistorySummary {
  totalRows: number;
  realRows: number;
  simulatedRows: number;
  earliestDate: string | null;
  latestDate: string | null;
  exactDuplicateIssues: number;
  sameDateConflictIssues: number;
  repeatedNumberSetIssues: number;
  issueCount: number;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function parseDateToIso(rawDate: string): string | null {
  const trimmed = rawDate.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(trimmed);

  const parts = isoMatch
    ? { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) }
    : slashMatch
      ? {
          year: Number(slashMatch[3]) < 100 ? 2000 + Number(slashMatch[3]) : Number(slashMatch[3]),
          month: Number(slashMatch[1]),
          day: Number(slashMatch[2]),
        }
      : null;

  if (!parts) return null;
  const date = new Date(parts.year, parts.month - 1, parts.day);
  if (
    date.getFullYear() !== parts.year ||
    date.getMonth() !== parts.month - 1 ||
    date.getDate() !== parts.day
  ) {
    return null;
  }

  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function formatOutputDate(isoDate: string, outputDateFormat: DrawHistoryDateFormat): string {
  return outputDateFormat === "mdyy" ? formatIsoDateAsMdyy(isoDate) : isoDate;
}

function parseNumberSlots(
  values: string[],
  label: "Main" | "Supplementary",
  expectedCount: number,
  minNumber: number,
  maxNumber: number,
): { ok: true; numbers: number[] } | { ok: false; message: string } {
  const numbers: number[] = [];
  for (let index = 0; index < expectedCount; index += 1) {
    const raw = values[index]?.trim() ?? "";
    if (!/^\d+$/.test(raw)) {
      return { ok: false, message: `${label} slot ${index + 1} must contain a whole number.` };
    }

    const value = Number(raw);
    if (value < minNumber || value > maxNumber) {
      return {
        ok: false,
        message: `${label} slot ${index + 1} must be between ${minNumber} and ${maxNumber}.`,
      };
    }
    numbers.push(value);
  }

  return { ok: true, numbers };
}

export function validateDrawEntry(
  input: DrawEntryInput,
  options: DrawHistoryValidationOptions,
): DrawEntryValidationResult {
  const isoDate = parseDateToIso(input.date);
  if (!isoDate) {
    return { ok: false, message: "Choose a valid draw date." };
  }

  const mains = parseNumberSlots(input.mains, "Main", options.mainCount, options.minNumber, options.maxNumber);
  if (!mains.ok) return mains;

  const supps = parseNumberSlots(input.supps, "Supplementary", options.suppCount, options.minNumber, options.maxNumber);
  if (!supps.ok) return supps;

  const allNumbers = [...mains.numbers, ...supps.numbers];
  const duplicate = allNumbers.find((value, index) => allNumbers.indexOf(value) !== index);
  if (duplicate !== undefined) {
    return {
      ok: false,
      message: `Draw numbers must be unique across main and supplementary slots. ${duplicate} appears more than once.`,
    };
  }

  return {
    ok: true,
    row: {
      date: formatOutputDate(isoDate, options.outputDateFormat),
      mains: mains.numbers,
      supps: supps.numbers,
    },
  };
}

export function parseReferenceDrawRows(
  input: string,
  options: DrawHistoryValidationOptions,
): ReferenceDrawRowsParseResult {
  const parsed = parseCSVorJSON(input);
  const rows: DrawRow[] = [];
  let rejectedRowCount = 0;

  parsed.forEach((candidate) => {
    const isBlank = candidate.date.trim() === "" && candidate.main.length === 0 && candidate.supp.length === 0;
    if (isBlank) {
      return;
    }

    const result = validateDrawEntry(
      {
        date: candidate.date,
        mains: candidate.main.map((value) => String(value)),
        supps: candidate.supp.map((value) => String(value)),
      },
      options,
    );

    if (result.ok) {
      rows.push(result.row);
    } else {
      rejectedRowCount += 1;
    }
  });

  return { rows, rejectedRowCount };
}

export function buildDrawHistorySummary(rows: DrawRow[]): DrawHistorySummary {
  const sorted = sortHistoryRows(rows, "asc");
  const firstValidDate = sorted.map((row) => parseDateToIso(row.date)).find((date): date is string => date !== null) ?? null;
  const lastValidDate = sorted
    .slice()
    .reverse()
    .map((row) => parseDateToIso(row.date))
    .find((date): date is string => date !== null) ?? null;
  const review = analyzeDrawHistoryRows(rows);
  const simulatedRows = rows.filter((row) => row.isSimulated).length;

  return {
    totalRows: rows.length,
    realRows: rows.length - simulatedRows,
    simulatedRows,
    earliestDate: firstValidDate,
    latestDate: lastValidDate,
    exactDuplicateIssues: review.exactDuplicateIssues.length,
    sameDateConflictIssues: review.sameDateConflictIssues.length,
    repeatedNumberSetIssues: review.sameNumbersDifferentDateIssues.length,
    issueCount: review.issues.length,
  };
}

import { Draw } from "../types";
import type { DrawRow } from "./drawHistory";

export type DrawHistoryIssueKind = "exactDuplicate" | "sameDateConflict" | "sameNumbersDifferentDate";
export type DrawHistoryIssueSeverity = "error" | "warning";

export interface DrawHistoryIssue {
  id: string;
  kind: DrawHistoryIssueKind;
  severity: DrawHistoryIssueSeverity;
  title: string;
  description: string;
  rowIndices: number[];
  normalizedDate?: string;
  numbersKey?: string;
  differingValueCount?: number;
}

export interface DrawHistoryReview {
  totalRows: number;
  issues: DrawHistoryIssue[];
  exactDuplicateIssues: DrawHistoryIssue[];
  sameDateConflictIssues: DrawHistoryIssue[];
  sameNumbersDifferentDateIssues: DrawHistoryIssue[];
  autoDropIndices: number[];
}

export interface DrawHistoryComparisonGroup {
  normalizedDate: string;
  localIndices: number[];
  sourceIndices: number[];
  localRows: DrawRow[];
  sourceRows: DrawRow[];
}

export interface DrawHistoryComparison {
  localRowCount: number;
  sourceRowCount: number;
  exactMatchCount: number;
  missingInLocal: DrawHistoryComparisonGroup[];
  extraInLocal: DrawHistoryComparisonGroup[];
  conflictingDates: DrawHistoryComparisonGroup[];
}

export interface MergeMissingSourceRowsResult {
  rows: DrawRow[];
  sourceRowCount: number;
  addedRowCount: number;
  missingDateCount: number;
  conflictingDateCount: number;
  extraLocalDateCount: number;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function parseHistoryDateToParts(rawDate: string): { year: number; month: number; day: number } | null {
  const trimmed = rawDate.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
    };
  }

  const shortMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
  if (shortMatch) {
    let year = Number(shortMatch[3]);
    if (year < 100) {
      year += 2000;
    }
    return {
      year,
      month: Number(shortMatch[1]),
      day: Number(shortMatch[2]),
    };
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return {
    year: parsed.getFullYear(),
    month: parsed.getMonth() + 1,
    day: parsed.getDate(),
  };
}

function parseHistoryDateToEpoch(rawDate: string): number {
  const parts = parseHistoryDateToParts(rawDate);
  if (!parts) {
    return 0;
  }
  return new Date(parts.year, parts.month - 1, parts.day).getTime();
}

function sortNumbers(numbers: number[]): number[] {
  return numbers.slice().sort((a, b) => a - b);
}

function countDifferingValues(left: DrawRow, right: DrawRow): number {
  const leftCounts = new Map<number, number>();
  const rightCounts = new Map<number, number>();
  [...left.mains, ...left.supps].forEach((value) => {
    leftCounts.set(value, (leftCounts.get(value) ?? 0) + 1);
  });
  [...right.mains, ...right.supps].forEach((value) => {
    rightCounts.set(value, (rightCounts.get(value) ?? 0) + 1);
  });

  let differing = 0;
  const values = new Set([...leftCounts.keys(), ...rightCounts.keys()]);
  values.forEach((value) => {
    differing += Math.abs((leftCounts.get(value) ?? 0) - (rightCounts.get(value) ?? 0));
  });
  return differing;
}

export function normalizeHistoryDate(rawDate: string): string {
  const parts = parseHistoryDateToParts(rawDate);
  if (!parts) {
    return rawDate.trim();
  }
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function formatIsoDateAsMdyy(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  const year = Number(match[1]) % 100;
  const month = Number(match[2]);
  const day = Number(match[3]);
  return `${month}/${day}/${pad2(year)}`;
}

export function buildHistoryNumbersKey(row: DrawRow): string {
  return `${sortNumbers(row.mains).join("-")}::${sortNumbers(row.supps).join("-")}`;
}

export function buildHistoryExactKey(row: DrawRow): string {
  return `${normalizeHistoryDate(row.date)}|${buildHistoryNumbersKey(row)}`;
}

export function describeDrawRow(row: DrawRow): string {
  return `${row.date} · Main ${row.mains.join(", ")} · Supp ${row.supps.join(", ")}`;
}

export function rowsFromDraws(draws: Draw[]): DrawRow[] {
  return draws.map((draw) => ({
    date: draw.date,
    mains: draw.main.slice(),
    supps: draw.supp.slice(),
    isSimulated: draw.isSimulated,
  }));
}

export function drawsFromRows(rows: DrawRow[]): Draw[] {
  return rows.map((row) => ({
    date: row.date,
    main: row.mains.slice(),
    supp: row.supps.slice(),
    isSimulated: row.isSimulated,
  }));
}

export function sortHistoryRows(rows: DrawRow[], direction: "asc" | "desc" = "desc"): DrawRow[] {
  const factor = direction === "asc" ? 1 : -1;
  return rows.slice().sort((left, right) => {
    const delta = parseHistoryDateToEpoch(left.date) - parseHistoryDateToEpoch(right.date);
    if (delta !== 0) {
      return delta * factor;
    }
    return buildHistoryNumbersKey(left).localeCompare(buildHistoryNumbersKey(right)) * factor;
  });
}

export function analyzeDrawHistoryRows(rows: DrawRow[]): DrawHistoryReview {
  const exactGroups = new Map<string, number[]>();
  const dateGroups = new Map<string, number[]>();
  const numbersGroups = new Map<string, number[]>();

  rows.forEach((row, index) => {
    const exactKey = buildHistoryExactKey(row);
    const normalizedDate = normalizeHistoryDate(row.date);
    const numbersKey = buildHistoryNumbersKey(row);

    exactGroups.set(exactKey, [...(exactGroups.get(exactKey) ?? []), index]);
    dateGroups.set(normalizedDate, [...(dateGroups.get(normalizedDate) ?? []), index]);
    numbersGroups.set(numbersKey, [...(numbersGroups.get(numbersKey) ?? []), index]);
  });

  const exactDuplicateIssues: DrawHistoryIssue[] = [];
  const sameDateConflictIssues: DrawHistoryIssue[] = [];
  const sameNumbersDifferentDateIssues: DrawHistoryIssue[] = [];
  const autoDropIndices: number[] = [];

  exactGroups.forEach((rowIndices, key) => {
    if (rowIndices.length < 2) {
      return;
    }
    autoDropIndices.push(...rowIndices.slice(1));
    exactDuplicateIssues.push({
      id: `exact-${key}`,
      kind: "exactDuplicate",
      severity: "error",
      title: "Exact duplicate draw",
      description: `${rowIndices.length} identical entries were found. Keeping the first occurrence and removing the extras is usually safe.`,
      rowIndices,
      normalizedDate: normalizeHistoryDate(rows[rowIndices[0]].date),
      numbersKey: buildHistoryNumbersKey(rows[rowIndices[0]]),
    });
  });

  dateGroups.forEach((rowIndices, normalizedDate) => {
    const uniqueExactKeys = new Set(rowIndices.map((index) => buildHistoryExactKey(rows[index])));
    if (uniqueExactKeys.size < 2) {
      return;
    }

    let differingValueCount: number | undefined;
    if (rowIndices.length === 2) {
      differingValueCount = countDifferingValues(rows[rowIndices[0]], rows[rowIndices[1]]);
    }

    let description = `${rowIndices.length} entries share the same draw date but have different numbers.`;
    if (differingValueCount === 2) {
      description += " Only one number differs, which often signals a manual typo.";
    } else if (typeof differingValueCount === "number" && differingValueCount <= 4) {
      description += " A small number of values differ, so this is worth reviewing closely.";
    }

    sameDateConflictIssues.push({
      id: `date-${normalizedDate}`,
      kind: "sameDateConflict",
      severity: "error",
      title: "Conflicting entries for one draw date",
      description,
      rowIndices,
      normalizedDate,
      differingValueCount,
    });
  });

  numbersGroups.forEach((rowIndices, numbersKey) => {
    const uniqueDates = new Set(rowIndices.map((index) => normalizeHistoryDate(rows[index].date)));
    if (uniqueDates.size < 2) {
      return;
    }

    sameNumbersDifferentDateIssues.push({
      id: `numbers-${numbersKey}`,
      kind: "sameNumbersDifferentDate",
      severity: "warning",
      title: "Same number set appears on multiple dates",
      description: `${rowIndices.length} entries have the exact same main/supp numbers but different dates. This can happen naturally, but it is rare enough to review for copy/paste errors.`,
      rowIndices,
      numbersKey,
    });
  });

  const issues = [...exactDuplicateIssues, ...sameDateConflictIssues, ...sameNumbersDifferentDateIssues].sort(
    (left, right) => (left.rowIndices[0] ?? 0) - (right.rowIndices[0] ?? 0),
  );

  return {
    totalRows: rows.length,
    issues,
    exactDuplicateIssues,
    sameDateConflictIssues,
    sameNumbersDifferentDateIssues,
    autoDropIndices: Array.from(new Set(autoDropIndices)).sort((left, right) => left - right),
  };
}

export function applyAutomaticHistoryCorrections(rows: DrawRow[], review: DrawHistoryReview = analyzeDrawHistoryRows(rows)): DrawRow[] {
  const dropped = new Set(review.autoDropIndices);
  return rows.filter((_, index) => !dropped.has(index));
}

export function dropHistoryRowAtIndex(rows: DrawRow[], indexToDrop: number): DrawRow[] {
  return rows.filter((_, index) => index !== indexToDrop);
}

export function replaceHistoryRowAtIndex(rows: DrawRow[], indexToReplace: number, replacement: DrawRow): DrawRow[] {
  return rows.map((row, index) => (index === indexToReplace ? replacement : row));
}

export function keepOnlyDateVersion(rows: DrawRow[], keepIndex: number): DrawRow[] {
  const targetRow = rows[keepIndex];
  if (!targetRow) {
    return rows.slice();
  }
  const normalizedDate = normalizeHistoryDate(targetRow.date);
  return rows.filter((row, index) => index === keepIndex || normalizeHistoryDate(row.date) !== normalizedDate);
}

export function keepOnlyNumbersVersion(rows: DrawRow[], keepIndex: number): DrawRow[] {
  const targetRow = rows[keepIndex];
  if (!targetRow) {
    return rows.slice();
  }
  const numbersKey = buildHistoryNumbersKey(targetRow);
  return rows.filter((row, index) => index === keepIndex || buildHistoryNumbersKey(row) !== numbersKey);
}

function compareExactKeyArrays(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export function compareOfficialSourceRows(localRows: DrawRow[], sourceRows: DrawRow[]): DrawHistoryComparison {
  const localDateMap = new Map<string, number[]>();
  const sourceDateMap = new Map<string, number[]>();

  localRows.forEach((row, index) => {
    const normalizedDate = normalizeHistoryDate(row.date);
    localDateMap.set(normalizedDate, [...(localDateMap.get(normalizedDate) ?? []), index]);
  });
  sourceRows.forEach((row, index) => {
    const normalizedDate = normalizeHistoryDate(row.date);
    sourceDateMap.set(normalizedDate, [...(sourceDateMap.get(normalizedDate) ?? []), index]);
  });

  const allDates = Array.from(new Set([...localDateMap.keys(), ...sourceDateMap.keys()])).sort();
  const missingInLocal: DrawHistoryComparisonGroup[] = [];
  const extraInLocal: DrawHistoryComparisonGroup[] = [];
  const conflictingDates: DrawHistoryComparisonGroup[] = [];
  let exactMatchCount = 0;

  allDates.forEach((normalizedDate) => {
    const localIndices = localDateMap.get(normalizedDate) ?? [];
    const sourceIndices = sourceDateMap.get(normalizedDate) ?? [];
    const localGroupRows = localIndices.map((index) => localRows[index]);
    const sourceGroupRows = sourceIndices.map((index) => sourceRows[index]);

    if (localIndices.length === 0) {
      missingInLocal.push({
        normalizedDate,
        localIndices,
        sourceIndices,
        localRows: [],
        sourceRows: sourceGroupRows,
      });
      return;
    }

    if (sourceIndices.length === 0) {
      extraInLocal.push({
        normalizedDate,
        localIndices,
        sourceIndices,
        localRows: localGroupRows,
        sourceRows: [],
      });
      return;
    }

    const localKeys = localGroupRows.map((row) => buildHistoryExactKey(row)).sort();
    const sourceKeys = sourceGroupRows.map((row) => buildHistoryExactKey(row)).sort();
    if (compareExactKeyArrays(localKeys, sourceKeys)) {
      exactMatchCount += sourceIndices.length;
      return;
    }

    conflictingDates.push({
      normalizedDate,
      localIndices,
      sourceIndices,
      localRows: localGroupRows,
      sourceRows: sourceGroupRows,
    });
  });

  return {
    localRowCount: localRows.length,
    sourceRowCount: sourceRows.length,
    exactMatchCount,
    missingInLocal,
    extraInLocal,
    conflictingDates,
  };
}

export function addSourceRowIfMissing(localRows: DrawRow[], sourceRow: DrawRow): DrawRow[] {
  const exactKey = buildHistoryExactKey(sourceRow);
  if (localRows.some((row) => buildHistoryExactKey(row) === exactKey)) {
    return sortHistoryRows(localRows, "desc");
  }
  return sortHistoryRows([...localRows, sourceRow], "desc");
}

export function replaceLocalDateWithSourceRow(localRows: DrawRow[], sourceRow: DrawRow): DrawRow[] {
  const normalizedDate = normalizeHistoryDate(sourceRow.date);
  return sortHistoryRows([
    ...localRows.filter((row) => normalizeHistoryDate(row.date) !== normalizedDate),
    sourceRow,
  ], "desc");
}

export function applySafeOfficialSourceCorrections(localRows: DrawRow[], comparison: DrawHistoryComparison): DrawRow[] {
  let nextRows = sortHistoryRows(localRows, "desc");

  comparison.missingInLocal.forEach((group) => {
    group.sourceRows.forEach((sourceRow) => {
      nextRows = addSourceRowIfMissing(nextRows, sourceRow);
    });
  });

  comparison.conflictingDates.forEach((group) => {
    if (group.sourceRows.length === 1) {
      nextRows = replaceLocalDateWithSourceRow(nextRows, group.sourceRows[0]);
    }
  });

  return sortHistoryRows(nextRows, "desc");
}

export function mergeMissingSourceRows(localRows: DrawRow[], sourceRows: DrawRow[]): MergeMissingSourceRowsResult {
  const officialRows = sourceRows.filter((row) => !row.isSimulated);
  if (officialRows.length === 0) {
    return {
      rows: sortHistoryRows(localRows, "desc"),
      sourceRowCount: 0,
      addedRowCount: 0,
      missingDateCount: 0,
      conflictingDateCount: 0,
      extraLocalDateCount: 0,
    };
  }

  const comparison = compareOfficialSourceRows(localRows, officialRows);
  let nextRows = sortHistoryRows(localRows, "desc");
  let addedRowCount = 0;

  comparison.missingInLocal.forEach((group) => {
    group.sourceRows.forEach((sourceRow) => {
      const beforeLength = nextRows.length;
      nextRows = addSourceRowIfMissing(nextRows, sourceRow);
      if (nextRows.length > beforeLength) {
        addedRowCount += 1;
      }
    });
  });

  return {
    rows: sortHistoryRows(nextRows, "desc"),
    sourceRowCount: officialRows.length,
    addedRowCount,
    missingDateCount: comparison.missingInLocal.length,
    conflictingDateCount: comparison.conflictingDates.length,
    extraLocalDateCount: comparison.extraInLocal.length,
  };
}

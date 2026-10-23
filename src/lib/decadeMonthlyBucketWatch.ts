import type { Draw } from "../types";
import { strictValidateDraws } from "./strictDrawValidation";
import { getExcludedMonthLabelsForHistoryBaselines } from "./monthlyAverageScope";
import {
  buildPlanningDrawContext,
  countScheduledDrawsInMonth,
  datePartsToIso,
  isScheduledDrawDate,
  parseDrawDateParts,
} from "./planningDrawContext";

export const DECADE_BUCKET_WATCH_VERSION = "DBW-1";
export const DECADE_BUCKET_REFERENCE_RATE = 8 / 45;
export const DECADE_BUCKET_GROUPS = [
  { label: "1-9", first: 1, last: 9 },
  { label: "10-19", first: 10, last: 19 },
  { label: "20-29", first: 20, last: 29 },
  { label: "30-39", first: 30, last: 39 },
  { label: "40-45", first: 40, last: 45 },
] as const;

export interface DecadeBucketWatchOptions {
  now?: Date | string;
  ordinal?: "target" | "all" | number;
  monthLength?: "all" | "target" | number;
}

export interface DecadeBucketWatchCell {
  group: number;
  bucket: number;
  hits: number;
  opportunities: number;
  draws: number;
  months: number;
  observedRate: number | null;
  expectedHits: number;
  differencePP: number | null;
  sample: "No sample" | "Thin" | "Exploratory";
  early: { hits: number; opportunities: number; rate: number | null };
  later: { hits: number; opportunities: number; rate: number | null };
  currentNumbers: number[];
}

export interface DecadeBucketWatchResult {
  modelVersion: typeof DECADE_BUCKET_WATCH_VERSION;
  ordinal: number | "all" | null;
  monthLength: number | "all" | null;
  validDraws: number;
  baselineDraws: number;
  matchedDraws: number;
  matchedMonths: number;
  invalidRows: number;
  duplicateRows: number;
  conflictingRows: number;
  simulatedRows: number;
  incompletePrefixDraws: number;
  excludedOpeningMonths: string[];
  latestDate: string | null;
  target: { date: string; month: string; ordinal: number; length: number; prefixComplete: boolean } | null;
  cells: DecadeBucketWatchCell[];
  warnings: string[];
}

interface Frame {
  month: string;
  ordinal: number;
  length: number;
  before: number[];
  numbers: Set<number>;
}

export function analyzeDecadeMonthlyBuckets(
  history: readonly Draw[],
  options: DecadeBucketWatchOptions = {},
): DecadeBucketWatchResult {
  let invalidRows = 0;
  let duplicateRows = 0;
  let conflictingRows = 0;
  let simulatedRows = 0;
  const byDate = new Map<string, Draw[]>();
  for (const draw of history) {
    if (draw.isSimulated) { simulatedRows++; continue; }
    const parts = parseDrawDateParts(draw.date);
    if (!parts || !isScheduledDrawDate(parts) || strictValidateDraws([draw]).length !== 1) {
      invalidRows++;
      continue;
    }
    const date = datePartsToIso(parts);
    const rows = byDate.get(date) ?? [];
    rows.push({ ...draw, date });
    byDate.set(date, rows);
  }
  const valid: Draw[] = [];
  for (const rows of byDate.values()) {
    const fingerprints = new Set(rows.map(row => (
      `${[...row.main].sort((a, b) => a - b).join(",")}|${[...row.supp].sort((a, b) => a - b).join(",")}`
    )));
    if (fingerprints.size > 1) { conflictingRows += rows.length; continue; }
    valid.push(rows[0]);
    duplicateRows += rows.length - 1;
  }
  valid.sort((a, b) => a.date.localeCompare(b.date));
  const excludedOpeningMonths = getExcludedMonthLabelsForHistoryBaselines(valid, row => row.date.slice(0, 7), row => row.date);
  const baseline = valid.filter(row => !excludedOpeningMonths.includes(row.date.slice(0, 7)));
  const frames: Frame[] = [];
  let incompletePrefixDraws = 0;
  let month = "";
  let prefixLength = 0;
  let counts = new Array<number>(46).fill(0);
  for (const draw of baseline) {
    const label = draw.date.slice(0, 7);
    if (label !== month) { month = label; prefixLength = 0; counts = new Array<number>(46).fill(0); }
    const parts = parseDrawDateParts(draw.date)!;
    const ordinal = countScheduledDrawsInMonth(month, parts.day);
    // Missing earlier results make every later origin in that month unknowable.
    if (ordinal !== prefixLength + 1) { incompletePrefixDraws++; continue; }
    const numbers = new Set([...draw.main, ...draw.supp]);
    frames.push({ month, ordinal, length: countScheduledDrawsInMonth(month), before: [...counts], numbers });
    for (const number of numbers) counts[number]++;
    prefixLength++;
  }

  const planning = valid.length ? buildPlanningDrawContext(valid, { now: options.now }) : null;
  let target: DecadeBucketWatchResult["target"] = null;
  const currentCounts = new Array<number>(46).fill(0);
  if (planning) {
    const parts = parseDrawDateParts(planning.targetDrawDate)!;
    const targetOrdinal = countScheduledDrawsInMonth(planning.targetMonthLabel, parts.day);
    const prior = valid.filter(row => row.date.slice(0, 7) === planning.targetMonthLabel && row.date < planning.targetDrawDate);
    const prefixComplete = prior.length === targetOrdinal - 1 && prior.every((row, index) => (
      countScheduledDrawsInMonth(planning.targetMonthLabel, parseDrawDateParts(row.date)!.day) === index + 1
    ));
    target = { date: planning.targetDrawDate, month: planning.targetMonthLabel, ordinal: targetOrdinal, length: planning.targetMonthExpectedDrawCount, prefixComplete };
    if (prefixComplete) for (const row of prior) for (const number of [...row.main, ...row.supp]) currentCounts[number]++;
  }
  const ordinalOption = options.ordinal ?? "target";
  const lengthOption = options.monthLength ?? "all";
  const ordinal = ordinalOption === "target" ? target?.ordinal ?? null : ordinalOption;
  const monthLength = lengthOption === "target" ? target?.length ?? null : lengthOption;
  const matched = frames.filter(frame => (
    (ordinal === "all" || frame.ordinal === ordinal) && (monthLength === "all" || frame.length === monthLength)
  ));
  const split = Math.floor(matched.length / 2);
  const cells = DECADE_BUCKET_GROUPS.flatMap((group, groupIndex) => Array.from({ length: 9 }, (_, bucket): DecadeBucketWatchCell => {
    const months = new Set<string>();
    let hits = 0;
    let opportunities = 0;
    let draws = 0;
    const halves = [{ hits: 0, opportunities: 0 }, { hits: 0, opportunities: 0 }];
    for (const [index, frame] of matched.entries()) {
      let available = 0;
      for (let number = group.first; number <= group.last; number++) {
        if (Math.min(8, frame.before[number]) !== bucket) continue;
        available++;
        const hit = Number(frame.numbers.has(number));
        hits += hit;
        halves[index < split ? 0 : 1].hits += hit;
      }
      if (available) { draws++; months.add(frame.month); }
      opportunities += available;
      halves[index < split ? 0 : 1].opportunities += available;
    }
    const observedRate = opportunities ? hits / opportunities : null;
    const currentNumbers: number[] = [];
    if (target?.prefixComplete) for (let number = group.first; number <= group.last; number++) {
      if (Math.min(8, currentCounts[number]) === bucket) currentNumbers.push(number);
    }
    return {
      group: groupIndex, bucket, hits, opportunities, draws, months: months.size, observedRate,
      expectedHits: opportunities * DECADE_BUCKET_REFERENCE_RATE,
      differencePP: observedRate === null ? null : 100 * (observedRate - DECADE_BUCKET_REFERENCE_RATE),
      sample: !opportunities ? "No sample" : draws < 30 || months.size < 10 ? "Thin" : "Exploratory",
      early: { ...halves[0], rate: halves[0].opportunities ? halves[0].hits / halves[0].opportunities : null },
      later: { ...halves[1], rate: halves[1].opportunities ? halves[1].hits / halves[1].opportunities : null },
      currentNumbers,
    };
  }));
  const warnings: string[] = [];
  if (excludedOpeningMonths.length) warnings.push(`Opening partial month excluded: ${excludedOpeningMonths.join(", ")}.`);
  if (incompletePrefixDraws) warnings.push(`${incompletePrefixDraws} draws omitted because an earlier scheduled result in their month is missing.`);
  if (invalidRows || conflictingRows || duplicateRows || simulatedRows) warnings.push(`Ignored ${invalidRows} invalid/off-schedule, ${conflictingRows} conflicting, ${duplicateRows} duplicate and ${simulatedRows} simulated rows.`);
  if (target && !target.prefixComplete) warnings.push("Current monthly bucket origins are unavailable until missing earlier results are recorded.");
  return {
    modelVersion: DECADE_BUCKET_WATCH_VERSION, ordinal, monthLength, target, cells, warnings,
    validDraws: valid.length, baselineDraws: baseline.length, matchedDraws: matched.length,
    matchedMonths: new Set(matched.map(frame => frame.month)).size,
    invalidRows, duplicateRows, conflictingRows, simulatedRows, incompletePrefixDraws,
    excludedOpeningMonths, latestDate: valid[valid.length - 1]?.date ?? null,
  };
}

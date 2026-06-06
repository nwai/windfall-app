import type { Draw } from "../types";
import { getExcludedMonthLabelsForHistoryBaselines } from "./monthlyAverageScope";
import { parseDrawDateToEpoch, sortDrawsChronologically } from "./recentDraws";

const TOTAL_NUMBERS = 45;
const BUCKETS = ["1x", "2x", "3x", "4x", "5x", "6x", "7x", "8x+"] as const;

export type MonthEndCarryOverBucket = typeof BUCKETS[number];

export interface MonthEndCarryOverBucketEvent {
  number: number;
  bucket: MonthEndCarryOverBucket;
  sourceMonthLabel: string;
  targetMonthLabel: string;
  boundaryLabel: string;
  sourceLastDrawDate: string;
  targetFirstDrawDate: string;
  sourceMonthHits: number;
  targetMonthHits: number;
}

export interface MonthEndCarryOverBucketRow {
  bucket: MonthEndCarryOverBucket;
  sourceObservations: number;
  lastDrawObservations: number;
  carryOverInstances: number;
  carryOverRate: number;
  carryOverNumbers: MonthEndCarryOverBucketEvent[];
  uniqueCarryOverNumbers: number[];
}

export interface MonthEndCarryOverBucketSummary {
  transitions: number;
  totalCarryOverInstances: number;
  highBucketCarryOverInstances: number;
  leadingBucket: MonthEndCarryOverBucket | null;
  leadingBuckets: MonthEndCarryOverBucket[];
  skippedGapTransitions: number;
  skippedPartialSourceTransitions: number;
}

export interface MonthEndCarryOverBucketAnalysis {
  bucketRows: MonthEndCarryOverBucketRow[];
  events: MonthEndCarryOverBucketEvent[];
  summary: MonthEndCarryOverBucketSummary;
  notes: string[];
}

interface MonthlySegment {
  monthLabel: string;
  draws: Draw[];
  sourceCounts: Map<number, number>;
}

const toMonthLabel = (epoch: number): string => {
  const date = new Date(epoch);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const nextMonthLabel = (monthLabel: string): string => {
  const [yearRaw, monthRaw] = monthLabel.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return "";
  if (month === 12) return `${year + 1}-01`;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
};

const selectedNumbers = (draw: Draw, includeSupp: boolean): number[] => {
  const values = [
    ...(Array.isArray(draw.main) ? draw.main : []),
    ...(includeSupp && Array.isArray(draw.supp) ? draw.supp : []),
  ];
  return values.filter((value) => Number.isInteger(value) && value >= 1 && value <= TOTAL_NUMBERS);
};

const bucketForCount = (count: number): MonthEndCarryOverBucket | null => {
  if (count <= 0) return null;
  if (count >= 8) return "8x+";
  return `${count}x` as MonthEndCarryOverBucket;
};

const buildMonthlySegments = (history: Draw[], includeSupp: boolean): MonthlySegment[] => {
  const segments: MonthlySegment[] = [];
  let active: MonthlySegment | null = null;

  for (const draw of sortDrawsChronologically(history)) {
    const epoch = parseDrawDateToEpoch(draw.date);
    if (!epoch) continue;
    const monthLabel = toMonthLabel(epoch);
    if (!active || active.monthLabel !== monthLabel) {
      active = {
        monthLabel,
        draws: [],
        sourceCounts: new Map<number, number>(),
      };
      segments.push(active);
    }

    active.draws.push(draw);
    for (const number of selectedNumbers(draw, includeSupp)) {
      active.sourceCounts.set(number, (active.sourceCounts.get(number) ?? 0) + 1);
    }
  }

  return segments;
};

export function analyzeMonthEndCarryOverBuckets(
  history: Draw[],
  options: { includeSupp?: boolean; excludePartialSourceMonths?: boolean } = {},
): MonthEndCarryOverBucketAnalysis {
  const includeSupp = options.includeSupp ?? true;
  const excludePartialSourceMonths = options.excludePartialSourceMonths ?? true;
  const segments = buildMonthlySegments(history, includeSupp);
  const excludedMonthLabels = excludePartialSourceMonths
    ? new Set(getExcludedMonthLabelsForHistoryBaselines(segments, (segment) => segment.monthLabel))
    : new Set<string>();

  const sourceObservationsByBucket = new Map<MonthEndCarryOverBucket, number>();
  const lastDrawObservationsByBucket = new Map<MonthEndCarryOverBucket, number>();
  const eventsByBucket = new Map<MonthEndCarryOverBucket, MonthEndCarryOverBucketEvent[]>();
  BUCKETS.forEach((bucket) => {
    sourceObservationsByBucket.set(bucket, 0);
    lastDrawObservationsByBucket.set(bucket, 0);
    eventsByBucket.set(bucket, []);
  });

  const events: MonthEndCarryOverBucketEvent[] = [];
  let transitions = 0;
  let skippedGapTransitions = 0;
  let skippedPartialSourceTransitions = 0;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const source = segments[index];
    const target = segments[index + 1];

    if (excludedMonthLabels.has(source.monthLabel)) {
      skippedPartialSourceTransitions += 1;
      continue;
    }
    if (target.monthLabel !== nextMonthLabel(source.monthLabel)) {
      skippedGapTransitions += 1;
      continue;
    }
    if (source.draws.length === 0 || target.draws.length === 0) continue;

    transitions += 1;
    source.sourceCounts.forEach((count) => {
      const bucket = bucketForCount(count);
      if (bucket) sourceObservationsByBucket.set(bucket, (sourceObservationsByBucket.get(bucket) ?? 0) + 1);
    });

    const sourceLastDraw = source.draws[source.draws.length - 1];
    const targetFirstDraw = target.draws[0];
    const targetFirstSet = new Set(selectedNumbers(targetFirstDraw, includeSupp));
    const targetCounts = target.sourceCounts;
    const sourceLastDrawNumbers = Array.from(new Set(selectedNumbers(sourceLastDraw, includeSupp))).sort((left, right) => left - right);

    for (const number of sourceLastDrawNumbers) {
      const sourceMonthHits = source.sourceCounts.get(number) ?? 0;
      const bucket = bucketForCount(sourceMonthHits);
      if (bucket) {
        lastDrawObservationsByBucket.set(bucket, (lastDrawObservationsByBucket.get(bucket) ?? 0) + 1);
      }
    }

    const carryOverNumbers = sourceLastDrawNumbers
      .filter((number) => targetFirstSet.has(number))
      .sort((left, right) => left - right);

    for (const number of carryOverNumbers) {
      const sourceMonthHits = source.sourceCounts.get(number) ?? 0;
      const bucket = bucketForCount(sourceMonthHits);
      if (!bucket) continue;
      const event: MonthEndCarryOverBucketEvent = {
        number,
        bucket,
        sourceMonthLabel: source.monthLabel,
        targetMonthLabel: target.monthLabel,
        boundaryLabel: `${source.monthLabel}->${target.monthLabel}`,
        sourceLastDrawDate: sourceLastDraw.date,
        targetFirstDrawDate: targetFirstDraw.date,
        sourceMonthHits,
        targetMonthHits: targetCounts.get(number) ?? 0,
      };
      events.push(event);
      eventsByBucket.get(bucket)?.push(event);
    }
  }

  const bucketRows = BUCKETS.map<MonthEndCarryOverBucketRow>((bucket) => {
    const bucketEvents = eventsByBucket.get(bucket) ?? [];
    const sourceObservations = sourceObservationsByBucket.get(bucket) ?? 0;
    const lastDrawObservations = lastDrawObservationsByBucket.get(bucket) ?? 0;
    const uniqueCarryOverNumbers = Array.from(new Set(bucketEvents.map((event) => event.number))).sort((left, right) => left - right);
    return {
      bucket,
      sourceObservations,
      lastDrawObservations,
      carryOverInstances: bucketEvents.length,
      carryOverRate: lastDrawObservations > 0 ? bucketEvents.length / lastDrawObservations : 0,
      carryOverNumbers: bucketEvents.sort((left, right) => left.number - right.number || left.boundaryLabel.localeCompare(right.boundaryLabel)),
      uniqueCarryOverNumbers,
    };
  });

  const maxCarryOverInstances = bucketRows.reduce((max, row) => Math.max(max, row.carryOverInstances), 0);
  const leadingBuckets = maxCarryOverInstances > 0
    ? bucketRows.filter((row) => row.carryOverInstances === maxCarryOverInstances).map((row) => row.bucket)
    : [];
  const leadingBucket = leadingBuckets[0] ?? null;

  const highBucketCarryOverInstances = bucketRows
    .filter((row) => row.bucket === "6x" || row.bucket === "7x" || row.bucket === "8x+")
    .reduce((sum, row) => sum + row.carryOverInstances, 0);

  const notes = [
    "Bucket means how many times the carry-over number appeared in the source month that just ended.",
    "Source observations count number-month opportunities in each bucket across evaluated month boundaries.",
    "Last-draw observations count source-month bucketed numbers that actually appeared in the final draw before the month boundary.",
    "Carry-over means the number appeared in the last draw of the source month and the first draw of the next month.",
    "Rate is carry-over divided by last-draw observations, so it is conditioned on being present at month end.",
  ];
  if (skippedPartialSourceTransitions > 0) {
    notes.push(`Excluded ${skippedPartialSourceTransitions} opening partial-month transition${skippedPartialSourceTransitions === 1 ? "" : "s"} from bucket rates.`);
  }
  if (skippedGapTransitions > 0) {
    notes.push(`Skipped ${skippedGapTransitions} non-consecutive month transition${skippedGapTransitions === 1 ? "" : "s"}.`);
  }

  return {
    bucketRows,
    events: events.sort((left, right) => left.sourceMonthLabel.localeCompare(right.sourceMonthLabel) || left.number - right.number),
    summary: {
      transitions,
      totalCarryOverInstances: events.length,
      highBucketCarryOverInstances,
      leadingBucket,
      leadingBuckets,
      skippedGapTransitions,
      skippedPartialSourceTransitions,
    },
    notes,
  };
}

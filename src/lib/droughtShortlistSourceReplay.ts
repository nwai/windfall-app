import type { Draw } from "../types";
import { STRICT_DROUGHT_DEFAULT_THRESHOLD } from "./droughtHazard";
import {
  buildEmpiricalDroughtQuotaShortlist,
  buildStrictDroughtQuotaShortlist,
} from "./strictDroughtQuotaAdvice";

const LOTTERY_NUMBER_COUNT = 45;
const DRAW_SIZE = 8;
const DEFAULT_TOP_K = 8;
const DEFAULT_MIN_HISTORY = 24;

export type DroughtHitSource = "strict-only" | "empirical-only" | "both";
export type DroughtDrawSourceClass = "none" | "strict-only" | "empirical-only" | "overlap-only" | "mixed";

export interface DroughtShortlistHitDetail {
  number: number;
  where: "main" | "supp";
  source: DroughtHitSource;
  strictRank: number | null;
  empiricalRank: number | null;
}

export interface DroughtShortlistSourceReplayRecord {
  targetIndex: number;
  targetDate: string;
  targetDrawOrdinal: number | null;
  targetMonthDrawCount: number | null;
  targetMonthComplete: boolean;
  trainingDraws: number;
  strictShortlist: number[];
  empiricalShortlist: number[];
  shortlistOverlapSize: number;
  shortlistUnionSize: number;
  strictOnlyHits: DroughtShortlistHitDetail[];
  empiricalOnlyHits: DroughtShortlistHitDetail[];
  overlappingHits: DroughtShortlistHitDetail[];
  unionHitCount: number;
  strictHitCount: number;
  empiricalHitCount: number;
  drawClass: DroughtDrawSourceClass;
}

export interface DroughtShortlistSourceRow {
  key: DroughtHitSource;
  label: string;
  count: number;
  share: number;
}

export interface DroughtShortlistDrawClassRow {
  key: DroughtDrawSourceClass;
  label: string;
  count: number;
  share: number;
}

export interface DroughtShortlistStageRow {
  stageLabel: string;
  monthDrawCount: number | null;
  drawOrdinal: number | null;
  targetMonthComplete: boolean;
  trials: number;
  averageUnionHits: number;
  averageStrictHits: number;
  averageEmpiricalHits: number;
  averageOverlapHits: number;
  zeroHitRate: number;
}

export interface DroughtShortlistSourceReplayResult {
  scope: "mains+supps";
  sourceDraws: number;
  eligibleTrials: number;
  minHistory: number;
  topK: number;
  strictThreshold: number;
  firstTargetDate: string | null;
  latestTargetDate: string | null;
  sourceRows: DroughtShortlistSourceRow[];
  drawClassRows: DroughtShortlistDrawClassRow[];
  stageRows: DroughtShortlistStageRow[];
  latestRows: DroughtShortlistSourceReplayRecord[];
  averageShortlistOverlapSize: number;
  averageShortlistUnionSize: number;
  averageUnionHits: number;
  averageStrictHits: number;
  averageEmpiricalHits: number;
  unionHitDrawRate: number;
  strictAnyDrawRate: number;
  empiricalAnyDrawRate: number;
  expectedRandomUnionHitDrawRate: number;
  expectedRandomUnionHits: number;
  exclusiveSplitPValue: number | null;
}

export interface DroughtShortlistSourceReplayOptions {
  topK?: number;
  strictThreshold?: number;
  minHistory?: number;
  latestRowCount?: number;
  contextHistory?: Draw[];
  strictShortlistBuilder?: (trainingHistory: Draw[]) => number[];
  empiricalShortlistBuilder?: (trainingHistory: Draw[]) => number[];
}

const parseDateToEpoch = (date: string): number => {
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(date.trim());
  if (slash) {
    const year = Number(slash[3]) < 100 ? 2000 + Number(slash[3]) : Number(slash[3]);
    return Date.UTC(year, Number(slash[1]) - 1, Number(slash[2]));
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date.trim());
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const parsed = Date.parse(date);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const monthLabelForDate = (date: string): string | null => {
  const epoch = parseDateToEpoch(date);
  if (!Number.isFinite(epoch)) return null;
  const parsed = new Date(epoch);
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
};

const drawNumbers = (draw: Draw): number[] => [...draw.main, ...draw.supp];

const isValidRealDraw = (draw: Draw): boolean => {
  if (draw.isSimulated) return false;
  const numbers = drawNumbers(draw);
  return draw.main.length === 6
    && draw.supp.length === 2
    && numbers.length === 8
    && new Set(numbers).size === 8
    && numbers.every((number) => Number.isInteger(number) && number >= 1 && number <= 45);
};

const normalizeHistory = (history: Draw[]): Draw[] => history
  .map((draw, index) => ({ draw, index, epoch: parseDateToEpoch(draw.date) }))
  .filter(({ draw }) => isValidRealDraw(draw))
  .sort((left, right) => {
    const leftEpoch = Number.isFinite(left.epoch) ? left.epoch : Number.POSITIVE_INFINITY;
    const rightEpoch = Number.isFinite(right.epoch) ? right.epoch : Number.POSITIVE_INFINITY;
    return leftEpoch - rightEpoch || left.index - right.index;
  })
  .map(({ draw }) => draw);

const buildContextByDate = (history: Draw[]): Map<string, {
  ordinal: number;
  monthDrawCount: number;
  complete: boolean;
}> => {
  const normalized = normalizeHistory(history);
  const months = new Map<string, Draw[]>();
  normalized.forEach((draw) => {
    const monthLabel = monthLabelForDate(draw.date);
    if (!monthLabel) return;
    const rows = months.get(monthLabel) ?? [];
    rows.push(draw);
    months.set(monthLabel, rows);
  });

  const latestMonthLabel = monthLabelForDate(normalized[normalized.length - 1]?.date ?? "");
  const context = new Map<string, { ordinal: number; monthDrawCount: number; complete: boolean }>();
  months.forEach((rows, monthLabel) => {
    rows.forEach((draw, index) => {
      context.set(draw.date, {
        ordinal: index + 1,
        monthDrawCount: rows.length,
        complete: monthLabel !== latestMonthLabel,
      });
    });
  });
  return context;
};

const combinations = (n: number, k: number): number => {
  if (k < 0 || n < 0 || k > n) return 0;
  let result = 1;
  for (let index = 1; index <= k; index += 1) {
    result = result * (n - k + index) / index;
  }
  return result;
};

const hypergeometricProbability = (shortlistSize: number, hits: number): number => {
  const safeShortlistSize = Math.max(0, Math.min(LOTTERY_NUMBER_COUNT, Math.round(shortlistSize)));
  const safeHits = Math.max(0, Math.min(DRAW_SIZE, Math.round(hits)));
  if (safeHits > safeShortlistSize) return 0;
  return (
    combinations(safeShortlistSize, safeHits)
    * combinations(LOTTERY_NUMBER_COUNT - safeShortlistSize, DRAW_SIZE - safeHits)
  ) / combinations(LOTTERY_NUMBER_COUNT, DRAW_SIZE);
};

const expectedAnyHitRate = (shortlistSize: number): number => 1 - hypergeometricProbability(shortlistSize, 0);

const binomialTwoSidedPValue = (successes: number, trials: number, p = 0.5): number | null => {
  if (trials <= 0) return null;
  const probabilityAt = (k: number) => combinations(trials, k) * (p ** k) * ((1 - p) ** (trials - k));
  const observed = probabilityAt(successes);
  let total = 0;
  for (let k = 0; k <= trials; k += 1) {
    const probability = probabilityAt(k);
    if (probability <= observed + Number.EPSILON) total += probability;
  }
  return Math.min(1, total);
};

const normalizeShortlist = (numbers: number[], topK: number): number[] => {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const number of numbers) {
    if (!Number.isInteger(number) || number < 1 || number > 45 || seen.has(number)) continue;
    seen.add(number);
    result.push(number);
    if (result.length >= topK) break;
  }
  return result;
};

const classifyDraw = (
  strictOnlyCount: number,
  empiricalOnlyCount: number,
  overlapCount: number,
): DroughtDrawSourceClass => {
  if (strictOnlyCount + empiricalOnlyCount + overlapCount === 0) return "none";
  if (strictOnlyCount > 0 && empiricalOnlyCount === 0 && overlapCount === 0) return "strict-only";
  if (empiricalOnlyCount > 0 && strictOnlyCount === 0 && overlapCount === 0) return "empirical-only";
  if (overlapCount > 0 && strictOnlyCount === 0 && empiricalOnlyCount === 0) return "overlap-only";
  return "mixed";
};

const summarizeStages = (records: DroughtShortlistSourceReplayRecord[]): DroughtShortlistStageRow[] => {
  const groups = new Map<string, DroughtShortlistSourceReplayRecord[]>();
  records.forEach((record) => {
    const key = `${record.targetMonthDrawCount ?? "unknown"}|${record.targetDrawOrdinal ?? "unknown"}|${record.targetMonthComplete ? "closed" : "open"}`;
    const rows = groups.get(key) ?? [];
    rows.push(record);
    groups.set(key, rows);
  });

  return Array.from(groups.values())
    .map((rows) => {
      const first = rows[0];
      const trials = rows.length;
      const monthDrawCount = first.targetMonthDrawCount;
      const drawOrdinal = first.targetDrawOrdinal;
      const stageLabel = monthDrawCount && drawOrdinal
        ? `${monthDrawCount}D D${drawOrdinal}${first.targetMonthComplete ? "" : " open"}`
        : "Unknown stage";
      return {
        stageLabel,
        monthDrawCount,
        drawOrdinal,
        targetMonthComplete: first.targetMonthComplete,
        trials,
        averageUnionHits: rows.reduce((sum, row) => sum + row.unionHitCount, 0) / trials,
        averageStrictHits: rows.reduce((sum, row) => sum + row.strictHitCount, 0) / trials,
        averageEmpiricalHits: rows.reduce((sum, row) => sum + row.empiricalHitCount, 0) / trials,
        averageOverlapHits: rows.reduce((sum, row) => sum + row.overlappingHits.length, 0) / trials,
        zeroHitRate: rows.filter((row) => row.unionHitCount === 0).length / trials,
      };
    })
    .sort((left, right) =>
      (left.monthDrawCount ?? Number.MAX_SAFE_INTEGER) - (right.monthDrawCount ?? Number.MAX_SAFE_INTEGER)
      || (left.drawOrdinal ?? Number.MAX_SAFE_INTEGER) - (right.drawOrdinal ?? Number.MAX_SAFE_INTEGER)
      || Number(left.targetMonthComplete) - Number(right.targetMonthComplete)
    );
};

export function analyzeDroughtShortlistSourceReplay(
  history: Draw[],
  options: DroughtShortlistSourceReplayOptions = {},
): DroughtShortlistSourceReplayResult {
  const topK = Math.max(1, Math.min(45, Math.round(options.topK ?? DEFAULT_TOP_K)));
  const strictThreshold = Math.max(1, Math.round(options.strictThreshold ?? STRICT_DROUGHT_DEFAULT_THRESHOLD));
  const minHistory = Math.max(1, Math.round(options.minHistory ?? DEFAULT_MIN_HISTORY));
  const latestRowCount = Math.max(1, Math.round(options.latestRowCount ?? 10));
  const normalizedHistory = normalizeHistory(history);
  const context = buildContextByDate(options.contextHistory?.length ? options.contextHistory : normalizedHistory);
  const records: DroughtShortlistSourceReplayRecord[] = [];

  for (let targetIndex = minHistory; targetIndex < normalizedHistory.length; targetIndex += 1) {
    const trainingHistory = normalizedHistory.slice(0, targetIndex);
    const targetDraw = normalizedHistory[targetIndex];
    const strictShortlist = normalizeShortlist(
      options.strictShortlistBuilder
        ? options.strictShortlistBuilder(trainingHistory)
        : buildStrictDroughtQuotaShortlist(trainingHistory, trainingHistory, { topK, threshold: strictThreshold }).numbers,
      topK,
    );
    const empiricalShortlist = normalizeShortlist(
      options.empiricalShortlistBuilder
        ? options.empiricalShortlistBuilder(trainingHistory)
        : buildEmpiricalDroughtQuotaShortlist(trainingHistory, { topK }).numbers,
      topK,
    );
    const strictRankByNumber = new Map(strictShortlist.map((number, index) => [number, index + 1]));
    const empiricalRankByNumber = new Map(empiricalShortlist.map((number, index) => [number, index + 1]));
    const actualNumbers = drawNumbers(targetDraw);
    const strictOnlyHits: DroughtShortlistHitDetail[] = [];
    const empiricalOnlyHits: DroughtShortlistHitDetail[] = [];
    const overlappingHits: DroughtShortlistHitDetail[] = [];

    actualNumbers.forEach((number) => {
      const strictRank = strictRankByNumber.get(number) ?? null;
      const empiricalRank = empiricalRankByNumber.get(number) ?? null;
      const base = {
        number,
        where: targetDraw.main.includes(number) ? "main" as const : "supp" as const,
        strictRank,
        empiricalRank,
      };
      if (strictRank && empiricalRank) overlappingHits.push({ ...base, source: "both" });
      else if (strictRank) strictOnlyHits.push({ ...base, source: "strict-only" });
      else if (empiricalRank) empiricalOnlyHits.push({ ...base, source: "empirical-only" });
    });

    const strictHitCount = strictOnlyHits.length + overlappingHits.length;
    const empiricalHitCount = empiricalOnlyHits.length + overlappingHits.length;
    const unionHitCount = strictOnlyHits.length + empiricalOnlyHits.length + overlappingHits.length;
    const strictSet = new Set(strictShortlist);
    const empiricalSet = new Set(empiricalShortlist);
    const shortlistOverlapSize = strictShortlist.filter((number) => empiricalSet.has(number)).length;
    const shortlistUnionSize = new Set([...strictSet, ...empiricalSet]).size;
    const metadata = context.get(targetDraw.date);

    records.push({
      targetIndex,
      targetDate: targetDraw.date,
      targetDrawOrdinal: metadata?.ordinal ?? null,
      targetMonthDrawCount: metadata?.monthDrawCount ?? null,
      targetMonthComplete: metadata?.complete ?? false,
      trainingDraws: trainingHistory.length,
      strictShortlist,
      empiricalShortlist,
      shortlistOverlapSize,
      shortlistUnionSize,
      strictOnlyHits,
      empiricalOnlyHits,
      overlappingHits,
      unionHitCount,
      strictHitCount,
      empiricalHitCount,
      drawClass: classifyDraw(strictOnlyHits.length, empiricalOnlyHits.length, overlappingHits.length),
    });
  }

  const eligibleTrials = records.length;
  const totalStrictOnly = records.reduce((sum, record) => sum + record.strictOnlyHits.length, 0);
  const totalEmpiricalOnly = records.reduce((sum, record) => sum + record.empiricalOnlyHits.length, 0);
  const totalOverlap = records.reduce((sum, record) => sum + record.overlappingHits.length, 0);
  const totalUnion = totalStrictOnly + totalEmpiricalOnly + totalOverlap;
  const totalStrict = totalStrictOnly + totalOverlap;
  const totalEmpirical = totalEmpiricalOnly + totalOverlap;
  const exclusiveTotal = totalStrictOnly + totalEmpiricalOnly;
  const safeTrials = Math.max(1, eligibleTrials);
  const classCounts: Record<DroughtDrawSourceClass, number> = {
    none: 0,
    "strict-only": 0,
    "empirical-only": 0,
    "overlap-only": 0,
    mixed: 0,
  };
  records.forEach((record) => {
    classCounts[record.drawClass] += 1;
  });

  return {
    scope: "mains+supps",
    sourceDraws: normalizedHistory.length,
    eligibleTrials,
    minHistory,
    topK,
    strictThreshold,
    firstTargetDate: records[0]?.targetDate ?? null,
    latestTargetDate: records[records.length - 1]?.targetDate ?? null,
    sourceRows: [
      { key: "strict-only", label: "Strict-only", count: totalStrictOnly, share: totalUnion ? totalStrictOnly / totalUnion : 0 },
      { key: "empirical-only", label: "Empirical-only", count: totalEmpiricalOnly, share: totalUnion ? totalEmpiricalOnly / totalUnion : 0 },
      { key: "both", label: "In both lists", count: totalOverlap, share: totalUnion ? totalOverlap / totalUnion : 0 },
    ],
    drawClassRows: [
      { key: "mixed", label: "Mixed source draw", count: classCounts.mixed, share: classCounts.mixed / safeTrials },
      { key: "strict-only", label: "Strict-only hit draw", count: classCounts["strict-only"], share: classCounts["strict-only"] / safeTrials },
      { key: "empirical-only", label: "Empirical-only hit draw", count: classCounts["empirical-only"], share: classCounts["empirical-only"] / safeTrials },
      { key: "overlap-only", label: "Overlap-only hit draw", count: classCounts["overlap-only"], share: classCounts["overlap-only"] / safeTrials },
      { key: "none", label: "No shortlist hit", count: classCounts.none, share: classCounts.none / safeTrials },
    ],
    stageRows: summarizeStages(records),
    latestRows: records.slice(Math.max(0, records.length - latestRowCount)).reverse(),
    averageShortlistOverlapSize: records.reduce((sum, record) => sum + record.shortlistOverlapSize, 0) / safeTrials,
    averageShortlistUnionSize: records.reduce((sum, record) => sum + record.shortlistUnionSize, 0) / safeTrials,
    averageUnionHits: totalUnion / safeTrials,
    averageStrictHits: totalStrict / safeTrials,
    averageEmpiricalHits: totalEmpirical / safeTrials,
    unionHitDrawRate: records.filter((record) => record.unionHitCount > 0).length / safeTrials,
    strictAnyDrawRate: records.filter((record) => record.strictHitCount > 0).length / safeTrials,
    empiricalAnyDrawRate: records.filter((record) => record.empiricalHitCount > 0).length / safeTrials,
    expectedRandomUnionHitDrawRate: records.reduce(
      (sum, record) => sum + expectedAnyHitRate(record.shortlistUnionSize),
      0,
    ) / safeTrials,
    expectedRandomUnionHits: records.reduce(
      (sum, record) => sum + DRAW_SIZE * record.shortlistUnionSize / LOTTERY_NUMBER_COUNT,
      0,
    ) / safeTrials,
    exclusiveSplitPValue: binomialTwoSidedPValue(Math.max(totalStrictOnly, totalEmpiricalOnly), exclusiveTotal),
  };
}

import type { Draw } from "../types";

export const HOT_COLD_RECENT_WINDOW_OPTIONS = [10, 20, 30, 50] as const;
export const HOT_COLD_HALF_LIFE_OPTIONS = [0, 6, 10, 14, 20] as const;

export type HotColdWindowShortcut = "W" | "F" | "M" | "Q" | "Y" | "H" | "WFMQYH";
export type HotColdWindowChoice = number | HotColdWindowShortcut;

export interface HotColdShortcutOption {
  key: HotColdWindowShortcut;
  label: string;
  draws: number | null;
}

export const HOT_COLD_WFMQYH_OPTIONS: readonly HotColdShortcutOption[] = [
  { key: "W", label: "W · Weekly", draws: 3 },
  { key: "F", label: "F · Fortnight", draws: 6 },
  { key: "M", label: "M · Month", draws: 12 },
  { key: "Q", label: "Q · Quarter", draws: 36 },
  { key: "Y", label: "Y · Year", draws: 156 },
  { key: "H", label: "H · Full history", draws: null },
  { key: "WFMQYH", label: "WFMQYH · Current custom window", draws: null },
] as const;

export type HotColdDigitFilter = "all" | "oneDigit" | "twoDigit";
export type HotColdStatus = "hot" | "warm" | "neutral" | "cool" | "cold";
export type HotColdDigitWidth = "oneDigit" | "twoDigit";

export interface HotColdRankingOptions {
  includeSupp?: boolean;
  recentWindow?: number;
  halfLife?: number;
}

export interface HotColdRankingRow {
  number: number;
  digitWidth: HotColdDigitWidth;
  totalCount: number;
  totalRate: number;
  historicalRank: number;
  recentCount: number;
  recentRate: number;
  recentRank: number;
  priorCount: number;
  priorRate: number;
  weightedRate: number;
  weightedRank: number;
  recentDelta: number;
  weightedDelta: number;
  deltaZScore: number;
  hotScore: number;
  hotRank: number;
  status: HotColdStatus;
}

export interface HotColdRankingSummary {
  totalDraws: number;
  recentWindow: number;
  priorWindow: number;
  includeSupp: boolean;
  rows: HotColdRankingRow[];
  topHistorical: HotColdRankingRow[];
  topRecent: HotColdRankingRow[];
  topWeighted: HotColdRankingRow[];
  topHot: HotColdRankingRow[];
  topCold: HotColdRankingRow[];
}

interface PreparedDraw {
  date: string;
  numbers: number[];
}

const NUMBER_RANGE = Array.from({ length: 45 }, (_, index) => index + 1);
const HOT_COLD_SHORTCUT_DRAWS: Record<Exclude<HotColdWindowShortcut, "H" | "WFMQYH">, number> = {
  W: 3,
  F: 6,
  M: 12,
  Q: 36,
  Y: 156,
};

const isHotColdWindowShortcut = (value: string): value is HotColdWindowShortcut => (
  HOT_COLD_WFMQYH_OPTIONS.some((option) => option.key === value)
);

export const parseHotColdWindowChoice = (
  value: string,
  fallback: HotColdWindowChoice,
): HotColdWindowChoice => {
  const numericChoice = Number(value);
  if (Number.isFinite(numericChoice)) {
    return numericChoice;
  }
  return isHotColdWindowShortcut(value) ? value : fallback;
};

export const resolveHotColdWindowChoice = (
  choice: HotColdWindowChoice,
  totalDraws: number,
  fallback: number,
  wfmqyhWindowSize?: number,
): number => {
  if (typeof choice === "number" && Number.isFinite(choice)) {
    return choice;
  }
  if (typeof choice === "number") {
    return fallback;
  }
  if (choice === "H") {
    return totalDraws > 0 ? totalDraws : fallback;
  }
  if (choice === "WFMQYH") {
    return typeof wfmqyhWindowSize === "number" && Number.isFinite(wfmqyhWindowSize) && wfmqyhWindowSize > 0
      ? wfmqyhWindowSize
      : fallback;
  }
  return HOT_COLD_SHORTCUT_DRAWS[choice];
};

export const formatHotColdWindowChoiceLabel = (
  choice: HotColdWindowChoice,
  totalDraws: number,
  fallback: number,
  mode: "recentWindow" | "halfLife",
  wfmqyhWindowSize?: number,
): string => {
  if (typeof choice === "number" && Number.isFinite(choice)) {
    if (mode === "halfLife" && choice === 0) {
      return "0 · Latest draw only";
    }
    return `${choice} draws`;
  }

  const matchedOption = HOT_COLD_WFMQYH_OPTIONS.find((option) => option.key === choice);
  if (!matchedOption) {
    return `${fallback} draws`;
  }

  const resolvedDraws = resolveHotColdWindowChoice(choice, totalDraws, fallback, wfmqyhWindowSize);
  if (choice === "H") {
    return mode === "halfLife"
      ? `${matchedOption.label} (${resolvedDraws} draws)`
      : `${matchedOption.label} (all loaded draws${totalDraws > 0 ? ` · ${resolvedDraws}` : ""})`;
  }

  if (choice === "WFMQYH") {
    return mode === "halfLife"
      ? `${matchedOption.label} (${resolvedDraws} draws)`
      : `${matchedOption.label} (${resolvedDraws} active draws)`;
  }

  return `${matchedOption.label} (${resolvedDraws} draws)`;
};

const prepareHistory = (history: Draw[], includeSupp: boolean): PreparedDraw[] => {
  return history
    .map((draw) => {
      const timestamp = Date.parse(draw.date || "");
      if (Number.isNaN(timestamp)) {
        return null;
      }
      const numbers = includeSupp ? [...draw.main, ...draw.supp] : [...draw.main];
      const uniqueValidNumbers = Array.from(
        new Set(numbers.filter((value) => Number.isInteger(value) && value >= 1 && value <= 45)),
      ).sort((left, right) => left - right);
      return { date: draw.date, time: timestamp, numbers: uniqueValidNumbers };
    })
    .filter((entry): entry is PreparedDraw & { time: number } => entry !== null)
    .sort((left, right) => left.time - right.time)
    .map(({ date, numbers }) => ({ date, numbers }));
};

const buildRanks = (rows: HotColdRankingRow[], selector: (row: HotColdRankingRow) => number, descending: boolean): Map<number, number> => {
  const sorted = [...rows].sort((left, right) => {
    const delta = selector(left) - selector(right);
    if (delta !== 0) {
      return descending ? -delta : delta;
    }
    return left.number - right.number;
  });

  return new Map(sorted.map((row, index) => [row.number, index + 1]));
};

const getDigitWidth = (value: number): HotColdDigitWidth => (value <= 9 ? "oneDigit" : "twoDigit");

const getStatus = (hotScore: number): HotColdStatus => {
  if (hotScore >= 1.25) return "hot";
  if (hotScore >= 0.45) return "warm";
  if (hotScore <= -1.25) return "cold";
  if (hotScore <= -0.45) return "cool";
  return "neutral";
};

const takeTop = (rows: HotColdRankingRow[], selector: (row: HotColdRankingRow) => number, descending: boolean, count: number): HotColdRankingRow[] => {
  return [...rows]
    .sort((left, right) => {
      const delta = selector(left) - selector(right);
      if (delta !== 0) {
        return descending ? -delta : delta;
      }
      return left.number - right.number;
    })
    .slice(0, count);
};

const getRecencyWeight = (age: number, halfLife: number): number => {
  if (halfLife === 0) {
    return age === 0 ? 1 : 0;
  }
  return Math.exp((-Math.log(2) * age) / halfLife);
};

export const analyzeHotColdRanking = (
  history: Draw[],
  options: HotColdRankingOptions = {},
): HotColdRankingSummary => {
  const includeSupp = options.includeSupp ?? false;
  const recentWindowInput = options.recentWindow ?? 20;
  const halfLifeInput = options.halfLife ?? 10;
  const halfLife = Number.isFinite(halfLifeInput) ? Math.max(0, halfLifeInput) : 10;
  const prepared = prepareHistory(history, includeSupp);
  const totalDraws = prepared.length;
  const recentWindow = Math.min(Math.max(1, recentWindowInput), Math.max(1, totalDraws));
  const priorWindow = Math.max(totalDraws - recentWindow, 0);

  const recentDraws = prepared.slice(-recentWindow);
  const priorDraws = prepared.slice(0, Math.max(0, totalDraws - recentWindow));
  const totalWeight = prepared.reduce((sum, _draw, index) => {
    const age = prepared.length - 1 - index;
    return sum + getRecencyWeight(age, halfLife);
  }, 0);

  const rawRows = NUMBER_RANGE.map<HotColdRankingRow>((number) => {
    const totalCount = prepared.filter((draw) => draw.numbers.includes(number)).length;
    const recentCount = recentDraws.filter((draw) => draw.numbers.includes(number)).length;
    const priorCount = priorDraws.filter((draw) => draw.numbers.includes(number)).length;
    const totalRate = totalDraws > 0 ? totalCount / totalDraws : 0;
    const recentRate = recentWindow > 0 ? recentCount / recentWindow : 0;
    const priorRate = priorWindow > 0 ? priorCount / priorWindow : totalRate;
    const weightedHits = prepared.reduce((sum, draw, index) => {
      const age = prepared.length - 1 - index;
      const weight = getRecencyWeight(age, halfLife);
      return sum + (draw.numbers.includes(number) ? weight : 0);
    }, 0);
    const weightedRate = totalWeight > 0 ? weightedHits / totalWeight : 0;
    const recentDelta = recentRate - priorRate;
    const weightedDelta = weightedRate - totalRate;
    const pooledRate = totalDraws > 0 ? totalCount / totalDraws : 0;
    const standardError = priorWindow > 0
      ? Math.sqrt(Math.max(1e-9, pooledRate * (1 - pooledRate) * ((1 / Math.max(1, recentWindow)) + (1 / priorWindow))))
      : 0;
    const deltaZScore = standardError > 0 ? recentDelta / standardError : 0;
    const hotScore = deltaZScore + weightedDelta * 5 + recentDelta * 3;

    return {
      number,
      digitWidth: getDigitWidth(number),
      totalCount,
      totalRate,
      historicalRank: 0,
      recentCount,
      recentRate,
      recentRank: 0,
      priorCount,
      priorRate,
      weightedRate,
      weightedRank: 0,
      recentDelta,
      weightedDelta,
      deltaZScore,
      hotScore,
      hotRank: 0,
      status: getStatus(hotScore),
    };
  });

  const historicalRanks = buildRanks(rawRows, (row) => row.totalCount, true);
  const recentRanks = buildRanks(rawRows, (row) => row.recentCount, true);
  const weightedRanks = buildRanks(rawRows, (row) => row.weightedRate, true);
  const hotRanks = buildRanks(rawRows, (row) => row.hotScore, true);

  const rows = rawRows.map((row) => ({
    ...row,
    historicalRank: historicalRanks.get(row.number) ?? 0,
    recentRank: recentRanks.get(row.number) ?? 0,
    weightedRank: weightedRanks.get(row.number) ?? 0,
    hotRank: hotRanks.get(row.number) ?? 0,
  }));

  return {
    totalDraws,
    recentWindow,
    priorWindow,
    includeSupp,
    rows,
    topHistorical: takeTop(rows, (row) => row.totalCount, true, 10),
    topRecent: takeTop(rows, (row) => row.recentCount, true, 10),
    topWeighted: takeTop(rows, (row) => row.weightedRate, true, 10),
    topHot: takeTop(rows, (row) => row.hotScore, true, 10),
    topCold: takeTop(rows, (row) => row.hotScore, false, 10),
  };
};

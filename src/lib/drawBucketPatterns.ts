import type { Draw } from "../types";

export interface DrawBucketDefinition {
  key: string;
  label: string;
  numbers: number[];
  description: string;
}

export interface DrawBucketPatternDistributionBin {
  hits: number;
  count: number;
  percentage: number;
}

export interface DrawBucketPatternStats {
  key: string;
  label: string;
  numbers: number[];
  description: string;
  totalDraws: number;
  averageHits: number;
  atLeastOneRate: number;
  zeroRate: number;
  modeHits: number;
  maxObservedHits: number;
  maxPossibleHits: number;
  totalHits: number;
  distribution: DrawBucketPatternDistributionBin[];
  recentHits: number[];
}

export type DrawBucketPatternSortMode = "label" | "atLeastOne" | "averageHits" | "modeHits";

export interface DrawBucketPatternLeaderboardRow {
  stat: DrawBucketPatternStats;
  selectedSortPosition: number;
  atLeastOnePosition: number;
  averageHitsPosition: number;
  modeHitsPosition: number;
  zeroRatePosition: number;
  maxObservedHitsPosition: number;
  totalHitsPosition: number;
  recentAverageHits: number;
  recentAveragePosition: number;
}

export interface AnalyzeDrawBucketPatternsOptions {
  includeSupp?: boolean;
  buckets?: DrawBucketDefinition[];
  recentWindowSize?: number;
}

export const DEFAULT_RECENT_DRAW_BUCKET_WINDOW = 24;

export interface DrawMonthOption {
  key: string;
  label: string;
  drawCount: number;
}

export const DEFAULT_DRAW_BUCKETS: DrawBucketDefinition[] = [
  {
    key: "end0",
    label: "Ending in 0",
    numbers: [10, 20, 30, 40],
    description: "Tracks 10/20/30/40 appearances per draw.",
  },
  {
    key: "end1",
    label: "Ending in 1",
    numbers: [1, 11, 21, 31, 41],
    description: "Tracks 1/11/21/31/41 appearances per draw.",
  },
  {
    key: "end2",
    label: "Ending in 2",
    numbers: [2, 12, 22, 32, 42],
    description: "Tracks 2/12/22/32/42 appearances per draw.",
  },
  {
    key: "end3",
    label: "Ending in 3",
    numbers: [3, 13, 23, 33, 43],
    description: "Tracks 3/13/23/33/43 appearances per draw.",
  },
  {
    key: "end4",
    label: "Ending in 4",
    numbers: [4, 14, 24, 34, 44],
    description: "Tracks 4/14/24/34/44 appearances per draw.",
  },
  {
    key: "end5",
    label: "Ending in 5",
    numbers: [5, 15, 25, 35, 45],
    description: "Tracks 5/15/25/35/45 appearances per draw.",
  },
  {
    key: "end6",
    label: "Ending in 6",
    numbers: [6, 16, 26, 36],
    description: "Tracks 6/16/26/36 appearances per draw.",
  },
  {
    key: "end7",
    label: "Ending in 7",
    numbers: [7, 17, 27, 37],
    description: "Tracks 7/17/27/37 appearances per draw.",
  },
  {
    key: "end8",
    label: "Ending in 8",
    numbers: [8, 18, 28, 38],
    description: "Tracks 8/18/28/38 appearances per draw.",
  },
  {
    key: "end9",
    label: "Ending in 9",
    numbers: [9, 19, 29, 39],
    description: "Tracks 9/19/29/39 appearances per draw.",
  },
];

const parseDrawDateSafe = (raw: string): Date | null => {
  if (!raw) return null;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  const slashParts = raw.split("/").map((part) => Number(part.trim()));
  if (slashParts.length >= 3 && slashParts.every((part) => Number.isFinite(part))) {
    const [m, d, yRaw] = slashParts;
    const y = yRaw < 100 ? 2000 + yRaw : yRaw;
    return new Date(y, m - 1, d);
  }

  return null;
};

export const getDrawMonthKey = (rawDate: string): string | null => {
  const parsed = parseDrawDateSafe(rawDate);
  if (!parsed) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
};

export const formatDrawMonthLabel = (monthKey: string): string => {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey;
  const [, year, month] = match;
  const parsed = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric" }).format(parsed);
};

export const buildDrawMonthOptions = (draws: Draw[]): DrawMonthOption[] => {
  const monthCounts = new Map<string, number>();

  draws.forEach((draw) => {
    const key = getDrawMonthKey(draw.date);
    if (!key) return;
    monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
  });

  return Array.from(monthCounts.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, drawCount]) => ({
      key,
      label: formatDrawMonthLabel(key),
      drawCount,
    }));
};

export const selectDrawMonthDraws = (
  draws: Draw[],
  monthKey: string | null,
): Draw[] => {
  if (!monthKey) return [];
  return draws.filter((draw) => getDrawMonthKey(draw.date) === monthKey);
};

/**
 * Selects draws from a chosen month and truncates to the first `compareCount` draws so the
 * comparison month can be lined up against the current window draw-for-draw.
 */
export const selectComparableMonthDraws = (
  draws: Draw[],
  monthKey: string | null,
  compareCount: number,
): Draw[] => {
  if (!monthKey || compareCount <= 0) return [];

  const monthDraws = selectDrawMonthDraws(draws, monthKey);
  return monthDraws.slice(0, compareCount);
};

const getModeHits = (hitCounts: number[]): number => {
  const freq = new Map<number, number>();
  hitCounts.forEach((hits) => {
    freq.set(hits, (freq.get(hits) ?? 0) + 1);
  });

  let bestHits = 0;
  let bestCount = -1;
  Array.from(freq.entries())
    .sort((a, b) => a[0] - b[0])
    .forEach(([hits, count]) => {
      if (count > bestCount) {
        bestHits = hits;
        bestCount = count;
      }
    });

  return bestHits;
};

const getRecentAverageHits = (stat: DrawBucketPatternStats): number => {
  if (stat.recentHits.length === 0) {
    return 0;
  }
  return stat.recentHits.reduce((sum, hits) => sum + hits, 0) / stat.recentHits.length;
};

const compareByAtLeastOneRate = (a: DrawBucketPatternStats, b: DrawBucketPatternStats): number => (
  b.atLeastOneRate - a.atLeastOneRate
  || b.averageHits - a.averageHits
  || a.label.localeCompare(b.label)
);

const compareByAverageHits = (a: DrawBucketPatternStats, b: DrawBucketPatternStats): number => (
  b.averageHits - a.averageHits
  || b.atLeastOneRate - a.atLeastOneRate
  || a.label.localeCompare(b.label)
);

const compareByModeHits = (a: DrawBucketPatternStats, b: DrawBucketPatternStats): number => (
  b.modeHits - a.modeHits
  || b.atLeastOneRate - a.atLeastOneRate
  || a.label.localeCompare(b.label)
);

const compareByLabel = (a: DrawBucketPatternStats, b: DrawBucketPatternStats): number => (
  a.label.localeCompare(b.label)
);

const compareByZeroRate = (a: DrawBucketPatternStats, b: DrawBucketPatternStats): number => (
  a.zeroRate - b.zeroRate
  || b.atLeastOneRate - a.atLeastOneRate
  || a.label.localeCompare(b.label)
);

const compareByMaxObservedHits = (a: DrawBucketPatternStats, b: DrawBucketPatternStats): number => (
  b.maxObservedHits - a.maxObservedHits
  || b.averageHits - a.averageHits
  || a.label.localeCompare(b.label)
);

const compareByTotalHits = (a: DrawBucketPatternStats, b: DrawBucketPatternStats): number => (
  b.totalHits - a.totalHits
  || b.averageHits - a.averageHits
  || a.label.localeCompare(b.label)
);

const compareByRecentAverageHits = (a: DrawBucketPatternStats, b: DrawBucketPatternStats): number => (
  getRecentAverageHits(b) - getRecentAverageHits(a)
  || b.atLeastOneRate - a.atLeastOneRate
  || a.label.localeCompare(b.label)
);

const buildPositionMap = (
  stats: DrawBucketPatternStats[],
  compare: (a: DrawBucketPatternStats, b: DrawBucketPatternStats) => number,
): Map<string, number> => {
  const sorted = [...stats].sort(compare);
  return new Map(sorted.map((stat, index) => [stat.key, index + 1]));
};

export const sortDrawBucketPatternStats = (
  stats: DrawBucketPatternStats[],
  sortMode: DrawBucketPatternSortMode,
): DrawBucketPatternStats[] => {
  const next = [...stats];
  switch (sortMode) {
    case "atLeastOne":
      return next.sort(compareByAtLeastOneRate);
    case "averageHits":
      return next.sort(compareByAverageHits);
    case "modeHits":
      return next.sort(compareByModeHits);
    case "label":
    default:
      return next.sort(compareByLabel);
  }
};

export const buildDrawBucketPatternLeaderboard = (
  stats: DrawBucketPatternStats[],
  sortMode: DrawBucketPatternSortMode,
): DrawBucketPatternLeaderboardRow[] => {
  const sorted = sortDrawBucketPatternStats(stats, sortMode);
  const atLeastOnePositions = buildPositionMap(stats, compareByAtLeastOneRate);
  const averageHitsPositions = buildPositionMap(stats, compareByAverageHits);
  const modeHitsPositions = buildPositionMap(stats, compareByModeHits);
  const zeroRatePositions = buildPositionMap(stats, compareByZeroRate);
  const maxObservedHitsPositions = buildPositionMap(stats, compareByMaxObservedHits);
  const totalHitsPositions = buildPositionMap(stats, compareByTotalHits);
  const recentAveragePositions = buildPositionMap(stats, compareByRecentAverageHits);

  return sorted.map((stat, index) => ({
    stat,
    selectedSortPosition: index + 1,
    atLeastOnePosition: atLeastOnePositions.get(stat.key) ?? index + 1,
    averageHitsPosition: averageHitsPositions.get(stat.key) ?? index + 1,
    modeHitsPosition: modeHitsPositions.get(stat.key) ?? index + 1,
    zeroRatePosition: zeroRatePositions.get(stat.key) ?? index + 1,
    maxObservedHitsPosition: maxObservedHitsPositions.get(stat.key) ?? index + 1,
    totalHitsPosition: totalHitsPositions.get(stat.key) ?? index + 1,
    recentAverageHits: getRecentAverageHits(stat),
    recentAveragePosition: recentAveragePositions.get(stat.key) ?? index + 1,
  }));
};

/**
 * Analyses how often each configured bucket appears per draw within the current history window.
 *
 * This is designed to reveal draw-level composition patterns, e.g. whether draws typically
 * contain 0, 1, 2, or more numbers from a terminal-digit bucket such as ending in 0 or 5.
 */
export const analyzeDrawBucketPatterns = (
  draws: Draw[],
  options: AnalyzeDrawBucketPatternsOptions = {},
): DrawBucketPatternStats[] => {
  const {
    includeSupp = true,
    buckets = DEFAULT_DRAW_BUCKETS,
    recentWindowSize = DEFAULT_RECENT_DRAW_BUCKET_WINDOW,
  } = options;

  const numbersPerDraw = includeSupp ? 8 : 6;

  return buckets.map((bucket) => {
    const bucketSet = new Set(bucket.numbers);
    const hitCounts = draws.map((draw) => {
      const pool = includeSupp ? [...draw.main, ...draw.supp] : draw.main;
      return pool.filter((n) => bucketSet.has(n)).length;
    });

    const totalDraws = hitCounts.length;
    const totalHits = hitCounts.reduce((sum, hits) => sum + hits, 0);
    const maxPossibleHits = Math.min(numbersPerDraw, bucket.numbers.length);
    const maxObservedHits = hitCounts.length ? Math.max(...hitCounts) : 0;
    const nonZeroDraws = hitCounts.filter((hits) => hits > 0).length;
    const zeroDraws = hitCounts.filter((hits) => hits === 0).length;

    const distribution = Array.from({ length: maxPossibleHits + 1 }, (_, hits) => {
      const count = hitCounts.filter((value) => value === hits).length;
      return {
        hits,
        count,
        percentage: totalDraws > 0 ? (count / totalDraws) * 100 : 0,
      };
    });

    return {
      key: bucket.key,
      label: bucket.label,
      numbers: bucket.numbers,
      description: bucket.description,
      totalDraws,
      averageHits: totalDraws > 0 ? totalHits / totalDraws : 0,
      atLeastOneRate: totalDraws > 0 ? (nonZeroDraws / totalDraws) * 100 : 0,
      zeroRate: totalDraws > 0 ? (zeroDraws / totalDraws) * 100 : 0,
      modeHits: hitCounts.length > 0 ? getModeHits(hitCounts) : 0,
      maxObservedHits,
      maxPossibleHits,
      totalHits,
      distribution,
      recentHits: hitCounts.slice(-recentWindowSize),
    };
  });
};

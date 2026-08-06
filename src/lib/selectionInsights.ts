import type { Draw } from "../types";

export interface SelectionInsightPairRow {
  a: number;
  b: number;
  total: number;
  consecutive: number;
}

export interface SelectionInsightTripletRow {
  a: number;
  b: number;
  c: number;
  total: number;
}

export interface SelectionInsightCompanionRow {
  n: number;
  count: number;
  rate: number;
}

export interface SelectionInsightAnalytics {
  selectedNumbers: number[];
  drawCount: number;
  pairRows: SelectionInsightPairRow[];
  tripletRows: SelectionInsightTripletRow[];
  companionRows: SelectionInsightCompanionRow[];
  neverWithCount: number;
  neverWithNumbers: number[];
  cappedTriplets: boolean;
}

export interface SelectionInsightPredictedCompanionRow {
  n: number;
  supportScore: number;
  windowCount: number;
  allCount: number;
  windowRate: number;
  allRate: number;
}

export interface SelectionInsightSnapshotCompanion {
  number: number;
  supportScore: number;
  windowCount: number;
  allCount: number;
}

export interface SelectionInsightsSnapshot {
  version: 1;
  enabled: boolean;
  selectedNumbers: number[];
  windowLabel: string;
  windowDrawCount: number;
  allDrawCount: number;
  windowTopCompanionNumbers: number[];
  allTopCompanionNumbers: number[];
  predictedCompanionNumbers: number[];
  predictedCompanions: SelectionInsightSnapshotCompanion[];
}

const validLotteryNumber = (value: unknown): value is number => (
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 45
);

export const normalizeSelectionInsightNumbers = (numbers: unknown): number[] => {
  if (!Array.isArray(numbers)) return [];
  return Array.from(new Set(numbers.filter(validLotteryNumber))).sort((a, b) => a - b);
};

const drawNumbers = (draw: Draw): number[] => (
  [...(Array.isArray(draw.main) ? draw.main : []), ...(Array.isArray(draw.supp) ? draw.supp : [])]
    .filter(validLotteryNumber)
);

const combinations2 = (nums: number[]): [number, number][] => {
  const res: [number, number][] = [];
  for (let i = 0; i < nums.length; i += 1) {
    for (let j = i + 1; j < nums.length; j += 1) {
      res.push([nums[i], nums[j]]);
    }
  }
  return res;
};

const combinations3 = (nums: number[]): [number, number, number][] => {
  const res: [number, number, number][] = [];
  for (let i = 0; i < nums.length; i += 1) {
    for (let j = i + 1; j < nums.length; j += 1) {
      for (let k = j + 1; k < nums.length; k += 1) {
        res.push([nums[i], nums[j], nums[k]]);
      }
    }
  }
  return res;
};

const keyPair = (a: number, b: number): string => (
  a < b ? `${a}-${b}` : `${b}-${a}`
);

const keyTriplet = (a: number, b: number, c: number): string => {
  const arr = [a, b, c].sort((x, y) => x - y);
  return `${arr[0]}-${arr[1]}-${arr[2]}`;
};

export function buildSelectionInsightsAnalytics(
  history: Draw[],
  selected: number[],
  options: { topKTriplets?: number; maxTripletSelectionSize?: number } = {},
): SelectionInsightAnalytics {
  const topKTriplets = Math.max(0, Math.floor(options.topKTriplets ?? 10));
  const maxTripletSelectionSize = Math.max(3, Math.floor(options.maxTripletSelectionSize ?? 12));
  const sel = normalizeSelectionInsightNumbers(selected);
  const drawSets = history
    .filter((draw) => !draw.isSimulated)
    .map((draw) => new Set(drawNumbers(draw)));
  const companionCount = new Array(46).fill(0) as number[];
  const pairs = combinations2(sel);
  const pairTotals = new Map<string, number>();
  const pairConsecutive = new Map<string, number>();
  const triplets = sel.length <= maxTripletSelectionSize ? combinations3(sel) : [];
  const tripletTotals = new Map<string, number>();

  for (let t = 0; t < drawSets.length; t += 1) {
    const drawSet = drawSets[t];
    const selectedPresent = sel.some((number) => drawSet.has(number));
    if (selectedPresent) {
      for (let n = 1; n <= 45; n += 1) {
        if (drawSet.has(n)) companionCount[n] += 1;
      }
    }

    for (const [a, b] of pairs) {
      if (drawSet.has(a) && drawSet.has(b)) {
        const key = keyPair(a, b);
        pairTotals.set(key, (pairTotals.get(key) ?? 0) + 1);
        if (t + 1 < drawSets.length) {
          const nextDrawSet = drawSets[t + 1];
          if (nextDrawSet.has(a) && nextDrawSet.has(b)) {
            pairConsecutive.set(key, (pairConsecutive.get(key) ?? 0) + 1);
          }
        }
      }
    }

    for (const [a, b, c] of triplets) {
      if (drawSet.has(a) && drawSet.has(b) && drawSet.has(c)) {
        const key = keyTriplet(a, b, c);
        tripletTotals.set(key, (tripletTotals.get(key) ?? 0) + 1);
      }
    }
  }

  const selectedSet = new Set(sel);
  const companionRows = Array.from({ length: 45 }, (_, index) => index + 1)
    .filter((number) => !selectedSet.has(number))
    .map((number) => ({
      n: number,
      count: companionCount[number],
      rate: drawSets.length ? companionCount[number] / drawSets.length : 0,
    }))
    .filter((row) => row.count > 0)
    .sort((left, right) => right.count - left.count || left.n - right.n);

  const neverWithNumbers = Array.from({ length: 45 }, (_, index) => index + 1)
    .filter((number) => !selectedSet.has(number) && companionCount[number] === 0);

  const pairRows = pairs
    .map(([a, b]) => {
      const key = keyPair(a, b);
      return { a, b, total: pairTotals.get(key) ?? 0, consecutive: pairConsecutive.get(key) ?? 0 };
    })
    .filter((row) => row.total > 0)
    .sort((left, right) => right.total - left.total || right.consecutive - left.consecutive || left.a - right.a || left.b - right.b);

  const tripletRows = triplets
    .map(([a, b, c]) => {
      const key = keyTriplet(a, b, c);
      return { a, b, c, total: tripletTotals.get(key) ?? 0 };
    })
    .filter((row) => row.total > 0)
    .sort((left, right) => right.total - left.total || left.a - right.a || left.b - right.b || left.c - right.c)
    .slice(0, topKTriplets);

  return {
    selectedNumbers: sel,
    drawCount: drawSets.length,
    pairRows,
    tripletRows,
    companionRows,
    neverWithCount: neverWithNumbers.length,
    neverWithNumbers,
    cappedTriplets: sel.length > maxTripletSelectionSize,
  };
}

const companionByNumber = (rows: SelectionInsightCompanionRow[]): Map<number, SelectionInsightCompanionRow> => (
  new Map(rows.map((row) => [row.n, row]))
);

export function buildSelectionInsightPredictedCompanions(
  windowAnalytics: SelectionInsightAnalytics,
  allHistoryAnalytics: SelectionInsightAnalytics,
): SelectionInsightPredictedCompanionRow[] {
  const selectedSet = new Set([
    ...windowAnalytics.selectedNumbers,
    ...allHistoryAnalytics.selectedNumbers,
  ]);
  const windowByNumber = companionByNumber(windowAnalytics.companionRows);
  const allByNumber = companionByNumber(allHistoryAnalytics.companionRows);
  const hasWindow = windowAnalytics.drawCount > 0;
  const hasAll = allHistoryAnalytics.drawCount > 0;
  const windowWeight = hasWindow
    ? windowAnalytics.drawCount >= 10 ? 0.6 : 0.35
    : 0;
  const allWeight = hasAll ? Math.max(0.4, 1 - windowWeight) : 0;
  const totalWeight = windowWeight + allWeight;
  if (totalWeight <= 0) return [];

  return Array.from({ length: 45 }, (_, index) => index + 1)
    .filter((number) => !selectedSet.has(number))
    .map((number) => {
      const windowRow = windowByNumber.get(number);
      const allRow = allByNumber.get(number);
      const windowRate = windowRow?.rate ?? 0;
      const allRate = allRow?.rate ?? 0;
      const blendedRate = ((windowWeight * windowRate) + (allWeight * allRate)) / totalWeight;
      return {
        n: number,
        supportScore: blendedRate * 100,
        windowCount: windowRow?.count ?? 0,
        allCount: allRow?.count ?? 0,
        windowRate,
        allRate,
      };
    })
    .filter((row) => row.supportScore > 0)
    .sort((left, right) => (
      right.supportScore - left.supportScore
      || right.windowCount - left.windowCount
      || right.allCount - left.allCount
      || left.n - right.n
    ));
}

export function buildSelectionInsightsSnapshot(
  options: {
    enabled: boolean;
    selected: number[];
    windowLabel: string;
    windowHistory: Draw[];
    allHistory: Draw[];
    maxRows?: number;
  },
): SelectionInsightsSnapshot {
  const maxRows = Math.max(1, Math.floor(options.maxRows ?? 12));
  const windowAnalytics = buildSelectionInsightsAnalytics(options.windowHistory, options.selected);
  const allAnalytics = buildSelectionInsightsAnalytics(options.allHistory, options.selected);
  const predicted = buildSelectionInsightPredictedCompanions(windowAnalytics, allAnalytics).slice(0, maxRows);

  return {
    version: 1,
    enabled: options.enabled,
    selectedNumbers: normalizeSelectionInsightNumbers(options.selected),
    windowLabel: options.windowLabel,
    windowDrawCount: windowAnalytics.drawCount,
    allDrawCount: allAnalytics.drawCount,
    windowTopCompanionNumbers: windowAnalytics.companionRows.slice(0, maxRows).map((row) => row.n),
    allTopCompanionNumbers: allAnalytics.companionRows.slice(0, maxRows).map((row) => row.n),
    predictedCompanionNumbers: predicted.map((row) => row.n),
    predictedCompanions: predicted.map((row) => ({
      number: row.n,
      supportScore: Math.round(row.supportScore * 100) / 100,
      windowCount: row.windowCount,
      allCount: row.allCount,
    })),
  };
}

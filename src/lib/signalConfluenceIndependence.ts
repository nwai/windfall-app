import type {
  SignalConfluenceFamilyKey,
  SignalConfluenceRow,
} from "./signalConfluence";

const LOTTERY_POOL_SIZE = 45;
const DEFAULT_FALSE_DISCOVERY_RATE = 0.05;

const FAMILY_LABELS: Record<SignalConfluenceFamilyKey, string> = {
  "latest-neighbour": "Latest neighbour",
  drought: "Drought",
  "shared-selection": "Survival selection",
  "active-frequency": "WFMQYH frequency",
  "terminal-bucket": "Draw Bucket Patterns",
  temperature: "Hot/cold",
  "scoring-numbers": "Scoring numbers",
  "selection-insights": "Selection Insights",
  "next-draw-evidence": "NDEE",
  "weekday-neighbour": "Weekday neighbour",
  "user-state": "User state",
};

export interface SignalConfluenceFamilyAuditRow {
  family: SignalConfluenceFamilyKey;
  label: string;
  numbers: number[];
}

export interface SignalConfluencePairAuditRow {
  leftFamily: SignalConfluenceFamilyKey;
  leftLabel: string;
  leftSize: number;
  rightFamily: SignalConfluenceFamilyKey;
  rightLabel: string;
  rightSize: number;
  sharedNumbers: number[];
  observedOverlap: number;
  expectedOverlap: number;
  overlapLift: number;
  jaccard: number;
  containment: number;
  pValue: number;
  adjustedPValue: number;
  flagged: boolean;
}

export interface SignalConfluenceIndependenceAudit {
  universeSize: number;
  falseDiscoveryRate: number;
  familyRows: SignalConfluenceFamilyAuditRow[];
  pairRows: SignalConfluencePairAuditRow[];
  activeFamilyCount: number;
  pairCount: number;
  flaggedPairCount: number;
  highestOverlapPair: SignalConfluencePairAuditRow | null;
}

export interface SignalConfluenceIndependenceAuditOptions {
  universeSize?: number;
  falseDiscoveryRate?: number;
}

export const signalConfluenceFamilyLabel = (family: SignalConfluenceFamilyKey): string => (
  FAMILY_LABELS[family]
);

const logCombination = (n: number, k: number): number => {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || k > n) return Number.NEGATIVE_INFINITY;
  const reducedK = Math.min(k, n - k);
  let result = 0;
  for (let index = 1; index <= reducedK; index += 1) {
    result += Math.log(n - reducedK + index) - Math.log(index);
  }
  return result;
};

export const hypergeometricUpperTail = (
  populationSize: number,
  firstSetSize: number,
  secondSetSize: number,
  observedOverlap: number,
): number => {
  const n = Math.floor(populationSize);
  const a = Math.floor(firstSetSize);
  const b = Math.floor(secondSetSize);
  const observed = Math.floor(observedOverlap);
  if (n <= 0 || a < 0 || b < 0 || a > n || b > n) return 1;

  const minimum = Math.max(0, a + b - n);
  const maximum = Math.min(a, b);
  if (observed <= minimum) return 1;
  if (observed > maximum) return 0;

  const denominator = logCombination(n, b);
  let probability = 0;
  for (let overlap = observed; overlap <= maximum; overlap += 1) {
    const remaining = b - overlap;
    if (remaining < 0 || remaining > n - a) continue;
    const logProbability = logCombination(a, overlap)
      + logCombination(n - a, remaining)
      - denominator;
    probability += Math.exp(logProbability);
  }
  return Math.max(0, Math.min(1, probability));
};

const applyBenjaminiHochberg = (rows: SignalConfluencePairAuditRow[]): SignalConfluencePairAuditRow[] => {
  const sorted = rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => left.row.pValue - right.row.pValue || left.index - right.index);
  const adjusted = new Array<number>(rows.length).fill(1);
  let runningMinimum = 1;

  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const rank = index + 1;
    const candidate = Math.min(1, (sorted[index].row.pValue * sorted.length) / rank);
    runningMinimum = Math.min(runningMinimum, candidate);
    adjusted[sorted[index].index] = runningMinimum;
  }

  return rows.map((row, index) => ({
    ...row,
    adjustedPValue: adjusted[index],
  }));
};

const buildFamilyRows = (rows: readonly SignalConfluenceRow[]): SignalConfluenceFamilyAuditRow[] => {
  const numbersByFamily = new Map<SignalConfluenceFamilyKey, Set<number>>();

  for (const row of rows) {
    for (const mention of row.supportMentions) {
      if (mention.family === "user-state") continue;
      const numbers = numbersByFamily.get(mention.family) ?? new Set<number>();
      numbers.add(row.number);
      numbersByFamily.set(mention.family, numbers);
    }
  }

  return Array.from(numbersByFamily.entries())
    .map(([family, numbers]) => ({
      family,
      label: signalConfluenceFamilyLabel(family),
      numbers: Array.from(numbers).sort((left, right) => left - right),
    }))
    .filter((row) => row.numbers.length > 0)
    .sort((left, right) => left.label.localeCompare(right.label));
};

export function auditSignalConfluenceIndependence(
  rows: readonly SignalConfluenceRow[],
  options: SignalConfluenceIndependenceAuditOptions = {},
): SignalConfluenceIndependenceAudit {
  const universeSize = Math.max(1, Math.floor(options.universeSize ?? LOTTERY_POOL_SIZE));
  const falseDiscoveryRate = Math.max(0, Math.min(1, options.falseDiscoveryRate ?? DEFAULT_FALSE_DISCOVERY_RATE));
  const familyRows = buildFamilyRows(rows);
  const unadjustedPairs: SignalConfluencePairAuditRow[] = [];

  for (let leftIndex = 0; leftIndex < familyRows.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < familyRows.length; rightIndex += 1) {
      const left = familyRows[leftIndex];
      const right = familyRows[rightIndex];
      const rightSet = new Set(right.numbers);
      const sharedNumbers = left.numbers.filter((number) => rightSet.has(number));
      const observedOverlap = sharedNumbers.length;
      const expectedOverlap = (left.numbers.length * right.numbers.length) / universeSize;
      const unionSize = left.numbers.length + right.numbers.length - observedOverlap;
      const smallerSize = Math.min(left.numbers.length, right.numbers.length);
      const pValue = hypergeometricUpperTail(
        universeSize,
        left.numbers.length,
        right.numbers.length,
        observedOverlap,
      );

      unadjustedPairs.push({
        leftFamily: left.family,
        leftLabel: left.label,
        leftSize: left.numbers.length,
        rightFamily: right.family,
        rightLabel: right.label,
        rightSize: right.numbers.length,
        sharedNumbers,
        observedOverlap,
        expectedOverlap,
        overlapLift: expectedOverlap > 0 ? observedOverlap / expectedOverlap : 0,
        jaccard: unionSize > 0 ? observedOverlap / unionSize : 0,
        containment: smallerSize > 0 ? observedOverlap / smallerSize : 0,
        pValue,
        adjustedPValue: 1,
        flagged: false,
      });
    }
  }

  const adjustedPairs = applyBenjaminiHochberg(unadjustedPairs).map((row) => ({
    ...row,
    flagged: row.observedOverlap > row.expectedOverlap && row.adjustedPValue <= falseDiscoveryRate,
  }));
  const pairRows = adjustedPairs.sort((left, right) => (
    Number(right.flagged) - Number(left.flagged)
    || left.adjustedPValue - right.adjustedPValue
    || right.jaccard - left.jaccard
    || left.leftLabel.localeCompare(right.leftLabel)
    || left.rightLabel.localeCompare(right.rightLabel)
  ));
  const highestOverlapPair = pairRows
    .slice()
    .sort((left, right) => (
      right.jaccard - left.jaccard
      || right.containment - left.containment
      || right.observedOverlap - left.observedOverlap
    ))[0] ?? null;

  return {
    universeSize,
    falseDiscoveryRate,
    familyRows,
    pairRows,
    activeFamilyCount: familyRows.length,
    pairCount: pairRows.length,
    flaggedPairCount: pairRows.filter((row) => row.flagged).length,
    highestOverlapPair,
  };
}

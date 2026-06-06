export interface OddEvenRatioOption {
  ratio: string;
  count: number;
  percent?: number;
}

export interface OddEvenRatioSummary {
  requested: number;
  totalAccepted: number;
  totalAttempts: number;
  acceptedRatios: Record<string, number>;
  targetRatios?: Record<string, number>;
}

const normalizeRatioList = (ratios: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const rawRatio of ratios) {
    const ratio = String(rawRatio ?? "").trim();
    if (!ratio || seen.has(ratio)) continue;
    seen.add(ratio);
    normalized.push(ratio);
  }
  return normalized;
};

export const oddEvenRatioForNumbers = (numbers: number[]): string => {
  const odds = numbers.filter((number) => number % 2 !== 0).length;
  return `${odds}:${numbers.length - odds}`;
};

export const candidateOddEvenRatio = (
  candidate: { main: number[]; supp?: number[] },
): string => oddEvenRatioForNumbers([...candidate.main, ...(candidate.supp ?? [])]);

export const parseOddEvenRatio = (
  ratio: string,
): { odd: number; even: number; total: number } | null => {
  const match = String(ratio ?? "").trim().match(/^(\d+):(\d+)$/);
  if (!match) return null;
  const odd = Number(match[1]);
  const even = Number(match[2]);
  if (!Number.isInteger(odd) || !Number.isInteger(even) || odd < 0 || even < 0) return null;
  return { odd, even, total: odd + even };
};

export function buildOddEvenRatioQuotas(
  requested: number,
  selectedRatios: string[],
  ratioOptions?: OddEvenRatioOption[],
): Record<string, number> {
  const totalRequested = Math.max(0, Math.floor(Number.isFinite(requested) ? requested : 0));
  const ratios = normalizeRatioList(selectedRatios);
  if (totalRequested <= 0 || ratios.length === 0) return {};

  const optionByRatio = new Map<string, OddEvenRatioOption>();
  for (const option of ratioOptions ?? []) {
    const ratio = String(option?.ratio ?? "").trim();
    if (ratio) optionByRatio.set(ratio, option);
  }

  const weightedRatios = ratios.map((ratio, index) => {
    const option = optionByRatio.get(ratio);
    const countWeight = Number(option?.count);
    const percentWeight = Number(option?.percent);
    const weight = Number.isFinite(countWeight) && countWeight > 0
      ? countWeight
      : Number.isFinite(percentWeight) && percentWeight > 0
        ? percentWeight
        : 1;
    return { ratio, index, weight };
  });

  const weightTotal = weightedRatios.reduce((sum, item) => sum + item.weight, 0);
  if (weightTotal <= 0) return Object.fromEntries(ratios.map((ratio) => [ratio, 0]));

  const allocations = weightedRatios.map((item) => {
    const exact = (totalRequested * item.weight) / weightTotal;
    const floor = Math.floor(exact);
    return { ...item, exact, floor, remainder: exact - floor };
  });

  let allocated = allocations.reduce((sum, item) => sum + item.floor, 0);
  const quotas: Record<string, number> = Object.fromEntries(
    allocations.map((item) => [item.ratio, item.floor]),
  );

  const byRemainder = [...allocations].sort((left, right) => {
    if (right.remainder !== left.remainder) return right.remainder - left.remainder;
    return left.index - right.index;
  });

  let remainderIndex = 0;
  while (allocated < totalRequested && byRemainder.length > 0) {
    const target = byRemainder[remainderIndex % byRemainder.length];
    quotas[target.ratio] = (quotas[target.ratio] ?? 0) + 1;
    allocated += 1;
    remainderIndex += 1;
  }

  return quotas;
}

export function summarizeOddEvenRatioNumbers(
  numberSets: number[][],
  requested: number,
  totalAttempts: number,
  targetRatios?: Record<string, number>,
): OddEvenRatioSummary {
  const acceptedRatios: Record<string, number> = {};
  for (const numbers of numberSets) {
    const ratio = oddEvenRatioForNumbers(numbers);
    acceptedRatios[ratio] = (acceptedRatios[ratio] ?? 0) + 1;
  }
  return {
    requested,
    totalAccepted: numberSets.length,
    totalAttempts,
    acceptedRatios,
    ...(targetRatios ? { targetRatios } : {}),
  };
}

export function summarizeOddEvenRatios(
  candidates: { main: number[]; supp?: number[] }[],
  requested: number,
  totalAttempts: number,
  targetRatios?: Record<string, number>,
): OddEvenRatioSummary {
  return summarizeOddEvenRatioNumbers(
    candidates.map((candidate) => [...candidate.main, ...(candidate.supp ?? [])]),
    requested,
    totalAttempts,
    targetRatios,
  );
}

export function applyOddEvenRatioQuotas<T extends { main: number[]; supp?: number[] }>(
  candidates: T[],
  requested: number,
  selectedRatios: string[],
  ratioOptions?: OddEvenRatioOption[],
): {
  candidates: T[];
  quotas: Record<string, number>;
  acceptedRatios: Record<string, number>;
  shortfalls: Record<string, number>;
} {
  const quotas = buildOddEvenRatioQuotas(requested, selectedRatios, ratioOptions);
  const counts: Record<string, number> = {};
  const picked: T[] = [];

  for (const candidate of candidates) {
    if (picked.length >= requested) break;
    const ratio = candidateOddEvenRatio(candidate);
    const quota = quotas[ratio] ?? 0;
    if (quota <= 0) continue;
    if ((counts[ratio] ?? 0) >= quota) continue;
    picked.push(candidate);
    counts[ratio] = (counts[ratio] ?? 0) + 1;
  }

  const shortfalls: Record<string, number> = {};
  for (const [ratio, quota] of Object.entries(quotas)) {
    const missing = quota - (counts[ratio] ?? 0);
    if (missing > 0) shortfalls[ratio] = missing;
  }

  return {
    candidates: picked,
    quotas,
    acceptedRatios: counts,
    shortfalls,
  };
}

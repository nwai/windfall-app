export const MIN_TARGET_WEIGHT = 0.1;
export const MAX_TARGET_WEIGHT = 10;
export const DEFAULT_TARGET_WEIGHT = 1;
export const DEFAULT_WEIGHTED_TARGET_MATCH_COUNT = 4;

export interface WeightedTargetRow {
  number: number;
  weight: number;
  share: number;
  sharePercent: number;
}

export interface WeightedTargetSummary {
  selectedCount: number;
  totalWeight: number;
  meanWeight: number;
  minWeight: number;
  maxWeight: number;
  weightedMatchFloor: number;
  effectiveTargetCount: number;
  coefficientOfVariation: number;
  staleEntryCount: number;
}

export interface WeightedTargetModel {
  selectedNumbers: number[];
  normalizedTargets: Record<number, number>;
  rows: WeightedTargetRow[];
  summary: WeightedTargetSummary;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function roundWeight(value: number): number {
  return Math.round(value * 100) / 100;
}

export function normalizeWeightedTargetNumbers(values: readonly unknown[] | undefined): number[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<number>();
  const output: number[] = [];

  for (const value of values) {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(numeric)) continue;
    if (numeric < 1 || numeric > 45 || seen.has(numeric)) continue;
    seen.add(numeric);
    output.push(numeric);
  }

  return output;
}

export function sanitizeTargetWeight(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_TARGET_WEIGHT;
  return roundWeight(Math.min(MAX_TARGET_WEIGHT, Math.max(MIN_TARGET_WEIGHT, numeric)));
}

export function normalizeWeightedTargets(
  userSelectedNumbers: readonly unknown[] | undefined,
  weightedTargets: unknown,
): Record<number, number> {
  const selectedNumbers = normalizeWeightedTargetNumbers(userSelectedNumbers);
  const source = isPlainObject(weightedTargets) ? weightedTargets : {};
  const normalized: Record<number, number> = {};

  for (const number of selectedNumbers) {
    normalized[number] = sanitizeTargetWeight(source[String(number)] ?? DEFAULT_TARGET_WEIGHT);
  }

  return normalized;
}

export function countStaleWeightedTargetEntries(
  userSelectedNumbers: readonly unknown[] | undefined,
  weightedTargets: unknown,
): number {
  if (!isPlainObject(weightedTargets)) return 0;
  const selected = new Set(normalizeWeightedTargetNumbers(userSelectedNumbers));
  return Object.keys(weightedTargets).reduce((count, key) => {
    const numericKey = Number(key);
    const validNumber = Number.isInteger(numericKey) && numericKey >= 1 && numericKey <= 45;
    return validNumber && selected.has(numericKey) ? count : count + 1;
  }, 0);
}

export function areWeightedTargetsEqual(left: unknown, right: unknown): boolean {
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const leftKeys = Object.keys(left).sort((a, b) => Number(a) - Number(b));
  const rightKeys = Object.keys(right).sort((a, b) => Number(a) - Number(b));
  if (leftKeys.length !== rightKeys.length) return false;

  for (let index = 0; index < leftKeys.length; index += 1) {
    const leftKey = leftKeys[index];
    const rightKey = rightKeys[index];
    if (leftKey !== rightKey) return false;
    const leftValue = left[leftKey];
    const leftSanitized = sanitizeTargetWeight(leftValue);
    if (typeof leftValue !== "number" || leftValue !== leftSanitized) return false;
    if (leftSanitized !== sanitizeTargetWeight(right[rightKey])) return false;
  }

  return true;
}

export function sanitizeTargetMatchCount(value: unknown, fallback = DEFAULT_WEIGHTED_TARGET_MATCH_COUNT): number {
  const numeric = typeof value === "number" ? value : Number(value);
  const finite = Number.isFinite(numeric) ? numeric : fallback;
  return Math.min(8, Math.max(1, Math.round(finite)));
}

export function computeWeightedMatchFloor(
  userSelectedNumbers: readonly unknown[] | undefined,
  weightedTargets: unknown,
  targetMatchCount = DEFAULT_WEIGHTED_TARGET_MATCH_COUNT,
): number {
  const selectedNumbers = normalizeWeightedTargetNumbers(userSelectedNumbers);
  if (selectedNumbers.length === 0) return 0;

  const normalizedTargets = normalizeWeightedTargets(selectedNumbers, weightedTargets);
  const requiredMatches = Math.min(sanitizeTargetMatchCount(targetMatchCount), selectedNumbers.length);
  const selectedWeights = selectedNumbers
    .map((number) => normalizedTargets[number] ?? DEFAULT_TARGET_WEIGHT)
    .sort((a, b) => a - b)
    .slice(0, requiredMatches);

  return roundWeight(selectedWeights.reduce((sum, weight) => sum + weight, 0));
}

export function buildWeightedTargetModel(
  userSelectedNumbers: readonly unknown[] | undefined,
  weightedTargets: unknown,
  targetMatchCount = DEFAULT_WEIGHTED_TARGET_MATCH_COUNT,
): WeightedTargetModel {
  const selectedNumbers = normalizeWeightedTargetNumbers(userSelectedNumbers);
  const normalizedTargets = normalizeWeightedTargets(selectedNumbers, weightedTargets);
  const weights = selectedNumbers.map((number) => normalizedTargets[number] ?? DEFAULT_TARGET_WEIGHT);
  const selectedCount = selectedNumbers.length;
  const totalWeight = roundWeight(weights.reduce((sum, weight) => sum + weight, 0));
  const meanWeight = selectedCount > 0 ? totalWeight / selectedCount : 0;
  const sumSquares = weights.reduce((sum, weight) => sum + weight * weight, 0);
  const effectiveTargetCount = sumSquares > 0 ? (totalWeight * totalWeight) / sumSquares : 0;
  const variance = selectedCount > 0
    ? weights.reduce((sum, weight) => sum + (weight - meanWeight) ** 2, 0) / selectedCount
    : 0;
  const coefficientOfVariation = meanWeight > 0 ? Math.sqrt(variance) / meanWeight : 0;

  const rows = selectedNumbers.map<WeightedTargetRow>((number) => {
    const weight = normalizedTargets[number] ?? DEFAULT_TARGET_WEIGHT;
    const share = totalWeight > 0 ? weight / totalWeight : 0;
    return {
      number,
      weight,
      share,
      sharePercent: share * 100,
    };
  });

  return {
    selectedNumbers,
    normalizedTargets,
    rows,
    summary: {
      selectedCount,
      totalWeight,
      meanWeight: roundWeight(meanWeight),
      minWeight: selectedCount > 0 ? Math.min(...weights) : 0,
      maxWeight: selectedCount > 0 ? Math.max(...weights) : 0,
      weightedMatchFloor: computeWeightedMatchFloor(selectedNumbers, normalizedTargets, targetMatchCount),
      effectiveTargetCount: roundWeight(effectiveTargetCount),
      coefficientOfVariation: roundWeight(coefficientOfVariation),
      staleEntryCount: countStaleWeightedTargetEntries(selectedNumbers, weightedTargets),
    },
  };
}

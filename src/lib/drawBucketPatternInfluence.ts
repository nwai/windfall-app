export interface DrawBucketPatternGenerationInfluenceRow {
  key: string;
  label: string;
  numbers: number[];
  recentAverageHits: number;
}

export interface DrawBucketPatternDigitBoost {
  singleDigit: number;
  twoDigit: number;
}

export interface DrawBucketPatternDigitBoostResult {
  boostsByDigit: Partial<Record<number, DrawBucketPatternDigitBoost>>;
  appliedRows: DrawBucketPatternGenerationInfluenceRow[];
  skippedRows: DrawBucketPatternGenerationInfluenceRow[];
}

const MAX_DIGIT_BOOST = 5;

const clampBoost = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(MAX_DIGIT_BOOST, value);
};

const terminalDigitForBucket = (numbers: number[]): number | null => {
  const validNumbers = numbers.filter((number) => Number.isInteger(number) && number >= 1 && number <= 45);
  if (validNumbers.length === 0) return null;
  const firstDigit = validNumbers[0] % 10;
  return validNumbers.every((number) => number % 10 === firstDigit) ? firstDigit : null;
};

export const buildDrawBucketPatternDigitBoosts = (
  rows: DrawBucketPatternGenerationInfluenceRow[],
  enabled: boolean,
): DrawBucketPatternDigitBoostResult => {
  if (!enabled) {
    return { boostsByDigit: {}, appliedRows: [], skippedRows: [] };
  }

  return rows.reduce<DrawBucketPatternDigitBoostResult>((result, row) => {
    const boost = clampBoost(row.recentAverageHits);
    const digit = terminalDigitForBucket(row.numbers);

    if (boost <= 0 || digit === null) {
      result.skippedRows.push(row);
      return result;
    }

    const hasSingleDigit = row.numbers.some((number) => number >= 1 && number <= 9);
    const hasTwoDigit = row.numbers.some((number) => number >= 10 && number <= 45);
    const previous = result.boostsByDigit[digit] ?? { singleDigit: 0, twoDigit: 0 };
    result.boostsByDigit[digit] = {
      singleDigit: hasSingleDigit ? Math.max(previous.singleDigit, boost) : previous.singleDigit,
      twoDigit: hasTwoDigit ? Math.max(previous.twoDigit, boost) : previous.twoDigit,
    };
    result.appliedRows.push(row);
    return result;
  }, { boostsByDigit: {}, appliedRows: [], skippedRows: [] });
};

export const formatDrawBucketPatternInfluenceTrace = (
  result: DrawBucketPatternDigitBoostResult,
  recentWindowSize: number,
): string | null => {
  if (result.appliedRows.length === 0) return null;

  const topRows = result.appliedRows
    .slice()
    .sort((left, right) => right.recentAverageHits - left.recentAverageHits || left.label.localeCompare(right.label))
    .slice(0, 10)
    .map((row) => `${row.label} +${clampBoost(row.recentAverageHits).toFixed(2)}`)
    .join(", ");
  const skippedSuffix = result.skippedRows.length
    ? `; skipped ${result.skippedRows.length} non-terminal/zero rows`
    : "";

  return `[TRACE] Draw Bucket Patterns influence ON: Recent avg (${recentWindowSize}) is used as a soft terminal-digit boost before candidate filters run; top boosts ${topRows}${skippedSuffix}.`;
};

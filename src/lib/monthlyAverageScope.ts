const PARTIAL_HISTORY_MONTH_LABELS = ["2024-05"] as const;

const PARTIAL_HISTORY_MONTH_LABEL_SET = new Set<string>(PARTIAL_HISTORY_MONTH_LABELS);

/**
 * The bundled Windfall history starts part-way through 2024-05.
 * Keep that opening month visible in month-by-month views, but exclude it from
 * multi-month baseline / average calculations that are meant to represent full months.
 */
export const MONTH_LABELS_EXCLUDED_FROM_HISTORY_BASELINES = PARTIAL_HISTORY_MONTH_LABELS;

const collectExcludedMonthLabels = <T>(
  rows: readonly T[],
  getMonthLabel: (row: T) => string | null | undefined,
): string[] => {
  const monthLabels = rows
    .map((row) => getMonthLabel(row))
    .filter((monthLabel): monthLabel is string => Boolean(monthLabel))
    .sort((left, right) => left.localeCompare(right));
  const earliestMonthLabel = monthLabels[0];
  if (!earliestMonthLabel || !PARTIAL_HISTORY_MONTH_LABEL_SET.has(earliestMonthLabel)) {
    return [];
  }
  return [earliestMonthLabel];
};

export const isMonthExcludedFromHistoryBaselines = (
  monthLabel: string | null | undefined,
): boolean => {
  if (!monthLabel) return false;
  return PARTIAL_HISTORY_MONTH_LABEL_SET.has(monthLabel);
};

export const filterRowsForHistoryBaselines = <T>(
  rows: readonly T[],
  getMonthLabel: (row: T) => string | null | undefined,
): T[] => {
  const excludedMonthLabels = new Set(collectExcludedMonthLabels(rows, getMonthLabel));
  if (!excludedMonthLabels.size) return [...rows];
  return rows.filter((row) => !excludedMonthLabels.has(getMonthLabel(row) ?? ""));
};

export const getExcludedMonthLabelsForHistoryBaselines = <T>(
  rows: readonly T[],
  getMonthLabel: (row: T) => string | null | undefined,
): string[] => collectExcludedMonthLabels(rows, getMonthLabel);

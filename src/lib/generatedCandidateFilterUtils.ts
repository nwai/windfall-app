export const RANGE_FILTER_EPSILON = 1e-9;

/**
 * Mirrors the numeric precision shown in the UI so exact min/max filters can
 * match the value the user actually sees in the table.
 */
export const roundValueForDisplay = (value: number, fractionDigits: number): number => Number(value.toFixed(fractionDigits));

export const isValueInRange = (
  raw: number | undefined | null,
  min: number | null,
  max: number | null,
): boolean => {
  if (min === null && max === null) return true;
  if (raw === undefined || raw === null) return false;
  if (min !== null && raw < min - RANGE_FILTER_EPSILON) return false;
  if (max !== null && raw > max + RANGE_FILTER_EPSILON) return false;
  return true;
};

export const isDisplayedValueInRange = (
  raw: number | undefined | null,
  min: number | null,
  max: number | null,
  fractionDigits: number,
): boolean => {
  if (raw === undefined || raw === null) return min === null && max === null;
  return isValueInRange(roundValueForDisplay(raw, fractionDigits), min, max);
};
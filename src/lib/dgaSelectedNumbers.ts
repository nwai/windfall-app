const MIN_DGA_NUMBER = 1;
const MAX_DGA_NUMBER = 45;

/**
 * Normalizes DGA strip selections so downstream UI can safely assume
 * unique, valid, ascending row numbers.
 */
export const normalizeDgaSelectedNumbers = (
  numbers?: readonly number[] | null,
): number[] => {
  const validNumbers = (numbers ?? []).filter(
    (value): value is number =>
      Number.isInteger(value) && value >= MIN_DGA_NUMBER && value <= MAX_DGA_NUMBER,
  );

  return Array.from(new Set(validNumbers)).sort((a, b) => a - b);
};

export const summarizeDgaSelectedNumbers = (
  numbers?: readonly number[] | null,
): string => normalizeDgaSelectedNumbers(numbers).join(", ");

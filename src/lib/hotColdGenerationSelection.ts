export interface HotColdGenerationSelectionState {
  forcedNumbers: number[];
  excludedNumbers: number[];
}

export function normalizeHotColdGenerationNumbers(numbers: readonly number[] | undefined): number[] {
  if (!Array.isArray(numbers)) return [];
  const seen = new Set<number>();
  const output: number[] = [];
  for (const number of numbers) {
    if (!Number.isInteger(number) || number < 1 || number > 45 || seen.has(number)) continue;
    seen.add(number);
    output.push(number);
  }
  return output.sort((left, right) => left - right);
}

export function toggleHotColdIncludeSelection(
  state: HotColdGenerationSelectionState,
  number: number,
): HotColdGenerationSelectionState {
  const forced = normalizeHotColdGenerationNumbers(state.forcedNumbers);
  const excluded = normalizeHotColdGenerationNumbers(state.excludedNumbers);
  if (!Number.isInteger(number) || number < 1 || number > 45) {
    return { forcedNumbers: forced, excludedNumbers: excluded };
  }

  if (forced.includes(number)) {
    return {
      forcedNumbers: forced.filter((value) => value !== number),
      excludedNumbers: excluded,
    };
  }

  return {
    forcedNumbers: normalizeHotColdGenerationNumbers([...forced, number]),
    excludedNumbers: excluded.filter((value) => value !== number),
  };
}

export function toggleHotColdExcludeSelection(
  state: HotColdGenerationSelectionState,
  number: number,
): HotColdGenerationSelectionState {
  const forced = normalizeHotColdGenerationNumbers(state.forcedNumbers);
  const excluded = normalizeHotColdGenerationNumbers(state.excludedNumbers);
  if (!Number.isInteger(number) || number < 1 || number > 45) {
    return { forcedNumbers: forced, excludedNumbers: excluded };
  }

  if (excluded.includes(number)) {
    return {
      forcedNumbers: forced,
      excludedNumbers: excluded.filter((value) => value !== number),
    };
  }

  return {
    forcedNumbers: forced.filter((value) => value !== number),
    excludedNumbers: normalizeHotColdGenerationNumbers([...excluded, number]),
  };
}

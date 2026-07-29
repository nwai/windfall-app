import type { CandidateSet, KeptGeneratedCandidateRow } from "../types";

const MIN_LOTTERY_NUMBER = 1;
const MAX_LOTTERY_NUMBER = 45;
const MAIN_COUNT = 6;

const isValidLotteryNumber = (value: number): boolean => (
  Number.isInteger(value) && value >= MIN_LOTTERY_NUMBER && value <= MAX_LOTTERY_NUMBER
);

export const generationSessionMainKeyFromNumbers = (numbers: readonly number[]): string | null => {
  const firstSix = numbers.slice(0, MAIN_COUNT);
  if (firstSix.length !== MAIN_COUNT || firstSix.some((value) => !isValidLotteryNumber(value))) {
    return null;
  }

  const unique = Array.from(new Set(firstSix));
  if (unique.length !== MAIN_COUNT) return null;

  return unique.sort((left, right) => left - right).join("-");
};

export const generationSessionMainKeyForCandidate = (candidate: CandidateSet): string | null => (
  generationSessionMainKeyFromNumbers(candidate.main)
);

export const generationSessionMainKeyForKeptRow = (row: KeptGeneratedCandidateRow): string | null => (
  generationSessionMainKeyFromNumbers(row.main)
);

export const buildGenerationSessionMainKeySet = (
  rows: readonly KeptGeneratedCandidateRow[],
): Set<string> => {
  const keys = new Set<string>();
  rows.forEach((row) => {
    const key = generationSessionMainKeyForKeptRow(row);
    if (key) keys.add(key);
  });
  return keys;
};

export interface GenerationSessionFilterResult {
  candidates: CandidateSet[];
  duplicateRejects: number;
  invalidRejects: number;
}

export const filterCandidatesForGenerationSession = (
  candidates: readonly CandidateSet[],
  existingMainKeys: ReadonlySet<string>,
): GenerationSessionFilterResult => {
  const seen = new Set(existingMainKeys);
  const accepted: CandidateSet[] = [];
  let duplicateRejects = 0;
  let invalidRejects = 0;

  candidates.forEach((candidate) => {
    const key = generationSessionMainKeyForCandidate(candidate);
    if (!key) {
      invalidRejects += 1;
      return;
    }
    if (seen.has(key)) {
      duplicateRejects += 1;
      return;
    }
    seen.add(key);
    accepted.push(candidate);
  });

  return {
    candidates: accepted,
    duplicateRejects,
    invalidRejects,
  };
};

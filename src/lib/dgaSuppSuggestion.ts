import type { Draw } from "../types";

export interface DgaSuppSuggestionNumberEvidence {
  number: number;
  activeSuppCount: number;
  fullSuppCount: number;
  activeMainCount: number;
  fullMainCount: number;
  activeDrawCount: number;
  fullDrawCount: number;
  activeLastSuppGap: number | null;
  fullLastSuppGap: number | null;
  rank: number;
}

export interface DgaSuppSuggestionPairEvidence {
  pair: [number, number];
  activePairSuppCount: number;
  fullPairSuppCount: number;
  activeDrawCount: number;
  fullDrawCount: number;
  activeLastPairSuppGap: number | null;
  fullLastPairSuppGap: number | null;
  individualActiveSuppCount: number;
  individualFullSuppCount: number;
  selected: boolean;
  rank: number;
}

export interface DgaSuppSuggestionPairCoverage {
  activeObservedPairs: number;
  fullObservedPairs: number;
  totalPairs: number;
}

export interface DgaSuppSuggestion {
  selectedNumbers: number[];
  main: number[];
  supp: number[];
  selectedPair: [number, number];
  selectedPairEvidence: DgaSuppSuggestionPairEvidence;
  evidence: DgaSuppSuggestionNumberEvidence[];
  pairEvidence: DgaSuppSuggestionPairEvidence[];
  pairCoverage: DgaSuppSuggestionPairCoverage;
  reason: string;
}

const MIN_NUMBER = 1;
const MAX_NUMBER = 45;
const REQUIRED_SELECTION_COUNT = 8;
const SUPP_COUNT = 2;

const isValidNumber = (value: unknown): value is number => (
  typeof value === "number" &&
  Number.isInteger(value) &&
  Number.isFinite(value) &&
  value >= MIN_NUMBER &&
  value <= MAX_NUMBER
);

const normalizeSelection = (numbers: readonly unknown[]): number[] => {
  const selected = new Set<number>();
  for (const value of numbers) {
    if (isValidNumber(value)) selected.add(value);
  }
  return Array.from(selected).sort((left, right) => left - right);
};

interface RoleCounts {
  drawCount: number;
  mainCounts: Map<number, number>;
  suppCounts: Map<number, number>;
  lastSuppIndex: Map<number, number>;
  suppPairCounts: Map<string, number>;
  lastSuppPairIndex: Map<string, number>;
}

const emptyCounts = (selectedNumbers: readonly number[]): RoleCounts => ({
  drawCount: 0,
  mainCounts: new Map(selectedNumbers.map((number) => [number, 0])),
  suppCounts: new Map(selectedNumbers.map((number) => [number, 0])),
  lastSuppIndex: new Map<number, number>(),
  suppPairCounts: new Map<string, number>(),
  lastSuppPairIndex: new Map<string, number>(),
});

const pairKey = (left: number, right: number): string => (
  left < right ? `${left}-${right}` : `${right}-${left}`
);

const allPairs = (numbers: readonly number[]): Array<[number, number]> => {
  const output: Array<[number, number]> = [];
  for (let leftIndex = 0; leftIndex < numbers.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < numbers.length; rightIndex += 1) {
      output.push([numbers[leftIndex], numbers[rightIndex]]);
    }
  }
  return output;
};

const countRoleEvidence = (
  history: readonly Draw[],
  selectedNumbers: readonly number[],
): RoleCounts => {
  const selectedSet = new Set(selectedNumbers);
  const counts = emptyCounts(selectedNumbers);

  history.forEach((draw) => {
    if (draw.isSimulated) return;
    const main = Array.isArray(draw.main) ? draw.main.filter(isValidNumber) : [];
    const supp = Array.isArray(draw.supp) ? draw.supp.filter(isValidNumber) : [];
    if (main.length === 0 && supp.length === 0) return;

    const drawIndex = counts.drawCount;
    counts.drawCount += 1;

    new Set(main).forEach((number) => {
      if (!selectedSet.has(number)) return;
      counts.mainCounts.set(number, (counts.mainCounts.get(number) ?? 0) + 1);
    });
    new Set(supp).forEach((number) => {
      if (!selectedSet.has(number)) return;
      counts.suppCounts.set(number, (counts.suppCounts.get(number) ?? 0) + 1);
      counts.lastSuppIndex.set(number, drawIndex);
    });

    const uniqueSupp = Array.from(new Set(supp)).filter((number) => selectedSet.has(number));
    if (uniqueSupp.length === SUPP_COUNT) {
      const key = pairKey(uniqueSupp[0], uniqueSupp[1]);
      counts.suppPairCounts.set(key, (counts.suppPairCounts.get(key) ?? 0) + 1);
      counts.lastSuppPairIndex.set(key, drawIndex);
    }
  });

  return counts;
};

const suppGap = (counts: RoleCounts, number: number): number | null => {
  const lastIndex = counts.lastSuppIndex.get(number);
  return lastIndex === undefined ? null : counts.drawCount - 1 - lastIndex;
};

const suppPairGap = (counts: RoleCounts, key: string): number | null => {
  const lastIndex = counts.lastSuppPairIndex.get(key);
  return lastIndex === undefined ? null : counts.drawCount - 1 - lastIndex;
};

const compareNullableGap = (left: number | null, right: number | null): number => {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
};

const comparePairEvidence = (
  left: DgaSuppSuggestionPairEvidence,
  right: DgaSuppSuggestionPairEvidence,
): number => (
  right.individualActiveSuppCount - left.individualActiveSuppCount ||
  right.activePairSuppCount - left.activePairSuppCount ||
  right.individualFullSuppCount - left.individualFullSuppCount ||
  right.fullPairSuppCount - left.fullPairSuppCount ||
  compareNullableGap(left.activeLastPairSuppGap, right.activeLastPairSuppGap) ||
  compareNullableGap(left.fullLastPairSuppGap, right.fullLastPairSuppGap) ||
  left.pair[0] - right.pair[0] ||
  left.pair[1] - right.pair[1]
);

export const buildDgaSuppSuggestion = (
  selectedNumbersInput: readonly unknown[],
  activeHistory: readonly Draw[],
  fullHistory: readonly Draw[],
): DgaSuppSuggestion | null => {
  const selectedNumbers = normalizeSelection(selectedNumbersInput);
  if (selectedNumbers.length !== REQUIRED_SELECTION_COUNT) return null;

  const activeCounts = countRoleEvidence(activeHistory, selectedNumbers);
  const fullCounts = countRoleEvidence(fullHistory, selectedNumbers);

  const unrankedEvidence = selectedNumbers.map((number) => ({
    number,
    activeSuppCount: activeCounts.suppCounts.get(number) ?? 0,
    fullSuppCount: fullCounts.suppCounts.get(number) ?? 0,
    activeMainCount: activeCounts.mainCounts.get(number) ?? 0,
    fullMainCount: fullCounts.mainCounts.get(number) ?? 0,
    activeDrawCount: activeCounts.drawCount,
    fullDrawCount: fullCounts.drawCount,
    activeLastSuppGap: suppGap(activeCounts, number),
    fullLastSuppGap: suppGap(fullCounts, number),
    rank: 0,
  }));

  const hasSupplementaryEvidence = unrankedEvidence.some(
    (row) => row.activeSuppCount > 0 || row.fullSuppCount > 0,
  );
  if (!hasSupplementaryEvidence) return null;

  const evidence = [...unrankedEvidence]
    .sort((left, right) =>
      right.activeSuppCount - left.activeSuppCount ||
      right.fullSuppCount - left.fullSuppCount ||
      left.number - right.number
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const unrankedPairEvidence = allPairs(selectedNumbers).map((pair) => {
    const key = pairKey(pair[0], pair[1]);
    const activePairSuppCount = activeCounts.suppPairCounts.get(key) ?? 0;
    const fullPairSuppCount = fullCounts.suppPairCounts.get(key) ?? 0;
    return {
      pair,
      activePairSuppCount,
      fullPairSuppCount,
      activeDrawCount: activeCounts.drawCount,
      fullDrawCount: fullCounts.drawCount,
      activeLastPairSuppGap: suppPairGap(activeCounts, key),
      fullLastPairSuppGap: suppPairGap(fullCounts, key),
      individualActiveSuppCount: (activeCounts.suppCounts.get(pair[0]) ?? 0) + (activeCounts.suppCounts.get(pair[1]) ?? 0),
      individualFullSuppCount: (fullCounts.suppCounts.get(pair[0]) ?? 0) + (fullCounts.suppCounts.get(pair[1]) ?? 0),
      selected: false,
      rank: 0,
    };
  });

  const bestPair = [...unrankedPairEvidence].sort(comparePairEvidence)[0];
  const selectedPair: [number, number] = [...bestPair.pair].sort((left, right) => left - right) as [number, number];
  const supp = [...selectedPair];
  const suppSet = new Set(supp);
  const main = selectedNumbers.filter((number) => !suppSet.has(number));
  const pairEvidence = [...unrankedPairEvidence]
    .sort(comparePairEvidence)
    .map((row, index) => {
      const selected = row.pair[0] === selectedPair[0] && row.pair[1] === selectedPair[1];
      return { ...row, selected, rank: index + 1 };
    });
  const selectedPairEvidence = pairEvidence.find((row) => row.selected) ?? {
    ...bestPair,
    pair: selectedPair,
    selected: true,
    rank: 1,
  };
  const pairCoverage = {
    activeObservedPairs: unrankedPairEvidence.filter((row) => row.activePairSuppCount > 0).length,
    fullObservedPairs: unrankedPairEvidence.filter((row) => row.fullPairSuppCount > 0).length,
    totalPairs: unrankedPairEvidence.length,
  };

  return {
    selectedNumbers,
    main,
    supp,
    selectedPair,
    selectedPairEvidence,
    evidence,
    pairEvidence,
    pairCoverage,
    reason: "Individual active WFMQYH supplementary counts lead; exact supplementary-pair history is used as a tie-breaker, then full real-history evidence. Diagnostic role evidence only, not a probability.",
  };
};

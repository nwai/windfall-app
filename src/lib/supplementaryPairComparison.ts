import type { Draw } from "../types";
import {
  buildDgaSuppSuggestion,
  compareDgaSuppPairSupport,
  type DgaSuppSuggestionPairEvidence,
} from "./dgaSuppSuggestion";
import { prepareNextDrawEvidenceHistory, rankSupplementaryPairs } from "./nextDrawEvidenceEnsemble";
import { parseDrawDateToEpoch } from "./recentDraws";
import { normalizeSelectionInsightNumbers } from "./selectionInsights";

export type SupplementaryPairPolicy = "auto" | "blend" | "co-draws";
export const SUPPLEMENTARY_PAIR_POLICIES: SupplementaryPairPolicy[] = ["auto", "blend", "co-draws"];
export const SUPPLEMENTARY_PAIR_POLICY_LABELS: Record<SupplementaryPairPolicy, string> = {
  auto: "Current Auto supps", blend: "Pair-blend evidence", "co-draws": "All History co-draws",
};

export const orderSupplementaryPairRows = (
  rows: readonly SupplementaryPairComparisonRow[], policy: SupplementaryPairPolicy,
): SupplementaryPairComparisonRow[] => [...rows].sort((left, right) => (
  (policy === "auto" ? left.autoRank - right.autoRank
    : policy === "blend" ? left.blendRank - right.blendRank : right.fullCoDraws - left.fullCoDraws)
  || left.pair[0] - right.pair[0] || left.pair[1] - right.pair[1]
));

export const supplementaryPairForPolicy = (comparison: SupplementaryPairComparison, policy: SupplementaryPairPolicy) => {
  const rows = orderSupplementaryPairRows(comparison.rows, policy);
  const observed = policy === "co-draws" ? rows[0].fullCoDraws > 0
    : Boolean(policy === "auto" ? comparison.current.pair : comparison.alternative.pair);
  const tied = policy === "co-draws" ? rows.filter(row => row.fullCoDraws === rows[0].fullCoDraws).length
    : policy === "auto" ? rows[0].autoTies : rows[0].blendTies;
  const pair = observed ? rows[0].pair : comparison.selectedNumbers.slice(-2) as [number, number];
  return { pair: [...pair] as [number, number], numericalTie: observed && tied > 1, noEvidenceFallback: !observed };
};

export interface SupplementaryPairComparisonRow extends DgaSuppSuggestionPairEvidence {
  windowCoDraws: number;
  fullCoDraws: number;
  autoRank: number;
  autoTies: number;
  blendRank: number;
  blendTies: number;
  blendScore: number;
}

export interface SupplementaryPairChoice {
  pair: [number, number] | null;
  tiedPairs: Array<[number, number]>;
  reason: string;
}

export interface SupplementaryPairComparison {
  selectedNumbers: number[];
  windowDrawCount: number;
  fullDrawCount: number;
  ignoredWindowRows: number;
  ignoredFullRows: number;
  current: SupplementaryPairChoice;
  alternative: SupplementaryPairChoice;
  rows: SupplementaryPairComparisonRow[];
}

const qualifiedHistory = (history: readonly Draw[]): Draw[] => (
  prepareNextDrawEvidenceHistory(history).draws.filter((draw) => (
    [1, 3, 5].includes(new Date(parseDrawDateToEpoch(draw.date)).getDay())
  ))
);

const key = (pair: readonly number[]): string => pair.join("-");

const countCoDraws = (history: readonly Draw[], selected: readonly number[]): Map<string, number> => {
  const selectedSet = new Set(selected);
  const counts = new Map<string, number>();
  for (const draw of history) {
    const present = [...draw.main, ...draw.supp].filter((number) => selectedSet.has(number)).sort((a, b) => a - b);
    for (let left = 0; left < present.length; left += 1) {
      for (let right = left + 1; right < present.length; right += 1) {
        const pairKey = key([present[left], present[right]]);
        counts.set(pairKey, (counts.get(pairKey) ?? 0) + 1);
      }
    }
  }
  return counts;
};

const setEvidenceRanks = (
  rows: SupplementaryPairComparisonRow[],
  compare: (left: SupplementaryPairComparisonRow, right: SupplementaryPairComparisonRow) => number,
  rankField: "autoRank" | "blendRank",
  tiesField: "autoTies" | "blendTies",
): void => {
  const ordered = [...rows].sort(compare);
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && compare(ordered[start], ordered[end]) === 0) end += 1;
    for (let index = start; index < end; index += 1) {
      ordered[index][rankField] = start + 1;
      ordered[index][tiesField] = end - start;
    }
    start = end;
  }
};

const compareBlend = (left: SupplementaryPairComparisonRow, right: SupplementaryPairComparisonRow): number => (
  right.blendScore - left.blendScore || right.fullPairSuppCount - left.fullPairSuppCount
);

const choice = (
  rows: SupplementaryPairComparisonRow[],
  rankField: "autoRank" | "blendRank",
  hasEvidence: boolean,
  method: string,
): SupplementaryPairChoice => {
  const tiedPairs = rows.filter((row) => row[rankField] === 1).map((row) => row.pair);
  if (!hasEvidence) return {
    pair: null,
    tiedPairs,
    reason: "No supplementary-role observations for these eight numbers in this method's history scope; no evidence-based recommendation.",
  };
  return {
    pair: tiedPairs[0],
    tiedPairs,
    reason: tiedPairs.length > 1
      ? `${tiedPairs.length} pairs remain tied after all ${method} evidence criteria. Numerical order supplies a reproducible example, not stronger evidence.`
      : `${method} evidence distinguishes this pair. Historical support is not a calibrated next-draw probability.`,
  };
};

export function buildSupplementaryPairComparison(
  selectedInput: readonly number[],
  activeHistory: readonly Draw[],
  fullHistory: readonly Draw[],
): SupplementaryPairComparison | null {
  const selectedNumbers = normalizeSelectionInsightNumbers([...selectedInput]);
  if (selectedNumbers.length !== 8) return null;

  const full = qualifiedHistory(fullHistory);
  const fullByDate = new Map(full.map((draw) => [parseDrawDateToEpoch(draw.date), draw]));
  const window = qualifiedHistory(activeHistory).filter((draw) => {
    const matching = fullByDate.get(parseDrawDateToEpoch(draw.date));
    return matching && draw.main.every((number) => matching.main.includes(number))
      && draw.supp.every((number) => matching.supp.includes(number));
  });
  const current = buildDgaSuppSuggestion(selectedNumbers, window, full);
  const windowCoDraws = countCoDraws(window, selectedNumbers);
  const fullCoDraws = countCoDraws(full, selectedNumbers);
  const blends = rankSupplementaryPairs(selectedNumbers, full);
  const blendByPair = new Map(blends.map((row) => [key(row.numbers), row]));
  const currentByPair = new Map(current?.pairEvidence.map((row) => [key(row.pair), row]) ?? []);
  const rows: SupplementaryPairComparisonRow[] = [];

  for (let left = 0; left < selectedNumbers.length; left += 1) {
    for (let right = left + 1; right < selectedNumbers.length; right += 1) {
      const pair: [number, number] = [selectedNumbers[left], selectedNumbers[right]];
      const pairKey = key(pair);
      const evidence = currentByPair.get(pairKey);
      rows.push({
        pair,
        activePairSuppCount: 0, fullPairSuppCount: 0,
        activeDrawCount: window.length, fullDrawCount: full.length,
        activeLastPairSuppGap: null, fullLastPairSuppGap: null,
        individualActiveSuppCount: 0, individualFullSuppCount: 0,
        selected: false, rank: 0,
        ...evidence,
        windowCoDraws: windowCoDraws.get(pairKey) ?? 0,
        fullCoDraws: fullCoDraws.get(pairKey) ?? 0,
        autoRank: 0, autoTies: 0, blendRank: 0, blendTies: 0,
        blendScore: blendByPair.get(pairKey)?.score ?? 0,
      });
    }
  }
  setEvidenceRanks(rows, compareDgaSuppPairSupport, "autoRank", "autoTies");
  setEvidenceRanks(rows, compareBlend, "blendRank", "blendTies");

  return {
    selectedNumbers,
    windowDrawCount: window.length,
    fullDrawCount: full.length,
    ignoredWindowRows: activeHistory.length - window.length,
    ignoredFullRows: fullHistory.length - full.length,
    current: choice(rows, "autoRank", current !== null, "Current Auto supps"),
    alternative: choice(rows, "blendRank", current !== null, "Pair-blend"),
    rows,
  };
}

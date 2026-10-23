export interface SurvivorRankingBoostState {
  selectedActive: boolean;
  selectedThreshold: number;
  selectedBonus: number;
  patternActive: boolean;
  patternBonusPerMatch: number;
}

const boundedNumber = (value: number, max: number): number => (
  Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0
);

export function buildSurvivorRankingBoostState(options: {
  selHitsEnabled: boolean;
  selectedNumberCount: number;
  selBonusThreshold: number;
  selBonusWeight: number;
  patternMode: "boost" | "restrict";
  selectedPatternCount: number;
  patternBoostFactor: number;
}): SurvivorRankingBoostState {
  const selectedBonus = boundedNumber(options.selBonusWeight, 5);
  const patternBonusPerMatch = boundedNumber(options.patternBoostFactor, 5);
  return {
    selectedActive: options.selHitsEnabled && options.selectedNumberCount > 0 && selectedBonus > 0,
    selectedThreshold: Math.floor(boundedNumber(options.selBonusThreshold, 8)),
    selectedBonus,
    patternActive: options.patternMode === "boost" && options.selectedPatternCount > 0 && patternBonusPerMatch > 0,
    patternBonusPerMatch,
  };
}

export function applySurvivorRankingBoosts(
  baseScore: number,
  selHits: number,
  patternMatches: number,
  state: SurvivorRankingBoostState,
): { score: number; selectedBonus: number; patternBonus: number } {
  const selectedBonus = state.selectedActive && selHits >= state.selectedThreshold ? state.selectedBonus : 0;
  const patternBonus = state.patternActive
    ? Math.max(0, Number.isFinite(patternMatches) ? Math.floor(patternMatches) : 0) * state.patternBonusPerMatch : 0;
  // Add after normalization so an explicitly enabled bonus also works with a zero base score.
  return { score: baseScore + selectedBonus + patternBonus, selectedBonus, patternBonus };
}

export function survivorRankingBoostDescriptions(state: SurvivorRankingBoostState): string[] {
  return [
    state.selectedActive ? `SelHits threshold bonus +${state.selectedBonus} at >=${state.selectedThreshold}` : null,
    state.patternActive ? `Window Stats pattern bonus +${state.patternBonusPerMatch} per matching selected pattern` : null,
  ].filter((value): value is string => value !== null);
}

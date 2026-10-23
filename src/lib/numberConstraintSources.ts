import { normalizeUserExclusionLocks } from "./userExclusionLocks";

export type NumberConstraintKind = "inclusions" | "exclusions";

export interface NumberConstraintSource {
  id: string;
  label: string;
  numbers: readonly number[];
  enabled?: boolean;
  scope?: "shared" | "generation-only";
  detail?: string;
  clearImpact: string;
  onClear: () => void;
  onRemoveNumber?: (number: number) => void;
}

export function summarizeNumberConstraintSources(sources: readonly NumberConstraintSource[]) {
  const active = sources.map(source => ({ ...source, numbers: normalizeUserExclusionLocks(source.numbers) }))
    .filter(source => source.enabled || source.numbers.length > 0);
  const numbers = normalizeUserExclusionLocks(active.flatMap(source => [...source.numbers]));
  const sharedNumbers = normalizeUserExclusionLocks(active.filter(source => source.scope !== "generation-only").flatMap(source => [...source.numbers]));
  const sharedSet = new Set(sharedNumbers);
  return { active, numbers, sharedNumbers, generationOnlyExtra: numbers.filter(number => !sharedSet.has(number)) };
}

export interface ClearedNumberConstraintSource {
  id: string;
  label: string;
  numbers: number[];
  clearImpact: string;
}

export function clearNumberConstraintSources(sources: readonly NumberConstraintSource[]): ClearedNumberConstraintSource[] {
  const { active } = summarizeNumberConstraintSources(sources);
  const report = active.map(source => ({ id: source.id, label: source.label,
    numbers: normalizeUserExclusionLocks(source.numbers), clearImpact: source.clearImpact }));
  active.forEach(source => source.onClear());
  return report;
}

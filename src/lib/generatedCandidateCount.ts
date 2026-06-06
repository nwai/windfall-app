export const DEFAULT_GENERATED_CANDIDATE_COUNT = 8;

export function normalizeGeneratedCandidateCount(
  value: unknown,
  fallback: number = DEFAULT_GENERATED_CANDIDATE_COUNT,
): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.round(numeric));
}

export function getGeneratedCandidateCountWindowDefault(
  activeWindowSize: number,
  fallback: number = DEFAULT_GENERATED_CANDIDATE_COUNT,
): number {
  if (!Number.isFinite(activeWindowSize) || activeWindowSize <= 0) return fallback;
  return normalizeGeneratedCandidateCount(activeWindowSize, fallback);
}

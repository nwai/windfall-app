/**
 * Weighted sampling without replacement (same logic as in BatesPanel).
 */
export function weightedSampleWithoutReplacement(
  items: number[],
  weights: number[],
  k: number,
  rng: () => number = Math.random
): number[] {
  if (k <= 0) return [];
  const keyed = items.map((item, idx) => {
    const rawWeight = weights[idx] ?? 0;
    const w = Number.isFinite(rawWeight) ? Math.max(rawWeight, 0) : 0;
    const u = Math.max(Number.EPSILON, Math.min(1 - Number.EPSILON, rng()));
    const key = Math.pow(u, 1 / (w || 1e-12));
    return { item, key };
  });
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, k).map(o => o.item);
}

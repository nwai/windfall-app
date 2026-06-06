export function ogaPercentileToSimilarity(percentile: number): number {
  if (!Number.isFinite(percentile)) return 0;
  const clamped = Math.max(0, Math.min(100, percentile));
  return 1 - clamped / 100;
}

// Weighted sampling without replacement (Efraimidis-Spirakis)

export function weightedSampleWithoutReplacement(items: number[], weights: number[], k: number, rng: () => number = Math.random): number[] {
  // Each item assigned key = u^{1/w}
  const keyed = items.map((item, idx) => {
    const w = Math.max(weights[idx], 0);
    const u = rng();
    const key = Math.pow(u, 1 / (w || 1e-12));
    return { item, key };
  });
  keyed.sort((a, b) => a.key - b.key); // smallest key ≈ largest weight
  return keyed.slice(0, k).map(o => o.item);
}
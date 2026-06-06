export function getUniqueRandomNumbers(
  n: number,
  min: number,
  max: number,
  exclude: number[] = [],
  pool?: number[]
): number[] {
  const excl = new Set(exclude);
  const source: number[] = pool
    ? pool.filter((x: number) => !excl.has(x))
    : [];
  if (!pool) {
    for (let i = min; i <= max; ++i) {
      if (!excl.has(i)) source.push(i);
    }
  }
  const count = Math.min(n, source.length);
  // Fisher-Yates partial shuffle: swap selected elements to the tail
  for (let i = source.length - 1; i > source.length - 1 - count && i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [source[i], source[j]] = [source[j], source[i]];
  }
  return source.slice(source.length - count).sort((a, b) => a - b);
}

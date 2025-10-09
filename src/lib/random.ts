export function getUniqueRandomNumbers(
  n: number,
  min: number,
  max: number,
  exclude: number[] = [],
  pool?: number[]
) {
  let source: number[] = pool
    ? pool.filter((x: number) => !exclude.includes(x))
    : [];
  if (!pool) {
    for (let i = min; i <= max; ++i) {
      if (!exclude.includes(i)) source.push(i);
    }
  }
  const nums: number[] = [];
  while (nums.length < n && source.length) {
    const idx = Math.floor(Math.random() * source.length);
    nums.push(source[idx]);
    source.splice(idx, 1);
  }
  return nums.sort((a, b) => a - b);
}
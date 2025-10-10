export interface GenerateOptions {
  count: number;
  oddEven: [number, number]; // [odd, even]
  numberPool: number[];      // all available numbers
  pickSize: number;          // numbers per candidate
}

export function generateCandidates(opts: GenerateOptions): number[][] {
  const { count, oddEven, numberPool, pickSize } = opts;
  const [needOdd, needEven] = oddEven;
  const odds = numberPool.filter(n => n % 2 === 1);
  const evens = numberPool.filter(n => n % 2 === 0);

  const results: number[][] = [];
  if (needOdd + needEven !== pickSize) {
    // fallback: ignore ratio or throw
    // throw new Error('Ratio does not match pick size');
  }

  for (let i = 0; i < count; i++) {
    const chosenOdd = sampleDistinct(odds, needOdd);
    const chosenEven = sampleDistinct(evens, needEven);
    const merged = shuffle([...chosenOdd, ...chosenEven]).slice(0, pickSize);
    results.push(merged);
  }
  return results;
}

function sampleDistinct(src: number[], k: number): number[] {
  if (k <= 0) return [];
  const pool = [...src];
  const out: number[] = [];
  for (let i = 0; i < k && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
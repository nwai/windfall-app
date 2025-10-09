// Triangular distribution on [0,1] with mode m ∈ [0,1]
// pdf(x) = 2x/m for x∈[0,m]; 2(1-x)/(1-m) for x∈[m,1]; (manage m=0 or m=1 edge)

export function triangularPdfAt(x: number, m: number): number {
  if (x < 0 || x > 1) return 0;
  if (m <= 0) { // degenerate left
    return x === 0 ? 0 : 2 * (1 - x);
  }
  if (m >= 1) { // degenerate right
    return x === 1 ? 0 : 2 * x;
  }
  if (x <= m) return (2 * x) / m;
  return (2 * (1 - x)) / (1 - m);
}

export function triangularDiscreteWeights(nSlots: number, m: number): number[] {
  const w: number[] = [];
  for (let i = 1; i <= nSlots; i++) {
    const center = (i - 0.5) / nSlots;
    w.push(triangularPdfAt(center, m));
  }
  return normalize(w);
}

function normalize(arr: number[]): number[] {
  const s = arr.reduce((a, b) => a + b, 0) || 1;
  return arr.map(v => v / s);
}
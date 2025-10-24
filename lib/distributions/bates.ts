// Bates distribution on [0,1]: average of k i.i.d Uniform(0,1).
// Pdf is scaled Irwin–Hall; for moderate small k we can compute via convolution formula.
// For simplicity and speed: direct coefficient method (Irwin–Hall) then scale for average.

export function batesPdfAt(x: number, k: number): number {
  // k >= 1 integer
  if (k <= 1) return 1; // k=1 reduces to Uniform
  if (x < 0 || x > 1) return 0;
  // Irwin-Hall for sum S of k uniforms: pdf_S(s) = (1/(k-1)!) * sum_{j=0}^{⌊s⌋} (-1)^j C(k, j) (s - j)^{k-1}
  // For Bates (mean) X = S / k: pdf_X(x) = k * pdf_S(kx)
  const s = x * k;
  let sum = 0;
  const n = k;
  const sFloor = Math.floor(s);
  const fact = factorial(n - 1);
  for (let j = 0; j <= sFloor; j++) {
    const term = ((j % 2 === 0) ? 1 : -1) * comb(n, j) * Math.pow(s - j, n - 1);
    sum += term;
  }
  const pdfS = sum / fact;
  return k * pdfS;
}

export function batesDiscreteWeights(nSlots: number, k: number): number[] {
  const w: number[] = [];
  for (let i = 1; i <= nSlots; i++) {
    const center = (i - 0.5) / nSlots;
    w.push(batesPdfAt(center, k));
  }
  return normalize(w);
}

function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let res = 1;
  for (let i = 1; i <= k; i++) {
    res = (res * (n - (k - i))) / i;
  }
  return res;
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function normalize(arr: number[]): number[] {
  const s = arr.reduce((a, b) => a + b, 0) || 1;
  return arr.map(v => v / s);
}
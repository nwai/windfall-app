import { triangularPdfAt } from "./triangular";

export function dualTriangularDiscreteWeights(
  nSlots: number,
  modeA: number,
  modeB: number,
  weightA: number
): number[] {
  const wA = Math.min(1, Math.max(0, weightA));
  const wB = 1 - wA;
  const arr: number[] = [];
  for (let i = 1; i <= nSlots; i++) {
    const x = (i - 0.5) / nSlots;
    const pdf = wA * triangularPdfAt(x, modeA) + wB * triangularPdfAt(x, modeB);
    arr.push(pdf);
  }
  const sum = arr.reduce((a,b)=>a+b,0) || 1;
  return arr.map(v=>v/sum);
}
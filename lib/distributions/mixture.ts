import { triangularDiscreteWeights } from "./triangular";
import { batesDiscreteWeights } from "./bates";

export function mixtureTriangularBates(nSlots: number, mode: number, k: number, wTri: number): number[] {
  const t = triangularDiscreteWeights(nSlots, mode);
  const b = batesDiscreteWeights(nSlots, k);
  const w = Math.min(1, Math.max(0, wTri));
  const out = t.map((tv, i) => w * tv + (1 - w) * b[i]);
  // normalize
  const s = out.reduce((a, b2) => a + b2, 0) || 1;
  return out.map(v => v / s);
}
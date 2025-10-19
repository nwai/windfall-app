import { getSavedZoneWeights } from "./zpaStorage";

/**
 * Softly bias per-number scores by zone weights.
 * - baseScores: Record<number, number> for numbers 1..45 (or a Map)
 * - weightsByNumber: Record<number, number> where 1.0 = neutral
 * - gamma in [0..1]: strength of the bias; 0 = no effect, 1 = full weight
 *
 * Returns a new object; does not mutate inputs.
 */
export function applyZoneWeightBiasToScores(
  baseScores: Record<number, number>,
  weightsByNumber: Record<number, number> | null | undefined,
  gamma: number = 0.5
): Record<number, number> {
  const g = Math.max(0, Math.min(1, gamma));
  if (!weightsByNumber || g === 0) return { ...baseScores };

  const out: Record<number, number> = {};
  for (const k of Object.keys(baseScores)) {
    const n = Number(k);
    const s = baseScores[n] ?? 0;
    const w = weightsByNumber[n] ?? 1.0;
    out[n] = s * Math.pow(w, g);
  }
  return out;
}

/**
 * Convenience: read weights from localStorage (ZPA panel), apply with gamma
 * Default: if no weights exist, returns a copy of baseScores.
 */
export function applySavedZoneWeights(
  baseScores: Record<number, number>,
  gamma: number = 0.5
): Record<number, number> {
  const saved = safeGetSavedZoneWeights();
  return applyZoneWeightBiasToScores(baseScores, saved, gamma);
}

function safeGetSavedZoneWeights(): Record<number, number> | null {
  try {
    return getSavedZoneWeights();
  } catch {
    return null;
  }
}
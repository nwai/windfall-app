import { ZoneTrend, ZoneGroups, groupIndexOf } from "./groupPatterns";

export type ZoneWeightMode = "boostUp" | "boostDown";

export interface ZoneWeightOptions {
  mode?: ZoneWeightMode;     // default: "boostUp"
  strength?: number;         // 0..0.3 → deviation from 1.0 (default 0.15)
  pMin?: number;             // only consider trends with p < pMin (default 0.25)
  normalize?: boolean;       // default true: re-normalize weights to mean ≈ 1.0
}

/**
 * Suggest per-zone weights (G1..G9) from zone trends.
 * - boostUp: up-trending zones get (1+strength), down-trending get (1-strength)
 * - boostDown: inverse
 * - Only apply to zones with pValue < pMin to avoid noise
 * - Optionally normalize zone weights to mean ≈ 1.0
 */
export function suggestZoneWeightsFromTrends(
  trends: ZoneTrend[],
  opts: ZoneWeightOptions = {}
): Record<number, number> {
  const {
    mode = "boostUp",
    strength = 0.15,
    pMin = 0.25,
    normalize = true,
  } = opts;

  const zCount = 9;
  const weights: Record<number, number> = {};
  for (let z = 1; z <= zCount; z++) weights[z] = 1.0;

  const s = Math.max(0, Math.min(0.3, strength));
  for (const z of trends) {
    const idx = z.zone; // 1..9
    if (idx < 1 || idx > zCount) continue;
    if (z.pValue >= pMin) continue; // ignore non-significant
    const up = z.slopePerDraw > 0;
    if (mode === "boostUp") {
      weights[idx] = up ? 1 + s : 1 - s;
    } else {
      weights[idx] = up ? 1 - s : 1 + s;
    }
  }

  if (normalize) {
    const arr = Object.values(weights);
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    if (mean > 0) {
      for (const z in weights) weights[z as any] = weights[z as any] / mean;
    }
  }
  return weights;
}

/**
 * Map zone weights to per-number weights using the provided 9×5 groups.
 * Optionally normalize the resulting number weights to mean ≈ 1.0.
 */
export function perNumberWeightsFromZones(
  groups: ZoneGroups,
  zoneWeights: Record<number, number>,
  normalize = true
): Record<number, number> {
  const out: Record<number, number> = {};
  for (let n = 1; n <= 45; n++) {
    const zi = groupIndexOf(n, groups);   // 0..8
    const z = zi >= 0 ? zi + 1 : 0;       // 1..9
    out[n] = z ? zoneWeights[z] ?? 1.0 : 1.0;
  }
  if (normalize) {
    const arr = Object.values(out);
    const mean = arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
    if (mean > 0) for (const k in out) out[k] = out[k] / mean;
  }
  return out;
}
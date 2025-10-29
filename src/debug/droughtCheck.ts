// Quick diagnostic helper — run inside the app context (or import and call from a debug UI).
// Diagnose drought/hazard/rank for a single number using the same temperature signal used by DGA.
//
// Usage (from App.tsx or the browser console hooked into your app):
// import { diagnoseNumberPosition } from "./debug/droughtCheck";
// const report = diagnoseNumberPosition(history, 38);
// console.log(report);
// Or attach a button to call it and display the result in an alert / toast.

import { Draw } from "../types";
import { computeTemperatureSignal } from "../lib/temperatureSignal";
import { getSavedZoneWeights } from "../lib/zpaStorage";
import { applyZoneWeightBiasToScores } from "../lib/zoneWeightBias";

export type DiagnoseResult = {
  droughtLength: number | null;
  hazardForK: number | null;
  rankPosition: number | null; // 1-based rank in full 1..45 table
  inTopK: boolean;
  topList: number[];
  score: number;
};

/**
 * Diagnose a single number's drought status and model position.
 *
 * - history: draws oldest -> newest
 * - n: number to inspect 1..45
 * - topKToShow: how many predicted numbers the UI normally shows (for informational inTopK)
 * - matchOn: whether drought hits are counted in mains, supps or both (affects hazard calcs)
 * - useZoneBias: if true, applies saved ZPA per-number weights with zoneGamma passed (if provided)
 * - zoneGamma: exponent applied to saved zone weights when useZoneBias = true
 */
export function diagnoseNumberPosition(
  history: Draw[],
  n: number,
  topKToShow = 12,
  matchOn: "both" | "mains" | "supp" = "both",
  useZoneBias = false,
  zoneGamma = 0.5
): DiagnoseResult | null {
  if (!history || history.length === 0) {
    console.warn("No history available");
    return null;
  }
  if (n < 1 || n > 45) {
    console.warn("Number out of range 1..45");
    return null;
  }

  const t = history.length - 1; // index of most recent draw available

  // 1) determine lastSeen up to the most recent draw
  const lastSeen: (number | null)[] = Array.from({ length: 46 }, () => null);
  for (let i = 0; i <= t; i++) {
    const d = history[i];
    for (const m of d.main) if (m >= 1 && m <= 45) lastSeen[m] = i;
    for (const s of d.supp) if (s >= 1 && s <= 45) lastSeen[s] = i;
  }
  const droughtLength = lastSeen[n] === null ? null : t - (lastSeen[n] as number);

  // 2) compute quick Laplace-smoothed hazard h(k) using entire history (alpha=1)
  const maxK = 38;
  const alpha = 1;
  const occ = Array.from({ length: maxK + 1 }, () => 0);
  const hits = Array.from({ length: maxK + 1 }, () => 0);

  // iterate s from 0 .. history.length-2 (we compare to next draw s+1)
  for (let s = 0; s <= history.length - 2; s++) {
    // compute lastSeen up to s (simple forward scan; small N so ok)
    const ls = Array.from({ length: 46 }, () => null as number | null);
    for (let i = 0; i <= s; i++) {
      const d = history[i];
      for (const m of d.main) if (m >= 1 && m <= 45) ls[m] = i;
      for (const sp of d.supp) if (sp >= 1 && sp <= 45) ls[sp] = i;
    }
    const next = history[s + 1];
    const inNextMain = new Set<number>(next?.main ?? []);
    const inNextSupp = new Set<number>(next?.supp ?? []);

    for (let num = 1; num <= 45; num++) {
      const lsnum = ls[num];
      if (lsnum === null) continue; // never seen before s, skip
      let k = s - lsnum;
      if (k < 0) continue;
      if (k > maxK) k = maxK; // clipping to maxK
      occ[k]++;
      let isHit = false;
      if (matchOn === "both") isHit = inNextMain.has(num) || inNextSupp.has(num);
      else if (matchOn === "mains") isHit = inNextMain.has(num);
      else isHit = inNextSupp.has(num);
      if (isHit) hits[k]++;
    }
  }

  const hazardByK = occ.map((o, k) => {
    const numerator = (hits[k] ?? 0) + alpha;
    const denominator = o + 2 * alpha;
    return denominator > 0 ? numerator / denominator : 0;
  });

  const hazardForK = droughtLength === null ? null : hazardByK[Math.min(droughtLength, maxK)] ?? null;

  // 3) compute model ranking using computeTemperatureSignal (same parameters as DGA/heatmap)
  const tempSignal = computeTemperatureSignal(history, {
    alpha: 0.25,
    hybridWeight: 0.6,
    emaNormalize: "per-number",
    enforcePeaks: true,
    metric: "hybrid",
    heightNumbers: 45,
  });

  // baseScores array 1..45 mapped to index 0..44
  const baseScores: number[] = Array.from({ length: 45 }, (_, i) => tempSignal[i] ?? 0);

  // apply ZPA saved weights if requested
  let finalScoresByNumber: Record<number, number> = {};
  for (let i = 0; i < 45; i++) finalScoresByNumber[i + 1] = baseScores[i];

  if (useZoneBias) {
    try {
      const saved = getSavedZoneWeights();
      finalScoresByNumber = applyZoneWeightBiasToScores(finalScoresByNumber, saved, zoneGamma);
    } catch (e) {
      console.warn("Zone bias apply failed", e);
    }
  }

  // create sorted list
  const sorted = Object.entries(finalScoresByNumber)
    .map(([snum, sc]) => ({ n: Number(snum), s: sc }))
    .sort((a, b) => b.s - a.s || a.n - b.n);

  const fullIndex = sorted.findIndex((x) => x.n === n);
  const rankPosition = fullIndex === -1 ? null : fullIndex + 1;
  const cappedTopK = Math.max(1, Math.min(45, topKToShow));
  const inTopK = rankPosition !== null ? rankPosition <= cappedTopK : false;
  const topList = sorted.slice(0, cappedTopK).map((x) => x.n);
  const score = finalScoresByNumber[n] ?? 0;

  // return compact result object
  const result: DiagnoseResult = {
    droughtLength,
    hazardForK,
    rankPosition,
    inTopK,
    topList,
    score,
  };

  // console-friendly log
  console.group(`Diagnose number ${n}`);
  console.log("Drought length (k):", droughtLength);
  console.log("Hazard for k:", hazardForK);
  console.log("Full rank (1..45):", rankPosition);
  console.log(`In top ${cappedTopK}?`, inTopK);
  console.log("Top list:", topList);
  console.log("Raw score:", score);
  console.groupEnd();

  return result;
}
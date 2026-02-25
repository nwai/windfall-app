import { CandidateSet, Draw } from "./types";

// --- Spoke ranges (same as OGA): divide 1..45 into 8 spokes/octants ---
const SPOKE_RANGES: Array<[number, number]> = [
  [1, 5],
  [6, 10],
  [11, 15],
  [16, 20],
  [21, 25],
  [26, 30],
  [31, 36],
  [37, 45],
];

function spokeIndex(n: number): number | null {
  for (let i = 0; i < SPOKE_RANGES.length; i++) {
    const [lo, hi] = SPOKE_RANGES[i];
    if (n >= lo && n <= hi) return i;
  }
  return null;
}

function shannonEntropyNorm(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let H = 0;
  for (const c of counts) {
    if (c <= 0) continue;
    const p = c / total;
    H += -p * Math.log2(p);
  }
  const Hmax = Math.log2(counts.length);
  return Hmax > 0 ? H / Hmax : 0; // normalize to [0,1]
}

// --- Entropy: normalized Shannon entropy over 8 spokes (main + supp) ---
// 0 = very clustered, 1 = evenly spread
export function entropy(candidate: CandidateSet): number {
  const all = [...candidate.main, ...candidate.supp];
  const counts = new Array(8).fill(0);
  for (const n of all) {
    const idx = spokeIndex(n);
    if (idx !== null) counts[idx]++;
  }
  return shannonEntropyNorm(counts);
}

// --- Min Hamming "distance" (set-based) from history ---
// Distance per draw = 6 - |intersection(candidate.main, draw.main)|
// Range: 0..6 (0 = exact match of the 6 main numbers, 6 = no overlap)
export function minHamming(candidate: CandidateSet, history: Draw[]): number {
  if (!history.length) return 6;
  const cSet = new Set(candidate.main);
  let best = 6;
  for (const h of history) {
    const overlap = h.main.filter((n) => cSet.has(n)).length;
    const dist = 6 - overlap;
    if (dist < best) best = dist;
    if (best === 0) break; // can't get lower than 0
  }
  return best;
}

// --- Max Jaccard similarity from history (main-only) ---
// J(A,B) = |A ∩ B| / |A ∪ B|
export function maxJaccard(candidate: CandidateSet, history: Draw[]): number {
  if (!history.length) return 0;
  let max = 0;
  const cSet = new Set(candidate.main);
  for (const h of history) {
    const hSet = new Set(h.main);
    let inter = 0;
    for (const n of cSet) if (hSet.has(n)) inter++;
    const union = cSet.size + hSet.size - inter;
    const jac = union > 0 ? inter / union : 0;
    if (jac > max) max = jac;
  }
  return max;
}

// --- Fingerprint: unique summary of main/supp ---
export function fingerprint(candidate: CandidateSet): string {
  return [
    ...candidate.main.slice().sort((a, b) => a - b),
    ...candidate.supp.slice().sort((a, b) => a - b),
  ].join("-");
}

// --- Bitmask helpers for hot-path Hamming / Jaccard ---
// Numbers 1-45 each map to a single bit in a JS number (safe up to 2^53).

/** Convert an array of numbers (1-45) to a bitmask. */
export function toBitmask(nums: number[]): number {
  let mask = 0;
  for (const n of nums) mask |= (1 << n);
  return mask;
}

/** Count set bits (popcount) using Brian Kernighan's algorithm. */
function popcount(v: number): number {
  // For values > 2^30 we need to handle sign bit; split into two 16-bit halves.
  let count = 0;
  while (v) {
    v &= v - 1;
    count++;
  }
  return count;
}

/** Pre-computed bitmask data for a set of history draws. */
export interface HistoryBitmasks {
  /** Bitmask of each draw's main numbers. */
  mainMasks: number[];
  /** Size of each draw's main array (typically 6). */
  mainSizes: number[];
}

/** Pre-compute bitmasks for all history draws (call once before the generation loop). */
export function precomputeHistoryBitmasks(history: Draw[]): HistoryBitmasks {
  const mainMasks: number[] = new Array(history.length);
  const mainSizes: number[] = new Array(history.length);
  for (let i = 0; i < history.length; i++) {
    mainMasks[i] = toBitmask(history[i].main);
    mainSizes[i] = history[i].main.length;
  }
  return { mainMasks, mainSizes };
}

/**
 * Bitset-optimized minHamming using pre-computed history bitmasks.
 * Distance per draw = candidateMainSize - |intersection|
 */
export function minHammingBit(candidateMainMask: number, candidateMainSize: number, hb: HistoryBitmasks): number {
  let best = candidateMainSize;
  for (let i = 0; i < hb.mainMasks.length; i++) {
    const overlap = popcount(candidateMainMask & hb.mainMasks[i]);
    const dist = candidateMainSize - overlap;
    if (dist < best) best = dist;
    if (best === 0) return 0;
  }
  return best;
}

/**
 * Bitset-optimized maxJaccard using pre-computed history bitmasks.
 * J(A,B) = |A ∩ B| / |A ∪ B| = popcount(a&b) / (|A| + |B| - popcount(a&b))
 */
export function maxJaccardBit(candidateMainMask: number, candidateMainSize: number, hb: HistoryBitmasks): number {
  let max = 0;
  for (let i = 0; i < hb.mainMasks.length; i++) {
    const inter = popcount(candidateMainMask & hb.mainMasks[i]);
    const union = candidateMainSize + hb.mainSizes[i] - inter;
    const jac = union > 0 ? inter / union : 0;
    if (jac > max) max = jac;
  }
  return max;
}

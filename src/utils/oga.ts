import { Draw } from "../types";

// --- SPOKE RANGES: divide 1-45 into configurable spokes ---
export const DEFAULT_OGA_SPOKES = 9;

export function buildSpokeRanges(spokeCount: number = DEFAULT_OGA_SPOKES): number[][] {
  const count = Math.max(1, Math.min(45, Math.floor(spokeCount)));
  const base = Math.floor(45 / count);
  const rem = 45 % count;
  const ranges: number[][] = [];
  let start = 1;
  for (let i = 0; i < count; i++) {
    const span = base + (i < rem ? 1 : 0);
    const end = start + span - 1;
    ranges.push([start, end]);
    start = end + 1;
  }
  return ranges;
}

// Helper: get spoke profile for a set of numbers
export function getSpokeProfile(numbers: number[], ranges: number[][]): number[] {
  const profile = new Array(ranges.length).fill(0);
  for (const n of numbers) {
    for (let s = 0; s < ranges.length; ++s) {
      if (n >= ranges[s][0] && n <= ranges[s][1]) {
        profile[s]++;
        break;
      }
    }
  }
  return profile;
}

/**
 * Compute OGA score for a candidate set of numbers.
 * Lower == more similar to history.
 * @param nums - candidate numbers (main + supp)
 * @param history - array of past draws
 * @param spokeCount - number of spokes (defaults to 9)
 */
export function computeOGA(nums: number[], history: Draw[] = [], spokeCount: number = DEFAULT_OGA_SPOKES): number {
  const ranges = buildSpokeRanges(spokeCount);
  const candidateProfile = getSpokeProfile(nums, ranges);

  // If no history, just sum the variance from the mean
  if (!history.length) {
    const mean = nums.length / ranges.length;
    return candidateProfile.reduce((sum, c) => sum + Math.abs(c - mean), 0);
  }

  // Compute historical averages for each spoke
  const historicalSpokeCounts = new Array(ranges.length).fill(0);
  for (const draw of history) {
    const allNums = [...draw.main, ...draw.supp];
    const p = getSpokeProfile(allNums, ranges);
    for (let i = 0; i < ranges.length; ++i) historicalSpokeCounts[i] += p[i];
  }
  for (let i = 0; i < ranges.length; ++i) historicalSpokeCounts[i] /= history.length;

  // Score: sum of ratios (candidate/historical) for each spoke
  let score = 0;
  for (let i = 0; i < ranges.length; ++i) {
    score += candidateProfile[i] / (historicalSpokeCounts[i] + 1e-3);
  }
  return score;
}

/**
 * Percentile calculation for a candidate's OGA score against historical OGA scores.
 * @param candidateOGA - candidate's OGA score
 * @param pastOGAScores - array of OGA scores for past draws
 */
export function getOGAPercentile(candidateOGA: number, pastOGAScores: number[]): number {
  if (pastOGAScores.length === 0) return 0;
  const below = pastOGAScores.filter(score => score <= candidateOGA).length;
  return (below / pastOGAScores.length) * 100;
}

import { Draw } from "../types";

// --- SPOKE RANGES: divide 1-45 into 8 spokes/octants ---
const SPOKE_RANGES = [
  [1, 5],
  [6, 10],
  [11, 15],
  [16, 20],
  [21, 25],
  [26, 30],
  [31, 36],
  [37, 45]
];

// Helper: get spoke profile for a set of numbers
function getSpokeProfile(numbers: number[]): number[] {
  const profile = new Array(8).fill(0);
  for (const n of numbers) {
    for (let s = 0; s < SPOKE_RANGES.length; ++s) {
      if (n >= SPOKE_RANGES[s][0] && n <= SPOKE_RANGES[s][1]) {
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
 */
export function computeOGA(nums: number[], history: Draw[] = []): number {
  const candidateProfile = getSpokeProfile(nums);

  // If no history, just sum the variance from the mean
  if (!history.length) {
    const mean = nums.length / 8;
    return candidateProfile.reduce((sum, c) => sum + Math.abs(c - mean), 0);
  }

  // Compute historical averages for each spoke
  const historicalSpokeCounts = new Array(8).fill(0);
  for (const draw of history) {
    const allNums = [...draw.main, ...draw.supp];
    const p = getSpokeProfile(allNums);
    for (let i = 0; i < 8; ++i) historicalSpokeCounts[i] += p[i];
  }
  for (let i = 0; i < 8; ++i) historicalSpokeCounts[i] /= history.length;

  // Score: sum of ratios (candidate/historical) for each spoke
  let score = 0;
  for (let i = 0; i < 8; ++i) {
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
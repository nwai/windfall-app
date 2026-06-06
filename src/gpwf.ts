import { CandidateSet, Draw, Knobs } from "./types";

// Dynamic GPWF: higher if candidate's numbers are common in recent draws
export function gpwfScore(candidate: CandidateSet, history: Draw[], knobs: Knobs): number {
  // Use window size and bias factor from knobs
  const window = Math.max(0, Math.min(knobs.gpwf_window_size, history.length));
  const bias = knobs.gpwf_bias_factor;
  const floor = knobs.gpwf_floor;
  const scale = knobs.gpwf_scale_multiplier;

  // Count how many times each number from candidate appears in last {window} draws
  const freqMap = new Map<number, number>();
  for (const draw of history.slice(-window)) {
    for (const n of [...draw.main, ...draw.supp]) {
      freqMap.set(n, (freqMap.get(n) || 0) + 1);
    }
  }
  // Score = sum of frequencies, normalized and scaled
  const scoredNumbers = [...candidate.main, ...candidate.supp];
  let freqSum = 0;
  for (const n of scoredNumbers) {
    freqSum += freqMap.get(n) || 0;
  }
  const maxFreq = window * scoredNumbers.length;
  if (maxFreq <= 0) return Math.max(0, Math.min(1, floor));
  let score = floor + scale * (freqSum / maxFreq + bias);
  if (score > 1) score = 1;
  if (score < 0) score = 0;
  return score;
}

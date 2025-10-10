import { CandidateSet, Draw, Knobs } from "./types";

// Dynamic GPWF: higher if candidate's numbers are common in recent draws
export function gpwfScore(candidate: CandidateSet, history: Draw[], knobs: Knobs): number {
  // Use window size and bias factor from knobs
  const window = Math.max(3, Math.min(knobs.gpwf_window_size, history.length));
  const bias = knobs.gpwf_bias_factor;
  const floor = knobs.gpwf_floor;
  const scale = knobs.gpwf_scale_multiplier;

  // Count how many times each number from candidate appears in last {window} draws
  const freqMap = new Map<number, number>();
  for (let i = 0; i < window; ++i) {
    for (const n of history[i].main) {
      freqMap.set(n, (freqMap.get(n) || 0) + 1);
    }
  }
  // Score = sum of frequencies, normalized and scaled
  let freqSum = 0;
  for (const n of candidate.main) {
    freqSum += freqMap.get(n) || 0;
  }
  const maxFreq = window * candidate.main.length;
  let score = floor + scale * (freqSum / maxFreq + bias);
  if (score > 1) score = 1;
  return score;
}
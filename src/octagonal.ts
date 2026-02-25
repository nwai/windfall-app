import { buildSpokeRanges, DEFAULT_OGA_SPOKES, getSpokeProfile } from "./utils/oga";

// --- PHASE 9: OCTAGONAL GRID POST-PROCESSOR ---

// Returns average count per spoke over history
function getHistoricalSpokeCounts(history: { main: number[]; supp: number[] }[], ranges: number[][]) {
  const spokeCounts = new Array(ranges.length).fill(0);
  for (const draw of history) {
    const allNumbers = [...draw.main, ...draw.supp];
    const profile = getSpokeProfile(allNumbers, ranges);
    for (let s = 0; s < ranges.length; ++s) spokeCounts[s] += profile[s];
  }
  return spokeCounts.map(c => c / history.length);
}

// Scores a candidate by spoke alignment
function octagonalScore(candidate: { main: number[]; supp: number[] }, historicalSpokeCounts: number[], ranges: number[][]) {
  const profile = getSpokeProfile([...candidate.main, ...candidate.supp], ranges);
  let score = 0;
  for (let s = 0; s < profile.length; ++s) {
    score += profile[s] / (historicalSpokeCounts[s] + 1e-3);
  }
  return { profile, score };
}

// Main Phase 9 post-processing
export function applyOctagonalPostProcess(
  candidates: any[],
  history: { main: number[]; supp: number[] }[],
  keepTopN: number,
  spokeCount: number = DEFAULT_OGA_SPOKES
) {
  const ranges = buildSpokeRanges(spokeCount);
  const historicalSpokeCounts = getHistoricalSpokeCounts(history, ranges);
  const candidatesWithOga = candidates.map(c => {
    const { profile, score } = octagonalScore(c, historicalSpokeCounts, ranges);
    return { ...c, octagonalScore: score, octagonalProfile: profile };
  });
  candidatesWithOga.sort((a, b) => a.octagonalScore - b.octagonalScore);
  return candidatesWithOga.slice(0, keepTopN);
}

// --- PHASE 9: OCTAGONAL GRID POST-PROCESSOR ---

// Spoke ranges for OGA
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

// Returns profile of candidate: [spoke0,spoke1,...,spoke7]
function getSpokeProfile(numbers: number[]) {
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

// Returns average count per spoke over history
function getHistoricalSpokeCounts(history: { main: number[]; supp: number[] }[]) {
  const spokeCounts = new Array(8).fill(0);
  for (const draw of history) {
    const allNumbers = [...draw.main, ...draw.supp];
    const profile = getSpokeProfile(allNumbers);
    for (let s = 0; s < 8; ++s) spokeCounts[s] += profile[s];
  }
  return spokeCounts.map(c => c / history.length);
}

// Scores a candidate by spoke alignment
function octagonalScore(candidate: { main: number[]; supp: number[] }, historicalSpokeCounts: number[]) {
  const profile = getSpokeProfile(candidate.main);
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
  keepTopN: number
) {
  const historicalSpokeCounts = getHistoricalSpokeCounts(history);
  const candidatesWithOga = candidates.map(c => {
    const { profile, score } = octagonalScore(c, historicalSpokeCounts);
    return { ...c, octagonalScore: score, octagonalProfile: profile };
  });
  candidatesWithOga.sort((a, b) => a.octagonalScore - b.octagonalScore);
  // Debug log
  for (const c of candidatesWithOga) {
    console.log(
      "OGA Candidate:",
      c.main,
      "Score:",
      c.octagonalScore,
      "SpokeProfile:",
      c.octagonalProfile
    );
  }
  return candidatesWithOga.slice(0, keepTopN);
}
import { Draw, CandidateSet } from "./types";

// Only export sampleCandidates for now.
// If you want to keep a basic generator for testing, rename it.
export function sampleCandidates(count: number, history: Draw[]): CandidateSet[] {
  const candidates: CandidateSet[] = [];
  for (let i = 0; i < count; ++i) {
    let pool = Array.from({ length: 45 }, (_, j) => j + 1);
    const main = [];
    for (let k = 0; k < 6; ++k) {
      const idx = Math.floor(Math.random() * pool.length);
      main.push(pool[idx]);
      pool.splice(idx, 1);
    }
    const supp = [];
    for (let k = 0; k < 2; ++k) {
      const idx = Math.floor(Math.random() * pool.length);
      supp.push(pool[idx]);
      pool.splice(idx, 1);
    }
    main.sort((a, b) => a - b);
    supp.sort((a, b) => a - b);
    candidates.push({ main, supp });
  }
  return candidates;
}
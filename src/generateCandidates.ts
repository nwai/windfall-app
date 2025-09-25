import { CandidateSet, Draw, Knobs } from "./types";
import { entropy, minHamming, maxJaccard } from "./analytics";
import { applyOctagonalPostProcess } from "./octagonal";
import { getSDE1FilteredPool } from "./sde1";

// Utility: counts how many numbers in candidate match most recent draw (main + supp)
function countMatches(candidate: CandidateSet, mostRecentDraw: Draw): number[] {
  const candNums = new Set([...candidate.main, ...candidate.supp]);
  const drawNums = new Set([...mostRecentDraw.main, ...mostRecentDraw.supp]);
  return Array.from(candNums).filter(n => drawNums.has(n));
}

/**
 * Generates candidate sets with hard filter and probabilistic bias for recent draw matches.
 * 
 * @param num Number of candidates to generate
 * @param history Array of past draws
 * @param knobs Knobs/flags object
 * @param traceSetter Function to append to trace log
 * @param excludedNumbers Numbers to exclude
 * @param selectedRatios Odd/even ratio filtering (not used in this simple branch)
 * @param useTrickyRule If tricky rule is used (not used in this simple branch)
 * @param minOGAPercentile OGA percentile filter (not used in this simple branch)
 * @param pastOGAScores OGA scores history (not used in this simple branch)
 * @param forcedNumbers Numbers to force include in candidate
 * @param entropyThreshold Minimum entropy
 * @param hammingThreshold Minimum hamming
 * @param jaccardThreshold Maximum jaccard overlap
 * @param minRecentMatches Minimum matches with most recent draw (hard filter)
 * @param recentMatchBias Probabilistic bias strength for recent matches (0=off, 1=max)
 * @param lambda Recency weight (not used here)
 * @returns Object with candidates array, ratioSummary (empty here), quotaWarning (undefined)
 */
export function generateCandidates(
  num: number,
  history: Draw[],
  knobs: Knobs,
  traceSetter: React.Dispatch<React.SetStateAction<string[]>>,
  excludedNumbers: number[],
  selectedRatios: string[],
  useTrickyRule: boolean,
  minOGAPercentile: number,
  pastOGAScores: number[],
  forcedNumbers: number[],
  entropyThreshold: number = 1.5,
  hammingThreshold: number = 5,
  jaccardThreshold: number = 0.5,
  lambda: number = 0.85,
  ratioOptions?: { ratio: string; count: number }[],
  minRecentMatches: number = 0,
  recentMatchBias: number = 0
): {
  candidates: CandidateSet[];
  ratioSummary: any;
  quotaWarning?: string;
} {
  let candidates: CandidateSet[] = [];
  let attempts = 0;

  // --- HC3: Exclude numbers repeated in last two draws ---
  let hc3Numbers: number[] = [];
  if (knobs.enableHC3 && history.length >= 2) {
    const lastDraw = history[history.length - 1];
    const prevDraw = history[history.length - 2];
    const lastAll = [...lastDraw.main, ...lastDraw.supp];
    const prevAll = [...prevDraw.main, ...prevDraw.supp];
    hc3Numbers = lastAll.filter((n) => prevAll.includes(n));
  }

  // --- SDE1: Exclude numbers whose last digit appears more than once in the most recent draw ---
  let mainPool = Array.from({ length: 45 }, (_, i) => i + 1);
  let sde1Trace = "";
  let sde1ExcludedNumbers: number[] = [];
  if (knobs.enableSDE1) {
    const { pool, trace, excludedNumbers: sdeExcl } = getSDE1FilteredPool(history);
    mainPool = pool;
    sde1Trace = trace;
    sde1ExcludedNumbers = sdeExcl;
  }

// Compose full exclusions
let fullExcludedNumbers = [...excludedNumbers];

// --- ADD SDE1 excluded numbers to fullExcludedNumbers for supp pool exclusion ---
if (sde1ExcludedNumbers.length > 0) {
  fullExcludedNumbers.push(...sde1ExcludedNumbers.filter(n => !fullExcludedNumbers.includes(n)));
}
if (hc3Numbers.length > 0) {
  fullExcludedNumbers.push(...hc3Numbers.filter(n => !fullExcludedNumbers.includes(n)));
}
mainPool = mainPool.filter(n => !fullExcludedNumbers.includes(n));

  // --- TRACE: Log all exclusions and forced inclusions ---
  traceSetter((t) => [
    ...t,
    `[TRACE] SDE1 excluded: [${sde1ExcludedNumbers.join(", ")}]`,
    `[TRACE] HC3 excluded: [${hc3Numbers.join(", ")}]`,
    `[TRACE] User excluded: [${excludedNumbers.join(", ")}]`,
    `[TRACE] Forced inclusion: [${forcedNumbers.join(", ")}]`,
    `[TRACE] Final main pool for random selection (excluding forced): [${mainPool.join(", ")}]`
  ]);

  // ---- Add ratioSummary/warnings if you want to support advanced ratio branches later ---
  let ratioSummary: any = {};
  let warnings: string[] = [];

  while (candidates.length < num && attempts < num * 50) {
    let forced = forcedNumbers.slice(0, 8);
    // Forced numbers may be outside mainPool; that's fine: forced always included.
    let forcedMain = forced.slice(0, 6);
    let forcedSupp = forced.slice(6, 8);

    let main: number[] = [...forcedMain];
    let supp: number[] = [...forcedSupp];

    // Remove forced from pool (to avoid duplicates)
    let restPool = mainPool.filter((n: number) => !forced.includes(n));

    // Fill main until 6 numbers, allowing forced (even if outside mainPool)
    while (main.length < 6 && restPool.length) {
      const idx = Math.floor(Math.random() * restPool.length);
      main.push(restPool[idx]);
      restPool.splice(idx, 1);
    }

    main.sort((a, b) => a - b);

    // Build supp pool: exclude anything in main, supp, or excludedNumbers
    const suppPool = Array.from({ length: 45 }, (_, i) => i + 1).filter(
      (n) => ![...main, ...supp, ...fullExcludedNumbers].includes(n)
    );
    // Fill supp until 2 numbers
    while (supp.length < 2 && suppPool.length) {
      const idx = Math.floor(Math.random() * suppPool.length);
      supp.push(suppPool[idx]);
      suppPool.splice(idx, 1);
    }

    supp.sort((a, b) => a - b);

    const candidate: CandidateSet = { main, supp };

    // --- NEW: Hard filter and bias for most recent draw matches ---
    const mostRecentDraw = history.length > 0 ? history[history.length - 1] : null;
    let numMatches = 0;
    if (mostRecentDraw) {
      numMatches = countMatches(candidate, mostRecentDraw).length;

      // HARD FILTER: skip if not enough matches with most recent
      if (minRecentMatches > 0 && numMatches < minRecentMatches) {
        attempts++;
        continue;
      }
      // SOFT BIAS: probabilistic acceptance based on bias and numMatches
      if (recentMatchBias > 0) {
        const prob = Math.min(1, recentMatchBias * (numMatches / 8));
        if (Math.random() > prob) {
          attempts++;
          continue;
        }
      }
    }
    // --- END hard filter/bias block ---

    // ---- Only apply thresholds if enabled!
    if (knobs.enableEntropy && entropy(candidate) < entropyThreshold) {
      attempts++;
      continue;
    }
    if (knobs.enableHamming && minHamming(candidate, history) < hammingThreshold) {
      attempts++;
      continue;
    }
    if (knobs.enableJaccard && maxJaccard(candidate, history) > jaccardThreshold) {
      attempts++;
      continue;
    }

    candidates.push(candidate);
    attempts++;
  }

  // --- Octagonal Post-Processing ---
  if (knobs.enableOGA && typeof knobs.octagonal_top === "number" && candidates.length > knobs.octagonal_top) {
    candidates = applyOctagonalPostProcess(candidates, history, knobs.octagonal_top);
  }

  // --- Return as object! (fixes previous compile error) ---
  return {
    candidates: candidates.slice(0, num),
    ratioSummary, // stays empty in this branch
    quotaWarning: warnings.length ? warnings.join(" ") : undefined
  };
}
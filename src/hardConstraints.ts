import { CandidateSet, Draw } from "./types";

/**
 * Returns true if at least one pair of numbers in 'main' shares the same last digit
 */
function hasPairWithSameSecondDigit(main: number[]): boolean {
  const digitCounts: Record<string, number> = {};
  for (const n of main) {
    const d = String(n).padStart(2, "0")[1];
    digitCounts[d] = (digitCounts[d] || 0) + 1;
    if (digitCounts[d] === 2) {
      // Found a pair
      return true;
    }
  }
  return false;
}

/**
 * Returns true if candidate shares 4 or more main numbers with any historical main draw.
 */
function hasQuadruplet(candidateMain: number[], history: Draw[]): boolean {
  return history.some(draw =>
    candidateMain.filter(n => draw.main.includes(n)).length >= 4
  );
}

/**
 * Returns true if candidate shares exactly 3 main numbers with any historical main draw.
 */
function hasTriplet(candidateMain: number[], history: Draw[]): boolean {
  return history.some(draw =>
    candidateMain.filter(n => draw.main.includes(n)).length === 3
  );
}

/**
 * Returns true if candidate (main or supp) contains any number that appeared in both main or supp of the most recent and second most recent draw (main or supp).
 */
function hasNumberInBothMostRecent(history: Draw[], candidateMain: number[], candidateSupp: number[]): boolean {
  if (history.length < 2) return false;
  const recentAll = [...history[history.length - 1].main, ...history[history.length - 1].supp];
  const prevAll = [...history[history.length - 2].main, ...history[history.length - 2].supp];
  const overlap = recentAll.filter(n => prevAll.includes(n));
  const candidateAll = [...candidateMain, ...candidateSupp];
  return candidateAll.some(n => overlap.includes(n));
}

// Utilities to find last triplet index in history (across all triplets)
function getLastTripletDrawIndex(history: Draw[]): number {
  for (let i = history.length - 1; i >= 1; --i) {
    for (let j = 0; j < i; ++j) {
      const intersection = history[i].main.filter(n => history[j].main.includes(n));
      if (intersection.length === 3) return i;
    }
  }
  return -1;
}

/**
 * Gets all unordered pairs from an array of numbers.
 */
function getAllPairs(arr: number[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < arr.length; ++i) {
    for (let j = i + 1; j < arr.length; ++j) {
      pairs.push([arr[i], arr[j]]);
    }
  }
  return pairs;
}

/**
 * Finds the most recent index in history where the exact pair appears in main numbers, as a pair.
 */
function getLastSpecificPairIndex(history: Draw[], pair: [number, number]): number {
  for (let i = history.length - 1; i >= 0; --i) {
    const mainSet = new Set(history[i].main);
    if (mainSet.has(pair[0]) && mainSet.has(pair[1])) {
      return i;
    }
  }
  return -1;
}

/**
 * Checks if any pair in the candidate appears in any historical main draw, and if so, enforces the cooldown for each specific pair.
 * Returns reasons for rejection of any specific pair that violates the cooldown.
 */
function checkPairCooldown(candidateMain: number[], history: Draw[], pairCooldown: number): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let valid = true;
  const candidatePairs = getAllPairs(candidateMain);
  for (const pair of candidatePairs) {
    // Check if this pair exists in any historical main
    let pairSeen = false;
    for (const draw of history) {
      if (draw.main.includes(pair[0]) && draw.main.includes(pair[1])) {
        pairSeen = true;
        break;
      }
    }
    if (pairSeen) {
      const lastIndex = getLastSpecificPairIndex(history, pair);
      if (lastIndex >= 0) {
        const gap = history.length - 1 - lastIndex;
        if (gap < pairCooldown) {
          valid = false;
          reasons.push(
            `HC: candidate contains pair [${pair[0]}, ${pair[1]}], but only ${gap} draws since last occurrence (need ${pairCooldown})`
          );
        }
      }
    }
  }
  return { valid, reasons };
}

/**
 * Returns the set of excluded last digits for candidate selection,
 * based on the main and supp numbers of the most recent draw.
 */
function getExcludedLastDigits(history: Draw[]): Set<number> {
  if (history.length === 0) return new Set();
  const recent = history[history.length - 1];
  const numbers = [...recent.main, ...recent.supp];
  // Find which last digits are duplicated (appear more than once)
  const lastDigitCounts: Record<string, number> = {};
  for (const n of numbers) {
    const d = String(n).slice(-1);
    lastDigitCounts[d] = (lastDigitCounts[d] || 0) + 1;
  }
  return new Set(
    Object.entries(lastDigitCounts)
      .filter(([_, count]) => count >= 2)
      .map(([d]) => Number(d))
  );
}

/**
 * Returns true if candidate (main or supp) contains any number whose last digit is in the excluded set.
 */
function hasExcludedLastDigit(candidateMain: number[], candidateSupp: number[], excludedDigits: Set<number>): boolean {
  const allNumbers = [...candidateMain, ...candidateSupp];
  return allNumbers.some(n => excludedDigits.has(Number(String(n).slice(-1))));
}

/**
 * Returns true if any 4 or more consecutive numbers exist in the array.
 */
function hasConsecutiveQuad(numbers: number[]): boolean {
  const sorted = [...numbers].sort((a, b) => a - b);
  let run = 1;
  for (let i = 1; i < sorted.length; ++i) {
    if (sorted[i] === sorted[i - 1] + 1) {
      run++;
      if (run >= 4) return true;
    } else {
      run = 1;
    }
  }
  return false;
}

/**
 * Checks hard constraints for a candidate set.
 * - No quadruplets (candidate sharing 4 or more main numbers with any historical draw)
 * - No consecutive quads (candidate contains 4+ consecutive numbers)
 * - Triplets allowed only if at least 9 draws since last triplet (across any triplet)
 * - Pairs allowed only if at least 2 draws since that specific pair last appeared
 * - At least one pair of main numbers sharing the same second digit
 * - No main or supp number present in both the most recent and the second most recent draw (main or supp)
 * - No candidate number (main or supp) whose last digit is in the excluded set from the most recent draw
 */
export function checkHardConstraints(
  candidate: CandidateSet,
  history: Draw[],
  opts: {
    exactSetOverride?: boolean;
    sdeEnabled?: boolean;
    tripletCooldown?: number; // default 9
    pairCooldown?: number;    // default 2
  } = {}
): { valid: boolean; reasons: string[] } {
  let valid = true;
  let reasons: string[] = [];

  const tripletCooldown = opts.tripletCooldown ?? 9;
  const pairCooldown = opts.pairCooldown ?? 2;

  // 1. No quadruplets allowed
  if (hasQuadruplet(candidate.main, history)) {
    valid = false;
    reasons.push("HC: candidate would create a quadruplet (matches 4+ numbers with a historical draw)");
  }

  // 1a. No consecutive quads (any 4+ consecutive numbers)
  if (hasConsecutiveQuad(candidate.main)) {
    valid = false;
    reasons.push("HC: candidate contains a quad of consecutive numbers, which is banned.");
  }

  // 2. Triplet cooldown (gap between any two draws sharing a triplet)
  if (hasTriplet(candidate.main, history)) {
    const lastTripletIndex = getLastTripletDrawIndex(history);
    if (lastTripletIndex >= 0) {
      const gap = history.length - 1 - lastTripletIndex;
      if (gap < tripletCooldown) {
        valid = false;
        reasons.push(`HC: candidate would create a triplet, but only ${gap} draws since last triplet (need ${tripletCooldown})`);
      }
    }
  }

  // 3. Pair cooldown (gap for each specific pair)
  const { valid: pairValid, reasons: pairReasons } = checkPairCooldown(candidate.main, history, pairCooldown);
  if (!pairValid) {
    valid = false;
    reasons.push(...pairReasons);
  }

  // 4. At least one pair of main numbers sharing the same second digit
  if (!hasPairWithSameSecondDigit(candidate.main)) {
    valid = false;
    reasons.push(
      "HC: candidate must have at least one pair of main numbers sharing the same second digit"
    );
  }

  // 5. No main or supp number present in both the two most recent draws (main or supp)
  if (hasNumberInBothMostRecent(history, candidate.main, candidate.supp)) {
    valid = false;
    reasons.push(
      "HC: candidate contains a number (main or supp) that appeared in both the most recent and the second most recent draw (main or supp)"
    );
  }

  // 6. Excluded last digits from most recent draw (main+supp)
  const excludedDigits = getExcludedLastDigits(history);
  if (hasExcludedLastDigit(candidate.main, candidate.supp, excludedDigits)) {
    valid = false;
    reasons.push(
      `HC: candidate contains a number whose last digit is excluded based on most recent draw (excluded last digits: ${Array.from(excludedDigits).join(", ")})`
    );
  }

  // Insert additional constraints here as needed

  return { valid, reasons };
}
// ---- Primes list (excluding 2, which is handled specially) ----
const PRIMES = new Set([3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43]);

export interface TrickyRuleResult {
  valid: boolean;
  reasons: string[];
}

/**
 * Validates a candidate (8 numbers: main + supp) for:
 * - Odd/Even: 4/4 (2 counts as even)
 * - Prime/Composite: 3 primes (excluding 2), 5 composites (2 counts as composite, never as prime)
 */
export function validateTrickyRule(candidate: number[]): TrickyRuleResult {
  if (candidate.length !== 8) {
    return { valid: false, reasons: ['Candidate set must have exactly 8 numbers (main + supp)'] };
  }

  let odd = 0, even = 0, primes = 0, composites = 0;

  for (const n of candidate) {
    // Odd/Even
    if (n % 2 === 0) {
      even++;
    } else {
      odd++;
    }
    // Prime/Composite
    if (n === 2) {
      composites++; // 2 is treated as composite for this rule
    } else if (PRIMES.has(n)) {
      primes++;
    } else if (n > 1) {
      composites++;
    }
    // n==1 is ignored (shouldn't appear in lotto)
  }

  const reasons: string[] = [];
  if (odd !== 4 || even !== 4) reasons.push(`Needs 4 odd, 4 even (got ${odd} odd, ${even} even)`);
  if (primes !== 3 || composites !== 5) reasons.push(`Needs 3 primes (excl. 2), 5 composites (2 counts as composite). Got ${primes} primes, ${composites} composites`);

  return { valid: reasons.length === 0, reasons };
}

/**
 * Generate N candidates obeying your hard constraints AND the tricky rule.
 * - pool: range of numbers to use (e.g. [1,2,...,45])
 * - isValidCandidate: function that checks all your other constraints (should return boolean)
 * - history: if needed for your constraints
 */
export function generateCandidatesWithTrickyRule(
  n: number,
  pool: number[], // e.g. [1, ..., 45]
  isValidCandidate: (nums: number[]) => boolean,
  maxAttempts = 100000
): number[][] {
  const results: number[][] = [];
  let attempts = 0;

  while (results.length < n && attempts < maxAttempts) {
    attempts++;
    const candidate = makeTrickyCandidate(pool);
    if (!candidate) continue;

    if (!isValidCandidate(candidate)) continue;

    const trickyCheck = validateTrickyRule(candidate);
    if (!trickyCheck.valid) continue;

    // prevent duplicates
    if (results.some(set => arraysEqual(set, candidate))) continue;

    results.push(candidate);
  }

  return results;
}

// --- Helper: generate one set matching ONLY the tricky rule ---

function makeTrickyCandidate(pool: number[]): number[] | undefined {
  const poolSet = new Set(pool);

  // Build groups for selection
  const primes = [...PRIMES].filter(n => poolSet.has(n));
  const composites = pool.filter(n => n !== 2 && !PRIMES.has(n) && n > 1);
  if (poolSet.has(2)) composites.push(2);

  const evens = pool.filter(n => n % 2 === 0);
  const odds = pool.filter(n => n % 2 === 1);

  // Tricky: Need 3 primes (excl 2), 5 composites (2 can be in composite)
  // Also need 4 odd, 4 even

  for (let tries = 0; tries < 100; tries++) {
    if (primes.length < 3 || composites.length < 5) return undefined;
    const pickedPrimes = pickRandom(primes, 3);
    const pickedComposites = pickRandom(composites, 5);

    const candidate = Array.from(new Set([...pickedPrimes, ...pickedComposites]));
    if (candidate.length !== 8) continue;

    // Check O/E
    const odd = candidate.filter(n => n % 2 === 1).length;
    const even = candidate.filter(n => n % 2 === 0).length;
    if (odd !== 4 || even !== 4) continue;

    return candidate.sort((a, b) => a - b);
  }
  return undefined;
}

function pickRandom<T>(arr: T[], k: number): T[] {
  const shuffled = arr.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, k);
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
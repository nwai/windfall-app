import type { Draw } from "../types";

export type NumberExample = {
  number: number;
  // Features
  freqFortnight: number;
  freqMonth: number;
  freqQuarter: number;
  tenure: number;            // draws since first observed
  timeSinceLast: number;     // draws since last observed
  zpaGroup: number;          // e.g., group index [0..8]
  // Labels
  churnLabel?: 0 | 1;        // 1 if “churned” in last K draws
  returnLabel?: 0 | 1;       // among churned, 1 if returned in next H draws (placeholder if not computed)
};

<<<<<<< HEAD
export type NumberFeatures = {
  number: number;
  freqFortnight: number;
  freqMonth: number;
  freqQuarter: number;
  tenure: number;
  timeSinceLast: number;
  zpaGroup: number;
};

export type ExtractedFeatures = NumberFeatures & {
  freqTotal: number;   // total appearances over history
  isActive: boolean;   // currently active (not churned) under threshold
  hasReturned: boolean;// has experienced churn in the past and then returned
};

export type BuildChurnOptions = {
  churnWindowK?: number;              // e.g., 12
  returnHorizon?: number;             // e.g., 6
  zpaGroupOf?: (n: number) => number; // optional: number -> ZPA group index
};

function countInWindow(history: Draw[], endIdx: number, win: number, n: number) {
  let c = 0;
  for (let t = Math.max(0, endIdx - win + 1); t <= endIdx; t++) {
    const d = history[t];
    if (d.main.includes(n) || d.supp.includes(n)) c++;
  }
  return c;
}

export function buildChurnDataset(history: Draw[], opts: BuildChurnOptions): NumberExample[] {
  const K = opts.churnWindowK ?? 12;
=======
export type BuildChurnOptions = {
  churnWindowK?: number;            // e.g., 12
  returnHorizon?: number;           // e.g., 6
  zpaGroupOf?: (n: number) => number; // optional: number -> ZPA group index
};

export function buildChurnDataset(history: Draw[], opts: BuildChurnOptions): NumberExample[] {
  const K = opts.churnWindowK ?? 12;
  const H = opts.returnHorizon ?? 6;

>>>>>>> origin/main
  const total = history.length;
  const seenFirst: Record<number, number> = {};
  const lastSeen: Record<number, number> = {};

  for (let t = 0; t < total; t++) {
    const d = history[t];
    const present = new Set([...d.main, ...d.supp]);
    for (let n = 1; n <= 45; n++) {
      if (present.has(n)) {
<<<<<<< HEAD
        if (seenFirst[n] == null) seenFirst[n] = t + 1; // 1-based index
=======
        if (seenFirst[n] == null) seenFirst[n] = t + 1; // 1-based index for simplicity
>>>>>>> origin/main
        lastSeen[n] = t + 1;
      }
    }
  }

<<<<<<< HEAD
  const end = total - 1;
  const examples: NumberExample[] = [];
  for (let n = 1; n <= 45; n++) {
    const freqFortnight = countInWindow(history, end, 6, n);
    const freqMonth = countInWindow(history, end, 12, n);
    const freqQuarter = countInWindow(history, end, 36, n);
=======
  function countInWindow(endIdx: number, win: number, n: number) {
    let c = 0;
    for (let t = Math.max(0, endIdx - win + 1); t <= endIdx; t++) {
      const d = history[t];
      if (d.main.includes(n) || d.supp.includes(n)) c++;
    }
    return c;
  }

  const end = total - 1;
  const examples: NumberExample[] = [];
  for (let n = 1; n <= 45; n++) {
    const freqFortnight = countInWindow(end, 6, n);
    const freqMonth = countInWindow(end, 12, n);
    const freqQuarter = countInWindow(end, 36, n);
>>>>>>> origin/main

    const first = seenFirst[n] ?? 0;
    const tenure = first ? (end + 1) - first + 1 : 0;

    const last = lastSeen[n] ?? 0;
    const timeSinceLast = last ? (end + 1) - last + 1 : end + 1;

    const zpaGroup = opts.zpaGroupOf ? opts.zpaGroupOf(n) : 0;

    const churned = timeSinceLast > K ? 1 : 0;

<<<<<<< HEAD
=======
    // Return label requires a rolling/evaluation window; leave undefined for now
    const returnLabel: 0 | 1 | undefined = undefined;

>>>>>>> origin/main
    examples.push({
      number: n,
      freqFortnight,
      freqMonth,
      freqQuarter,
      tenure,
      timeSinceLast,
      zpaGroup,
      churnLabel: churned as 0 | 1,
<<<<<<< HEAD
      returnLabel: undefined as any,
    });
  }
  return examples;
}

/**
 * Extract per-number features for a single number n from full Draw[] history,
 * including current activity state under a churn threshold and whether it has ever returned.
 */
export function extractFeaturesForNumber(
  history: Draw[],
  n: number,
  opts?: { churnThreshold?: number; zpaGroupOf?: (n: number) => number }
): ExtractedFeatures {
  const total = history.length;
  const end = total - 1;
  const threshold = opts?.churnThreshold ?? 12;

  let firstSeen = 0;
  let lastSeen = 0;
  let freqTotal = 0;

  // Track churn/return for hasReturned
  let gap = 0;
  let wasChurned = false;
  let hasReturned = false;

  for (let t = 0; t < total; t++) {
    const d = history[t];
    const appeared = d.main.includes(n) || d.supp.includes(n);
    if (appeared) {
      freqTotal++;
      if (!firstSeen) firstSeen = t + 1;
      lastSeen = t + 1;

      if (wasChurned) {
        hasReturned = true;
        wasChurned = false;
      }
      gap = 0;
    } else {
      gap++;
      if (gap >= threshold && !wasChurned) {
        wasChurned = true;
      }
    }
  }

  const freqFortnight = countInWindow(history, end, 6, n);
  const freqMonth = countInWindow(history, end, 12, n);
  const freqQuarter = countInWindow(history, end, 36, n);

  const tenure = firstSeen ? (end + 1) - firstSeen + 1 : 0;
  const timeSinceLast = lastSeen ? (end + 1) - lastSeen + 1 : end + 1;
  const zpaGroup = opts?.zpaGroupOf ? opts.zpaGroupOf(n) : 0;

  const isActive = timeSinceLast <= threshold;

  return {
    number: n,
    freqFortnight,
    freqMonth,
    freqQuarter,
    tenure,
    timeSinceLast,
    zpaGroup,
    freqTotal,
    isActive,
    hasReturned,
  };
=======
      returnLabel: returnLabel as any,
    });
  }
  return examples;
>>>>>>> origin/main
}
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

export type BuildChurnOptions = {
  churnWindowK?: number;            // e.g., 12
  returnHorizon?: number;           // e.g., 6
  zpaGroupOf?: (n: number) => number; // optional: number -> ZPA group index
};

export function buildChurnDataset(history: Draw[], opts: BuildChurnOptions): NumberExample[] {
  const K = opts.churnWindowK ?? 12;
  const H = opts.returnHorizon ?? 6;

  const total = history.length;
  const seenFirst: Record<number, number> = {};
  const lastSeen: Record<number, number> = {};

  for (let t = 0; t < total; t++) {
    const d = history[t];
    const present = new Set([...d.main, ...d.supp]);
    for (let n = 1; n <= 45; n++) {
      if (present.has(n)) {
        if (seenFirst[n] == null) seenFirst[n] = t + 1; // 1-based index for simplicity
        lastSeen[n] = t + 1;
      }
    }
  }

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

    const first = seenFirst[n] ?? 0;
    const tenure = first ? (end + 1) - first + 1 : 0;

    const last = lastSeen[n] ?? 0;
    const timeSinceLast = last ? (end + 1) - last + 1 : end + 1;

    const zpaGroup = opts.zpaGroupOf ? opts.zpaGroupOf(n) : 0;

    const churned = timeSinceLast > K ? 1 : 0;

    // Return label requires a rolling/evaluation window; leave undefined for now
    const returnLabel: 0 | 1 | undefined = undefined;

    examples.push({
      number: n,
      freqFortnight,
      freqMonth,
      freqQuarter,
      tenure,
      timeSinceLast,
      zpaGroup,
      churnLabel: churned as 0 | 1,
      returnLabel: returnLabel as any,
    });
  }
  return examples;
}

/**
 * Extract features for a single number at a specific point in history
 * Used for real-time prediction/analysis
 */
export function extractFeaturesForNumber(
  history: Draw[],
  number: number,
  currentIdx: number,
  churnThreshold?: number
): {
  freqFortnight: number;
  freqMonth: number;
  freqQuarter: number;
  freqTotal: number;
  tenure: number;
  timeSinceLast: number;
  zpaGroup: number;
  churned?: boolean;
} {
  const K = churnThreshold ?? 12;

  function countInWindow(endIdx: number, win: number): number {
    let c = 0;
    for (let t = Math.max(0, endIdx - win + 1); t <= endIdx; t++) {
      const d = history[t];
      if (d.main.includes(number) || (d.supp && d.supp.includes(number))) c++;
    }
    return c;
  }

  // Find first and last occurrence
  let firstSeen = -1;
  let lastSeen = -1;
  for (let t = 0; t <= currentIdx; t++) {
    const d = history[t];
    if (d.main.includes(number) || (d.supp && d.supp.includes(number))) {
      if (firstSeen === -1) firstSeen = t;
      lastSeen = t;
    }
  }

  const freqFortnight = countInWindow(currentIdx, 6);
  const freqMonth = countInWindow(currentIdx, 12);
  const freqQuarter = countInWindow(currentIdx, 36);
  const freqTotal = countInWindow(currentIdx, currentIdx + 1);

  const tenure = firstSeen >= 0 ? currentIdx - firstSeen + 1 : 0;
  const timeSinceLast = lastSeen >= 0 ? currentIdx - lastSeen : currentIdx + 1;

  // Simple ZPA group assignment (number / 5)
  const zpaGroup = Math.floor((number - 1) / 5);

  const churned = timeSinceLast > K;

  return {
    freqFortnight,
    freqMonth,
    freqQuarter,
    freqTotal,
    tenure,
    timeSinceLast,
    zpaGroup,
    churned,
  };
}
import { Draw } from "../types";

// Build a 0/1 event series per number (older→newer)
function eventSeries(history: Draw[], n: number): number[] {
  return history.map(d => (d.main.includes(n) || d.supp.includes(n) ? 1 : 0));
}

export function currentDroughtLen(history: Draw[], n: number): number {
  const s = eventSeries(history, n);
  let k = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === 1) break;
    k++;
  }
  return k;
}

// Empirical hazard with Laplace smoothing: h(k) = P(hit at next | drought length = k)
export function computeDroughtHazard(history: Draw[]) {
  const maxN = 45;
  if (!history.length) {
    return { hazard: [0], maxK: 0, byNumber: Array.from({ length: maxN }, (_, i) => ({ number: i + 1, k: 0, p: 0 })) };
  }
  // Pool exposures across all numbers
  const exposures = new Map<number, { trials: number; hitsNext: number }>();

  for (let n = 1; n <= maxN; n++) {
    const s = eventSeries(history, n);
    let k = 0;
    for (let t = 0; t < s.length - 1; t++) {
      // At time t we observe drought length k, and we check next event at t+1
      const e = exposures.get(k) || { trials: 0, hitsNext: 0 };
      e.trials += 1;
      if (s[t + 1] === 1) e.hitsNext += 1;
      exposures.set(k, e);
      // Update k for next step
      k = s[t] === 1 ? 0 : k + 1;
    }
  }

  const maxK = Math.max(0, ...Array.from(exposures.keys()));
  const hazard: number[] = [];
  for (let k = 0; k <= maxK; k++) {
    const e = exposures.get(k) || { trials: 0, hitsNext: 0 };
    // Laplace smoothing ensures nonzero denominators in sparse windows
    const p = (e.hitsNext + 1) / (e.trials + 2);
    hazard[k] = p;
  }

  const byNumber = Array.from({ length: maxN }, (_, i) => {
    const number = i + 1;
    const k = currentDroughtLen(history, number);
    const kk = Math.min(k, maxK);
    const p = hazard[kk] ?? 0;
    return { number, k, p };
  });

  return { hazard, maxK, byNumber };
}
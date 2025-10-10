import { Draw } from "../types";
import { computeDroughtHazard } from "./droughtHazard"; // you already have this

export function computeWindowFrequencies(history: Draw[]): number[] {
  const freq = Array(45).fill(0);
  for (const d of history) {
    [...d.main, ...d.supp].forEach(n => {
      if (n >= 1 && n <= 45) freq[n - 1] += 1;
    });
  }
  const W = history.length || 1;
  return freq.map(f => f / W);
}

/**
 * Combine frequency, hazard, and temperature (all length 45) into a single
 * conditional probability vector c_i that sums to 1.
 *
 * c_i = (lambdaFreq * freq_i + (1 - lambdaFreq) * hazard_i) * (1 + tempGain * (temp_i - meanTemp))
 */
export function buildConditionalProb(
  history: Draw[],
  temperature: number[],
  lambdaFreq = 0.5,
  tempGain = 0.3
): number[] {
  const freq = computeWindowFrequencies(history);
  const hazardObj = computeDroughtHazard(history);
  const hazard = hazardObj.byNumber.map(r => r.p); // p already smoothed
  const meanTemp = temperature.reduce((a,b)=>a+b,0)/Math.max(1,temperature.length);

  const raw = freq.map((f,i) => {
    const h = hazard[i] ?? 0;
    const base = lambdaFreq * f + (1 - lambdaFreq) * h;
    const tAdj = 1 + tempGain * (temperature[i] - meanTemp);
    return base * tAdj;
  });

  const sum = raw.reduce((a,b)=>a+b,0) || 1;
  return raw.map(v => v / sum);
}
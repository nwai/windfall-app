/* Simple test harness you can run with ts-node:
   npx ts-node src/dev/testDroughtAndBuckets.ts
*/
import { Draw } from "../types";
import { computeDroughtHazard } from "../lib/droughtHazard";
import { computeTemperatureAndBuckets } from "../lib/temperatureSeries";

// Fixed, deterministic dataset (oldest → newest)
const history: Draw[] = [
  { date: "2025-01-01", main: [1,2,3,4,5,6],       supp: [7,8] },
  { date: "2025-01-03", main: [1,10,11,12,13,14],  supp: [2,3] },
  { date: "2025-01-05", main: [20,21,22,23,24,25], supp: [1,4] },
  { date: "2025-01-07", main: [2,26,27,28,29,30],  supp: [31,32] },
  { date: "2025-01-09", main: [1,33,34,35,36,37],  supp: [38,39] },
  { date: "2025-01-11", main: [40,41,42,43,44,45], supp: [3,5]  },
];

// 1) Drought hazard test
const hazard = computeDroughtHazard(history);
console.log("=== Drought Hazard h(k) ===");
console.log("k : P(hit next)");
hazard.hazard.forEach((p, k) => console.log(`${k} : ${(p*100).toFixed(1)}%`));
console.log(`maxK observed = ${hazard.maxK}`);

const sampleNums = [1, 2, 22, 40];
console.log("\nCurrent drought lengths and P(hit next) for sample numbers:");
for (const n of sampleNums) {
  const rec = hazard.byNumber.find(x => x.number === n)!;
  console.log(`#${n} -> k=${rec.k}, P=${(rec.p*100).toFixed(1)}%`);
}

// 2) Temperature buckets + next-bucket probabilities test
const {
  transitionMatrix,
  currentBucketPerNumber,
  nextBucketProbsPerNumber,
  bucketStops,
} = computeTemperatureAndBuckets(history, {
  alpha: 0.25,
  heightNumbers: 45,
  metric: "hybrid",
  hybridWeight: 0.6,
  emaNormalize: "per-number",
  enforcePeaks: true,
  buckets: 5,
  bucketStops: [0.2, 0.4, 0.6, 0.8], // fixed thresholds for determinism
});

console.log("\n=== Bucket thresholds ===");
console.log(bucketStops.map(s => s.toFixed(2)).join(", "));

console.log("\n=== Transition matrix (rows sum to 1; Laplace-smoothed) ===");
transitionMatrix.forEach((row, i) => {
  console.log(`from B${i}: ` + row.map(x => x.toFixed(3)).join(" "));
});

console.log("\nCurrent bucket and next-bucket probabilities for sample numbers:");
for (const n of sampleNums) {
  const bk = currentBucketPerNumber[n-1];
  const probs = nextBucketProbsPerNumber[n-1].map(p => p.toFixed(3)).join(" ");
  console.log(`#${n}: current B${bk} → next probs: ${probs}`);
}

console.log("\nOK");
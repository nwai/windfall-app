import { buildTransitionMatrix, getTransitionProbability } from "./temperatureTransitions";
import { Draw } from "../types";

/**
 * Minimal regression test for matrix/probability:
 * - fabricate a tiny history and per-number categories
 * - ensure P(V|T) matches hits/total by previous category
 * Run with: npx ts-node src/lib/temperatureTransitions.test.ts
 * or wire into your test runner.
 */
(function testBasicTransitionMatrix() {
  const history: Draw[] = [
    { date: "2025-01-01", main: [1,2,3,4,5,6],       supp: [8,9] },
    { date: "2025-01-03", main: [7,10,11,12,13,14],  supp: [2,3] }, // 7 hits
    { date: "2025-01-05", main: [20,21,22,23,24,25], supp: [1,4] },
    { date: "2025-01-07", main: [2,7,27,28,29,30],   supp: [31,32] }, // 7 hits
  ];

  // Categories for number 7: arbitrary label "X" at indices 1..3, "other" at 0
  const numberTemps: Record<number, string[]> = {};
  for (let n = 1; n <= 45; n++) numberTemps[n] = Array(history.length).fill("other");
  numberTemps[7] = ["other", "X", "X", "X"];

  const M = buildTransitionMatrix(history, numberTemps as any);

  // For prev temp "X": we have opportunities at i=2 and i=3; hit at i=3 only -> 1/2
  const pX = getTransitionProbability(M, 7, "X");
  if (Math.abs(pX - 0.5) > 1e-9) {
    console.error("❌ P(V|X) expected 0.5, got", pX);
    process.exit(1);
  }

  // For prev temp "other": i=1 only, hit -> 1/1
  const pOther = getTransitionProbability(M, 7, "other");
  if (Math.abs(pOther - 1) > 1e-9) {
    console.error("❌ P(V|other) expected 1, got", pOther);
    process.exit(1);
  }

  console.log("✅ transition matrix basic test passed");
})();
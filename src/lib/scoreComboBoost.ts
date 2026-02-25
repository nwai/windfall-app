export function scoreComboBoost(opts: {
  candidateMain: number[];
  selectedPairs?: Array<[number, number]>;
  selectedTriplets?: Array<[number, number, number]>;
  mode?: "off" | "boost";
  boostFactor?: number;
  capMultiplier?: number; // optional, default 2.0
}): number {
  const {
    candidateMain,
    selectedPairs = [],
    selectedTriplets = [],
    mode = "off",
    boostFactor = 0.15,
    capMultiplier = 2.0,
  } = opts;

  if (mode === "off") return 1;

  const set = new Set(candidateMain);
  let hits = 0;

  for (const [a, b] of selectedPairs) {
    if (set.has(a) && set.has(b)) hits += 1;
  }
  for (const [a, b, c] of selectedTriplets) {
    if (set.has(a) && set.has(b) && set.has(c)) hits += 1;
  }

  const mult = Math.min(capMultiplier, 1 + hits * boostFactor);
  return mult;
}

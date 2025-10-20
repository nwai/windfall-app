import { CandidateSet, Draw, Knobs } from "./types";
import { entropy, minHamming, maxJaccard } from "./analytics";
import { applyOctagonalPostProcess } from "./octagonal";
import { getSDE1FilteredPool } from "./sde1";

/** Trend classification union (avoid missing type) */
export type TrendClass = 'UP' | 'DOWN' | 'FLAT';

export interface GenerateCandidatesResult {
  candidates: CandidateSet[];
  ratioSummary: any;
  quotaWarning?: string;
  rejectionStats: {
    entropy: number;
    hamming: number;
    jaccard: number;
    oddEven: number;
    tricky: number;
    minRecent: number;
    recentBias: number;
    repeatUnion: number;
    trendRatio: number;
    exclusions: number;
    sumRange: number;
    totalAttempts: number;
    accepted: number;
  };
}

const DEBUG = false;

/**
 * Generate candidate draw sets with layered rejection filters.
 */
export function generateCandidates(
  num: number,
  history: Draw[],
  knobs: Knobs,
  traceSetter: React.Dispatch<React.SetStateAction<string[]>>,
  excludedNumbers: number[],
  selectedOddEvenRatios: string[],
  useTrickyRule: boolean,
  minOGAPercentile: number,          // currently unused in this function (left for future OGA filtering)
  pastOGAScores: number[],           // currently unused here (OGA computed later post-process)
  forcedNumbers: number[],
  entropyThreshold: number,
  hammingThreshold: number,
  jaccardThreshold: number,
  lambda: number,                    // currently not applied inside this function (placeholder for future weighting)
  ratioOptions?: { ratio: string; count: number }[],
  minRecentMatches: number = 0,
  recentMatchBias: number = 0,
  repeatWindowSizeW: number = 0,
  minFromRecentUnionM: number = 0,
  trendMap?: Map<number, TrendClass>,
  allowedTrendRatios?: string[],
  sumFilter?: { enabled: boolean; min: number; max: number; includeSupp: boolean }
): GenerateCandidatesResult {

  // Set default sumFilter values
  const sumFilterConfig = sumFilter ?? { enabled: false, min: 0, max: 9999, includeSupp: true };

  if (DEBUG) {
    console.log('[generateCandidates] args snapshot', {
      num,
      excludedNumbers,
      forcedNumbers,
      selectedOddEvenRatios,
      useTrickyRule,
      minRecentMatches,
      recentMatchBias,
      repeatWindowSizeW,
      minFromRecentUnionM,
      hasTrendMap: !!trendMap,
      allowedTrendRatios,
      sumFilter: sumFilterConfig
    });
  }

  let candidates: CandidateSet[] = [];
  let attempts = 0;

  const stats = {
    entropy: 0,
    hamming: 0,
    jaccard: 0,
    oddEven: 0,
    tricky: 0,
    minRecent: 0,
    recentBias: 0,
    repeatUnion: 0,
    trendRatio: 0,
    exclusions: 0,
    sumRange: 0,
    totalAttempts: 0,
    accepted: 0
  };

  const ratioSummary: any = {};  // placeholder in case you aggregate ratios later
  const warnings: string[] = [];

  // Build repeat-mode union (for minFromRecentUnionM)
  let recentUnion: Set<number> | null = null;
  if (repeatWindowSizeW > 0 && history.length > 0 && minFromRecentUnionM > 0) {
    const W = Math.min(repeatWindowSizeW, history.length);
    recentUnion = new Set<number>();
    const slice = history.slice(history.length - W);
    for (const d of slice) {
      [...d.main, ...d.supp].forEach(n => recentUnion!.add(n));
    }
    traceSetter(t => [...t, `[TRACE] Repeat-mode W=${W} unionSize=${recentUnion!.size}`]);
  }

  // HC3 overlap (numbers that appear in both last two draws)
  let hc3Numbers: number[] = [];
  if (knobs.enableHC3 && history.length >= 2) {
    const lastDraw = history[history.length - 1];
    const prevDraw = history[history.length - 2];
    const lastAll = [...lastDraw.main, ...lastDraw.supp];
    const prevAll = [...prevDraw.main, ...prevDraw.supp];
    hc3Numbers = lastAll.filter(n => prevAll.includes(n));
    traceSetter(t => [...t, `[TRACE] HC3 enabled: overlap with last two draws -> count=${hc3Numbers.length}${hc3Numbers.length > 0 ? ` [${hc3Numbers.join(", ")}]` : ""}`]);
  }

  // SDE1 filtering (primary pool & SDE1 exclusions)
  let mainPool = Array.from({ length: 45 }, (_, i) => i + 1);
  let sde1ExcludedNumbers: number[] = [];
  if (knobs.enableSDE1) {
    const { pool, trace, excludedNumbers: sdeExcl } = getSDE1FilteredPool(history);
    mainPool = pool;
    sde1ExcludedNumbers = sdeExcl;
    traceSetter(t => [...t, `[TRACE] ${trace}`]);
  }

  // Combine all exclusions (user + SDE1 + HC3)
  const fullExcludedNumbers = Array.from(
    new Set<number>([...excludedNumbers, ...sde1ExcludedNumbers, ...hc3Numbers])
  ).sort((a, b) => a - b);
  
  // Trace combined exclusions
  const exclusionSources: string[] = [];
  if (excludedNumbers.length > 0) exclusionSources.push(`User=${excludedNumbers.length}`);
  if (sde1ExcludedNumbers.length > 0) exclusionSources.push(`SDE1=${sde1ExcludedNumbers.length}`);
  if (hc3Numbers.length > 0) exclusionSources.push(`HC3=${hc3Numbers.length}`);
  if (fullExcludedNumbers.length > 0) {
    traceSetter(t => [...t, `[TRACE] Combined exclusions: ${exclusionSources.join(" + ")} -> total=${fullExcludedNumbers.length} [${fullExcludedNumbers.join(", ")}]`]);
  }

  // Filter mainPool accordingly
  mainPool = mainPool.filter(n => !fullExcludedNumbers.includes(n));

  // Prevent forced numbers from re-introducing excluded numbers
  const forcedClean = forcedNumbers.filter(n => !fullExcludedNumbers.includes(n));
  if (forcedClean.length !== forcedNumbers.length) {
    const removed = forcedNumbers.filter(n => fullExcludedNumbers.includes(n));
    traceSetter(t => [
      ...t,
      `[TRACE] Forced numbers intersected exclusions; removed: [${removed.join(", ")}]`
    ]);
  }

  // Pre-calc last draw for quick overlap metrics
  const lastDraw = history.length ? history[history.length - 1] : null;
  const lastDrawSet = lastDraw
    ? new Set([...lastDraw.main, ...lastDraw.supp])
    : null;

  // Main generation loop
  while (candidates.length < num && attempts < num * 120) {
    attempts++;

    // Start candidate with forced seeds
    const forced = forcedClean.slice(0, 8);
    const forcedMain = forced.slice(0, 6);
    const forcedSupp = forced.slice(6, 8);

    let main: number[] = [...forcedMain];
    let supp: number[] = [...forcedSupp];

    // Fill main from remaining pool
    const restPool = mainPool.filter(n => !forced.includes(n));
    const rp = [...restPool];
    while (main.length < 6 && rp.length) {
      const idx = Math.floor(Math.random() * rp.length);
      main.push(rp[idx]);
      rp.splice(idx, 1);
    }
    main.sort((a, b) => a - b);

    // Build supp pool (exclude already used + all exclusions)
    const suppPool = Array.from({ length: 45 }, (_, i) => i + 1)
      .filter(n => ![...main, ...supp, ...fullExcludedNumbers].includes(n));
    const sp = [...suppPool];
    while (supp.length < 2 && sp.length) {
      const idx = Math.floor(Math.random() * sp.length);
      supp.push(sp[idx]);
      sp.splice(idx, 1);
    }
    supp.sort((a, b) => a - b);

    const nums8 = [...main, ...supp];

    // SAFETY: Final exclusion guard (should be redundant, but ensures no leaks)
    if (nums8.some(n => fullExcludedNumbers.includes(n))) {
      stats.exclusions++;
      continue;
    }

    // Odd/Even ratio filter
    if (selectedOddEvenRatios.length > 0) {
      const odd = nums8.filter(n => n % 2 === 1).length;
      const ratio = `${odd}:${8 - odd}`;
      if (!selectedOddEvenRatios.includes(ratio)) { stats.oddEven++; continue; }
    }

    // Tricky rule (reject extreme all-odd/all-even patterns)
    if (useTrickyRule) {
      const odd = nums8.filter(n => n % 2 === 1).length;
      const ratio = `${odd}:${8 - odd}`;
      if (ratio === "0:8" || ratio === "8:0") { stats.tricky++; continue; }
    }

    // Repeat-mode union minimum hits
    if (recentUnion && minFromRecentUnionM > 0) {
      const unionSet = recentUnion; // TypeScript narrowing helper
      const hits = nums8.filter(n => unionSet.has(n)).length;
      if (hits < minFromRecentUnionM) { stats.repeatUnion++; continue; }
    }

    // Recent match constraints
    if (lastDrawSet) {
      const matches = nums8.filter(n => lastDrawSet.has(n)).length;
      if (minRecentMatches > 0 && matches < minRecentMatches) {
        stats.minRecent++; continue;
      }
      if (recentMatchBias > 0) {
        const prob = Math.min(1, recentMatchBias * (matches / 8));
        if (Math.random() > prob) { stats.recentBias++; continue; }
      }
    }

    // Trend ratio filter (UP-DOWN-FLAT composition)
    if (trendMap && allowedTrendRatios && allowedTrendRatios.length) {
      let u = 0, d = 0, f = 0;
      for (const n of nums8) {
        const tc = trendMap.get(n) || 'FLAT';
        if (tc === 'UP') u++;
        else if (tc === 'DOWN') d++;
        else f++;
      }
      const tag = `${u}-${d}-${f}`;
      if (!allowedTrendRatios.includes(tag)) {
        stats.trendRatio++; continue;
      }
    }

    // Sum range filter
    if (sumFilterConfig.enabled) {
      const candidateSum = sumFilterConfig.includeSupp
        ? main.reduce((a, b) => a + b, 0) + supp.reduce((a, b) => a + b, 0)
        : main.reduce((a, b) => a + b, 0);
      if (candidateSum < sumFilterConfig.min || candidateSum > sumFilterConfig.max) {
        stats.sumRange++;
        continue;
      }
    }

    // Entropy / distance / similarity filters
    if (knobs.enableEntropy && entropy({ main, supp }) < entropyThreshold) { stats.entropy++; continue; }
    if (knobs.enableHamming && minHamming({ main, supp }, history) < hammingThreshold) { stats.hamming++; continue; }
    if (knobs.enableJaccard && maxJaccard({ main, supp }, history) > jaccardThreshold) { stats.jaccard++; continue; }

    // ACCEPT
    candidates.push({ main, supp });
    stats.accepted++;
  }

  stats.totalAttempts = attempts;

  // Octagonal post-process (OGA-style trimming)
  if (knobs.enableOGA && typeof knobs.octagonal_top === "number" && candidates.length > knobs.octagonal_top) {
    candidates = applyOctagonalPostProcess(candidates, history, knobs.octagonal_top);
  }

  if (DEBUG) {
    console.log('[generateCandidates] rejection stats', stats);
  }

  return {
    candidates: candidates.slice(0, num),
    ratioSummary,
    quotaWarning: warnings.length ? warnings.join(" ") : undefined,
    rejectionStats: stats
  };
}
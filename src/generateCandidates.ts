import { CandidateSet, Draw, Knobs } from "./types";
import { entropy, minHamming, maxJaccard } from "./analytics";
import { applyOctagonalPostProcess } from "./octagonal";
import { getSDE1FilteredPool } from "./sde1";
import { computeOGA } from "./utils/oga";

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
    sumRange: number;        // NEW
    patternConstraint: number; // NEW
    ogaBias: number;          // NEW
    exclusions: number;
    totalAttempts: number;
    accepted: number;
  };
}

const DEBUG = false;

/* ------------------------ Pattern helpers (top-level) ----------------------- */

const SUM_LOW_MAX = 22;

function computeCandidatePattern(main: number[], supp: number[]) {
  const all = [...main, ...supp];
  const low = all.filter(n => n <= SUM_LOW_MAX).length;
  const high = all.length - low;
  const even = all.filter(n => n % 2 === 0).length;
  const odd = all.length - even;
  const sum = all.reduce((a, b) => a + b, 0);
  return { low, high, even, odd, sum };
}

function matchesAnyPattern(
  pat: { low: number; high: number; even: number; odd: number; sum: number },
  set: { low: number; high: number; even: number; odd: number; sum: number }[] | undefined,
  sumTol: number
): number {
  if (!set || set.length === 0) return 0;
  let m = 0;
  for (const s of set) {
    if (
      s.low === pat.low &&
      s.high === pat.high &&
      s.even === pat.even &&
      s.odd === pat.odd &&
      Math.abs(s.sum - pat.sum) <= sumTol
    ) {
      m++;
    }
  }
  return m;
}

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
  // NEW: optional sum filter
  sumFilter?: { enabled?: boolean; min?: number; max?: number; includeSupp?: boolean },
  // NEW: optional pattern constraints (low/high/even/odd + sum tolerance)
  patternOptions?: {
    constraints?: { low: number; high: number; even: number; odd: number; sum: number }[];
    mode?: 'boost' | 'restrict';
    boostFactor?: number;   // not used here; applied in App ranking
    sumTolerance?: number;  // default 0 means exact sum
  },
  // NEW: OGA forecast bias options
  ogaBiasOptions?: {
    enabled?: boolean;
    preferredBand?: 'auto' | 'low' | 'mid' | 'high';
    bands?: { low: number; mid: number; high: number }; // probabilities from KDE
    // NEW: decile-based selection
    deciles?: { thresholds: number[]; probs: number[] };
    preferredDeciles?: { index: number; weight: number }[]; // allow multiple decile bands with weights
  }
): GenerateCandidatesResult {

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
      sumFilter,
      patternOptions
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
    sumRange: 0,      // NEW
    patternConstraint: 0, // NEW
    ogaBias: 0,           // NEW
    exclusions: 0,
    totalAttempts: 0,
    accepted: 0
  };

  const ratioSummary: any = {};  // placeholder in case you aggregate ratios later
  const warnings: string[] = [];

  // Configure sum filter defaults (keeps backwards compatibility when not provided)
  const sumCfg = {
    enabled: false,
    min: 0,
    max: 9999,
    includeSupp: true,
    ...(sumFilter || {})
  };

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

    // NEW: Sum range constraint (before other filters)
    if (sumCfg.enabled) {
      const arr = sumCfg.includeSupp ? nums8 : main;
      const total = arr.reduce((a, b) => a + b, 0);
      if (total < sumCfg.min || total > sumCfg.max) {
        stats.sumRange++;
        continue;
      }
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
      const ru = recentUnion; // Set<number> (non-null inside this block)
      let hits = 0;
      for (const n of nums8) if (ru.has(n)) hits++;
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

    // NEW: Pattern constraint (restrict mode only; boost happens in App ranking)
if (patternOptions?.constraints?.length && patternOptions?.mode === 'restrict') {
      const pat = computeCandidatePattern(main, supp);
      const sumTol = Math.max(0, patternOptions?.sumTolerance ?? 0);
      const m = matchesAnyPattern(pat, patternOptions.constraints, sumTol);
      if (m === 0) {
        stats.patternConstraint++;
        if (DEBUG) console.log('[generateCandidates] pattern reject', pat);
        continue;
      }
    }

    // Entropy / distance / similarity filters
    if (knobs.enableEntropy && entropy({ main, supp }) < entropyThreshold) { stats.entropy++; continue; }
    if (knobs.enableHamming && minHamming({ main, supp }, history) < hammingThreshold) { stats.hamming++; continue; }
    if (knobs.enableJaccard && maxJaccard({ main, supp }, history) > jaccardThreshold) { stats.jaccard++; continue; }

    // OGA forecast bias acceptance — deterministic by raw candidate OGA vs bands/deciles
    if (ogaBiasOptions?.enabled) {
      const candidateOGA = computeOGA(nums8, history);
      let acceptedByDecile = false;
      if (ogaBiasOptions.deciles && Array.isArray(ogaBiasOptions.preferredDeciles) && ogaBiasOptions.preferredDeciles.length) {
        const th = ogaBiasOptions.deciles.thresholds || [];
        // Determine decile index: 0..9
        let idx = 0;
        while (idx < th.length && candidateOGA > th[idx]) idx++;
        // Weighted acceptance based on selected deciles
        const match = ogaBiasOptions.preferredDeciles.find(d => d.index === idx);
        const weightSum = ogaBiasOptions.preferredDeciles.reduce((s, d) => s + Math.max(0, d.weight), 0) || 0;
        const w = match ? Math.max(0, match.weight) : 0;
        const prob = weightSum > 0 ? (w / weightSum) : 0;
        if (Math.random() <= prob) acceptedByDecile = true;

        const selList = (ogaBiasOptions.preferredDeciles ?? []).map(d=>`D${d.index}x${d.weight}`).join(', ');
        traceSetter(t => [...t, `[TRACE] OGA decile check: OGA=${candidateOGA.toFixed(2)} → D${idx} weight=${w} prob=${prob.toFixed(2)} sel=${selList}`]);
      }
      if (!acceptedByDecile) {
        // Fallback to low/mid/high deterministic band matching or probabilistic acceptance
        const pb = ogaBiasOptions.preferredBand ?? 'auto';
        const bands = ogaBiasOptions.bands ?? { low: 0.1, mid: 0.8, high: 0.1 };
        // Compute p10/p90 proxies if available from deciles
        const th = ogaBiasOptions.deciles?.thresholds;
        const p10 = th && th[0] !== undefined ? th[0] : undefined;
        const p90 = th && th[8] !== undefined ? th[8] : undefined;
        if (p10 !== undefined && p90 !== undefined) {
          const band = candidateOGA <= p10 ? 'low' : candidateOGA >= p90 ? 'high' : 'mid';
          const targetBand: 'low' | 'mid' | 'high' = pb === 'auto'
            ? (bands.low >= bands.mid && bands.low >= bands.high ? 'low' : (bands.mid >= bands.high ? 'mid' : 'high'))
            : pb;
          if (band !== targetBand) { stats.ogaBias++; continue; }
        } else {
          // Probabilistic fallback
          const targetBand: 'low' | 'mid' | 'high' = pb === 'auto'
            ? (bands.low >= bands.mid && bands.low >= bands.high ? 'low' : (bands.mid >= bands.high ? 'mid' : 'high'))
            : pb;
          const acceptProb = targetBand === 'low' ? bands.low : targetBand === 'mid' ? bands.mid : bands.high;
          if (Math.random() > acceptProb) { stats.ogaBias++; continue; }
        }
      }
    }

    // ACCEPT
    let patternMatches = 0;
    if (patternOptions?.constraints?.length) {
      const pat = computeCandidatePattern(main, supp);
      const sumTol = Math.max(0, patternOptions?.sumTolerance ?? 0);
      patternMatches = matchesAnyPattern(pat, patternOptions.constraints, sumTol);
    }
    candidates.push({ main, supp, patternMatches } as any);
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

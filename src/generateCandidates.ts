import { CandidateSet, Draw, Knobs } from "./types";
import { entropy, precomputeHistoryBitmasks, minHammingBit, maxJaccardBit, toBitmask } from "./analytics";
import { applyOctagonalPostProcess } from "./octagonal";
import { getSDE1FilteredPool } from "./sde1";
import { computeOGA, DEFAULT_OGA_SPOKES } from "./utils/oga";

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
    div5: number;             // NEW
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
  selectedNumbersForBoost: number[],
  selectedBoostOptions: { enabled?: boolean; factor?: number } | undefined,
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
  },
  // NEW: divisible-by-5 constraint options
  div5Options?: {
    requireOne?: boolean;
    maxAllowed?: number; // if undefined, no cap enforced
  },
  // NEW: constructive monthly bucket fill (from latest month buckets)
  monthlyBucketOptions?: {
    constraints: { undrawn: number; times1: number; times2: number; times3: number; times4: number; times5: number; times6: number; times7: number; times8: number };
    buckets: { undrawn: Set<number>; times1: Set<number>; times2: Set<number>; times3: Set<number>; times4: Set<number>; times5: Set<number>; times6: Set<number>; times7: Set<number>; times8: Set<number> };
    allowShortfall?: boolean;
  },
  attemptMultiplier?: number,
  ogaSpokeCount?: number
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

  const selectedBoostSet = new Set<number>((selectedNumbersForBoost ?? []).filter(n => n >= 1 && n <= 45));
  const boostFactorRaw = selectedBoostOptions?.factor ?? 1;
  const boostFactor = Math.max(1, Number.isFinite(boostFactorRaw) ? boostFactorRaw : 1);
  const boostEnabled = !!selectedBoostOptions?.enabled && boostFactor > 1 && selectedBoostSet.size > 0;
  const spokeCount = Math.max(1, Math.floor(ogaSpokeCount ?? DEFAULT_OGA_SPOKES));

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
    div5: 0,              // NEW
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
  const fullExcludedSet = new Set(fullExcludedNumbers);

  // Trace combined exclusions
  const exclusionSources: string[] = [];
  if (excludedNumbers.length > 0) exclusionSources.push(`User=${excludedNumbers.length}`);
  if (sde1ExcludedNumbers.length > 0) exclusionSources.push(`SDE1=${sde1ExcludedNumbers.length}`);
  if (hc3Numbers.length > 0) exclusionSources.push(`HC3=${hc3Numbers.length}`);
  if (fullExcludedNumbers.length > 0) {
    traceSetter(t => [...t, `[TRACE] Combined exclusions: ${exclusionSources.join(" + ")} -> total=${fullExcludedNumbers.length} [${fullExcludedNumbers.join(", ")}]`]);
  }

  // Filter mainPool accordingly
  mainPool = mainPool.filter(n => !fullExcludedSet.has(n));

  // Recency weighting (lambda): more recent appearances get higher weight
  const recencyScores = Array(46).fill(0);
  if (lambda > 0 && history.length) {
    for (let age = 0; age < history.length; age++) {
      const w = Math.pow(lambda, age);
      const draw = history[history.length - 1 - age];
      [...draw.main, ...draw.supp].forEach((n) => {
        if (n >= 1 && n <= 45) recencyScores[n] += w;
      });
    }
  }
  const maxRecency = Math.max(...recencyScores);
  if (lambda > 0 && history.length) {
    traceSetter(t => [...t, `[TRACE] Lambda weighting enabled: λ=${lambda.toFixed(2)} maxWeight=${maxRecency.toFixed(2)} (recent numbers get higher sampling weight)`]);
  } else {
    traceSetter(t => [...t, `[TRACE] Lambda weighting disabled or no history; sampling is uniform aside from boosts.`]);
  }
  const recencyFactor = (n: number) => {
    if (maxRecency <= 0) return 1;
    const norm = recencyScores[n] / maxRecency;
    // Keep floor >0 so unseen numbers still possible
    return 0.5 + 0.5 * norm;
  };

  // Remove excluded numbers from boost set (guardrail)
  if (boostEnabled) {
    for (const n of Array.from(selectedBoostSet)) {
      if (fullExcludedSet.has(n)) selectedBoostSet.delete(n);
    }
    if (selectedBoostSet.size === 0) {
      traceSetter(t => [...t, "[TRACE] Selected boost disabled: all selected numbers are excluded."]);
    } else {
      traceSetter(t => [...t, `[TRACE] Selected boost enabled: factor ${boostFactor} on ${selectedBoostSet.size} numbers`]);
    }
  }

  const buildWeightedPool = (pool: number[]) => {
    const out: number[] = [];
    for (const n of pool) {
      let factor = recencyFactor(n);
      if (boostEnabled && selectedBoostSet.has(n)) {
        factor *= Math.max(1, boostFactor);
      }
      const reps = Math.max(1, Math.round(factor));
      for (let i = 0; i < reps; i++) out.push(n);
    }
    return out;
  };

  // Weighted sampling without replacement (drops all copies of a drawn number)
  const drawWeightedUnique = (pool: number[], needed: number): number[] => {
    if (needed <= 0 || pool.length === 0) return [];
    let weighted = buildWeightedPool(pool);
    const picked: number[] = [];
    while (picked.length < needed && weighted.length > 0) {
      const idx = Math.floor(Math.random() * weighted.length);
      const val = weighted[idx];
      picked.push(val);
      // remove all occurrences of val to enforce uniqueness
      weighted = weighted.filter((n) => n !== val);
    }
    return picked;
  };

  const sampleWithoutReplacement = (pool: number[], k: number): number[] => {
    const arr = pool.slice();
    const res: number[] = [];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    for (let i = 0; i < k && i < arr.length; i++) res.push(arr[i]);
    return res;
  };

  // Prevent forced numbers from re-introducing excluded numbers
  const forcedClean = forcedNumbers.filter(n => !fullExcludedSet.has(n));
  if (forcedClean.length !== forcedNumbers.length) {
    const removed = forcedNumbers.filter(n => fullExcludedSet.has(n));
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

  // Pre-compute supp base pool: 1-45 minus static exclusions (constant across iterations)
  const suppBasePool = Array.from({ length: 45 }, (_, i) => i + 1)
    .filter(n => !fullExcludedSet.has(n));

  // Pre-compute history bitmasks for fast Hamming/Jaccard checks in the hot loop
  const histBitmasks = precomputeHistoryBitmasks(history);

  // Main generation loop
  const effectiveAttemptMultiplier = Math.max(1, Math.floor(attemptMultiplier ?? 400));
  const maxAttempts = num * effectiveAttemptMultiplier; // user-tunable cap (was num * 120, then 400)
  while (candidates.length < num && attempts < maxAttempts) {
    attempts++;

    // Start candidate with forced seeds
    const forced = forcedClean.slice(0, 8);
    const forcedMain = forced.slice(0, 6);
    const forcedSupp = forced.slice(6, 8);

    let main: number[] = [...forcedMain];
    let supp: number[] = [...forcedSupp];

    // Constructive bucket fill (monthly) — pick as many as available up to requested counts
    if (monthlyBucketOptions?.constraints && monthlyBucketOptions?.buckets) {
      const { constraints, buckets } = monthlyBucketOptions;
      const maxSlots = 8;
      const tryFill = (bucketKey: keyof typeof buckets, needed: number) => {
        if (needed <= 0) return;
        if (main.length + supp.length >= maxSlots) return;
        const avail = Array.from(buckets[bucketKey]).filter((n) =>
          !fullExcludedSet.has(n) && !main.includes(n) && !supp.includes(n)
        );
        const take = Math.min(needed, avail.length, maxSlots - main.length - supp.length);
        if (take <= 0) return;
        const picks = sampleWithoutReplacement(avail, take);
        for (const n of picks) {
          if (main.length < 6) main.push(n);
          else if (supp.length < 2) supp.push(n);
        }
      };
      tryFill('undrawn', constraints.undrawn);
      tryFill('times1', constraints.times1);
      tryFill('times2', constraints.times2);
      tryFill('times3', constraints.times3);
      tryFill('times4', constraints.times4);
      tryFill('times5', constraints.times5);
      tryFill('times6', constraints.times6);
      tryFill('times7', constraints.times7);
      tryFill('times8', constraints.times8);
    }

    // Fill main from remaining pool
    const restPool = mainPool.filter(n => !main.includes(n));
    const drawnMain = drawWeightedUnique(restPool, 6 - main.length);
    main = [...main, ...drawnMain];
    if (main.length < 6) { stats.exclusions++; continue; }
    main.sort((a, b) => a - b);

    // Build supp pool (exclude already used; static exclusions already removed in suppBasePool)
    const usedSet = new Set([...main, ...supp]);
    const suppPool = suppBasePool.filter(n => !usedSet.has(n));
    const drawnSupp = drawWeightedUnique(suppPool, 2 - supp.length);
    supp = [...supp, ...drawnSupp];
    if (supp.length < 2) { stats.exclusions++; continue; }
    supp.sort((a, b) => a - b);

    const nums8 = [...main, ...supp];

    // SAFETY: Final exclusion guard (should be redundant, but ensures no leaks)
    if (nums8.some(n => fullExcludedSet.has(n))) {
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

    // NEW: divisible-by-5 constraint
    const div5Count = nums8.filter(n => n % 5 === 0).length;
    if (div5Options?.requireOne && div5Count < 1) { stats.div5++; continue; }
    if (typeof div5Options?.maxAllowed === 'number' && div5Count > div5Options.maxAllowed) { stats.div5++; continue; }

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
    const candidateMainMask = (knobs.enableHamming || knobs.enableJaccard) ? toBitmask(main) : 0;
    if (knobs.enableHamming && minHammingBit(candidateMainMask, main.length, histBitmasks) < hammingThreshold) { stats.hamming++; continue; }
    if (knobs.enableJaccard && maxJaccardBit(candidateMainMask, main.length, histBitmasks) > jaccardThreshold) { stats.jaccard++; continue; }

    // OGA forecast bias acceptance — deterministic by raw candidate OGA vs bands/deciles
    if (ogaBiasOptions?.enabled) {
      const candidateOGA = computeOGA(nums8, history, spokeCount);
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

  if (candidates.length < num && attempts >= maxAttempts) {
     warnings.push(`Stopped after ${attempts} attempts; generated ${candidates.length}/${num}. Consider loosening constraints (e.g., Divisible-by-5) or increasing attempt multiplier (currently ${effectiveAttemptMultiplier}).`);
   }
 
   // Trace div5 enforcement summary for debugging/visibility
   if (div5Options) {
    traceSetter(t => [...t, `[TRACE] Divisible-by-5 rule: requireOne=${!!div5Options.requireOne} maxAllowed=${div5Options.maxAllowed ?? '∞'} rejects=${stats.div5}`]);
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

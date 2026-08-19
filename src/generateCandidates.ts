import { CandidateSet, Draw, Knobs } from "./types";
import { entropy, precomputeHistoryBitmasks, minHammingBit, maxJaccardBit, toBitmask } from "./analytics";
import { getSDE1FilteredPool } from "./sde1";
import { getHC3OverlapNumbers, getMostRecentDraw } from "./lib/recentDraws";
import { computeOGA, DEFAULT_OGA_SPOKES, getOGAPercentile } from "./utils/oga";
import {
  countSingleDigitNumbers,
  deriveDigitWidthTargets,
  formatDigitWidthScopeLabel,
  type DigitWidthConstraintConfig,
} from "./lib/digitWidthConstraint";
import { scoreMonthEndCarryOverCandidate } from "./lib/monthEndCarryOver";
import { MONTHLY_BUCKET_KEYS, type MonthlyBucketKey } from "./lib/monthlyDrawSummary";
import {
  buildOddEvenRatioQuotas,
  summarizeOddEvenRatios,
  type OddEvenRatioOption,
  type OddEvenRatioSummary,
} from "./lib/oddEvenRatios";
import {
  scoreCandidateWithScoringProfile,
  scoringInfluenceMultiplier,
  type ScoringGenerationProfile,
} from "./lib/scoringGenerationInfluence";
import {
  d1TerminalMomentumMultiplier,
  scoreD1TerminalMomentumCandidate,
  type D1TerminalMomentumGenerationProfile,
} from "./lib/d1TerminalMomentumInfluence";
import {
  analyzeLatestNeighbourSupport,
  candidateSatisfiesLatestNeighbourSupport,
  LATEST_NEIGHBOUR_SUPPORT_TRACE_TAG,
  type LatestNeighbourSupportOptions,
} from "./lib/latestNeighbourSupport";
export {
  applyOddEvenRatioQuotas,
  buildOddEvenRatioQuotas,
  candidateOddEvenRatio,
  summarizeOddEvenRatios,
} from "./lib/oddEvenRatios";
export type {
  OddEvenRatioOption as GenerateCandidateRatioOption,
  OddEvenRatioSummary as GenerateCandidateRatioSummary,
} from "./lib/oddEvenRatios";

/** Trend classification union (avoid missing type) */
export type TrendClass = 'UP' | 'DOWN' | 'FLAT';

export interface StrictDroughtQuotaGenerationOptions {
  enabled?: boolean;
  minCount?: number;
  shortlist?: number[];
  rankMultipliers?: Record<number, number>;
  sourceLabel?: string;
}

export interface GenerateCandidatesResult {
  candidates: CandidateSet[];
  ratioSummary: OddEvenRatioSummary;
  quotaWarning?: string;
  rejectionStats: {
    entropy: number;
    hamming: number;
    jaccard: number;
    oddEven: number;
    tricky: number;
    minRecent: number;
    maxLastDraw: number;
    recentBias: number;
    repeatUnion: number;
    latestNeighbourSupport: number;
    strictDroughtQuota: number;
    trendRatio: number;
    sumRange: number;
    patternConstraint: number;
    ogaBias: number;
    div5: number;
    mainZeroSet: number;
    mainFiveSet: number;
    mainOneSet: number;
    mainTwoSet: number;
    mainThreeSet: number;
    mainFourSet: number;
    mainSixSet: number;
    mainSevenSet: number;
    mainEightSet: number;
    mainNineSet: number;
    digitWidth: number;
    exclusions: number;
    totalAttempts: number;
    accepted: number;
  };
}

export type GenerateCandidatesProgressSetter = (result: GenerateCandidatesResult) => void;

interface MainDigitConstraintOptions {
  maxCount?: number;
  boost?: number;
  singleDigitBoost?: number;
  twoDigitBoost?: number;
}

type MainDecadeBiases = Partial<Record<'decade0x' | 'decade1x' | 'decade2x' | 'decade3x' | 'decade4x', number>>;

const DEBUG = false;
const MONTHLY_SELECTED_NUMBER_BIAS_REPEATS = 3;

/* ------------------------ Pattern helpers (top-level) ----------------------- */

const SUM_LOW_MAX = 22;

function computeCandidatePattern(main: number[], supp: number[]) {
  const all = [...main, ...supp];
  const low = all.filter(n => n <= SUM_LOW_MAX).length;
  const high = all.length - low;
  const even = all.filter(n => n % 2 === 0).length;
  const odd = all.length - even;
  const sum = all.reduce((a, b) => a + b, 0);
  return { low, high, odd, even, sum };
}

function matchesAnyPattern(
  pat: { low: number; high: number; odd: number; even: number; sum: number },
  set: { low: number; high: number; odd: number; even: number; sum: number }[] | undefined,
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
  traceSetter: (msg: string) => void,
  excludedNumbers: number[],
  selectedOddEvenRatios: string[],
  useTrickyRule: boolean,
  minOGAPercentile: number,
  pastOGAScores: number[],
  forcedNumbers: number[],
  selectedNumbersForBoost: number[],
  selectedBoostOptions: { enabled?: boolean; factor?: number } | undefined,
  entropyThreshold: number,
  hammingThreshold: number,
  jaccardThreshold: number,
  lambda: number,
  ratioOptions?: OddEvenRatioOption[],
  minRecentMatches: number = 0,
  recentMatchBias: number = 0,
  repeatWindowSizeW: number = 0,
  minFromRecentUnionM: number = 0,
  trendMap?: Map<number, TrendClass>,
  allowedTrendRatios?: string[],
  // NEW: optional sum filter
  sumFilter?: { enabled?: boolean; min?: number; max?: number; includeSupp?: boolean },
  // NEW: optional pattern constraints (low/high/odd/even + sum tolerance)
  patternOptions?: {
    constraints?: { low: number; high: number; odd: number; even: number; sum: number }[];
    mode?: 'boost' | 'restrict';
    boostFactor?: number;
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
    /** Maximum count allowed in the 6 main numbers only; undefined = off */
    maxMainCount?: number;
  },
  mainZeroOptions?: MainDigitConstraintOptions,
  mainFiveOptions?: MainDigitConstraintOptions,
  mainOneOptions?: MainDigitConstraintOptions,
  mainTwoOptions?: MainDigitConstraintOptions,
  mainThreeOptions?: MainDigitConstraintOptions,
  mainFourOptions?: MainDigitConstraintOptions,
  mainSixOptions?: MainDigitConstraintOptions,
  mainSevenOptions?: MainDigitConstraintOptions,
  mainEightOptions?: MainDigitConstraintOptions,
  mainNineOptions?: MainDigitConstraintOptions,
  digitWidthConstraint?: DigitWidthConstraintConfig,
  // NEW: constructive monthly bucket fill (from latest month buckets)
  monthlyBucketOptions?: {
    constraints: { undrawn: number; times1: number; times2: number; times3: number; times4: number; times5: number; times6: number; times7: number; times8: number };
    buckets: { undrawn: Set<number>; times1: Set<number>; times2: Set<number>; times3: Set<number>; times4: Set<number>; times5: Set<number>; times6: Set<number>; times7: Set<number>; times8: Set<number> };
    allowShortfall?: boolean;
    /** When true, exclude undrawn numbers and boost drawn numbers' weights */
    boostPenalize?: boolean;
    selectedNumbersByBucket?: { undrawn: number[]; times1: number[]; times2: number[]; times3: number[]; times4: number[]; times5: number[]; times6: number[]; times7: number[]; times8: number[] };
    selectedNumberBiasEnabled?: boolean;
  },
  attemptMultiplier?: number,
  ogaSpokeCount?: number,
  /** When set, reject candidates with more than this many numbers matching the last draw. */
  maxLastDrawMatches?: number,
  /** Per-number boost weights from monthly repeat bias (once-drawn numbers get boosted). */
  monthlyRepeatBiasWeights?: Record<number, number>,
  mainDecadeBiases?: MainDecadeBiases,
  /** Per-number month-end carry-over weighting for active early-month candidates. */
  monthEndCarryOverWeights?: Record<number, number>,
  /** Optional diagnostic scoring profile used as evidence weighting during construction. */
  scoringGenerationProfile?: ScoringGenerationProfile,
  /** User-enabled D1 terminal momentum soft generation influence. */
  d1TerminalMomentumProfile?: D1TerminalMomentumGenerationProfile,
  /** Optional progress callback used by the worker to expose accepted partial results. */
  progressSetter?: GenerateCandidatesProgressSetter,
  /** Default-off experimental rule requiring at least one eligible latest-draw +/-1 support number. */
  latestNeighbourSupportOptions?: LatestNeighbourSupportOptions,
  /** Default-off strict drought-break shortlist quota, optionally advised by SDSR. */
  strictDroughtQuotaOptions?: StrictDroughtQuotaGenerationOptions,
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
  const seenKeys = new Set<string>();
  let attempts = 0;
  const oddEvenQuotas = selectedOddEvenRatios.length > 0
    ? buildOddEvenRatioQuotas(num, selectedOddEvenRatios, ratioOptions)
    : {};
  const oddEvenQuotaCounts: Record<string, number> = {};

  const selectedBoostSet = new Set<number>((selectedNumbersForBoost ?? []).filter(n => n >= 1 && n <= 45));
  const boostFactorRaw = selectedBoostOptions?.factor ?? 1;
  const boostFactor = Math.max(1, Number.isFinite(boostFactorRaw) ? boostFactorRaw : 1);
  const boostEnabled = !!selectedBoostOptions?.enabled && boostFactor > 1 && selectedBoostSet.size > 0;
  const spokeCount = Math.max(1, Math.floor(ogaSpokeCount ?? DEFAULT_OGA_SPOKES));
  const finitePastOGAScores = (pastOGAScores ?? []).filter(Number.isFinite);
  const normalizedMinOGAPercentile = Math.max(0, Math.min(100, Number.isFinite(minOGAPercentile) ? minOGAPercentile : 0));
  const minOGAFloorEnabled = normalizedMinOGAPercentile > 0 && finitePastOGAScores.length > 0;
  if (minOGAFloorEnabled) {
    traceSetter(
      `[TRACE] OGA percentile floor enabled: minimum=${normalizedMinOGAPercentile.toFixed(1)}% reference=${finitePastOGAScores.length} scores`
    );
  }

  const stats = {
    entropy: 0,
    hamming: 0,
    jaccard: 0,
    oddEven: 0,
    tricky: 0,
    minRecent: 0,
    maxLastDraw: 0,
    recentBias: 0,
    repeatUnion: 0,
    latestNeighbourSupport: 0,
    strictDroughtQuota: 0,
    trendRatio: 0,
    sumRange: 0,
    patternConstraint: 0,
    ogaBias: 0,
    div5: 0,
    mainZeroSet: 0,
    mainFiveSet: 0,
    mainOneSet: 0,
    mainTwoSet: 0,
    mainThreeSet: 0,
    mainFourSet: 0,
    mainSixSet: 0,
    mainSevenSet: 0,
    mainEightSet: 0,
    mainNineSet: 0,
    digitWidth: 0,
    exclusions: 0,
    totalAttempts: 0,
    accepted: 0
  };

  let lastProgressAt = 0;
  let lastProgressAccepted = 0;
  const buildResultSnapshot = (): GenerateCandidatesResult => {
    stats.totalAttempts = attempts;
    stats.accepted = candidates.length;
    const acceptedCandidates = candidates.slice(0, num);
    return {
      candidates: acceptedCandidates,
      ratioSummary: summarizeOddEvenRatios(
        acceptedCandidates,
        num,
        attempts,
        selectedOddEvenRatios.length > 0 ? oddEvenQuotas : undefined
      ),
      rejectionStats: { ...stats },
    };
  };
  const maybeEmitProgress = (force = false) => {
    if (!progressSetter || candidates.length === 0) return;
    const now = Date.now();
    const acceptedSinceLast = candidates.length - lastProgressAccepted;
    if (!force && candidates.length !== 1 && acceptedSinceLast < 25 && now - lastProgressAt < 500) return;
    progressSetter(buildResultSnapshot());
    lastProgressAt = now;
    lastProgressAccepted = candidates.length;
  };

  const warnings: string[] = [];
  const hasSplitFiveBucketConstraint = typeof mainZeroOptions?.maxCount === 'number' || typeof mainFiveOptions?.maxCount === 'number';
  const clampMainDigitBoost = (boost: number | undefined): number => {
    const numericBoost = typeof boost === "number" ? boost : Number(boost);
    return Math.max(0, Math.min(5, Number.isFinite(numericBoost) ? numericBoost : 0));
  };
  const clampSignedDecadeBias = (bias: number | undefined): number => {
    const numericBias = typeof bias === "number" ? bias : Number(bias);
    return Math.max(-5, Math.min(5, Number.isFinite(numericBias) ? numericBias : 0));
  };
  const normalizeMainDigitBoosts = (options?: MainDigitConstraintOptions) => {
    const legacyBoost = clampMainDigitBoost(options?.boost);
    const singleDigitBoost = options?.singleDigitBoost === undefined
      ? legacyBoost
      : clampMainDigitBoost(options.singleDigitBoost);
    const twoDigitBoost = options?.twoDigitBoost === undefined
      ? legacyBoost
      : clampMainDigitBoost(options.twoDigitBoost);
    return { singleDigitBoost, twoDigitBoost };
  };
  const mainDigitBoosts: Record<number, { singleDigitBoost: number; twoDigitBoost: number }> = {
    0: normalizeMainDigitBoosts(mainZeroOptions),
    1: normalizeMainDigitBoosts(mainOneOptions),
    2: normalizeMainDigitBoosts(mainTwoOptions),
    3: normalizeMainDigitBoosts(mainThreeOptions),
    4: normalizeMainDigitBoosts(mainFourOptions),
    5: normalizeMainDigitBoosts(mainFiveOptions),
    6: normalizeMainDigitBoosts(mainSixOptions),
    7: normalizeMainDigitBoosts(mainSevenOptions),
    8: normalizeMainDigitBoosts(mainEightOptions),
    9: normalizeMainDigitBoosts(mainNineOptions),
  };
  const mainDigitBoostMultiplier = (n: number): number => {
    const boosts = mainDigitBoosts[n % 10] ?? { singleDigitBoost: 0, twoDigitBoost: 0 };
    const boost = n >= 1 && n <= 9 ? boosts.singleDigitBoost : boosts.twoDigitBoost;
    return boost > 0 ? 1 + boost * 0.5 : 1;
  };
  const hasActiveTerminalCoordinationRule = (options?: MainDigitConstraintOptions): boolean => (
    typeof options?.maxCount === "number" ||
    clampMainDigitBoost(options?.boost) > 0 ||
    clampMainDigitBoost(options?.singleDigitBoost) > 0 ||
    clampMainDigitBoost(options?.twoDigitBoost) > 0
  );
  const normalizedMainDecadeBiases: Record<'decade0x' | 'decade1x' | 'decade2x' | 'decade3x' | 'decade4x', number> = {
    decade0x: clampSignedDecadeBias(mainDecadeBiases?.decade0x),
    decade1x: clampSignedDecadeBias(mainDecadeBiases?.decade1x),
    decade2x: clampSignedDecadeBias(mainDecadeBiases?.decade2x),
    decade3x: clampSignedDecadeBias(mainDecadeBiases?.decade3x),
    decade4x: clampSignedDecadeBias(mainDecadeBiases?.decade4x),
  };
  const getDecadeKey = (n: number): keyof typeof normalizedMainDecadeBiases => {
    if (n >= 1 && n <= 9) return 'decade0x';
    if (n >= 10 && n <= 19) return 'decade1x';
    if (n >= 20 && n <= 29) return 'decade2x';
    if (n >= 30 && n <= 39) return 'decade3x';
    return 'decade4x';
  };
  const signedBiasMultiplier = (bias: number): number => {
    if (bias > 0) return 1 + bias * 0.5;
    if (bias < 0) return 1 / (1 + Math.abs(bias) * 0.5);
    return 1;
  };
  const mainDecadeBiasMultiplier = (n: number): number => {
    const bias = normalizedMainDecadeBiases[getDecadeKey(n)] ?? 0;
    return signedBiasMultiplier(bias);
  };

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
    traceSetter(`[TRACE] Repeat-mode W=${W} unionSize=${recentUnion!.size}`);
  }

  // HC3 overlap (numbers that appear in both last two draws)
  let hc3Numbers: number[] = [];
  if (knobs.enableHC3 && history.length >= 2) {
    hc3Numbers = getHC3OverlapNumbers(history);
    traceSetter(`[TRACE] HC3 enabled: overlap with last two draws -> count=${hc3Numbers.length}${hc3Numbers.length > 0 ? ` [${hc3Numbers.join(", ")}]` : ""}`);
  }

  // SDE1 filtering (primary pool & SDE1 exclusions)
  let mainPool = Array.from({ length: 45 }, (_, i) => i + 1);
  let sde1ExcludedNumbers: number[] = [];
  if (knobs.enableSDE1) {
    const { pool, trace, excludedNumbers: sdeExcl } = getSDE1FilteredPool(history);
    mainPool = pool;
    sde1ExcludedNumbers = sdeExcl;
    traceSetter(`[TRACE] ${trace}`);
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
    traceSetter(`[TRACE] Combined exclusions: ${exclusionSources.join(" + ")} -> total=${fullExcludedNumbers.length} [${fullExcludedNumbers.join(", ")}]`);
  }

  // Filter mainPool accordingly
  mainPool = mainPool.filter(n => !fullExcludedSet.has(n));

  const strictDroughtQuotaRawMin = Math.max(
    0,
    Math.min(8, Math.floor(Number(strictDroughtQuotaOptions?.minCount ?? 0))),
  );
  const strictDroughtQuotaNumbers = Array.from(
    new Set((strictDroughtQuotaOptions?.shortlist ?? [])
      .map((number) => Math.round(Number(number)))
      .filter((number) => number >= 1 && number <= 45 && !fullExcludedSet.has(number)))
  );
  const strictDroughtQuotaMin = strictDroughtQuotaOptions?.enabled
    ? Math.min(strictDroughtQuotaRawMin, strictDroughtQuotaNumbers.length, 8)
    : 0;
  const strictDroughtQuotaActive = strictDroughtQuotaMin > 0 && strictDroughtQuotaNumbers.length > 0;
  const strictDroughtQuotaSet = new Set(strictDroughtQuotaNumbers);
  const strictDroughtQuotaMultiplier = (n: number): number => {
    if (!strictDroughtQuotaActive) return 1;
    const raw = strictDroughtQuotaOptions?.rankMultipliers?.[n] ?? 1;
    return Math.max(0.1, Math.min(4, Number.isFinite(raw) ? raw : 1));
  };
  if (strictDroughtQuotaOptions?.enabled) {
    if (strictDroughtQuotaRawMin > strictDroughtQuotaMin) {
      traceSetter(
        `[TRACE] Strict drought quota requested minimum ${strictDroughtQuotaRawMin}, effective minimum ${strictDroughtQuotaMin} after exclusions/current shortlist size.`
      );
    }
    if (strictDroughtQuotaActive) {
      traceSetter(
        `[TRACE] Strict drought quota active: minimum ${strictDroughtQuotaMin} from current shortlist ${strictDroughtQuotaNumbers.length}${strictDroughtQuotaOptions.sourceLabel ? ` (${strictDroughtQuotaOptions.sourceLabel})` : ""} [${strictDroughtQuotaNumbers.join(", ")}]`
      );
    } else {
      traceSetter("[TRACE] Strict drought quota enabled but inactive: no eligible shortlist numbers or quota is 0.");
    }
  }

  const latestNeighbourSupport = analyzeLatestNeighbourSupport(history, monthlyBucketOptions?.buckets, {
    ...latestNeighbourSupportOptions,
    terminalRuleActive: {
      0: hasActiveTerminalCoordinationRule(mainZeroOptions),
      5: hasActiveTerminalCoordinationRule(mainFiveOptions),
    },
    excludedNumbers: fullExcludedNumbers,
  });
  const latestNeighbourSupportSet = new Set(latestNeighbourSupport.targetNumbers);
  if (latestNeighbourSupport.enabled) {
    traceSetter(`[TRACE] ${latestNeighbourSupport.traceSummary}`);
    for (const warning of latestNeighbourSupport.warnings) {
      traceSetter(`[TRACE] ${LATEST_NEIGHBOUR_SUPPORT_TRACE_TAG} warning: ${warning}`);
    }
  }

  // Monthly bucket boost/penalize: exclude undrawn numbers, boost drawn numbers
  const monthlyBoostMap = new Map<number, number>(); // number -> boost multiplier
  if (monthlyBucketOptions?.boostPenalize && monthlyBucketOptions.buckets) {
    const { buckets } = monthlyBucketOptions;
    // Exclude undrawn numbers from mainPool
    const undrawnSet = buckets.undrawn;
    const beforeSize = mainPool.length;
    mainPool = mainPool.filter(n => !undrawnSet.has(n));
    const excluded = beforeSize - mainPool.length;
    if (excluded > 0) {
      traceSetter(`[TRACE] Monthly boost/penalize: excluded ${excluded} undrawn numbers from pool`);
    }
    // Assign boost multipliers based on bucket frequency (higher frequency = stronger boost)
    // times1 → 1.2x, times2 → 1.4x, times3 → 1.6x, ... times8 → 2.0x
    const boostTiers: [keyof typeof buckets, number][] = [
      ['times1', 1.2], ['times2', 1.4], ['times3', 1.6], ['times4', 1.8],
      ['times5', 2.0], ['times6', 2.2], ['times7', 2.4], ['times8', 2.6],
    ];
    let boostedCount = 0;
    for (const [key, mult] of boostTiers) {
      for (const n of buckets[key]) {
        if (!fullExcludedSet.has(n)) {
          monthlyBoostMap.set(n, mult);
          boostedCount++;
        }
      }
    }
    if (boostedCount > 0) {
      traceSetter(`[TRACE] Monthly boost/penalize: boosted ${boostedCount} drawn numbers (1.2x–2.6x by frequency tier)`);
    }
  }

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
    traceSetter(`[TRACE] Lambda weighting enabled: λ=${lambda.toFixed(2)} maxWeight=${maxRecency.toFixed(2)} (recent numbers get higher sampling weight)`);
  } else {
    traceSetter(`[TRACE] Lambda weighting disabled or no history; sampling is uniform aside from boosts.`);
  }
  const recencyFactor = (n: number) => {
    if (maxRecency <= 0) return 1;
    const norm = recencyScores[n] / maxRecency;
    // Keep floor >0 so unseen numbers still possible
    return 0.5 + 0.5 * norm;
  };

  const gpwfFactors = Array(46).fill(1);
  if (knobs.enableGPWF && history.length > 0) {
    const gpwfWindow = Math.max(0, Math.min(knobs.gpwf_window_size, history.length));
    const gpwfCounts = Array(46).fill(0);
    for (const draw of history.slice(-gpwfWindow)) {
      [...draw.main, ...draw.supp].forEach((n) => {
        if (n >= 1 && n <= 45) gpwfCounts[n] += 1;
      });
    }
    const maxGPWFCount = Math.max(...gpwfCounts);
    for (let n = 1; n <= 45; n++) {
      const norm = maxGPWFCount > 0 ? gpwfCounts[n] / maxGPWFCount : 0;
      const raw = knobs.gpwf_floor + knobs.gpwf_scale_multiplier * (norm + knobs.gpwf_bias_factor);
      gpwfFactors[n] = Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : 1));
    }
    traceSetter(`[TRACE] GPWF weighting enabled: window=${gpwfWindow}, maxRecentFrequency=${maxGPWFCount}`);
  }

  // Remove excluded numbers from boost set (guardrail)
  if (boostEnabled) {
    for (const n of Array.from(selectedBoostSet)) {
      if (fullExcludedSet.has(n)) selectedBoostSet.delete(n);
    }
    if (selectedBoostSet.size === 0) {
      traceSetter("[TRACE] Selected boost disabled: all selected numbers are excluded.");
    } else {
      traceSetter(`[TRACE] Selected boost enabled: factor ${boostFactor} on ${selectedBoostSet.size} numbers`);
    }
  }

  // Prevent forced numbers from re-introducing excluded numbers
  const forcedClean = forcedNumbers.filter(n => !fullExcludedSet.has(n));
  if (forcedClean.length !== forcedNumbers.length) {
    const removed = forcedNumbers.filter(n => fullExcludedSet.has(n));
    traceSetter(`[TRACE] Forced numbers intersected exclusions; removed: [${removed.join(", ")}]`);
  }

  // Pre-calc last draw for quick overlap metrics
  const lastDraw = getMostRecentDraw(history);
  const lastDrawSet = lastDraw
    ? new Set([...lastDraw.main, ...lastDraw.supp])
    : null;

  // Hostile penalty for recent draw numbers: when minRecentMatches === 0 and
  // recentMatchBias > 0, penalise numbers from the most recent draw during
  // weighted pool construction (reduce their sampling weight, but never fully
  // exclude them).  Penalty factor = 1 / (1 + recentMatchBias), e.g.
  //   bias 0   → factor 1.0  (no penalty)
  //   bias 0.5 → factor 0.67
  //   bias 1   → factor 0.50
  //   bias 5   → factor 0.17
  const hostileRecent =
    minRecentMatches === 0 && recentMatchBias > 0 && lastDrawSet != null;
  const hostilePenalty = hostileRecent ? 1 / (1 + recentMatchBias) : 1;

  if (hostileRecent) {
    traceSetter(
      `[TRACE] Hostile-recent enabled: recentMatchBias=${recentMatchBias}, ` +
        `penalty factor=${hostilePenalty.toFixed(3)} applied to ${lastDrawSet!.size} last-draw numbers`
    );
  }

  if (monthlyRepeatBiasWeights) {
    const boostedEntries = Object.entries(monthlyRepeatBiasWeights)
      .filter(([, v]) => v > 1)
      .sort(([a], [b]) => Number(a) - Number(b));
    const boostedNums = boostedEntries.map(([k]) => Number(k));
    // Group by factor for a compact summary
    const byFactor = new Map<number, number[]>();
    for (const [k, v] of boostedEntries) {
      const list = byFactor.get(v) ?? [];
      list.push(Number(k));
      byFactor.set(v, list);
    }
    const summary = Array.from(byFactor.entries())
      .sort(([a], [b]) => b - a)
      .map(([factor, nums]) => `${factor}x → [${nums.join(', ')}]`)
      .join(' | ');
    traceSetter(
      `[TRACE] Monthly repeat bias enabled: ${boostedNums.length} numbers boosted | ${summary}`
    );
  }
  const activeMonthEndCarryOverEntries = Object.entries(monthEndCarryOverWeights ?? {})
    .map(([key, value]) => ({ number: Number(key), factor: Number(value) }))
    .filter(({ number, factor }) => number >= 1 && number <= 45 && Number.isFinite(factor) && Math.abs(factor - 1) > 1e-9)
    .sort((left, right) => right.factor - left.factor || left.number - right.number);
  if (activeMonthEndCarryOverEntries.length > 0) {
    traceSetter(
      `[TRACE] Month-end carry-over weighting enabled: ${activeMonthEndCarryOverEntries.length} active number${activeMonthEndCarryOverEntries.length === 1 ? "" : "s"} | ${activeMonthEndCarryOverEntries
        .slice(0, 12)
        .map(({ number, factor }) => `${number}×${factor.toFixed(2)}`)
        .join(", ")}`
    );
  }
  if (scoringGenerationProfile?.enabled) {
    traceSetter(`[TRACE] ${scoringGenerationProfile.traceLabel}`);
  }
  if (d1TerminalMomentumProfile?.userEnabled) {
    traceSetter(`[TRACE] ${d1TerminalMomentumProfile.traceLabel}`);
  }

  const activeMainDigitBoosts = Object.entries(mainDigitBoosts)
    .flatMap(([digit, boosts]) => {
      const activeBoosts: Array<{ digit: number; scope: 'single-digit' | 'two-digit'; boost: number }> = [];
      if (boosts.singleDigitBoost > 0) activeBoosts.push({ digit: Number(digit), scope: 'single-digit', boost: boosts.singleDigitBoost });
      if (boosts.twoDigitBoost > 0) activeBoosts.push({ digit: Number(digit), scope: 'two-digit', boost: boosts.twoDigitBoost });
      return activeBoosts;
    })
    .sort((a, b) => a.digit - b.digit || a.scope.localeCompare(b.scope));
  if (activeMainDigitBoosts.length > 0) {
    traceSetter(
      `[TRACE] Ending-digit boosts enabled: ${activeMainDigitBoosts
        .map(({ digit, scope, boost }) => `bucket ${digit} ${scope} +${boost}`)
        .join(", ")} (affects main + supp picks; 1–5 = 1.5x–3.5x weight)`
    );
  }
  const activeMainDecadeBiases = Object.entries(normalizedMainDecadeBiases)
    .map(([bucketKey, bias]) => ({ bucketKey, bias }))
    .filter(({ bias }) => bias !== 0);
  if (activeMainDecadeBiases.length > 0) {
    traceSetter(
      `[TRACE] Digit decade bias enabled: ${activeMainDecadeBiases
        .map(({ bucketKey, bias }) => `${bucketKey.replace('decade', '')}:${bias > 0 ? `+${bias}` : bias}`)
        .join(', ')} (affects main + supp picks; positive boosts, negative punishes)`
    );
  }
  const digitWidthTargets = deriveDigitWidthTargets(digitWidthConstraint);
  if (digitWidthTargets.enabled) {
    traceSetter(
      `[TRACE] Digit-width rule enabled: ${digitWidthTargets.singleDigitPercent}% single-digit / ${digitWidthTargets.twoDigitPercent}% two-digit | ${formatDigitWidthScopeLabel(digitWidthTargets.scope)} | strict target ${digitWidthTargets.singleDigitCount} single-digit + ${digitWidthTargets.twoDigitCount} two-digit`
    );
  }
  const monthlySelectedNumbersByBucket = monthlyBucketOptions?.selectedNumbersByBucket;
  const monthlySelectedNumberBiasEnabled = !!monthlyBucketOptions?.selectedNumberBiasEnabled && !!monthlySelectedNumbersByBucket;
  if (monthlySelectedNumberBiasEnabled && monthlySelectedNumbersByBucket) {
    const bucketTraceLabels: Record<MonthlyBucketKey, string> = {
      undrawn: "und",
      times1: "1x",
      times2: "2x",
      times3: "3x",
      times4: "4x",
      times5: "5x",
      times6: "6x",
      times7: "7x",
      times8: "8x+",
    };
    const selectionSummary = MONTHLY_BUCKET_KEYS
      .map((bucketKey) => ({ bucketKey, count: monthlySelectedNumbersByBucket[bucketKey]?.length ?? 0 }))
      .filter(({ count }) => count > 0)
      .map(({ bucketKey, count }) => `${bucketTraceLabels[bucketKey]}:${count}`)
      .join(" ");
    if (selectionSummary) {
      traceSetter(
        `[TRACE] Monthly constructive selected-number bias enabled: ${MONTHLY_SELECTED_NUMBER_BIAS_REPEATS}x weight for clicked bucket numbers | ${selectionSummary} | favoured, not forced`
      );
    }
  }

  const buildWeightedPool = (pool: number[], applyMainDigitBoosts: boolean = false) => {
    const out: number[] = [];
    for (const n of pool) {
      let factor = recencyFactor(n);
      factor *= gpwfFactors[n] ?? 1;
      if (applyMainDigitBoosts) {
        factor *= mainDigitBoostMultiplier(n);
        factor *= mainDecadeBiasMultiplier(n);
      }
      if (boostEnabled && selectedBoostSet.has(n)) {
        factor *= Math.max(1, boostFactor);
      }
      // Monthly bucket boost (drawn numbers get frequency-tier boost)
      const monthlyMult = monthlyBoostMap.get(n);
      if (monthlyMult) {
        factor *= monthlyMult;
      }
      // Hostile penalty: reduce weight of numbers from the most recent draw.
      // When the factor drops below 1.0 use fractional probability so the
      // Hostile penalty: reduce weight of numbers from the most recent draw.
      if (hostileRecent && lastDrawSet!.has(n)) {
        factor *= hostilePenalty;
      }
      // Monthly repeat bias: boost numbers drawn exactly once this month
      if (monthlyRepeatBiasWeights) {
        const repBias = monthlyRepeatBiasWeights[n] ?? 1;
        if (repBias !== 1) factor *= repBias;
      }
      const carryOverBias = monthEndCarryOverWeights?.[n] ?? 1;
      if (carryOverBias !== 1) {
        factor *= carryOverBias;
      }
      factor *= scoringInfluenceMultiplier(n, scoringGenerationProfile);
      factor *= d1TerminalMomentumMultiplier(n, d1TerminalMomentumProfile);
      if (latestNeighbourSupport.active && latestNeighbourSupportSet.has(n)) {
        factor *= latestNeighbourSupport.supportBoostFactor;
      }
      if (strictDroughtQuotaActive && strictDroughtQuotaSet.has(n)) {
        factor *= strictDroughtQuotaMultiplier(n);
      }
      if (factor < 1) {
        // Probabilistic inclusion: e.g. factor=0.3 → 30 % chance of 1 rep
        if (Math.random() < factor) out.push(n);
      } else {
        const reps = Math.max(1, Math.round(factor));
        for (let i = 0; i < reps; i++) out.push(n);
      }
    }
    return out;
  };

  // Weighted sampling without replacement (drops all copies of a drawn number)
  const drawWeightedUnique = (pool: number[], needed: number, applyMainDigitBoosts: boolean = false): number[] => {
    if (needed <= 0 || pool.length === 0) return [];
    let weighted = buildWeightedPool(pool, applyMainDigitBoosts);
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

  const drawDigitWidthConstrainedUnique = (
    pool: number[],
    singleDigitNeeded: number,
    twoDigitNeeded: number,
    applyMainDigitBoosts: boolean = false,
  ): number[] | null => {
    if (singleDigitNeeded < 0 || twoDigitNeeded < 0) return null;
    const singleDigitPool = pool.filter((n) => n >= 1 && n <= 9);
    const twoDigitPool = pool.filter((n) => n >= 10 && n <= 45);
    if (singleDigitPool.length < singleDigitNeeded || twoDigitPool.length < twoDigitNeeded) return null;

    const singleDigitPicks = drawWeightedUnique(singleDigitPool, singleDigitNeeded, applyMainDigitBoosts);
    if (singleDigitPicks.length !== singleDigitNeeded) return null;

    const twoDigitPicks = drawWeightedUnique(twoDigitPool, twoDigitNeeded, applyMainDigitBoosts);
    if (twoDigitPicks.length !== twoDigitNeeded) return null;

    return [...singleDigitPicks, ...twoDigitPicks];
  };

  const shuffledIntegerRange = (min: number, max: number): number[] => {
    const values = Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => min + index);
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
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

  const sampleMonthlyBucketWithSelectionBias = (
    pool: number[],
    k: number,
    preferredSet: ReadonlySet<number>
  ): number[] => {
    if (k <= 0 || pool.length === 0) return [];
    if (preferredSet.size === 0) return sampleWithoutReplacement(pool, k);
    let weighted: number[] = [];
    for (const n of pool) {
      const selectedBias = preferredSet.has(n) ? MONTHLY_SELECTED_NUMBER_BIAS_REPEATS : 1;
      const carryOverBias = Math.max(0.1, monthEndCarryOverWeights?.[n] ?? 1);
      const scoringBias = scoringInfluenceMultiplier(n, scoringGenerationProfile);
      const d1TerminalBias = d1TerminalMomentumMultiplier(n, d1TerminalMomentumProfile);
      const strictDroughtBias = strictDroughtQuotaActive && strictDroughtQuotaSet.has(n) ? strictDroughtQuotaMultiplier(n) : 1;
      const reps = Math.max(1, Math.round(selectedBias * carryOverBias * scoringBias * d1TerminalBias * strictDroughtBias));
      for (let i = 0; i < reps; i++) weighted.push(n);
    }
    const picked: number[] = [];
    while (picked.length < k && weighted.length > 0) {
      const idx = Math.floor(Math.random() * weighted.length);
      const val = weighted[idx];
      picked.push(val);
      weighted = weighted.filter((n) => n !== val);
    }
    return picked;
  };

  // Pre-compute supp base pool: 1-45 minus static exclusions (constant across iterations)
  // Also exclude monthly-undrawn numbers when boostPenalize is active
  const monthlyUndrawnSet = monthlyBucketOptions?.boostPenalize ? monthlyBucketOptions.buckets.undrawn : null;
  const suppBasePool = Array.from({ length: 45 }, (_, i) => i + 1)
    .filter(n => !fullExcludedSet.has(n) && !(monthlyUndrawnSet?.has(n)));

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
      const tryFill = (bucketKey: MonthlyBucketKey, needed: number) => {
        if (needed <= 0) return;
        if (main.length + supp.length >= maxSlots) return;
        const avail = Array.from(buckets[bucketKey]).filter((n) =>
          !fullExcludedSet.has(n) && !main.includes(n) && !supp.includes(n)
        );
        const take = Math.min(needed, avail.length, maxSlots - main.length - supp.length);
        if (take <= 0) return;
        const preferredSet = monthlySelectedNumberBiasEnabled
          ? new Set((monthlySelectedNumbersByBucket?.[bucketKey] ?? []).filter((n) => avail.includes(n)))
          : new Set<number>();
        const picks = sampleMonthlyBucketWithSelectionBias(avail, take, preferredSet);
        for (const n of picks) {
          if (main.length < 6) main.push(n);
          else if (supp.length < 2) supp.push(n);
        }
      };
      for (const bucketKey of MONTHLY_BUCKET_KEYS) {
        tryFill(bucketKey, constraints[bucketKey]);
      }
    }

    if (strictDroughtQuotaActive) {
      const seededHits = [...main, ...supp].filter((n) => strictDroughtQuotaSet.has(n)).length;
      const remainingNeeded = strictDroughtQuotaMin - seededHits;
      if (remainingNeeded > 0) {
        const availableSlots = 8 - main.length - supp.length;
        if (availableSlots < remainingNeeded) {
          stats.strictDroughtQuota++;
          continue;
        }
        const strictPool = strictDroughtQuotaNumbers.filter((n) => !main.includes(n) && !supp.includes(n));
        const strictPicks = drawWeightedUnique(strictPool, remainingNeeded, true);
        if (strictPicks.length < remainingNeeded) {
          stats.strictDroughtQuota++;
          continue;
        }
        for (const n of strictPicks) {
          if (main.length < 6) main.push(n);
          else if (supp.length < 2) supp.push(n);
        }
      }
    }

    if (digitWidthTargets.enabled) {
      const countedSeedNumbers = digitWidthTargets.scope === "mainAndSupp" ? [...main, ...supp] : main;
      const seedSingleCount = countSingleDigitNumbers(countedSeedNumbers);
      const seedTwoDigitCount = countedSeedNumbers.length - seedSingleCount;
      if (seedSingleCount > digitWidthTargets.singleDigitCount || seedTwoDigitCount > digitWidthTargets.twoDigitCount) {
        stats.digitWidth++;
        continue;
      }
    }

    if (digitWidthTargets.enabled && digitWidthTargets.scope === "mainAndSupp") {
      const countedSeedNumbers = [...main, ...supp];
      const seedSingleCount = countSingleDigitNumbers(countedSeedNumbers);
      const seedTwoDigitCount = countedSeedNumbers.length - seedSingleCount;
      const totalSingleNeeded = digitWidthTargets.singleDigitCount - seedSingleCount;
      const totalTwoDigitNeeded = digitWidthTargets.twoDigitCount - seedTwoDigitCount;
      const mainSlots = 6 - main.length;
      const suppSlots = 2 - supp.length;
      const minMainSingleDigits = Math.max(0, totalSingleNeeded - suppSlots);
      const maxMainSingleDigits = Math.min(mainSlots, totalSingleNeeded);
      const mainSingleDigitOptions = shuffledIntegerRange(minMainSingleDigits, maxMainSingleDigits);
      let filledDigitWidthCandidate = false;

      for (const mainSingleDigitsNeeded of mainSingleDigitOptions) {
        const mainTwoDigitsNeeded = mainSlots - mainSingleDigitsNeeded;
        const suppSingleDigitsNeeded = totalSingleNeeded - mainSingleDigitsNeeded;
        const suppTwoDigitsNeeded = totalTwoDigitNeeded - mainTwoDigitsNeeded;
        if (mainTwoDigitsNeeded < 0 || suppSingleDigitsNeeded < 0 || suppTwoDigitsNeeded < 0) continue;

        const restPool = mainPool.filter((n) => !main.includes(n) && !supp.includes(n));
        const drawnMain = drawDigitWidthConstrainedUnique(
          restPool,
          mainSingleDigitsNeeded,
          mainTwoDigitsNeeded,
          true,
        );
        if (!drawnMain || drawnMain.length !== mainSlots) continue;

        const candidateMain = [...main, ...drawnMain];
        const usedAfterMain = new Set([...candidateMain, ...supp]);
        const suppPool = suppBasePool.filter((n) => !usedAfterMain.has(n));
        const drawnSupp = drawDigitWidthConstrainedUnique(
          suppPool,
          suppSingleDigitsNeeded,
          suppTwoDigitsNeeded,
          true,
        );
        if (!drawnSupp || drawnSupp.length !== suppSlots) continue;

        main = candidateMain;
        supp = [...supp, ...drawnSupp];
        filledDigitWidthCandidate = true;
        break;
      }

      if (!filledDigitWidthCandidate) {
        stats.digitWidth++;
        continue;
      }
    } else {
      const mainSlots = 6 - main.length;
      if (digitWidthTargets.enabled && digitWidthTargets.scope === "main") {
        const seedSingleCount = countSingleDigitNumbers(main);
        const seedTwoDigitCount = main.length - seedSingleCount;
        const singleDigitsNeeded = digitWidthTargets.singleDigitCount - seedSingleCount;
        const twoDigitsNeeded = digitWidthTargets.twoDigitCount - seedTwoDigitCount;
        const restPool = mainPool.filter((n) => !main.includes(n) && !supp.includes(n));
        const drawnMain = drawDigitWidthConstrainedUnique(
          restPool,
          singleDigitsNeeded,
          twoDigitsNeeded,
          true,
        );
        if (!drawnMain || drawnMain.length !== mainSlots) {
          stats.digitWidth++;
          continue;
        }
        main = [...main, ...drawnMain];
      } else {
        const restPool = mainPool.filter((n) => !main.includes(n) && !supp.includes(n));
        const drawnMain = drawWeightedUnique(restPool, mainSlots, true);
        main = [...main, ...drawnMain];
      }
      if (main.length < 6) { stats.exclusions++; continue; }

      // Build supp pool (exclude already used; static exclusions already removed in suppBasePool)
      const usedSet = new Set([...main, ...supp]);
      const suppPool = suppBasePool.filter(n => !usedSet.has(n));
      const drawnSupp = drawWeightedUnique(suppPool, 2 - supp.length, true);
      supp = [...supp, ...drawnSupp];
      if (supp.length < 2) { stats.exclusions++; continue; }
    }

    main.sort((a, b) => a - b);
    supp.sort((a, b) => a - b);

    const nums8 = [...main, ...supp];

    // SAFETY: Final exclusion guard (should be redundant, but ensures no leaks)
    if (nums8.some(n => fullExcludedSet.has(n))) {
      stats.exclusions++;
      continue;
    }
    if (new Set(nums8).size !== nums8.length) {
      stats.exclusions++;
      continue;
    }
    if (strictDroughtQuotaActive) {
      const strictHits = nums8.filter((n) => strictDroughtQuotaSet.has(n)).length;
      if (strictHits < strictDroughtQuotaMin) {
        stats.strictDroughtQuota++;
        continue;
      }
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

    // NEW: ending-digit constraints across the full candidate (main + supp)
    const maxMainDiv5Count = div5Options?.maxMainCount;
    const digitConstraintNumbers = nums8;
    const candidateDiv5Count = digitConstraintNumbers.filter(n => n % 5 === 0).length;
    if (!hasSplitFiveBucketConstraint && typeof maxMainDiv5Count === 'number' && maxMainDiv5Count >= 0 && candidateDiv5Count > maxMainDiv5Count) {
      stats.div5++;
      continue;
    }

    const mainDigitConstraints = [
      { digit: 0, maxCount: mainZeroOptions?.maxCount, statKey: "mainZeroSet" as const },
      { digit: 5, maxCount: mainFiveOptions?.maxCount, statKey: "mainFiveSet" as const },
      { digit: 1, maxCount: mainOneOptions?.maxCount, statKey: "mainOneSet" as const },
      { digit: 2, maxCount: mainTwoOptions?.maxCount, statKey: "mainTwoSet" as const },
      { digit: 3, maxCount: mainThreeOptions?.maxCount, statKey: "mainThreeSet" as const },
      { digit: 4, maxCount: mainFourOptions?.maxCount, statKey: "mainFourSet" as const },
      { digit: 6, maxCount: mainSixOptions?.maxCount, statKey: "mainSixSet" as const },
      { digit: 7, maxCount: mainSevenOptions?.maxCount, statKey: "mainSevenSet" as const },
      { digit: 8, maxCount: mainEightOptions?.maxCount, statKey: "mainEightSet" as const },
      { digit: 9, maxCount: mainNineOptions?.maxCount, statKey: "mainNineSet" as const },
    ];
    let failedMainDigitConstraint = false;
    for (const { digit, maxCount, statKey } of mainDigitConstraints) {
      if (typeof maxCount !== 'number' || maxCount < 0) continue;
      const digitCount = digitConstraintNumbers.filter(n => n % 10 === digit).length;
      if (digitCount > maxCount) {
        stats[statKey]++;
        failedMainDigitConstraint = true;
        break;
      }
    }
    if (failedMainDigitConstraint) continue;

    if (digitWidthTargets.enabled) {
      const countedNumbers = digitWidthTargets.scope === "mainAndSupp" ? nums8 : main;
      const singleDigitCount = countSingleDigitNumbers(countedNumbers);
      const twoDigitCount = countedNumbers.length - singleDigitCount;
      if (singleDigitCount !== digitWidthTargets.singleDigitCount || twoDigitCount !== digitWidthTargets.twoDigitCount) {
        stats.digitWidth++;
        continue;
      }
    }

    let oddEvenRatio: string | null = null;

    // Odd/Even ratio quota filter
    if (selectedOddEvenRatios.length > 0) {
      const odd = nums8.filter(n => n % 2 === 1).length;
      oddEvenRatio = `${odd}:${8 - odd}`;
      const quota = oddEvenQuotas[oddEvenRatio] ?? 0;
      if (quota <= 0 || (oddEvenQuotaCounts[oddEvenRatio] ?? 0) >= quota) { stats.oddEven++; continue; }
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

    if (!candidateSatisfiesLatestNeighbourSupport(nums8, latestNeighbourSupport)) {
      stats.latestNeighbourSupport++;
      continue;
    }

    // Recent match constraints
    if (lastDrawSet) {
      const matches = nums8.filter(n => lastDrawSet.has(n)).length;
      if (minRecentMatches > 0 && matches < minRecentMatches) {
        stats.minRecent++; continue;
      }
      // Maximum matches to last draw: reject if candidate shares too many numbers
      if (maxLastDrawMatches !== undefined && matches > maxLastDrawMatches) {
        stats.maxLastDraw++; continue;
      }
      // Pro-recency soft filter: only when minRecentMatches > 0 (user wants
      // recent overlap).  When minRecentMatches === 0 the hostile penalty in
      // buildWeightedPool already discourages recent-draw numbers, so the
      // pro-recency filter is skipped to avoid contradiction.
      //
      // Formula: prob = (1 - bias) + bias * (matches / 8)
      //   bias=0 → prob=1 for all candidates (no filtering beyond minRecentMatches)
      //   bias=1 → prob scales linearly with overlap (strong preference)
      //   bias=0.1 → very mild preference (mostly uniform acceptance)
      if (recentMatchBias > 0 && minRecentMatches > 0) {
        const prob = Math.min(1, (1 - recentMatchBias) + recentMatchBias * (matches / 8));
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
    const candidateMainMask = (knobs.enableHamming || knobs.enableJaccard) ? toBitmask(main) : 0n;
    if (knobs.enableHamming && minHammingBit(candidateMainMask, main.length, histBitmasks) < hammingThreshold) { stats.hamming++; continue; }
    if (knobs.enableJaccard && maxJaccardBit(candidateMainMask, main.length, histBitmasks) > jaccardThreshold) { stats.jaccard++; continue; }

    let candidateOGA: number | null = null;
    if (ogaBiasOptions?.enabled || minOGAFloorEnabled) {
      candidateOGA = computeOGA(nums8, history, spokeCount);
    }

    // OGA forecast bias acceptance — deterministic by raw candidate OGA vs bands/deciles
    if (ogaBiasOptions?.enabled && candidateOGA !== null) {
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
        traceSetter(`[TRACE] OGA decile check: OGA=${candidateOGA.toFixed(2)} → D${idx} weight=${w} prob=${prob.toFixed(2)} sel=${selList}`);
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

    if (minOGAFloorEnabled && candidateOGA !== null) {
      const percentile = getOGAPercentile(candidateOGA, finitePastOGAScores);
      if (percentile < normalizedMinOGAPercentile) {
        stats.ogaBias++;
        continue;
      }
    }

    // ACCEPT
    // Deduplicate: reject if this exact main+supp combo was already accepted
    const candidateKey = `${main.join(',')};${supp.join(',')}`;
    if (seenKeys.has(candidateKey)) { continue; }
    seenKeys.add(candidateKey);

    let patternMatches = 0;
    if (patternOptions?.constraints?.length) {
      const pat = computeCandidatePattern(main, supp);
      const sumTol = Math.max(0, patternOptions?.sumTolerance ?? 0);
      patternMatches = matchesAnyPattern(pat, patternOptions.constraints, sumTol);
    }
    const candidate: CandidateSet = { main, supp, patternMatches };
    if (scoringGenerationProfile?.enabled) {
      const scoringEvidence = scoreCandidateWithScoringProfile(candidate, scoringGenerationProfile);
      candidate.scoreEvidence = scoringEvidence.normalizedScore;
      candidate.scoreEvidenceTrace = scoringEvidence.trace;
      if (scoringEvidence.trace.length > 0) {
        candidate.trace = [...(candidate.trace ?? []), ...scoringEvidence.trace];
      }
    }
    if (d1TerminalMomentumProfile?.enabled) {
      const terminalMomentumEvidence = scoreD1TerminalMomentumCandidate(nums8, d1TerminalMomentumProfile);
      candidate.d1TerminalMomentumHits = terminalMomentumEvidence.hits;
      candidate.d1TerminalMomentumScore = terminalMomentumEvidence.normalizedScore;
      candidate.d1TerminalMomentumTrace = terminalMomentumEvidence.trace;
      if (terminalMomentumEvidence.trace.length > 0) {
        candidate.trace = [...(candidate.trace ?? []), ...terminalMomentumEvidence.trace];
      }
    }
    candidates.push(candidate);
    if (oddEvenRatio) {
      oddEvenQuotaCounts[oddEvenRatio] = (oddEvenQuotaCounts[oddEvenRatio] ?? 0) + 1;
    }
    stats.accepted++;
    maybeEmitProgress();
  }

  stats.totalAttempts = attempts;

  if (candidates.length < num && attempts >= maxAttempts) {
     warnings.push(`Stopped after ${attempts} attempts; generated ${candidates.length}/${num}. Consider loosening constraints (e.g., main ending-digit max rules) or increasing attempt multiplier (currently ${effectiveAttemptMultiplier}).`);
   }
  if (selectedOddEvenRatios.length > 0) {
    const shortfalls = Object.entries(oddEvenQuotas)
      .map(([ratio, quota]) => ({ ratio, missing: quota - (oddEvenQuotaCounts[ratio] ?? 0) }))
      .filter((item) => item.missing > 0);
    if (shortfalls.length > 0) {
      warnings.push(`Odd/even ratio quotas short by ${shortfalls.map((item) => `${item.ratio}:${item.missing}`).join(", ")}. Loosen filters or increase attempt multiplier to preserve the requested percentage split.`);
    }
  }
 
   // Trace ending-digit enforcement summary for debugging/visibility
   if (!hasSplitFiveBucketConstraint && typeof div5Options?.maxMainCount === 'number' && div5Options.maxMainCount >= 0) {
    traceSetter(`[TRACE] Divisible-by-5 rule: candidate max=${div5Options.maxMainCount} rejects=${stats.div5}`);
  }
   [
    { label: "0-ending candidate rule {10,20,30,40}", maxCount: mainZeroOptions?.maxCount, rejects: stats.mainZeroSet },
    { label: "5-ending candidate rule {5,15,25,35,45}", maxCount: mainFiveOptions?.maxCount, rejects: stats.mainFiveSet },
    { label: "1-ending candidate rule {1,11,21,31,41}", maxCount: mainOneOptions?.maxCount, rejects: stats.mainOneSet },
    { label: "2-ending candidate rule {2,12,22,32,42}", maxCount: mainTwoOptions?.maxCount, rejects: stats.mainTwoSet },
    { label: "3-ending candidate rule {3,13,23,33,43}", maxCount: mainThreeOptions?.maxCount, rejects: stats.mainThreeSet },
    { label: "4-ending candidate rule {4,14,24,34,44}", maxCount: mainFourOptions?.maxCount, rejects: stats.mainFourSet },
    { label: "6-ending candidate rule {6,16,26,36}", maxCount: mainSixOptions?.maxCount, rejects: stats.mainSixSet },
    { label: "7-ending candidate rule {7,17,27,37}", maxCount: mainSevenOptions?.maxCount, rejects: stats.mainSevenSet },
    { label: "8-ending candidate rule {8,18,28,38}", maxCount: mainEightOptions?.maxCount, rejects: stats.mainEightSet },
    { label: "9-ending candidate rule {9,19,29,39}", maxCount: mainNineOptions?.maxCount, rejects: stats.mainNineSet },
  ].forEach(({ label, maxCount, rejects }) => {
    if (typeof maxCount === 'number' && maxCount >= 0) {
      traceSetter(`[TRACE] ${label}: max=${maxCount} rejects=${rejects}`);
    }
  });
  if (digitWidthTargets.enabled) {
    traceSetter(
      `[TRACE] Digit-width rule: ${digitWidthTargets.singleDigitPercent}%/${digitWidthTargets.twoDigitPercent}% ${formatDigitWidthScopeLabel(digitWidthTargets.scope)} -> target ${digitWidthTargets.singleDigitCount}/${digitWidthTargets.twoDigitCount} rejects=${stats.digitWidth}`
    );
  }
  if (latestNeighbourSupport.enabled) {
    const acceptedCandidateCount = Math.max(1, candidates.length);
    const hits = candidates.reduce((sum, candidate) => {
      return sum + [...candidate.main, ...candidate.supp].filter((number) => latestNeighbourSupportSet.has(number)).length;
    }, 0);
    traceSetter(
      `[TRACE] ${LATEST_NEIGHBOUR_SUPPORT_TRACE_TAG} results: eligible=${latestNeighbourSupport.targetNumbers.length} rejects=${stats.latestNeighbourSupport} accepted-hits=${hits} (${(hits / acceptedCandidateCount).toFixed(2)} per accepted candidate)`
    );
  }
  if (strictDroughtQuotaOptions?.enabled) {
    const acceptedCandidateCount = Math.max(1, candidates.length);
    const hits = candidates.reduce((sum, candidate) => (
      sum + [...candidate.main, ...candidate.supp].filter((number) => strictDroughtQuotaSet.has(number)).length
    ), 0);
    traceSetter(
      `[TRACE] Strict drought quota results: effective minimum ${strictDroughtQuotaMin}; eligible=${strictDroughtQuotaNumbers.length}; rejects=${stats.strictDroughtQuota}; accepted-hits=${hits} (${(hits / acceptedCandidateCount).toFixed(2)} per accepted candidate)`
    );
  }
  if (activeMainDigitBoosts.length > 0) {
    const acceptedCandidateCount = Math.max(1, candidates.length);
    const boostOutcomeSummary = activeMainDigitBoosts.map(({ digit, scope, boost }) => {
      const hits = candidates.reduce((sum, candidate) => {
        const matchingHits = [...candidate.main, ...candidate.supp].filter((n) => {
          if (n % 10 !== digit) return false;
          return scope === 'single-digit' ? n >= 1 && n <= 9 : n >= 10 && n <= 45;
        }).length;
        return sum + matchingHits;
      }, 0);
      return `bucket ${digit} ${scope} boost +${boost} produced ${hits} accepted candidate hit${hits === 1 ? '' : 's'} (${(hits / acceptedCandidateCount).toFixed(2)} per candidate)`;
    }).join(' | ');
    traceSetter(`[TRACE] Ending-digit boost results: ${boostOutcomeSummary}`);
  }
  if (activeMonthEndCarryOverEntries.length > 0) {
    const acceptedCandidateCount = Math.max(1, candidates.length);
    const carryOverSummary = candidates.reduce((acc, candidate) => {
      const scored = scoreMonthEndCarryOverCandidate([...candidate.main, ...candidate.supp], monthEndCarryOverWeights);
      acc.hits += scored.hits;
      acc.score += scored.normalizedScore;
      return acc;
    }, { hits: 0, score: 0 });
    traceSetter(
      `[TRACE] Month-end carry-over results: ${carryOverSummary.hits} weighted hit${carryOverSummary.hits === 1 ? '' : 's'} across ${candidates.length} accepted candidates (${(carryOverSummary.hits / acceptedCandidateCount).toFixed(2)} per candidate, avg ranking score ${(carryOverSummary.score / acceptedCandidateCount * 100).toFixed(1)}%)`
    );
  }
  if (d1TerminalMomentumProfile?.enabled) {
    const acceptedCandidateCount = Math.max(1, candidates.length);
    const terminalMomentumSummary = candidates.reduce((acc, candidate) => {
      const evidence = scoreD1TerminalMomentumCandidate([...candidate.main, ...candidate.supp], d1TerminalMomentumProfile);
      acc.hits += evidence.hits;
      acc.score += evidence.normalizedScore;
      return acc;
    }, { hits: 0, score: 0 });
    traceSetter(
      `[TRACE] D1 Terminal Momentum SGI results: ${terminalMomentumSummary.hits} soft-weighted hit${terminalMomentumSummary.hits === 1 ? "" : "s"} across ${candidates.length} accepted candidates (${(terminalMomentumSummary.hits / acceptedCandidateCount).toFixed(2)} per candidate, avg evidence ${(terminalMomentumSummary.score / acceptedCandidateCount * 100).toFixed(1)}%)`
    );
  }

  if (DEBUG) {
    console.log('[generateCandidates] rejection stats', stats);
  }

  const acceptedCandidates = candidates.slice(0, num);
  const ratioSummary = summarizeOddEvenRatios(
    acceptedCandidates,
    num,
    attempts,
    selectedOddEvenRatios.length > 0 ? oddEvenQuotas : undefined
  );

  return {
    candidates: acceptedCandidates,
    ratioSummary,
    quotaWarning: warnings.length ? warnings.join(" ") : undefined,
    rejectionStats: stats
  };
}

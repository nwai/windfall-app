/**
 * Web Worker for candidate generation.
 * Runs generateCandidates off the main thread so the UI stays responsive.
 *
 * Message protocol:
 *   Main → Worker:  { type: "generate", id: string, args: SerializedArgs }
 *   Worker → Main:  { type: "trace", id: string, msg: string }
 *   Worker → Main:  { type: "result", id: string, result: GenerateCandidatesResult }
 *   Worker → Main:  { type: "error", id: string, error: string }
 */

import { generateCandidates } from "../generateCandidates";
import type { GenerateCandidatesResult } from "../generateCandidates";

/** Monthly bucket options with arrays instead of Sets (for structured clone) */
interface SerializedMonthlyBucketOptions {
  constraints: {
    undrawn: number; times1: number; times2: number; times3: number;
    times4: number; times5: number; times6: number; times7: number; times8: number;
  };
  buckets: {
    undrawn: number[]; times1: number[]; times2: number[]; times3: number[];
    times4: number[]; times5: number[]; times6: number[]; times7: number[];
    times8: number[];
  };
  allowShortfall?: boolean;
  boostPenalize?: boolean;
}

interface MainDigitConstraintOptions {
  maxCount?: number;
  boost?: number;
  singleDigitBoost?: number;
  twoDigitBoost?: number;
}

type MainDecadeBiases = Partial<Record<"decade0x" | "decade1x" | "decade2x" | "decade3x" | "decade4x", number>>;

interface DigitWidthConstraintOptions {
  enabled?: boolean;
  singleDigitPercent?: number;
  scope?: "main" | "mainAndSupp";
}

export interface GenerateWorkerArgs {
  num: number;
  history: any[];
  knobs: any;
  excludedNumbers: number[];
  selectedOddEvenRatios: string[];
  useTrickyRule: boolean;
  minOGAPercentile: number;
  pastOGAScores: number[];
  forcedNumbers: number[];
  selectedNumbersForBoost: number[];
  selectedBoostOptions: { enabled?: boolean; factor?: number } | undefined;
  entropyThreshold: number;
  hammingThreshold: number;
  jaccardThreshold: number;
  lambda: number;
  ratioOptions?: { ratio: string; count: number }[];
  minRecentMatches: number;
  recentMatchBias: number;
  repeatWindowSizeW: number;
  minFromRecentUnionM: number;
  trendMapEntries?: [number, string][];
  allowedTrendRatios?: string[];
  sumFilter?: { enabled?: boolean; min?: number; max?: number; includeSupp?: boolean };
  patternOptions?: any;
  ogaBiasOptions?: any;
  div5Options?: { maxMainCount?: number };
  mainZeroOptions?: MainDigitConstraintOptions;
  mainFiveOptions?: MainDigitConstraintOptions;
  mainOneOptions?: MainDigitConstraintOptions;
  mainTwoOptions?: MainDigitConstraintOptions;
  mainThreeOptions?: MainDigitConstraintOptions;
  mainFourOptions?: MainDigitConstraintOptions;
  mainSixOptions?: MainDigitConstraintOptions;
  mainSevenOptions?: MainDigitConstraintOptions;
  mainEightOptions?: MainDigitConstraintOptions;
  mainNineOptions?: MainDigitConstraintOptions;
  mainDecadeBiases?: MainDecadeBiases;
  digitWidthConstraint?: DigitWidthConstraintOptions;
  monthlyBucketOptions?: SerializedMonthlyBucketOptions;
  attemptMultiplier?: number;
  ogaSpokeCount?: number;
  maxLastDrawMatches?: number;
  /** Per-number boost from monthly repeat bias; plain object (numeric keys). */
  monthlyRepeatBiasWeights?: Record<number, number>;
}

function deserializeMonthlyBuckets(
  opts: SerializedMonthlyBucketOptions | undefined
) {
  if (!opts) return undefined;
  return {
    constraints: opts.constraints,
    buckets: {
      undrawn: new Set(opts.buckets.undrawn),
      times1: new Set(opts.buckets.times1),
      times2: new Set(opts.buckets.times2),
      times3: new Set(opts.buckets.times3),
      times4: new Set(opts.buckets.times4),
      times5: new Set(opts.buckets.times5),
      times6: new Set(opts.buckets.times6),
      times7: new Set(opts.buckets.times7),
      times8: new Set(opts.buckets.times8),
    },
    allowShortfall: opts.allowShortfall,
    boostPenalize: opts.boostPenalize,
  };
}

const ctx = self as unknown as Worker;

ctx.addEventListener("message", (e: MessageEvent) => {
  const { type, id, args } = e.data as {
    type: "generate";
    id: string;
    args: GenerateWorkerArgs;
  };

  if (type !== "generate") return;

  try {
    // Reconstruct trendMap from entries
    const trendMap = args.trendMapEntries
      ? new Map<number, any>(args.trendMapEntries)
      : undefined;

    // Reconstruct monthly bucket Sets
    const monthlyBucketOptions = deserializeMonthlyBuckets(args.monthlyBucketOptions);

    // Trace callback: send each trace message back to main thread
    const traceSetter = (msg: string) => {
      ctx.postMessage({ type: "trace", id, msg });
    };

    const result: GenerateCandidatesResult = generateCandidates(
      args.num,
      args.history,
      args.knobs,
      traceSetter,
      args.excludedNumbers,
      args.selectedOddEvenRatios,
      args.useTrickyRule,
      args.minOGAPercentile,
      args.pastOGAScores,
      args.forcedNumbers,
      args.selectedNumbersForBoost,
      args.selectedBoostOptions,
      args.entropyThreshold,
      args.hammingThreshold,
      args.jaccardThreshold,
      args.lambda,
      args.ratioOptions,
      args.minRecentMatches,
      args.recentMatchBias,
      args.repeatWindowSizeW,
      args.minFromRecentUnionM,
      trendMap,
      args.allowedTrendRatios,
      args.sumFilter,
      args.patternOptions,
      args.ogaBiasOptions,
      args.div5Options,
      args.mainZeroOptions,
      args.mainFiveOptions,
      args.mainOneOptions,
      args.mainTwoOptions,
      args.mainThreeOptions,
      args.mainFourOptions,
      args.mainSixOptions,
      args.mainSevenOptions,
      args.mainEightOptions,
      args.mainNineOptions,
      args.digitWidthConstraint,
      monthlyBucketOptions,
      args.attemptMultiplier,
      args.ogaSpokeCount,
      args.maxLastDrawMatches,
      args.monthlyRepeatBiasWeights,
      args.mainDecadeBiases
    );

    ctx.postMessage({ type: "result", id, result });
  } catch (err: any) {
    ctx.postMessage({ type: "error", id, error: String(err?.message ?? err) });
  }
});

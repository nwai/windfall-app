/**
 * Hook + helpers for running generateCandidates in a Web Worker.
 * Falls back to synchronous execution if Workers are unavailable.
 */

import { useRef, useCallback, useEffect } from "react";
import type { GenerateCandidatesResult } from "../generateCandidates";
import type { GenerateWorkerArgs } from "../workers/generateWorker";

/** Serialise monthly bucket Sets → arrays for structured clone transfer */
export function serializeMonthlyBuckets(
  opts:
    | {
        constraints: any;
        buckets: {
          undrawn: Set<number>;
          times1: Set<number>;
          times2: Set<number>;
          times3: Set<number>;
          times4: Set<number>;
          times5: Set<number>;
          times6: Set<number>;
          times7: Set<number>;
          times8: Set<number>;
        };
        allowShortfall?: boolean;
        boostPenalize?: boolean;
        selectedNumbersByBucket?: {
          undrawn: number[];
          times1: number[];
          times2: number[];
          times3: number[];
          times4: number[];
          times5: number[];
          times6: number[];
          times7: number[];
          times8: number[];
        };
        selectedNumberBiasEnabled?: boolean;
      }
    | undefined
): GenerateWorkerArgs["monthlyBucketOptions"] | undefined {
  if (!opts) return undefined;
  return {
    constraints: opts.constraints,
    buckets: {
      undrawn: Array.from(opts.buckets.undrawn),
      times1: Array.from(opts.buckets.times1),
      times2: Array.from(opts.buckets.times2),
      times3: Array.from(opts.buckets.times3),
      times4: Array.from(opts.buckets.times4),
      times5: Array.from(opts.buckets.times5),
      times6: Array.from(opts.buckets.times6),
      times7: Array.from(opts.buckets.times7),
      times8: Array.from(opts.buckets.times8),
    },
    allowShortfall: opts.allowShortfall,
    boostPenalize: opts.boostPenalize,
    selectedNumbersByBucket: opts.selectedNumbersByBucket
      ? {
          undrawn: [...opts.selectedNumbersByBucket.undrawn],
          times1: [...opts.selectedNumbersByBucket.times1],
          times2: [...opts.selectedNumbersByBucket.times2],
          times3: [...opts.selectedNumbersByBucket.times3],
          times4: [...opts.selectedNumbersByBucket.times4],
          times5: [...opts.selectedNumbersByBucket.times5],
          times6: [...opts.selectedNumbersByBucket.times6],
          times7: [...opts.selectedNumbersByBucket.times7],
          times8: [...opts.selectedNumbersByBucket.times8],
        }
      : undefined,
    selectedNumberBiasEnabled: opts.selectedNumberBiasEnabled,
  };
}

/** Serialise a Map<number, TrendClass> → [number, string][] for structured clone */
export function serializeTrendMap(
  map: Map<number, string> | undefined
): [number, string][] | undefined {
  if (!map) return undefined;
  return Array.from(map.entries());
}

type OnTrace = (msg: string) => void;
type OnResult = (result: GenerateCandidatesResult) => void;
type OnError = (err: string) => void;
type CancelGenerateResult = {
  cancelled: boolean;
  hadPartial: boolean;
  accepted: number;
  attempts: number;
};

/**
 * React hook that manages a single generate-worker instance.
 * Returns generation start/cancel helpers.
 */
export function useGenerateWorker() {
  const workerRef = useRef<Worker | null>(null);
  const latestPartialRef = useRef<GenerateCandidatesResult | null>(null);
  const callbacksRef = useRef<{
    onTrace: OnTrace;
    onResult: OnResult;
    onError: OnError;
  } | null>(null);

  // Create worker lazily
  const getWorker = useCallback((): Worker | null => {
    if (workerRef.current) return workerRef.current;
    try {
      const w = new Worker(
        new URL("../workers/generateWorker.ts", import.meta.url),
        { type: "module" }
      );
      w.addEventListener("message", (e: MessageEvent) => {
        const { type, msg, result, error } = e.data;
        const cbs = callbacksRef.current;
        if (!cbs) return;
        if (type === "trace") cbs.onTrace(msg);
        else if (type === "partial") latestPartialRef.current = result;
        else if (type === "result") {
          latestPartialRef.current = null;
          callbacksRef.current = null;
          cbs.onResult(result);
        }
        else if (type === "error") {
          latestPartialRef.current = null;
          callbacksRef.current = null;
          cbs.onError(error);
        }
      });
      w.addEventListener("error", (e) => {
        const cbs = callbacksRef.current;
        latestPartialRef.current = null;
        callbacksRef.current = null;
        cbs?.onError(e.message ?? "Worker error");
      });
      workerRef.current = w;
      return w;
    } catch {
      // Workers not supported — will fall back to sync
      return null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      latestPartialRef.current = null;
      callbacksRef.current = null;
    };
  }, []);

  const runGenerate = useCallback(
    (
      args: GenerateWorkerArgs,
      onTrace: OnTrace,
      onResult: OnResult,
      onError: OnError
    ) => {
      const worker = getWorker();
      latestPartialRef.current = null;
      if (!worker) {
        // Fallback: run synchronously on main thread
        import("../generateCandidates").then(({ generateCandidates }) => {
          try {
            // Reconstruct trendMap & monthly Sets
            const trendMap = args.trendMapEntries
              ? new Map<number, any>(args.trendMapEntries)
              : undefined;
            const monthlyBucketOptions = args.monthlyBucketOptions
              ? {
                  constraints: args.monthlyBucketOptions.constraints,
                  buckets: {
                    undrawn: new Set(args.monthlyBucketOptions.buckets.undrawn),
                    times1: new Set(args.monthlyBucketOptions.buckets.times1),
                    times2: new Set(args.monthlyBucketOptions.buckets.times2),
                    times3: new Set(args.monthlyBucketOptions.buckets.times3),
                    times4: new Set(args.monthlyBucketOptions.buckets.times4),
                    times5: new Set(args.monthlyBucketOptions.buckets.times5),
                    times6: new Set(args.monthlyBucketOptions.buckets.times6),
                    times7: new Set(args.monthlyBucketOptions.buckets.times7),
                    times8: new Set(args.monthlyBucketOptions.buckets.times8),
                  },
                  allowShortfall: args.monthlyBucketOptions.allowShortfall,
                  boostPenalize: args.monthlyBucketOptions.boostPenalize,
                  selectedNumbersByBucket: args.monthlyBucketOptions.selectedNumbersByBucket
                    ? {
                        undrawn: [...args.monthlyBucketOptions.selectedNumbersByBucket.undrawn],
                        times1: [...args.monthlyBucketOptions.selectedNumbersByBucket.times1],
                        times2: [...args.monthlyBucketOptions.selectedNumbersByBucket.times2],
                        times3: [...args.monthlyBucketOptions.selectedNumbersByBucket.times3],
                        times4: [...args.monthlyBucketOptions.selectedNumbersByBucket.times4],
                        times5: [...args.monthlyBucketOptions.selectedNumbersByBucket.times5],
                        times6: [...args.monthlyBucketOptions.selectedNumbersByBucket.times6],
                        times7: [...args.monthlyBucketOptions.selectedNumbersByBucket.times7],
                        times8: [...args.monthlyBucketOptions.selectedNumbersByBucket.times8],
                      }
                    : undefined,
                  selectedNumberBiasEnabled: args.monthlyBucketOptions.selectedNumberBiasEnabled,
                }
              : undefined;
            const result = generateCandidates(
              args.num, args.history, args.knobs, onTrace,
              args.excludedNumbers, args.selectedOddEvenRatios, args.useTrickyRule,
              args.minOGAPercentile, args.pastOGAScores, args.forcedNumbers,
              args.selectedNumbersForBoost, args.selectedBoostOptions,
              args.entropyThreshold, args.hammingThreshold, args.jaccardThreshold,
              args.lambda, args.ratioOptions, args.minRecentMatches,
              args.recentMatchBias, args.repeatWindowSizeW, args.minFromRecentUnionM,
              trendMap, args.allowedTrendRatios, args.sumFilter,
              args.patternOptions, args.ogaBiasOptions, args.div5Options, args.mainZeroOptions, args.mainFiveOptions, args.mainOneOptions, args.mainTwoOptions, args.mainThreeOptions, args.mainFourOptions, args.mainSixOptions, args.mainSevenOptions, args.mainEightOptions, args.mainNineOptions, args.digitWidthConstraint,
              monthlyBucketOptions, args.attemptMultiplier, args.ogaSpokeCount,
                args.maxLastDrawMatches, args.monthlyRepeatBiasWeights, args.mainDecadeBiases, args.monthEndCarryOverWeights, args.scoringGenerationProfile,
                (partialResult) => {
                  latestPartialRef.current = partialResult;
                },
                args.latestNeighbourSupportOptions
            );
            latestPartialRef.current = null;
            onResult(result);
          } catch (e: any) {
            onError(String(e?.message ?? e));
          }
        });
        return;
      }

      const id = Math.random().toString(36).slice(2);
      callbacksRef.current = { onTrace, onResult, onError };
      worker.postMessage({ type: "generate", id, args });
    },
    [getWorker]
  );

  const cancelGenerate = useCallback((): CancelGenerateResult => {
    const worker = workerRef.current;
    const callbacks = callbacksRef.current;
    const latestPartial = latestPartialRef.current;
    if (!worker && !callbacks) {
      return { cancelled: false, hadPartial: false, accepted: 0, attempts: 0 };
    }

    worker?.terminate();
    workerRef.current = null;
    callbacksRef.current = null;
    latestPartialRef.current = null;

    if (latestPartial && callbacks) {
      callbacks.onResult(latestPartial);
      return {
        cancelled: true,
        hadPartial: true,
        accepted: latestPartial.candidates.length,
        attempts: latestPartial.rejectionStats.totalAttempts,
      };
    }

    return { cancelled: true, hadPartial: false, accepted: 0, attempts: 0 };
  }, []);

  return { runGenerate, cancelGenerate };
}

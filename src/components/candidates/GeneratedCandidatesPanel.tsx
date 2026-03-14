import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { generateExhaustiveCombos } from "../../lib/exhaustiveGenerator";
import { computeOGA, getOGAPercentile } from "../../utils/oga";
import { CandidateSet, Draw } from "../../types";

export interface GeneratedCandidatesPanelProps {
  onGenerate: () => void;
  candidates: CandidateSet[];
  quotaWarning?: string;
  isGenerating?: boolean;
  numCandidates: number;
  setNumCandidates: (n: number) => void;
  forcedNumbers?: number[];
  userSelectedNumbers: number[];
  setUserSelectedNumbers: (nums: number[]) => void;

  onSelectCandidate: (idx: number) => void;
  onSimulateCandidate?: (idx: number) => void;
  selectedCandidateIdx: number;

  mostRecentDraw: Draw | null;

  manualSimSelected: number[];
  setManualSimSelected: React.Dispatch<React.SetStateAction<number[]>>;
  onManualSimulationChanged?: (next: number[]) => void;

  activeOGABand?: { lower: number; upper: number } | null;

  ogaScoresRef?: number[];

  // Optional simulation visual state
  activeSimCandidateIdx?: number;
  simSourceKind?: "none" | "candidate" | "user";

  // Batch frequency debug
  batchSize: number;
  setBatchSize: (n: number) => void;
  onRunBatch: () => void;
  batchFreq: { n: number; count: number }[];
  isBatching?: boolean;
  batchSummary?: string;
  batchSessionRuns: number;
  setBatchSessionRuns: (n: number) => void;
  onRunBatchSession: () => void;
  isBatchSessionRunning?: boolean;
  batchSessionProgress?: number;
  batchSessionTopSeries?: { run: number; tops: { n: number; count: number }[] }[];
  batchSessionAggregate?: { n: number; count: number }[];
  onSimulateNumbers?: (nums: number[]) => void;
  monthlyAvgBuckets?: { times: number; avg: number }[];
  monthlyBuckets?: {
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
  historyForOGA?: Draw[];
  ogaRefScores?: number[];
  ogaSpokeCount?: number;
  attemptMultiplier?: number;
  onAttemptMultiplierChange?: (n: number) => void;
  overgenFactor?: number;
  onOvergenFactorChange?: (n: number) => void;
  /** Readiness score weights (IDM/Conv/OGA) — user-configurable */
  rdyWeights?: { idm: number; conv: number; oga: number };
  /** Whether OGA is enabled in WFMQYH — controls Rdy OGA component */
  enableOGA?: boolean;
}

export const GeneratedCandidatesPanel: React.FC<GeneratedCandidatesPanelProps> = ({
  onGenerate,
  candidates,
  quotaWarning,
  isGenerating = false,
  numCandidates,
  setNumCandidates,
  userSelectedNumbers,
  setUserSelectedNumbers,
  onSelectCandidate,
  onSimulateCandidate,
  selectedCandidateIdx,
  mostRecentDraw,
  manualSimSelected,
  setManualSimSelected,
  onManualSimulationChanged,
  activeOGABand,
  ogaScoresRef,
  forcedNumbers = [],
  activeSimCandidateIdx,
  simSourceKind,
  batchSize,
  setBatchSize,
  onRunBatch,
  batchFreq,
  isBatching = false,
  batchSummary,
  batchSessionRuns,
  setBatchSessionRuns,
  onRunBatchSession,
  isBatchSessionRunning = false,
  batchSessionProgress = 0,
  batchSessionTopSeries = [],
  batchSessionAggregate = [],
  onSimulateNumbers,
  monthlyAvgBuckets = [],
  monthlyBuckets,
  historyForOGA,
  ogaRefScores,
  ogaSpokeCount,
  attemptMultiplier = 400,
  onAttemptMultiplierChange,
  overgenFactor = 50,
  onOvergenFactorChange,
  rdyWeights = { idm: 0.50, conv: 0.30, oga: 0.20 },
  enableOGA = true,
}) => {
    const [exSource, setExSource] = useState<"user" | "manual" | "custom">("user");
    const [exCustomInput, setExCustomInput] = useState<string>("1,2,3,4,5,6,7,8");
    const [exCap, setExCap] = useState<number>(1000);
    const [exPageSize, setExPageSize] = useState<number>(50);
    const [exPage, setExPage] = useState<number>(0);
    const [exCombos, setExCombos] = useState<CandidateSet[]>([]);
    const [exTotal, setExTotal] = useState<number>(0);
    const [exCapped, setExCapped] = useState<boolean>(false);
     const [pressedButton, setPressedButton] = useState<string | null>(null);

    // --- Running clock for generation time ---
    const [elapsedMs, setElapsedMs] = useState<number>(0);
    const genStartRef = useRef<number>(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
      if (isGenerating) {
        genStartRef.current = performance.now();
        setElapsedMs(0);
        timerRef.current = setInterval(() => {
          setElapsedMs(performance.now() - genStartRef.current);
        }, 100);
      } else {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        // Keep the final elapsed time visible (don't reset to 0)
        if (genStartRef.current > 0) {
          setElapsedMs(performance.now() - genStartRef.current);
        }
      }
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
    }, [isGenerating]);

    const formatElapsed = useCallback((ms: number): string => {
      if (ms < 1000) return `${Math.round(ms)}ms`;
      return `${(ms / 1000).toFixed(1)}s`;
    }, []);

    // --- Column sorting ---
    type SortKey = "rdy" | "idm" | "conv" | "comp" | "ogaRaw" | "ogaPct" | "selHits" | "recentHits" | "oddEven" | "prize" | "b0x" | "b1x" | "b2x" | "b3x" | "b4x" | "b5x" | "b6x" | "b7x" | "b8x" | null;
    const [sortKey, setSortKey] = useState<SortKey>("prize");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const toggleSort = (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir(key === "rdy" || key === "idm" || key === "conv" || key === "comp" || key === "ogaPct" || key === "selHits" || key === "recentHits" || key === "prize" || key?.startsWith("b") ? "desc" : "asc");
      }
    };
    const sortIndicator = (key: SortKey): string => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");
    const sortableStyle: React.CSSProperties = { cursor: "pointer", userSelect: "none" };

    const recentSet = new Set([...(mostRecentDraw?.main || []), ...(mostRecentDraw?.supp || [])]);
    const selSet = new Set(userSelectedNumbers);
    const forcedSet = new Set(forcedNumbers);
    const hitSet = new Set<number>([...selSet, ...forcedSet]); // union for SelHits

  const manualMainSet = useMemo(() => new Set(manualSimSelected.slice(0, 6)), [manualSimSelected]);
  const manualSuppSet = useMemo(() => new Set(manualSimSelected.slice(6, 8)), [manualSimSelected]);

  type MonthlyBucketCounts = {
    undrawn: number;
    times1: number;
    times2: number;
    times3: number;
    times4: number;
    times5: number;
    times6: number;
    times7: number;
    times8: number;
  };

  const getMonthlyBucketCounts = (numbers: number[]): MonthlyBucketCounts | null => {
    if (!monthlyBuckets) return null;
    const counts: MonthlyBucketCounts = {
      undrawn: 0,
      times1: 0,
      times2: 0,
      times3: 0,
      times4: 0,
      times5: 0,
      times6: 0,
      times7: 0,
      times8: 0,
    };
    numbers.forEach((n) => {
      if (monthlyBuckets.undrawn.has(n)) counts.undrawn += 1;
      else if (monthlyBuckets.times1.has(n)) counts.times1 += 1;
      else if (monthlyBuckets.times2.has(n)) counts.times2 += 1;
      else if (monthlyBuckets.times3.has(n)) counts.times3 += 1;
      else if (monthlyBuckets.times4.has(n)) counts.times4 += 1;
      else if (monthlyBuckets.times5.has(n)) counts.times5 += 1;
      else if (monthlyBuckets.times6.has(n)) counts.times6 += 1;
      else if (monthlyBuckets.times7.has(n)) counts.times7 += 1;
      else if (monthlyBuckets.times8.has(n)) counts.times8 += 1;
    });
    return counts;
  };

  // --- Convergence score ---
  // For each number 1–45, determine its current bucket index (0–8) from monthlyBuckets.
  // Build the current frequency-of-frequencies distribution and a target from monthlyAvgBuckets.
  // For each candidate, simulate drawing its 8 numbers (each moves up one bucket)
  // and compute how much the distribution moves closer to the target.
  // Score = pre-draw SSD − post-draw SSD.  Higher is better (more convergent).

  /** Map a number to its current bucket index (0 = undrawn, 1 = times1, ..., 8 = times8+) */
  const numberToBucket = useMemo((): Map<number, number> | null => {
    if (!monthlyBuckets) return null;
    const m = new Map<number, number>();
    const bucketSets = [
      monthlyBuckets.undrawn,
      monthlyBuckets.times1,
      monthlyBuckets.times2,
      monthlyBuckets.times3,
      monthlyBuckets.times4,
      monthlyBuckets.times5,
      monthlyBuckets.times6,
      monthlyBuckets.times7,
      monthlyBuckets.times8,
    ];
    bucketSets.forEach((s, idx) => {
      s.forEach((n) => m.set(n, idx));
    });
    return m;
  }, [monthlyBuckets]);

  /** Current distribution: how many numbers sit in each bucket (index 0–8) */
  const currentDist = useMemo((): number[] | null => {
    if (!numberToBucket) return null;
    const dist = Array(9).fill(0);
    numberToBucket.forEach((bucket) => { dist[bucket] += 1; });
    return dist;
  }, [numberToBucket]);

  /** Target distribution from rounded monthly averages.
   *  monthlyAvgBuckets only includes drawn buckets (times >= 1).
   *  Derive 0x (undrawn) as 45 − sum(rounded drawn buckets) so all 45 numbers are accounted for. */
  const targetDist = useMemo((): number[] | null => {
    if (!monthlyAvgBuckets.length) return null;
    const dist = Array(9).fill(0);
    let drawnTotal = 0;
    monthlyAvgBuckets.forEach((b) => {
      const idx = Math.min(b.times, 8);
      const rounded = Math.round(b.avg);
      dist[idx] = rounded;
      if (idx > 0) drawnTotal += rounded;
    });
    // 0x = numbers that were never drawn in a typical completed month
    dist[0] = Math.max(0, 45 - drawnTotal);
    return dist;
  }, [monthlyAvgBuckets]);

  /** SSD helper */
  const ssd = (a: number[], b: number[]): number => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const d = a[i] - b[i];
      sum += d * d;
    }
    return sum;
  };

  /** Pre-draw SSD (same for every candidate, computed once) */
  const preSSD = useMemo((): number | null => {
    if (!currentDist || !targetDist) return null;
    return ssd(currentDist, targetDist);
  }, [currentDist, targetDist]);

  /** Compute convergence score for a candidate's numbers */
  const getConvergenceScore = (numbers: number[]): number | null => {
    if (!numberToBucket || !currentDist || !targetDist || preSSD === null) return null;
    // Clone current distribution and simulate the draw
    const postDist = [...currentDist];
    numbers.forEach((n) => {
      const bucket = numberToBucket.get(n);
      if (bucket === undefined) return;
      postDist[bucket] -= 1; // remove from current bucket
      const newBucket = Math.min(bucket + 1, 8); // move up (8 stays at 8)
      postDist[newBucket] += 1;
    });
    const postSSD = ssd(postDist, targetDist);
    return preSSD - postSSD; // positive = closer to average = good
  };

  /** Compute all convergence scores for candidates to find the best */
  const convergenceScores = useMemo((): (number | null)[] => {
    return candidates.map((c) => {
      const nums = [...c.main, ...c.supp];
      return getConvergenceScore(nums);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, numberToBucket, currentDist, targetDist, preSSD]);

  /** Best convergence score (for highlighting) */
  const bestConvergence = useMemo((): number | null => {
    const valid = convergenceScores.filter((s): s is number => s !== null);
    if (!valid.length) return null;
    return Math.max(...valid);
  }, [convergenceScores]);

  // --- Ideal Draw composition (same greedy SSD algorithm as MonthlyDrawsSummaryPanel) ---
  const idealDrawComp = useMemo((): number[] | null => {
    if (!currentDist || !targetDist) return null;
    const maxBucket = 8;
    const simDist = [...currentDist];
    const drawFrom = new Array(maxBucket + 1).fill(0);
    for (let pick = 0; pick < 8; pick++) {
      let bestBucket = -1;
      let bestImprovement = -Infinity;
      for (let b = 0; b <= maxBucket; b++) {
        if (simDist[b] <= 0) continue;
        const dest = Math.min(b + 1, maxBucket);
        const oldSrcGap = (simDist[b] - targetDist[b]) ** 2;
        const newSrcGap = (simDist[b] - 1 - targetDist[b]) ** 2;
        const oldDestGap = (simDist[dest] - targetDist[dest]) ** 2;
        const newDestGap = (simDist[dest] + 1 - targetDist[dest]) ** 2;
        const improvement = b === maxBucket ? 0 : (oldSrcGap - newSrcGap) + (oldDestGap - newDestGap);
        if (improvement > bestImprovement) { bestImprovement = improvement; bestBucket = b; }
      }
      if (bestBucket < 0) break;
      simDist[bestBucket] -= 1;
      simDist[Math.min(bestBucket + 1, maxBucket)] += 1;
      drawFrom[bestBucket] += 1;
    }
    return drawFrom;
  }, [currentDist, targetDist]);

  /** Ideal Draw Match (IDM): similarity between candidate bucket composition and ideal draw.
   *  1.0 = perfect match, 0.0 = completely different. */
  const getIdealDrawMatch = useCallback((numbers: number[]): number | null => {
    if (!idealDrawComp || !numberToBucket) return null;
    const candidateComp = new Array(9).fill(0);
    numbers.forEach((n) => {
      const bucket = numberToBucket.get(n);
      if (bucket !== undefined) candidateComp[bucket] += 1;
    });
    let totalDiff = 0;
    for (let i = 0; i < 9; i++) totalDiff += Math.abs(candidateComp[i] - idealDrawComp[i]);
    return Math.max(0, 1 - totalDiff / 16);
  }, [idealDrawComp, numberToBucket]);

  /** Readiness (Rdy) score: weighted composite of IDM, Conv, and OGA.
   *  When OGA is disabled, its weight is redistributed to IDM and Conv
   *  proportionally so the score remains meaningful. */
  const readinessScores = useMemo((): (number | null)[] => {
    const validConv = convergenceScores.filter((s): s is number => s !== null);
    const minConv = validConv.length ? Math.min(...validConv) : 0;
    const maxConv = validConv.length ? Math.max(...validConv) : 0;
    const convRange = maxConv - minConv || 1;
    // When OGA is off, redistribute its weight to IDM and Conv
    const effectiveOga = enableOGA ? rdyWeights.oga : 0;
    const wSum = rdyWeights.idm + rdyWeights.conv + effectiveOga || 1;
    const wIdm = rdyWeights.idm / wSum;
    const wConv = rdyWeights.conv / wSum;
    const wOga = effectiveOga / wSum;
    return candidates.map((c, idx) => {
      const nums = [...c.main, ...c.supp];
      const idm = getIdealDrawMatch(nums);
      const conv = convergenceScores[idx];
      const ogaPct = (c as any).ogaPercentile as number | undefined;
      if (idm === null) return null;
      const convNorm = conv !== null ? (conv - minConv) / convRange : 0.5;
      const ogaNorm = enableOGA && ogaPct !== undefined ? ogaPct / 100 : 0;
      return wIdm * idm + wConv * convNorm + wOga * ogaNorm;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, convergenceScores, idealDrawComp, numberToBucket, rdyWeights, enableOGA]);

  const bestReadiness = useMemo((): number | null => {
    const valid = readinessScores.filter((s): s is number => s !== null);
    if (!valid.length) return null;
    return Math.max(...valid);
  }, [readinessScores]);

  /** Per-candidate IDM scores for the IDM column */
  const idmScores = useMemo((): (number | null)[] => {
    return candidates.map((c) => {
      const nums = [...c.main, ...c.supp];
      return getIdealDrawMatch(nums);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, idealDrawComp, numberToBucket]);

  const bestIdm = useMemo((): number | null => {
    const valid = idmScores.filter((s): s is number => s !== null);
    if (!valid.length) return null;
    return Math.max(...valid);
  }, [idmScores]);

  /** Sorted candidates — preserves original index for callbacks */
  const sortedCandidates = useMemo((): { c: CandidateSet; origIdx: number }[] => {
    const indexed = candidates.map((c, i) => ({ c, origIdx: i }));
    if (!sortKey) return indexed;
    const dir = sortDir === "asc" ? 1 : -1;
    return indexed.sort((a, b) => {
      let va: number;
      let vb: number;
      const numsA: number[] = [...a.c.main, ...a.c.supp];
      const numsB: number[] = [...b.c.main, ...b.c.supp];
      switch (sortKey) {
        case "rdy":
          va = readinessScores[a.origIdx] ?? -Infinity;
          vb = readinessScores[b.origIdx] ?? -Infinity;
          break;
        case "idm":
          va = idmScores[a.origIdx] ?? -Infinity;
          vb = idmScores[b.origIdx] ?? -Infinity;
          break;
        case "conv":
          va = convergenceScores[a.origIdx] ?? -Infinity;
          vb = convergenceScores[b.origIdx] ?? -Infinity;
          break;
        case "comp":
          va = (a.c as any).finalCompositeAdj ?? -Infinity;
          vb = (b.c as any).finalCompositeAdj ?? -Infinity;
          break;
        case "ogaRaw":
          va = (a.c as any).ogaScore ?? -Infinity;
          vb = (b.c as any).ogaScore ?? -Infinity;
          break;
        case "ogaPct":
          va = (a.c as any).ogaPercentile ?? -Infinity;
          vb = (b.c as any).ogaPercentile ?? -Infinity;
          break;
        case "selHits":
          va = (a.c as any).selHits ?? numsA.filter((n: number) => hitSet.has(n)).length;
          vb = (b.c as any).selHits ?? numsB.filter((n: number) => hitSet.has(n)).length;
          break;
        case "recentHits":
          va = (a.c as any).recentHits ?? numsA.filter((n: number) => recentSet.has(n)).length;
          vb = (b.c as any).recentHits ?? numsB.filter((n: number) => recentSet.has(n)).length;
          break;
        case "oddEven":
          va = numsA.filter((n: number) => n % 2 === 1).length;
          vb = numsB.filter((n: number) => n % 2 === 1).length;
          break;
        case "prize": {
          va = computePrizeScore(a.c.main, a.c.supp, manualMainSet, manualSuppSet);
          vb = computePrizeScore(b.c.main, b.c.supp, manualMainSet, manualSuppSet);
          break;
        }
        case "b0x": case "b1x": case "b2x": case "b3x": case "b4x":
        case "b5x": case "b6x": case "b7x": case "b8x": {
          const bcA = getMonthlyBucketCounts(numsA);
          const bcB = getMonthlyBucketCounts(numsB);
          const bucketMap: Record<string, keyof MonthlyBucketCounts> = {
            b0x: "undrawn", b1x: "times1", b2x: "times2", b3x: "times3",
            b4x: "times4", b5x: "times5", b6x: "times6", b7x: "times7", b8x: "times8",
          };
          const field = bucketMap[sortKey];
          va = bcA ? bcA[field] : -Infinity;
          vb = bcB ? bcB[field] : -Infinity;
          break;
        }
        default:
          return 0;
      }
      return (va - vb) * dir;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, sortKey, sortDir, convergenceScores, readinessScores, idmScores]);

  // --- Row virtualization ---
  const ROW_HEIGHT = 32;           // estimated px height per row
  const OVERSCAN = 5;              // extra rows above/below viewport
  const VIRTUAL_THRESHOLD = 80;    // only virtualise when row count exceeds this
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  const shouldVirtualise = sortedCandidates.length > VIRTUAL_THRESHOLD;

  // Reset scroll when candidates or sort change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [candidates, sortKey, sortDir]);

  const handleTableScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Observe container resize for accurate viewport height
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [candidates.length]);

  const totalRows = sortedCandidates.length;
  const totalHeight = totalRows * ROW_HEIGHT;
  const startIdx = shouldVirtualise
    ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    : 0;
  const visibleCount = shouldVirtualise
    ? Math.min(totalRows - startIdx, Math.ceil(viewportHeight / ROW_HEIGHT) + 2 * OVERSCAN)
    : totalRows;
  const endIdx = startIdx + visibleCount;
  const topPad = startIdx * ROW_HEIGHT;
  const bottomPad = Math.max(0, (totalRows - endIdx) * ROW_HEIGHT);
  const visibleCandidates = shouldVirtualise
    ? sortedCandidates.slice(startIdx, endIdx)
    : sortedCandidates;

  const exhaustivePool = useMemo(() => {
    const parseCustom = (txt: string) => {
      return txt
        .split(/[^0-9]+/)
        .map((s) => Number(s))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 45);
    };
    const pool = exSource === "user"
      ? userSelectedNumbers
      : exSource === "manual"
      ? manualSimSelected
      : parseCustom(exCustomInput);
    return Array.from(new Set(pool)).sort((a, b) => a - b);
  }, [exSource, userSelectedNumbers, manualSimSelected, exCustomInput]);

  const poolHasEnough = exhaustivePool.length >= 8;

  const exPageCombos = useMemo(() => {
    const start = exPage * exPageSize;
    return exCombos.slice(start, start + exPageSize);
  }, [exCombos, exPage, exPageSize]);

  const exTotalPages = useMemo(() => {
    if (exPageSize <= 0) return 0;
    return Math.ceil(exCombos.length / exPageSize);
  }, [exCombos.length, exPageSize]);

  React.useEffect(() => {
    if (exTotalPages === 0 && exPage !== 0) {
      setExPage(0);
    } else if (exTotalPages > 0 && exPage >= exTotalPages) {
      setExPage(exTotalPages - 1);
    }
  }, [exTotalPages, exPage]);

  const handleExhaustiveGenerate = () => {
    const cappedValue = Math.max(1, exCap);
    setExCap(cappedValue);
    const { combos, total, capped } = generateExhaustiveCombos(exhaustivePool, { cap: cappedValue });

    let combosWithOga: CandidateSet[] = combos;
    if (historyForOGA && historyForOGA.length) {
      const ref = ogaRefScores && ogaRefScores.length ? ogaRefScores : undefined;
      const spoke = ogaSpokeCount ?? 9;
      combosWithOga = combos.map((combo) => {
        const nums = [...combo.main, ...combo.supp];
        const raw = computeOGA(nums, historyForOGA, spoke);
        const pct = ref ? getOGAPercentile(raw, ref) : undefined;
        return { ...combo, ogaScore: raw, ogaPercentile: pct } as CandidateSet;
      });
    }

    setExCombos(combosWithOga);
    setExTotal(total);
    setExCapped(capped);
    setExPage(0);
  };

  const totalCombosEstimate = useMemo(() => exTotal || 0, [exTotal]);
 
   const renderDots = (count: number, color: string, emptyColor: string, ariaLabel: string) => (
     <span aria-label={ariaLabel} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
       {count > 0
         ? Array.from({ length: count }, (_, idx) => (
             <span
               key={`${ariaLabel}-${idx}`}
               style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }}
             />
           ))
         : (
             <span
               style={{ width: 10, height: 10, borderRadius: "50%", border: `1px solid ${emptyColor}`, display: "inline-block" }}
             />
           )}
     </span>
   );

   function computePrizeDivision(main: number[], supp: number[], manualMain: Set<number>, manualSupp: Set<number>): string {
     if (manualMain.size < 6 || manualSupp.size < 2) return "—";
     const mainHits = main.filter((n) => manualMain.has(n)).length;
     const suppHits = supp.filter((n) => manualSupp.has(n)).length;
     if (mainHits === 6) return "Div1";
     if (mainHits === 5 && suppHits >= 1) return "Div2";
     if (mainHits === 5) return "Div3";
     if (mainHits === 4 && suppHits >= 1) return "Div4";
     if (mainHits === 4) return "Div4";
     if (mainHits === 3 && suppHits >= 1) return "Div5";
     if (mainHits === 1 && suppHits === 2) return "Div6";
     return "—";
   }

   /** Composite prize sort score: division rank × 100 + mainHits × 10 + suppHits.
    *  Within the same division, candidates with more total hits sort higher.
    *  E.g., Div4 (4 main + 2 supp) = 462 > Div4 (4 main + 0 supp) = 440. */
   function computePrizeScore(main: number[], supp: number[], manualMain: Set<number>, manualSupp: Set<number>): number {
     if (manualMain.size < 6 || manualSupp.size < 2) return 0;
     const mainHits = main.filter((n) => manualMain.has(n)).length;
     const suppHits = supp.filter((n) => manualSupp.has(n)).length;
     const divOrder: Record<string, number> = { "Div1": 7, "Div2": 6, "Div3": 5, "Div4": 4, "Div5": 3, "Div6": 2, "Div7": 1 };
     const label = computePrizeDivision(main, supp, manualMain, manualSupp);
     const rank = divOrder[label] ?? 0;
     return rank * 100 + mainHits * 10 + suppHits;
   }

   const selHeader = forcedNumbers.length ? "Sel/Forced Hits" : "SelHits";

     const numberFreq = useMemo(() => {
       const counts = new Map<number, number>();
       candidates.forEach((c) => {
         [...c.main, ...c.supp].forEach((n: number) => {
           counts.set(n, (counts.get(n) || 0) + 1);
         });
       });
       return Array.from(counts.entries()).sort((a, b) => {
         const diff = b[1] - a[1];
         if (diff !== 0) return diff;
         return a[0] - b[0];
       });
     }, [candidates]);

     function renderNumberWithCount(n: number, count: number) {
       return (
         <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 8 }}>
           {renderNumber(n)}
           <span style={{ fontSize: 11, color: "red", fontVariantNumeric: "tabular-nums" }}>×{count}</span>
         </span>
       );
     }

   function formatOGATooltip(ogaScore?: number, ogaPct?: number): string | undefined {
     if (ogaScore === undefined || ogaPct === undefined) return undefined;
     const ref = Array.isArray(ogaScoresRef) ? ogaScoresRef : undefined;
     if (!ref || ref.length === 0) return `OGA raw ${ogaScore.toFixed(2)} • ${ogaPct.toFixed(1)}%`;
     const sorted = ref.slice().sort((a, b) => a - b);
     // rank = number of ref scores <= candidate
     let rank = 0;
     for (let i = 0; i < sorted.length; i++) if (sorted[i] <= ogaScore) rank++;
     const nearestIdx = (() => {
       let idx = 0;
       let best = Infinity;
       for (let i = 0; i < sorted.length; i++) {
         const d = Math.abs(sorted[i] - ogaScore);
         if (d < best) { best = d; idx = i; }
       }
       return idx;
     })();
     const nearestRaw = sorted[nearestIdx];
     return `OGA raw ${ogaScore.toFixed(2)} • ${ogaPct.toFixed(1)}%\nRef: rank ${rank}/${sorted.length}, nearest ${nearestRaw.toFixed(2)}`;
   }

   function renderNumber(n: number, _simRole?: "main" | "supp") {
      const isSel = selSet.has(n);
      const isRecent = recentSet.has(n);
      const base: React.CSSProperties = {
        padding: "0 4px",
        margin: "0 2px",
        borderRadius: 14,
        display: "inline-block",
        fontVariantNumeric: "tabular-nums",
        fontSize: 12,
      };
      if (isSel && isRecent) {
        return (
          <span
            key={n}
            style={{
              ...base,
              background: "linear-gradient(90deg,#ffe58a,#fff3c4)",
              fontWeight: 700,
              color: "#c62828",
              textDecoration: "underline",
            }}
            title="User-selected & Recently drawn"
          >
            {n}
          </span>
        );
      } else if (isSel) {
        return (
          <span
            key={n}
            style={{
              ...base,
              color: "#d32f2f",
              fontWeight: 700,
              textDecoration: "underline",
            }}
            title="User-selected"
          >
            {n}
          </span>
        );
      } else if (isRecent) {
        return (
          <span
            key={n}
            style={{
              ...base,
              background: "#fff59d",
              fontWeight: 600,
            }}
            title="Recently drawn"
          >
            {n}
          </span>
        );
      } else {
        return (
          <span key={n} style={base}>
            {n}
          </span>
        );
      }
    }

   function toggleManualPick(n: number) {
     setManualSimSelected((prev) => {
       const next = prev.includes(n)
         ? prev.filter((x) => x !== n)
         : prev.length >= 8
         ? prev
         : [...prev, n];

       onManualSimulationChanged?.(next);
       return next;
     });
   }

   const simulateTopList = (tops: { n: number; count: number }[]) => {
      if (!onSimulateNumbers) return;
      const numbers = tops.map((t) => t.n).slice(0, 8);
      if (numbers.length < 8) return;
      // mains first 6, supp next 2; leave order as listed
      onSimulateNumbers(numbers);
    };

    const bucketColorForNumber = (n: number): { color: string; hasBaseline: boolean } | null => {
      if (!monthlyBuckets) return null;
      if (monthlyBuckets.undrawn.has(n)) return { color: colorForTimes(0), hasBaseline: true };
      if (monthlyBuckets.times1.has(n)) return { color: colorForTimes(1), hasBaseline: true };
      if (monthlyBuckets.times2.has(n)) return { color: colorForTimes(2), hasBaseline: true };
      if (monthlyBuckets.times3.has(n)) return { color: colorForTimes(3), hasBaseline: true };
      if (monthlyBuckets.times4.has(n)) return { color: colorForTimes(4), hasBaseline: true };
      if (monthlyBuckets.times5.has(n)) return { color: colorForTimes(5), hasBaseline: true };
      if (monthlyBuckets.times6.has(n)) return { color: colorForTimes(6), hasBaseline: true };
      if (monthlyBuckets.times7.has(n)) return { color: colorForTimes(7), hasBaseline: true };
      if (monthlyBuckets.times8.has(n)) return { color: colorForTimes(8), hasBaseline: true };
      return null;
    };

    const pickBucketColor = (n: number, count: number): { color: string; hasBaseline: boolean } => {
      const direct = bucketColorForNumber(n);
      if (direct) return direct;
      if (monthlyAvgBuckets.length) {
        let best = monthlyAvgBuckets[0];
        let bestDiff = Math.abs(count - best.avg);
        for (let i = 1; i < monthlyAvgBuckets.length; i++) {
          const b = monthlyAvgBuckets[i];
          const diff = Math.abs(count - b.avg);
          if (diff < bestDiff) { best = b; bestDiff = diff; }
        }
        return { color: colorForTimes(best.times), hasBaseline: true };
      }
      return { color: "#1976d2", hasBaseline: false };
    };
  
     const makePressHandlers = (key: string) => ({
       onMouseDown: () => setPressedButton(key),
       onMouseUp: () => setPressedButton(null),
       onMouseLeave: () => setPressedButton((prev) => (prev === key ? null : prev)),
     });

     /** Export all sorted candidates to CSV, matching the table columns */
     const exportCSV = useCallback(() => {
       if (!sortedCandidates.length) return;
       const headers = [
         "#", "Main (6)", "Supp (2)", "Prize", "Odd/Even",
         "Comp%", "OGA Raw", "OGA%", "SelHits", "RecentHits",
         "0x", "1x", "2x", "3x", "4x", "5x", "6x", "7x", "8x+",
         "Conv", "IDM", "Rdy",
       ];
       const rows = sortedCandidates.map(({ c, origIdx }, displayIdx) => {
         const i = origIdx;
         const nums = [...c.main, ...c.supp];
         const odd = nums.filter((n: number) => n % 2 === 1).length;
         const even = nums.length - odd;
         const prizeLabel = computePrizeDivision(c.main, c.supp, manualMainSet, manualSuppSet);
         const ogaRaw = (c as any).ogaScore as number | undefined;
         const ogaPct = (c as any).ogaPercentile as number | undefined;
         const selHits = (c as any).selHits ?? nums.filter((n: number) => hitSet.has(n)).length;
         const recentHits = (c as any).recentHits ?? nums.filter((n: number) => recentSet.has(n)).length;
         const bc = getMonthlyBucketCounts(nums);
         const convScore = convergenceScores[i];
         const idmScore = idmScores[i];
         const rdyScore = readinessScores[i];
         return [
           displayIdx + 1,
           c.main.join(" "),
           c.supp.join(" "),
           prizeLabel,
           `${odd}:${even}`,
           (c as any).finalCompositeAdj !== undefined ? ((c as any).finalCompositeAdj * 100).toFixed(2) : "",
           ogaRaw !== undefined ? ogaRaw.toFixed(2) : "",
           ogaPct !== undefined ? ogaPct.toFixed(1) : "",
           selHits,
           recentHits,
           bc ? bc.undrawn : "",
           bc ? bc.times1 : "",
           bc ? bc.times2 : "",
           bc ? bc.times3 : "",
           bc ? bc.times4 : "",
           bc ? bc.times5 : "",
           bc ? bc.times6 : "",
           bc ? bc.times7 : "",
           bc ? bc.times8 : "",
           convScore !== null ? convScore.toFixed(1) : "",
           idmScore !== null ? (idmScore * 100).toFixed(1) : "",
           rdyScore !== null ? (rdyScore * 100).toFixed(1) : "",
         ].map((v) => {
           const s = String(v);
           return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
         }).join(",");
       });
       const csv = [headers.join(","), ...rows].join("\n");
       const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
       const url = URL.createObjectURL(blob);
       const a = document.createElement("a");
       a.href = url;
       a.download = `candidates.csv`;
       a.click();
       URL.revokeObjectURL(url);
     // eslint-disable-next-line react-hooks/exhaustive-deps
     }, [sortedCandidates, convergenceScores, idmScores, readinessScores]);

     return (
     <section style={panel}>
       <header style={hdr}>
         <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
           Generated Candidates
         </div>
         <label style={{ fontSize: 12 }}>
           Count:
            <input
              type="number"
              min={1}
              value={numCandidates}
              onChange={(e) =>
                setNumCandidates(Math.max(1, Number(e.target.value) || 1))
              }
             style={{ width: 80, marginLeft: 6 }}
           />
         </label>
           <button type="button" disabled={isGenerating} onClick={onGenerate} style={genBtn(isGenerating)}>
             {isGenerating ? "Generating…" : "Generate"}
           </button>
           <button
             type="button"
             disabled={candidates.length === 0}
             onClick={exportCSV}
             style={{
               padding: "6px 12px",
               borderRadius: 6,
               border: "1px solid #ccc",
               background: candidates.length > 0 ? "#f5f5f5" : "#e0e0e0",
               color: candidates.length > 0 ? "#333" : "#999",
               cursor: candidates.length > 0 ? "pointer" : "default",
               fontSize: 12,
               fontWeight: 600,
             }}
             title="Export all candidates to CSV file (current sort order)"
           >
             📥 Export CSV
           </button>
          {(isGenerating || elapsedMs > 0) && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color: isGenerating ? "#2563eb" : "#16a34a",
                minWidth: 50,
                textAlign: "center",
              }}
              title={isGenerating ? "Generation in progress…" : "Last generation time"}
            >
              {isGenerating ? "⏱ " : "✓ "}{formatElapsed(elapsedMs)}
            </span>
          )}
         {onAttemptMultiplierChange && (
           <label style={{ fontSize: 12 }} title="Attempt budget = Count × multiplier; increase if constraints are tight">
             Attempts ×
              <input
                type="number"
                min={1}
                step={10}
                value={attemptMultiplier}
                onChange={(e) => {
                  const next = Number(e.target.value) || 400;
                  onAttemptMultiplierChange(Math.max(1, next));
                }}
               style={{ width: 70, marginLeft: 4 }}
             />
           </label>
         )}
         {attemptMultiplier > 50 && (
            <span style={{ color: "#d32f2f", fontSize: 11, fontWeight: 700 }}>
              ⚠️ High multiplier ({attemptMultiplier}×) — generation may be slow
            </span>
          )}
          {onOvergenFactorChange && (
            <label style={{ fontSize: 12 }} title="Over-generation pool = Count × Overgen. A larger pool gives post-filters (MiAN, monthly, OGA cap) more candidates to choose from.">
              Overgen ×
              <input
                type="number"
                min={1}
                step={10}
                value={overgenFactor}
                onChange={(e) => {
                  const next = Number(e.target.value) || 50;
                  onOvergenFactorChange(Math.max(1, next));
                }}
                style={{ width: 70, marginLeft: 4 }}
              />
            </label>
          )}
          {overgenFactor > 200 && (
            <span style={{ color: "#d32f2f", fontSize: 11, fontWeight: 700 }}>
              ⚠️ High overgen ({overgenFactor}×) — may use significant memory
            </span>
          )}
         {numberFreq.length > 0 ? (
           <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, fontSize: 12 }}>
             <span style={{ color: "#555" }}>Number counts:</span>
             {numberFreq.map(([n, c]) => renderNumberWithCount(n, c))}
           </div>
         ) : null}
         {quotaWarning && (
           <span style={{ color: "#d32f2f", fontSize: 12 }}>{quotaWarning}</span>
         )}
         {activeOGABand && (
           <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>
             OGA raw filter: {activeOGABand.lower.toFixed(2)} – {activeOGABand.upper.toFixed(2)}
           </div>
         )}
       </header>

       {candidates.length === 0 ? (
          <div style={{ color: "#777", fontSize: 13 }}>
            No candidates yet. Click Generate.
          </div>
        ) : (
          <>
          {/* Ideal draw composition banner */}
          {idealDrawComp && (
            <div style={{
              fontSize: 12, color: "#333", background: "#f0f4ff", border: "1px solid #c5cae9",
              borderRadius: 5, padding: "6px 10px", marginBottom: 8, display: "flex", alignItems: "center", gap: 8,
            }}>
              <b style={{ color: "#1565c0" }}>Ideal draw composition (IDM target):</b>
              {["0x","1x","2x","3x","4x","5x","6x","7x","8x+"].map((label, idx) => (
                <span key={label} style={{
                  background: idx === 0 ? "#f0f0f0" : "#e3f2fd",
                  border: idx === 0 ? "1px solid #ccc" : "1px solid #90caf9",
                  borderRadius: 3, padding: "1px 6px",
                  fontWeight: idealDrawComp[idx] > 0 ? 600 : 400,
                  color: idealDrawComp[idx] > 0 ? "#333" : "#aaa",
                }}>
                  {label}={idealDrawComp[idx]}
                </span>
              ))}
              <span style={{ color: "#888", marginLeft: 4 }}>
                (draw {idealDrawComp.reduce((a: number, b: number) => a + b, 0)} numbers from these buckets to best match the historical average)
              </span>
            </div>
          )}
          {shouldVirtualise && (
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
              Showing rows {startIdx + 1}–{endIdx} of {totalRows}
            </div>
          )}
          <div
            ref={scrollContainerRef}
            onScroll={handleTableScroll}
            style={{
              maxHeight: shouldVirtualise ? 600 : undefined,
              overflowY: shouldVirtualise ? "auto" : undefined,
              position: "relative",
            }}
          >
          <table style={tbl}>
            <thead>
               <tr style={{ background: "#fafafa" }}>
                 <th style={th}>#</th>
                 <th style={mainTh}>Main (6)</th>
                 <th style={th}>Supp (2)</th>
                 <th style={th}>Manual (M/S)</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("prize")}>Prize{sortIndicator("prize")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("oddEven")}>Odd/Even{sortIndicator("oddEven")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("comp")}>Comp%{sortIndicator("comp")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("ogaRaw")}>OGA Raw{sortIndicator("ogaRaw")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("ogaPct")}>OGA%{sortIndicator("ogaPct")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("selHits")}>{selHeader}{sortIndicator("selHits")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("recentHits")}>RecentHits{sortIndicator("recentHits")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("b0x")}>0x{sortIndicator("b0x")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("b1x")}>1x{sortIndicator("b1x")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("b2x")}>2x{sortIndicator("b2x")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("b3x")}>3x{sortIndicator("b3x")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("b4x")}>4x{sortIndicator("b4x")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("b5x")}>5x{sortIndicator("b5x")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("b6x")}>6x{sortIndicator("b6x")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("b7x")}>7x{sortIndicator("b7x")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("b8x")}>8x+{sortIndicator("b8x")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("conv")} title="Convergence score: how much this candidate moves the current month's frequency distribution toward the historical average. Higher = more convergent.">Conv{sortIndicator("conv")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("idm")} title="Ideal Draw Match: how closely this candidate's bucket composition matches the statistically optimal draw. 100% = perfect match.">IDM{sortIndicator("idm")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("rdy")} title="Readiness score: composite of Ideal Draw Match (bucket composition vs optimal), Convergence, and OGA%. Higher = more statistically ready. Weights configurable in Candidate Generation Influences.">Rdy{sortIndicator("rdy")}</th>
                 <th style={th}>Actions</th>
              </tr>
           </thead>
            <tbody>
              {shouldVirtualise && topPad > 0 && (
                <tr style={{ height: topPad }} aria-hidden="true"><td colSpan={24} /></tr>
              )}
              {visibleCandidates.map(({ c, origIdx }, sliceIdx) => {
                const displayIdx = startIdx + sliceIdx;
                const i = origIdx;
                const isSelRow = i === selectedCandidateIdx;
                const nums: number[] = [...c.main, ...c.supp];
                const selHits = (c as any).selHits ?? nums.filter((n: number) => hitSet.has(n)).length;
                const recentHits = (c as any).recentHits ?? nums.filter((n: number) => recentSet.has(n)).length;
                const odd = nums.filter((n: number) => n % 2 === 1).length;
                const even = nums.length - odd;
                const manualMainHits = c.main.filter((n: number) => manualMainSet.has(n)).length;
                const manualSuppHits = c.supp.filter((n: number) => manualSuppSet.has(n)).length;
                const prizeLabel = computePrizeDivision(c.main, c.supp, manualMainSet, manualSuppSet);
                const shade = selHits
                  ? `rgba(25,118,210,${0.08 + 0.3 * (selHits / 8)})`
                  : isSelRow
                  ? "#FFF9C4"
                  : undefined;
                const ogaRaw = (c as any).ogaScore as number | undefined;
                const ogaPct = (c as any).ogaPercentile as number | undefined;
                const ogaTip = formatOGATooltip(ogaRaw, ogaPct);
                 const isActiveSim = simSourceKind === "candidate" && activeSimCandidateIdx === i;
                 const bucketCounts = getMonthlyBucketCounts(nums);
                 const convScore = convergenceScores[i];
                 const isBestConv = convScore !== null && bestConvergence !== null && convScore === bestConvergence && convScore > 0;
                 const rdyScore = readinessScores[i];
                 const isBestRdy = rdyScore !== null && bestReadiness !== null && rdyScore === bestReadiness && rdyScore > 0;
                 const idmScore = idmScores[i];
                 const isBestIdm = idmScore !== null && bestIdm !== null && idmScore === bestIdm && idmScore > 0;
                 // Gold tint for best-Rdy candidate(s), green for best-Conv, gold takes priority
                 const rdyShade = isBestRdy ? "rgba(255,193,7,0.18)" : undefined;
                 const convShade = isBestConv ? "rgba(46,125,50,0.15)" : undefined;
                 const effectiveShade = rdyShade
                   ? shade ? shade : rdyShade
                   : convShade
                     ? shade ? shade : convShade
                     : shade;
                 const outlineColor = isBestRdy && shade ? "#f9a825" : isBestConv && shade ? "#2e7d32" : undefined;
                 return (
                   <tr
                     key={i}
                     style={{
                       background: effectiveShade,
                       cursor: "pointer",
                       transition: "background 0.12s",
                       outline: outlineColor ? `2px solid ${outlineColor}` : undefined,
                     }}
                     onClick={() => onSelectCandidate(i)}
                      title={`#${i + 1} SelHits=${selHits} RecentHits=${recentHits}${convScore !== null ? ` Conv=${convScore.toFixed(1)}` : ""}${idmScore !== null ? ` IDM=${(idmScore * 100).toFixed(1)}%` : ""}${rdyScore !== null ? ` Rdy=${(rdyScore * 100).toFixed(1)}%` : ""}`}
                  >
                    <td style={tdCenter}>{displayIdx + 1}</td>
                   <td style={mainTd}>{c.main.map((n: number) => renderNumber(n, isActiveSim ? "main" : undefined))}</td>
                   <td style={td}>{c.supp.map((n: number) => renderNumber(n, isActiveSim ? "supp" : undefined))}</td>
                   <td style={manualTd} title="Matches vs Manual Simulation (M/S)">
                     {renderDots(manualMainHits, "#c62828", "#999", "Manual main hits")}
                     <span style={{ color: "#bbb", padding: "0 3px" }}>/</span>
                     {renderDots(manualSuppHits, "#2e7d32", "#999", "Manual supp hits")}
                   </td>
                   <td style={tdCenter}>{prizeLabel}</td>
                   <td style={tdCenter}>{`${odd}:${even}`}</td>
                    <td style={tdCenter}>
                      {(c as any).finalCompositeAdj !== undefined
                        ? ((c as any).finalCompositeAdj * 100).toFixed(2)
                        : ""}
                    </td>
                   <td style={tdCenter} title={ogaTip}>
                     {ogaRaw !== undefined ? ogaRaw.toFixed(2) : ""}
                   </td>
                   <td style={tdCenter} title={ogaTip}>
                     {ogaPct !== undefined ? ogaPct.toFixed(1) : ""}
                   </td>
                   <td style={tdCenter}>{selHits}</td>
                   <td style={tdCenter}>{recentHits}</td>
                   <td style={tdCenter}>{bucketCounts ? bucketCounts.undrawn : "—"}</td>
                   <td style={tdCenter}>{bucketCounts ? bucketCounts.times1 : "—"}</td>
                   <td style={tdCenter}>{bucketCounts ? bucketCounts.times2 : "—"}</td>
                   <td style={tdCenter}>{bucketCounts ? bucketCounts.times3 : "—"}</td>
                   <td style={tdCenter}>{bucketCounts ? bucketCounts.times4 : "—"}</td>
                   <td style={tdCenter}>{bucketCounts ? bucketCounts.times5 : "—"}</td>
                   <td style={tdCenter}>{bucketCounts ? bucketCounts.times6 : "—"}</td>
                   <td style={tdCenter}>{bucketCounts ? bucketCounts.times7 : "—"}</td>
                    <td style={tdCenter}>{bucketCounts ? bucketCounts.times8 : "—"}</td>
                    <td style={{
                      ...tdCenter,
                      fontWeight: isBestConv ? 700 : undefined,
                      color: convScore !== null ? (convScore > 0 ? "#2e7d32" : convScore < 0 ? "#c62828" : undefined) : undefined,
                    }}>
                      {convScore !== null ? (isBestConv ? `⭐ ${convScore.toFixed(1)}` : convScore.toFixed(1)) : "—"}
                    </td>
                    <td style={{
                      ...tdCenter,
                      fontWeight: isBestIdm ? 700 : undefined,
                      color: idmScore !== null ? (idmScore >= 0.875 ? "#1565c0" : idmScore >= 0.5 ? "#2e7d32" : "#888") : undefined,
                    }}>
                      {idmScore !== null ? (isBestIdm ? `⭐ ${(idmScore * 100).toFixed(1)}%` : `${(idmScore * 100).toFixed(1)}%`) : "—"}
                    </td>
                    <td style={{
                      ...tdCenter,
                      fontWeight: isBestRdy ? 700 : undefined,
                      color: rdyScore !== null ? (rdyScore >= 0.7 ? "#b8860b" : rdyScore >= 0.4 ? "#2e7d32" : "#888") : undefined,
                    }}>
                      {rdyScore !== null ? (isBestRdy ? `⭐ ${(rdyScore * 100).toFixed(1)}%` : `${(rdyScore * 100).toFixed(1)}%`) : "—"}
                    </td>
                    <td style={tdCenter}>
                     <button
                       type="button"
                       onClick={(e) => {
                         e.stopPropagation();
                         onSimulateCandidate?.(i);
                       }}
                       style={{
                         ...simBtn,
                         background: isActiveSim ? "#1976d2" : simBtn.background as string,
                         color: isActiveSim ? "#fff" : simBtn.color as string,
                         border: isActiveSim ? "1px solid #1976d2" : simBtn.border as string,
                       }}
                     >
                       {isActiveSim ? "Simulated" : "Simulate"}
                     </button>
                   </td>
                 </tr>
               );
             })}
              {shouldVirtualise && bottomPad > 0 && (
                <tr style={{ height: bottomPad }} aria-hidden="true"><td colSpan={24} /></tr>
              )}
           </tbody>
          </table>
          </div>
          </>
        )}

        <ManualSim
          manualSimSelected={manualSimSelected}
          setManualSimSelected={setManualSimSelected}
          onManualSimulationChanged={onManualSimulationChanged}
          toggleManualPick={toggleManualPick}
          numberToBucket={numberToBucket}
          currentDist={currentDist}
          targetDist={targetDist}
        />

       {/* Exhaustive from selected numbers */}
       <div style={exPanel}>
         <div style={{ fontWeight: 600, marginBottom: 6 }}>Exhaustive from selected numbers</div>
         <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", fontSize: 12 }}>
           <label>
             <input type="radio" value="user" checked={exSource === "user"} onChange={() => setExSource("user")} /> User Selected
           </label>
           <label>
             <input type="radio" value="manual" checked={exSource === "manual"} onChange={() => setExSource("manual")} /> Manual Sim (8)
           </label>
           <label>
             <input type="radio" value="custom" checked={exSource === "custom"} onChange={() => setExSource("custom")} /> Custom
           </label>
           <label>
             Cap
             <input type="number" min={1} value={exCap} onChange={(e) => setExCap(Math.max(1, Number(e.target.value) || 1))} style={{ width: 80, marginLeft: 6 }} />
           </label>
           <label>
             Page size
             <input type="number" min={10} max={500} value={exPageSize} onChange={(e) => setExPageSize(Math.max(10, Math.min(500, Number(e.target.value) || 10)))} style={{ width: 70, marginLeft: 6 }} />
           </label>
           <button type="button" onClick={handleExhaustiveGenerate} disabled={!poolHasEnough} style={genBtn(!poolHasEnough)}>
             {poolHasEnough ? "Generate exhaustive" : `Need at least 8 numbers (have ${exhaustivePool.length})`}
           </button>
         </div>
         {exSource === "custom" && (
           <div style={{ marginTop: 8 }}>
             <input
               type="text"
               value={exCustomInput}
               onChange={(e) => setExCustomInput(e.target.value)}
               placeholder="Comma or space separated numbers"
               style={{ width: "100%", padding: 6 }}
             />
           </div>
         )}
         <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
           Pool: {exhaustivePool.length} numbers → combos: {totalCombosEstimate.toLocaleString()} {exCapped ? "(showing capped subset)" : ""}
         </div>
         {exCombos.length > 0 && (
           <div style={{ marginTop: 8 }}>
             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
               <span>
                 Showing {exPage * exPageSize + 1} – {Math.min((exPage + 1) * exPageSize, exCombos.length)} of {exCombos.length}
               </span>
               <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                 <button
                   type="button"
                   onClick={() => setExPage(0)}
                   disabled={exPage === 0}
                   style={simBtn}
                 >
                   First
                 </button>
                 <button
                   type="button"
                   onClick={() => setExPage(Math.max(0, exPage - 1))}
                   disabled={exPage === 0}
                   style={simBtn}
                 >
                   Prev
                 </button>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                  Page
                  <select
                    value={exPage}
                    onChange={(e) => setExPage(Number(e.target.value))}
                    disabled={exTotalPages <= 1}
                    style={{ padding: "2px 4px", borderRadius: 4, border: "1px solid #ccc" }}
                  >
                    {Array.from({ length: exTotalPages }, (_, idx) => (
                      <option key={`ex-page-${idx}`} value={idx}>
                        {idx + 1}
                      </option>
                    ))}
                  </select>
                  / {Math.max(exTotalPages, 1)}
                </label>
                 <button
                   type="button"
                   onClick={() => setExPage(Math.min(Math.max(0, exTotalPages - 1), exPage + 1))}
                   disabled={exPage + 1 >= exTotalPages}
                   style={simBtn}
                 >
                   Next
                 </button>
                 <button
                   type="button"
                   onClick={() => setExPage(Math.max(0, exTotalPages - 1))}
                   disabled={exPage + 1 >= exTotalPages}
                   style={simBtn}
                 >
                   Last
                 </button>
               </div>
             </div>
             <table style={exTbl}>
               <thead>
                 <tr style={{ background: "#fafafa" }}>
                   <th style={th}>#</th>
                   <th style={mainTh}>Main (6)</th>
                   <th style={th}>Supp (2)</th>
                   <th style={th}>Odd/Even</th>
                   <th style={th}>OGA Raw</th>
                   <th style={th}>OGA%</th>
                  <th style={th}>Sim</th>
                 </tr>
               </thead>
               <tbody>
                 {exPageCombos.map((combo, idx) => {
                    const nums = [...combo.main, ...combo.supp];
                    const odd = nums.filter((n) => n % 2 === 1).length;
                    const even = nums.length - odd;
                    const ogaRaw = (combo as any).ogaScore as number | undefined;
                    const ogaPct = (combo as any).ogaPercentile as number | undefined;
                    const ogaTip = formatOGATooltip(ogaRaw, ogaPct);
                    const canSim = onSimulateNumbers && nums.length === 8;
                    const pressKey = `ex-${exPage}-${idx}`;
                    const isPressed = pressedButton === pressKey;
                     return (
                       <tr key={`ex-${exPage}-${idx}`}>
                         <td style={tdCenter}>{exPage * exPageSize + idx + 1}</td>
                         <td style={mainTd}>{combo.main.map((n) => renderNumber(n))}</td>
                         <td style={td}>{combo.supp.map((n) => renderNumber(n))}</td>
                         <td style={tdCenter}>{`${odd}:${even}`}</td>
                         <td style={tdCenter} title={ogaTip}>{ogaRaw !== undefined ? ogaRaw.toFixed(2) : ""}</td>
                         <td style={tdCenter} title={ogaTip}>{ogaPct !== undefined ? ogaPct.toFixed(1) : ""}</td>
                        <td style={tdCenter}>
                          <button
                            type="button"
                            onClick={() => onSimulateNumbers?.(nums)}
                            disabled={!canSim}
                            style={{
                              ...simBtn,
                              opacity: canSim ? 1 : 0.5,
                              cursor: canSim ? "pointer" : "not-allowed",
                              background: isPressed ? "#1565c0" : simBtn.background,
                              color: isPressed ? "#fff" : simBtn.color,
                              boxShadow: isPressed ? "inset 0 2px 4px rgba(0,0,0,0.25)" : simBtn.boxShadow,
                              transform: isPressed ? "translateY(1px)" : undefined,
                            }}
                            title={canSim ? "Simulate this combo" : "Need simulate handler"}
                            {...makePressHandlers(pressKey)}
                          >
                            Simulate
                          </button>
                        </td>
                       </tr>
                     );
                   })}
               </tbody>
             </table>
           </div>
         )}
       </div>
 
       {/* Batch Frequency Debug Section */}
       <div style={batchPanel}>
         <div style={{ fontWeight: 600, marginBottom: 8 }}>Batch Frequency</div>
         <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
           <label style={{ fontSize: 12 }}>
             Batch size:
             <input
               type="number"
               min={1}
               value={batchSize}
               onChange={(e) => setBatchSize(Math.max(1, Number(e.target.value) || 1))}
               style={{ width: 80, marginLeft: 6 }}
             />
           </label>
           <button
             type="button"
             onClick={onRunBatch}
             disabled={isBatching || isBatchSessionRunning}
             style={{
               ...genBtn(isBatching || isBatchSessionRunning),
               width: 120,
             }}
           >
             {isBatching ? "Running batch..." : "Run batch"}
           </button>
           <label style={{ fontSize: 12 }}>
             Session runs:
             <input
               type="number"
               min={1}
               max={200}
               value={batchSessionRuns}
               onChange={(e) => setBatchSessionRuns(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
               style={{ width: 70, marginLeft: 6 }}
             />
           </label>
           <button
             type="button"
             onClick={onRunBatchSession}
             disabled={isBatching || isBatchSessionRunning}
             style={{ ...genBtn(isBatching || isBatchSessionRunning), width: 140 }}
           >
             {isBatchSessionRunning ? "Session running..." : "Run session"}
           </button>
           {batchSessionProgress > 0 && (
             <span style={{ fontSize: 12, color: "#1976d2" }}>
               Session progress: {batchSessionProgress}/{batchSessionRuns}
             </span>
           )}
         </div>
         {batchSummary && (
           <div style={{ marginTop: 8, fontSize: 12, color: "#333" }}>
             {batchSummary}
           </div>
         )}
         <div style={{ marginTop: 12, fontSize: 12, color: "#555" }}>
           Batch frequency data {batchFreq.length ? `(entries: ${batchFreq.length})` : "(none yet)"}
         </div>
         <div style={{ marginTop: 6 }}>
           {batchFreq.length === 0 ? (
             <div style={{ fontSize: 12, color: "#999" }}>Run batch to see per-number counts.</div>
           ) : (
             <div
               style={{
                 display: "grid",
                 gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))",
                 gap: 6,
                 alignItems: "center",
                 fontSize: 12,
               }}
             >
               {batchFreq.map(({ n, count }, idx) => {
                 const isTop = idx < 8;
                 const { color, hasBaseline } = isTop ? pickBucketColor(n, count) : { color: "#f5f5f5", hasBaseline: false };
                 const countBg = isTop ? color.replace(/0\.([0-9]+)/, "0.15") || "rgba(0,0,0,0.08)" : "#fafafa";
                 return (
                   <div
                     key={n}
                     style={{
                       border: isTop ? `1px solid ${color}` : "1px solid #e0e0e0",
                       borderRadius: 6,
                       padding: "6px 8px",
                       display: "flex",
                       justifyContent: "space-between",
                       alignItems: "center",
                       background: isTop ? "#fff" : "#fff",
                       boxShadow: isTop ? `0 1px 4px ${color.replace("0.", "0.4")}` : undefined,
                       gap: 6,
                     }}
                   >
                     <span
                       style={{
                         padding: "2px 6px",
                         fontSize: 12,
                         background: color,
                         color: "#000",
                         borderRadius: 4,
                         fontWeight: 700,
                         lineHeight: 1.2,
                         minWidth: 28,
                         textAlign: "center",
                         whiteSpace: "nowrap",
                       }}
                       title={isTop ? (hasBaseline ? "Color from Monthly bucket" : "Top frequency (fallback)") : undefined}
                     >
                       {n}
                     </span>
                     <span
                       style={{
                         padding: "2px 6px",
                         borderRadius: 4,
                         background: countBg,
                         border: `1px solid ${isTop ? color : "#ddd"}`,
                         color: isTop ? "#c00" : "#c00",
                         fontVariantNumeric: "tabular-nums",
                         fontWeight: 700,
                         minWidth: 34,
                         textAlign: "center",
                         whiteSpace: "nowrap",
                       }}
                     >
                       {count}
                     </span>
                   </div>
                 );
                })}
              </div>
            )}
          </div>

          {/* Batch session aggregate */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ fontWeight: 600 }}>Session aggregate (top 8)</div>
              <button
                type="button"
                onClick={() => simulateTopList(batchSessionAggregate)}
                disabled={!onSimulateNumbers || batchSessionAggregate.length < 8}
                style={{
                  ...simBtn,
                  padding: "4px 10px",
                  opacity: batchSessionAggregate.length < 8 ? 0.5 : 1,
                  background: pressedButton === "agg" ? "#1565c0" : simBtn.background,
                  color: pressedButton === "agg" ? "#fff" : simBtn.color,
                  boxShadow: pressedButton === "agg" ? "inset 0 2px 4px rgba(0,0,0,0.25)" : simBtn.boxShadow,
                  transform: pressedButton === "agg" ? "translateY(1px)" : undefined,
                }}
                title={batchSessionAggregate.length < 8 ? "Need 8 numbers to simulate" : "Simulate these 8 numbers"}
                {...makePressHandlers("agg")}
              >
                Simulate
              </button>
            </div>
            {batchSessionAggregate.length === 0 ? (
              <div style={{ fontSize: 12, color: "#999" }}>Run a session to see aggregate top numbers.</div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))",
                  gap: 6,
                  fontSize: 12,
                }}
              >
                {batchSessionAggregate.map(({ n, count }) => (
                  <div
                    key={`agg-${n}`}
                    style={{
                      border: "1px solid #1976d2",
                      borderRadius: 6,
                      padding: "6px 8px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "linear-gradient(135deg, #e8f0ff, #fff)",
                      boxShadow: "0 1px 4px rgba(25,118,210,0.2)",
                    }}
                  >
                    <span style={{ fontWeight: 700, color: "#0d47a1" }}>{n}</span>
                    <span style={{ fontWeight: 700, color: "#0d47a1", fontVariantNumeric: "tabular-nums" }}>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Batch session per-run tops */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Session runs (top 8 per run)</div>
            {batchSessionTopSeries.length === 0 ? (
              <div style={{ fontSize: 12, color: "#999" }}>No session data yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                {batchSessionTopSeries.map(({ run, tops }) => (
                  <div
                    key={`run-${run}`}
                    style={{
                      border: "1px solid #e0e0e0",
                      borderRadius: 6,
                      padding: 8,
                      background: "#fafafa",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{ fontWeight: 700 }}>Run {run}</div>
                      <button
                        type="button"
                        onClick={() => simulateTopList(tops)}
                        disabled={!onSimulateNumbers || tops.length < 8}
                        style={{
                          ...simBtn,
                          padding: "3px 8px",
                          opacity: tops.length < 8 ? 0.5 : 1,
                          background: pressedButton === `run-${run}` ? "#1565c0" : simBtn.background,
                          color: pressedButton === `run-${run}` ? "#fff" : simBtn.color,
                          boxShadow: pressedButton === `run-${run}` ? "inset 0 2px 4px rgba(0,0,0,0.25)" : simBtn.boxShadow,
                          transform: pressedButton === `run-${run}` ? "translateY(1px)" : undefined,
                        }}
                        title={tops.length < 8 ? "Need 8 numbers to simulate" : "Simulate this run's top 8"}
                        {...makePressHandlers(`run-${run}`)}
                      >
                        Simulate
                      </button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {tops.map(({ n, count }) => (
                        <span key={`run-${run}-n-${n}`} style={{ display: "inline-flex", gap: 4, alignItems: "center", padding: "2px 6px", borderRadius: 4, background: "#fff", border: "1px solid #ddd" }}>
                          <span style={{ fontWeight: 700 }}>{n}</span>
                          <span style={{ fontVariantNumeric: "tabular-nums", color: "#1976d2" }}>{count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
       </div>
     </section>
   );
};

const ManualSim: React.FC<{
  manualSimSelected: number[];
  setManualSimSelected: React.Dispatch<React.SetStateAction<number[]>>;
  onManualSimulationChanged?: (next: number[]) => void;
  toggleManualPick: (n: number) => void;
  numberToBucket: Map<number, number> | null;
  currentDist: number[] | null;
  targetDist: number[] | null;
}> = ({
  manualSimSelected,
  setManualSimSelected,
  onManualSimulationChanged,
  toggleManualPick,
  numberToBucket,
  currentDist,
  targetDist,
}) => {
  // Compute before/after distribution when 8 numbers are selected
  const bucketLabels = ["0x", "1x", "2x", "3x", "4x", "5x", "6x", "7x", "8x+"];
  const showBeforeAfter = manualSimSelected.length === 8 && numberToBucket && currentDist && targetDist;

  const postDist = React.useMemo((): number[] | null => {
    if (!showBeforeAfter) return null;
    const post = [...currentDist];
    manualSimSelected.forEach((n) => {
      const bucket = numberToBucket.get(n);
      if (bucket === undefined) return;
      post[bucket] -= 1;
      const newBucket = Math.min(bucket + 1, 8);
      post[newBucket] += 1;
    });
    return post;
  }, [showBeforeAfter, currentDist, numberToBucket, manualSimSelected]);

  return (
    <div style={manual}>
      <div style={{ marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
        Manual Simulation (select up to 8; first 6 main, next 2 supp)
      </div>

      {showBeforeAfter && postDist && (
        <div style={{ marginBottom: 10, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={{ padding: "3px 6px", textAlign: "left", borderBottom: "1px solid #ddd" }}></th>
                {bucketLabels.map((l) => (
                  <th key={l} style={{ padding: "3px 6px", textAlign: "center", borderBottom: "1px solid #ddd", minWidth: 32 }}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: "3px 6px", fontWeight: 600, color: "#555", borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>Avg (target)</td>
                {targetDist.map((v, idx) => (
                  <td key={idx} style={{ padding: "3px 6px", textAlign: "center", borderBottom: "1px solid #eee", color: "#1565c0", fontWeight: 600 }}>{v}</td>
                ))}
              </tr>
              <tr>
                <td style={{ padding: "3px 6px", fontWeight: 600, color: "#555", borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>Before</td>
                {currentDist.map((v, idx) => {
                  const diff = v - targetDist[idx];
                  const color = diff > 0 ? "#c62828" : diff < 0 ? "#2e7d32" : "#333";
                  return (
                    <td key={idx} style={{ padding: "3px 6px", textAlign: "center", borderBottom: "1px solid #eee", color }}>{v}</td>
                  );
                })}
              </tr>
              <tr>
                <td style={{ padding: "3px 6px", fontWeight: 600, color: "#555", borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>After</td>
                {postDist.map((v, idx) => {
                  const diff = v - targetDist[idx];
                  const color = diff === 0 ? "#2e7d32" : diff > 0 ? "#e65100" : "#1565c0";
                  const bold = diff === 0;
                  return (
                    <td key={idx} style={{ padding: "3px 6px", textAlign: "center", borderBottom: "1px solid #eee", color, fontWeight: bold ? 700 : undefined }}>{v}</td>
                  );
                })}
              </tr>
              <tr>
                <td style={{ padding: "3px 6px", fontWeight: 600, color: "#555", whiteSpace: "nowrap" }}>Δ needed</td>
                {postDist.map((v, idx) => {
                  const delta = targetDist[idx] - v;
                  const color = delta === 0 ? "#2e7d32" : delta > 0 ? "#1565c0" : "#c62828";
                  return (
                    <td key={idx} style={{ padding: "3px 6px", textAlign: "center", color, fontWeight: delta === 0 ? 700 : undefined }}>
                      {delta === 0 ? "✓" : delta > 0 ? `+${delta}` : `${delta}`}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 10, color: "#555", marginTop: 4 }}>
            <span style={{ fontWeight: 600 }}>After:</span>
            <span><span style={{ color: "#2e7d32", fontWeight: 700 }}>■</span> Matches target</span>
            <span><span style={{ color: "#e65100", fontWeight: 700 }}>■</span> Still over target</span>
            <span><span style={{ color: "#1565c0", fontWeight: 700 }}>■</span> Still under target</span>
            <span style={{ marginLeft: 8, fontWeight: 600 }}>Δ needed:</span>
            <span><span style={{ color: "#2e7d32", fontWeight: 700 }}>✓</span> On target</span>
            <span><span style={{ color: "#1565c0", fontWeight: 700 }}>+N</span> Need more</span>
            <span><span style={{ color: "#c62828", fontWeight: 700 }}>−N</span> Over by N</span>
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {Array.from({ length: 45 }, (_, i) => i + 1).map((n) => {
          const idx = manualSimSelected.indexOf(n);
          const picked = idx !== -1;
          const atCapacity = manualSimSelected.length >= 8 && !picked;
          const slotColor = picked ? (idx < 6 ? "#4a6fe3" : "#8e44ad") : "#fff";
          return (
            <label
              key={n}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: 34,
                padding: 4,
                border: "1px solid #bbb",
                borderRadius: 6,
                background: slotColor,
                color: picked ? "#fff" : "#333",
                opacity: atCapacity ? 0.35 : 1,
                cursor: atCapacity ? "not-allowed" : "pointer",
                fontSize: 11,
              }}
              title={
                picked
                  ? `Slot ${idx + 1}`
                  : atCapacity
                  ? "Capacity full"
                  : "Add to manual simulation"
              }
            >
              <input
                type="checkbox"
                checked={picked}
                disabled={atCapacity}
                onChange={() => {
                  setManualSimSelected((prev) => {
                    const next = prev.includes(n)
                      ? prev.filter((x) => x !== n)
                      : prev.length >= 8
                      ? prev
                      : [...prev, n];
                    onManualSimulationChanged?.(next);
                    return next;
                  });
                }}
                style={{ marginBottom: 2 }}
              />
              {n}
            </label>
          );
        })}
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: "#555" }}>
        Manual simulation highlights the Temperature Heatmap only.
        Use “Simulate” in the table to add a column to the DGA grid.
      </div>
    </div>
  );
};

/* Styles */
const panel: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 8,
  padding: 16,
  background: "#fff",
  marginTop: 18,
};
const hdr: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 6,
};
const genBtn = (disabled: boolean): React.CSSProperties => ({
  padding: "6px 14px",
  background: disabled ? "#bbb" : "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  fontWeight: 600,
  cursor: disabled ? "default" : "pointer",
});
const tbl: React.CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
  fontSize: 12,
};
const td: React.CSSProperties = {
  padding: "4px 6px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
  textAlign: "left",
};
const tdCenter: React.CSSProperties = { ...td, textAlign: "center" };
const th: React.CSSProperties = {
  textAlign: "center",
  padding: "4px 6px",
  borderBottom: "1px solid #ddd",
  fontWeight: 600,
  whiteSpace: "nowrap",
};
const mainTh: React.CSSProperties = { ...th, width: 170 };
const mainTd: React.CSSProperties = { ...td, width: 170, minWidth: 0 };
const manualTd: React.CSSProperties = { ...tdCenter, fontWeight: 600 };
const simBtn: React.CSSProperties = {
   padding: "4px 8px",
   borderRadius: 4,
   border: "1px solid #ccc",
   background: "#fff",
   cursor: "pointer",
   fontSize: 11,
 };
const manual: React.CSSProperties = {
  marginTop: 16,
  borderTop: "1px solid #ddd",
  paddingTop: 10,
  background: "#f7f3ff",
  borderRadius: 6,
};
const batchPanel: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  borderRadius: 6,
  background: "#f3f4f6",
  border: "1px solid #ddd",
};
const exPanel: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  borderRadius: 6,
  background: "#e8f0fe",
  border: "1px solid #ddd",
};
const exTbl: React.CSSProperties = { ...tbl, marginTop: 6 };
const colorForTimes = (times: number): string => {
    const palette: Record<number, string> = {
      0: "rgba(117,117,117,0.70)",
      1: "rgba(66,165,245,0.70)",
      2: "rgba(102,187,106,0.70)",
      3: "rgba(38,198,218,0.70)",
      4: "rgba(251,192,45,0.70)",
      5: "rgba(251,140,0,0.72)",
      6: "rgba(244,81,30,0.72)",
      7: "rgba(229,57,53,0.74)",
      8: "rgba(142,36,170,0.74)",
    };
    return palette[times] ?? "rgba(142,36,170,0.74)";
  };

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { generateExhaustiveCombos } from "../../lib/exhaustiveGenerator";
import { isDisplayedValueInRange } from "../../lib/generatedCandidateFilterUtils";
import { computeOGA, getOGAPercentile } from "../../utils/oga";
import { CandidateSet, Draw } from "../../types";
import {
  computeWeekdayWindfallPrizeDivision,
  computeWeekdayWindfallPrizeScore,
} from "../../lib/prizeDivisions";
import { ogaPercentileToSimilarity } from "../../lib/ogaQuality";

/** Settings snapshot captured at export time — written as ## comment rows in CSV */
export interface ExportSettings {
  excludedNumbers: number[];
  /** HC3-excluded numbers (overlap of last two draws) — silently injected by generateCandidates */
  hc3Exclusions: number[];
  /** SDE1-excluded numbers */
  sde1Exclusions: number[];
  selectedOddEvenRatios: string[];
  lambdaEnabled: boolean;
  lambda: number;
  selectedBoostEnabled: boolean;
  selectedBoostFactor: number;
  monthlyBoostPenalize: boolean;
  /** Whether monthly constructive fill is active */
  monthlyConstructiveEnabled: boolean;
  /** Per-bucket required counts for constructive fill */
  monthlyConstructiveConstraints?: {
    undrawn: number; times1: number; times2: number; times3: number;
    times4: number; times5: number; times6: number; times7: number; times8: number;
  };
  minRecentMatches: number;
  recentMatchBias: number;
  entropyEnabled: boolean;
  entropyThreshold: number;
  hammingEnabled: boolean;
  hammingThreshold: number;
  jaccardEnabled: boolean;
  jaccardThreshold: number;
  /** Whether HC3 is enabled */
  enableHC3: boolean;
  /** Whether SDE1 is enabled */
  enableSDE1: boolean;
}

export interface GeneratedCandidatesPanelProps {
  onGenerate: () => void;
  candidates: CandidateSet[];
  /** Settings fingerprint written as ## comment rows at the top of every CSV export */
  exportSettings?: ExportSettings;
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
  simSourceKind?: "none" | "candidate" | "user" | "dga-strip";

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
  /** Full unfiltered draw history — used for the Historical Prize Backtest so all draws
   *  are checked regardless of the active generation window. Falls back to historyForOGA. */
  fullHistory?: Draw[];
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
  /** Odd/Even ratio options from draw history — used to populate the filter dropdown */
  ratioOptions?: { ratio: string }[];
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
  exportSettings,
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
  fullHistory,
  ogaRefScores,
  ogaSpokeCount,
  attemptMultiplier = 400,
  onAttemptMultiplierChange,
  overgenFactor = 50,
  onOvergenFactorChange,
  rdyWeights = { idm: 0.70, conv: 0.10, oga: 0.20 },
  enableOGA = true,
  ratioOptions = [],
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
    type SortKey = "nrr" | "ns" | "win" | "rdy" | "idm" | "conv" | "comp" | "ogaRaw" | "ogaPct" | "selHits" | "recentHits" | "oddEven" | "prize" | "b0x" | "b1x" | "b2x" | "b3x" | "b4x" | "b5x" | "b6x" | "b7x" | "b8x" | "recommended" | null;
    const [sortKey, setSortKey] = useState<SortKey>("prize");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const toggleSort = (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir(key === "nrr" || key === "ns" || key === "win" || key === "rdy" || key === "idm" || key === "conv" || key === "comp" || key === "ogaPct" || key === "selHits" || key === "recentHits" || key === "prize" || key?.startsWith("b") ? "desc" : "asc");
      }
    };
    const sortIndicator = (key: SortKey): string => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");
    const sortableStyle: React.CSSProperties = { cursor: "pointer", userSelect: "none" };

    const recentSet = new Set([...(mostRecentDraw?.main || []), ...(mostRecentDraw?.supp || [])]);

    // --- Multi-column range filter ---
    interface RangeFilter {
      /** exact dropdown match */
      oddEven: string;
      /** exact integer match */
      selHits: string;
      recentHits: string;
      b0x: string;
      b1x: string;
      b2x: string;
      b3x: string;
      b4x: string;
      b5x: string;
      b6x: string;
      b7x: string;
      b8x: string;
      /** comma/space-separated exact inclusion search */
      mainNumbers: string;
      suppNumbers: string;
      singleDigitNumbers: string;
      twoDigitNumbers: string;
      numberSearchMode: "all" | "any";
      /** range (min/max) fields */
      compMin: string; compMax: string;
      ogaRawMin: string; ogaRawMax: string;
      ogaPctMin: string; ogaPctMax: string;
      convMin: string; convMax: string;
      idmMin: string; idmMax: string;
      rdyMin: string; rdyMax: string;
      winMin: string; winMax: string;
      nrrMin: string; nrrMax: string;
      nsMin: string; nsMax: string;
    }
    const emptyFilter: RangeFilter = {
      oddEven: "", selHits: "", recentHits: "",
      b0x: "", b1x: "", b2x: "", b3x: "", b4x: "", b5x: "", b6x: "", b7x: "", b8x: "",
      mainNumbers: "", suppNumbers: "", singleDigitNumbers: "", twoDigitNumbers: "", numberSearchMode: "all",
      compMin: "", compMax: "",
      ogaRawMin: "", ogaRawMax: "",
      ogaPctMin: "", ogaPctMax: "",
      convMin: "", convMax: "",
      idmMin: "", idmMax: "",
      rdyMin: "", rdyMax: "",
      winMin: "", winMax: "",
      nrrMin: "", nrrMax: "",
      nsMin: "", nsMax: "",
    };
    const [rangeFilter, setRangeFilter] = useState<RangeFilter>(emptyFilter);
    /** Committed filter — only updated when user clicks Search */
    const [committedFilter, setCommittedFilter] = useState<RangeFilter>(emptyFilter);
    const [filterEnabled, setFilterEnabled] = useState(false);
    /** Sort by match: "off" = hide non-matches, "desc" = matches first, "asc" = matches last */
    const [filterPinned, setFilterPinned] = useState<"off" | "desc" | "asc">("off");

    // --- Historical Prize Backtest ---
    const [showHistoricalBacktest, setShowHistoricalBacktest] = useState(false);
    const [backtestWindow, setBacktestWindow] = useState<number | "all">(20);
    /** Which backtest row (by display index) is expanded to show qualifying candidates */
    const [expandedBacktestRow, setExpandedBacktestRow] = useState<number | null>(null);
    const toggleFilterPinned = () => {
      setFilterPinned((prev) => {
        if (prev === "off") return "desc";
        if (prev === "desc") return "asc";
        return "off";
      });
    };
    const updateFilter = (field: keyof RangeFilter, value: string) => {
      setRangeFilter((prev) => ({ ...prev, [field]: value }));
    };
    const applyFilter = () => {
      if (draftNumberSearchErrors.length > 0) return;
      setCommittedFilter(rangeFilter);
    };
    const [filterSaveFlash, setFilterSaveFlash] = useState<"saved" | "loaded" | null>(null);
    const saveFilter = () => {
      try {
        localStorage.setItem("wf_filter_saved", JSON.stringify(rangeFilter));
        setFilterSaveFlash("saved");
        setTimeout(() => setFilterSaveFlash(null), 1500);
      } catch { /* ignore */ }
    };
    const loadFilter = () => {
      try {
        const raw = localStorage.getItem("wf_filter_saved");
        if (raw) {
          const saved = JSON.parse(raw);
          const merged = { ...emptyFilter, ...saved } as RangeFilter;
          setRangeFilter(merged);
          setCommittedFilter(merged);
          setFilterSaveFlash("loaded");
          setTimeout(() => setFilterSaveFlash(null), 1500);
        }
      } catch { /* ignore */ }
    };
    const hasSavedFilter = !!(() => { try { return localStorage.getItem("wf_filter_saved"); } catch { return null; } })();
    const clearFilter = () => { setRangeFilter(emptyFilter); setCommittedFilter(emptyFilter); setFilterPinned("off"); };

    interface ParsedNumberSearch {
      numbers: number[];
      invalidTokens: string[];
    }

    const parseNumberSearchValue = useCallback((raw: string, min: number, max: number): ParsedNumberSearch => {
      const tokens = raw
        .split(/[\s,]+/)
        .map((token) => token.trim())
        .filter(Boolean);
      const numbers: number[] = [];
      const invalidTokens: string[] = [];
      const seen = new Set<number>();
      tokens.forEach((token) => {
        const parsed = Number(token);
        if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
          invalidTokens.push(token);
          return;
        }
        if (!seen.has(parsed)) {
          seen.add(parsed);
          numbers.push(parsed);
        }
      });
      return { numbers, invalidTokens };
    }, []);

    const draftMainNumberSearch = useMemo(
      (): ParsedNumberSearch => parseNumberSearchValue(rangeFilter.mainNumbers, 1, 45),
      [parseNumberSearchValue, rangeFilter.mainNumbers],
    );
    const draftSuppNumberSearch = useMemo(
      (): ParsedNumberSearch => parseNumberSearchValue(rangeFilter.suppNumbers, 1, 45),
      [parseNumberSearchValue, rangeFilter.suppNumbers],
    );
    const draftSingleDigitNumberSearch = useMemo(
      (): ParsedNumberSearch => parseNumberSearchValue(rangeFilter.singleDigitNumbers, 1, 9),
      [parseNumberSearchValue, rangeFilter.singleDigitNumbers],
    );
    const draftTwoDigitNumberSearch = useMemo(
      (): ParsedNumberSearch => parseNumberSearchValue(rangeFilter.twoDigitNumbers, 10, 45),
      [parseNumberSearchValue, rangeFilter.twoDigitNumbers],
    );
    const committedMainNumberSearch = useMemo(
      (): ParsedNumberSearch => parseNumberSearchValue(committedFilter.mainNumbers, 1, 45),
      [parseNumberSearchValue, committedFilter.mainNumbers],
    );
    const committedSuppNumberSearch = useMemo(
      (): ParsedNumberSearch => parseNumberSearchValue(committedFilter.suppNumbers, 1, 45),
      [parseNumberSearchValue, committedFilter.suppNumbers],
    );
    const committedSingleDigitNumberSearch = useMemo(
      (): ParsedNumberSearch => parseNumberSearchValue(committedFilter.singleDigitNumbers, 1, 9),
      [parseNumberSearchValue, committedFilter.singleDigitNumbers],
    );
    const committedTwoDigitNumberSearch = useMemo(
      (): ParsedNumberSearch => parseNumberSearchValue(committedFilter.twoDigitNumbers, 10, 45),
      [parseNumberSearchValue, committedFilter.twoDigitNumbers],
    );
    const draftNumberSearchMode = rangeFilter.numberSearchMode === "any" ? "any" : "all";
    const committedNumberSearchMode = committedFilter.numberSearchMode === "any" ? "any" : "all";
    const committedMainSearchSet = useMemo(() => new Set(committedMainNumberSearch.numbers), [committedMainNumberSearch]);
    const committedSuppSearchSet = useMemo(() => new Set(committedSuppNumberSearch.numbers), [committedSuppNumberSearch]);
    const committedSingleDigitSearchSet = useMemo(() => new Set(committedSingleDigitNumberSearch.numbers), [committedSingleDigitNumberSearch]);
    const committedTwoDigitSearchSet = useMemo(() => new Set(committedTwoDigitNumberSearch.numbers), [committedTwoDigitNumberSearch]);
    const hasCommittedNumberSearch = committedMainNumberSearch.numbers.length > 0
      || committedSuppNumberSearch.numbers.length > 0
      || committedSingleDigitNumberSearch.numbers.length > 0
      || committedTwoDigitNumberSearch.numbers.length > 0;
    const isFilteringActive = filterEnabled || hasCommittedNumberSearch;
    const draftNumberSearchErrors = [
      ...draftMainNumberSearch.invalidTokens.map((token) => `Main: ${token}`),
      ...draftSuppNumberSearch.invalidTokens.map((token) => `Supp: ${token}`),
      ...draftSingleDigitNumberSearch.invalidTokens.map((token) => `Single digit: ${token}`),
      ...draftTwoDigitNumberSearch.invalidTokens.map((token) => `Two digit: ${token}`),
    ];
    const applyNumberSearch = (): void => {
      if (draftNumberSearchErrors.length > 0) return;
      setCommittedFilter((prev) => ({
        ...prev,
        mainNumbers: rangeFilter.mainNumbers,
        suppNumbers: rangeFilter.suppNumbers,
        singleDigitNumbers: rangeFilter.singleDigitNumbers,
        twoDigitNumbers: rangeFilter.twoDigitNumbers,
        numberSearchMode: draftNumberSearchMode,
      }));
    };
    const clearNumberSearch = (): void => {
      setRangeFilter((prev) => ({
        ...prev,
        mainNumbers: "",
        suppNumbers: "",
        singleDigitNumbers: "",
        twoDigitNumbers: "",
        numberSearchMode: "all",
      }));
      setCommittedFilter((prev) => ({
        ...prev,
        mainNumbers: "",
        suppNumbers: "",
        singleDigitNumbers: "",
        twoDigitNumbers: "",
        numberSearchMode: "all",
      }));
      if (!filterEnabled) setFilterPinned("off");
    };

    // Auto-switch sort on meaningful transitions:
    //   → 8 selected: snapshot current sort+filter state to localStorage, then switch to Prize
    //   8 → fewer: restore the snapshot so the user's previous view is preserved
    // Intermediate changes (e.g. 7→6) do NOT override the current sort.
    const prevManualLenRef = useRef(manualSimSelected.length);
    // Refs to capture latest values for the snapshot (avoids stale closures)
    const sortKeyRef = useRef(sortKey);
    sortKeyRef.current = sortKey;
    const sortDirRef = useRef(sortDir);
    sortDirRef.current = sortDir;
    const rangeFilterRef = useRef(rangeFilter);
    rangeFilterRef.current = rangeFilter;
    const committedFilterRef = useRef(committedFilter);
    committedFilterRef.current = committedFilter;
    const filterEnabledRef = useRef(filterEnabled);
    filterEnabledRef.current = filterEnabled;
    const filterPinnedRef = useRef(filterPinned);
    filterPinnedRef.current = filterPinned;

    useEffect(() => {
      const prev = prevManualLenRef.current;
      const curr = manualSimSelected.length;
      prevManualLenRef.current = curr;
      if (curr >= 8 && prev < 8) {
        // Snapshot full state before overriding to Prize sort
        try {
          localStorage.setItem("wf_sort_snapshot", JSON.stringify({
            sortKey: sortKeyRef.current,
            sortDir: sortDirRef.current,
            rangeFilter: rangeFilterRef.current,
            committedFilter: committedFilterRef.current,
            filterEnabled: filterEnabledRef.current,
            filterPinned: filterPinnedRef.current,
          }));
        } catch { /* ignore */ }
        setSortKey("prize");
        setSortDir("desc");
      } else if (curr < 8 && prev >= 8) {
        // Restore full state from snapshot
        try {
          const raw = localStorage.getItem("wf_sort_snapshot");
          if (raw) {
            const snap = JSON.parse(raw);
            setSortKey(snap.sortKey ?? "nrr");
            setSortDir(snap.sortDir ?? "desc");
            if (snap.rangeFilter) setRangeFilter({ ...emptyFilter, ...snap.rangeFilter });
            if (snap.committedFilter) setCommittedFilter({ ...emptyFilter, ...snap.committedFilter });
            if (snap.filterEnabled !== undefined) setFilterEnabled(snap.filterEnabled);
            if (snap.filterPinned !== undefined) setFilterPinned(snap.filterPinned);
          } else {
            setSortKey("nrr");
            setSortDir("desc");
          }
        } catch {
          setSortKey("nrr");
          setSortDir("desc");
        }
      }
    }, [manualSimSelected.length]);

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
   *  monthlyAvgBuckets may contain entries for times > 8 (when drawsPerMonth > 8).
   *  All such entries must be ACCUMULATED (+=) into bucket 8, not overwritten (=),
   *  otherwise only the last (smallest) entry survives and the target is badly wrong.
   *  After accumulating raw averages, round each bucket and derive 0x as the complement. */
  const targetDist = useMemo((): number[] | null => {
    if (!monthlyAvgBuckets.length) return null;
    // Accumulate raw (un-rounded) averages per bucket to avoid overwrite loss
    const rawDist = Array(9).fill(0);
    monthlyAvgBuckets.forEach((b) => {
      const idx = Math.min(b.times, 8);
      if (idx > 0) rawDist[idx] += b.avg; // skip idx=0; undrawn derived below
    });
    const dist = rawDist.map((v, i) => (i > 0 ? Math.round(v) : 0));
    // 0x = numbers never drawn in a typical completed month
    const drawnTotal = dist.slice(1).reduce((a, v) => a + v, 0);
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

  /**
   * Compute convergence score for a candidate's numbers.
   *
   * Returns preSSD − postSSD: positive means the draw moves the monthly
   * frequency distribution closer to the historical average, negative means
   * it moves further away.
   *
   * IMPORTANT: Empirical analysis of 30,000 candidates shows Conv direction
   * (positive vs negative) has NO correlation with prize outcomes. Winners
   * and non-winners have nearly identical Conv distributions (mean +6.4%
   * difference — within noise). A Div2 winner was observed at Conv = −8.0.
   * Conv is useful as an informational metric (shows distribution impact)
   * but should NOT be weighted heavily in predictive scoring.
   */
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
    // Save original counts so we never recommend drawing more from a bucket than
    // actually exist in the real current distribution.  Without this cap the greedy
    // simulation inflates higher buckets (simDist[b+1] += 1 each pick), letting it
    // appear to "draw" from a bucket that had zero (or too few) real numbers — an
    // impossible composition.
    const originalDist = [...currentDist];
    const simDist = [...currentDist];
    const drawFrom = new Array(maxBucket + 1).fill(0);
    for (let pick = 0; pick < 8; pick++) {
      let bestBucket = -1;
      let bestImprovement = -Infinity;
      for (let b = 0; b <= maxBucket; b++) {
        if (simDist[b] <= 0) continue;
        // Never recommend more picks from bucket b than were originally available
        if (drawFrom[b] >= originalDist[b]) continue;
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
    // Magnitude-based Conv normalisation: |Conv| / maxAbs — direction does not
    // predict winners (empirically verified), so positive and negative Conv
    // contribute equally based on their magnitude (impact on distribution).
    const validConv = convergenceScores.filter((s): s is number => s !== null);
    const maxAbsConv = validConv.length ? Math.max(...validConv.map(Math.abs)) : 1;
    const safeMaxAbsConv = maxAbsConv || 1;
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
      const convNorm = conv !== null ? Math.abs(conv) / safeMaxAbsConv : 0;
      const ogaNorm = enableOGA && ogaPct !== undefined ? ogaPercentileToSimilarity(ogaPct) : 0;
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

  /**
   * WinScore (recalibrated) — Multi-signal composite designed to identify
   * prize-worthy candidates WITHOUT needing Manual Simulation.
   *
   * Data-driven recalibration from 71K-candidate analysis:
   *   - 2x bucket count (numbers drawn exactly 2× this month) → 6.17× lift
   *     (strongest discriminator found; previous RH/3x gates were anti-correlated)
   *   - |Conv| magnitude used as within-tier tiebreaker
   *
   * Algorithm: Gate tier on 2x count (major) + |Conv| rank (minor)
   *   Tier A:  2x ≥ 3  → highest-signal cluster  (6× lift)
   *   Tier B:  2x = 2  → strong signal            (4× lift)
   *   Tier C:  2x = 1  → moderate signal          (2× lift)
   *   Tier D:  2x = 0  → baseline
   *
   * Sort Win DESCENDING for best candidates first (higher = better).
   * Use the ⭐ Rec button for the full multi-signal recommended sort.
   */
  const winScores = useMemo((): (number | null)[] => {
    // Pre-compute |Conv| range for within-tier normalisation
    const convMags = candidates.map((_, idx) => Math.abs(convergenceScores[idx] ?? 0));
    const maxConvMag = Math.max(...convMags, 1);

    return candidates.map((c, idx) => {
      const nums = [...c.main, ...c.supp];
      const bc = getMonthlyBucketCounts(nums);
      if (bc === null) return null;

      const t2 = bc.times2; // primary signal: 6.17× lift

      // Gate tier (each tier separated by 100 points)
      let tierBonus: number;
      if (t2 >= 3) {
        tierBonus = 400; // Tier A
      } else if (t2 === 2) {
        tierBonus = 300; // Tier B
      } else if (t2 === 1) {
        tierBonus = 200; // Tier C
      } else {
        tierBonus = 100; // Tier D (still differentiable within tier via |Conv|)
      }

      // Within-tier secondary: |Conv| magnitude normalised to 0–99
      const convMagNorm = (convMags[idx] / maxConvMag) * 99;

      return tierBonus + convMagNorm;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, convergenceScores]);

  const bestWinScore = useMemo((): number | null => {
    const valid = winScores.filter((s): s is number => s !== null);
    if (!valid.length) return null;
    return Math.max(...valid);
  }, [winScores]);

  /** Get the tier label for a WinScore value (recalibrated: based on 2x bucket count) */
  const getWinTier = (score: number | null): string => {
    if (score === null) return "—";
    if (score >= 400) return "A"; // 2x ≥ 3
    if (score >= 300) return "B"; // 2x = 2
    if (score >= 200) return "C"; // 2x = 1
    if (score >= 100) return "D"; // 2x = 0
    return "—";
  };

  /**
   * Nrr (Number Rarity Rank) — Scores candidates by how RARE their numbers
   * are within the generated candidate pool.
   *
   * Statistical analysis of 30,000 candidates showed that winning numbers
   * consistently appear in the BOTTOM THIRD of the pool by frequency
   * (ranks 28–45 out of 45). This is because the generator's constraints
   * systematically over-weight certain numbers — the numbers that barely
   * survive filtering ("contrarian" picks) turn out to be the actual winners.
   *
   * Empirical performance: 15× lift at top-50, 12.5× at top-100, 7× at top-500.
   *
   * Algorithm:
   *   1. Count appearances of each number 1–45 across all candidates
   *   2. MaxFreq = highest count among all 45 numbers
   *   3. Rarity(n) = MaxFreq - Freq(n)  (higher = rarer in pool)
   *   4. Nrr(candidate) = sum of Rarity for all 8 numbers, normalised to 0–100
   */
  const numberPoolFreq = useMemo((): Map<number, number> => {
    const freq = new Map<number, number>();
    for (const c of candidates) {
      for (const n of [...c.main, ...c.supp]) {
        freq.set(n, (freq.get(n) || 0) + 1);
      }
    }
    return freq;
  }, [candidates]);

  const nrrScores = useMemo((): (number | null)[] => {
    if (!candidates.length) return [];
    const maxFreq = Math.max(...Array.from(numberPoolFreq.values()), 1);
    // Compute max possible rarity sum for normalisation
    // (8 numbers, each with maxFreq - minFreq rarity)
    const allRarities = Array.from({ length: 45 }, (_, i) => maxFreq - (numberPoolFreq.get(i + 1) || 0));
    allRarities.sort((a, b) => b - a);
    const maxRaritySum = allRarities.slice(0, 8).reduce((s, v) => s + v, 0) || 1;

    return candidates.map((c) => {
      const nums = [...c.main, ...c.supp];
      const raritySum = nums.reduce((sum, n) => sum + (maxFreq - (numberPoolFreq.get(n) || 0)), 0);
      return (raritySum / maxRaritySum) * 100;
    });
  }, [candidates, numberPoolFreq]);

  const bestNrr = useMemo((): number | null => {
    const valid = nrrScores.filter((s): s is number => s !== null);
    if (!valid.length) return null;
    return Math.max(...valid);
  }, [nrrScores]);

  /**
   * NS (NumSum Score) — percentile rank of the candidate's number sum within
   * the historical draw distribution loaded from windfall_history_lottolyzer.csv.
   *
   * Formula (data-driven):
   *   historicalSums = sum of all 8 numbers (main + supp) for each past draw
   *   NS = (# historical draws with sum ≤ candidate sum) / (# draws) × 100
   *   → range 0–100, where 50 = median historical sum
   *
   * Fallback (no history available):
   *   NS = (sum / 360) × 100  using theoretical max 8 × 45
   *
   * Higher NS means the candidate's numbers are collectively higher-valued than
   * most historical draws — prize-winning candidates trend toward the upper
   * percentiles of this distribution.
   *
   * NS is wholly independent of Conv, IDM, Rdy and Nrr — it adds a pure
   * "number-value gravity" axis derived from the actual draw history.
   */
  const nsScores = useMemo((): number[] => {
    // Build sorted array of historical draw sums from the loaded CSV history
    const historicalSums: number[] = [];
    if (historyForOGA && historyForOGA.length > 0) {
      for (const draw of historyForOGA) {
        historicalSums.push([...draw.main, ...draw.supp].reduce((s, n) => s + n, 0));
      }
      historicalSums.sort((a, b) => a - b);
    }

    return candidates.map((c) => {
      const total = [...c.main, ...c.supp].reduce((s, n) => s + n, 0);
      if (historicalSums.length === 0) {
        // Fallback: normalise against theoretical max (8 × 45 = 360)
        return (total / 360) * 100;
      }
      // Percentile rank: fraction of historical draws whose sum ≤ candidate sum
      let lo = 0;
      let hi = historicalSums.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (historicalSums[mid] <= total) lo = mid + 1;
        else hi = mid;
      }
      return (lo / historicalSums.length) * 100;
    });
  }, [candidates, historyForOGA]);

  const bestNs = useMemo((): number | null => {
    if (!nsScores.length) return null;
    return Math.max(...nsScores);
  }, [nsScores]);

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
        case "nrr":
          va = nrrScores[a.origIdx] ?? -Infinity;
          vb = nrrScores[b.origIdx] ?? -Infinity;
          break;
        case "ns":
          va = nsScores[a.origIdx] ?? -Infinity;
          vb = nsScores[b.origIdx] ?? -Infinity;
          break;
        case "win":
          va = winScores[a.origIdx] ?? -Infinity;
          vb = winScores[b.origIdx] ?? -Infinity;
          break;
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
        case "recommended": {
          // Multi-signal recommended ranking (always descending):
          //   1st: 2x bucket count (strongest signal, 6.17× lift)
          //   2nd: Nrr (number rarity rank, 2× lift)
          //   3rd: |Conv| magnitude
          const bc2xA = getMonthlyBucketCounts(numsA)?.times2 ?? 0;
          const bc2xB = getMonthlyBucketCounts(numsB)?.times2 ?? 0;
          if (bc2xA !== bc2xB) return bc2xB - bc2xA;
          const nrrA = nrrScores[a.origIdx] ?? 0;
          const nrrB = nrrScores[b.origIdx] ?? 0;
          if (Math.abs(nrrA - nrrB) > 0.01) return nrrB - nrrA;
          const convMagA = Math.abs(convergenceScores[a.origIdx] ?? 0);
          const convMagB = Math.abs(convergenceScores[b.origIdx] ?? 0);
          return convMagB - convMagA;
        }
        default:
          return 0;
      }
      return (va - vb) * dir;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, sortKey, sortDir, convergenceScores, readinessScores, idmScores, winScores, nrrScores, nsScores]);

  // --- Multi-column range filter applied to sorted candidates ---
  const filteredCandidates = useMemo((): { c: CandidateSet; origIdx: number; matched: boolean }[] => {
    if (!isFilteringActive) return sortedCandidates.map((r) => ({ ...r, matched: true }));
    const parse = (v: string): number | null => {
      if (v.trim() === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const oddEvenV    = committedFilter.oddEven.trim();
    const selHitsV    = parse(committedFilter.selHits);
    const recentHitsV = parse(committedFilter.recentHits);
    const b0xV = parse(committedFilter.b0x);
    const b1xV = parse(committedFilter.b1x);
    const b2xV = parse(committedFilter.b2x);
    const b3xV = parse(committedFilter.b3x);
    const b4xV = parse(committedFilter.b4x);
    const b5xV = parse(committedFilter.b5x);
    const b6xV = parse(committedFilter.b6x);
    const b7xV = parse(committedFilter.b7x);
    const b8xV = parse(committedFilter.b8x);
    const mainSearchNums = committedMainNumberSearch.numbers;
    const suppSearchNums = committedSuppNumberSearch.numbers;
    const singleDigitSearchNums = committedSingleDigitNumberSearch.numbers;
    const twoDigitSearchNums = committedTwoDigitNumberSearch.numbers;
    const matchesNumberSearch = (pool: number[], searchNums: number[]): boolean => {
      if (searchNums.length === 0) return true;
      if (committedNumberSearchMode === "any") return searchNums.some((n) => pool.includes(n));
      return searchNums.every((n) => pool.includes(n));
    };
    // Range pairs
    const compMin = parse(committedFilter.compMin);      const compMax = parse(committedFilter.compMax);
    const ogaRawMin = parse(committedFilter.ogaRawMin);  const ogaRawMax = parse(committedFilter.ogaRawMax);
    const ogaPctMin = parse(committedFilter.ogaPctMin);  const ogaPctMax = parse(committedFilter.ogaPctMax);
    const convMin = parse(committedFilter.convMin);      const convMax = parse(committedFilter.convMax);
    const idmMin = parse(committedFilter.idmMin);        const idmMax = parse(committedFilter.idmMax);
    const rdyMin = parse(committedFilter.rdyMin);        const rdyMax = parse(committedFilter.rdyMax);
    const winMin = parse(committedFilter.winMin);        const winMax = parse(committedFilter.winMax);
    const nrrMin = parse(committedFilter.nrrMin);        const nrrMax = parse(committedFilter.nrrMax);
    const nsMin  = parse(committedFilter.nsMin);         const nsMax  = parse(committedFilter.nsMax);

    // All fields empty → return unfiltered
    const allEmpty = oddEvenV === "" && selHitsV === null && recentHitsV === null
      && b0xV === null && b1xV === null && b2xV === null && b3xV === null && b4xV === null
      && b5xV === null && b6xV === null && b7xV === null && b8xV === null
      && mainSearchNums.length === 0 && suppSearchNums.length === 0
      && singleDigitSearchNums.length === 0 && twoDigitSearchNums.length === 0
      && compMin === null && compMax === null
      && ogaRawMin === null && ogaRawMax === null
      && ogaPctMin === null && ogaPctMax === null
      && convMin === null && convMax === null
      && idmMin === null && idmMax === null
      && rdyMin === null && rdyMax === null
      && winMin === null && winMax === null
      && nrrMin === null && nrrMax === null
      && nsMin === null && nsMax === null;
    if (allEmpty) return sortedCandidates.map((r) => ({ ...r, matched: true }));

    const testMatch = ({ c, origIdx }: { c: CandidateSet; origIdx: number }): boolean => {
      const nums: number[] = [...c.main, ...c.supp];
      const candidateSingleDigits = nums.filter((n) => n < 10);
      const candidateTwoDigits = nums.filter((n) => n >= 10);
      if (!matchesNumberSearch(c.main, mainSearchNums)) return false;
      if (!matchesNumberSearch(c.supp, suppSearchNums)) return false;
      if (!matchesNumberSearch(candidateSingleDigits, singleDigitSearchNums)) return false;
      if (!matchesNumberSearch(candidateTwoDigits, twoDigitSearchNums)) return false;
      // Odd/Even: exact ratio string match
      if (oddEvenV !== "") {
        const odds = nums.filter((n: number) => n % 2 !== 0).length;
        const evens = nums.length - odds;
        if (`${odds}:${evens}` !== oddEvenV) return false;
      }
      // SelHits: exact integer
      if (selHitsV !== null) {
        const sh = (c as any).selHits ?? nums.filter((n: number) => hitSet.has(n)).length;
        if (sh !== selHitsV) return false;
      }
      // RecentHits: exact integer
      if (recentHitsV !== null) {
        const rh = (c as any).recentHits ?? nums.filter((n: number) => recentSet.has(n)).length;
        if (rh !== recentHitsV) return false;
      }
      const bucketCounts = getMonthlyBucketCounts(nums);
      if (b0xV !== null && (bucketCounts?.undrawn ?? null) !== b0xV) return false;
      if (b1xV !== null && (bucketCounts?.times1 ?? null) !== b1xV) return false;
      if (b2xV !== null && (bucketCounts?.times2 ?? null) !== b2xV) return false;
      if (b3xV !== null && (bucketCounts?.times3 ?? null) !== b3xV) return false;
      if (b4xV !== null && (bucketCounts?.times4 ?? null) !== b4xV) return false;
      if (b5xV !== null && (bucketCounts?.times5 ?? null) !== b5xV) return false;
      if (b6xV !== null && (bucketCounts?.times6 ?? null) !== b6xV) return false;
      if (b7xV !== null && (bucketCounts?.times7 ?? null) !== b7xV) return false;
      if (b8xV !== null && (bucketCounts?.times8 ?? null) !== b8xV) return false;
      // Comp%: raw is finalCompositeAdj * 100
      if (!isDisplayedValueInRange((c as any).finalCompositeAdj * 100, compMin, compMax, 2)) return false;
      // OGA Raw
      if (!isDisplayedValueInRange((c as any).ogaScore, ogaRawMin, ogaRawMax, 2)) return false;
      // OGA%
      if (!isDisplayedValueInRange((c as any).ogaPercentile, ogaPctMin, ogaPctMax, 1)) return false;
      // Conv
      if (!isDisplayedValueInRange(convergenceScores[origIdx], convMin, convMax, 1)) return false;
      // IDM%: raw is idmScores[i] * 100
      const idmRaw = (idmScores[origIdx] ?? null) !== null ? (idmScores[origIdx] as number) * 100 : null;
      if (!isDisplayedValueInRange(idmRaw, idmMin, idmMax, 1)) return false;
      // Rdy%: raw is readinessScores[i] * 100
      const rdyRaw = (readinessScores[origIdx] ?? null) !== null ? (readinessScores[origIdx] as number) * 100 : null;
      if (!isDisplayedValueInRange(rdyRaw, rdyMin, rdyMax, 1)) return false;
      // Win
      if (!isDisplayedValueInRange(winScores[origIdx], winMin, winMax, 0)) return false;
      // Nrr
      if (!isDisplayedValueInRange(nrrScores[origIdx], nrrMin, nrrMax, 1)) return false;
      // NS
      if (!isDisplayedValueInRange(nsScores[origIdx], nsMin, nsMax, 1)) return false;
      return true;
    };
    if (filterPinned !== "off") {
      // Sort mode: "desc" = matches first, "asc" = matches last — all rows visible
      const matched: { c: CandidateSet; origIdx: number; matched: boolean }[] = [];
      const unmatched: { c: CandidateSet; origIdx: number; matched: boolean }[] = [];
      for (const row of sortedCandidates) {
        if (testMatch(row)) {
          matched.push({ ...row, matched: true });
        } else {
          unmatched.push({ ...row, matched: false });
        }
      }
      return filterPinned === "desc"
        ? [...matched, ...unmatched]
        : [...unmatched, ...matched];
    }
    // Default: hide non-matching rows
    return sortedCandidates
      .filter((row) => testMatch(row))
      .map((r) => ({ ...r, matched: true }));
  }, [sortedCandidates, isFilteringActive, committedFilter, filterPinned, committedMainNumberSearch, committedSuppNumberSearch, committedNumberSearchMode, nrrScores, nsScores, readinessScores, idmScores, convergenceScores, winScores, hitSet, recentSet]);
  /** Count of rows matching the current filter (for UI labels) */
  const matchedCount = useMemo(() => filteredCandidates.filter((r) => r.matched).length, [filteredCandidates]);
  const hasActiveFilter = isFilteringActive && matchedCount < sortedCandidates.length;

  /**
   * Maps original candidate array index → 1-based display row number in the
   * current sorted/filtered table.  Used so the Historical Prize Backtest chips
   * show the same "#N" the user sees in the table, regardless of sort order.
   * If a candidate has been hidden by an active filter its key is absent.
   */
  const origToDisplayPos = useMemo((): Map<number, number> => {
    const m = new Map<number, number>();
    filteredCandidates.forEach((r, displayIdx) => {
      if (r.matched) m.set(r.origIdx, displayIdx + 1);
    });
    return m;
  }, [filteredCandidates]);

  /** Prize-qualifying counts — requires Manual Simulation to be fully populated (6M + 2S) */
  const prizeQualifyingCount = useMemo((): number => {
    if (manualMainSet.size < 6 || manualSuppSet.size < 2) return 0;
    return candidates.filter(
      (c) => computePrizeDivision(c.main, c.supp, manualMainSet, manualSuppSet) !== "—"
    ).length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, manualMainSet, manualSuppSet]);

  /** Prize-qualifying breakdown by division for tooltip */
  const prizeBreakdown = useMemo((): Record<string, number> => {
    if (manualMainSet.size < 6 || manualSuppSet.size < 2) return {};
    const tally: Record<string, number> = {};
    for (const c of candidates) {
      const div = computePrizeDivision(c.main, c.supp, manualMainSet, manualSuppSet);
      if (div !== "—") tally[div] = (tally[div] ?? 0) + 1;
    }
    return tally;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, manualMainSet, manualSuppSet]);

  /** Prize-qualifying count within the current filtered view */
  const prizeQualifyingFilteredCount = useMemo((): number => {
    if (manualMainSet.size < 6 || manualSuppSet.size < 2) return 0;
    return filteredCandidates.filter(
      ({ c, matched }) => matched && computePrizeDivision(c.main, c.supp, manualMainSet, manualSuppSet) !== "—"
    ).length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredCandidates, manualMainSet, manualSuppSet]);

  /** Prize-qualifying percentages for all candidates and the current filtered view */
  const prizeQualifyingPercent = useMemo((): number => {
    if (candidates.length === 0) return 0;
    return (prizeQualifyingCount / candidates.length) * 100;
  }, [candidates.length, prizeQualifyingCount]);

  const prizeQualifyingFilteredPercent = useMemo((): number => {
    if (matchedCount === 0) return 0;
    return (prizeQualifyingFilteredCount / matchedCount) * 100;
  }, [matchedCount, prizeQualifyingFilteredCount]);

  /**
   * Historical Prize Backtest — for each past draw in historyForOGA, checks
   * whether the manual simulation candidate would have qualified for any prize
   * if played for that draw. Sorted most-recent draw first.
   *
   * This answers: "If I had played this manual simulated candidate in past draws,
   * how often would I have won a prize, and in which division?"
   */
  const historicalBacktest = useMemo((): {
    draw: Draw;
    tally: Record<string, number>;
    total: number;
    bestDiv: string;
    qualifying: { idx: number; div: string }[];
  }[] => {
    // Use full history for backtest so all draws are checked regardless of the generation window
    const backtestHistory = fullHistory ?? historyForOGA;
    if (!backtestHistory || backtestHistory.length === 0 || manualSimSelected.length < 8) return [];
    const manualMain = manualSimSelected.slice(0, 6);
    const manualSupp = manualSimSelected.slice(6, 8);
    // backtestHistory is typically oldest-first; reverse so index 0 = most recent
    const sorted = [...backtestHistory].reverse();
    return sorted.map((draw) => {
      const drawMainSet = new Set(draw.main);
      const drawSuppSet = new Set(draw.supp);
      const div = computePrizeDivision(manualMain, manualSupp, drawMainSet, drawSuppSet);
      if (div === "—") {
        return { draw, tally: {}, total: 0, bestDiv: "—", qualifying: [] };
      }
      return {
        draw,
        tally: { [div]: 1 },
        total: 1,
        bestDiv: div,
        qualifying: [{ idx: 0, div }],
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualSimSelected, historyForOGA, fullHistory]);

  /** Aggregate totals across all historical draws */
  const backtestOverallSummary = useMemo(() => {
    const overall: Record<string, number> = {};
    let totalInstances = 0;
    let drawsWithAnyPrize = 0;
    for (const row of historicalBacktest) {
      if (row.total > 0) drawsWithAnyPrize++;
      for (const [div, cnt] of Object.entries(row.tally)) {
        overall[div] = (overall[div] ?? 0) + cnt;
        totalInstances += cnt;
      }
    }
    return { overall, totalInstances, drawsWithAnyPrize };
  }, [historicalBacktest]);

  // backtestRatioCount removed — single manual sim candidate, no multi-candidate ratio filter needed

  // --- Row virtualization ---
  const ROW_HEIGHT = 32;           // estimated px height per row
  const OVERSCAN = 5;              // extra rows above/below viewport
  const VIRTUAL_THRESHOLD = 80;    // only virtualise when row count exceeds this
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  const shouldVirtualise = filteredCandidates.length > VIRTUAL_THRESHOLD;

  // Reset scroll when candidates or sort or filter change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [candidates, sortKey, sortDir, filterEnabled, committedFilter]);

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

  const totalRows = filteredCandidates.length;
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
    ? filteredCandidates.slice(startIdx, endIdx)
    : filteredCandidates;

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
     return computeWeekdayWindfallPrizeDivision(main, supp, manualMain, manualSupp);
   }

   /** Composite prize sort score: division rank × 100 + mainHits × 10 + suppHits.
    *  Within the same division, candidates with more total hits sort higher.
    *  E.g., Div4 (4 main + 2 supp) = 462 > Div4 (4 main + 0 supp) = 440. */
   function computePrizeScore(main: number[], supp: number[], manualMain: Set<number>, manualSupp: Set<number>): number {
     return computeWeekdayWindfallPrizeScore(main, supp, manualMain, manualSupp);
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

   function renderNumber(n: number, _simRole?: "main" | "supp", isSearchMatched: boolean = false) {
      const isSel = selSet.has(n);
      const isRecent = recentSet.has(n);
      const searchAccent: React.CSSProperties | null = isSearchMatched
        ? {
            border: "1px dashed rgba(123,31,162,0.85)",
            boxShadow: "0 0 0 2px rgba(123,31,162,0.9) inset, 0 0 0 1px rgba(123,31,162,0.18)",
          }
        : null;
      const base: React.CSSProperties = {
        padding: "0 4px",
        margin: "0 2px",
        borderRadius: 14,
        display: "inline-block",
        fontVariantNumeric: "tabular-nums",
        fontSize: 12,
        border: "1px solid transparent",
      };
      const titleSuffix = isSearchMatched ? " • Matches number search" : "";
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
              ...(searchAccent ?? {}),
            }}
            title={`User-selected & Recently drawn${titleSuffix}`}
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
              ...(searchAccent ?? {}),
            }}
            title={`User-selected${titleSuffix}`}
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
              ...(searchAccent ?? {}),
            }}
            title={`Recently drawn${titleSuffix}`}
          >
            {n}
          </span>
        );
      } else {
        return (
          <span key={n} style={{ ...base, ...(searchAccent ?? {}) }} title={isSearchMatched ? "Matches number search" : undefined}>
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

     /** Export candidates to CSV — when filter is active, only filtered rows are exported */
     const exportCSV = useCallback(() => {
       const exportData = isFilteringActive ? filteredCandidates : sortedCandidates;
       if (!exportData.length) return;
       const headers = [
         "#", "Main (6)", "Supp (2)", "Prize", "Odd/Even",
         "Comp%", "OGA Raw", "OGA%", "SelHits", "RecentHits",
         "0x", "1x", "2x", "3x", "4x", "5x", "6x", "7x", "8x+",
          "Conv", "IDM", "Rdy", "Win", "WinTier", "Nrr", "NS",
        ];
       const rows = exportData.map(({ c, origIdx }, displayIdx) => {
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
            winScores[i] !== null ? (winScores[i] as number).toFixed(1) : "",
            getWinTier(winScores[i]),
             nrrScores[i] !== null ? (nrrScores[i] as number).toFixed(1) : "",
             nsScores[i] !== undefined ? nsScores[i].toFixed(1) : "",
          ].map((v) => {
           const s = String(v);
           return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
         }).join(",");
       });
       // --- Settings fingerprint (## comment rows before header) ---
       const fp: string[] = ["## WINDFALL CANDIDATES EXPORT"];
       const tag = (label: string, value: string) => fp.push(`## ${label}: ${value}`);

       tag("Generated", new Date().toISOString());
       tag("Candidates",
         `${exportData.length} exported | ${numCandidates} requested | overgen ${overgenFactor}x | attempts ${attemptMultiplier}x | filtered ${isFilteringActive && filteredCandidates.length !== sortedCandidates.length ? "YES" : "NO"}`
       );
       tag("Draw window", `${historyForOGA?.length ?? 0} draws`);
       tag("OGA", `${enableOGA ? "ON" : "OFF"} | Spokes ${ogaSpokeCount ?? 9}`);

       if (exportSettings) {
         const es = exportSettings;

         // All effective exclusions — user, SDE1, HC3 clearly separated
         const userExcl = es.excludedNumbers.length > 0
           ? `(${es.excludedNumbers.length}): [${es.excludedNumbers.join(", ")}]`
           : "(0): none";
         tag("Excluded (user)", userExcl);

         if (es.enableHC3 || es.hc3Exclusions.length > 0) {
           tag("HC3 exclusions",
             es.hc3Exclusions.length > 0
               ? `(${es.hc3Exclusions.length}): [${es.hc3Exclusions.join(", ")}] — in both last two draws`
               : "(0): none (HC3 " + (es.enableHC3 ? "ON but no overlap" : "OFF") + ")"
           );
         }
         if (es.enableSDE1 || es.sde1Exclusions.length > 0) {
           tag("SDE1 exclusions",
             es.sde1Exclusions.length > 0
               ? `(${es.sde1Exclusions.length}): [${es.sde1Exclusions.join(", ")}]`
               : "(0): none (SDE1 OFF)"
           );
         }

         tag("Lambda",
           `${es.lambdaEnabled ? `ON (λ=${es.lambda})` : `OFF (λ=${es.lambda})`}`
         );
         tag("Entropy/Hamming/Jaccard",
           `Entropy ${es.entropyEnabled ? `ON (≥${es.entropyThreshold})` : "OFF"} | Hamming ${es.hammingEnabled ? `ON (≥${es.hammingThreshold})` : "OFF"} | Jaccard ${es.jaccardEnabled ? `ON (≤${(es.jaccardThreshold * 100).toFixed(0)}%)` : "OFF"}`
         );
         tag("User boost",
           `${es.selectedBoostEnabled ? `ON (${es.selectedBoostFactor}x)` : "OFF"} | Selected (${userSelectedNumbers.length}): ${userSelectedNumbers.length ? `[${userSelectedNumbers.join(", ")}]` : "none"}`
         );
         tag("Odd/Even filter",
           es.selectedOddEvenRatios.length
             ? `(${es.selectedOddEvenRatios.length}): [${es.selectedOddEvenRatios.join(", ")}]`
             : "none (all ratios allowed)"
         );
         tag("Recent matches", `min=${es.minRecentMatches} | bias=${es.recentMatchBias}`);
         tag("Monthly boostPenalize", es.monthlyBoostPenalize ? "ON" : "OFF");

         // Constructive fill — critical for understanding bucket overrepresentation
         if (es.monthlyConstructiveEnabled && es.monthlyConstructiveConstraints) {
           const c = es.monthlyConstructiveConstraints;
           const parts = Object.entries(c)
             .filter(([, v]) => v > 0)
             .map(([k, v]) => `${k}≥${v}`)
             .join(", ");
           tag("Constructive fill", `ON | constraints: [${parts || "none"}]`);
         } else {
           tag("Constructive fill", `${es.monthlyConstructiveEnabled ? "ON (no constraints)" : "OFF"}`);
         }
       }

       tag("Forced/Trend",
         forcedNumbers.length > 0
           ? `(${forcedNumbers.length}): [${forcedNumbers.join(", ")}]`
           : "(0): none"
       );

       // Monthly bucket snapshot
       if (monthlyBuckets) {
         const bucketTiers = [
           "times1", "times2", "times3", "times4",
           "times5", "times6", "times7", "times8",
         ] as const;
         for (const tier of bucketTiers) {
           const nums = Array.from(monthlyBuckets[tier]).sort((a: number, b: number) => a - b);
           if (nums.length > 0) {
             tag(`Monthly ${tier}`, `(${nums.length}): [${nums.join(", ")}]`);
           }
         }
         const undrawn = Array.from(monthlyBuckets.undrawn).sort((a: number, b: number) => a - b);
         if (undrawn.length > 0) {
           tag("Monthly undrawn", `(${undrawn.length}): [${undrawn.join(", ")}]`);
         }
       } else {
         tag("Monthly buckets", "none (monthly panel not configured)");
       }

       const fingerprint = fp.join("\n") + "\n";
       const csv = fingerprint + [headers.join(","), ...rows].join("\n");
       const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
       const url = URL.createObjectURL(blob);
       const a = document.createElement("a");
       a.href = url;
       a.download = isFilteringActive && filteredCandidates.length !== sortedCandidates.length
         ? `candidates_filtered.csv`
         : `candidates.csv`;
       a.click();
       URL.revokeObjectURL(url);
     // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [sortedCandidates, filteredCandidates, isFilteringActive, convergenceScores, idmScores, readinessScores, winScores, nrrScores, nsScores, exportSettings, enableOGA, numCandidates, overgenFactor, attemptMultiplier, ogaSpokeCount, forcedNumbers, userSelectedNumbers, monthlyBuckets, historyForOGA]);

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

       {/* Multi-column range filter */}
       {candidates.length > 0 && (
         <div style={{ marginBottom: 8 }}>
             <button
               type="button"
               onClick={() => setFilterEnabled((prev) => !prev)}
               style={{
                 padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                 border: filterEnabled ? "1px solid #1565c0" : "1px solid #ccc",
                 background: filterEnabled ? "#e3f2fd" : "#f5f5f5",
                 color: filterEnabled ? "#1565c0" : "#555",
                 cursor: "pointer",
               }}
               title="Toggle multi-column range filter to narrow candidates by Nrr, Rdy%, IDM%, Comp%, OGA Raw"
             >
               🔍 Filter {filterEnabled ? "ON" : "OFF"}
                {hasActiveFilter && (
                  <span style={{ marginLeft: 6, fontWeight: 700, color: "#c62828" }}>
                    ({matchedCount} of {sortedCandidates.length})
                  </span>
                )}
             </button>
             <button
               type="button"
               onClick={() => { setSortKey("recommended"); setSortDir("desc"); }}
               style={{
                 padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                 border: sortKey === "recommended" ? "1px solid #2e7d32" : "1px solid #ccc",
                 background: sortKey === "recommended" ? "#e8f5e9" : "#f5f5f5",
                 color: sortKey === "recommended" ? "#2e7d32" : "#555",
                 cursor: "pointer",
               }}
               title={`Recommended Ranking Strategy (data-driven):\n1. 2x bucket count ↓  (6.17× lift — strongest signal)\n2. Nrr ↓  (number rarity rank, 2× lift)\n3. |Conv| magnitude ↓  (distribution impact)\n\nBased on analysis of 71K candidates: candidates with more numbers drawn exactly twice this month statistically win most often. Nrr breaks ties by preferring rarer numbers in the pool.`}
             >
               ⭐ Rec
             </button>
            {prizeQualifyingCount > 0 && (() => {
              const divOrder = ["Div1","Div2","Div3","Div4","Div5","Div6"];
              const breakdownStr = divOrder
                .filter((d) => prizeBreakdown[d])
                .map((d) => `${d}: ${prizeBreakdown[d]}`)
                .join(" · ");
              const filteredDiffNote = hasActiveFilter && prizeQualifyingFilteredCount !== prizeQualifyingCount
                ? `\n${prizeQualifyingFilteredCount} in current filter view (${prizeQualifyingFilteredPercent.toFixed(1)}%)`
                : "";
              return (
                <span
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "3px 10px", borderRadius: 12,
                    background: "rgba(255,193,7,0.18)", border: "1px solid #f9a825",
                    color: "#7b5800", fontSize: 11, fontWeight: 700,
                    cursor: "default",
                  }}
                  title={`${prizeQualifyingCount} candidate${prizeQualifyingCount !== 1 ? "s" : ""} qualify for a prize division (${prizeQualifyingPercent.toFixed(1)}%)\n${breakdownStr}${filteredDiffNote}`}
                >
                  🏆 {prizeQualifyingCount} prize-qualifying ({prizeQualifyingPercent.toFixed(1)}%)
                  {hasActiveFilter && prizeQualifyingFilteredCount !== prizeQualifyingCount && (
                    <span style={{ fontWeight: 400, color: "#b45309" }}>
                      &nbsp;({prizeQualifyingFilteredCount} in filter · {prizeQualifyingFilteredPercent.toFixed(1)}%)
                    </span>
                  )}
                </span>
              );
            })()}
           {filterEnabled && (
             <div style={{
               display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end",
               marginTop: 6, padding: "8px 10px",
               background: "#f8f9ff", border: "1px solid #c5cae9", borderRadius: 5,
               fontSize: 11,
             }}>
               {/* ── Exact-match fields ── */}
               {/* Odd/Even dropdown */}
               <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                 <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                   <span style={{ fontWeight: 600, color: "#333", whiteSpace: "nowrap" }}>Odd/Even</span>
                   <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 0.7, cursor: "pointer", userSelect: "none" }}>
                     <span onClick={() => { setSortKey("oddEven"); setSortDir("asc"); }} style={{ fontSize: 9, color: sortKey === "oddEven" && sortDir === "asc" ? "#1565c0" : "#bbb" }} title="Sort ascending">▲</span>
                     <span onClick={() => { setSortKey("oddEven"); setSortDir("desc"); }} style={{ fontSize: 9, color: sortKey === "oddEven" && sortDir === "desc" ? "#1565c0" : "#bbb" }} title="Sort descending">▼</span>
                   </span>
                 </div>
                 <select value={rangeFilter.oddEven} onChange={(e) => updateFilter("oddEven", e.target.value)}
                   style={{ width: 72, padding: "2px 4px", borderRadius: 3, border: "1px solid #ccc", fontSize: 11 }}>
                   <option value="">Any</option>
                   {ratioOptions.map(({ ratio }) => (<option key={ratio} value={ratio}>{ratio}</option>))}
                 </select>
               </div>
               {/* Exact integer filters */}
               {([
                 { lbl: "SelHits", fKey: "selHits", sk: "selHits" },
                 { lbl: "RcntHits", fKey: "recentHits", sk: "recentHits" },
                 { lbl: "0x", fKey: "b0x", sk: "b0x" },
                 { lbl: "1x", fKey: "b1x", sk: "b1x" },
                 { lbl: "2x", fKey: "b2x", sk: "b2x" },
                 { lbl: "3x", fKey: "b3x", sk: "b3x" },
                 { lbl: "4x", fKey: "b4x", sk: "b4x" },
                 { lbl: "5x", fKey: "b5x", sk: "b5x" },
                 { lbl: "6x", fKey: "b6x", sk: "b6x" },
                 { lbl: "7x", fKey: "b7x", sk: "b7x" },
                 { lbl: "8x+", fKey: "b8x", sk: "b8x" },
               ] as const).map(({ lbl, fKey, sk }) => {
                 return (
                   <div key={lbl} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                     <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                       <span style={{ fontWeight: 600, color: "#333", whiteSpace: "nowrap" }}>{lbl}</span>
                       <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 0.7, cursor: "pointer", userSelect: "none" }}>
                         <span onClick={() => { setSortKey(sk); setSortDir("asc"); }} style={{ fontSize: 9, color: sortKey === sk && sortDir === "asc" ? "#1565c0" : "#bbb" }}>▲</span>
                         <span onClick={() => { setSortKey(sk); setSortDir("desc"); }} style={{ fontSize: 9, color: sortKey === sk && sortDir === "desc" ? "#1565c0" : "#bbb" }}>▼</span>
                       </span>
                     </div>
                     <input type="number" step="1" placeholder="exact" value={rangeFilter[fKey]}
                       onChange={(e) => updateFilter(fKey, e.target.value)}
                       onKeyDown={(e) => { if (e.key === "Enter") applyFilter(); }}
                       style={{ width: 52, padding: "2px 4px", borderRadius: 3, border: "1px solid #ccc", fontSize: 11 }} />
                   </div>
                 );
               })}

               {/* ── Range (min / max) fields ── */}
               {([
                 { label: "Comp%",   sk: "comp"       as SortKey, minK: "compMin"   as const, maxK: "compMax"   as const },
                 { label: "OGA Raw", sk: "ogaRaw"     as SortKey, minK: "ogaRawMin" as const, maxK: "ogaRawMax" as const },
                 { label: "OGA%",    sk: "ogaPct"     as SortKey, minK: "ogaPctMin" as const, maxK: "ogaPctMax" as const },
                 { label: "Conv",    sk: "conv"        as SortKey, minK: "convMin"   as const, maxK: "convMax"   as const },
                 { label: "IDM%",    sk: "idm"         as SortKey, minK: "idmMin"    as const, maxK: "idmMax"    as const },
                 { label: "Rdy%",    sk: "rdy"         as SortKey, minK: "rdyMin"    as const, maxK: "rdyMax"    as const },
                 { label: "Win",     sk: "win"         as SortKey, minK: "winMin"    as const, maxK: "winMax"    as const },
                 { label: "Nrr",     sk: "nrr"         as SortKey, minK: "nrrMin"    as const, maxK: "nrrMax"    as const },
                 { label: "NS",      sk: "ns"          as SortKey, minK: "nsMin"     as const, maxK: "nsMax"     as const },
               ] as { label: string; sk: SortKey; minK: keyof RangeFilter; maxK: keyof RangeFilter }[]).map(({ label, sk, minK, maxK }) => (
                 <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                   <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                     <span style={{ fontWeight: 600, color: "#333", whiteSpace: "nowrap" }}>{label}</span>
                     <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 0.7, cursor: "pointer", userSelect: "none" }}>
                       <span onClick={() => { setSortKey(sk); setSortDir("asc"); }} style={{ fontSize: 9, color: sortKey === sk && sortDir === "asc" ? "#1565c0" : "#bbb" }} title={`Sort ${label} ▲`}>▲</span>
                       <span onClick={() => { setSortKey(sk); setSortDir("desc"); }} style={{ fontSize: 9, color: sortKey === sk && sortDir === "desc" ? "#1565c0" : "#bbb" }} title={`Sort ${label} ▼`}>▼</span>
                     </span>
                   </div>
                   <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                     <input type="number" step="any" placeholder="min"
                       value={rangeFilter[minK]}
                       onChange={(e) => updateFilter(minK, e.target.value)}
                       onKeyDown={(e) => { if (e.key === "Enter") applyFilter(); }}
                       style={{ width: 52, padding: "2px 3px", borderRadius: 3, border: "1px solid #ccc", fontSize: 11 }} />
                     <span style={{ color: "#aaa", fontSize: 10 }}>–</span>
                     <input type="number" step="any" placeholder="max"
                       value={rangeFilter[maxK]}
                       onChange={(e) => updateFilter(maxK, e.target.value)}
                       onKeyDown={(e) => { if (e.key === "Enter") applyFilter(); }}
                       style={{ width: 52, padding: "2px 3px", borderRadius: 3, border: "1px solid #ccc", fontSize: 11 }} />
                   </div>
                 </div>
               ))}
               <button
                 type="button"
                 onClick={applyFilter}
                 style={{
                   padding: "4px 12px", borderRadius: 4, border: "1px solid #1565c0",
                   background: "#1565c0", color: "#fff", cursor: "pointer", fontSize: 11,
                   fontWeight: 700, alignSelf: "flex-end",
                 }}
                 title="Apply filter ranges to narrow candidates"
               >
                 🔍 Search
               </button>
                <button
                  type="button"
                  onClick={clearFilter}
                  style={{ padding: "3px 8px", borderRadius: 3, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontSize: 11, alignSelf: "flex-end" }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={saveFilter}
                  style={{
                    padding: "3px 8px", borderRadius: 3, fontSize: 11, fontWeight: 600,
                    border: filterSaveFlash === "saved" ? "1px solid #2e7d32" : "1px solid #ccc",
                    background: filterSaveFlash === "saved" ? "#e8f5e9" : "#fff",
                    color: filterSaveFlash === "saved" ? "#2e7d32" : "#555",
                    cursor: "pointer", alignSelf: "flex-end",
                  }}
                  title="Save current filter values to browser storage so you can reload them later"
                >
                  {filterSaveFlash === "saved" ? "✓ Saved" : "💾 Save"}
                </button>
                {hasSavedFilter && (
                  <button
                    type="button"
                    onClick={loadFilter}
                    style={{
                      padding: "3px 8px", borderRadius: 3, fontSize: 11, fontWeight: 600,
                      border: filterSaveFlash === "loaded" ? "1px solid #1565c0" : "1px solid #ccc",
                      background: filterSaveFlash === "loaded" ? "#e3f2fd" : "#f5f5f5",
                      color: filterSaveFlash === "loaded" ? "#1565c0" : "#555",
                      cursor: "pointer", alignSelf: "flex-end",
                    }}
                    title="Load previously saved filter values"
                  >
                    {filterSaveFlash === "loaded" ? "✓ Loaded" : "📂 Load"}
                  </button>
                )}
               {hasActiveFilter && (
                 <button
                   type="button"
                   onClick={toggleFilterPinned}
                   style={{
                     padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                     border: filterPinned !== "off" ? "1px solid #e65100" : "1px solid #888",
                     background: filterPinned !== "off" ? "#fff3e0" : "#f5f5f5",
                     color: filterPinned !== "off" ? "#e65100" : "#555",
                     cursor: "pointer", alignSelf: "flex-end",
                   }}
                   title={filterPinned === "off"
                     ? "Sort matching rows to the top (▼ descending)"
                     : filterPinned === "desc"
                       ? "Matching rows at top. Click to sort matches to bottom (▲ ascending)."
                       : "Matching rows at bottom. Click to turn off match sorting."}
                 >
                   {filterPinned === "off" ? "↕ Sort matches" : filterPinned === "desc" ? "▼ Matches first" : "▲ Matches last"}
                 </button>
               )}
               <span style={{ color: "#888", alignSelf: "flex-end" }}>
                 {!hasActiveFilter
                   ? "All candidates shown"
                   : filterPinned === "desc"
                     ? `${matchedCount} sorted to top of ${sortedCandidates.length}`
                     : filterPinned === "asc"
                       ? `${matchedCount} sorted to bottom of ${sortedCandidates.length}`
                       : `${matchedCount} of ${sortedCandidates.length} match`}
               </span>
             </div>
           )}
         </div>
       )}

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
          <div style={{
            marginBottom: 10,
            padding: "8px 10px",
            background: "#f8f9ff",
            border: "1px solid #c5cae9",
            borderRadius: 5,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 220, flex: "1 1 220px" }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#333" }} htmlFor="candidate-main-search">
                  Main number search
                </label>
                <input
                  id="candidate-main-search"
                  type="text"
                  value={rangeFilter.mainNumbers}
                  placeholder="e.g. 4, 12, 28"
                  onChange={(e) => updateFilter("mainNumbers", e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") applyNumberSearch(); }}
                  style={{ padding: "5px 7px", borderRadius: 4, border: "1px solid #ccc", fontSize: 12 }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 220, flex: "1 1 220px" }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#333" }} htmlFor="candidate-supp-search">
                  Supp number search
                </label>
                <input
                  id="candidate-supp-search"
                  type="text"
                  value={rangeFilter.suppNumbers}
                  placeholder="e.g. 7, 18"
                  onChange={(e) => updateFilter("suppNumbers", e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") applyNumberSearch(); }}
                  style={{ padding: "5px 7px", borderRadius: 4, border: "1px solid #ccc", fontSize: 12 }}
                />
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 220, flex: "1 1 220px" }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#333" }} htmlFor="candidate-single-digit-search">
                  Single-digit search
                </label>
                <input
                  id="candidate-single-digit-search"
                  type="text"
                  value={rangeFilter.singleDigitNumbers}
                  placeholder="e.g. 4, 7, 9"
                  onChange={(e) => updateFilter("singleDigitNumbers", e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") applyNumberSearch(); }}
                  style={{ padding: "5px 7px", borderRadius: 4, border: "1px solid #ccc", fontSize: 12 }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 220, flex: "1 1 220px" }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#333" }} htmlFor="candidate-two-digit-search">
                  Two-digit search
                </label>
                <input
                  id="candidate-two-digit-search"
                  type="text"
                  value={rangeFilter.twoDigitNumbers}
                  placeholder="e.g. 11, 20, 42"
                  onChange={(e) => updateFilter("twoDigitNumbers", e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") applyNumberSearch(); }}
                  style={{ padding: "5px 7px", borderRadius: 4, border: "1px solid #ccc", fontSize: 12 }}
                />
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#333" }}>Match mode</span>
                <div style={{ display: "inline-flex", border: "1px solid #c5cae9", borderRadius: 4, overflow: "hidden" }}>
                  {(["all", "any"] as const).map((mode) => {
                    const active = draftNumberSearchMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updateFilter("numberSearchMode", mode)}
                        style={{
                          padding: "5px 10px",
                          border: "none",
                          borderRight: mode === "all" ? "1px solid #c5cae9" : "none",
                          background: active ? "#1565c0" : "#fff",
                          color: active ? "#fff" : "#555",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: active ? 700 : 500,
                        }}
                        title={mode === "all"
                          ? "Candidate must include all entered numbers in each populated section"
                          : "Candidate may include any entered number in each populated section"}
                      >
                        {mode === "all" ? "Match all" : "Match any"}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={applyNumberSearch}
                disabled={draftNumberSearchErrors.length > 0}
                style={{
                  padding: "5px 12px",
                  borderRadius: 4,
                  border: draftNumberSearchErrors.length > 0 ? "1px solid #bdbdbd" : "1px solid #1565c0",
                  background: draftNumberSearchErrors.length > 0 ? "#eeeeee" : "#1565c0",
                  color: draftNumberSearchErrors.length > 0 ? "#888" : "#fff",
                  cursor: draftNumberSearchErrors.length > 0 ? "not-allowed" : "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                }}
                title="Apply main, supp, single-digit, and two-digit search to the generated candidates table"
              >
                🔍 Search numbers
              </button>
              <button
                type="button"
                onClick={clearNumberSearch}
                style={{
                  padding: "5px 10px",
                  borderRadius: 4,
                  border: "1px solid #ccc",
                  background: "#fff",
                  color: "#555",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Clear search
              </button>
              <span style={{ fontSize: 11, color: hasCommittedNumberSearch ? "#1565c0" : "#777", fontWeight: hasCommittedNumberSearch ? 600 : 400, alignSelf: "center" }}>
                {hasCommittedNumberSearch
                  ? `${matchedCount} of ${sortedCandidates.length} match the current ${committedNumberSearchMode === "any" ? "match-any" : "match-all"} number search`
                  : "Enter comma- or space-separated main, supp, single-digit, and/or two-digit numbers, then choose match all or match any."}
              </span>
            </div>
            {hasCommittedNumberSearch && (
              <span style={{ fontSize: 11, color: "#6a1b9a", fontWeight: 600 }}>
                Matched numbers in candidate rows are marked with a purple dashed search accent.
              </span>
            )}
            {draftNumberSearchErrors.length > 0 && (
              <div style={{ width: "100%", fontSize: 11, color: "#c62828", fontWeight: 600 }}>
                Invalid search values: {draftNumberSearchErrors.join(", ")} (Main/Supp: 1–45, Single digit: 1–9, Two digit: 10–45)
              </div>
            )}
          </div>
          {shouldVirtualise && (
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
              Showing rows {startIdx + 1}–{endIdx} of {totalRows}
              {filterPinned !== "off" && hasActiveFilter && (
                <span style={{ color: "#e65100", fontWeight: 600, marginLeft: 8 }}>
                  {filterPinned === "desc" ? "▼" : "▲"} {matchedCount} matches {filterPinned === "desc" ? "first" : "last"}
                </span>
              )}
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
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("conv")} title="Convergence: how much this draw moves the month's distribution toward (+) or away from (−) the historical average. NOTE: direction (positive vs negative) does NOT predict prize-winning candidates — both positive and negative Conv winners occur at equal rates. Conv is informational (shows distribution impact), not predictive.">Conv{sortIndicator("conv")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("idm")} title="Ideal Draw Match: how closely this candidate's bucket composition matches the statistically optimal draw. 100% = perfect match, 0.0 = completely different.">IDM{sortIndicator("idm")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("rdy")} title="Readiness score: composite of Ideal Draw Match (bucket composition vs optimal), Convergence, and OGA%. Higher = more statistically ready. Weights configurable in Candidate Generation Influences.">Rdy{sortIndicator("rdy")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("win")} title="WinScore (recalibrated): tier-gate based on 2x bucket count — the strongest prize predictor found (6.17× lift at top tier). Tier A: 2x≥3. Tier B: 2x=2. Tier C: 2x=1. Tier D: 2x=0. Within-tier, ranked by |Conv| magnitude. Sort Win ↓ for best-first. Use ⭐ Rec for full multi-signal recommended sort.">Win{sortIndicator("win")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("nrr")} title="Number Rarity Rank: scores candidates by how rare their numbers are within the generated pool. Numbers that barely survive constraint filtering (contrarian picks) empirically correlate with actual winning numbers. Higher = rarer numbers = 15× lift at top-50.">Nrr{sortIndicator("nrr")}</th>
                 <th style={{ ...th, ...sortableStyle }} onClick={() => toggleSort("ns")} title="NumSum Score: percentile rank of the candidate's number sum against the historical draw distribution (windfall_history_lottolyzer.csv). 50 = median historical sum. Higher = more high-value numbers vs history. Prize-winning candidates trend toward the upper percentiles. Complements Conv/IDM/Rdy/Nrr.">NS{sortIndicator("ns")}</th>
                 <th style={th}>Actions</th>
              </tr>
           </thead>
            <tbody>
              {shouldVirtualise && topPad > 0 && (
                <tr style={{ height: topPad }} aria-hidden="true"><td colSpan={26} /></tr>
              )}
              {visibleCandidates.map(({ c, origIdx, matched: isMatched }, sliceIdx) => {
                const displayIdx = startIdx + sliceIdx;
                const i = origIdx;
                const isDimmed = filterPinned !== "off" && !isMatched;
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
                 const effectiveShade = isDimmed
                   ? "#f0eded"
                   : rdyShade
                     ? shade ? shade : rdyShade
                     : convShade
                       ? shade ? shade : convShade
                       : shade;
                 const outlineColor = isBestRdy && shade ? "#f9a825" : isBestConv && shade ? "#2e7d32" : undefined;
                 // Insert a visual separator row at the boundary between matched and unmatched
                 const prevSliceIdx = sliceIdx - 1;
                 const prevItem = prevSliceIdx >= 0 ? visibleCandidates[prevSliceIdx] : null;
                 // Show separator at the boundary between matched/unmatched groups
                 const showSeparator = filterPinned !== "off" && prevItem != null && prevItem.matched !== isMatched;
                 return (
                   <React.Fragment key={i}>
                   {showSeparator && (
                     <tr aria-hidden="true">
                       <td colSpan={26} style={{ padding: 0, border: "none" }}>
                         <div style={{
                           height: 4,
                           background: "linear-gradient(90deg, #e65100 0%, #ff9800 50%, #e65100 100%)",
                           boxShadow: "0 2px 6px rgba(230,81,0,0.35)",
                           margin: "2px 0",
                         }} />
                         <div style={{
                           fontSize: 10, color: "#e65100", fontWeight: 700,
                           textAlign: "center", padding: "1px 0",
                           background: "#fff3e0",
                         }}>
                           {filterPinned === "desc"
                             ? `▼ ${filteredCandidates.length - matchedCount} non-matching rows below ▼`
                             : `▲ ${matchedCount} matching rows below ▲`}
                         </div>
                       </td>
                     </tr>
                   )}
                   <tr
                     style={{
                       background: effectiveShade,
                       cursor: "pointer",
                       transition: "background 0.12s",
                       outline: outlineColor && !isDimmed ? `2px solid ${outlineColor}` : undefined,
                       opacity: isDimmed ? 0.38 : undefined,
                       borderLeft: isDimmed ? "3px solid #ccc" : undefined,
                     }}
                     onClick={() => onSelectCandidate(i)}
                        title={`#${i + 1} SelHits=${selHits} RecentHits=${recentHits}${convScore !== null ? ` Conv=${convScore.toFixed(1)}` : ""}${idmScore !== null ? ` IDM=${(idmScore * 100).toFixed(1)}%` : ""}${rdyScore !== null ? ` Rdy=${(rdyScore * 100).toFixed(1)}%` : ""}${winScores[origIdx] !== null ? ` Win=${getWinTier(winScores[origIdx])} ${(winScores[origIdx] as number).toFixed(0)}` : ""}${nrrScores[origIdx] !== null ? ` Nrr=${(nrrScores[origIdx] as number).toFixed(1)}` : ""} NS=${nsScores[origIdx].toFixed(1)}`}
                  >
                    <td style={tdCenter}>{displayIdx + 1}</td>
                    <td style={mainTd}>{c.main.map((n: number) => renderNumber(
                      n,
                      isActiveSim ? "main" : undefined,
                      hasCommittedNumberSearch && (
                        committedMainSearchSet.has(n)
                        || (n < 10 && committedSingleDigitSearchSet.has(n))
                        || (n >= 10 && committedTwoDigitSearchSet.has(n))
                      ),
                    ))}</td>
                    <td style={td}>{c.supp.map((n: number) => renderNumber(
                      n,
                      isActiveSim ? "supp" : undefined,
                      hasCommittedNumberSearch && (
                        committedSuppSearchSet.has(n)
                        || (n < 10 && committedSingleDigitSearchSet.has(n))
                        || (n >= 10 && committedTwoDigitSearchSet.has(n))
                      ),
                    ))}</td>
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
                    {(() => {
                      const ws = winScores[origIdx];
                      const tier = getWinTier(ws);
                      const isBestWin = ws !== null && bestWinScore !== null && ws === bestWinScore && ws > 0;
                      const tierColors: Record<string, string> = { A: "#b8860b", B: "#6a6a6a", C: "#8b5e3c", D: "#999", "—": "#ccc" };
                      const tierBg: Record<string, string> = { A: "rgba(255,193,7,0.15)", B: "rgba(192,192,192,0.15)", C: "rgba(205,133,63,0.12)", D: "transparent", "—": "transparent" };
                      return (
                        <td style={{
                          ...tdCenter,
                          fontWeight: isBestWin || tier === "A" ? 700 : tier === "B" ? 600 : undefined,
                          color: tierColors[tier] || "#ccc",
                          background: tierBg[tier] || "transparent",
                        }}
                        title={ws !== null ? `WinScore: ${ws.toFixed(1)} (Tier ${tier}) — 2x=${getMonthlyBucketCounts([...c.main, ...c.supp])?.times2 ?? "?"}, |Conv|=${Math.abs(convergenceScores[origIdx] ?? 0).toFixed(1)}, Nrr=${nrrScores[origIdx]?.toFixed(1) ?? "?"}` : "No data"}
                        >
                          {ws !== null ? (isBestWin ? `⭐ ${tier} ${ws.toFixed(0)}` : `${tier} ${ws.toFixed(0)}`) : "—"}
                        </td>
                     )})()}
                     {(() => {
                       const nrr = nrrScores[origIdx];
                       const isBestNrr = nrr !== null && bestNrr !== null && nrr === bestNrr && nrr > 0;
                       return (
                         <td style={{
                           ...tdCenter,
                           fontWeight: isBestNrr ? 700 : nrr !== null && nrr >= 70 ? 600 : undefined,
                           color: nrr !== null ? (nrr >= 80 ? "#6a1b9a" : nrr >= 60 ? "#1565c0" : nrr >= 40 ? "#2e7d32" : "#888") : "#ccc",
                           background: isBestNrr ? "rgba(106,27,154,0.12)" : nrr !== null && nrr >= 70 ? "rgba(106,27,154,0.06)" : undefined,
                         }}
                         title={nrr !== null ? `Nrr: ${nrr.toFixed(1)} — candidate contains numbers that are rare in the generated pool. Higher = more contrarian picks.` : "No data"}
                         >
                           {nrr !== null ? (isBestNrr ? `⭐ ${nrr.toFixed(1)}` : nrr.toFixed(1)) : "—"}
                         </td>
                       );
                     })()}
                     {(() => {
                       const ns = nsScores[origIdx];
                       const isBestNs = bestNs !== null && ns === bestNs;
                       // Colour scale: ≥72 (high) teal, ≥60 blue, ≥48 green, else grey
                       const nsColor = ns >= 72 ? "#00695c" : ns >= 60 ? "#1565c0" : ns >= 48 ? "#2e7d32" : "#888";
                       return (
                         <td style={{
                           ...tdCenter,
                           fontWeight: isBestNs ? 700 : ns >= 65 ? 600 : undefined,
                           color: nsColor,
                           background: isBestNs ? "rgba(0,105,92,0.12)" : ns >= 65 ? "rgba(0,105,92,0.05)" : undefined,
                         }}
                          title={`NS: ${ns.toFixed(1)} — NumSum Score: percentile rank vs historical draws (${historyForOGA?.length ?? 0} draws from windfall_history_lottolyzer.csv). 50 = median. Higher = more high-value numbers relative to history.`}
                         >
                           {isBestNs ? `⭐ ${ns.toFixed(1)}` : ns.toFixed(1)}
                         </td>
                       );
                     })()}
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
                 </React.Fragment>
               );
             })}
              {shouldVirtualise && bottomPad > 0 && (
                <tr style={{ height: bottomPad }} aria-hidden="true"><td colSpan={26} /></tr>
              )}
           </tbody>
          </table>
          </div>
           </>
         )}

        {/* ── Historical Prize Backtest ── */}
        {historyForOGA && historyForOGA.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #e8e8e8" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setShowHistoricalBacktest((p) => !p)}
                style={{
                  padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                  border: showHistoricalBacktest ? "1px solid #f9a825" : "1px solid #ccc",
                  background: showHistoricalBacktest ? "#fff8e1" : "#f5f5f5",
                  color: showHistoricalBacktest ? "#7b5800" : "#555",
                  cursor: "pointer",
                }}
                title="For each historical draw, check if the manual simulation candidate would have qualified for a prize if played for that draw"
              >
                📊 Historical Prize Backtest {showHistoricalBacktest ? "▲" : "▼"}
              </button>
              {manualSimSelected.length < 8 ? (
                <span style={{ fontSize: 11, color: "#999" }}>Select 8 numbers in Manual Simulation to run backtest</span>
              ) : backtestOverallSummary.totalInstances > 0 ? (
                <span style={{ fontSize: 11, color: "#7b5800", fontWeight: 600 }}>
                  🏅 {backtestOverallSummary.drawsWithAnyPrize}/{historicalBacktest.length} draws — manual candidate won a prize
                </span>
              ) : (
                <span style={{ fontSize: 11, color: "#999" }}>manual candidate never won a prize in any historical draw</span>
              )}
            </div>

            {showHistoricalBacktest && (
              <div style={{
                marginTop: 8, padding: "10px 12px",
                background: "#fffde7", border: "1px solid #f9a825", borderRadius: 6,
              }}>
                {/* Window selector */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap", fontSize: 11 }}>
                  <span style={{ fontWeight: 600 }}>Show last:</span>
                  {([10, 20, 50, 100, 200, "all"] as (number | "all")[]).map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setBacktestWindow(v)}
                      style={{
                        padding: "2px 8px", borderRadius: 3, fontSize: 11,
                        border: backtestWindow === v ? "1px solid #f9a825" : "1px solid #ccc",
                        background: backtestWindow === v ? "#fff8e1" : "#fff",
                        fontWeight: backtestWindow === v ? 700 : 400,
                        cursor: "pointer",
                      }}
                    >
                      {v === "all" ? "All" : v}
                    </button>
                  ))}
                  <span style={{ color: "#888" }}>draws (newest first) — {historicalBacktest.length} total</span>
                </div>

                {/* Aggregate summary badges */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10, fontSize: 12 }}>
                  <span style={{ fontWeight: 600 }}>Prize breakdown (all draws):</span>
                  {backtestOverallSummary.totalInstances === 0
                    ? <span style={{ color: "#999" }}>Manual candidate never qualified in any historical draw</span>
                    : (["Div1","Div2","Div3","Div4","Div5","Div6"] as const).map((div) => {
                        const cnt = backtestOverallSummary.overall[div] ?? 0;
                        if (!cnt) return null;
                        const [bg, border, color] = div === "Div1"
                          ? ["rgba(142,36,170,0.12)", "#7b1fa2", "#7b1fa2"]
                          : div === "Div2"
                          ? ["rgba(198,40,40,0.12)", "#c62828", "#c62828"]
                          : div === "Div3"
                          ? ["rgba(230,81,0,0.10)", "#e65100", "#e65100"]
                          : div === "Div4"
                          ? ["rgba(21,101,192,0.10)", "#1565c0", "#1565c0"]
                          : div === "Div5"
                          ? ["rgba(46,125,50,0.10)", "#2e7d32", "#2e7d32"]
                          : ["rgba(106,27,154,0.10)", "#6a1b9a", "#6a1b9a"];
                        return (
                          <span key={div} style={{
                            padding: "1px 8px", borderRadius: 10, fontWeight: 700, fontSize: 11,
                            background: bg, border: `1px solid ${border}`, color,
                          }}>
                            {div}: {cnt}
                          </span>
                        );
                      })
                  }
                </div>

                {/* Draw-by-draw table */}
                <div style={{ overflowY: "auto", maxHeight: 360, border: "1px solid #f0e0a0", borderRadius: 4 }}>
                  <table style={{ ...tbl, fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: "#fff8e1" }}>
                        {[
                          { label: "Date",        style: { ...th, position: "sticky" as const, top: 0, background: "#fff8e1", whiteSpace: "nowrap" as const } },
                          { label: "Winning Main", style: { ...mainTh, position: "sticky" as const, top: 0, background: "#fff8e1" } },
                          { label: "Supp",         style: { ...th, position: "sticky" as const, top: 0, background: "#fff8e1" } },
                          { label: "Div1",         style: { ...th, position: "sticky" as const, top: 0, background: "#fff8e1", color: "#7b1fa2" } },
                          { label: "Div2",         style: { ...th, position: "sticky" as const, top: 0, background: "#fff8e1", color: "#c62828" } },
                          { label: "Div3",         style: { ...th, position: "sticky" as const, top: 0, background: "#fff8e1", color: "#e65100" } },
                          { label: "Div4",         style: { ...th, position: "sticky" as const, top: 0, background: "#fff8e1", color: "#1565c0" } },
                          { label: "Div5",         style: { ...th, position: "sticky" as const, top: 0, background: "#fff8e1", color: "#2e7d32" } },
                          { label: "Div6",         style: { ...th, position: "sticky" as const, top: 0, background: "#fff8e1", color: "#6a1b9a" } },
                           { label: "Total",        style: { ...th, position: "sticky" as const, top: 0, background: "#fff8e1" } },
                        ].map(({ label, style }) => <th key={label} style={style}>{label}</th>)}
                        {onSimulateNumbers && (
                          <th style={{ ...th, position: "sticky", top: 0, background: "#fff8e1" }}>Load Draw</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {(backtestWindow === "all"
                        ? historicalBacktest
                        : historicalBacktest.slice(0, backtestWindow as number)
                      ).map(({ draw, tally, total, qualifying }, rowIdx) => {
                        const hasPrize = total > 0;
                        const isExpanded = expandedBacktestRow === rowIdx;
                        const colCount = 10 + (onSimulateNumbers ? 1 : 0);
                        const divColors: Record<string, string> = {
                          Div1: "#7b1fa2", Div2: "#c62828", Div3: "#e65100",
                          Div4: "#1565c0", Div5: "#2e7d32", Div6: "#6a1b9a",
                        };
                        return (
                          <React.Fragment key={`bt-${rowIdx}`}>
                            <tr style={{ background: hasPrize ? "rgba(255,193,7,0.09)" : undefined }}>
                              <td style={{ ...tdCenter, whiteSpace: "nowrap", fontSize: 10 }}>{draw.date}</td>
                              <td style={mainTd}>{draw.main.map((n) => renderNumber(n))}</td>
                              <td style={{ ...tdCenter, fontSize: 10 }}>{draw.supp.join(" · ")}</td>
                              {(["Div1","Div2","Div3","Div4","Div5","Div6"] as const).map((div) => {
                                const cnt = tally[div] ?? 0;
                                return (
                                  <td key={div} style={{
                                    ...tdCenter,
                                    fontWeight: cnt > 0 ? 700 : undefined,
                                    color: cnt > 0 ? "#1565c0" : "#ddd",
                                  }}>
                                    {cnt > 0 ? cnt : "·"}
                                  </td>
                                );
                              })}
                              {/* Won — shows best division or "—", clickable to expand match detail */}
                              <td
                                style={{
                                  ...tdCenter,
                                  fontWeight: hasPrize ? 700 : undefined,
                                  color: hasPrize ? (isExpanded ? "#b8860b" : "#1565c0") : "#ccc",
                                  cursor: hasPrize ? "pointer" : undefined,
                                  textDecoration: hasPrize ? "underline dotted" : undefined,
                                  userSelect: "none",
                                }}
                                title={hasPrize ? (isExpanded ? "Collapse match detail" : `Manual candidate won ${qualifying[0]?.div} — click to see match`) : undefined}
                                onClick={() => hasPrize && setExpandedBacktestRow(isExpanded ? null : rowIdx)}
                              >
                                {hasPrize ? `${isExpanded ? "▲" : "▼"} ${qualifying[0]?.div ?? "Win"}` : "—"}
                              </td>
                              {onSimulateNumbers && (
                                <td style={tdCenter}>
                                  <button
                                    type="button"
                                    onClick={() => onSimulateNumbers([...draw.main, ...draw.supp])}
                                    style={{ ...simBtn, fontSize: 10, padding: "2px 6px" }}
                                    title={`Load ${draw.date} winning numbers into manual simulation`}
                                  >
                                    Load Draw
                                  </button>
                                </td>
                              )}
                            </tr>

                            {/* Expandable qualifying-candidates detail row */}
                            {isExpanded && hasPrize && (
                              <tr>
                                <td
                                  colSpan={colCount}
                                  style={{
                                    padding: "8px 12px",
                                    background: "#fffbea",
                                    borderBottom: "2px solid #f9a825",
                                  }}
                                >
                                  {(() => {
                                    const winDiv = qualifying[0]?.div ?? "—";
                                    const divColor = (divColors as Record<string, string>)[winDiv] ?? "#555";
                                    const manualMain = manualSimSelected.slice(0, 6);
                                    const manualSupp = manualSimSelected.slice(6, 8);
                                    const drawMainSet = new Set(draw.main);
                                    const drawSuppSet = new Set(draw.supp);
                                    const mainHits = manualMain.filter((n) => drawMainSet.has(n));
                                    const suppHits = manualSupp.filter((n) => drawSuppSet.has(n));
                                    const mainMisses = manualMain.filter((n) => !drawMainSet.has(n));
                                    const suppMisses = manualSupp.filter((n) => !drawSuppSet.has(n));
                                    return (
                                      <div style={{ fontSize: 11 }}>
                                        <span style={{ fontWeight: 700, color: "#7b5800", marginRight: 10 }}>
                                          Manual candidate matched {draw.date}:
                                        </span>
                                        <span style={{
                                          padding: "1px 8px", borderRadius: 10,
                                          background: divColor, color: "#fff",
                                          fontWeight: 700, fontSize: 11, marginRight: 10,
                                        }}>{winDiv}</span>
                                        <span style={{ color: "#555" }}>
                                          Main hits:{" "}
                                          {mainHits.map((n, i) => (
                                            <span key={i} style={{ fontWeight: 700, color: "#1565c0", marginRight: 3 }}>{n}</span>
                                          ))}
                                          {mainMisses.map((n, i) => (
                                            <span key={i} style={{ color: "#bbb", marginRight: 3 }}>{n}</span>
                                          ))}
                                          {" | Supp hits: "}
                                          {suppHits.map((n, i) => (
                                            <span key={i} style={{ fontWeight: 700, color: "#6a1b9a", marginRight: 3 }}>{n}</span>
                                          ))}
                                          {suppMisses.map((n, i) => (
                                            <span key={i} style={{ color: "#bbb", marginRight: 3 }}>{n}</span>
                                          ))}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
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
                      background: "linear-gradient(135deg, #e8f0fe, #fff)",
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
                          <span style={{ fontWeight: 700, color: "#0d47a1", fontVariantNumeric: "tabular-nums" }}>{count}</span>
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

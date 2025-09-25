import React, { useState, useRef, useEffect, useMemo } from "react";
import { CandidatesProvider } from './shared/CandidatesContext';
import { AppLayout } from './components/layout/AppLayout';
import { usePersistence } from './shared/usePersistence';
import { MonteCarloAnalyzer } from "./components/MonteCarloAnalyzer";
import { SurvivalAnalyzer } from "./components/SurvivalAnalyzer";
import { OperatorsPanel } from "./components/OperatorsPanel";
import { OGAHistogram } from "./components/OGAHistogram";
import { NumberTrendsTable, NumberTrend } from "./components/NumberTrendsTable";
import { checkHardConstraints } from "./hardConstraints";
import { gpwfScore } from "./gpwf";
import { entropy, minHamming, maxJaccard, fingerprint } from "./analytics";
import { applyOctagonalPostProcess } from "./octagonal";
import { parseCSVorJSON } from "./parseCSVorJSON";
import { getSDE1FilteredPool } from "./sde1";
import {
  buildDrawGrid,
  findDiamondsAllRadii,
  getPredictedNumbers,
} from "./dga";
import { DGAVisualizer } from "./components/DGAVisualizer";
import { validateTrickyRule } from "./trickyRule";
import { computeOGA, getOGAPercentile } from "./utils/oga";
import { Draw, Knobs, CandidateSet } from "./types";
import { sampleCandidates } from "./candidateUtils";
import { generateCandidates } from "./generateCandidates";
import { MonteCarloLayout } from "./types";
import { buildTrendWeights } from "./lib/trendBias";
import { isCellInShape } from './lib/diamondShapes';
import type { DiamondModel, DiamondShape } from './types/Diamond';


const WINDOW_OPTIONS = [
  { key: "W", label: "Weekly (3 draws)", size: 3 },
  { key: "F", label: "Fortnight (6 draws)", size: 6 },
  { key: "M", label: "Month (12 draws)", size: 12 },
  { key: "Q", label: "Quarter (36 draws)", size: 36 },
  { key: "Y", label: "Year (156 draws)", size: 156 },
  { key: "H", label: "History (all draws)", size: null },
  { key: "Custom", label: "Custom", size: null },
];

const ANALYTIC_FIELDS: [keyof Knobs, string][] = [
  ["enableSDE1", "SDE1 (Second Digit Exclusion)"],
  ["enableHC3", "HC3 (Exclude numbers repeated in last two draws)"],
  ["enableOGA", "Octagonal Grid Analysis (OGA)"],
  ["enableGPWF", "GPWF (Weighted Frequency)"],
  ["enableEntropy", "Entropy"],
  ["enableHamming", "Hamming"],
  ["enableJaccard", "Jaccard"],
];

const NUM_MAINS = 6;
const MAIN_MIN = 1;
const MAIN_MAX = 45;
const MIN_VALID_DRAWS = 45;
const API_URL =
  "https://api.thelott.com/sales/vmax/web/data/lotto/results?companyId=Tatts&productId=WeekdayWindfall&maxDrawCount=50";

const defaultKnobs: Knobs = {
  enableSDE1: true,
  enableHC3: true,
  enableOGA: true,
  enableGPWF: true,
  enableEntropy: true,
  enableHamming: true,
  enableJaccard: true,
  F: 0.03,
  M: 0.8,
  Q: 0.04,
  Y: 0.01,
  Historical_Weight: 0.05,
  gpwf_window_size: 27,
  gpwf_bias_factor: 0.05,
  gpwf_floor: 0.5,
  gpwf_scale_multiplier: 0.7,
  lambda: 0.85,
  octagonal_top: 9,
  exact_set_override: false,
  hamming_relax: false,
  gpwf_targeted_mode: false,
};

function getUniqueRandomNumbers(
  n: number,
  min: number,
  max: number,
  exclude: number[] = [],
  pool?: number[]
) {
  let source: number[] = pool
    ? pool.filter((x: number) => !exclude.includes(x))
    : [];
  if (!pool) {
    for (let i = min; i <= max; ++i) {
      if (!exclude.includes(i)) source.push(i);
    }
  }
  const nums: number[] = [];
  while (nums.length < n && source.length) {
    let idx = Math.floor(Math.random() * source.length);
    nums.push(source[idx]);
    source.splice(idx, 1);
  }
  return nums.sort((a: number, b: number) => a - b);
}

type HighlightShape = {
  row: number;
  col: number;
  radius: number;
  color: string;
};

async function fetchDraws(
  setHistory: (history: Draw[]) => void,
  setTrace: React.Dispatch<React.SetStateAction<string[]>>,
  setHighlights: React.Dispatch<React.SetStateAction<HighlightShape[]>>
) {
  setTrace((t) => [
    ...t,
    "[TRACE] Fetching draws from primary public endpoint...",
  ]);
  try {
    const res = await fetch(API_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error("Non-200 response");
    const data = await res.json();
    const draws: Draw[] = (data?.DrawResults || [])
      .filter((d: any) => d.ProductId === "WeekdayWindfall")
      .map((d: any) => ({
        main: d.PrimaryNumbers,
        supp: d.SecondaryNumbers,
        date: d.DrawDate,
      }));

    const validDraws = strictValidateDraws(draws);
    if (draws.length !== validDraws.length) {
      setTrace((t) => [
        ...t,
        `[TRACE] Warning: ${
          draws.length - validDraws.length
        } draws were discarded due to invalid format/range/duplicates.`,
      ]);
    }

    if (validDraws.length >= MIN_VALID_DRAWS) {
      const isNewestFirst =
        new Date(validDraws[0].date) >
        new Date(validDraws[validDraws.length - 1].date);
      const ordered = isNewestFirst
        ? validDraws.slice().reverse()
        : validDraws.slice();
      setHistory(ordered);
      setHighlights([]);
      setTrace((t) => [
        ...t,
        `[TRACE] Got ${validDraws.length} valid draws. Using ALL draws.`,
      ]);
      return;
    }
    setTrace((t) => [
      ...t,
      "[TRACE] Fewer than 45 valid draws; fallback (stub) history used.",
    ]);
  } catch (e) {
    setTrace((t) => [
      ...t,
      `[TRACE] Error fetching draws: ${String(e)}. Using stub data.`,
    ]);
  }
  let stub: Draw[] = [];
  let now = Date.now();
  for (let i = 0; i < 45; ++i) {
    stub.push({
      main: getUniqueRandomNumbers(NUM_MAINS, MAIN_MIN, MAIN_MAX),
      supp: getUniqueRandomNumbers(2, MAIN_MIN, MAIN_MAX),
      date: new Date(now - (44 - i) * 86400 * 1000).toISOString().slice(0, 10),
    });
  }
  setHistory(stub);
  setHighlights([]);
}

function strictValidateDraws(draws: Draw[]): Draw[] {
  return draws.filter((draw) => {
    if (!Array.isArray(draw.main) || !Array.isArray(draw.supp)) return false;
    if (draw.main.length !== 6 || draw.supp.length !== 2) return false;
    const allNumbers = [...draw.main, ...draw.supp];
    if (
      !allNumbers.every(
        (n) => typeof n === "number" && n >= 1 && n <= 45 && Number.isInteger(n)
      )
    )
      return false;
    const hasDupes = (arr: number[]) => new Set(arr).size !== arr.length;
    if (hasDupes(draw.main) || hasDupes(draw.supp)) return false;
    if (draw.supp.some((n) => draw.main.includes(n))) return false;
    if (!draw.date) draw.date = "unknown";
    return true;
  });
}

function countMatches(candidate: CandidateSet, mostRecentDraw: Draw): number[] {
  const candNums = new Set([...candidate.main, ...candidate.supp]);
  const drawNums = new Set([...mostRecentDraw.main, ...mostRecentDraw.supp]);
  return Array.from(candNums).filter((n) => drawNums.has(n));
}

function getCandidateNumberFrequencies(
  candidates: CandidateSet[]
): { number: number; count: number }[] {
  const freq = new Map<number, number>();
  candidates.forEach((c) => {
    [...c.main, ...c.supp].forEach((n) => {
      freq.set(n, (freq.get(n) || 0) + 1);
    });
  });
  return Array.from({ length: 45 }, (_, i) => ({
    number: i + 1,
    count: freq.get(i + 1) || 0,
  })).sort((a, b) => b.count - a.count || a.number - b.number);
}

function getNumberFrequencies(history: Draw[]): Map<number, number> {
  const freq = new Map<number, number>();
  for (const draw of history) {
    for (const n of [...draw.main, ...draw.supp]) {
      freq.set(n, (freq.get(n) || 0) + 1);
    }
  }
  return freq;
}

function computeNumberTrends(history: Draw[]): NumberTrend[] {
  // Use draw-count windows aligned to ~3 draws/week
  const spans = {
    d3: 3,
    d9: 9,
    d15: 15,
    fortnight: 6,   // ~2 weeks × 3 draws
    month: 12,      // ~4 weeks × 3 draws
    quarter: 36,    // ~12 weeks × 3 draws
    year: 156,      // ~52 weeks × 3 draws
    all: history.length,
  };
  const result: NumberTrend[] = [];
  for (let n = 1; n <= 45; n++) {
    const trend: NumberTrend = {
      number: n,
      d3: 0,
      d9: 0,
      d15: 0,
      fortnight: 0,
      month: 0,
      quarter: 0,
      year: 0,
      all: 0,
    };
    for (const [spanName, spanLen] of Object.entries(spans)) {
      const draws = history.slice(-spanLen);
      let count = 0;
      for (const draw of draws) {
        if (draw.main.includes(n) || draw.supp.includes(n)) count++;
      }
      (trend as any)[spanName] = count;
    }
    result.push(trend);
  }
  return result;
}

function traceFormat(
  history: Draw[],
  knobs: Knobs,
  candidates: CandidateSet[]
): string {
  return [
    "[TRACE START]",
    `History size: ${history.length} draws`,
    `Knobs: ${Object.entries(knobs)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")}`,
    ...candidates.map(
      (c, idx) =>
        `Candidate ${String.fromCharCode(65 + idx)}: {${c.main.join(
          ","
        )}} | Supp: {${c.supp.join(",")}} | Score: ${c.score}` +
        (c.trace && c.trace.length > 0
          ? " | Trace: " + c.trace.join("; ")
          : "") +
        (c.octagonalScore !== undefined
          ? ` | OGA: ${
              c.octagonalScore
            } | SpokeProfile: [${c.octagonalProfile?.join(",")}]`
          : "")
    ),
    "[TRACE END]",
  ].join("\n");
}

function getOddEvenRatio(nums: number[]): string {
  const odd = nums.filter((n) => n % 2 === 1).length;
  const even = nums.length - odd;
  return `${odd}:${even}`;
}

function computeOddEvenRatios(
  history: Draw[]
): { ratio: string; count: number; percent: number }[] {
  const ratioCount = new Map<string, number>();
  let total = 0;
  for (const draw of history) {
    const nums = [...draw.main, ...draw.supp];
    const ratio = getOddEvenRatio(nums);
    ratioCount.set(ratio, (ratioCount.get(ratio) || 0) + 1);
    total += 1;
  }
  const ratios = Array.from(ratioCount.entries())
    .map(([ratio, count]) => ({
      ratio,
      count,
      percent: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count || a.ratio.localeCompare(b.ratio));
  return ratios;
}

function extractAnalytics(trace: string[] | undefined) {
  let entropy = "",
    hamming = "",
    jaccard = "";
  if (trace) {
    for (const item of trace) {
      if (item.startsWith("Entropy:")) entropy = item.replace("Entropy:", "");
      if (item.startsWith("MinHamming:"))
        hamming = item.replace("MinHamming:", "");
      if (item.startsWith("MaxJaccard:"))
        jaccard = item.replace("MaxJaccard:", "");
    }
  }
  return { entropy, hamming, jaccard };
}

const KNOB_FIELDS: [keyof Knobs, string, number | boolean, number?, number?][] =
  [
    ["gpwf_window_size", "GPWF Window", 27, 5, 45],
    ["gpwf_bias_factor", "GPWF Bias", 0.05, 0, 1],
    ["gpwf_floor", "GPWF Floor", 0.5, 0, 1],
    ["gpwf_scale_multiplier", "GPWF Scale", 0.7, 0, 1],
    ["octagonal_top", "Octagonal Top", 9, 1, 45],
    ["exact_set_override", "Exact Set Override", false],
    ["hamming_relax", "Hamming Relax", false],
    ["gpwf_targeted_mode", "GPWF Targeted", false],
    ["enableHC3", "Enable HC3", true],
  ];

const App: React.FC = () => {
  // State
  const [entropyEnabled, setEntropyEnabled] = useState<boolean>(
    defaultKnobs.enableEntropy
  );
  const [hammingEnabled, setHammingEnabled] = useState<boolean>(
    defaultKnobs.enableHamming
  );
  const [jaccardEnabled, setJaccardEnabled] = useState<boolean>(
    defaultKnobs.enableJaccard
  );
  const [gpwfEnabled, setGPWFEnabled] = useState<boolean>(
    defaultKnobs.enableGPWF
  );

  const [entropyThreshold, setEntropyThreshold] = useState<number>(1.0);
  const [hammingThreshold, setHammingThreshold] = useState<number>(3);
  const [jaccardThreshold, setJaccardThreshold] = useState<number>(0.5);
  const [lambda, setLambda] = useState<number>(0.85);
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [history, setHistory] = useState<Draw[]>([]);
  const [windowMode, setWindowMode] = useState<
    "W" | "F" | "M" | "Q" | "Y" | "H" | "Custom"
  >("H");
  const [customDrawCount, setCustomDrawCount] = useState<number>(1);
  const [windowEnabled, setWindowEnabled] = useState<boolean>(true);
  const [knobs, setKnobs] = useState<Knobs>(defaultKnobs);
  const [gpwf_window_size, setGPWFWindowSize] = useState<number>(
    defaultKnobs.gpwf_window_size
  );
  const [gpwf_bias_factor, setGPWFBiasFactor] = useState<number>(
    defaultKnobs.gpwf_bias_factor
  );
  const [gpwf_floor, setGPWFFloor] = useState<number>(
    defaultKnobs.gpwf_floor
  );
  const [gpwf_scale_multiplier, setGPWFScaleMultiplier] = useState<number>(
    defaultKnobs.gpwf_scale_multiplier
  );
  const [candidates, setCandidates] = useState<CandidateSet[]>([]);
  const [ratioSummary, setRatioSummary] = useState<any>(null);
  const [quotaWarning, setQuotaWarning] = useState<string | undefined>(
    undefined
  );
  const [trace, setTrace] = useState<string[]>([]);
  const [numCandidates, setNumCandidates] = useState<number>(8);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [simulatedDraw, setSimulatedDraw] = useState<Draw | null>(null);
  const [dgaGrid, setDgaGrid] = useState<number[][]>([]);
  const [dgaDiamonds, setDgaDiamonds] = useState<any[]>([]);
  const [dgaPredictions, setDgaPredictions] = useState<number[]>([]);
  const [dgaDrawLabels, setDgaDrawLabels] = useState<string[]>([]);
  const [numberCounts, setNumberCounts] = useState<number[]>([]);
  const [minCount, setMinCount] = useState<number>(0);
  const [maxCount, setMaxCount] = useState<number>(0);
  const [minRecentMatches, setMinRecentMatches] = React.useState<number>(0);
  const [recentMatchBias, setRecentMatchBias] = React.useState<number>(0);
  const [selectedCandidateIdx, setSelectedCandidateIdx] =
    useState<number>(0);
  const [highlightMsg, setHighlightMsg] = useState<string>("");
  const [highlights, setHighlights] = useState<any[]>([]);
  const [excludedNumbers, setExcludedNumbers] = useState<number[]>([]);
  const [ratioOptions, setRatioOptions] = useState<
    { ratio: string; count: number; percent: number }[]
  >([]);
  const [selectedRatios, setSelectedRatios] = useState<string[]>([]);
  const [useTrickyRule, setUseTrickyRule] = useState<boolean>(false);
  const [minOGAPercentile, setMinOGAPercentile] = useState<number>(0);
  const [trendSelectedNumbers, setTrendSelectedNumbers] = useState<number[]>(
    []
  );
  const handleTrendNumberToggle = (n: number) => {
    setTrendSelectedNumbers((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
    );
  };

  useEffect(() => {
    if (history.length > 0) {
      setCustomDrawCount(history.length);
    }
  }, [history]);

  function getActiveWindowSize() {
    if (!windowEnabled) return history.length;
    if (windowMode === "Custom") return customDrawCount;
    const windowOption = WINDOW_OPTIONS.find((opt) => opt.key === windowMode);
    if (!windowOption || windowOption.size === null) return history.length;
    return Math.min(windowOption.size, history.length);
  }

  const activeWindowSize = getActiveWindowSize();
  const filteredHistory = history.slice(-activeWindowSize);

  // Compute full exclusion list for analyzers (user + SDE1 + HC3)
  const sde1Exclusions = getSDE1FilteredPool(filteredHistory).excludedNumbers;
  let hc3Exclusions: number[] = [];
  if (knobs.enableHC3 && filteredHistory.length >= 2) {
    const last = filteredHistory[filteredHistory.length - 1];
    const prev = filteredHistory[filteredHistory.length - 2];
    hc3Exclusions = [...last.main, ...last.supp].filter((n) =>
      [...prev.main, ...prev.supp].includes(n)
    );
  }
  const allExclusions = Array.from(
    new Set([...excludedNumbers, ...sde1Exclusions, ...hc3Exclusions])
  );

  const matchingCandidateCount = useMemo(() => {
    if (selectedNumbers.length === 0) return 0;
    return candidates.filter((c) =>
      selectedNumbers.every((n) => c.main.includes(n) || c.supp.includes(n))
    ).length;
  }, [candidates, selectedNumbers]);

  const numberTrends = useMemo(
    () => computeNumberTrends(filteredHistory),
    [filteredHistory]
  );

// Reduce to the shape trendBias needs
const shortTrends = useMemo(
  () =>
    numberTrends.map(t => ({
      number: t.number,
      fortnight: t.fortnight,
      month: t.month,
    })),
  [numberTrends]
);

// Build trend weights INSIDE the component
const trendWeights = useMemo(
  () => buildTrendWeights(shortTrends, { method: "exp", beta: 3.0 }),
  [shortTrends]
);

  function getMatchCount(candidate: CandidateSet, selected: number[]): number {
    const set = new Set([...candidate.main, ...candidate.supp]);
    return selected.filter((n) => set.has(n)).length;
  }

  const pastOGAScores = useMemo(() => {
    return filteredHistory.map((draw, idx, arr) =>
      computeOGA([...draw.main, ...draw.supp], arr.slice(0, idx) || [])
    );
  }, [filteredHistory]);

  React.useEffect(() => {
    if (!candidates.length || !filteredHistory.length) return;
    setCandidates((prev) =>
      prev.map((c) => {
        const nums = [...c.main, ...c.supp];
        const score = computeOGA(nums, filteredHistory);
        const percentile = getOGAPercentile(score, pastOGAScores);
        return { ...c, ogaScore: score, ogaPercentile: percentile };
      })
    );
  }, [candidates, pastOGAScores, filteredHistory]);

  useEffect(() => {
    setRatioOptions(computeOddEvenRatios(filteredHistory));
    setSelectedRatios((ratios) =>
      ratios.filter((r) => ratioOptions.some((opt) => opt.ratio === r))
    );
  }, [filteredHistory]);

  useEffect(() => {
    fetchDraws(setHistory, setTrace, setHighlights);
  }, []);

  useEffect(() => {
    setKnobs((prev) => ({
      ...prev,
      gpwf_window_size,
      gpwf_bias_factor,
      gpwf_floor,
      gpwf_scale_multiplier,
    }));
  }, [gpwf_window_size, gpwf_bias_factor, gpwf_floor, gpwf_scale_multiplier]);

  useEffect(() => {
    const recentHistory = filteredHistory;
    const draws = recentHistory.length;
    if (draws < 10) {
      setDgaDiamonds([]);
      setDgaPredictions([]);
      setDgaGrid([]);
      setDgaDrawLabels([]);
      setNumberCounts([]);
      setMinCount(0);
      setMaxCount(0);
      setHighlightMsg("Insufficient valid draws for visualization.");
      return;
    }

    let grid = buildDrawGrid(recentHistory, 45, draws);
    let drawLabels = Array.from({ length: draws }, (_: unknown, i: number) =>
      (i + 1).toString()
    );
    grid = grid.map((row: number[]) => [...row, 0]);
    drawLabels = [
      ...drawLabels,
      (draws + 1).toString() + (simulatedDraw ? "*" : ""),
    ];

    if (simulatedDraw) {
      for (const n of simulatedDraw.main) {
        if (n >= 1 && n <= 45) grid[n - 1][grid[0].length - 1] = 1;
      }
      for (const n of simulatedDraw.supp) {
        if (n >= 1 && n <= 45) grid[n - 1][grid[0].length - 1] = 2;
      }
    }

    const diamonds = findDiamondsAllRadii(grid, 1, 4);
    const predictions = getPredictedNumbers(diamonds, grid[0].length - 1);

    setDgaGrid(grid);
    setDgaDiamonds(diamonds);
    setDgaPredictions(predictions);
    setDgaDrawLabels(drawLabels);

    const counts: number[] = Array(45).fill(0);
    recentHistory.forEach((draw) => {
      draw.main.forEach((n) => (n >= 1 && n <= 45 ? counts[n - 1]++ : null));
      draw.supp.forEach((n) => (n >= 1 && n <= 45 ? counts[n - 1]++ : null));
    });
    setNumberCounts(counts);
    setMinCount(Math.min(...counts));
    setMaxCount(Math.max(...counts));
    setHighlightMsg("");
  }, [filteredHistory, simulatedDraw]);

  const handleKnobChange = (k: keyof Knobs, v: any) => {
    setKnobs((prev: Knobs) => ({
      ...prev,
      [k]: typeof v === "boolean" ? v : Number(v),
    }));
  };

  const mostRecentDraw =
    filteredHistory.length > 0
      ? filteredHistory[filteredHistory.length - 1]
      : null;
  const mostRecentNumbers = mostRecentDraw
    ? [...mostRecentDraw.main, ...mostRecentDraw.supp]
    : [];

  const handleGenerate = () => {
    setTrace([]);
    const result = generateCandidates(
      numCandidates,
      filteredHistory,
      knobs,
      setTrace,
      excludedNumbers,
      selectedRatios,
      useTrickyRule,
      minOGAPercentile,
      pastOGAScores,
      trendSelectedNumbers,
      entropyThreshold,
      hammingThreshold,
      jaccardThreshold,
      lambda,
      ratioOptions,
      minRecentMatches,
      recentMatchBias
    );
    let processedCandidates = [...result.candidates];
    if (mostRecentDraw) {
      const numberFreq = getNumberFrequencies(filteredHistory);
      processedCandidates.forEach((c) => {
        c.matchedNumbers = countMatches(c, mostRecentDraw);
        c.numMatches = c.matchedNumbers.length;
        c.matchHistoryFrequency = c.matchedNumbers.reduce(
          (sum, n) => sum + (numberFreq.get(n) || 0),
          0
        );
      });
      processedCandidates.sort(
        (a, b) =>
          (b.numMatches ?? 0) - (a.numMatches ?? 0) ||
          (b.matchHistoryFrequency ?? 0) - (a.matchHistoryFrequency ?? 0)
      );
    }
    setCandidates(processedCandidates);
    setRatioSummary(result.ratioSummary);
    setQuotaWarning(result.quotaWarning);
    setSelectedCandidateIdx(0);
    setTrace((t) => [
      ...t,
      traceFormat(filteredHistory, knobs, processedCandidates),
    ]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const content = evt.target?.result as string;
        const parsed = parseCSVorJSON(content);
        const validDraws = strictValidateDraws(parsed);
        if (parsed.length !== validDraws.length) {
          setTrace((t) => [
            ...t,
            `[TRACE] Warning: ${
              parsed.length - validDraws.length
            } draws were discarded due to invalid format/range/duplicates.`,
          ]);
        }
        if (validDraws.length >= MIN_VALID_DRAWS) {
          const isNewestFirst =
            new Date(validDraws[0].date) >
            new Date(validDraws[validDraws.length - 1].date);
          const ordered = isNewestFirst
            ? validDraws.slice().reverse()
            : validDraws.slice();
          setHistory(ordered);
          setHighlights([]);
          setTrace((t) => [
            ...t,
            `[TRACE] Imported ${validDraws.length} valid draws from file.`,
          ]);
        } else {
          setTrace((t) => [
            ...t,
            `[TRACE] Imported file has insufficient valid draws (${validDraws.length}).`,
          ]);
        }
      } catch (err) {
        setTrace((t) => [...t, "[TRACE] Failed to parse uploaded file."]);
      }
    };
    reader.readAsText(file);
  };

  const handleSimulateDraw = () => {
    if (!candidates[selectedCandidateIdx]) return;
    setSimulatedDraw({
      main: [...candidates[selectedCandidateIdx].main],
      supp: [...candidates[selectedCandidateIdx].supp],
      date: "(simulated)",
    });
  };

  const handleConfirmSimulatedDraw = () => {
    if (!simulatedDraw) return;
    const markedDraw = { ...simulatedDraw, isSimulated: true };
    setHistory([...history, markedDraw]);
    setSimulatedDraw(null);
    setCandidates([]);
    setTrace((t) => [...t, "[TRACE] Simulated draw added to history."]);
    setHighlights([]);
  };

  const handleResetSimulatedDraw = () => setSimulatedDraw(null);

  const handleRatioToggle = (ratio: string) => {
    setSelectedRatios((prev) => {
      if (prev.includes(ratio)) {
        return prev.filter((r) => r !== ratio);
      } else {
        return [...prev, ratio];
      }
    });
    setUseTrickyRule(false);
  };
  const handleTrickyToggle = () => {
    setUseTrickyRule((prev) => !prev);
    if (!useTrickyRule) setSelectedRatios([]);
  };

  const previewStats = useMemo(() => {
    const candidate = candidates[selectedCandidateIdx];
    return {
      hamming: candidate ? minHamming(candidate, filteredHistory) : 0,
      entropy: candidate ? entropy(candidate) : 0,
      jaccard: candidate ? maxJaccard(candidate, filteredHistory) : 0,
    };
  }, [candidates, selectedCandidateIdx, filteredHistory]);

  const currentCandidate = candidates[selectedCandidateIdx];
  const currentOGA = currentCandidate?.ogaScore;
  const currentOGAPercentile = currentCandidate?.ogaPercentile;

  const candidatesWithMatch = useMemo(() => {
    return candidates.filter((c) => getMatchCount(c, selectedNumbers) > 0)
      .length;
  }, [candidates, selectedNumbers]);

  const avgMatches = useMemo(() => {
    if (!candidates.length || !selectedNumbers.length) return "0";
    const totalMatches = candidates.reduce(
      (acc, c) => acc + getMatchCount(c, selectedNumbers),
      0
    );
    return (totalMatches / candidates.length).toFixed(2);
  }, [candidates, selectedNumbers]);

  const maxGPWFWindow =
    filteredHistory.length > 0 ? filteredHistory.length : 45;

  // NEW: global Monte Carlo layout state (inside component)
  const [mcLayout, setMcLayout] = useState<MonteCarloLayout>("grid");
  const [mcColumns, setMcColumns] = useState<number>(4);

  return (
    <div style={{ fontFamily: "monospace", padding: 20, maxWidth: 1700 }}>
      <h2>
        🇦🇺 Weekday Windfall – Maximum Validated Set Generator{" "}
        <span style={{ fontSize: 16, color: "#666" }}>TypeScript Demo</span>
      </h2>

      {/* --- Number Trends Table section --- */}
      <details open>
        <summary>
          <b>Number Trends Table</b>
          <span style={{ fontWeight: 400, fontSize: 13, marginLeft: 10 }}>
            (Click a number to mark for forced inclusion)
          </span>
        </summary>
<NumberTrendsTable
  trends={numberTrends}
  onToggle={handleTrendNumberToggle}
  selected={trendSelectedNumbers}
/>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
          Colored rows indicate numbers you have selected to include in the next candidate generation.
        </div>
      </details>

      {/* --------- Phase 0: Draw History Section --------- */}
      <details open>
        <summary>
          <b>Phase 0: Draw History ({history.length} draws)</b>
        </summary>
        <button
          onClick={() => {
            if (fileInputRef.current) fileInputRef.current.click();
          }}
          style={{ marginRight: 8, marginBottom: 5 }}
        >
          Import Draws (CSV/JSON)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json"
          style={{ display: "none" }}
          onChange={handleFileUpload}
        />
        <pre style={{ maxHeight: 160, overflow: "auto", fontSize: 12 }}>
          {history
            .map(
              (d, i) =>
                `${d.date}: [${d.main.join(", ")}] | Sup: [${d.supp.join(
                  ", "
                )}]`
            )
            .join("\n")}
        </pre>
      </details>

      <MonteCarloAnalyzer
  history={history}
  excludedNumbers={excludedNumbers}
  trendWeights={trendWeights}
        layout={mcLayout}
        columns={mcColumns}
        showLayoutControls={false}
      />
      <SurvivalAnalyzer
        history={filteredHistory}
        excludedNumbers={allExclusions}
        probabilityHeading="Probability of Appearance in Next Draw (Per Number):"
trendWeights={trendWeights}
      />

      {/* --------- Odd/Even Ratio & Tricky Rule Section --------- */}
      <details open>
        <summary>
          <b>Odd/Even Ratio Filters</b>
          <span style={{ fontWeight: 400, fontSize: 13, marginLeft: 10 }}>
            (Select one or more ratios, or use Tricky Rule)
          </span>
        </summary>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontWeight: "bold", display: "inline-block", marginRight: 16 }}>
            <input
              type="checkbox"
              checked={useTrickyRule}
              onChange={handleTrickyToggle}
              disabled={selectedRatios.length > 0}
              style={{ marginRight: 6 }}
            />
            Apply Tricky Rule
          </label>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
          {ratioOptions.map(({ ratio, count, percent }) => (
            <label
              key={ratio}
              style={{ marginRight: 16, opacity: useTrickyRule ? 0.4 : 1.0 }}
            >
              <input
                type="checkbox"
                checked={selectedRatios.includes(ratio)}
                onChange={() => handleRatioToggle(ratio)}
                disabled={useTrickyRule}
                style={{ marginRight: 6 }}
              />
              {ratio} ({count} draws, {percent}%)
            </label>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
          Applies to total (all 8 numbers in a draw). Only ratios seen in history are available.
        </div>
      </details>

      {/* --------- Candidate Controls & Table --------- */}
      <div style={{ padding: 32, fontFamily: "sans-serif", maxWidth: 900 }}>
        <details open>
          <summary>
            <b>Operator’s Panel – Candidate Generation Controls</b>
          </summary>
          <OperatorsPanel
            entropy={entropyThreshold}
            setEntropy={setEntropyThreshold}
            entropyEnabled={entropyEnabled}
            setEntropyEnabled={setEntropyEnabled}
            hamming={hammingThreshold}
            setHamming={setHammingThreshold}
            hammingEnabled={hammingEnabled}
            setHammingEnabled={setHammingEnabled}
            jaccard={jaccardThreshold}
            setJaccard={setJaccardThreshold}
            jaccardEnabled={jaccardEnabled}
            setJaccardEnabled={setJaccardEnabled}
            lambda={lambda}
            setLambda={setLambda}
            minRecentMatches={minRecentMatches}
            setMinRecentMatches={setMinRecentMatches}
            recentMatchBias={recentMatchBias}
            setRecentMatchBias={setRecentMatchBias}
            previewStats={previewStats}
            gpwfEnabled={gpwfEnabled}
            setGPWFEnabled={setGPWFEnabled}
            gpwf_window_size={gpwf_window_size}
            setGPWFWindowSize={setGPWFWindowSize}
            maxGPWFWindow={maxGPWFWindow}
            gpwf_bias_factor={gpwf_bias_factor}
            setGPWFBiasFactor={setGPWFBiasFactor}
            gpwf_floor={gpwf_floor}
            setGPWFFloor={setGPWFFloor}
            gpwf_scale_multiplier={gpwf_scale_multiplier}
            setGPWFScaleMultiplier={setGPWFScaleMultiplier}
            mcLayout={mcLayout}
            setMcLayout={setMcLayout}
            mcColumns={mcColumns}
            setMcColumns={setMcColumns}
          />
        </details>

        <details>
          <summary>
            <b>Analytics Filters</b>
          </summary>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            {ANALYTIC_FIELDS.filter(
              ([k]) =>
                ![
                  "enableEntropy",
                  "enableHamming",
                  "enableJaccard",
                  "enableGPWF",
                ].includes(k)
            ).map(([k, label]) => (
              <label key={String(k)}>
                <input
                  type="checkbox"
                  checked={knobs[k] as boolean}
                  onChange={(e) =>
                    setKnobs((prev: Knobs) => ({
                      ...prev,
                      [k]: e.target.checked,
                    }))
                  }
                  style={{ marginRight: 6 }}
                />
                {label}
              </label>
            ))}
          </div>
        </details>

        <details open>
          <summary>
            <b>Exclude Numbers</b>
            <span style={{ fontWeight: 400, fontSize: 13, marginLeft: 10 }}>
              (Checked numbers will be excluded)
            </span>
          </summary>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              margin: "8px 0 12px 0",
            }}
          >
            {Array.from({ length: 45 }, (_, i) => {
              const n = i + 1;
              const checked = excludedNumbers.includes(n);
              return (
                <label
                  key={n}
                  style={{ width: 40, textAlign: "center", margin: "2px 0" }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setExcludedNumbers((prev) =>
                        checked
                          ? prev.filter((num) => num !== n)
                          : [...prev, n]
                      );
                    }}
                    style={{ marginRight: 4 }}
                  />
                  {n}
                </label>
              );
            })}
          </div>
        </details>

        <details>
          <summary>
            <b>Knobs & Flags</b>
          </summary>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 20,
              alignItems: "center",
            }}
          >
            {KNOB_FIELDS.map(([k, label, def, min, max]) => (
              <label key={String(k)} style={{ margin: 4 }}>
                {label}:{" "}
                {typeof def === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={!!knobs[k as keyof Knobs]}
                    onChange={(e) =>
                      handleKnobChange(k as keyof Knobs, e.target.checked)
                    }
                  />
                ) : (
                  <input
                    type="number"
                    style={{ width: 60 }}
                    value={
                      typeof knobs[k as keyof Knobs] === "number"
                        ? (knobs[k as keyof Knobs] as number)
                        : ""
                    }
                    min={min}
                    max={max}
                    step="any"
                    onChange={(e) =>
                      handleKnobChange(k as keyof Knobs, e.target.value)
                    }
                  />
                )}
              </label>
            ))}
          </div>
        </details>

        <details open>
          <summary>
            <b>OGA Percentile Filter</b>
            <span style={{ fontWeight: 400, fontSize: 13, marginLeft: 10 }}>
              (Minimum percentile required, 0% = no filter)
            </span>
          </summary>
          <div style={{ margin: "8px 0" }}>
            <input
              type="number"
              min={0}
              max={100}
              value={minOGAPercentile}
              onChange={(e) => setMinOGAPercentile(Number(e.target.value))}
              style={{ width: 60, marginRight: 6 }}
            />
            %
          </div>
          <OGAHistogram
            ogaScores={pastOGAScores}
            candidateOGA={currentOGA}
            candidatePercentile={currentOGAPercentile}
          />
        </details>

        {/* -------- Select window UI -------- */}
        <div
          style={{
            marginBottom: 18,
            border: "1px solid #eee",
            padding: 14,
            borderRadius: 7,
            background: "#f4f9ff",
          }}
        >
          <label style={{ fontWeight: "bold", marginRight: 16 }}>
            <input
              type="checkbox"
              checked={windowEnabled}
              onChange={(e) => setWindowEnabled(e.target.checked)}
              style={{ marginRight: 7 }}
            />
            Enable windowed draw filtering (WFMQYH)
          </label>
          <span style={{ marginLeft: 18 }}>
            {WINDOW_OPTIONS.map((opt) => (
              <label key={opt.key} style={{ marginRight: 14 }}>
                <input
                  type="radio"
                  name="windowMode"
                  value={opt.key}
                  checked={windowMode === opt.key}
                  disabled={!windowEnabled}
                  onChange={(e) => setWindowMode(e.target.value as any)}
                />
                {opt.label}
              </label>
            ))}
            {windowMode === "Custom" && (
              <input
                type="number"
                min={1}
                max={history.length}
                value={customDrawCount}
                disabled={!windowEnabled}
                onChange={(e) => setCustomDrawCount(Number(e.target.value))}
                style={{ width: 70, marginLeft: 6 }}
                placeholder="Draw count"
              />
            )}
          </span>
        </div>
        <div style={{ marginBottom: 8, fontSize: 15, color: "#1976d2" }}>
          Currently using the last <b>{activeWindowSize}</b> draws for candidate
          generation and analysis.
        </div>
        {windowEnabled && activeWindowSize < 10 && (
          <div style={{ color: "#d32f2f", fontWeight: "bold", fontSize: 14 }}>
            Warning: Too few draws selected. Increase window for reliable
            results.
          </div>
        )}

        {/* -------- Generate Button -------- */}
        <div style={{ margin: "18px 0" }}>
          <label>
            Number of candidates to generate:{" "}
            <input
              type="number"
              min={1}
              max={32}
              value={numCandidates}
              onChange={(e) => setNumCandidates(Number(e.target.value))}
              style={{ width: 50 }}
            />
          </label>{" "}
          <button onClick={handleGenerate}>Generate!</button>
        </div>

        {/* --------- Ratio Summary and Warnings --------- */}
        {ratioSummary && (
          <div style={{ margin: "12px 0", fontSize: 13 }}>
            <b>Ratio Distribution:</b>
            <ul>
              {Object.entries(ratioSummary).map(
                ([ratio, { target, actual }]: any) => (
                  <li
                    key={ratio}
                    style={{
                      color: actual < (target || 0) ? "#c00" : undefined,
                    }}
                  >
                    {ratio}: generated <b>{actual}</b>
                    {target ? ` (target ${target})` : ""}
                  </li>
                )
              )}
            </ul>
            {quotaWarning && (
              <div style={{ color: "#c00", fontWeight: "bold" }}>
                {quotaWarning}
              </div>
            )}
          </div>
        )}

        {/* --------- Generated Candidates Table --------- */}
        <details open>
          <summary>
            <b>Generated Candidates</b>
          </summary>

          {/* --- Number selection grid and count --- */}
          <div style={{ margin: "14px 0" }}>
            <b>Select numbers to check against generated candidates:</b>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 5,
                margin: "6px 0 10px 0",
              }}
            >
              {Array.from({ length: 45 }, (_, i) => {
                const n = i + 1;
                return (
                  <label key={n} style={{ width: 28 }}>
                    <input
                      type="checkbox"
                      checked={selectedNumbers.includes(n)}
                      onChange={() => {
                        setSelectedNumbers((prev) =>
                          prev.includes(n)
                            ? prev.filter((x) => x !== n)
                            : [...prev, n]
                        );
                      }}
                    />
                    {n}
                  </label>
                );
              })}
            </div>
            <span style={{ fontSize: 15 }}>
              <b>
                Candidates with ≥1 selected number:{" "}
                <span style={{ color: "#1976d2" }}>
                  {candidatesWithMatch}
                </span>{" "}
                / {candidates.length}
                &nbsp;|&nbsp; Avg. matches per candidate:{" "}
                <span style={{ color: "#d32f2f" }}>{avgMatches}</span> /{" "}
                {selectedNumbers.length}
              </b>
            </span>
          </div>

          {candidates.length === 0 ? (
            <i>No candidates generated yet.</i>
          ) : (
            <>
              <table
                style={{
                  borderCollapse: "collapse",
                  fontSize: 15,
                  marginTop: 8,
                  minWidth: 690,
                }}
              >
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Main Numbers</th>
                    <th>Supps</th>
                    <th>Score</th>
                    <th>Entropy</th>
                    <th>Hamming</th>
                    <th>Jaccard</th>
                    <th>OGA</th>
                    <th>OGA %ile</th>
                    <th>Odd/Even</th>
                    <th>Sel. #s Matched</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c, i) => {
                    const { entropy, hamming, jaccard } =
                      extractAnalytics(c.trace);
                    const oddEven = getOddEvenRatio([
                      ...c.main,
                      ...c.supp,
                    ]);
                    const matchedCount = getMatchCount(
                      c,
                      selectedNumbers
                    );
                    const candidateHasSelected = matchedCount > 0;
                    return (
                      <tr
                        key={i}
                        style={{
                          background: candidateHasSelected
                            ? "#E3FCEC"
                            : i === selectedCandidateIdx
                            ? "#FFF9C4"
                            : undefined,
                          cursor: "pointer",
                        }}
                        onClick={() => setSelectedCandidateIdx(i)}
                        title="Click to select this candidate"
                      >
                        <td style={{ textAlign: "right" }}>{i + 1}</td>
                        <td>
                          <b>
                            {c.main.map((n: number) => (
                              <span
                                key={n}
                                style={{
                                  display: "inline-block",
                                  width: 26,
                                  textAlign: "center",
                                  background: mostRecentNumbers.includes(n)
                                    ? "#ffe58f"
                                    : undefined,
                                  borderRadius: 4,
                                  fontWeight: mostRecentNumbers.includes(n)
                                    ? "bold"
                                    : undefined,
                                }}
                              >
                                {n}
                              </span>
                            ))}
                          </b>
                        </td>
                        <td>
                          <b>
                            {c.supp.map((n: number) => (
                              <span
                                key={n}
                                style={{
                                  display: "inline-block",
                                  width: 26,
                                  textAlign: "center",
                                  color: "#1976d2",
                                  background: mostRecentNumbers.includes(n)
                                    ? "#ffe58f"
                                    : undefined,
                                  borderRadius: 4,
                                  fontWeight: mostRecentNumbers.includes(n)
                                    ? "bold"
                                    : undefined,
                                }}
                              >
                                {n}
                              </span>
                            ))}
                          </b>
                        </td>
                        <td style={{ textAlign: "right" }}>{c.score}</td>
                        <td style={{ textAlign: "right" }}>{entropy}</td>
                        <td style={{ textAlign: "right" }}>{hamming}</td>
                        <td style={{ textAlign: "right" }}>{jaccard}</td>
                        <td style={{ textAlign: "right" }}>
                          {c.ogaScore !== undefined
                            ? c.ogaScore.toFixed(2)
                            : ""}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {c.ogaPercentile !== undefined
                            ? c.ogaPercentile.toFixed(1)
                            : ""}
                        </td>
                        <td style={{ textAlign: "right" }}>{oddEven}</td>
                        <td style={{ textAlign: "right" }}>
                          {matchedCount} / {selectedNumbers.length}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* --- Number Frequency Table, sorted high to low --- */}
              <div style={{ margin: "24px 0 10px 0" }}>
                <b>
                  Number Frequency in Generated Candidates (sorted high to low):
                </b>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 20,
                    marginTop: 8,
                  }}
                >
                  {(() => {
                    const freqList =
                      getCandidateNumberFrequencies(candidates);
                    const columns = 5;
                    const rows = Math.ceil(freqList.length / columns);

                    const cols = Array.from({ length: columns }, (_, colIdx) =>
                      freqList.slice(colIdx * rows, (colIdx + 1) * rows)
                    );
                    return (
                      <div style={{ display: "flex", gap: 20 }}>
                        {cols.map((col, colIdx) => (
                          <table
                            key={colIdx}
                            style={{
                              borderCollapse: "collapse",
                              fontSize: 15,
                              minWidth: 110,
                              background: "#f6faff",
                              border: "1px solid #e0e0e0",
                            }}
                          >
                            <thead>
                              <tr>
                                <th style={{ padding: "2px 8px" }}>
                                  Number
                                </th>
                                <th style={{ padding: "2px 8px" }}>
                                  Count
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {col.map(({ number, count }) => (
                                <tr key={number}>
                                  <td
                                    style={{
                                      padding: "2px 8px",
                                      textAlign: "right",
                                      fontWeight: "bold",
                                      background: "#e3fcec",
                                      borderRight: "2px solid #fff",
                                    }}
                                  >
                                    <span
                                      style={{
                                        display: "inline-block",
                                        minWidth: "32px",
                                        fontWeight: "bold",
                                        fontSize: "16px",
                                        color: "#333",
                                      }}
                                    >
                                      {number}
                                    </span>
                                  </td>
                                  <td
                                    style={{
                                      padding: "2px 8px",
                                      textAlign: "right",
                                      background: "#dbeafe",
                                      color: "#1976d2",
                                      borderRadius: "7px",
                                      fontWeight: 700,
                                      fontSize: "15px",
                                    }}
                                  >
                                    <span
                                      style={{
                                        background: "#fff",
                                        padding: "2px 8px",
                                        borderRadius: "6px",
                                        border: "1px solid #90caf9",
                                        color: "#1976d2",
                                        fontWeight: 700,
                                        minWidth: "28px",
                                        display: "inline-block",
                                      }}
                                    >
                                      {count}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                  Count = number of times each lottery number appears among all
                  generated candidates (main + supp).
                </div>
              </div>
            </>
          )}
        </details>
      </div>

      {/* --------- Simulation Section --------- */}
      <div style={{ margin: "22px 0" }}>
        {candidates.length > 1 && (
          <span style={{ marginRight: 12 }}>
            Simulate using candidate:{" "}
            <select
              value={selectedCandidateIdx}
              onChange={(e) =>
                setSelectedCandidateIdx(Number(e.target.value))
              }
              style={{ fontSize: 15 }}
            >
              {candidates.map((c, i) => (
                <option key={i} value={i}>
                  {i + 1}
                </option>
              ))}
            </select>
          </span>
        )}
        <button
          onClick={handleSimulateDraw}
          disabled={!candidates[selectedCandidateIdx] || !!simulatedDraw}
          style={{ marginRight: 12 }}
        >
          Simulate Draw (use candidate {selectedCandidateIdx + 1})
        </button>
        {simulatedDraw && (
          <>
            <span style={{ color: "#1976d2" }}>
              Simulated draw shown in DGA grid.
            </span>
            <button
              onClick={handleConfirmSimulatedDraw}
              style={{ marginLeft: 16, marginRight: 8 }}
            >
              Confirm Draw
            </button>
            <button onClick={handleResetSimulatedDraw}>
              Reset Simulation
            </button>
          </>
        )}
        {/* Remove Last Simulated Draw button */}
        {history.length > 0 &&
          (history as any)[history.length - 1].isSimulated && (
            <button
              onClick={() => {
                setHistory(history.slice(0, -1));
                setTrace((t) => [
                  ...t,
                  "[TRACE] Last simulated draw removed from history.",
                ]);
              }}
              style={{ marginLeft: 12, color: "#c00" }}
            >
              Remove Last Simulated Draw
            </button>
          )}
      </div>

      {/* --------- Diamond Grid Visualization --------- */}
      <details open style={{ marginTop: 18 }}>
        <summary>
          <b>Diamond Grid Analysis (DGA) – White Diamond Visualization</b>
        </summary>
        {highlightMsg && (
          <div style={{ color: "#c00", marginBottom: 12 }}>
            {highlightMsg}
          </div>
        )}
        {dgaGrid.length > 0 ? (
          <DGAVisualizer
            grid={dgaGrid}
            diamonds={dgaDiamonds}
            predictions={dgaPredictions}
            drawLabels={dgaDrawLabels}
            numberLabels={Array.from(
              { length: 45 },
              (_: unknown, i: number) => String(i + 1)
            )}
            numberCounts={numberCounts}
            minCount={minCount}
            maxCount={maxCount}
            highlights={highlights}
            setHighlights={setHighlights}
          />
        ) : (
          <i>No grid data available.</i>
        )}
      </details>

      {/* --------- Trace Log --------- */}
      <details style={{ marginTop: 14 }} open>
        <summary>
          <b>Trace Log</b>
        </summary>
        <pre style={{ background: "#fafafa", padding: 10, fontSize: 13 }}>
          {trace.join("\n")}
        </pre>
      </details>

      {/* --------- Notes Section --------- */}
      <div style={{ marginTop: 32, color: "#888", fontSize: 13 }}>
        <b>Note:</b> SDE1 is enforced at pool level: candidate main numbers are
        drawn only from numbers whose last digit does <b>not</b> appear more
        than once in the most recent draw. The SDE1 exclusion is logged with
        full diagnostics at the top of the trace. Also, candidates must now have
        at least one pair of main numbers sharing the same second digit (hard
        constraint).
        <br />
        <br />
        <b>Diamond Grid Analysis (DGA):</b> This visualization shows all "white"
        diamonds (of variable size) across the grid of recent draws and numbers,
        and highlights the leading edge as predictions for the next draw. Each
        number is colored distinctly. <br />
        <span style={{ background: "#e6f7ff", padding: "1px 5px" }}>
          Diamond
        </span>{" "}
        <span style={{ background: "#ffe58f", padding: "1px 5px" }}>
          Prediction Edge
        </span>{" "}
        <span
          style={{
            display: "inline-block",
            width: 16,
            height: 12,
            background: `rgba(0,0,255,0.25)`,
            border: "1px solid #999",
            marginLeft: 6,
            marginRight: 2,
            verticalAlign: "middle",
          }}
        />{" "}
        Coldest{" "}
        <span
          style={{
            display: "inline-block",
            width: 16,
            height: 12,
            background: `rgba(255,0,0,0.7)`,
            border: "1px solid #999",
            marginLeft: 2,
            marginRight: 2,
            verticalAlign: "middle",
          }}
        />{" "}
        Hottest
      </div>
    </div>
  );
};

export default App;
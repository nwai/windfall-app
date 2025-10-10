import React, { useState, useRef, useEffect, useMemo } from "react";
import { ResponsiveBar } from "@nivo/bar";
import { checkHardConstraints } from "./hardConstraints";
import { gpwfScore } from "./gpwf";
import { entropy, minHamming, maxJaccard, fingerprint } from "./analytics";
import { applyOctagonalPostProcess } from "./octagonal";
import { parseCSVorJSON } from "./parseCSVorJSON";
import { CandidateSet, Draw, Knobs } from "./types";
import { getSDE1FilteredPool } from "./sde1";
import {
  buildDrawGrid,
  findDiamondsAllRadii,
  getPredictedNumbers,
} from "./dga";
import { DGAVisualizer } from "./DGAVisualizer";
import { validateTrickyRule } from "./trickyRule";
import { computeOGA, getOGAPercentile } from "./utils/oga";


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

// ---- Odd/Even Ratio Utilities ----
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
// ---- End Odd/Even Ratio Utilities ----

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

const ANALYTIC_FIELDS: [keyof Knobs, string][] = [
  ["enableSDE1", "SDE1 (Second Digit Exclusion)"],
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
  enableOGA: false,
  enableGPWF: true,
  enableEntropy: true,
  enableHamming: true,
  enableJaccard: true,
  F: 0.4,
  M: 0.3,
  Q: 0.2,
  Y: 0.1,
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
      setHistory(ordered.slice(-45));
      setHighlights([]); // clear highlights when history changes
      setTrace((t) => [
        ...t,
        `[TRACE] Got ${validDraws.length} valid draws. Using newest 45.`,
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
  setHighlights([]); // clear highlights when history changes (stub)
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

function scoreSet(
  candidate: CandidateSet,
  knobs: Knobs,
  history: Draw[]
): { score: number; detail: string[] } {
  let gpwf = 0,
    ent = 0,
    minHam = 0,
    maxJac = 0,
    fp = "";
  const detail: string[] = [];

  if (knobs.enableGPWF) {
    gpwf = gpwfScore(candidate, history, knobs);
    detail.push(`GPWF:${gpwf.toFixed(3)}`);
  }
  if (knobs.enableEntropy) {
    ent = entropy(candidate);
    detail.push(`Entropy:${ent.toFixed(2)}`);
  }
  if (knobs.enableHamming) {
    minHam = minHamming(candidate, history);
    detail.push(`MinHamming:${minHam}`);
  }
  if (knobs.enableJaccard) {
    maxJac = maxJaccard(candidate, history);
    detail.push(`MaxJaccard:${maxJac.toFixed(2)}`);
  }
  fp = fingerprint(candidate);
  detail.push(`Fingerprint:${fp}`);

  const score =
    (knobs.enableGPWF ? 0.3 * (1 - gpwf) : 0) +
    (knobs.enableEntropy ? 0.25 * (ent / 3) : 0) +
    (knobs.enableHamming ? 0.25 * (minHam / NUM_MAINS) : 0) +
    (knobs.enableJaccard ? 0.2 * (1 - maxJac) : 0);

  return { score: Number(score.toFixed(3)), detail };
}

function candidateMatchesAnyRatio(
  candidate: CandidateSet,
  selectedRatios: string[]
): boolean {
  const nums = [...candidate.main, ...candidate.supp];
  const candRatio = getOddEvenRatio(nums);
  return selectedRatios.includes(candRatio);
}

function generateCandidates(
  num: number,
  history: Draw[],
  knobs: Knobs,
  traceSetter: React.Dispatch<React.SetStateAction<string[]>>,
  excludedNumbers: number[],
  selectedRatios: string[],
  useTrickyRule: boolean,
  minOGAPercentile: number,
  pastOGAScores: number[]
): CandidateSet[] {
  let candidates: CandidateSet[] = [];
  let attempts = 0;
  let rejectedTraces: string[] = [];

  // --- HC3: Exclude numbers matched in the last two draws ---
  let hc3Numbers: number[] = [];
  if (history.length >= 2) {
    const lastDraw = history[history.length - 1];
    const prevDraw = history[history.length - 2];
    const lastAll = [...lastDraw.main, ...lastDraw.supp];
    const prevAll = [...prevDraw.main, ...prevDraw.supp];
    hc3Numbers = lastAll.filter((n) => prevAll.includes(n));
  }
  const fullExcludedNumbers = [
    ...excludedNumbers,
    ...hc3Numbers.filter((n) => !excludedNumbers.includes(n)),
  ];

  // Exclude numbers from mainPool
  let mainPool: number[] = Array.from(
    { length: 45 },
    (_: unknown, i: number) => i + 1
  ).filter((n) => !fullExcludedNumbers.includes(n));
  let sde1Trace = "No SDE1 exclusion";
  if (knobs.enableSDE1) {
    const { pool, trace } = getSDE1FilteredPool(history);
    mainPool = pool.filter((n) => !fullExcludedNumbers.includes(n));
    sde1Trace = trace;
  }

  // Always append excluded numbers used for this generation
  if (excludedNumbers.length > 0) {
    sde1Trace += ` | Excluded numbers: [${excludedNumbers.join(", ")}]`;
  }
  if (hc3Numbers.length > 0) {
    sde1Trace += ` | HC3 excluded (repeat in last two draws): [${hc3Numbers.join(
      ", "
    )}]`;
  }
  traceSetter((t) => [...t, sde1Trace]);

  while (candidates.length < num && attempts < num * 50) {
    const main = getUniqueRandomNumbers(
      NUM_MAINS,
      MAIN_MIN,
      MAIN_MAX,
      fullExcludedNumbers,
      mainPool
    );
    if (main.length < NUM_MAINS) break;
    const supp = getUniqueRandomNumbers(2, MAIN_MIN, MAIN_MAX, [
      ...main,
      ...fullExcludedNumbers,
    ]);
    const set: CandidateSet = { main, supp };

    // --- Ratio/TrickyRule filtering logic here ---
    let ratioValid = false;
    let trickyValid = false;
    let trickyReasons: string[] = [];

    if (selectedRatios.length > 0) {
      ratioValid = candidateMatchesAnyRatio(set, selectedRatios);
      if (!ratioValid) {
        attempts++;
        rejectedTraces.push(
          `Attempt ${attempts}: {${main.join(",")}} | Supp: {${supp.join(
            ","
          )}} | REJECTED (Odd/Even Ratio)`
        );
        continue;
      }
    } else if (useTrickyRule) {
      const trickyResult = validateTrickyRule([...main, ...supp]);
      trickyValid = trickyResult.valid;
      trickyReasons = trickyResult.reasons;
      if (!trickyValid) {
        attempts++;
        rejectedTraces.push(
          `Attempt ${attempts}: {${main.join(",")}} | Supp: {${supp.join(
            ","
          )}} | REJECTED (TrickyRule) | Trace: ${trickyReasons.join("; ")}`
        );
        continue;
      }
    }
    // If neither is selected, allow all candidates

    const checkResult = checkHardConstraints(set, history, {
      exactSetOverride: knobs.exact_set_override,
      sdeEnabled: false,
    });

    const traceLine =
      `Attempt ${attempts + 1}: {${main.join(",")}} | Supp: {${supp.join(
        ","
      )}} | ` +
      (checkResult.valid ? "ACCEPTED" : "REJECTED") +
      ` | Trace: ${checkResult.reasons.join("; ")}`;
    rejectedTraces.push(traceLine);

    if (!checkResult.valid) {
      attempts++;
      continue;
    }

    if (
      history.some(
        (h) =>
          h.main.join() === set.main.join() && h.supp.join() === set.supp.join()
      )
    ) {
      set.trace = (set.trace || []).concat(["Duplicate of past draw"]);
      attempts++;
      continue;
    }

    const { score, detail } = scoreSet(set, knobs, history);

    // --- OGA calculation and percentile ---
    const nums = [...set.main, ...set.supp];
    const ogaScore = computeOGA(nums);
    const ogaPercentile = getOGAPercentile(ogaScore, pastOGAScores);
    set.ogaScore = ogaScore;
    set.ogaPercentile = ogaPercentile;

    // OGA-based filtering
    if (ogaPercentile < minOGAPercentile) {
      attempts++;
      rejectedTraces.push(
        `Attempt ${attempts}: {${main.join(",")}} | Supp: {${supp.join(
          ","
        )}} | REJECTED (OGA Percentile < ${minOGAPercentile})`
      );
      continue;
    }

    set.score = score;
    set.trace = (set.trace || []).concat(checkResult.reasons, detail);
    candidates.push(set);
    attempts++;
  }
  traceSetter((t) => [
    ...t,
    `[TRACE] Generated ${candidates.length} valid candidates after ${attempts} attempts.`,
    ...rejectedTraces.slice(0, 25),
  ]);
  return knobs.enableOGA
    ? applyOctagonalPostProcess(candidates, history, knobs.octagonal_top)
    : candidates;
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

const KNOB_FIELDS: [keyof Knobs, string, number | boolean, number?, number?][] =
  [
    ["F", "F", 0.4, 0.1, 1.0],
    ["M", "M", 0.3, 0.1, 1.0],
    ["Q", "Q", 0.2, 0.05, 1.0],
    ["Y", "Y", 0.1, 0.01, 1.0],
    ["Historical_Weight", "Hist. Weight", 0.05, 0.01, 1.0],
    ["gpwf_window_size", "GPWF Window", 27, 5, 50],
    ["gpwf_bias_factor", "GPWF Bias", 0.05, 0.0, 0.2],
    ["gpwf_floor", "GPWF Floor", 0.5, 0.2, 0.8],
    ["gpwf_scale_multiplier", "GPWF Scale", 0.7, 0.5, 1.0],
    ["lambda", "λ", 0.85, 0.7, 0.95],
    ["octagonal_top", "OGA Top", 9, 1, 20],
    ["exact_set_override", "Exact Set Override", false],
    ["hamming_relax", "Hamming Relax", false],
    ["gpwf_targeted_mode", "GPWF Targeted", false],
  ];

const MAX_DGA_DRAWS = 45;

// --- Nivo OGA Histogram ---
function OGAHistogram({
  ogaScores,
  candidateOGA,
  candidatePercentile,
}: {
  ogaScores: number[];
  candidateOGA?: number;
  candidatePercentile?: number;
}) {
  if (!ogaScores.length) return null;

  // Bin data
  const min = Math.min(...ogaScores);
  const max = Math.max(...ogaScores);
  const binCount = 10;
  const binWidth = (max - min) / binCount || 1;
  const bins = Array(binCount).fill(0);
  ogaScores.forEach((score) => {
    const idx = Math.min(binCount - 1, Math.floor((score - min) / binWidth));
    bins[idx]++;
  });
  // Find hot zone
  const maxCount = Math.max(...bins);
  const hotZones = bins
    .map((count, i) => (count === maxCount ? i : -1))
    .filter((i) => i !== -1);

  // Candidate bin
  let candidateBin = undefined;
  if (candidateOGA !== undefined) {
    candidateBin = Math.min(
      binCount - 1,
      Math.floor((candidateOGA - min) / binWidth)
    );
  }

  // Prepare data for Nivo (no booleans!)
  const data = bins.map((count, i) => {
    const rangeStart = min + binWidth * i;
    const rangeEnd = min + binWidth * (i + 1);
    return {
      bin: `${rangeStart.toFixed(1)}-${rangeEnd.toFixed(1)}`,
      count,
      isHot: hotZones.includes(i) ? 1 : 0,
      isCandidate: candidateBin === i ? 1 : 0,
    };
  });

  return (
    <div style={{ height: 180 }}>
      <b>OGA Score Distribution (History)</b>
      <ResponsiveBar
        data={data}
        keys={["count"]}
        indexBy="bin"
        margin={{ top: 30, right: 30, bottom: 40, left: 40 }}
        padding={0.3}
        colors={({ data }) =>
          data.isCandidate ? "#d32f2f" : data.isHot ? "#ffd600" : "#90caf9"
        }
        borderColor={{ from: "color", modifiers: [["darker", 1.6]] }}
        enableLabel={false}
        axisBottom={{
          tickSize: 3,
          tickPadding: 6,
          tickRotation: 0,
          legend: "OGA Range",
          legendPosition: "middle",
          legendOffset: 28,
        }}
        axisLeft={{
          tickSize: 3,
          tickPadding: 5,
          legend: "Draws",
          legendPosition: "middle",
          legendOffset: -32,
        }}
        tooltip={({ data }) => (
          <div
            style={{
              padding: 8,
              background: "#fff",
              border: "1px solid #ccc",
              color: "#222",
              fontSize: 13,
            }}
          >
            <div>
              <b>OGA {data.bin}</b>
            </div>
            <div>Draws: {data.count}</div>
            {!!data.isHot && <div style={{ color: "#b29f00" }}>Hot zone</div>}
            {!!data.isCandidate && (
              <div style={{ color: "#d32f2f" }}>Your set</div>
            )}
          </div>
        )}
        theme={{
          axis: {
            ticks: {
              text: { fontSize: 12, fill: "#555" },
            },
            legend: { text: { fontSize: 13, fontWeight: "bold" } },
          },
        }}
      />
      <div style={{ marginTop: 10 }}>
        {candidateOGA !== undefined && (
          <div>
            <b>Your Candidate OGA:</b>{" "}
            <span style={{ color: "#d32f2f" }}>{candidateOGA.toFixed(2)}</span>{" "}
            {candidatePercentile !== undefined && (
              <span>
                (<b>{candidatePercentile.toFixed(1)}%</b> percentile)
                {candidatePercentile > 80 ? (
                  <span style={{ color: "green", marginLeft: 6 }}>
                    Typical for winners
                  </span>
                ) : candidatePercentile < 20 ? (
                  <span style={{ color: "red", marginLeft: 6 }}>
                    Atypical for winners
                  </span>
                ) : (
                  <span style={{ color: "#888", marginLeft: 6 }}>
                    Within normal range
                  </span>
                )}
              </span>
            )}
          </div>
        )}
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          <span
            style={{
              background: "#ffd600",
              color: "#222",
              padding: "0 4px",
              borderRadius: 3,
            }}
          >
            Hot zone
          </span>{" "}
          = most common OGA range among past winners.
          <span style={{ color: "#d32f2f", marginLeft: 8 }}>
            Your set highlighted in red.
          </span>
        </div>
      </div>
    </div>
  );
}

const App: React.FC = () => {
  const [history, setHistory] = useState<Draw[]>([]);
  const [knobs, setKnobs] = useState<Knobs>(defaultKnobs);
  const [candidates, setCandidates] = useState<CandidateSet[]>([]);
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

  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState<number>(0);
  const [highlightMsg, setHighlightMsg] = useState<string>("");

  const [highlights, setHighlights] = useState<HighlightShape[]>([]);
  const [excludedNumbers, setExcludedNumbers] = useState<number[]>([]);

  // --- Odd/Even Ratio UI State ---
  const [ratioOptions, setRatioOptions] = useState<
    { ratio: string; count: number; percent: number }[]
  >([]);
  const [selectedRatios, setSelectedRatios] = useState<string[]>([]);
  const [useTrickyRule, setUseTrickyRule] = useState<boolean>(false);

  // --- OGA percentile filter ---
  const [minOGAPercentile, setMinOGAPercentile] = useState<number>(0);

  // --- OGA history scores (memoized) ---
  const pastOGAScores = useMemo(() => {
    return history.map((draw) => computeOGA([...draw.main, ...draw.supp]));
  }, [history]);

  // Find current candidate OGA and percentile for histogram
  const currentCandidate = candidates[selectedCandidateIdx];
  const currentOGA = currentCandidate?.ogaScore;
  const currentOGAPercentile = currentCandidate?.ogaPercentile;

  useEffect(() => {
    setRatioOptions(computeOddEvenRatios(history));
    setSelectedRatios((ratios) =>
      ratios.filter((r) => ratioOptions.some((opt) => opt.ratio === r))
    );
    // eslint-disable-next-line
  }, [history]);

  useEffect(() => {
    fetchDraws(setHistory, setTrace, setHighlights);
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const recentHistory = history.slice(-MAX_DGA_DRAWS);
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

    // --- Heatmap counts ---
    const counts: number[] = Array(45).fill(0);
    recentHistory.forEach((draw) => {
      draw.main.forEach((n) => (n >= 1 && n <= 45 ? counts[n - 1]++ : null));
      draw.supp.forEach((n) => (n >= 1 && n <= 45 ? counts[n - 1]++ : null));
    });
    setNumberCounts(counts);
    setMinCount(Math.min(...counts));
    setMaxCount(Math.max(...counts));
    setHighlightMsg("");
  }, [history, simulatedDraw]);

  const handleKnobChange = (k: keyof Knobs, v: any) => {
    setKnobs((prev: Knobs) => ({
      ...prev,
      [k]: typeof v === "boolean" ? v : Number(v),
    }));
  };

  const handleGenerate = () => {
    setTrace([]);
    let newCandidates = generateCandidates(
      numCandidates,
      history,
      knobs,
      setTrace,
      excludedNumbers,
      selectedRatios,
      useTrickyRule,
      minOGAPercentile,
      pastOGAScores
    );
    setCandidates(newCandidates);
    setSelectedCandidateIdx(0);
    setTrace((t) => [...t, traceFormat(history, knobs, newCandidates)]);
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
          setHistory(ordered.slice(-45));
          setHighlights([]); // clear highlights on import
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
    setHighlights([]); // clear highlights on new simulation history
  };

  const handleResetSimulatedDraw = () => setSimulatedDraw(null);

  // --- Ratio/TrickyRule UI logic ---
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

  return (
    <div style={{ fontFamily: "monospace", padding: 20, maxWidth: 1700 }}>
      <h2>
        🇦🇺 Weekday Windfall – Maximum Validated Set Generator{" "}
        <span style={{ fontSize: 16, color: "#666" }}>TypeScript Demo</span>
      </h2>
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
      {/* --------- Odd/Even Ratio & Tricky Rule Section --------- */}
      <details open>
        <summary>
          <b>Odd/Even Ratio Filters</b>
          <span style={{ fontWeight: 400, fontSize: 13, marginLeft: 10 }}>
            (Select one or more ratios, or use Tricky Rule)
          </span>
        </summary>
        <div style={{ marginBottom: 8 }}>
          <label
            style={{
              fontWeight: "bold",
              display: "inline-block",
              marginRight: 16,
            }}
          >
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
          Applies to total (all 8 numbers in a draw). Only ratios seen in
          history are available.
        </div>
      </details>
      {/* --------- End Odd/Even Ratio & Tricky Rule Section --------- */}
      <details>
        <summary>
          <b>Analytics Filters</b>
        </summary>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          {ANALYTIC_FIELDS.map(([k, label]) => (
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
      {/* --------- Exclude Numbers Section --------- */}
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
                      checked ? prev.filter((num) => num !== n) : [...prev, n]
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
      {/* --------- End Exclude Numbers Section --------- */}
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
      {/* -------- OGA percentile filter UI -------- */}
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
        {/* Nivo Histogram with candidate highlight */}
        <OGAHistogram
          ogaScores={pastOGAScores}
          candidateOGA={currentOGA}
          candidatePercentile={currentOGAPercentile}
        />
      </details>
      {/* -------- END OGA percentile filter UI ------- */}
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
      <details open>
        <summary>
          <b>Generated Candidates</b>
        </summary>
        {candidates.length === 0 ? (
          <i>No candidates generated yet.</i>
        ) : (
          <table
            style={{
              borderCollapse: "collapse",
              fontSize: 15,
              marginTop: 8,
              minWidth: 650,
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
              </tr>
            </thead>
            <tbody>
              {candidates.map((c, i) => {
                const { entropy, hamming, jaccard } = extractAnalytics(c.trace);
                const oddEven = getOddEvenRatio([...c.main, ...c.supp]);
                return (
                  <tr key={i}>
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
                      {c.ogaScore !== undefined ? c.ogaScore.toFixed(2) : ""}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {c.ogaPercentile !== undefined
                        ? c.ogaPercentile.toFixed(1)
                        : ""}
                    </td>
                    <td style={{ textAlign: "right" }}>{oddEven}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </details>
      <div style={{ margin: "22px 0" }}>
        {candidates.length > 1 && (
          <span style={{ marginRight: 12 }}>
            Simulate using candidate:{" "}
            <select
              value={selectedCandidateIdx}
              onChange={(e) => setSelectedCandidateIdx(Number(e.target.value))}
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
            <button onClick={handleResetSimulatedDraw}>Reset Simulation</button>
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
      <details open style={{ marginTop: 18 }}>
        <summary>
          <b>Diamond Grid Analysis (DGA) – White Diamond Visualization</b>
        </summary>
        {highlightMsg && (
          <div style={{ color: "#c00", marginBottom: 12 }}>{highlightMsg}</div>
        )}
        {dgaGrid.length > 0 ? (
          <DGAVisualizer
            grid={dgaGrid}
            diamonds={dgaDiamonds}
            predictions={dgaPredictions}
            drawLabels={dgaDrawLabels}
            numberLabels={Array.from({ length: 45 }, (_: unknown, i: number) =>
              String(i + 1)
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
      <details style={{ marginTop: 14 }} open>
        <summary>
          <b>Trace Log</b>
        </summary>
        <pre style={{ background: "#fafafa", padding: 10, fontSize: 13 }}>
          {trace.join("\n")}
        </pre>
      </details>
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

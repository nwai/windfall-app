import type { Draw } from "../types";
import type { AppPresetSnapshot } from "./presets";

export const PREDICTION_JOURNAL_STORAGE_KEY = "windfall:prediction-journal:v1";

export type PredictionTargetKind = "nextDraw" | "next3Draws" | "restOfMonth";

export type PredictionBucketKey =
  | "undrawn"
  | "times1"
  | "times2"
  | "times3"
  | "times4"
  | "times5"
  | "times6"
  | "times7"
  | "times8";

export type PredictionScoreResult = "hit" | "partial" | "miss" | "recorded";
export type PredictionJournalStatus = "pending" | "locked" | "scored" | "void";
export type PredictionJournalReviewStatus = "notReviewed" | "reviewedByUser";

export interface PredictionBucketCounts extends Partial<Record<PredictionBucketKey, number>> {}

export interface PredictionJournalInputs {
  oddEvenRatio?: string;
  numbers?: number[];
  monthlyBuckets?: PredictionBucketCounts;
  lowMidHigh?: { low?: number; mid?: number; high?: number };
  singleDouble?: { single?: number; double?: number };
  sumRange?: { min?: number; max?: number };
  terminalDigits?: number[];
  trendRatio?: string;
  previousRepeatCount?: number;
  previousNeighbourHitCount?: number;
  droughtBreakCount?: number;
  carryOverCount?: number;
  ogaRange?: { min?: number; max?: number };
  confidence?: number;
  notes?: string;
}

export interface PredictionJournalSetupSummary {
  window: string;
  oddEvenRatios: string;
  generation: string[];
  filters: string[];
  selections: string[];
}

export type PredictionJournalDroughtBreakCategory =
  | "strict-drought"
  | "empirical-hazard"
  | "strict-and-empirical"
  | "outside-shortlist";

export interface PredictionJournalDroughtBreakNumberEvidence {
  number: number;
  category: PredictionJournalDroughtBreakCategory;
  label: string;
  strictDrought: boolean;
  empiricalHazard: boolean;
}

export interface PredictionJournalDroughtBreakProvenance {
  scope: "mains+supps";
  strictThreshold: number;
  shortlistTop: number;
  strictDroughtShortlistNumbers: number[];
  empiricalHazardShortlistNumbers: number[];
  selectedNumbers: number[];
  selectedAnyShortlistNumbers: number[];
  selectedOutsideShortlistNumbers: number[];
  selectedStrictDroughtNumbers: number[];
  selectedEmpiricalHazardNumbers: number[];
  selectedBothNumbers: number[];
  anySelectedFromShortlist: boolean;
  allSelectedFromShortlist: boolean;
  classifications: PredictionJournalDroughtBreakNumberEvidence[];
}

export interface PredictionJournalProvenance {
  version: 1;
  selectedNumbers: number[];
  inclusionSources: {
    userSelected: number[];
    trend: number[];
    latestNeighbourTargets: number[];
    hotCold: number[];
    droughtBreakForced: number[];
    pasteWeightedMissing: number[];
    carryOverBoosted: number[];
    effectiveGenerationForced: number[];
  };
  exclusionSources: {
    user: number[];
    hotCold: number[];
    autoUnselected: number[];
    mainBucketAuto: number[];
    sde1: number[];
    hc3: number[];
    effectiveGeneration: number[];
  };
  droughtBreakShortlist: PredictionJournalDroughtBreakProvenance;
}

export interface PredictionJournalEntry {
  id: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  anchorLatestDrawDate: string;
  anchorDrawFingerprint: string;
  targetKind: PredictionTargetKind;
  reviewStatus?: PredictionJournalReviewStatus;
  reviewedAt?: string;
  archivedAt?: string;
  inputs: PredictionJournalInputs;
  setupSnapshot?: AppPresetSnapshot;
  setupSummary?: PredictionJournalSetupSummary;
  provenance?: PredictionJournalProvenance;
}

export interface BuildPredictionJournalEntryOptions {
  id?: string;
  now?: string;
  latestDraw: Draw;
  targetKind: PredictionTargetKind;
  inputs: PredictionJournalInputs;
  setupSnapshot?: AppPresetSnapshot | null;
  reviewStatus?: PredictionJournalReviewStatus;
  previousEntry?: PredictionJournalEntry;
}

export interface PredictionJournalComputedStatus {
  status: PredictionJournalStatus;
  canEdit: boolean;
  targetDraws: Draw[];
  reason?: string;
}

export interface PredictionScore {
  key: string;
  label: string;
  predicted: string;
  actual: string;
  result: PredictionScoreResult;
  detail?: string;
  hitCount?: number;
  predictedCount?: number;
  actualCount?: number;
  error?: number;
}

export interface ScoredPredictionJournalEntry extends PredictionJournalEntry {
  status: PredictionJournalStatus;
  canEdit: boolean;
  targetDraws: Draw[];
  scores: PredictionScore[];
  reason?: string;
}

export interface PredictionJournalDraft {
  targetKind: PredictionTargetKind;
  inputs: PredictionJournalInputs;
  sourceSummary: string[];
}

interface OrderedDraw {
  draw: Draw;
  time: number;
  index: number;
  fingerprint: string;
  monthKey: string;
}

const BUCKET_KEYS: PredictionBucketKey[] = [
  "undrawn",
  "times1",
  "times2",
  "times3",
  "times4",
  "times5",
  "times6",
  "times7",
  "times8",
];

const BUCKET_LABELS: Record<PredictionBucketKey, string> = {
  undrawn: "Undrawn",
  times1: "1x",
  times2: "2x",
  times3: "3x",
  times4: "4x",
  times5: "5x",
  times6: "6x",
  times7: "7x",
  times8: "8x+",
};

const TARGET_COMPLETE_COUNTS: Record<PredictionTargetKind, number> = {
  nextDraw: 1,
  next3Draws: 3,
  restOfMonth: Number.POSITIVE_INFINITY,
};

const normalizeInteger = (value: unknown): number | undefined => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.round(parsed));
};

const normalizeNumberList = (values: unknown, min: number, max: number): number[] | undefined => {
  if (!Array.isArray(values)) return undefined;
  const seen = new Set<number>();
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) continue;
    seen.add(parsed);
  }
  const output = [...seen].sort((a, b) => a - b);
  return output.length ? output : undefined;
};

const normalizeTerminalDigits = (values: unknown): number[] | undefined => {
  if (!Array.isArray(values)) return undefined;
  const seen = new Set<number>();
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) continue;
    if (parsed <= 9) seen.add(parsed);
    else if (parsed <= 45) seen.add(parsed % 10);
  }
  const output = [...seen].sort((a, b) => a - b);
  return output.length ? output : undefined;
};

const normalizeRatio = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^(\d+)\s*:\s*(\d+)$/);
  if (!match) return undefined;
  const odd = Number(match[1]);
  const even = Number(match[2]);
  if (!Number.isInteger(odd) || !Number.isInteger(even) || odd < 0 || even < 0 || odd + even <= 0) {
    return undefined;
  }
  return `${odd}:${even}`;
};

const normalizeBucketCounts = (input: unknown): PredictionBucketCounts | undefined => {
  if (!input || typeof input !== "object") return undefined;
  const output: PredictionBucketCounts = {};
  for (const key of BUCKET_KEYS) {
    const value = normalizeInteger((input as Record<string, unknown>)[key]);
    if (value !== undefined) output[key] = value;
  }
  return Object.keys(output).length ? output : undefined;
};

const normalizeCountObject = <T extends string>(input: unknown, keys: readonly T[]): Partial<Record<T, number>> | undefined => {
  if (!input || typeof input !== "object") return undefined;
  const output: Partial<Record<T, number>> = {};
  for (const key of keys) {
    const value = normalizeInteger((input as Record<string, unknown>)[key]);
    if (value !== undefined) output[key] = value;
  }
  return Object.keys(output).length ? output : undefined;
};

const normalizeRange = (input: unknown): { min?: number; max?: number } | undefined => {
  if (!input || typeof input !== "object") return undefined;
  const min = normalizeInteger((input as Record<string, unknown>).min);
  const max = normalizeInteger((input as Record<string, unknown>).max);
  if (min === undefined && max === undefined) return undefined;
  if (min !== undefined && max !== undefined && min > max) return { min: max, max: min };
  return { min, max };
};

const normalizeReviewStatus = (value: unknown): PredictionJournalReviewStatus => (
  value === "reviewedByUser" ? "reviewedByUser" : "notReviewed"
);

const cloneSetupSnapshot = (snapshot: AppPresetSnapshot | null | undefined): AppPresetSnapshot | undefined => {
  if (!snapshot) return undefined;
  try {
    return JSON.parse(JSON.stringify(snapshot)) as AppPresetSnapshot;
  } catch {
    return snapshot;
  }
};

const countList = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

const formatWindowSummary = (snapshot: Partial<AppPresetSnapshot> & Record<string, any>): string => {
  if (snapshot.windowEnabled === false) return "WFMQYH off";
  if (snapshot.drawWindowMode === "range") return `Range ${snapshot.rangeFrom ?? "-"}-${snapshot.rangeTo ?? "-"}`;
  if (snapshot.windowMode === "Custom") return `WFMQYH Custom ${snapshot.customDrawCount ?? "-"}`;
  if (snapshot.windowMode === "H") return "WFMQYH History";
  if (typeof snapshot.windowMode === "string" && snapshot.windowMode) return `WFMQYH ${snapshot.windowMode}`;
  return "WFMQYH unknown";
};

const formatSumFilter = (sumFilter: unknown): string | null => {
  if (!sumFilter || typeof sumFilter !== "object" || !(sumFilter as { enabled?: boolean }).enabled) return null;
  const filter = sumFilter as { min?: number; max?: number };
  return `Sum filter: ${filter.min ?? "-"}-${filter.max ?? "-"}`;
};

const setupBucketLabels: Array<[PredictionBucketKey, string]> = [
  ["undrawn", "0x"],
  ["times1", "1x"],
  ["times2", "2x"],
  ["times3", "3x"],
  ["times4", "4x"],
  ["times5", "5x"],
  ["times6", "6x"],
  ["times7", "7x"],
  ["times8", "8x+"],
];

const formatAcceptanceNeedsCounts = (counts: unknown): string => {
  if (!counts || typeof counts !== "object") return "none";
  const source = counts as Partial<Record<PredictionBucketKey, unknown>>;
  const parts = setupBucketLabels
    .map(([key, label]) => {
      const value = Number(source[key] ?? 0);
      return Number.isFinite(value) && value > 0 ? `${label}≥${Math.floor(value)}` : null;
    })
    .filter((value): value is string => value !== null);
  return parts.length ? parts.join(" · ") : "none";
};

const formatDraftNumbers = (numbers: number[]): string => (
  numbers.length ? numbers.join(", ") : "none"
);

const uniqueDraftNumbers = (...lists: Array<number[] | undefined>): number[] => {
  const seen = new Set<number>();
  const output: number[] = [];
  for (const list of lists) {
    for (const value of list ?? []) {
      if (!Number.isInteger(value) || value < 1 || value > 45 || seen.has(value)) continue;
      seen.add(value);
      output.push(value);
    }
  }
  return output;
};

const setupNumberList = (setup: Partial<AppPresetSnapshot> & Record<string, any>, key: string): number[] => (
  normalizeNumberList(setup[key], 1, 45) ?? []
);

const buildDroughtBreakLabel = (category: PredictionJournalDroughtBreakCategory, threshold: number): string => {
  if (category === "strict-and-empirical") return `Strict drought ${threshold}+ and empirical hazard`;
  if (category === "strict-drought") return `Strict drought ${threshold}+`;
  if (category === "empirical-hazard") return "Empirical hazard";
  return "Outside current drought-break shortlist";
};

export function buildPredictionJournalProvenance(
  inputs: PredictionJournalInputs,
  snapshot: AppPresetSnapshot | null | undefined,
): PredictionJournalProvenance {
  const setup = (snapshot ?? {}) as Partial<AppPresetSnapshot> & Record<string, any>;
  const selectedNumbers = normalizeNumberList(inputs.numbers, 1, 45) ?? [];
  const userSelected = setupNumberList(setup, "userSelectedNumbers");
  const trend = setupNumberList(setup, "trendSelectedNumbers");
  const latestNeighbourTargets = setupNumberList(setup, "previousNeighbourConstraintNumbers");
  const hotCold = setupNumberList(setup, "hotColdForcedNumbers");
  const droughtBreakForced = setupNumberList(setup, "droughtBreakSelectedNumbers");
  const pasteWeightedMissing = setupNumberList(setup, "pasteWeightedForcedNumbers");
  const carryOverBoosted = setupNumberList(setup, "selectedCarryOverBoostNumbers");
  const effectiveGenerationForced = setupNumberList(setup, "generationForcedNumbers");
  const userExcluded = setupNumberList(setup, "excludedNumbers");
  const hotColdExcluded = setupNumberList(setup, "hotColdExcludedNumbers");
  const autoUnselected = setupNumberList(setup, "autoExcludedFromSelection");
  const mainBucketAuto = setupNumberList(setup, "mainConstraintAutoExcludedNumbers");
  const sde1 = setupNumberList(setup, "sde1Exclusions");
  const hc3 = setupNumberList(setup, "hc3Exclusions");
  const effectiveGenerationExcluded = setupNumberList(setup, "allExcludedNumbers").length
    ? setupNumberList(setup, "allExcludedNumbers")
    : uniqueDraftNumbers(
      setupNumberList(setup, "generationExcludedNumbers"),
      sde1,
      hc3,
    );
  const strictThresholdRaw = Number(setup.droughtBreakStrictThreshold ?? 6);
  const strictThreshold = Number.isFinite(strictThresholdRaw) && strictThresholdRaw > 0
    ? Math.round(strictThresholdRaw)
    : 6;
  const shortlistTopRaw = Number(setup.droughtBreakShortlistTop ?? 8);
  const shortlistTop = Number.isFinite(shortlistTopRaw) && shortlistTopRaw > 0
    ? Math.round(shortlistTopRaw)
    : 8;
  const strictDroughtShortlistNumbers = setupNumberList(setup, "droughtBreakStrictShortlistNumbers");
  const empiricalHazardShortlistNumbers = setupNumberList(setup, "droughtBreakEmpiricalHazardNumbers");
  const strictSet = new Set(strictDroughtShortlistNumbers);
  const empiricalSet = new Set(empiricalHazardShortlistNumbers);

  const classifications = selectedNumbers.map((number) => {
    const strictDrought = strictSet.has(number);
    const empiricalHazard = empiricalSet.has(number);
    const category: PredictionJournalDroughtBreakCategory = strictDrought && empiricalHazard
      ? "strict-and-empirical"
      : strictDrought
        ? "strict-drought"
        : empiricalHazard
          ? "empirical-hazard"
          : "outside-shortlist";
    return {
      number,
      category,
      label: buildDroughtBreakLabel(category, strictThreshold),
      strictDrought,
      empiricalHazard,
    };
  });

  const selectedStrictDroughtNumbers = selectedNumbers.filter((number) => strictSet.has(number));
  const selectedEmpiricalHazardNumbers = selectedNumbers.filter((number) => empiricalSet.has(number));
  const selectedBothNumbers = selectedNumbers.filter((number) => strictSet.has(number) && empiricalSet.has(number));
  const selectedAnyShortlistNumbers = selectedNumbers.filter((number) => strictSet.has(number) || empiricalSet.has(number));
  const selectedOutsideShortlistNumbers = selectedNumbers.filter((number) => !strictSet.has(number) && !empiricalSet.has(number));

  return {
    version: 1,
    selectedNumbers,
    inclusionSources: {
      userSelected,
      trend,
      latestNeighbourTargets,
      hotCold,
      droughtBreakForced,
      pasteWeightedMissing,
      carryOverBoosted,
      effectiveGenerationForced: effectiveGenerationForced.length ? effectiveGenerationForced : uniqueDraftNumbers(trend, latestNeighbourTargets, hotCold, droughtBreakForced, pasteWeightedMissing, carryOverBoosted),
    },
    exclusionSources: {
      user: userExcluded,
      hotCold: hotColdExcluded,
      autoUnselected,
      mainBucketAuto,
      sde1,
      hc3,
      effectiveGeneration: effectiveGenerationExcluded,
    },
    droughtBreakShortlist: {
      scope: "mains+supps",
      strictThreshold,
      shortlistTop,
      strictDroughtShortlistNumbers,
      empiricalHazardShortlistNumbers,
      selectedNumbers,
      selectedAnyShortlistNumbers,
      selectedOutsideShortlistNumbers,
      selectedStrictDroughtNumbers,
      selectedEmpiricalHazardNumbers,
      selectedBothNumbers,
      anySelectedFromShortlist: selectedAnyShortlistNumbers.length > 0,
      allSelectedFromShortlist: selectedNumbers.length > 0 && selectedOutsideShortlistNumbers.length === 0,
      classifications,
    },
  };
}

const formatDroughtBreakProvenanceNote = (provenance: PredictionJournalDroughtBreakProvenance): string => {
  if (provenance.selectedNumbers.length === 0) {
    return "Drought-break shortlist check: no prediction numbers selected.";
  }
  return [
    `Drought-break shortlist check: matched ${formatDraftNumbers(provenance.selectedAnyShortlistNumbers)}`,
    `all selected from shortlist: ${provenance.allSelectedFromShortlist ? "yes" : "no"}`,
    `Strict drought ${provenance.strictThreshold}+: ${formatDraftNumbers(provenance.selectedStrictDroughtNumbers)}`,
    `Empirical hazard: ${formatDraftNumbers(provenance.selectedEmpiricalHazardNumbers)}`,
    `outside shortlist: ${formatDraftNumbers(provenance.selectedOutsideShortlistNumbers)}`,
  ].join("; ") + ".";
};

const positiveBucketCounts = (counts: PredictionBucketCounts | undefined): PredictionBucketCounts | undefined => {
  if (!counts) return undefined;
  const output: PredictionBucketCounts = {};
  for (const key of BUCKET_KEYS) {
    const value = normalizeInteger(counts[key]);
    if (value !== undefined && value > 0) output[key] = value;
  }
  return Object.keys(output).length ? output : undefined;
};

const sumBucketCounts = (counts: PredictionBucketCounts | undefined): number => (
  BUCKET_KEYS.reduce((sum, key) => sum + (normalizeInteger(counts?.[key]) ?? 0), 0)
);

const formatBucketDraft = (counts: PredictionBucketCounts | undefined): string => (
  counts ? formatBucketCounts(counts) : "none"
);

export function buildPredictionJournalDraftFromSetup(snapshot: AppPresetSnapshot | null | undefined): PredictionJournalDraft {
  if (!snapshot) {
    const notes = [
      "New prediction draft started without an app setup snapshot.",
      "Review the current app setup manually before saving.",
    ];
    return {
      targetKind: "nextDraw",
      inputs: { notes: notes.join("\n") },
      sourceSummary: notes,
    };
  }

  const setup = snapshot as Partial<AppPresetSnapshot> & Record<string, any>;
  const knobs = (setup.knobs && typeof setup.knobs === "object" ? setup.knobs : {}) as Record<string, unknown>;
  const userSelected = normalizeNumberList(setup.userSelectedNumbers, 1, 45) ?? [];
  const trendForced = normalizeNumberList(setup.trendSelectedNumbers, 1, 45) ?? [];
  const latestNeighbourForced = normalizeNumberList(setup.previousNeighbourConstraintNumbers, 1, 45) ?? [];
  const hotColdForced = normalizeNumberList(setup.hotColdForcedNumbers, 1, 45) ?? [];
  const droughtForced = normalizeNumberList(setup.droughtBreakSelectedNumbers, 1, 45) ?? [];
  const pasteWeightedForced = normalizeNumberList(setup.pasteWeightedForcedNumbers, 1, 45) ?? [];
  const carryOverBoosted = normalizeNumberList(setup.selectedCarryOverBoostNumbers, 1, 45) ?? [];
  const userExcluded = normalizeNumberList(setup.excludedNumbers, 1, 45) ?? [];
  const hotColdExcluded = normalizeNumberList(setup.hotColdExcludedNumbers, 1, 45) ?? [];
  const autoSelectionExcluded = normalizeNumberList(setup.autoExcludedFromSelection, 1, 45) ?? [];
  const bucketAutoExcluded = normalizeNumberList(setup.mainConstraintAutoExcludedNumbers, 1, 45) ?? [];
  const effectiveExcluded = normalizeNumberList(setup.effectiveExcludedNumbers, 1, 45) ?? uniqueDraftNumbers(userExcluded, hotColdExcluded, autoSelectionExcluded);
  const generationExcluded = normalizeNumberList(setup.generationExcludedNumbers, 1, 45) ?? uniqueDraftNumbers(effectiveExcluded, bucketAutoExcluded);
  const sde1Excluded = normalizeNumberList(setup.sde1Exclusions, 1, 45) ?? [];
  const hc3Excluded = normalizeNumberList(setup.hc3Exclusions, 1, 45) ?? [];
  const allExcluded = normalizeNumberList(setup.allExcludedNumbers, 1, 45) ?? uniqueDraftNumbers(generationExcluded, sde1Excluded, hc3Excluded);
  const forcedUnion = uniqueDraftNumbers(trendForced, latestNeighbourForced, hotColdForced, droughtForced, pasteWeightedForced, carryOverBoosted);
  const effectiveForced = normalizeNumberList(setup.generationForcedNumbers, 1, 45) ?? forcedUnion;
  const candidateNumbers = uniqueDraftNumbers(userSelected, forcedUnion);
  const copiedNumbers = candidateNumbers.slice(0, 8);
  const selectedRatios = Array.isArray(setup.selectedRatios)
    ? setup.selectedRatios.filter((ratio): ratio is string => typeof ratio === "string" && /^\d+\s*:\s*\d+$/.test(ratio))
    : [];
  const monthlyBuckets = positiveBucketCounts(normalizeBucketCounts(setup.acceptanceNeedsCounts));
  const monthlyBucketTotal = sumBucketCounts(monthlyBuckets);
  const inputs: PredictionJournalInputs = {};
  const notes: string[] = [
    "New prediction draft created from the current app setup.",
    `WFMQYH setup: ${formatWindowSummary(setup)}.`,
  ];

  if (selectedRatios.length === 1) {
    inputs.oddEvenRatio = selectedRatios[0];
    notes.push(`Odd/even ratio copied: ${selectedRatios[0]}.`);
  } else if (selectedRatios.length > 1) {
    notes.push(`Multiple odd/even ratios selected; review manually: ${selectedRatios.join(", ")}.`);
  } else if (copiedNumbers.length === 8) {
    const oddEven = countOddEven(copiedNumbers);
    inputs.oddEvenRatio = `${oddEven.odd}:${oddEven.even}`;
    notes.push(`Odd/even ratio inferred from the copied 8 numbers: ${inputs.oddEvenRatio}.`);
  }

  if (setup.useTrickyRule) notes.push("Tricky Rule is ON; selected odd/even ratios may be overridden in generation.");

  if (copiedNumbers.length > 0) {
    inputs.numbers = copiedNumbers;
    notes.push(`Numbers copied into the prediction field: ${formatDraftNumbers(copiedNumbers)}.`);
    if (candidateNumbers.length > copiedNumbers.length) {
      notes.push(`Additional selected/forced numbers kept in this note only: ${formatDraftNumbers(candidateNumbers.slice(copiedNumbers.length))}.`);
    }
  }

  if ((setup.monthlyConstructiveEnabled || setup.acceptanceNeedsEnabled) && monthlyBuckets) {
    if (monthlyBucketTotal <= 8) {
      inputs.monthlyBuckets = monthlyBuckets;
      notes.push(`Acceptance-needs counts copied as a target draw bucket-origin draft: ${formatBucketDraft(monthlyBuckets)}.`);
    } else {
      notes.push(`Acceptance-needs counts were not copied into bucket-origin fields because they total ${monthlyBucketTotal}, which is above the 8-ball next-draw limit: ${formatBucketDraft(monthlyBuckets)}.`);
    }
  }

  notes.push(`SDE1: ${knobs.enableSDE1 ? `ON; exclusions ${formatDraftNumbers(sde1Excluded)}` : "OFF"}.`);
  notes.push(`HC3: ${knobs.enableHC3 ? `ON; exclusions ${formatDraftNumbers(hc3Excluded)}` : "OFF"}.`);
  notes.push(`User selected numbers: ${formatDraftNumbers(userSelected)}.`);
  notes.push(`Forced/boosted inclusion sources: trend ${formatDraftNumbers(trendForced)}; latest +/- targets ${formatDraftNumbers(latestNeighbourForced)}; hot/cold ${formatDraftNumbers(hotColdForced)}; drought-break ${formatDraftNumbers(droughtForced)}; paste-weighted missing ${formatDraftNumbers(pasteWeightedForced)}; carry-over boosted ${formatDraftNumbers(carryOverBoosted)}.`);
  notes.push(`Effective generation forced numbers: ${formatDraftNumbers(effectiveForced)}.`);
  notes.push(`Exclusion sources: user ${formatDraftNumbers(userExcluded)}; hot/cold ${formatDraftNumbers(hotColdExcluded)}; auto-unselected ${formatDraftNumbers(autoSelectionExcluded)}; main-bucket auto ${formatDraftNumbers(bucketAutoExcluded)}; SDE1 ${formatDraftNumbers(sde1Excluded)}; HC3 ${formatDraftNumbers(hc3Excluded)}.`);
  notes.push(`Effective generation exclusions: ${formatDraftNumbers(allExcluded)}.`);
  notes.push(formatDroughtBreakProvenanceNote(buildPredictionJournalProvenance(inputs, snapshot).droughtBreakShortlist));
  notes.push(`Scoring influence: ${setup.scoringGenerationInfluence ?? "off"}; selected-number boost: ${setup.selectedBoostEnabled ? `ON x${setup.selectedBoostFactor ?? "-"}` : "OFF"}.`);
  notes.push("Review this draft before saving; copied values are starting points, not predictions made by Windfall.");

  inputs.notes = notes.join("\n");

  return {
    targetKind: "nextDraw",
    inputs: normalizePredictionJournalInputs(inputs),
    sourceSummary: notes,
  };
}

export function summarizePredictionJournalSetup(snapshot: AppPresetSnapshot | null | undefined): PredictionJournalSetupSummary | undefined {
  if (!snapshot) return undefined;
  const setup = snapshot as Partial<AppPresetSnapshot> & Record<string, any>;
  const knobs = (setup.knobs && typeof setup.knobs === "object" ? setup.knobs : {}) as Record<string, unknown>;
  const generation: string[] = [
    `Scoring influence: ${setup.scoringGenerationInfluence ?? "off"}`,
    `Latest +/-1 support: ${setup.latestNeighbourSupportEnabled ? "on" : "off"}`,
    `Month-end carry-over: ${setup.monthEndCarryOverBiasEnabled ? (setup.monthEndCarryOverStrength ?? "normal") : "off"}`,
    `Use counts when constructing candidates: ${setup.monthlyConstructiveEnabled ? "on" : "off"}`,
    `Acceptance needs counts: ${formatAcceptanceNeedsCounts(setup.acceptanceNeedsCounts)}`,
    `Extra MiAN post-filter: ${setup.acceptanceNeedsEnabled ? (setup.acceptanceNeedsHardExclude ? "hard exclude" : "on") : "off"}`,
  ];
  const filters: string[] = [
    `SDE1 ${knobs.enableSDE1 ? `on (${countList(setup.sde1Exclusions)})` : "off"}`,
    `HC3 ${knobs.enableHC3 ? `on (${countList(setup.hc3Exclusions)})` : "off"}`,
  ];
  const sumFilter = formatSumFilter(setup.sumFilter);
  if (sumFilter) filters.push(sumFilter);
  if (setup.digitWidthConstraintEnabled) filters.push(`Digit width: ${setup.digitWidthSingleDigitPercent ?? "-"}%`);
  if (setup.maxLastDrawMatchesEnabled) filters.push(`Max last-draw matches: ${setup.maxLastDrawMatchesValue ?? "-"}`);
  if (countList(setup.previousNeighbourConstraintNumbers) > 0) {
    filters.push(`Previous +/- targets: ${countList(setup.previousNeighbourConstraintNumbers)}`);
  }

  const selections: string[] = [];
  const selectionCounts: Array<[unknown, string]> = [
    [setup.userSelectedNumbers, "User-selected strip"],
    [setup.excludedNumbers, "User exclusions"],
    [setup.hotColdForcedNumbers, "Hot/cold forced"],
    [setup.hotColdExcludedNumbers, "Hot/cold excluded"],
    [setup.droughtBreakSelectedNumbers, "Drought-break forced"],
    [setup.pasteWeightedForcedNumbers, "Paste-weighted forced"],
    [setup.selectedCarryOverBoostNumbers, "Carry-over boosted"],
    [setup.generationForcedNumbers, "Effective generation forced"],
    [setup.allExcludedNumbers, "Effective generation exclusions"],
  ];
  for (const [value, label] of selectionCounts) {
    const count = countList(value);
    if (count > 0) selections.push(`${label}: ${count}`);
  }

  return {
    window: formatWindowSummary(setup),
    oddEvenRatios: Array.isArray(setup.selectedRatios) && setup.selectedRatios.length
      ? setup.selectedRatios.join(", ")
      : "Off",
    generation,
    filters,
    selections,
  };
}

export function normalizePredictionJournalInputs(inputs: PredictionJournalInputs): PredictionJournalInputs {
  const output: PredictionJournalInputs = {};
  const oddEvenRatio = normalizeRatio(inputs.oddEvenRatio);
  const numbers = normalizeNumberList(inputs.numbers, 1, 45);
  const terminalDigits = normalizeTerminalDigits(inputs.terminalDigits);
  const monthlyBuckets = normalizeBucketCounts(inputs.monthlyBuckets);
  const lowMidHigh = normalizeCountObject(inputs.lowMidHigh, ["low", "mid", "high"] as const);
  const singleDouble = normalizeCountObject(inputs.singleDouble, ["single", "double"] as const);
  const sumRange = normalizeRange(inputs.sumRange);
  const ogaRange = normalizeRange(inputs.ogaRange);
  const confidence = normalizeInteger(inputs.confidence);

  if (oddEvenRatio) output.oddEvenRatio = oddEvenRatio;
  if (numbers) output.numbers = numbers;
  if (monthlyBuckets) output.monthlyBuckets = monthlyBuckets;
  if (lowMidHigh) output.lowMidHigh = lowMidHigh;
  if (singleDouble) output.singleDouble = singleDouble;
  if (sumRange) output.sumRange = sumRange;
  if (terminalDigits) output.terminalDigits = terminalDigits;
  if (typeof inputs.trendRatio === "string" && inputs.trendRatio.trim()) output.trendRatio = inputs.trendRatio.trim();
  if (normalizeInteger(inputs.previousRepeatCount) !== undefined) output.previousRepeatCount = normalizeInteger(inputs.previousRepeatCount);
  if (normalizeInteger(inputs.previousNeighbourHitCount) !== undefined) output.previousNeighbourHitCount = normalizeInteger(inputs.previousNeighbourHitCount);
  if (normalizeInteger(inputs.droughtBreakCount) !== undefined) output.droughtBreakCount = normalizeInteger(inputs.droughtBreakCount);
  if (normalizeInteger(inputs.carryOverCount) !== undefined) output.carryOverCount = normalizeInteger(inputs.carryOverCount);
  if (ogaRange) output.ogaRange = ogaRange;
  if (confidence !== undefined) output.confidence = Math.min(100, confidence);
  if (typeof inputs.notes === "string" && inputs.notes.trim()) output.notes = inputs.notes.trim();

  return output;
}

export function drawFingerprint(draw: Draw): string {
  const main = normalizeNumberList(draw.main, 1, 45)?.join(",") ?? "";
  const supp = normalizeNumberList(draw.supp, 1, 45)?.join(",") ?? "";
  return `${draw.date}|main:${main}|supp:${supp}`;
}

export function buildPredictionJournalEntry(options: BuildPredictionJournalEntryOptions): PredictionJournalEntry {
  const now = options.now ?? new Date().toISOString();
  const previous = options.previousEntry;
  const setupSnapshot = options.setupSnapshot === undefined
    ? previous?.setupSnapshot
    : cloneSetupSnapshot(options.setupSnapshot);
  const inputs = normalizePredictionJournalInputs(options.inputs);
  const reviewStatus = normalizeReviewStatus(options.reviewStatus ?? previous?.reviewStatus);
  const reviewedAt = reviewStatus === "reviewedByUser"
    ? previous?.reviewStatus === "reviewedByUser" && previous.reviewedAt ? previous.reviewedAt : now
    : undefined;

  return {
    id: previous?.id ?? options.id ?? `prediction-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    revision: previous ? previous.revision + 1 : 1,
    anchorLatestDrawDate: previous?.anchorLatestDrawDate ?? options.latestDraw.date,
    anchorDrawFingerprint: previous?.anchorDrawFingerprint ?? drawFingerprint(options.latestDraw),
    targetKind: options.targetKind,
    reviewStatus,
    reviewedAt,
    archivedAt: previous?.archivedAt,
    inputs,
    setupSnapshot,
    setupSummary: setupSnapshot ? summarizePredictionJournalSetup(setupSnapshot) : previous?.setupSummary,
    provenance: buildPredictionJournalProvenance(inputs, setupSnapshot),
  };
}

export function parsePredictionJournalDate(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const mdyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (mdyy) {
    const year = Number(mdyy[3]);
    return Date.UTC(year < 100 ? 2000 + year : year, Number(mdyy[1]) - 1, Number(mdyy[2]));
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

const monthKeyFromTime = (time: number): string => {
  const date = new Date(time);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const orderRealDraws = (history: Draw[]): OrderedDraw[] => history
  .map((draw, index) => ({ draw, index, time: parsePredictionJournalDate(draw.date), fingerprint: drawFingerprint(draw) }))
  .filter((row): row is Omit<OrderedDraw, "monthKey"> => !row.draw.isSimulated && row.time !== null)
  .map((row) => ({ ...row, monthKey: monthKeyFromTime(row.time) }))
  .sort((a, b) => (a.time - b.time) || (a.index - b.index));

const findAnchorIndex = (entry: PredictionJournalEntry, ordered: OrderedDraw[]): number => {
  const exact = ordered.findIndex((row) => row.fingerprint === entry.anchorDrawFingerprint);
  if (exact >= 0) return exact;
  return ordered.findIndex((row) => row.draw.date === entry.anchorLatestDrawDate);
};

const targetDrawsForEntry = (entry: PredictionJournalEntry, ordered: OrderedDraw[], anchorIndex: number): Draw[] => {
  const anchor = ordered[anchorIndex];
  const future = ordered.slice(anchorIndex + 1);
  if (entry.targetKind === "nextDraw") return future.slice(0, 1).map((row) => row.draw);
  if (entry.targetKind === "next3Draws") return future.slice(0, 3).map((row) => row.draw);
  return future.filter((row) => row.monthKey === anchor.monthKey).map((row) => row.draw);
};

export function computePredictionJournalStatus(entry: PredictionJournalEntry, history: Draw[]): PredictionJournalComputedStatus {
  const ordered = orderRealDraws(history);
  const anchorIndex = findAnchorIndex(entry, ordered);

  if (anchorIndex < 0) {
    return {
      status: "void",
      canEdit: false,
      targetDraws: [],
      reason: "Anchor draw was not found in real draw history.",
    };
  }

  const targetDraws = targetDrawsForEntry(entry, ordered, anchorIndex);
  if (targetDraws.length === 0) {
    return { status: "pending", canEdit: true, targetDraws };
  }

  if (entry.targetKind === "restOfMonth") {
    const anchor = ordered[anchorIndex];
    const futureAfterMonth = ordered.slice(anchorIndex + 1).some((row) => row.monthKey !== anchor.monthKey && row.time > anchor.time);
    return {
      status: futureAfterMonth ? "scored" : "locked",
      canEdit: false,
      targetDraws,
      reason: futureAfterMonth ? undefined : "Locked because target month has started but has not closed in history yet.",
    };
  }

  const completeCount = TARGET_COMPLETE_COUNTS[entry.targetKind];
  return {
    status: targetDraws.length >= completeCount ? "scored" : "locked",
    canEdit: false,
    targetDraws,
    reason: targetDraws.length >= completeCount ? undefined : "Locked because at least one target draw has arrived.",
  };
}

export function canEditPredictionJournalEntry(entry: PredictionJournalEntry, history: Draw[]): boolean {
  return computePredictionJournalStatus(entry, history).canEdit;
}

const drawNumbers = (draw: Draw): number[] => [
  ...(normalizeNumberList(draw.main, 1, 45) ?? []),
  ...(normalizeNumberList(draw.supp, 1, 45) ?? []),
];

const targetNumbers = (draws: Draw[]): number[] => draws.flatMap(drawNumbers);

const countOddEven = (numbers: number[]): { odd: number; even: number } => numbers.reduce((acc, number) => {
  if (number % 2 === 0) acc.even += 1;
  else acc.odd += 1;
  return acc;
}, { odd: 0, even: 0 });

const formatNumberList = (numbers: number[]): string => numbers.join(", ");

const bucketKeyForCount = (count: number): PredictionBucketKey => {
  if (count <= 0) return "undrawn";
  if (count >= 8) return "times8";
  return `times${count}` as PredictionBucketKey;
};

const countMonthlyBucketMixForTargets = (targets: Draw[], history: Draw[]): PredictionBucketCounts => {
  const ordered = orderRealDraws(history);
  const output: PredictionBucketCounts = {};

  for (const target of targets) {
    const targetTime = parsePredictionJournalDate(target.date);
    if (targetTime === null) continue;
    const targetMonthKey = monthKeyFromTime(targetTime);
    const priorSameMonth = ordered.filter((row) => row.time < targetTime && row.monthKey === targetMonthKey);
    const priorCounts = new Map<number, number>();

    for (const row of priorSameMonth) {
      for (const number of drawNumbers(row.draw)) {
        priorCounts.set(number, (priorCounts.get(number) ?? 0) + 1);
      }
    }

    for (const number of drawNumbers(target)) {
      const key = bucketKeyForCount(priorCounts.get(number) ?? 0);
      output[key] = (output[key] ?? 0) + 1;
    }
  }

  return output;
};

const formatBucketCounts = (counts: PredictionBucketCounts, onlyKeys?: PredictionBucketKey[]): string => {
  const keys = onlyKeys ?? BUCKET_KEYS;
  const parts = keys
    .filter((key) => counts[key] !== undefined && counts[key] !== 0)
    .map((key) => `${BUCKET_LABELS[key]} ${counts[key]}`);
  return parts.length ? parts.join(", ") : "None";
};

const compareBucketCounts = (predicted: PredictionBucketCounts, actual: PredictionBucketCounts): { result: PredictionScoreResult; error: number } => {
  let error = 0;
  let compared = 0;
  for (const key of BUCKET_KEYS) {
    if (predicted[key] === undefined) continue;
    compared += 1;
    error += Math.abs((predicted[key] ?? 0) - (actual[key] ?? 0));
  }
  if (!compared) return { result: "recorded", error: 0 };
  if (error === 0) return { result: "hit", error };
  return { result: error <= 2 ? "partial" : "miss", error };
};

export function scorePredictionJournalEntry(entry: PredictionJournalEntry, history: Draw[]): ScoredPredictionJournalEntry {
  const status = computePredictionJournalStatus(entry, history);
  const inputs = entry.inputs;
  const actualNumbers = targetNumbers(status.targetDraws);
  const actualNumberSet = new Set(actualNumbers);
  const scores: PredictionScore[] = [];

  if (status.targetDraws.length === 0) {
    return { ...entry, ...status, scores };
  }

  if (inputs.oddEvenRatio) {
    const counts = countOddEven(actualNumbers);
    const actual = `${counts.odd}:${counts.even}`;
    scores.push({
      key: "oddEvenRatio",
      label: "Odd/even ratio",
      predicted: inputs.oddEvenRatio,
      actual,
      result: inputs.oddEvenRatio === actual ? "hit" : "miss",
    });
  }

  if (inputs.numbers?.length) {
    const hits = inputs.numbers.filter((number) => actualNumberSet.has(number));
    scores.push({
      key: "numbers",
      label: "Numbers",
      predicted: formatNumberList(inputs.numbers),
      actual: formatNumberList([...new Set(actualNumbers)].sort((a, b) => a - b)),
      result: hits.length === inputs.numbers.length ? "hit" : hits.length > 0 ? "partial" : "miss",
      detail: hits.length ? `Hits: ${formatNumberList(hits)}` : "No listed numbers appeared in the target draw window.",
      hitCount: hits.length,
      predictedCount: inputs.numbers.length,
      actualCount: actualNumberSet.size,
    });
  }

  if (inputs.monthlyBuckets) {
    const actualBuckets = countMonthlyBucketMixForTargets(status.targetDraws, history);
    const comparedKeys = BUCKET_KEYS.filter((key) => inputs.monthlyBuckets?.[key] !== undefined);
    const comparison = compareBucketCounts(inputs.monthlyBuckets, actualBuckets);
    scores.push({
      key: "monthlyBuckets",
      label: "Monthly bucket mix",
      predicted: formatBucketCounts(inputs.monthlyBuckets, comparedKeys),
      actual: formatBucketCounts(actualBuckets, comparedKeys),
      result: comparison.result,
      error: comparison.error,
    });
  }

  if (inputs.singleDouble && (inputs.singleDouble.single !== undefined || inputs.singleDouble.double !== undefined)) {
    const single = actualNumbers.filter((number) => number >= 1 && number <= 9).length;
    const double = actualNumbers.filter((number) => number >= 10 && number <= 45).length;
    const singleError = inputs.singleDouble.single === undefined ? 0 : Math.abs(inputs.singleDouble.single - single);
    const doubleError = inputs.singleDouble.double === undefined ? 0 : Math.abs(inputs.singleDouble.double - double);
    const error = singleError + doubleError;
    scores.push({
      key: "singleDouble",
      label: "Single/double digit",
      predicted: `${inputs.singleDouble.single ?? "-"} single / ${inputs.singleDouble.double ?? "-"} double`,
      actual: `${single} single / ${double} double`,
      result: error === 0 ? "hit" : error <= 2 ? "partial" : "miss",
      error,
    });
  }

  if (inputs.sumRange && (inputs.sumRange.min !== undefined || inputs.sumRange.max !== undefined)) {
    const sum = actualNumbers.reduce((total, number) => total + number, 0);
    const min = inputs.sumRange.min ?? Number.NEGATIVE_INFINITY;
    const max = inputs.sumRange.max ?? Number.POSITIVE_INFINITY;
    scores.push({
      key: "sumRange",
      label: "Sum range",
      predicted: `${inputs.sumRange.min ?? "-"}-${inputs.sumRange.max ?? "-"}`,
      actual: String(sum),
      result: sum >= min && sum <= max ? "hit" : "miss",
      error: sum < min ? min - sum : sum > max ? sum - max : 0,
    });
  }

  if (inputs.terminalDigits?.length) {
    const actualDigits = [...new Set(actualNumbers.map((number) => number % 10))].sort((a, b) => a - b);
    const actualDigitSet = new Set(actualDigits);
    const hits = inputs.terminalDigits.filter((digit) => actualDigitSet.has(digit));
    scores.push({
      key: "terminalDigits",
      label: "Terminal digits",
      predicted: formatNumberList(inputs.terminalDigits),
      actual: formatNumberList(actualDigits),
      result: hits.length === inputs.terminalDigits.length ? "hit" : hits.length > 0 ? "partial" : "miss",
      detail: hits.length ? `Observed digits: ${formatNumberList(hits)}` : "No listed terminal digits appeared.",
      hitCount: hits.length,
      predictedCount: inputs.terminalDigits.length,
      actualCount: actualDigits.length,
    });
  }

  const recordedFields: Array<[keyof PredictionJournalInputs, string, string]> = [
    ["trendRatio", "Trend ratio", inputs.trendRatio ?? ""],
    ["previousRepeatCount", "Previous-repeat count", inputs.previousRepeatCount === undefined ? "" : String(inputs.previousRepeatCount)],
    ["previousNeighbourHitCount", "Previous ±1/±2 count", inputs.previousNeighbourHitCount === undefined ? "" : String(inputs.previousNeighbourHitCount)],
    ["droughtBreakCount", "Drought-break count", inputs.droughtBreakCount === undefined ? "" : String(inputs.droughtBreakCount)],
    ["carryOverCount", "Carry-over count", inputs.carryOverCount === undefined ? "" : String(inputs.carryOverCount)],
  ];

  for (const [key, label, predicted] of recordedFields) {
    if (!predicted) continue;
    scores.push({
      key,
      label,
      predicted,
      actual: "Recorded for review; not scored in V1",
      result: "recorded",
    });
  }

  return { ...entry, ...status, scores };
}

const isPredictionJournalEntry = (value: unknown): value is PredictionJournalEntry => {
  if (!value || typeof value !== "object") return false;
  const entry = value as PredictionJournalEntry;
  return typeof entry.id === "string"
    && typeof entry.createdAt === "string"
    && typeof entry.updatedAt === "string"
    && typeof entry.revision === "number"
    && typeof entry.anchorLatestDrawDate === "string"
    && typeof entry.anchorDrawFingerprint === "string"
    && ["nextDraw", "next3Draws", "restOfMonth"].includes(entry.targetKind)
    && !!entry.inputs
    && typeof entry.inputs === "object";
};

export function loadPredictionJournalEntries(storage: Storage = window.localStorage): PredictionJournalEntry[] {
  try {
    const raw = storage.getItem(PREDICTION_JOURNAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPredictionJournalEntry).map((entry) => {
      const inputs = normalizePredictionJournalInputs(entry.inputs);
      const reviewStatus = normalizeReviewStatus(entry.reviewStatus);
      return {
        ...entry,
        inputs,
        reviewStatus,
        reviewedAt: reviewStatus === "reviewedByUser" && typeof entry.reviewedAt === "string" ? entry.reviewedAt : undefined,
        archivedAt: typeof entry.archivedAt === "string" ? entry.archivedAt : undefined,
        provenance: buildPredictionJournalProvenance(inputs, entry.setupSnapshot),
      };
    });
  } catch {
    return [];
  }
}

export function savePredictionJournalEntries(entries: PredictionJournalEntry[], storage: Storage = window.localStorage): void {
  storage.setItem(PREDICTION_JOURNAL_STORAGE_KEY, JSON.stringify(entries.filter(isPredictionJournalEntry)));
}

export function clearPredictionJournalEntries(storage: Storage = window.localStorage): void {
  storage.removeItem(PREDICTION_JOURNAL_STORAGE_KEY);
}

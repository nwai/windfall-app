// State Presets storage helpers (localStorage) for windfall-app
// v1 keeps data purely client-side and exportable/importable.

import { normalizeBatesParameters, type BatesParameterSet } from "./batesWeightsCore";
import { normalizeFavoritePanelIds } from "./panelFavorites";
import { normalizeWeightedTargetNumbers, normalizeWeightedTargets } from "./weightedTargets";

export type UUID = string;
export type PresetVersion = 1;
type MainEndingDigitBucketKey = "main0" | "main1" | "main2" | "main3" | "main4" | "main5" | "main6" | "main7" | "main8" | "main9";
type MainDecadeBucketKey = "decade0x" | "decade1x" | "decade2x" | "decade3x" | "decade4x";
type MonthlyFrequencyBucketKey = "undrawn" | "times1" | "times2" | "times3" | "times4" | "times5" | "times6" | "times7" | "times8";
type PresetPickSixSource = "manual" | "manualSim" | "dgaSim";

export type PresetMonthlyFrequencyConstraints = Record<MonthlyFrequencyBucketKey, number>;
export type PresetMRBBucketBoosts = Record<MonthlyFrequencyBucketKey, number>;

export interface PresetProbabilityOverlay {
  pAtLeastRaw: number;
  pAtLeastWeighted: number;
  targetRaw: number;
  targetWeighted: number;
}

interface MainBucketBoostSnapshot {
  singleDigit?: number;
  twoDigit?: number;
}

const PRESET_MONTHLY_BUCKET_KEYS: MonthlyFrequencyBucketKey[] = [
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

export const DEFAULT_PRESET_ACCEPTANCE_NEEDS_COUNTS: PresetMonthlyFrequencyConstraints = {
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

export const DEFAULT_PRESET_MRB_BUCKET_BOOSTS: PresetMRBBucketBoosts = {
  undrawn: 1,
  times1: 1,
  times2: 1,
  times3: 1,
  times4: 1,
  times5: 1,
  times6: 1,
  times7: 1,
  times8: 1,
};

export const DEFAULT_PRESET_PICK_SIX_MANUAL = [1, 2, 3, 4, 5, 6, 7, 8];

const DEFAULT_NUM_CANDIDATES = 8;
const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_BATCH_SESSION_RUNS = 10;
const DEFAULT_OCTAGONAL_TOP = 9;
const DEFAULT_LAST_DRAW_MATCH_CAP = 3;
const DEFAULT_TREND_LOOKBACK = 4;
const DEFAULT_TREND_THRESHOLD = 0.02;
const MRB_BUDGET = 9;

export interface AppPreset {
  id: UUID;
  name: string;
  version: PresetVersion;
  createdAt: string;
  updatedAt: string;
  // Put your snapshot here
  state: AppPresetSnapshot;
}

export interface AppPresetSnapshot {
  // Window / range
  drawWindowMode: "lastN" | "range";
  rangeFrom: number;
  rangeTo: number;
  windowEnabled: boolean;
  windowMode: "W" | "F" | "M" | "Q" | "Y" | "H" | "Custom";
  customDrawCount: number;

  // Core toggles and thresholds
  knobs: Record<string, any>;
  entropyEnabled: boolean;
  entropyThreshold: number;
  hammingEnabled: boolean;
  hammingThreshold: number;
  jaccardEnabled: boolean;
  jaccardThreshold: number;

  // Lambda
  lambdaEnabled: boolean;
  lambda: number;

  // GPWF
  gpwfEnabled: boolean;
  gpwf_window_size: number;
  gpwf_bias_factor: number;
  gpwf_floor: number;
  gpwf_scale_multiplier: number;

  // Odd/Even ratios and tricky rule
  selectedRatios: string[];
  useTrickyRule: boolean;

  // User and system exclusions
  excludedNumbers: number[];

  // Trend settings
  trendLookback: number;
  trendThreshold: number;
  allowedTrendRatios: string[];
  trendSelectedNumbers: number[];

  // Ranking / targets
  rankingWeights: { oga: number; sel: number; recent: number; selBonusThreshold?: number; selBonusWeight?: number };
  weightedTargets: Record<number, number>;

  // Candidate zone bias (ranking)
  applyZoneBias: boolean;
  zoneGamma: number;

  // ZPA (Zone Pattern Analysis) persisted settings
  zpa: {
    selectedZones: boolean[];   // 9 length
    normalizeMode: "all" | "selected";
    groups: number[][];
    // Optional: when added to storage (future extensibility)
    weightMode?: "boostUp" | "boostDown";
    strength?: number;
    pMin?: number;
  };

  // TTP (Temperature Transition Panel) (optional, best-effort keys for future use)
  ttp?: {
    applyZoneWeights?: boolean;
    gamma?: number;
    metric?: "ema" | "recency" | "hybrid";
  };

  // MLND backtest panel settings (optional)
  mlndBacktest?: {
    windowSize?: number;
    mode?: "heuristic" | "calibrated";
    randomTrials?: number;
    bootstrapIters?: number;
  };

  // Main ending-digit constraints
  mainZeroSetEnabled?: boolean;
  mainZeroSetCount?: number;
  mainFiveSetEnabled?: boolean;
  mainFiveSetCount?: number;
  mainDiv5Enabled?: boolean;
  mainDiv5Count?: number;
  mainOneSetEnabled?: boolean;
  mainOneSetCount?: number;
  mainTwoSetEnabled?: boolean;
  mainTwoSetCount?: number;
  mainThreeSetEnabled?: boolean;
  mainThreeSetCount?: number;
  mainFourSetEnabled?: boolean;
  mainFourSetCount?: number;
  mainSixSetEnabled?: boolean;
  mainSixSetCount?: number;
  mainSevenSetEnabled?: boolean;
  mainSevenSetCount?: number;
  mainEightSetEnabled?: boolean;
  mainEightSetCount?: number;
  mainNineSetEnabled?: boolean;
  mainNineSetCount?: number;
  mainBucketBoosts?: Partial<Record<MainEndingDigitBucketKey, number | MainBucketBoostSnapshot>>;
  mainDecadeBiases?: Partial<Record<MainDecadeBucketKey, number>>;
  digitWidthConstraintEnabled?: boolean;
  digitWidthSingleDigitPercent?: number;
  digitWidthScope?: "main" | "mainAndSupp";
  // Legacy fields kept for backward-compatible imports
  requireDiv5?: boolean;
  maxDiv5?: number;

  // Attempt budget multiplier
  attemptMultiplier?: number;

  // Over-generation pool multiplier (pool = Count × overgenFactor)
  overgenFactor?: number;

  // Scoring System Diagnostics generation evidence weighting
  scoringGenerationInfluence?: "off" | "light" | "normal" | "strong";

  // MiAN hard-exclusion toggle
  acceptanceNeedsEnabled?: boolean;
  acceptanceNeedsCounts?: Partial<PresetMonthlyFrequencyConstraints>;
  acceptanceNeedsHardExclude?: boolean;

  // Generation-time boost for user selected numbers
  selectedBoostEnabled?: boolean;
  selectedBoostFactor?: number;
  ogaSpokeCount?: number;
  numCandidates?: number;
  batchSize?: number;
  batchSessionRuns?: number;
  octagonalTop?: number;

  // Additional UI state to persist toggles/inputs
  autoExcludeUnselected?: boolean;
  userSelectedNumbers?: number[];
  manualSimSelected?: number[];
  minRecentMatches?: number;
  recentMatchBias?: number;
  previousNeighbourConstraintNumbers?: number[];
  maxLastDrawMatchesEnabled?: boolean;
  maxLastDrawMatchesValue?: number;
  repeatWindowSizeW?: number;
  minFromRecentUnionM?: number;
  sumFilter?: { enabled: boolean; min: number; max: number; includeSupp: boolean };
  patternConstraintMode?: "boost" | "restrict";
  patternBoostFactor?: number;
  patternSumTolerance?: number;
  selectedWindowPatterns?: { low: number; high: number; odd: number; even: number; sum: number }[];
  insightsEnabled?: boolean;
  dgaHeatmapView?: "temperature" | "monthlyBucketState";
  tempMetric?: "ema" | "recency" | "hybrid";
  showHeatmapLetters?: boolean;
  ogaRefMode?: "window" | "all";
  enableOGAForecastBias?: boolean;
  ogaBaselineMode?: "window" | "all";
  ogaPreferredBand?: "auto" | "low" | "mid" | "high";
  ogaPreferredDeciles?: { index: number; weight: number }[];
  traceVerbose?: boolean;
  monthEndCarryOverBiasEnabled?: boolean;
  monthEndCarryOverStrength?: "light" | "normal" | "strong";
  monthEndCarryOverIncludeMonthEndUndrawn?: boolean;
  monthEndCarryOverIncludeBoundaryRepeats?: boolean;
  selectedCarryOverBoostNumbers?: number[];
  selectedCarryOverBoostMode?: "normal" | "strong" | "nearForced";
  // Readiness (Rdy) score weights
  rdyWeights?: { idm: number; conv: number; oga: number };

  // Parameter search and probability overlay
  batesParams?: Partial<BatesParameterSet>;
  probOverlay?: PresetProbabilityOverlay | null;

  // Monthly constructive constraints and repeat-bias controls
  monthlyConstructiveEnabled?: boolean;
  mrbEnabled?: boolean;
  mrbIncludeSupp?: boolean;
  mrbBucketBoosts?: Partial<PresetMRBBucketBoosts>;

  // Pick-Six conversion panel
  pickSixSource?: PresetPickSixSource;
  pickSixManual?: number[];

  // Attention / favorites
  favoritePanelIds?: string[];
}

const KEY = "app:presets:v1";

function finiteNumber(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, Math.round(finiteNumber(value, fallback))));
}

function clampIntegerOrFallback(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = finiteNumber(value, fallback);
  if (numeric < min || numeric > max) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizeMonthlyCounts(input: Partial<PresetMonthlyFrequencyConstraints> | undefined): PresetMonthlyFrequencyConstraints {
  return PRESET_MONTHLY_BUCKET_KEYS.reduce<PresetMonthlyFrequencyConstraints>((next, key) => {
    next[key] = clampInteger(input?.[key], 0, 8, DEFAULT_PRESET_ACCEPTANCE_NEEDS_COUNTS[key]);
    return next;
  }, { ...DEFAULT_PRESET_ACCEPTANCE_NEEDS_COUNTS });
}

function normalizeMRBBoosts(input: Partial<PresetMRBBucketBoosts> | undefined): PresetMRBBucketBoosts {
  const raw = PRESET_MONTHLY_BUCKET_KEYS.reduce<PresetMRBBucketBoosts>((next, key) => {
    next[key] = Math.max(1, Math.min(10, finiteNumber(input?.[key], DEFAULT_PRESET_MRB_BUCKET_BOOSTS[key])));
    return next;
  }, { ...DEFAULT_PRESET_MRB_BUCKET_BOOSTS });

  const usedBudget = PRESET_MONTHLY_BUCKET_KEYS.reduce((sum, key) => sum + Math.max(0, raw[key] - 1), 0);
  if (usedBudget <= MRB_BUDGET) return raw;

  const scale = MRB_BUDGET / usedBudget;
  return PRESET_MONTHLY_BUCKET_KEYS.reduce<PresetMRBBucketBoosts>((next, key) => {
    next[key] = 1 + Math.max(0, raw[key] - 1) * scale;
    return next;
  }, { ...DEFAULT_PRESET_MRB_BUCKET_BOOSTS });
}

function isTrendRatioTag(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = value.split("-");
  if (parts.length !== 3) return false;
  const counts = parts.map((part) => Number(part));
  return counts.every((count) => Number.isInteger(count) && count >= 0) && counts.reduce((sum, count) => sum + count, 0) === 8;
}

function normalizeTrendRatios(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.filter(isTrendRatioTag)));
}

function normalizePickSixSource(value: unknown): PresetPickSixSource {
  return value === "manualSim" || value === "dgaSim" ? value : "manual";
}

function normalizePickSixManual(values: unknown): number[] {
  const seen = new Set<number>();
  const output: number[] = [];
  if (Array.isArray(values)) {
    for (const value of values) {
      const numeric = Math.round(finiteNumber(value, Number.NaN));
      if (!Number.isFinite(numeric) || numeric < 1 || numeric > 45 || seen.has(numeric)) continue;
      seen.add(numeric);
      output.push(numeric);
      if (output.length === 8) return output;
    }
  }

  for (let n = 1; output.length < 8 && n <= 45; n += 1) {
    if (seen.has(n)) continue;
    seen.add(n);
    output.push(n);
  }
  return output;
}

function normalizeProbabilityOverlay(value: unknown): PresetProbabilityOverlay | null {
  if (!value || typeof value !== "object") return null;
  const overlay = value as Partial<Record<keyof PresetProbabilityOverlay, unknown>>;
  const pAtLeastRaw = finiteNumber(overlay.pAtLeastRaw, Number.NaN);
  const pAtLeastWeighted = finiteNumber(overlay.pAtLeastWeighted, Number.NaN);
  const targetRaw = finiteNumber(overlay.targetRaw, Number.NaN);
  const targetWeighted = finiteNumber(overlay.targetWeighted, Number.NaN);
  if (![pAtLeastRaw, pAtLeastWeighted, targetRaw, targetWeighted].every(Number.isFinite)) return null;
  return { pAtLeastRaw, pAtLeastWeighted, targetRaw, targetWeighted };
}

export function normalizeAppPresetSnapshot(snapshot: AppPresetSnapshot): AppPresetSnapshot {
  const userSelectedNumbers = normalizeWeightedTargetNumbers(snapshot.userSelectedNumbers);

  const normalized: AppPresetSnapshot = {
    ...snapshot,
    userSelectedNumbers,
    weightedTargets: normalizeWeightedTargets(userSelectedNumbers, snapshot.weightedTargets),
    trendLookback: clampIntegerOrFallback(snapshot.trendLookback, 1, 52, DEFAULT_TREND_LOOKBACK),
    trendThreshold: Math.max(0, Math.min(1, finiteNumber(snapshot.trendThreshold, DEFAULT_TREND_THRESHOLD))),
    allowedTrendRatios: normalizeTrendRatios(snapshot.allowedTrendRatios),
    acceptanceNeedsEnabled: !!snapshot.acceptanceNeedsEnabled,
    acceptanceNeedsCounts: normalizeMonthlyCounts(snapshot.acceptanceNeedsCounts),
    acceptanceNeedsHardExclude: !!snapshot.acceptanceNeedsHardExclude,
    previousNeighbourConstraintNumbers: normalizeWeightedTargetNumbers(snapshot.previousNeighbourConstraintNumbers).slice(0, 8),
    maxLastDrawMatchesEnabled: !!snapshot.maxLastDrawMatchesEnabled,
    maxLastDrawMatchesValue: clampInteger(snapshot.maxLastDrawMatchesValue, 0, 6, DEFAULT_LAST_DRAW_MATCH_CAP),
    numCandidates: clampInteger(snapshot.numCandidates, 1, 1000, DEFAULT_NUM_CANDIDATES),
    batchSize: clampInteger(snapshot.batchSize, 1, 100000, DEFAULT_BATCH_SIZE),
    batchSessionRuns: clampInteger(snapshot.batchSessionRuns, 1, 200, DEFAULT_BATCH_SESSION_RUNS),
    octagonalTop: clampInteger(snapshot.octagonalTop, 1, 45, DEFAULT_OCTAGONAL_TOP),
    probOverlay: normalizeProbabilityOverlay(snapshot.probOverlay),
    batesParams: normalizeBatesParameters(snapshot.batesParams),
    monthlyConstructiveEnabled: !!snapshot.monthlyConstructiveEnabled,
    mrbEnabled: !!snapshot.mrbEnabled,
    mrbIncludeSupp: snapshot.mrbIncludeSupp ?? true,
    mrbBucketBoosts: normalizeMRBBoosts(snapshot.mrbBucketBoosts),
    scoringGenerationInfluence: snapshot.scoringGenerationInfluence === "light" || snapshot.scoringGenerationInfluence === "normal" || snapshot.scoringGenerationInfluence === "strong"
      ? snapshot.scoringGenerationInfluence
      : "off",
    pickSixSource: normalizePickSixSource(snapshot.pickSixSource),
    pickSixManual: normalizePickSixManual(snapshot.pickSixManual),
  };

  if (Array.isArray(snapshot.favoritePanelIds)) {
    normalized.favoritePanelIds = normalizeFavoritePanelIds(snapshot.favoritePanelIds);
  }

  return normalized;
}

function uid(): UUID {
  // Simple unique ID
  return "p_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function listPresets(): AppPreset[] {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return [];
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return [];
    return arr as AppPreset[];
  } catch {
    return [];
  }
}

export function saveNewPreset(name: string, snapshot: AppPresetSnapshot): AppPreset {
  const now = new Date().toISOString();
  const preset: AppPreset = {
    id: uid(),
    name,
    version: 1,
    createdAt: now,
    updatedAt: now,
    state: normalizeAppPresetSnapshot(snapshot),
  };
  const all = listPresets();
  all.push(preset);
  localStorage.setItem(KEY, JSON.stringify(all));
  return preset;
}

export function updatePreset(id: UUID, snapshot: AppPresetSnapshot, name?: string): AppPreset | null {
  const all = listPresets();
  const idx = all.findIndex(p => p.id === id);
  if (idx === -1) return null;
  all[idx] = {
    ...all[idx],
    name: name ?? all[idx].name,
    updatedAt: new Date().toISOString(),
    state: normalizeAppPresetSnapshot(snapshot),
  };
  localStorage.setItem(KEY, JSON.stringify(all));
  return all[idx];
}

export function deletePreset(id: UUID): boolean {
  const all = listPresets();
  const next = all.filter(p => p.id !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next.length !== all.length;
}

export function getPreset(id: UUID): AppPreset | null {
  return listPresets().find(p => p.id === id) ?? null;
}

export function exportPresetJSON(id: UUID): string | null {
  const p = getPreset(id);
  if (!p) return null;
  return JSON.stringify(p, null, 2);
}

export function importPresetJSON(json: string): AppPreset | null {
  try {
    const p = JSON.parse(json) as AppPreset;
    if (!p || !p.state || !p.name) return null;
    // Save as new copy with a new id/timestamps/version
    const now = new Date().toISOString();
    const imported: AppPreset = {
      id: uid(),
      name: p.name + " (import)",
      version: 1,
      createdAt: now,
      updatedAt: now,
      state: normalizeAppPresetSnapshot(p.state),
    };
    const all = listPresets();
    all.push(imported);
    localStorage.setItem(KEY, JSON.stringify(all));
    return imported;
  } catch {
    return null;
  }
}

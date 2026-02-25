// State Presets storage helpers (localStorage) for windfall-app
// v1 keeps data purely client-side and exportable/importable.

export type UUID = string;
export type PresetVersion = 1;

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

  // Divisible-by-5 constraints
  requireDiv5?: boolean;
  maxDiv5?: number;

  // Attempt budget multiplier
  attemptMultiplier?: number;

  // Generation-time boost for user selected numbers
  selectedBoostEnabled?: boolean;
  selectedBoostFactor?: number;
  ogaSpokeCount?: number;

  // Additional UI state to persist toggles/inputs
  autoExcludeUnselected?: boolean;
  userSelectedNumbers?: number[];
  manualSimSelected?: number[];
  minRecentMatches?: number;
  recentMatchBias?: number;
  repeatWindowSizeW?: number;
  minFromRecentUnionM?: number;
  sumFilter?: { enabled: boolean; min: number; max: number; includeSupp: boolean };
  patternConstraintMode?: "boost" | "restrict";
  patternBoostFactor?: number;
  patternSumTolerance?: number;
  selectedWindowPatterns?: { low: number; high: number; even: number; odd: number; sum: number }[];
  insightsEnabled?: boolean;
  tempMetric?: "ema" | "recency" | "hybrid";
  showHeatmapLetters?: boolean;
  ogaRefMode?: "window" | "all";
  enableOGAForecastBias?: boolean;
  ogaBaselineMode?: "window" | "all";
  ogaPreferredBand?: "auto" | "low" | "mid" | "high";
  ogaPreferredDeciles?: { index: number; weight: number }[];
  traceVerbose?: boolean;
}

const KEY = "app:presets:v1";

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
    state: snapshot,
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
    state: snapshot,
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
      state: p.state,
    };
    const all = listPresets();
    all.push(imported);
    localStorage.setItem(KEY, JSON.stringify(all));
    return imported;
  } catch {
    return null;
  }
}

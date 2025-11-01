// ZPA storage with normalization and safety guards
// Persists groups (number[][]), selectedZones (boolean[]), normalizeMode, and per-number zone weights.

const KEY_GROUPS = "zpa:groups";
const KEY_SELECTED = "zpa:selectedZones";
const KEY_NORM = "zpa:normalizeMode";
const KEY_WEIGHTS = "zpa:weights"; // NEW: per-number weights

export type NormalizeMode = "all" | "selected";
export type WeightsByNumber = Record<number, number>; // NEW: used by panels

export const DEFAULT_GROUPS: number[][] = [
  [1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10],
  [11, 12, 13, 14, 15],
  [16, 17, 18, 19, 20],
  [21, 22, 23, 24, 25],
  [26, 27, 28, 29, 30],
  [31, 32, 33, 34, 35],
  [36, 37, 38, 39, 40],
  [41, 42, 43, 44, 45],
];

function safeParse<T>(s: string | null): T | null {
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

// -------------------- Groups --------------------

function isValidGroups(groups: any): groups is number[][] {
  if (!Array.isArray(groups) || groups.length === 0) return false;
  const flat: number[] = [];
  for (const g of groups) {
    if (!Array.isArray(g) || g.length === 0) return false;
    for (const n of g) {
      if (!Number.isInteger(n) || n < 1 || n > 45) return false;
      flat.push(n);
    }
  }
  if (flat.length !== 45) return false;
  const set = new Set(flat);
  if (set.size !== 45) return false; // duplicates would reduce size
  return true;
}

export function getSavedGroups(): number[][] {
  const parsed = safeParse<number[][]>(localStorage.getItem(KEY_GROUPS));
  if (isValidGroups(parsed)) return parsed!;
  // self-heal
  localStorage.setItem(KEY_GROUPS, JSON.stringify(DEFAULT_GROUPS));
  return DEFAULT_GROUPS;
}

export function setSavedGroups(groups: number[][]): void {
  if (!isValidGroups(groups)) {
    // refuse invalid and reset to default
    localStorage.setItem(KEY_GROUPS, JSON.stringify(DEFAULT_GROUPS));
    localStorage.setItem(KEY_SELECTED, JSON.stringify(Array(DEFAULT_GROUPS.length).fill(true)));
    return;
  }
  localStorage.setItem(KEY_GROUPS, JSON.stringify(groups));
  // adjust selected zones length to match groups length
  const savedSel = safeParse<boolean[]>(localStorage.getItem(KEY_SELECTED)) || [];
  const out = Array(groups.length).fill(true);
  for (let i = 0; i < out.length; i++) out[i] = savedSel[i] ?? true;
  localStorage.setItem(KEY_SELECTED, JSON.stringify(out));
}

// -------------------- Selected Zones --------------------

export function getSavedSelectedZones(): boolean[] {
  const groups = getSavedGroups();
  const sel = safeParse<boolean[]>(localStorage.getItem(KEY_SELECTED)) || [];
  const out = Array(groups.length).fill(true);
  for (let i = 0; i < out.length; i++) out[i] = sel[i] ?? true;
  localStorage.setItem(KEY_SELECTED, JSON.stringify(out));
  return out;
}

export function setSavedSelectedZones(z: boolean[]): void {
  const groups = getSavedGroups();
  const out = Array(groups.length).fill(true);
  for (let i = 0; i < out.length; i++) out[i] = z[i] ?? true;
  localStorage.setItem(KEY_SELECTED, JSON.stringify(out));
}

// -------------------- Normalize Mode --------------------

export function getSavedNormalizeMode(): NormalizeMode {
  const m = safeParse<NormalizeMode>(localStorage.getItem(KEY_NORM));
  if (m === "all" || m === "selected") return m;
  localStorage.setItem(KEY_NORM, JSON.stringify("all"));
  return "all";
}

export function setSavedNormalizeMode(m: NormalizeMode): void {
  localStorage.setItem(KEY_NORM, JSON.stringify(m));
}

// -------------------- Per-number Weights --------------------

// Validate a weights map; we accept sparse and normalize to 1..45 later.
function normalizeWeights(w: any): WeightsByNumber {
  const out: WeightsByNumber = {} as any;
  for (let n = 1; n <= 45; n++) {
    const raw = w && typeof w === "object" ? w[n] ?? (w[String(n)] ?? undefined) : undefined;
    let v = typeof raw === "number" && Number.isFinite(raw) ? raw : 1.0;
    // clamp to reasonable bounds
    if (v < 0.0001) v = 0.0001;
    if (v > 10) v = 10;
    (out as any)[n] = v;
  }
  return out;
}

export function getSavedZoneWeights(): WeightsByNumber {
  const parsed = safeParse<any>(localStorage.getItem(KEY_WEIGHTS));
  const normalized = normalizeWeights(parsed);
  // self-heal: write back normalized if storage was missing/invalid
  localStorage.setItem(KEY_WEIGHTS, JSON.stringify(normalized));
  return normalized;
}

export function setSavedZoneWeights(weights: WeightsByNumber): void {
  const normalized = normalizeWeights(weights);
  localStorage.setItem(KEY_WEIGHTS, JSON.stringify(normalized));
}

// -------------------- Reset --------------------

export function resetZPA(): void {
  localStorage.setItem(KEY_GROUPS, JSON.stringify(DEFAULT_GROUPS));
  localStorage.setItem(KEY_SELECTED, JSON.stringify(Array(DEFAULT_GROUPS.length).fill(true)));
  localStorage.setItem(KEY_NORM, JSON.stringify("all"));
  // Reset weights to 1.0 for all 1..45
  const w: WeightsByNumber = {} as any;
  for (let n = 1; n <= 45; n++) (w as any)[n] = 1.0;
  localStorage.setItem(KEY_WEIGHTS, JSON.stringify(w));
}
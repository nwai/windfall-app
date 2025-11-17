// Lightweight localStorage helpers for Zone Pattern Analysis (ZPA)
import type { ZoneGroups } from "./groupPatterns";
import { ZONE_RANGES } from "./zoneAnalysis";

const KEY_WEIGHTS = "zpa:weights:v1";
const KEY_GROUPS = "zpa:groups:v1";
const KEY_SELECTED_ZONES = "zpa:selectedZones:v1";
const KEY_NORMALIZE_MODE = "zpa:normalizeMode:v1";

export type WeightsByNumber = Record<number, number>;
export type NormalizeMode = "all" | "selected";

export function getSavedZoneWeights(): WeightsByNumber | null {
  try {
    const s = localStorage.getItem(KEY_WEIGHTS);
    if (!s) return null;
    const obj = JSON.parse(s);
    if (!obj || typeof obj !== "object") return null;
    return obj as WeightsByNumber;
  } catch {
    return null;
  }
}

export function setSavedZoneWeights(w: WeightsByNumber) {
  try {
    localStorage.setItem(KEY_WEIGHTS, JSON.stringify(w));
  } catch {}
}

export function getSavedGroups(): ZoneGroups | null {
  try {
    const s = localStorage.getItem(KEY_GROUPS);
    if (!s) return null;
    return JSON.parse(s) as ZoneGroups;
  } catch {
    return null;
  }
}

export function setSavedGroups(g: ZoneGroups) {
  try {
    localStorage.setItem(KEY_GROUPS, JSON.stringify(g));
  } catch {}
}

export function getSavedSelectedZones(): boolean[] | null {
  try {
    const s = localStorage.getItem(KEY_SELECTED_ZONES);
    if (!s) return null;
    const arr = JSON.parse(s);
    // Accept any length array now (dynamic zone count)
    return Array.isArray(arr) ? (arr as boolean[]) : null;
  } catch {
    return null;
  }
}

export function setSavedSelectedZones(zones: boolean[]) {
  try {
    // Accept any length array now (dynamic zone count)
    if (Array.isArray(zones)) {
      localStorage.setItem(KEY_SELECTED_ZONES, JSON.stringify(zones));
    }
  } catch {}
}

export function getSavedNormalizeMode(): NormalizeMode | null {
  try {
    const s = localStorage.getItem(KEY_NORMALIZE_MODE);
    if (!s) return null;
    const v = String(JSON.parse(s));
    return v === "selected" ? "selected" : v === "all" ? "all" : null;
  } catch {
    return null;
  }
}

export function setSavedNormalizeMode(mode: NormalizeMode) {
  try {
    localStorage.setItem(KEY_NORMALIZE_MODE, JSON.stringify(mode));
  } catch {}
}

/**
 * Build contiguous zone groups directly from ZONE_RANGES.
 * Each zone becomes a group containing all numbers in that range.
 * For the current 15-zone scheme (1-3, 4-6, ..., 43-45), this returns 15 groups.
 */
export function groupsFromZoneRanges(): ZoneGroups {
  return ZONE_RANGES.map(([start, end]) => {
    const group: number[] = [];
    for (let n = start; n <= end; n++) {
      group.push(n);
    }
    return group;
  });
}

/**
 * Get effective groups for ZPA.
 * Returns saved groups if present and valid, otherwise derives from ZONE_RANGES.
 * If no saved groups, initializes with derived groups and saves them.
 */
export function getEffectiveGroups(): ZoneGroups {
  const saved = getSavedGroups();
  if (saved && Array.isArray(saved) && saved.length > 0) {
    return saved;
  }
  
  // Derive from ZONE_RANGES
  const derived = groupsFromZoneRanges();
  
  // Save the derived groups for future use
  setSavedGroups(derived);
  
  // Also initialize selectedZones to all-true for the derived groups
  const allSelected = new Array(derived.length).fill(true);
  setSavedSelectedZones(allSelected);
  
  return derived;
}

/**
 * Get effective selectedZones, adjusted to match expected length.
 * If no expectedLength provided, uses the current effective groups length.
 * Pads with true or truncates as needed, and persists the adjusted array.
 */
export function getEffectiveSelectedZones(expectedLength?: number): boolean[] {
  const targetLength = expectedLength ?? getEffectiveGroups().length;
  
  const saved = getSavedSelectedZones();
  
  if (!saved || saved.length === 0) {
    // No saved data - initialize all true
    const initialized = new Array(targetLength).fill(true);
    setSavedSelectedZones(initialized);
    return initialized;
  }
  
  if (saved.length === targetLength) {
    // Perfect match - return as-is
    return saved;
  }
  
  // Adjust length: pad with true or truncate
  const adjusted = saved.slice(0, targetLength);
  while (adjusted.length < targetLength) {
    adjusted.push(true);
  }
  
  // Persist the adjusted array
  setSavedSelectedZones(adjusted);
  
  return adjusted;
}
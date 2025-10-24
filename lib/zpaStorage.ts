// Lightweight localStorage helpers for Zone Pattern Analysis (ZPA)
import type { ZoneGroups } from "./groupPatterns";

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
    return Array.isArray(arr) && arr.length === 9 ? (arr as boolean[]) : null;
  } catch {
    return null;
  }
}

export function setSavedSelectedZones(zones: boolean[]) {
  try {
    if (Array.isArray(zones) && zones.length === 9) {
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
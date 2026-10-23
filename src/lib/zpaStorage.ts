// Lightweight localStorage helpers for Zone Pattern Analysis (ZPA)
import type { ZoneGroups } from "./groupPatterns";

const KEY_WEIGHTS = "zpa:weights:v1";
const KEY_GROUPS = "zpa:groups:v1";
const KEY_SELECTED_ZONES = "zpa:selectedZones:v1";
const KEY_NORMALIZE_MODE = "zpa:normalizeMode:v1";

export type WeightsByNumber = Record<number, number>;
export type NormalizeMode = "all" | "selected";
const WEIGHTS_CHANGED_EVENT = "windfall:zone-weights-changed";
let cachedWeightsRaw: string | null | undefined;
let cachedWeights: WeightsByNumber | null = null;

export function getSavedZoneWeights(): WeightsByNumber | null {
  try {
    const s = localStorage.getItem(KEY_WEIGHTS);
    if (s === cachedWeightsRaw) return cachedWeights;
    cachedWeightsRaw = s;
    cachedWeights = null;
    if (s) {
      const obj = JSON.parse(s);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) cachedWeights = obj as WeightsByNumber;
    }
    return cachedWeights;
  } catch {
    return null;
  }
}

export function setSavedZoneWeights(w: WeightsByNumber) {
  try {
    localStorage.setItem(KEY_WEIGHTS, JSON.stringify(w));
    window.dispatchEvent(new Event(WEIGHTS_CHANGED_EVENT));
  } catch {}
}

export function subscribeSavedZoneWeights(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea === localStorage && (event.key === KEY_WEIGHTS || event.key === null)) listener();
  };
  window.addEventListener(WEIGHTS_CHANGED_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(WEIGHTS_CHANGED_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
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

// Lightweight localStorage helpers for Zone Pattern Analysis (ZPA)
import type { ZoneGroups } from "./groupPatterns";

const KEY_WEIGHTS = "zpa:weights:v1";
const KEY_GROUPS = "zpa:groups:v1";

export type WeightsByNumber = Record<number, number>;

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
import { useSyncExternalStore } from "react";
import { getSavedZoneWeights, subscribeSavedZoneWeights } from "../lib/zpaStorage";

const serverSnapshot = () => null;

export function useSavedZoneWeights() {
  return useSyncExternalStore(subscribeSavedZoneWeights, getSavedZoneWeights, serverSnapshot);
}

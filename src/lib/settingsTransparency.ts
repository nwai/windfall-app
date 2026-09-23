export const SETTINGS_MODEL_VERSION = "WF-settings-2";

export function lastDrawBiasMultiplier(bias: number, minimum: number): number {
  const strength = Number.isFinite(bias) ? Math.max(0, Math.min(5, bias)) : 0;
  return minimum > 0 ? 1 + strength : 1 / (1 + strength);
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export interface EffectiveSetting {
  id: string;
  label: string;
  requested: string;
  applied: string;
  source: "Control" | "Restored" | "Automatic" | "Fixed model";
  effect: string;
  scope: string;
  reason: string;
}
export interface EffectiveSettingsLedger {
  version: string;
  rows: EffectiveSetting[];
}
export function withRestoredSettingSources(ledger: EffectiveSettingsLedger, restored?: EffectiveSettingsLedger | null): EffectiveSettingsLedger {
  const requests = new Map((Array.isArray(restored?.rows) ? restored.rows : [])
    .filter(row => row && typeof row.id === "string" && typeof row.requested === "string")
    .map(row => [row.id, row.requested]));
  return { ...ledger, rows: ledger.rows.map(row => row.source === "Control" && requests.get(row.id) === row.requested
    ? { ...row, source: "Restored", reason: `Requested value matches the restored snapshot. ${row.reason}` }
    : row) };
}
export const effectiveSettingsTrace = (ledger: EffectiveSettingsLedger): string[] => [
  `[TRACE] Effective settings ${ledger.version} (current controls, including restored choices)`,
  ...ledger.rows.map(row => `[TRACE] ${row.label}: requested ${row.requested}; applied ${row.applied}; source ${row.source}; ${row.effect}; scope ${row.scope}; ${row.reason}`),
];

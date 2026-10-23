import type { Draw } from "../types";

export interface PreferredOgaDecile { index: number; weight: number }
export interface OgaForecastBiasOptions {
  enabled?: boolean;
  preferredBand?: "auto" | "low" | "mid" | "high";
  bands?: { low: number; mid: number; high: number };
  deciles?: { thresholds: number[]; probs: number[] };
  preferredDeciles?: PreferredOgaDecile[];
  baselineHistory?: Draw[];
  baselineLabel?: string;
  evidenceDrawCount?: number;
}

export interface OgaDecileGate {
  selected: boolean;
  error: string | null;
  thresholds: readonly number[];
  acceptanceByIndex: readonly number[];
}

export function buildOgaDecileGate(options?: OgaForecastBiasOptions): OgaDecileGate {
  const preferences = options?.preferredDeciles ?? [];
  const thresholds = options?.deciles?.thresholds ?? [];
  const acceptanceByIndex = Array<number>(10).fill(0);
  const result = (error: string | null): OgaDecileGate => ({
    selected: preferences.length > 0, error, thresholds, acceptanceByIndex,
  });
  if (!options?.enabled) return result(null);
  if (options.evidenceDrawCount === 0) return result("OGA acceptance bias needs real historical OGA scores; no evidence is loaded");
  if (!preferences.length) return result(null);
  if (thresholds.length !== 9 || thresholds.some((value, index) =>
    !Number.isFinite(value) || (index > 0 && value < thresholds[index - 1]))) {
    return result("Selected OGA score bands need nine finite, ordered historical cutoffs; no broad-band fallback is applied");
  }
  const seen = new Set<number>();
  for (const { index, weight } of preferences) {
    if (!Number.isInteger(index) || index < 0 || index > 9 || seen.has(index)
      || !Number.isFinite(weight) || weight < 0) {
      return result("OGA score bands must be unique D0-D9 selections with finite, non-negative weights");
    }
    seen.add(index);
  }
  const maxWeight = Math.max(...preferences.map(({ weight }) => weight));
  if (maxWeight <= 0) return result("Give at least one selected OGA score band a positive weight, or clear the selections");
  // Scale first to keep very large, finite user weights from overflowing their sum.
  const scaledTotal = preferences.reduce((sum, { weight }) => sum + weight / maxWeight, 0);
  preferences.forEach(({ index, weight }) => { acceptanceByIndex[index] = (weight / maxWeight) / scaledTotal; });
  if (!preferences.some(({ index, weight }) => weight > 0
    && (index === 0 || index === 9 || thresholds[index] > thresholds[index - 1]))) {
    return result("All positive-weight OGA score bands have empty intervals because their historical cutoffs are tied");
  }
  return result(null);
}

export function ogaDecileIndex(score: number, thresholds: readonly number[]): number {
  let index = 0;
  while (index < thresholds.length && score > thresholds[index]) index += 1;
  return index;
}

export function ogaDecileAcceptance(score: number, gate: OgaDecileGate, rng: () => number): {
  index: number; probability: number; accepted: boolean;
} {
  const index = ogaDecileIndex(score, gate.thresholds);
  const probability = gate.selected && !gate.error && Number.isFinite(score)
    ? gate.acceptanceByIndex[index] ?? 0 : 0;
  return { index, probability, accepted: probability > 0 && rng() < probability };
}

export function ogaDecileRangeLabel(index: number, thresholds: readonly number[]): string {
  if (thresholds.length !== 9) return "Cutoffs unavailable";
  const format = (value: number) => String(Number(value.toPrecision(8)));
  if (index === 0) return `<= ${format(thresholds[0])}`;
  if (index === 9) return `> ${format(thresholds[8])}`;
  if (thresholds[index] === thresholds[index - 1]) return "Empty interval (tied cutoffs)";
  return `> ${format(thresholds[index - 1])} to <= ${format(thresholds[index])}`;
}

export function ogaForecastBiasSummary(options: OgaForecastBiasOptions): string {
  const selected = options.preferredDeciles ?? [];
  const selection = selected.map(({ index, weight }) => `D${index} x${weight}`).join(", ");
  if (!options.enabled) return `Off${selection ? `; saved bands: ${selection}` : ""}`;
  const gate = buildOgaDecileGate(options);
  if (gate.error) return `Blocked: ${gate.error}`;
  return gate.selected ? `Selected OGA bands only: ${selection}; no broad-band fallback`
    : `Broad OGA band: ${options.preferredBand ?? "auto"}; no detailed bands selected`;
}

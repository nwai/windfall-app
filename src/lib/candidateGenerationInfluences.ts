import type { MonthlyFrequencyConstraints } from "./monthlyDrawSummary";

export interface SumFilterConfig {
  enabled: boolean;
  min: number;
  max: number;
  includeSupp: boolean;
}

export interface NormalizedSumFilter {
  config: SumFilterConfig;
  label: string;
  warnings: string[];
}

export interface ReadinessWeights {
  idm: number;
  conv: number;
  oga: number;
}

export interface AcceptanceNeedsSummary {
  total: number;
  possible: boolean;
  warning: string | null;
}

export interface GenerationProvenanceInput {
  windowSize: number;
  entropy: number | "off";
  hamming: number | "off";
  jaccard: number | "off";
  tricky: boolean;
  ratios: string[];
  minRecentMatches: number;
  recentMatchBias: number;
  repeatWindowSizeW: number;
  minFromRecentUnionM: number;
  gpwf: boolean;
  lambda: number | "off";
  sumLabel: string;
  patternMode: string;
  patternSumTolerance: number;
  patternBoostFactor: number;
  ogaBias: string;
  endingDigitSets: Record<`end${number}`, string>;
  digitWidth: string;
  endingDigitBoosts: string;
  decadeBias: string;
  monthlyRepeatBias: string;
}

const DEFAULT_SUM_FILTER: SumFilterConfig = {
  enabled: false,
  min: 0,
  max: 0,
  includeSupp: true,
};

export function normalizeSumFilter(input: Partial<SumFilterConfig> | undefined): NormalizedSumFilter {
  const warnings: string[] = [];
  const enabled = !!input?.enabled;
  const includeSupp = input?.includeSupp ?? true;
  const rawMin = Number(input?.min ?? DEFAULT_SUM_FILTER.min);
  const rawMax = Number(input?.max ?? DEFAULT_SUM_FILTER.max);

  if (!enabled) {
    return {
      config: { ...DEFAULT_SUM_FILTER, includeSupp },
      label: "off",
      warnings,
    };
  }

  if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax)) {
    return {
      config: { ...DEFAULT_SUM_FILTER, includeSupp },
      label: "off",
      warnings: ["Sum filter is disabled because one or both bounds are not finite numbers."],
    };
  }

  const roundedMin = Math.max(0, Math.round(rawMin));
  const roundedMax = Math.max(0, Math.round(rawMax));
  const min = Math.min(roundedMin, roundedMax);
  const max = Math.max(roundedMin, roundedMax);
  if (roundedMin > roundedMax) {
    warnings.push("Sum filter bounds were reversed and have been corrected.");
  }

  return {
    config: { enabled: true, min, max, includeSupp },
    label: `${min}-${max} ${includeSupp ? "main+supp" : "main"}`,
    warnings,
  };
}

export function normalizeReadinessWeights(weights: ReadinessWeights): Record<keyof ReadinessWeights, number> {
  const safe = {
    idm: sanitizeWeight(weights.idm),
    conv: sanitizeWeight(weights.conv),
    oga: sanitizeWeight(weights.oga),
  };
  const total = safe.idm + safe.conv + safe.oga;
  if (total <= 0) return { idm: 0, conv: 0, oga: 0 };

  const keys: (keyof ReadinessWeights)[] = ["idm", "conv", "oga"];
  const raw = keys.map((key) => {
    const percent = (safe[key] / total) * 100;
    return {
      key,
      floor: Math.floor(percent),
      remainder: percent - Math.floor(percent),
    };
  });
  const normalized = raw.reduce<Record<keyof ReadinessWeights, number>>((acc, entry) => {
    acc[entry.key] = entry.floor;
    return acc;
  }, { idm: 0, conv: 0, oga: 0 });
  let remaining = 100 - raw.reduce((sum, entry) => sum + entry.floor, 0);
  const ranked = [...raw].sort((a, b) => b.remainder - a.remainder || keys.indexOf(a.key) - keys.indexOf(b.key));
  for (const entry of ranked) {
    if (remaining <= 0) break;
    normalized[entry.key] += 1;
    remaining--;
  }
  return normalized;
}

export function summarizeAcceptanceNeeds(counts: MonthlyFrequencyConstraints): AcceptanceNeedsSummary {
  const total = Object.values(counts).reduce((sum, value) => sum + sanitizeCount(value), 0);
  const possible = total <= 8;
  return {
    total,
    possible,
    warning: possible ? null : `Requirements sum to ${total}, but candidates contain only 8 numbers.`,
  };
}

export function buildGenerationProvenance(input: GenerationProvenanceInput): string {
  const endKeys = ["end0", "end1", "end2", "end3", "end4", "end5", "end6", "end7", "end8", "end9"] as const;
  const parts = [
    `Window=${input.windowSize}`,
    `Entropy=${input.entropy}`,
    `Hamming=${input.hamming}`,
    `Jaccard=${input.jaccard}`,
    `Tricky=${input.tricky ? "on" : "off"}`,
    `Ratios=${input.ratios.length ? input.ratios.join(" ") : "none"}`,
    `RecMin=${input.minRecentMatches}`,
    `RecBias=${input.recentMatchBias}`,
    `Repeat W=${input.repeatWindowSizeW} M=${input.minFromRecentUnionM}`,
    `GPWF=${input.gpwf ? "on" : "off"}`,
    `lambda=${typeof input.lambda === "number" ? input.lambda.toFixed(2) : "off"}`,
    `Sum=${input.sumLabel}`,
    `PatternMode=${input.patternMode}`,
    `Tol=${input.patternSumTolerance}`,
    `Boost=${input.patternBoostFactor}`,
    `OGABias=${input.ogaBias}`,
    ...endKeys.map((key) => `End${key.replace("end", "")}Set=${input.endingDigitSets[key] ?? "off"}`),
    `DigitWidth=${input.digitWidth}`,
    `EndDigitBoosts=${input.endingDigitBoosts || "none"}`,
    `DecadeBias=${input.decadeBias || "none"}`,
    `MRB=${input.monthlyRepeatBias}`,
  ];

  return parts.join("; ");
}

function sanitizeWeight(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function sanitizeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

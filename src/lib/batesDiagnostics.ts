import { assessBatesGuardrails } from "./batesGuardrails";
import { normalizeBatesParameters, type BatesParameterSet } from "./batesWeightsCore";
import type { GuardrailResult } from "./batesGuardrails";

const SLOT_COUNT = 45;
const LOG_SLOT_COUNT = Math.log(SLOT_COUNT);

export interface BatesSignalDiagnostics {
  available: boolean;
  valid: boolean;
  length: number;
  finiteCount: number;
}

export interface BatesWeightDiagnostics {
  sourceLength: number;
  invalidWeightCount: number;
  totalMass: number;
  min: number;
  max: number;
  mean: number;
  std: number;
  coefficientOfVariation: number;
  entropy: number;
  entropyRatio: number;
  effectiveNumbers: number;
  effectiveShare: number;
  concentrationSeverity: GuardrailResult["severity"];
  top: Array<{ n: number; w: number; cumulative: number }>;
}

export interface BatesDiagnostics {
  summary: string;
  updatedAt: string;
  params: BatesParameterSet;
  guardrails: { severity: GuardrailResult["severity"]; warnings: string[] };
  signals: {
    recentSignal: BatesSignalDiagnostics;
    conditionalProb: BatesSignalDiagnostics;
  };
  weights: BatesWeightDiagnostics;
}

interface NormalizedWeightVector {
  sourceLength: number;
  invalidWeightCount: number;
  totalMass: number;
  weights: number[];
}

export function computeBatesDiagnostics(
  params: BatesParameterSet,
  weights: number[],
  ctx: { recentSignal?: number[] | null; conditionalProb?: number[] | null },
): BatesDiagnostics {
  const normalizedParams = normalizeBatesParameters(params);
  const parameterGuardrails = assessBatesGuardrails(normalizedParams);
  const normalizedVector = normalizeDiagnosticWeights(weights);
  const weightDiagnostics = computeWeightDiagnostics(normalizedVector);
  const distributionWarnings = buildDistributionWarnings(weightDiagnostics);
  const distributionSeverity = classifyDistributionIntegrity(weightDiagnostics);
  const warnings = [...parameterGuardrails.warnings, ...distributionWarnings];
  const severity = mergeSeverities(parameterGuardrails.severity, weightDiagnostics.concentrationSeverity, distributionSeverity);

  return {
    summary: buildSummary(normalizedParams, weightDiagnostics, severity),
    updatedAt: new Date().toISOString(),
    params: normalizedParams,
    guardrails: { severity, warnings },
    signals: {
      recentSignal: diagnoseSignal(ctx.recentSignal),
      conditionalProb: diagnoseSignal(ctx.conditionalProb),
    },
    weights: weightDiagnostics,
  };
}

function normalizeDiagnosticWeights(weights: readonly unknown[] | undefined): NormalizedWeightVector {
  const source = Array.isArray(weights) ? weights : [];
  const clean = Array.from({ length: SLOT_COUNT }, (_, index) => {
    if (index >= source.length) return 0;
    const numeric = typeof source[index] === "number" ? source[index] : Number(source[index]);
    if (!Number.isFinite(numeric) || numeric < 0) return Number.NaN;
    return numeric;
  });
  const invalidWithinSlots = clean.reduce((count, value) => count + (Number.isFinite(value) ? 0 : 1), 0);
  const extraInvalidCount = source.length > SLOT_COUNT ? source.length - SLOT_COUNT : 0;
  const nonNegative = clean.map((value) => (Number.isFinite(value) ? value : 0));
  const totalMass = nonNegative.reduce((total, weight) => total + weight, 0);

  if (totalMass <= 0) {
    return {
      sourceLength: source.length,
      invalidWeightCount: invalidWithinSlots + extraInvalidCount,
      totalMass,
      weights: Array.from({ length: SLOT_COUNT }, () => 1 / SLOT_COUNT),
    };
  }

  return {
    sourceLength: source.length,
    invalidWeightCount: invalidWithinSlots + extraInvalidCount,
    totalMass,
    weights: nonNegative.map((weight) => weight / totalMass),
  };
}

function computeWeightDiagnostics(vector: NormalizedWeightVector): BatesWeightDiagnostics {
  const { weights } = vector;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sumSquares = 0;
  let entropy = 0;

  for (const weight of weights) {
    min = Math.min(min, weight);
    max = Math.max(max, weight);
    sumSquares += weight * weight;
    if (weight > 0) entropy -= weight * Math.log(weight);
  }

  const mean = 1 / SLOT_COUNT;
  const variance = weights.reduce((total, weight) => total + (weight - mean) ** 2, 0) / SLOT_COUNT;
  const std = Math.sqrt(variance);
  const effectiveNumbers = sumSquares > 0 ? 1 / sumSquares : 0;
  const entropyRatio = LOG_SLOT_COUNT > 0 ? entropy / LOG_SLOT_COUNT : 0;
  const top = weights
    .map((weight, index) => ({ n: index + 1, w: weight }))
    .sort((left, right) => right.w - left.w || left.n - right.n)
    .slice(0, 10)
    .reduce<Array<{ n: number; w: number; cumulative: number }>>((rows, row) => {
      const previous = rows[rows.length - 1]?.cumulative ?? 0;
      rows.push({ ...row, cumulative: previous + row.w });
      return rows;
    }, []);

  return {
    sourceLength: vector.sourceLength,
    invalidWeightCount: vector.invalidWeightCount,
    totalMass: vector.totalMass,
    min,
    max,
    mean,
    std,
    coefficientOfVariation: mean > 0 ? std / mean : 0,
    entropy,
    entropyRatio,
    effectiveNumbers,
    effectiveShare: effectiveNumbers / SLOT_COUNT,
    concentrationSeverity: classifyConcentration(max, effectiveNumbers, entropyRatio),
    top,
  };
}

function classifyConcentration(
  maxWeight: number,
  effectiveNumbers: number,
  entropyRatio: number,
): GuardrailResult["severity"] {
  if (maxWeight >= 0.15 || effectiveNumbers < 8 || entropyRatio < 0.6) return "risk";
  if (maxWeight >= 0.07 || effectiveNumbers < 20 || entropyRatio < 0.82) return "caution";
  return "ok";
}

function buildDistributionWarnings(weights: BatesWeightDiagnostics): string[] {
  const warnings: string[] = [];

  if (weights.sourceLength !== SLOT_COUNT) {
    warnings.push(`Weight vector length is ${weights.sourceLength}; expected ${SLOT_COUNT}. Missing or extra entries were normalized before reporting.`);
  }
  if (weights.invalidWeightCount > 0) {
    warnings.push(`${weights.invalidWeightCount} invalid weight entries were replaced with zero before normalization.`);
  }
  if (weights.totalMass <= 0) {
    warnings.push("Weight vector had no positive mass; diagnostics used a uniform fallback distribution.");
  } else if (Math.abs(weights.totalMass - 1) > 1e-6) {
    warnings.push(`Weight vector total mass was ${formatDecimal(weights.totalMass, 4)} and was renormalized for diagnostics.`);
  }
  if (weights.concentrationSeverity === "risk") {
    warnings.push(`Distribution is highly concentrated: effective ${formatDecimal(weights.effectiveNumbers, 1)} of ${SLOT_COUNT}, top share ${formatPercent(weights.max)}.`);
  } else if (weights.concentrationSeverity === "caution") {
    warnings.push(`Distribution is moderately concentrated: effective ${formatDecimal(weights.effectiveNumbers, 1)} of ${SLOT_COUNT}, top share ${formatPercent(weights.max)}.`);
  }

  return warnings;
}

function classifyDistributionIntegrity(weights: BatesWeightDiagnostics): GuardrailResult["severity"] {
  if (weights.sourceLength !== SLOT_COUNT || weights.invalidWeightCount > 0 || weights.totalMass <= 0) return "risk";
  if (Math.abs(weights.totalMass - 1) > 1e-6) return "caution";
  return "ok";
}

function diagnoseSignal(signal: number[] | null | undefined): BatesSignalDiagnostics {
  if (!Array.isArray(signal)) {
    return { available: false, valid: false, length: 0, finiteCount: 0 };
  }

  const finiteCount = signal.reduce((count, value) => count + (Number.isFinite(value) ? 1 : 0), 0);
  return {
    available: true,
    valid: signal.length === SLOT_COUNT && finiteCount === SLOT_COUNT,
    length: signal.length,
    finiteCount,
  };
}

function buildSummary(
  params: BatesParameterSet,
  weights: BatesWeightDiagnostics,
  severity: GuardrailResult["severity"],
): string {
  const shape = params.dualTri ? "Dual triangular + Bates" : "Triangular + Bates";
  return `${shape} | mix ${formatDecimal(params.mixWeight, 2)} | effective ${formatDecimal(weights.effectiveNumbers, 1)}/${SLOT_COUNT} | top ${formatPercent(weights.max)} | ${severity}`;
}

function mergeSeverities(...severities: GuardrailResult["severity"][]): GuardrailResult["severity"] {
  if (severities.includes("risk")) return "risk";
  if (severities.includes("caution")) return "caution";
  return "ok";
}

function formatDecimal(value: number, digits: number): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "0";
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "0.0%";
}

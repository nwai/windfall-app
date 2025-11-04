import { BatesParameterSet } from "./batesWeightsCore";
import { assessBatesGuardrails, GuardrailResult } from "./batesGuardrails";

/**
 * Diagnostics structure for Bates sampler with guardrails and weight statistics.
 */
export interface BatesDiagnostics {
  summary: string;
  updatedAt: string;
  params: Partial<BatesParameterSet>;
  guardrails?: {
    severity: "info" | "warn" | "risk";
    warnings: string[];
  };
  weights?: {
    min: number;
    max: number;
    mean: number;
    std: number;
    top: Array<{ n: number; w: number }>;
  };
}

/**
 * Compute comprehensive diagnostics for the Bates sampler.
 * @param params - The Bates parameter set.
 * @param weights - Final weights array (length 45).
 * @param ctx - Optional context with recent signal and conditional probability.
 * @returns BatesDiagnostics object with summary, guardrails, and weight statistics.
 */
export function computeBatesDiagnostics(
  params: BatesParameterSet,
  weights: number[],
  ctx: {
    recentSignal?: number[] | null;
    conditionalProb?: number[] | null;
  }
): BatesDiagnostics {
  // 1. Assess guardrails
  const guardrailResult: GuardrailResult = assessBatesGuardrails(params);
  
  // Map severity to the expected format
  const severity: "info" | "warn" | "risk" = 
    guardrailResult.severity === "ok" ? "info" : 
    guardrailResult.severity === "caution" ? "warn" : "risk";

  // 2. Compute weight statistics
  const validWeights = weights.filter(w => isFinite(w));
  const min = validWeights.length > 0 ? Math.min(...validWeights) : 0;
  const max = validWeights.length > 0 ? Math.max(...validWeights) : 0;
  const sum = validWeights.reduce((a, b) => a + b, 0);
  const mean = validWeights.length > 0 ? sum / validWeights.length : 0;
  
  // Calculate standard deviation
  const variance = validWeights.length > 0 
    ? validWeights.reduce((acc, w) => acc + Math.pow(w - mean, 2), 0) / validWeights.length
    : 0;
  const std = Math.sqrt(variance);

  // Get top 10 weights by value
  const indexedWeights = weights.map((w, i) => ({ n: i + 1, w }));
  const top = indexedWeights
    .sort((a, b) => b.w - a.w)
    .slice(0, 10);

  // 3. Build readable summary string
  const summaryParts: string[] = [];
  
  summaryParts.push(`k=${params.k}`);
  summaryParts.push(`mix=${params.mixWeight.toFixed(2)}`);
  
  if (params.dualTri) {
    summaryParts.push(`dualTri: modeA=${params.triMode.toFixed(2)} modeB=${params.triMode2.toFixed(2)} wA=${params.dualTriWeightA.toFixed(2)}`);
  } else {
    summaryParts.push(`triMode=${params.triMode.toFixed(2)}`);
  }
  
  const betas: string[] = [];
  if (params.betaHot > 0) betas.push(`βHot=${params.betaHot.toFixed(2)}`);
  if (params.betaCold > 0) betas.push(`βCold=${params.betaCold.toFixed(2)}`);
  if (params.betaGlobal > 0) betas.push(`βGlobal=${params.betaGlobal.toFixed(2)}`);
  if (betas.length > 0) {
    summaryParts.push(betas.join(" "));
  }
  
  if (params.gammaConditional > 0) {
    summaryParts.push(`γCond=${params.gammaConditional.toFixed(2)}`);
  }
  
  summaryParts.push(`quantiles: hot=${params.hotQuantile.toFixed(2)} cold=${params.coldQuantile.toFixed(2)}`);

  const summary = summaryParts.join(" | ");

  return {
    summary,
    updatedAt: new Date().toISOString(),
    params,
    guardrails: {
      severity,
      warnings: guardrailResult.warnings
    },
    weights: {
      min,
      max,
      mean,
      std,
      top
    }
  };
}
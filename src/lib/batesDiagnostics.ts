import { assessBatesGuardrails } from "./batesGuardrails";
import type { BatesParameterSet } from "./batesWeightsCore";

export type BatesDiagnostics = {
  summary: string;
  updatedAt: string;
  params: Partial<BatesParameterSet>;
  guardrails?: { severity: "info" | "warn" | "risk"; warnings: string[] };
  weights?: {
    min: number;
    max: number;
    mean: number;
    std: number;
    top: Array<{ n: number; w: number }>;
  };
};

export function computeBatesDiagnostics(
  params: BatesParameterSet,
  weights: number[],
  _ctx: { recentSignal?: number[] | null; conditionalProb?: number[] | null }
): BatesDiagnostics {
  const guard = assessBatesGuardrails(params);

  const n = weights.length;
  let min = Infinity, max = -Infinity, sum = 0;
  for (let i = 0; i < n; i++) {
    const w = weights[i] ?? 0;
    if (w < min) min = w;
    if (w > max) max = w;
    sum += w;
  }
  const mean = n > 0 ? sum / n : 0;
  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const d = (weights[i] ?? 0) - mean;
    varSum += d * d;
  }
  const std = n > 0 ? Math.sqrt(varSum / n) : 0;

  const top = weights
    .map((w, i) => ({ n: i + 1, w: w ?? 0 }))
    .sort((a, b) => b.w - a.w || a.n - b.n)
    .slice(0, 10);

  const parts = [
    `k=${params.k}`,
    `dual=${params.dualTri ? "yes" : "no"}`,
    `mix=${params.mixWeight.toFixed(2)}`,
    `modeA=${params.triMode.toFixed(2)}`,
    params.dualTri ? `modeB=${params.triMode2.toFixed(2)}` : "",
    `βH=${params.betaHot.toFixed(2)}`,
    `βC=${params.betaCold.toFixed(2)}`,
    `βG=${params.betaGlobal.toFixed(2)}`,
    `γ=${params.gammaConditional.toFixed(2)}`,
    `qH=${params.hotQuantile.toFixed(2)}`,
    `qC=${params.coldQuantile.toFixed(2)}`,
  ].filter(Boolean);

  return {
    summary: parts.join(" | "),
    updatedAt: new Date().toISOString(),
    params,
    guardrails: { severity: guard.severity as any, warnings: [...guard.warnings] },
    weights: { min: isFinite(min) ? min : 0, max: isFinite(max) ? max : 0, mean, std, top },
  };
}
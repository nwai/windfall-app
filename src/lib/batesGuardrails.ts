import { BatesParameterSet, normalizeBatesParameters } from "./batesWeightsCore";

export interface GuardrailResult {
  warnings: string[];
  severity: "ok" | "caution" | "risk";
}

export function assessBatesGuardrails(p: BatesParameterSet): GuardrailResult {
  const params = normalizeBatesParameters(p);
  const warnings: string[] = [];

  if (params.betaHot + params.betaCold > 3.2) {
    warnings.push(`High combined betaHot + betaCold = ${(params.betaHot + params.betaCold).toFixed(2)} (can over-amplify volatility).`);
  }
  if (params.betaGlobal > 1.0) {
    warnings.push(`betaGlobal ${params.betaGlobal.toFixed(2)} is large (broad systemic tilt).`);
  }
  if (params.gammaConditional > 2.2) {
    warnings.push(`gammaConditional ${params.gammaConditional.toFixed(2)} very strong (may collapse diversity).`);
  }
  if (params.mixWeight < 0.15) {
    warnings.push(`mixWeight ${params.mixWeight.toFixed(2)} heavily favors Bates only.`);
  } else if (params.mixWeight > 0.85) {
    warnings.push(`mixWeight ${params.mixWeight.toFixed(2)} heavily favors Triangles only.`);
  }
  if (params.dualTri && Math.abs(params.triMode - params.triMode2) < 0.05) {
    warnings.push(`Dual Tri modes are very close (${params.triMode.toFixed(2)} vs ${params.triMode2.toFixed(2)}).`);
  }
  if (params.hotQuantile - params.coldQuantile < 0.25) {
    warnings.push(`Narrow hot/cold gap (hotQ - coldQ = ${(params.hotQuantile - params.coldQuantile).toFixed(2)}).`);
  }
  if (params.k > 9) {
    warnings.push(`k ${params.k.toFixed(2)} is high (central concentration).`);
  }

  let severity: GuardrailResult["severity"] = "ok";
  if (warnings.length >= 1) severity = "caution";
  if (warnings.length >= 3) severity = "risk";

  return { warnings, severity };
}

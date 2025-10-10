import { BatesParameterSet } from "./batesWeightsCore";

export interface GuardrailResult {
  warnings: string[];
  severity: "ok" | "caution" | "risk";
}

export function assessBatesGuardrails(p: BatesParameterSet): GuardrailResult {
  const warnings: string[] = [];

  if (p.betaHot + p.betaCold > 3.2) {
    warnings.push(`High combined βHot + βCold = ${(p.betaHot + p.betaCold).toFixed(2)} (can over-amplify volatility).`);
  }
  if (p.betaGlobal > 1.0) {
    warnings.push(`βGlobal ${p.betaGlobal.toFixed(2)} is large (broad systemic tilt).`);
  }
  if (p.gammaConditional > 2.2) {
    warnings.push(`γCond ${p.gammaConditional.toFixed(2)} very strong (may collapse diversity).`);
  }
  if (p.mixWeight < 0.15) {
    warnings.push(`mixWeight ${p.mixWeight.toFixed(2)} heavily favors Bates only.`);
  } else if (p.mixWeight > 0.85) {
    warnings.push(`mixWeight ${p.mixWeight.toFixed(2)} heavily favors Triangles only.`);
  }
  if (p.dualTri && Math.abs(p.triMode - p.triMode2) < 0.05) {
    warnings.push(`Dual Tri modes are very close (${p.triMode.toFixed(2)} vs ${p.triMode2.toFixed(2)}).`);
  }
  if (p.hotQuantile - p.coldQuantile < 0.25) {
    warnings.push(`Narrow hot/cold gap (hotQ - coldQ = ${(p.hotQuantile - p.coldQuantile).toFixed(2)}).`);
  }
  if (p.k > 9) {
    warnings.push(`k ${p.k.toFixed(2)} is high (central concentration).`);
  }

  let severity: GuardrailResult["severity"] = "ok";
  if (warnings.length >= 1) severity = "caution";
  if (warnings.length >= 3) severity = "risk";

  return { warnings, severity };
}
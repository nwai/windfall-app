import React, { useMemo } from "react";
import { HigButton, InfoHelp } from "./shared/HigControls";
import { terminalCompositionPreview } from "../lib/terminalCompositionPlanner";
import type { TerminalRunRuleOptions } from "../lib/terminalDigitRuns";
import type { TerminalShapeQuotaOptions } from "../lib/terminalShapeQuotas";
import type { GenerationPreflightIssue } from "../lib/generationPreflight";
import type { MonthlyBucketSets, MonthlyFrequencyConstraints } from "../lib/monthlyDrawSummary";
import "./TerminalCompositionPlanner.css";

export type TerminalPlanIntent = "history" | "alternatives" | "together";
export type TerminalPlanShapeMode = "any" | "independent" | "linked";
interface Props {
  runs: TerminalRunRuleOptions; shapes: TerminalShapeQuotaOptions; linked: boolean; bypassed: boolean;
  available: number[]; forced: number[]; selectedRatios: string[]; observedRatios: string[];
  monthly: { counts: MonthlyFrequencyConstraints; buckets: MonthlyBucketSets | null };
  blockers: GenerationPreflightIssue[];
  onEnabledChange: (enabled: boolean) => void;
  onIntentChange: (intent: TerminalPlanIntent) => void;
  onShapeModeChange: (mode: TerminalPlanShapeMode) => void;
  onRunsChange: (runs: string[]) => void;
  onRatiosChange: (ratios: string[]) => void;
}

export default function TerminalCompositionPlanner(props: Props) {
  const { runs, shapes, linked, available, forced, monthly, selectedRatios, observedRatios, bypassed } = props;
  const preview = useMemo(() => runs.enabled && runs.selectedRuns.length && !bypassed
    ? terminalCompositionPreview(runs, available, forced, monthly) : null, [runs, available, forced, monthly, bypassed]);
  const intent: TerminalPlanIntent = runs.mode === "requireAll" ? "together" : runs.allocationBasis === "equal" ? "alternatives" : "history";
  const shapeMode: TerminalPlanShapeMode = linked ? "linked" : shapes.enabled ? "independent" : "any";
  const compatibleObservedRatios = preview?.ratios.filter(ratio => observedRatios.includes(ratio)) ?? [];
  const incompatibleRatios = preview && !preview.error ? selectedRatios.filter(ratio => !preview.ratios.includes(ratio)) : [];
  const terminalIssues = props.blockers.filter(issue => ["terminalRuns", "terminalShapes", "ratios", "stageIdm"].includes(issue.target));
  const canMerge = intent === "together" && preview?.mergedRuns.length && preview.mergedRuns.every(run => runs.runOptions.some(row => row.run === run))
    && [...preview.mergedRuns].sort().join("|") !== [...new Set(runs.selectedRuns)].sort().join("|");
  return <section className="terminal-composition-planner" aria-labelledby="terminal-composition-plan-heading">
    <div className="terminal-composition-planner__heading">
      <h3 id="terminal-composition-plan-heading">Terminal Composition Plan</h3>
      <InfoHelp label="About the terminal composition plan">
        Follow history allocates selected runs by real WFMQYH counts. Test alternatives uses equal user-defined shares, including zero-observed runs. Require together puts every selected exact maximal run in every candidate. These are construction choices, not win probabilities.
        Shape matching uses either no shape quota, independent shape choices, or historical associations. Missing observations do not mean a structure is impossible; historical shares need evidence, while manual equal shares do not invent evidence.
        Preview checks exact run structure, number availability, forced inclusions and monthly bucket minimums. It is not a complete proof that all generator filters can be satisfied. Repair actions change only the named settings when pressed.
      </InfoHelp>
      <label><input type="checkbox" checked={runs.enabled} onChange={event => props.onEnabledChange(event.target.checked)} />Use terminal run rules</label>
    </div>
    <div className="terminal-composition-planner__controls">
      <label>Plan <select aria-label="Terminal composition plan" value={intent} disabled={!!runs.useAllObservedRuns} onChange={event => props.onIntentChange(event.target.value as TerminalPlanIntent)}>
        <option value="history">Follow history</option><option value="alternatives">Test alternatives</option><option value="together">Require together</option>
      </select></label>
      <label>Shapes <select aria-label="Terminal plan shapes" value={shapeMode} onChange={event => props.onShapeModeChange(event.target.value as TerminalPlanShapeMode)}>
        <option value="any">Any compatible shape</option><option value="independent">Choose independently</option><option value="linked">Historical associations</option>
      </select></label>
    </div>
    <p>{bypassed ? "Bypassed by RwR45 / PNUaRW45."
      : !runs.enabled ? "Run rules are off. Independent shape and odd/even settings remain separate."
      : intent === "history" ? "Selected runs receive their relative historical shares. A zero-observed run has no historical share."
      : intent === "alternatives" ? "Selected runs receive equal manual shares. Zero-observed rows keep their genuine zero history counts."
      : "Each candidate must contain every selected separate run. Overlapping or touching runs must be one maximal run."}</p>
    {preview && !preview.error && <div className="terminal-composition-planner__preview" role="status">
      <div><strong>Compatible shapes:</strong> {preview.shapes.join("; ") || "None under the checked rules"}</div>
      <div><strong>Compatible odd/even:</strong> {preview.ratios.join(", ") || "None under the checked rules"}</div>
      <small>Availability, forced inclusions and current monthly minimums checked. Other hard filters and integer quota shares can still conflict.</small>
    </div>}
    {!bypassed && runs.enabled && terminalIssues.length > 0 && <div className="terminal-composition-planner__attention" role="alert">
      <strong>Plan needs attention</strong>
      <ul>{[...new Set(terminalIssues.map(issue => issue.message))].map(message => <li key={message}>{message}</li>)}</ul>
    </div>}
    <div className="terminal-composition-planner__actions">
      {!!canMerge && <HigButton size="compact" onClick={() => props.onRunsChange(preview!.mergedRuns)}>Merge to {preview!.mergedRuns.join(" + ")}</HigButton>}
      {!!incompatibleRatios.length && compatibleObservedRatios.length > 0 && <HigButton size="compact" onClick={() => props.onRatiosChange(compatibleObservedRatios)}>
        Use compatible observed ratios: {compatibleObservedRatios.join(", ")}
      </HigButton>}
      {runs.enabled && linked && !!shapes.sourceError && <HigButton size="compact" onClick={() => props.onShapeModeChange("any")}>Use any compatible shape</HigButton>}
      {runs.enabled && intent === "history" && !!preview?.error && <HigButton size="compact" onClick={() => props.onIntentChange("alternatives")}>Use manual alternatives</HigButton>}
    </div>
  </section>;
}

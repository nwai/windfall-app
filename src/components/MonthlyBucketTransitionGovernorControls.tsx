import React from "react";
import {
  MONTHLY_TRANSITION_MANUAL_WEIGHTS,
  normalizeMonthlyBucketTransitionGovernorMode,
  type MonthlyBucketTransitionGovernorMode,
  type MonthlyBucketTransitionGovernorProfile,
} from "../lib/monthlyBucketTransitionGovernor";
import { HigField, InfoHelp } from "./shared/HigControls";
import "./MonthlyBucketTransitionGovernorControls.css";

interface Props {
  profile: MonthlyBucketTransitionGovernorProfile;
  onModeChange: (mode: MonthlyBucketTransitionGovernorMode) => void;
}

const percent = (value: number | null) => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;

export function MonthlyBucketTransitionGovernorControls({ profile, onModeChange }: Props) {
  const manual = profile.mode !== "off" && profile.mode !== "auto";
  return <section className="windfall-transition-governor" aria-label="Monthly Bucket Transition Governor">
    <div className="windfall-transition-governor__heading">
      <strong>Monthly Bucket Transition Governor</strong>
      <InfoHelp label="Monthly Bucket Transition Governor help">
        Auto requires at least three eligible earlier months, a per-number hit rate above random, and an at-least-one
        transition rate at least 4 percentage points or 12% relatively above random. These are experimental gates,
        not proof of predictive accuracy. Manual strengths bypass those gates, but keep the same stage rules:
        2x to 3x at D3-D5; first 3x to 4x at D7-D9 only if no 4x-or-higher bucket exists yet.
        All hard filters still apply. RwR45/PNUaRW45 bypasses this governor.
      </InfoHelp>
    </div>
    <div className="windfall-transition-governor__controls">
      <HigField label="Transition influence">
        <select value={profile.mode} onChange={(event) => onModeChange(normalizeMonthlyBucketTransitionGovernorMode(event.target.value))}>
          <option value="off">Off</option>
          <option value="auto">Auto evidence</option>
          {Object.entries(MONTHLY_TRANSITION_MANUAL_WEIGHTS).map(([mode, weight]) => (
            <option key={mode} value={mode}>Manual {mode} ({weight.toFixed(2)}x)</option>
          ))}
        </select>
      </HigField>
      <div role="status" className="windfall-transition-governor__status">
        <strong>{profile.summaryLabel}</strong>
        <span>{profile.mode === "off"
          ? "No monthly-transition weighting applied."
          : manual
            ? "User-set experiment. Auto evidence gate bypassed; stage eligibility and hard filters remain."
            : "Auto chooses strength only when the current stage passes its historical evidence gate."}</span>
      </div>
    </div>
    <p><strong>Planning context: {profile.contextLabel}</strong><br />Scope: {profile.scopeLabel}</p>
    {profile.userEnabled && !profile.checkedRules.length && <p>
      {profile.scopeLabel === "Unavailable" ? "Planning context is unavailable or invalid. No boost applied." : "No configured transition applies at this draw ordinal. No boost applied."}
    </p>}
    {profile.checkedRules.length > 0 && <div className="windfall-transition-governor__scroll" role="region" aria-label="Monthly transition rule evidence" tabIndex={0}>
      <table>
        <thead><tr><th>Stage rule / numbers</th><th>Earlier months</th><th>Auto gate</th><th>Applied weight</th></tr></thead>
        <tbody>{profile.checkedRules.map((rule) => <tr key={rule.rule}>
          <th scope="row">{rule.label}<span>{rule.sourceLabel} → {rule.targetLabel}: {rule.currentNumbers.join(", ") || "none"}</span></th>
          <td>{rule.evidence.trials} trials<span>At least one: {percent(rule.evidence.atLeastOneRate)} vs random {percent(rule.evidence.expectedRandomAtLeastOneRate)}</span><span>Per number: {percent(rule.evidence.perNumberRate)} vs random {percent(rule.evidence.expectedRandomPerNumberRate)}</span></td>
          <td>{rule.evidenceGatePassed ? "Passed" : "Not passed"}{manual && <span>Bypassed by user</span>}</td>
          <td><strong>{rule.multiplier.toFixed(2)}x</strong><span>{rule.active ? rule.strength : "Neutral"}</span></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {profile.checkedRules.map((rule) => <details key={rule.rule}>
      <summary>{rule.label}: {rule.active ? "why this weight applies" : "why no boost applies"}</summary>
      <p>{rule.reason}</p>
    </details>)}
    {profile.numberDetails.length > 0 && <p className="windfall-transition-governor__ledger"><strong>Transition multiplier ledger:</strong>{" "}
      {profile.numberDetails.map((detail) => `${detail.number} (${detail.bucketLabel}) ×${detail.multiplier.toFixed(2)}`).join(" · ")}
    </p>}
  </section>;
}

import React from "react";
import {
  monthlyBucketTransitionGovernorModeLabel,
  type MonthlyBucketTransitionGovernorProfile,
} from "../lib/monthlyBucketTransitionGovernor";
import { HigButton } from "./shared/HigControls";
import "./MonthlyTransitionInfluenceSummary.css";

interface MonthlyTransitionInfluenceSummaryProps {
  profile?: MonthlyBucketTransitionGovernorProfile | null;
  bypassedByRandomCoverage?: boolean;
  referenceOnly?: boolean;
  onEdit?: () => void;
}

export function MonthlyTransitionInfluenceSummary({
  profile,
  bypassedByRandomCoverage = false,
  referenceOnly = false,
  onEdit,
}: MonthlyTransitionInfluenceSummaryProps) {
  if (!profile?.userEnabled) return null;

  const applying = profile.active && !bypassedByRandomCoverage;
  const effect = bypassedByRandomCoverage
    ? "Bypassed by RwR45/PNUaRW45"
    : profile.active
      ? `${profile.internalStrength} · ${profile.boostedNumbers.length} numbers weighted`
      : "No boost applied";

  return (
    <section className="monthly-transition-mirror" aria-label="Shared Monthly Bucket Transition Governor setting">
      <div className="monthly-transition-mirror__heading">
        <strong>Monthly transition influence</strong>
        {onEdit && <HigButton variant="secondary" size="compact" onClick={onEdit}
          aria-label="Edit Monthly Bucket Transition Governor">Edit</HigButton>}
      </div>
      <div className="monthly-transition-mirror__state" data-mode={profile.mode} data-applying={applying}>
        <span><strong>Selected:</strong> {monthlyBucketTransitionGovernorModeLabel(profile.mode)}</span>
        <span><strong>Main generator:</strong> {effect}</span>
      </div>
      <p>{profile.contextLabel}</p>
      <p>{referenceOnly ? "Not applied to this panel's calculations. " : ""}Soft sampling only; recorded bucket counts, Acceptance Needs and IDM targets are unchanged.</p>
      <details>
        <summary>
          <span className="windfall-section__disclosure-button" aria-hidden="true">
            <span className="windfall-section__disclosure-icon">▸</span>
          </span>
          Monthly transition details
        </summary>
        <p><strong>Baseline scope:</strong> {profile.scopeLabel}</p>
        {applying ? (
          <ul aria-label="Monthly transition sampling multipliers">
            {profile.numberDetails.map((detail) => <li key={detail.number}>
              <strong>{detail.number}</strong> ({detail.bucketLabel}) ×{detail.multiplier.toFixed(2)}
            </li>)}
          </ul>
        ) : <p>No monthly-transition multipliers are applied in the main generator.</p>}
        {profile.checkedRules.map((rule) => <p key={rule.rule}>
          <strong>{rule.label}:</strong> {rule.reason}
        </p>)}
        {!profile.checkedRules.length && <p>
          {profile.scopeLabel === "Unavailable"
            ? "Planning context is unavailable or invalid."
            : "No configured transition applies at this draw ordinal."}
        </p>}
        <p>Hard filters and exclusions still apply. This is experimental weighting, not a calibrated draw probability.</p>
      </details>
    </section>
  );
}

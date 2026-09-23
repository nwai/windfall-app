import React from "react";

import type {
  MonthlyBucketTransitionGovernorProfile,
  MonthlyBucketTransitionGovernorRuleSummary,
} from "../../lib/monthlyBucketTransitionGovernor";
import { HigButton } from "../shared/HigControls";
import "./TransitionWatchCard.css";

interface TransitionWatchCardProps {
  evidenceProfile: MonthlyBucketTransitionGovernorProfile;
  influenceProfile: MonthlyBucketTransitionGovernorProfile;
  targetDrawOrdinal: number;
  bypassedByRandomCoverage?: boolean;
  onReviewEvidence?: () => void;
}
const formatPercent = (value: number | null): string => (
  value === null || !Number.isFinite(value) ? "n/a" : `${(value * 100).toFixed(1)}%`
);

const capitalize = (value: string): string => (
  value.length ? `${value[0].toUpperCase()}${value.slice(1)}` : value
);

const watchRule = (
  profile: MonthlyBucketTransitionGovernorProfile,
): MonthlyBucketTransitionGovernorRuleSummary | null => (
  profile.activeRules.find((rule) => rule.evidenceGatePassed && rule.currentNumbers.length > 0) ?? null
);

const transitionConditionLabel = (rule: MonthlyBucketTransitionGovernorRuleSummary): string => (
  rule.rule === "three-to-four"
    ? "No 4x-or-higher number has appeared"
    : `${rule.sourceLabel} numbers can form the next ${rule.targetLabel} bucket`
);

const influenceLabel = (
  evidenceRule: MonthlyBucketTransitionGovernorRuleSummary,
  profile: MonthlyBucketTransitionGovernorProfile,
  bypassedByRandomCoverage: boolean,
): string => {
  if (bypassedByRandomCoverage) return "Bypassed by RwR45 random coverage";
  if (profile.mode === "off") return "Off · advisory only";

  const appliedRule = profile.activeRules.find((rule) => rule.rule === evidenceRule.rule);
  if (!appliedRule) return `${profile.mode === "auto" ? "Auto" : `Manual ${profile.mode}`} · no weight applied`;

  const modeLabel = profile.mode === "auto" ? "Auto" : `Manual ${profile.mode}`;
  return `${modeLabel} ${capitalize(appliedRule.strength)} ×${appliedRule.multiplier.toFixed(2)}`;
};

export function TransitionWatchCard({
  evidenceProfile,
  influenceProfile,
  targetDrawOrdinal,
  bypassedByRandomCoverage = false,
  onReviewEvidence,
}: TransitionWatchCardProps) {
  const rule = watchRule(evidenceProfile);
  if (!rule) return null;

  const thinSample = rule.evidence.trials < 12;
  const evidenceLabel = `${capitalize(rule.strength)} evidence`;
  const appliedInfluence = influenceLabel(rule, influenceProfile, bypassedByRandomCoverage);

  return (
    <section className="windfall-transition-watch" aria-label="Monthly bucket transition watch">
      <div className="windfall-transition-watch__heading">
        <div>
          <span className="windfall-transition-watch__eyebrow">Transition Watch</span>
          <h3>D{targetDrawOrdinal} · {rule.sourceLabel} → {rule.targetLabel}</h3>
        </div>
        <span className="windfall-transition-watch__evidence">{evidenceLabel}</span>
      </div>

      <p className="windfall-transition-watch__condition">{transitionConditionLabel(rule)}</p>
      <div className="windfall-transition-watch__numbers" aria-label={`${rule.sourceLabel} transition candidates`}>
        <strong>{rule.sourceLabel} candidates</strong>
        <span className="windfall-transition-watch__number-list">
          {rule.currentNumbers.map((number) => <span key={number}>{number}</span>)}
        </span>
      </div>

      <p className="windfall-transition-watch__summary">
        <strong>{rule.evidence.atLeastOneHits}/{rule.evidence.trials}</strong> eligible comparable months produced at least one transition at D{targetDrawOrdinal}
        {` (${formatPercent(rule.evidence.atLeastOneRate)})`}; random baseline {formatPercent(rule.evidence.expectedRandomAtLeastOneRate)}.
        {thinSample ? " Thin sample." : ""}
      </p>

      <div className="windfall-transition-watch__footer">
        <span><strong>Generation influence:</strong> {appliedInfluence}</span>
        {onReviewEvidence ? (
          <HigButton variant="secondary" size="compact" onClick={onReviewEvidence}>
            Review evidence
          </HigButton>
        ) : null}
      </div>

      <details>
        <summary>Evidence details</summary>
        <dl>
          <div><dt>Planning context</dt><dd>{evidenceProfile.contextLabel}</dd></div>
          <div><dt>Baseline scope</dt><dd>{evidenceProfile.scopeLabel}</dd></div>
          <div><dt>At least one</dt><dd>{formatPercent(rule.evidence.atLeastOneRate)} observed · {formatPercent(rule.evidence.expectedRandomAtLeastOneRate)} random</dd></div>
          <div><dt>Per number</dt><dd>{formatPercent(rule.evidence.perNumberRate)} observed · {formatPercent(rule.evidence.expectedRandomPerNumberRate)} random</dd></div>
        </dl>
        <p>
          Uses only eligible completed earlier months and the bucket state available before the target draw.
          The random comparison accounts for the number of available source-bucket numbers. This is experimental
          stage evidence, not a calibrated forecast or forced inclusion.
        </p>
      </details>
    </section>
  );
}

import React from "react";
import { HigButton, InfoHelp } from "./shared/HigControls";
import type { ForcedRemoval, GenerationPreflight, GenerationPreflightTarget } from "../lib/generationPreflight";
import "./GenerationOutputAudit.css";

interface Props {
  result: GenerationPreflight;
  removals?: readonly ForcedRemoval[];
  onDismissRemovals?: () => void;
  onReview: (target: GenerationPreflightTarget) => void;
}

export default function GenerationConflictSummary({ result, removals = [], onDismissRemovals, onReview }: Props) {
  const blocked = result.blockers.length > 0;
  return <section className="generation-output-audit" data-blocked={blocked} aria-label="Pre-generation conflict summary">
    <div className="generation-output-audit__heading">
      <strong>Pre-generation conflict summary</strong>
      <span>{blocked ? `Needs attention (${result.blockers.length})` : "No known conflict detected"}</span>
      <InfoHelp label="About pre-generation conflict checks">
        Checks use your current rules and available numbers, not simulated results. Known contradictions stop generation; no settings are relaxed or silently substituted. These are necessary-condition and terminal-allocation checks, not a complete proof that every filter can be satisfied. Distance, readiness, geometry and other runtime filters can still cause shortfalls. RwR45 is checked only against rules it actually applies.
      </InfoHelp>
    </div>
    <div>{result.mode === "rwr45" ? "RwR45 random coverage" : "Standard generation"} · {result.eligibleCount} eligible numbers · {result.forcedNumbers.length} forced</div>
    {blocked && <ul className="generation-output-audit__issues" role="alert">
      {result.blockers.map((issue, index) => <li key={`${issue.target}-${index}`}>
        <span>{issue.message}</span>
        <HigButton size="compact" variant="quiet" onClick={() => onReview(issue.target)}>Review rule</HigButton>
      </li>)}
    </ul>}
    {result.notices.length > 0 && <details><summary>Mode details</summary>{result.notices.map((notice) => <p key={notice}>{notice}</p>)}</details>}
    {!blocked && <small>Other filters may still cause fewer candidates or none.</small>}
    {removals.length > 0 && <div className="generation-output-audit__removals" role="status">
      <strong>Exclusions removed forced inclusions</strong>
      <ul>{removals.map((row) => <li key={row.number}><b>{row.number}</b> from {row.inclusionSources.join(", ")} · excluded by {row.exclusionSources.join(", ")}</li>)}</ul>
      <div className="generation-output-audit__actions">
        <HigButton size="compact" onClick={() => onReview("forcedExcluded")}>Review sources</HigButton>
        {onDismissRemovals && <HigButton size="compact" variant="quiet" onClick={onDismissRemovals}>Dismiss notice</HigButton>}
      </div>
    </div>}
  </section>;
}

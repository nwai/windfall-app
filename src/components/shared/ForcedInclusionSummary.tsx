import React from "react";
import { HigButton } from "./HigControls";

export interface ForcedInclusionSource {
  label: string;
  numbers: readonly number[];
}

export const ForcedInclusionSummary: React.FC<{
  numbers: readonly number[];
  sources?: readonly ForcedInclusionSource[];
  onReview?: () => void;
  compact?: boolean;
}> = ({ numbers, sources = [], onReview, compact = false }) => {
  if (numbers.length === 0) return null;
  return <div role="note" data-testid="forced-inclusion-summary"
    style={{ fontSize: compact ? 10 : 12, lineHeight: 1.4, marginTop: 6, maxWidth: compact ? 118 : undefined }}>
    <strong>F · Forced inclusions:</strong> {numbers.join(", ")}
    {!compact && <>
      {sources.filter((source) => source.numbers.length > 0).map((source) => (
        <div key={source.label}>{source.label}: {source.numbers.join(", ")}</div>
      ))}
      <div>Separate from user-selected numbers; no selected-number boost or simulation selection is added.</div>
    </>}
    {onReview && <HigButton size="compact" variant="quiet" onClick={onReview}>Review forced inclusions</HigButton>}
  </div>;
};

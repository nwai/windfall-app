import React from "react";
import { HigField } from "./shared/HigControls";
import { PREDICTION_JOURNAL_SELECTION_REASON_LABELS, type PredictionJournalSelectionReason } from "../lib/predictionSelectionReasons";

export const PredictionSelectionReasonOptions: React.FC<{
  value: PredictionJournalSelectionReason[];
  onChange: (value: PredictionJournalSelectionReason[]) => void;
  label?: string;
}> = ({ value, onChange, label = "Selection reasons" }) => {
  const other = value.find(reason => reason.key === "other");
  return <div role="group" aria-label={label}>
    <div className="windfall-prediction-journal-reason-options">
      {Object.entries(PREDICTION_JOURNAL_SELECTION_REASON_LABELS).map(([key, text]) => <label key={key}
        style={{ display: "flex", alignItems: "flex-start", gap: 8, minHeight: "var(--prediction-reason-target, 32px)", fontSize: 12, fontWeight: 750, lineHeight: 1.4, cursor: "pointer" }}>
        <input type="checkbox" value={key} checked={value.some(reason => reason.key === key)}
          onChange={event => onChange(event.target.checked
            ? [...value, { version: 1, key: key as PredictionJournalSelectionReason["key"], label: text }]
            : value.filter(reason => reason.key !== key))} />
        <span>{text}</span>
      </label>)}
    </div>
    {other ? <HigField label="Other reason">
      <input value={other.detail ?? ""} onChange={event => onChange(value.map(reason => reason.key === "other" ? { ...reason, detail: event.target.value } : reason))}
        placeholder="Describe the reason briefly" />
    </HigField> : null}
  </div>;
};

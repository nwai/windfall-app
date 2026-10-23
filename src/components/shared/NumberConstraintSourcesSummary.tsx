import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  clearNumberConstraintSources, summarizeNumberConstraintSources,
  type ClearedNumberConstraintSource, type NumberConstraintKind, type NumberConstraintSource,
} from "../../lib/numberConstraintSources";
import { HigButton, InfoHelp } from "./HigControls";
import "./NumberConstraintSourcesSummary.css";

export interface NumberConstraintSourcesSummaryProps {
  inclusionSources: readonly NumberConstraintSource[];
  exclusionSources: readonly NumberConstraintSource[];
  busy?: boolean;
  defaultExpanded?: boolean;
  onCleared?: (kind: NumberConstraintKind, report: ClearedNumberConstraintSource[]) => void;
}

export function NumberConstraintSourcesSummary({ inclusionSources, exclusionSources, busy = false,
  defaultExpanded = false, onCleared }: NumberConstraintSourcesSummaryProps) {
  const [expanded, setExpanded] = useState({ inclusions: defaultExpanded, exclusions: defaultExpanded });
  const [pending, setPending] = useState<{ kind: NumberConstraintKind; sourceId?: string } | null>(null);
  const id = useId();
  const groups = { inclusions: summarizeNumberConstraintSources(inclusionSources), exclusions: summarizeNumberConstraintSources(exclusionSources) };
  if (!groups.inclusions.active.length && !groups.exclusions.active.length) return null;
  const pendingSources = pending ? groups[pending.kind].active.filter(source => !pending.sourceId || source.id === pending.sourceId) : [];
  const pendingNumbers = summarizeNumberConstraintSources(pendingSources).numbers;
  const pendingLabel = pending?.sourceId ? pendingSources[0]?.label ?? "Inactive source" : `all forced ${pending?.kind ?? "inclusions"}`;
  const confirmClear = () => {
    if (!pending || busy || !pendingSources.length) return;
    const report = clearNumberConstraintSources(pendingSources);
    onCleared?.(pending.kind, report);
    setPending(null);
  };

  return <div className="windfall-number-constraint-sources" aria-label="Forced number sources">
    {(["inclusions", "exclusions"] as const).map(kind => {
      const group = groups[kind];
      const singular = kind === "inclusions" ? "inclusion" : "exclusion";
      return <fieldset key={kind} className="windfall-number-constraint-sources__group">
        <legend>Forced {kind} · {group.numbers.length}</legend>
        <div className="windfall-number-constraint-sources__numbers">{group.numbers.length ? group.numbers.join(", ") : "No numbers currently"}</div>
        {group.active.some(source => source.scope === "generation-only") ? <p className="windfall-number-constraint-sources__note">
          Shared list: {group.sharedNumbers.length}; additional generation-only numbers: {group.generationOnlyExtra.length}.
        </p> : null}
        <div className="windfall-number-constraint-sources__actions">
          <HigButton size="compact" variant="quiet" disabled={!group.active.length} aria-expanded={expanded[kind]}
            aria-controls={`${id}-${kind}`} onClick={() => setExpanded(current => ({ ...current, [kind]: !current[kind] }))}>
            <span className="windfall-section__disclosure-icon" aria-hidden="true">{expanded[kind] ? "▾" : "▸"}</span> {expanded[kind] ? "Hide" : "Show"} {singular} sources ({group.active.length})
          </HigButton>
          <HigButton size="compact" disabled={busy || !group.active.length} onClick={() => setPending({ kind })}>Clear all {kind}</HigButton>
        </div>
        {expanded[kind] ? <div id={`${id}-${kind}`} className="windfall-number-constraint-sources__list" role="region" aria-label={`Active forced ${kind} sources`} tabIndex={0}>
          {group.active.map(source => <div key={source.id} className="windfall-number-constraint-sources__source">
            <div className="windfall-number-constraint-sources__source-heading"><strong>{source.label}</strong>
              <HigButton size="compact" variant="quiet" disabled={busy} onClick={() => setPending({ kind, sourceId: source.id })}
                aria-label={`Clear ${kind} from ${source.label}`}>Clear source</HigButton>
            </div>
            {source.scope === "generation-only" ? <span className="windfall-number-constraint-sources__note">Generation-only · </span> : null}
            {source.onRemoveNumber ? <div className="windfall-number-constraint-sources__remove-numbers">
              {source.numbers.map(number => <HigButton key={number} size="compact" variant="quiet" disabled={busy}
                aria-label={`Remove forced inclusion ${number} from ${source.label}`} onClick={() => source.onRemoveNumber?.(number)}>Remove {number}</HigButton>)}
            </div> : <span>{source.numbers.length ? source.numbers.join(", ") : "On · no numbers currently"}</span>}
            {source.detail ? <p className="windfall-number-constraint-sources__note">{source.detail}</p> : null}
          </div>)}
        </div> : null}
      </fieldset>;
    })}
    <div className="windfall-number-constraint-sources__footer">
      {busy ? <span role="status">Clearing is unavailable while generation is running.</span> : <span>Clear actions affect the listed sources only.</span>}
      <InfoHelp label="About forced number sources">
        Counts are unique numbers, not source counts. A number can belong to several sources; clearing one does not release another source's claim.
        SDE1, HC3 and other automatic exclusion rules must be turned off at their source to stop rebuilding lists.
        MiAN hard exclusions are generation-only and are included here separately from the shared exclusion list used by number strips.
        Ordinary user selections, unlisted quotas and weighting, saved candidates, history, journal entries and presets are not cleared.
        Clearing ending-digit derived exclusions switches off the At most caps named in the confirmation; it keeps their stored counts and boosts.
        Clearing exclusions does not restore selections that an earlier exclusion already removed. Other hard filters can still reject candidates.
      </InfoHelp>
    </div>
    {pending && typeof document !== "undefined" ? createPortal(<ClearSourcesDialog title={`Clear ${pendingLabel}?`}
      onCancel={() => setPending(null)} onConfirm={confirmClear} confirmDisabled={busy || !pendingSources.length}
      confirmLabel={pending.sourceId ? "Clear source" : `Clear all ${pending.kind}`}>
      <p>{pendingNumbers.length} unique {pending.kind === "inclusions" ? "included" : "excluded"} numbers: {pendingNumbers.join(", ") || "none"}.</p>
      <ul>{pendingSources.map(source => <li key={source.id}><strong>{source.label}:</strong> {source.clearImpact}</li>)}</ul>
      <p>Ordinary user selections, other candidate filters and weights, saved candidates, history, journal entries and presets stay unchanged.</p>
      <p>{pending.kind === "inclusions" ? "Removing a forced inclusion does not remove the same number from an ordinary user selection." : "Previously removed selections are not restored. Exclusions still claimed by another source remain excluded."}</p>
      {!pendingSources.length ? <p role="status">This source is no longer active.</p> : null}
    </ClearSourcesDialog>, document.body) : null}
  </div>;
}

function ClearSourcesDialog({ title, children, onCancel, onConfirm, confirmDisabled, confirmLabel }: {
  title: string; children: React.ReactNode; onCancel: () => void; onConfirm: () => void; confirmDisabled: boolean; confirmLabel: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => { if (dialog.open && typeof dialog.close === "function") dialog.close(); };
  }, []);
  return <dialog ref={ref} className="windfall-number-constraint-dialog" aria-labelledby={titleId} aria-modal="true"
    onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h3 id={titleId}>{title}</h3>
    {children}
    <div className="windfall-number-constraint-dialog__actions">
      <HigButton autoFocus onClick={onCancel}>Cancel</HigButton>
      <HigButton variant="danger" disabled={confirmDisabled} onClick={onConfirm}>{confirmLabel}</HigButton>
    </div>
  </dialog>;
}

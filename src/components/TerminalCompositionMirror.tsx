import React from "react";
import type { GeneratedCompositionSnapshot } from "../lib/generatedComposition";
import { HigButton, InfoHelp } from "./shared/HigControls";
import { buildTerminalShapeQuotas, terminalShapeSelectionError, terminalShapeShares, type TerminalShapeQuotaOptions } from "../lib/terminalShapeQuotas";
import { buildTerminalRunQuotas, terminalRunSelectionError, terminalRunShares, type TerminalRunRuleOptions } from "../lib/terminalDigitRuns";
import "./TerminalCompositionMirror.css";

interface Props {
  shapes: TerminalShapeQuotaOptions;
  runs: TerminalRunRuleOptions;
  requested: number;
  bypassed: boolean;
  linked: boolean;
  outputSnapshot?: GeneratedCompositionSnapshot | null;
  onEdit: (section: "terminalShapes" | "terminalRuns") => void;
}

export default function TerminalCompositionMirror({ shapes, runs, requested, bypassed, linked, onEdit, outputSnapshot }: Props) {
  const shapeError = shapes.enabled ? terminalShapeSelectionError(shapes) : null;
  const runError = terminalRunSelectionError(runs);
  const shapeShares = shapes.enabled && !bypassed ? terminalShapeShares(shapes) : {};
  const runShares = !bypassed ? terminalRunShares(runs) : {};
  const shapeTargets = !bypassed ? buildTerminalShapeQuotas(requested, shapes) : {};
  const runTargets = !bypassed ? buildTerminalRunQuotas(requested, runs) : {};
  const status = (enabled: boolean, error: string | null) => !enabled ? "Off" : bypassed ? "Bypassed by RwR45" : error ? "Needs attention" : "On";
  const groups = [
    {
      key: "terminalShapes" as const, title: "Terminal Repetition Shapes", enabled: shapes.enabled,
      selected: [...new Set(shapes.selectedShapes)], error: shapeError, shares: shapeShares, targets: shapeTargets,
      mode: linked ? "Linked to selected runs" : `Independent shapes · ${shapes.allocationBasis === "equal" ? "equal manual shares" : "WFMQYH count shares"}`, requireAll: false,
    },
    {
      key: "terminalRuns" as const, title: "Terminal Run Quotas", enabled: runs.enabled,
      selected: [...new Set(runs.selectedRuns)], error: runError, shares: runShares, targets: runTargets,
      mode: runs.mode === "requireAll" ? "Require all selected runs" : `Allocate across selected runs \u00b7 ${runs.allocationBasis === "equal" ? "equal user shares" : "WFMQYH count shares"}`,
      requireAll: runs.mode === "requireAll",
    },
  ];
  return <section className="terminal-composition-mirror" aria-label="Shared terminal composition selections">
    <div className="terminal-composition-mirror__heading">
      <h4>Draw Composition Quotas</h4>
      <InfoHelp label="About mirrored terminal composition selections">
        These are the same selections used by Draw Composition Quotas and the main generator, not a second set of settings. Changing a selection, the link, a preset, or WFMQYH updates this view. Shares and targets use the same allocation calculations; other filters can still cause a shortfall.
        Ending Digit Limits, repeated-family rules and boosts remain independent. A repetition shape does not name particular digits. Allocate mode treats selected runs as alternatives; Require all requires every selected exact run. Mirroring never silently enables a separate rule or boost. Retained choices are shown when their rule is Off; invalid evidence is identified rather than replaced. RwR45/PNUaRW45 bypasses both quotas.
      </InfoHelp>
    </div>
    <div className="terminal-composition-mirror__groups">
      {groups.map((group) => <section key={group.key} aria-label={`Mirrored ${group.title}`}>
        <div className="terminal-composition-mirror__group-heading">
          <strong>{group.title}</strong>
          <span data-state={!group.enabled ? "off" : bypassed ? "bypassed" : group.error ? "invalid" : "on"}>{status(group.enabled, group.error)}</span>
          <HigButton size="compact" variant="quiet" onClick={() => onEdit(group.key)} aria-label={`Edit ${group.title}`}>Edit</HigButton>
        </div>
        <p className="terminal-composition-mirror__mode">{group.mode}{group.key === "terminalRuns" && runs.useAllObservedRuns ? " \u00b7 all observed runs" : ""}</p>
        {group.selected.length ? <ul className="terminal-composition-mirror__values" aria-label={`Selected ${group.title}`} tabIndex={0}>
          {group.selected.map((value) => <li key={value}>
            <code>{value}</code>
            {group.enabled && !bypassed && !group.error ? <small>{group.requireAll ? "Every candidate" : `${group.shares[value].toFixed(1)}% \u00b7 target ${group.targets[value]}/${requested}`}</small> : null}
          </li>)}
        </ul> : <p className="terminal-composition-mirror__empty">None selected</p>}
        {group.error && !bypassed ? <p className="terminal-composition-mirror__error" role="alert">{group.error}</p> : null}
        {!group.enabled && group.selected.length ? <p className="terminal-composition-mirror__mode">Choices retained; not applied to generation.</p> : null}
        {outputSnapshot && <div className="terminal-composition-mirror__mode">
          <strong>Last RwR45 observed output:</strong>{" "}
          {Object.entries(group.key === "terminalShapes" ? outputSnapshot.shapeCounts : outputSnapshot.runCounts).map(([value, count]) => `${value}: ${count}/${outputSnapshot.rows.length} rows`).join("; ") || "None"}.
          <div>{outputSnapshot.context}. Settings unchanged; separate run counts can overlap.</div>
        </div>}
      </section>)}
    </div>
  </section>;
}

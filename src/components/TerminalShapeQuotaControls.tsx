import React from "react";
import type { GeneratedCompositionSnapshot } from "../lib/generatedComposition";
import { HigButton, InfoHelp } from "./shared/HigControls";
import { buildTerminalShapeQuotas, terminalShapeSelectionError, terminalShapeShares, type TerminalShapeQuotaOptions } from "../lib/terminalShapeQuotas";
import "./TerminalShapeQuotaControls.css";

interface Props {
  options: TerminalShapeQuotaOptions;
  requested: number;
  bypassed: boolean;
  outputSnapshot?: GeneratedCompositionSnapshot | null;
  onEnabledChange: (enabled: boolean) => void;
  onSelectionChange: (shapes: string[]) => void;
  onAllocationBasisChange?: (basis: "history" | "equal") => void;
  linkedEvidence?: { sourceDraws: number; matchingDraws: number };
}

export default function TerminalShapeQuotaControls({ options, requested, bypassed, onEnabledChange, onSelectionChange, onAllocationBasisChange, linkedEvidence, outputSnapshot }: Props) {
  const observed = options.shapeOptions.filter((item) => item.count > 0).map((item) => item.shape);
  const sourceDraws = options.shapeOptions.reduce((sum, item) => sum + item.count, 0);
  const quotas = buildTerminalShapeQuotas(requested, options), shares = terminalShapeShares(options);
  const error = options.enabled ? terminalShapeSelectionError(options) : null;
  const rows = [...options.shapeOptions].sort((a, b) => b.count - a.count);
  const toggle = (shape: string) => onSelectionChange(options.selectedShapes.includes(shape)
    ? options.selectedShapes.filter((item) => item !== shape) : [...options.selectedShapes, shape]);
  return <section id="windfall-terminal-shape-quotas" className="terminal-shape-quotas" aria-labelledby="terminal-shape-quota-heading" tabIndex={-1}>
    <div className="terminal-shape-quotas__heading">
      <h3 id="terminal-shape-quota-heading">Terminal Repetition Shapes</h3>
      <InfoHelp label="About terminal repetition shapes">
        <span>A shape counts how often each terminal digit appears across all six mains and two supplementary numbers.</span>
        <span className="terminal-shape-quotas__help-example">
          <strong>Example: 2+2+1+1+1+1</strong><br />
          Numbers: <strong>2, 12, 7, 17, 21, 33, 34, 40</strong>.<br />
          2 and 12 both end in 2; 7 and 17 both end in 7. These make the two 2s in the shape.<br />
          21, 33, 34 and 40 end in 1, 3, 4 and 0, each appearing once. These make the four 1s.<br />
          Example only, not a recorded draw.
        </span>
        <span>The shape does not specify which digits to use or require consecutive numbers. Selected observed shapes share 100% of candidates using real WFMQYH counts, not winning probabilities.</span>
        <span>When linked to exact runs, the counts and shares use only matching real draws. Allocate mode matches any selected run; Require all matches every selected run. Each draw is counted once. Unlink in Terminal Run Quotas to restore your independent shape settings.</span>
      </InfoHelp>
    </div>
    <div className="terminal-shape-quotas__toolbar">
      <label className="terminal-shape-quotas__toggle"><input type="checkbox" checked={options.enabled}
        disabled={!!linkedEvidence}
        onChange={(event) => onEnabledChange(event.target.checked)} />Use terminal shape quotas</label>
      <HigButton size="compact" disabled={!!linkedEvidence || !observed.length || (observed.length === options.selectedShapes.length && observed.every((shape) => options.selectedShapes.includes(shape)))}
        onClick={() => onSelectionChange(observed)}>Select all observed</HigButton>
      <HigButton size="compact" disabled={!!linkedEvidence || !options.selectedShapes.length} onClick={() => onSelectionChange([])}>Clear</HigButton>
      {onAllocationBasisChange && !linkedEvidence && <label>Shape shares <select aria-label="Terminal shape allocation shares" value={options.allocationBasis ?? "history"}
        onChange={event => onAllocationBasisChange(event.target.value as "history" | "equal")}>
        <option value="history">WFMQYH counts</option><option value="equal">Equal manual shares</option>
      </select></label>}
    </div>
    <div className="terminal-shape-quotas__scope">{linkedEvidence
      ? `Linked to selected runs · ${observed.length} shapes observed across ${linkedEvidence.matchingDraws} matching draws (${linkedEvidence.sourceDraws} valid real WFMQYH draws inspected). Turn off linking in Terminal Run Quotas to edit shapes independently.`
      : `${sourceDraws} valid eight-number real WFMQYH draws · ${observed.length}/18 shapes observed`}</div>
    <div className="terminal-shape-quotas__scroll" tabIndex={0} role="region" aria-label="Terminal repetition shape quotas">
      <table>
        <thead><tr><th scope="col">Use</th><th scope="col">Shape</th><th scope="col">Draws</th><th scope="col">Source %</th><th scope="col">Active %</th><th scope="col">Target</th>{outputSnapshot && <th scope="col">Last RwR45 rows</th>}</tr></thead>
        <tbody>{rows.map((item) => <tr key={item.shape} data-selected={options.selectedShapes.includes(item.shape)}>
          <td><label className="terminal-shape-quotas__selection"><input type="checkbox" aria-label={`${item.shape} terminal shape`}
            checked={options.selectedShapes.includes(item.shape)} disabled={!!linkedEvidence || (options.allocationBasis !== "equal" && !item.count && !options.selectedShapes.includes(item.shape))}
            onChange={() => toggle(item.shape)} /></label></td>
          <th scope="row">{item.shape}{!item.count && <small>Not observed</small>}</th>
          <td>{item.count}</td><td>{item.percent.toFixed(1)}%</td>
          <td>{!bypassed && options.enabled && item.shape in shares ? `${shares[item.shape].toFixed(1)}%` : "—"}</td>
          <td>{!bypassed && options.enabled && item.shape in quotas ? `${quotas[item.shape]}/${requested}` : "—"}</td>
          {outputSnapshot && <td>{outputSnapshot.rows.length ? `${outputSnapshot.shapeCounts[item.shape] ?? 0}/${outputSnapshot.rows.length}` : "—"}</td>}
        </tr>)}</tbody>
      </table>
    </div>
    {outputSnapshot && <div className="terminal-shape-quotas__scope">Last RwR45 rows have each shape. {outputSnapshot.context}. Observed output only; selections unchanged.</div>}
    <div className="terminal-shape-quotas__status" aria-live="polite">
      {bypassed ? "RwR45 / PNUaRW45 bypasses terminal shape quotas."
        : error ? <span role="alert">{error}. {linkedEvidence
          ? "Turn off Link shapes to selected runs, or choose Edit shapes independently in Terminal Run Quotas, to use your own observed shape selections."
          : "Select observed shapes, or choose Equal manual shares to test unobserved shapes without inventing evidence."}</span>
        : options.enabled ? "ON · Selected shapes rebalance to 100%. Odd/even and terminal quotas are allocated jointly; shortfalls are reported, never relaxed."
        : "OFF · No terminal shape quota affects generation."}
    </div>
    {options.allocationBasis === "equal" && <div className="terminal-shape-quotas__scope">Equal manual shape shares are a testing plan, not historical support. Draws and Source % remain measured history.</div>}
  </section>;
}

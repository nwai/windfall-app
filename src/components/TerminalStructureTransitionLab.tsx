import React, { useMemo, useState } from "react";

import type { Draw } from "../types";
import {
  analyzeTerminalStructureTransitions,
  type TerminalFamilyCurrentStatus,
  type TerminalSequenceMotifLength,
  type TerminalSequenceMovementKind,
  type TerminalStructureHistoryScope,
  type TerminalStructureRate,
} from "../lib/terminalStructureTransitions";
import { HigButton, HigField, InfoHelp } from "./shared/HigControls";
import "./TerminalStructureTransitionLab.css";

interface TerminalStructureTransitionLabProps {
  draws: Draw[];
  allDraws?: Draw[];
  includeSupp: boolean;
}

type LabView = "families" | "motifs" | "movement";

const percent = (value: number | null): string => (
  value === null ? "n/a" : `${(value * 100).toFixed(1)}%`
);

const percentagePoints = (value: number | null): string => {
  if (value === null) return "n/a";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} pp`;
};

const interval = (rate: TerminalStructureRate): string => (
  rate.confidenceInterval
    ? `${percent(rate.confidenceInterval.low)}-${percent(rate.confidenceInterval.high)}`
    : "n/a"
);

const ratio = (numerator: number, denominator: number): string => (
  denominator > 0 ? `${numerator}/${denominator} · ${percent(numerator / denominator)}` : "n/a"
);

const familyStatusLabel = (status: TerminalFamilyCurrentStatus): string => {
  switch (status) {
    case "continuing-reseeded": return "Continuing · reseeded 2+";
    case "continuing": return "Continuing";
    case "confirmed": return "Confirmed run";
    case "seed-awaiting": return "Seed awaiting next draw";
    case "present-once": return "Present once";
    case "ended": return "Ended this draw";
    case "absent": return "Absent";
    default: return status;
  }
};

const movementLabel = (kind: TerminalSequenceMovementKind): string => {
  switch (kind) {
    case "exact": return "Exact";
    case "shift-backward": return "Shift -1";
    case "shift-forward": return "Shift +1";
    case "expand": return "Expand";
    case "contract": return "Contract";
    default: return kind;
  }
};

const Metric: React.FC<{
  label: string;
  value: string;
  detail: string;
}> = ({ label, value, detail }) => (
  <div className="terminal-structure-lab__metric">
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{detail}</small>
  </div>
);

export const TerminalStructureTransitionLab: React.FC<TerminalStructureTransitionLabProps> = ({
  draws,
  allDraws,
  includeSupp,
}) => {
  const [historyScope, setHistoryScope] = useState<TerminalStructureHistoryScope>("all-baseline");
  const [view, setView] = useState<LabView>("families");
  const [motifLength, setMotifLength] = useState<TerminalSequenceMotifLength>(3);
  const fullHistory = allDraws?.length ? allDraws : draws;
  const evidenceDraws = historyScope === "all-baseline" ? fullHistory : draws;
  const analysis = useMemo(() => analyzeTerminalStructureTransitions(evidenceDraws, {
    includeSupp,
    historyScope,
    motifLength,
    contextDraws: fullHistory,
  }), [evidenceDraws, fullHistory, historyScope, includeSupp, motifLength]);
  const currentContext = analysis.currentMonthKey && analysis.currentDrawOrdinal
    ? `${analysis.currentMonthKey} D${analysis.currentDrawOrdinal}`
    : "No valid current prefix";

  return (
    <section className="terminal-structure-lab" aria-labelledby="terminal-structure-lab-title">
      <header className="terminal-structure-lab__header">
        <div>
          <div className="terminal-structure-lab__eyebrow">Observe-only · real draws</div>
          <div className="terminal-structure-lab__title-line">
            <h4 id="terminal-structure-lab-title">Terminal Structure Transition Lab</h4>
            <InfoHelp label="About Terminal Structure Transition Lab">
              A terminal family is one ending digit, such as every number ending in 2. A sequence motif is a circular adjacent set such as 1-2-3 or 8-9-0. They are measured separately because a motif is a relationship among families, not a larger family of its own.
            </InfoHelp>
          </div>
          <p>
            Separates same-family runs, exact sequence motifs, and sequence movement. Historical responses are compared with exact 6/45 or 8/45 combinatorial expectations; no simulated draw is substituted.
          </p>
        </div>
        <span className="terminal-structure-lab__observe-pill">No generation influence</span>
      </header>

      <div className="terminal-structure-lab__controls">
        <div className="terminal-structure-lab__control-group">
          <span className="terminal-structure-lab__control-label">History source</span>
          <div className="terminal-structure-lab__segments" role="group" aria-label="Terminal structure history source">
            <HigButton
              size="compact"
              variant={historyScope === "all-baseline" ? "primary" : "quiet"}
              aria-pressed={historyScope === "all-baseline"}
              onClick={() => setHistoryScope("all-baseline")}
            >
              All baseline
            </HigButton>
            <HigButton
              size="compact"
              variant={historyScope === "wfmqyh" ? "primary" : "quiet"}
              aria-pressed={historyScope === "wfmqyh"}
              onClick={() => setHistoryScope("wfmqyh")}
            >
              WFMQYH
            </HigButton>
          </div>
        </div>

        <div className="terminal-structure-lab__control-group terminal-structure-lab__control-group--wide">
          <span className="terminal-structure-lab__control-label">Diagnostic</span>
          <div className="terminal-structure-lab__segments" role="group" aria-label="Terminal structure diagnostic">
            <HigButton size="compact" variant={view === "families" ? "primary" : "quiet"} aria-pressed={view === "families"} onClick={() => setView("families")}>Family runs</HigButton>
            <HigButton size="compact" variant={view === "motifs" ? "primary" : "quiet"} aria-pressed={view === "motifs"} onClick={() => setView("motifs")}>Exact motifs</HigButton>
            <HigButton size="compact" variant={view === "movement" ? "primary" : "quiet"} aria-pressed={view === "movement"} onClick={() => setView("movement")}>Motif movement</HigButton>
          </div>
        </div>

        {view !== "families" ? (
          <HigField label="Motif length" help="Number of distinct circular adjacent terminal digits in each tested motif.">
            <select value={motifLength} onChange={(event) => setMotifLength(Number(event.target.value) as TerminalSequenceMotifLength)}>
              <option value={2}>2 digits</option>
              <option value={3}>3 digits</option>
              <option value={4}>4 digits</option>
              <option value={5}>5 digits</option>
            </select>
          </HigField>
        ) : null}
      </div>

      <div className="terminal-structure-lab__provenance">
        <strong>{analysis.scopeLabel}</strong>
        <span>{analysis.includeSupp ? "Mains + supps" : "Mains only"} · current context {currentContext} · latest real draw {analysis.latestDate ?? "unavailable"}</span>
      </div>

      {view === "families" ? <FamilyRunsView analysis={analysis} /> : null}
      {view === "motifs" ? <ExactMotifsView analysis={analysis} /> : null}
      {view === "movement" ? <MotifMovementView analysis={analysis} /> : null}

      {analysis.warnings.length ? (
        <div className="terminal-structure-lab__warnings" role="note">
          {analysis.warnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      ) : null}
    </section>
  );
};

const FamilyRunsView: React.FC<{
  analysis: ReturnType<typeof analyzeTerminalStructureTransitions>;
}> = ({ analysis }) => {
  const summary = analysis.familyRuns;
  return (
    <div className="terminal-structure-lab__view">
      <div className="terminal-structure-lab__definition">
        <strong>Run rule</strong>
        <span>A family is seeded by 2+ same-ending numbers. It becomes confirmed only when that family appears in the immediately following real draw. A gap ends the run; a later seed starts another.</span>
      </div>

      <div className="terminal-structure-lab__metrics">
        <Metric label="Repeated-family draws" value={ratio(summary.drawsWithRepeatedFamily, summary.drawCount)} detail="at least one 2+ family" />
        <Metric label="Seed draws confirmed" value={ratio(summary.seedDrawsWithContinuation, summary.seedDrawCount)} detail="at least one seeded family continued" />
        <Metric label="Individual-family response" value={percent(summary.eventRate.observedRate)} detail={`${summary.eventRate.trials} seeds · exact baseline ${percent(summary.eventRate.expectedRate)}`} />
        <Metric label="Lift vs baseline" value={percentagePoints(summary.eventRate.liftPercentagePoints)} detail={`approx. observed interval ${interval(summary.eventRate)}`} />
        <Metric label="Strict 2+ response" value={percent(summary.strictRate.observedRate)} detail={`exact baseline ${percent(summary.strictRate.expectedRate)}`} />
      </div>

      <div className="terminal-structure-lab__subsection">
        <div className="terminal-structure-lab__subheading">
          <div>
            <strong>Current family state</strong>
            <span>Latest real draw only. A latest-draw 2+ family remains an unconfirmed seed until another real draw arrives.</span>
          </div>
        </div>
        <div className="terminal-structure-lab__current-grid">
          {summary.currentRows.map((row) => (
            <div key={row.digit} className={`terminal-structure-lab__current-family is-${row.status}`}>
              <div><strong>{row.digit}</strong><span>{familyStatusLabel(row.status)}</span></div>
              <small>
                Current {row.currentNumbers.length ? row.currentNumbers.join(", ") : "none"}
                {row.runSpan > 1 ? ` · span ${row.runSpan} draws` : ""}
              </small>
            </div>
          ))}
        </div>
      </div>

      <div className="terminal-structure-lab__table-scroll">
        <table>
          <thead><tr><th>Family</th><th>Numbers</th><th>Seeds</th><th>Continued</th><th>Observed</th><th>Exact baseline</th><th>Lift</th><th>Approx. interval</th><th>Strict 2+</th></tr></thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr key={row.digit}>
                <td><strong>Ending {row.digit}</strong></td>
                <td>{row.familyNumbers.join(", ")}</td>
                <td>{row.trials}</td>
                <td>{row.hits}</td>
                <td>{percent(row.observedRate)}</td>
                <td>{percent(row.expectedRate)}</td>
                <td className={row.liftPercentagePoints === null ? undefined : row.liftPercentagePoints > 0 ? "is-positive" : "is-negative"}>{percentagePoints(row.liftPercentagePoints)}</td>
                <td>{interval(row)}</td>
                <td>{row.trials ? `${row.strictHits}/${row.trials} · ${percent(row.strictObservedRate)}` : "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ExactMotifsView: React.FC<{
  analysis: ReturnType<typeof analyzeTerminalStructureTransitions>;
}> = ({ analysis }) => {
  const summary = analysis.motifs;
  const currentRows = summary.rows.filter((row) => row.previousPresent || row.currentPresent);
  return (
    <div className="terminal-structure-lab__view">
      <div className="terminal-structure-lab__definition">
        <strong>Exact motif rule</strong>
        <span>A motif is present only when every listed ending occurs in the draw. For example, 1-2-3 requires all three families. It carries only when the same complete motif appears in the immediately following draw.</span>
      </div>

      <div className="terminal-structure-lab__metrics">
        <Metric label="Draws with a motif" value={ratio(summary.drawsWithAnyMotif, analysis.evidenceDrawCount)} detail={`at least one length-${summary.length} motif`} />
        <Metric label="Transitions with a motif" value={ratio(summary.transitionsWithAnyMotif, summary.transitionDrawCount)} detail="source draw contained a testable motif" />
        <Metric label="Any exact carry" value={ratio(summary.transitionsWithExactCarry, summary.transitionDrawCount)} detail="at least one source motif survived exactly" />
        <Metric label="Motif-event response" value={percent(summary.aggregateRate.observedRate)} detail={`${summary.aggregateRate.trials} overlapping motif events`} />
        <Metric label="Lift vs exact baseline" value={percentagePoints(summary.aggregateRate.liftPercentagePoints)} detail={`baseline ${percent(summary.aggregateRate.expectedRate)}`} />
      </div>

      <div className="terminal-structure-lab__subsection">
        <div className="terminal-structure-lab__subheading">
          <div><strong>Latest real transition</strong><span>Current and previous motif presence; this does not forecast the next draw.</span></div>
        </div>
        {currentRows.length ? (
          <div className="terminal-structure-lab__motif-chips">
            {currentRows.map((row) => (
              <span key={row.startDigit} className={`is-${row.currentStatus}`}>
                {row.digits.join("-")} · {row.currentStatus}
              </span>
            ))}
          </div>
        ) : <div className="terminal-structure-lab__empty">No length-{summary.length} motif appears in either side of the latest valid transition.</div>}
      </div>

      <div className="terminal-structure-lab__table-scroll">
        <table>
          <thead><tr><th>Exact motif</th><th>Source appearances</th><th>Exact carries</th><th>Observed</th><th>Exact baseline</th><th>Lift</th><th>Approx. interval</th><th>Latest state</th></tr></thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr key={row.startDigit}>
                <td><strong>{row.digits.join("-")}</strong></td>
                <td>{row.trials}</td>
                <td>{row.hits}</td>
                <td>{percent(row.observedRate)}</td>
                <td>{percent(row.expectedRate)}</td>
                <td className={row.liftPercentagePoints === null ? undefined : row.liftPercentagePoints > 0 ? "is-positive" : "is-negative"}>{percentagePoints(row.liftPercentagePoints)}</td>
                <td>{interval(row)}</td>
                <td>{row.currentStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const MotifMovementView: React.FC<{
  analysis: ReturnType<typeof analyzeTerminalStructureTransitions>;
}> = ({ analysis }) => {
  const summary = analysis.movements;
  return (
    <div className="terminal-structure-lab__view">
      <div className="terminal-structure-lab__definition">
        <strong>Movement rule</strong>
        <span>Each source motif is tested independently for exact carry, circular ±1 shifts, one-edge expansion, and one-edge contraction. Categories may overlap and are not competing probabilities.</span>
      </div>

      <div className="terminal-structure-lab__metrics terminal-structure-lab__metrics--movement">
        {summary.rows.map((row) => (
          <Metric
            key={row.kind}
            label={row.label}
            value={row.available ? percent(row.observedRate) : "n/a"}
            detail={row.available ? `${row.hits}/${row.trials} · baseline ${percent(row.expectedRate)} · ${percentagePoints(row.liftPercentagePoints)}` : "Requires a motif length of at least 3"}
          />
        ))}
      </div>

      <div className="terminal-structure-lab__subsection">
        <div className="terminal-structure-lab__subheading">
          <div><strong>Latest real motif movement</strong><span>Each source motif from the preceding draw is compared with the latest real draw.</span></div>
        </div>
        {summary.currentRows.length ? (
          <div className="terminal-structure-lab__movement-list">
            {summary.currentRows.map((row) => (
              <div key={row.sourceDigits.join("-")}>
                <strong>{row.sourceDigits.join("-")}</strong>
                <span>{row.matchedKinds.length ? row.matchedKinds.map(movementLabel).join(" · ") : "No tested movement"}</span>
                <small>{row.matchedTargets.length ? `Matched ${row.matchedTargets.join(", ")}` : "No matching target motif"}</small>
              </div>
            ))}
          </div>
        ) : <div className="terminal-structure-lab__empty">The preceding draw contains no length-{summary.length} source motif.</div>}
      </div>

      <div className="terminal-structure-lab__table-scroll terminal-structure-lab__table-scroll--short">
        <table>
          <thead><tr><th>Movement</th><th>Definition</th><th>Trials</th><th>Hits</th><th>Observed</th><th>Exact baseline</th><th>Lift</th><th>Approx. interval</th></tr></thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr key={row.kind}>
                <td><strong>{row.label}</strong></td>
                <td>{row.definition}</td>
                <td>{row.available ? row.trials : "-"}</td>
                <td>{row.available ? row.hits : "-"}</td>
                <td>{row.available ? percent(row.observedRate) : "n/a"}</td>
                <td>{row.available ? percent(row.expectedRate) : "n/a"}</td>
                <td className={row.liftPercentagePoints === null ? undefined : row.liftPercentagePoints > 0 ? "is-positive" : "is-negative"}>{row.available ? percentagePoints(row.liftPercentagePoints) : "n/a"}</td>
                <td>{row.available ? interval(row) : "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

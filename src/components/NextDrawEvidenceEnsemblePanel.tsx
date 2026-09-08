import React, { useEffect, useMemo, useState } from "react";
import type { Draw } from "../types";
import {
  runNextDrawEvidenceEnsemble,
  type NextDrawEvidenceResult,
} from "../lib/nextDrawEvidenceEnsemble";
import { HigButton } from "./shared/HigControls";
import "./NextDrawEvidenceEnsemblePanel.css";

interface NextDrawEvidenceEnsemblePanelProps {
  history: Draw[];
  targetDate?: string;
  unavailableNumbers?: number[];
  onUseNumbers?: (numbers: number[]) => void;
  onDraftPrediction?: (result: NextDrawEvidenceResult) => void;
  onResultChange?: (result: NextDrawEvidenceResult | null) => void;
}

const formatPercent = (value: number, digits = 1): string => `${(value * 100).toFixed(digits)}%`;

const formatNumber = (value: number, digits = 2): string => (
  Number.isFinite(value) ? value.toFixed(digits) : "-"
);

const formatCi = (value: [number, number] | null): string => (
  value ? `${value[0] >= 0 ? "+" : ""}${value[0].toFixed(2)} to ${value[1] >= 0 ? "+" : ""}${value[1].toFixed(2)}` : "insufficient"
);

const roleLabel = (role: "main" | "supp" | "alternate"): string => (
  role === "main" ? "Main" : role === "supp" ? "Supp" : "Alternate"
);

const forecastNumbers = (result: NextDrawEvidenceResult): number[] => [...result.main, ...result.supp];

export const NextDrawEvidenceEnsemblePanel: React.FC<NextDrawEvidenceEnsemblePanelProps> = ({
  history,
  targetDate,
  unavailableNumbers = [],
  onUseNumbers,
  onDraftPrediction,
  onResultChange,
}) => {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<NextDrawEvidenceResult | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    setResult(null);
    setActionMessage("");
    onResultChange?.(null);
  }, [history, onResultChange, targetDate]);

  const unavailableSet = useMemo(() => new Set(unavailableNumbers), [unavailableNumbers]);
  const forecastConflicts = useMemo(
    () => result ? forecastNumbers(result).filter((number) => unavailableSet.has(number)) : [],
    [result, unavailableSet],
  );

  const run = () => {
    if (running) return;
    setRunning(true);
    setActionMessage("");
    window.setTimeout(() => {
      try {
        const nextResult = runNextDrawEvidenceEnsemble(history, { targetDate });
        setResult(nextResult);
        onResultChange?.(nextResult);
      } finally {
        setRunning(false);
      }
    }, 10);
  };

  const useNumbers = () => {
    if (!result || !onUseNumbers) return;
    const available = forecastNumbers(result).filter((number) => !unavailableSet.has(number));
    onUseNumbers(available);
    setActionMessage(
      forecastConflicts.length > 0
        ? `Selected ${available.length} available forecast numbers. Active exclusions kept out ${forecastConflicts.join(", ")}.`
        : "The raw 6+2 forecast is now mirrored in User Selected Numbers.",
    );
  };

  const draftPrediction = () => {
    if (!result || !onDraftPrediction) return;
    onDraftPrediction(result);
    setActionMessage("A journal draft was opened with the raw forecast and validation provenance.");
  };

  return (
    <section className="ndee-panel" aria-label="Next-draw evidence ensemble">
      <div className="ndee-intro-row">
        <div className="ndee-intro-copy">
          <span className="ndee-observe-badge">Observe-only</span>
          <p>
            Fixed, no-lookahead 6+2 evidence ranking. It does not alter generation, and it does not use a known target result to choose settings.
          </p>
        </div>
        <HigButton variant="primary" onClick={run} disabled={running || history.length === 0}>
          {running ? "Running replay..." : result ? "Run Again" : "Run Fixed Replay & Forecast"}
        </HigButton>
      </div>

      {!result ? (
        <div className="ndee-empty-state">
          Run the fixed replay to fit a forecast from strict real history, then compare its historical top-eight overlap with random, all-history frequency, and recent-13 frequency baselines.
        </div>
      ) : (
        <div className="ndee-results" aria-live="polite">
          <div className="ndee-provenance-strip">
            <span><b>Version</b> {result.modelVersion}</span>
            <span><b>Cutoff</b> {result.cutoffDate ?? "unknown"}</span>
            <span><b>Target</b> {result.targetDate ?? "next unrecorded draw"}</span>
            <span><b>Valid real draws</b> {result.validDraws}</span>
          </div>

          {result.warnings.length > 0 ? (
            <div className="ndee-warning" role="status">
              {result.warnings.map((warning) => <div key={warning}>{warning}</div>)}
            </div>
          ) : null}

          <div className="ndee-primary-grid">
            <div className="ndee-forecast-band">
              <div className="ndee-section-kicker">Raw model output</div>
              <div className="ndee-role-row">
                <span className="ndee-role-label">Mains</span>
                <div className="ndee-number-row">
                  {result.main.map((number) => <span key={`main-${number}`} className="ndee-number-pill ndee-number-pill--main">{number}</span>)}
                </div>
              </div>
              <div className="ndee-role-row">
                <span className="ndee-role-label">Supps</span>
                <div className="ndee-number-row">
                  {result.supp.map((number) => <span key={`supp-${number}`} className="ndee-number-pill ndee-number-pill--supp">{number}</span>)}
                </div>
              </div>
              <div className="ndee-alternates">
                <b>Alternates:</b> {result.alternates.join(", ") || "none"}
              </div>
              <div className="ndee-action-row">
                {onUseNumbers ? (
                  <HigButton variant="secondary" size="compact" onClick={useNumbers}>
                    {forecastConflicts.length > 0 ? `Use Available ${8 - forecastConflicts.length}` : "Use as Selected Numbers"}
                  </HigButton>
                ) : null}
                {onDraftPrediction ? (
                  <HigButton variant="secondary" size="compact" onClick={draftPrediction}>
                    Draft in Prediction Journal
                  </HigButton>
                ) : null}
              </div>
              {forecastConflicts.length > 0 ? (
                <div className="ndee-conflict-note">
                  Active exclusions conflict with raw forecast: {forecastConflicts.join(", ")}. The raw result remains unchanged.
                </div>
              ) : null}
              {actionMessage ? <div className="ndee-action-message" role="status">{actionMessage}</div> : null}
            </div>

            <div className={`ndee-verdict ndee-verdict--${result.validation.status}`}>
              <div className="ndee-section-kicker">Walk-forward verdict</div>
              <div className="ndee-verdict-title">
                {result.validation.status === "supported-lift" ? "Validated lift observed" : result.validation.status === "insufficient" ? "Insufficient validation" : "No validated lift yet"}
              </div>
              <p>{result.validation.statusLabel}</p>
              <div className="ndee-verdict-meta">
                {result.validation.drawsEvaluated} targets · {result.validation.firstTargetDate ?? "-"} to {result.validation.lastTargetDate ?? "-"}
              </div>
            </div>
          </div>

          <div className="ndee-metrics-grid">
            <Metric label="Model top-8" value={formatNumber(result.validation.model.meanHits)} detail="mean matches / draw" />
            <Metric label="All-history frequency" value={formatNumber(result.validation.fullFrequency.meanHits)} detail="fixed baseline" />
            <Metric label="Recent-13 frequency" value={formatNumber(result.validation.recent13Frequency.meanHits)} detail="fixed baseline" />
            <Metric label="Random expectation" value={formatNumber(result.validation.randomExpectedHits)} detail="8 x 8 / 45" />
            <Metric label="Model Brier" value={formatNumber(result.validation.model.brier, 4)} detail="lower is better" />
            <Metric label="Oracle supp role" value={formatNumber(result.validation.oracleSuppMeanHits)} detail={`random ${formatNumber(result.validation.randomOracleSuppMeanHits)}`} />
          </div>

          <div className="ndee-comparison-band">
            <div><b>Model - all frequency, 95% block CI:</b> {formatCi(result.validation.modelVsFullFrequencyCi)} hits/draw</div>
            <div><b>Model - recent 13, 95% block CI:</b> {formatCi(result.validation.modelVsRecent13Ci)} hits/draw</div>
            <div><b>Model - random expectation, 95% block CI:</b> {formatCi(result.validation.modelVsRandomCi)} hits/draw</div>
            <div><b>Exact supp pair when the correct eight are known:</b> {formatPercent(result.validation.oracleSuppExactRate)} · random {formatPercent(result.validation.randomOracleSuppExactRate)}</div>
          </div>

          <div className="ndee-two-column">
            <section className="ndee-data-section" aria-labelledby="ndee-number-evidence-title">
              <div id="ndee-number-evidence-title" className="ndee-section-title">Number Evidence Ranking</div>
              <div className="ndee-section-note">
                Estimates sum to 8 across all 45 numbers. They are relative model marginals, not calibrated win probabilities.
              </div>
              <div className="ndee-table-scroll ndee-table-scroll--ranking">
                <table className="ndee-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Number</th>
                      <th>Role</th>
                      <th>Estimate</th>
                      <th>Strongest fitted contributions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.numberRows.map((row) => (
                      <tr key={row.number}>
                        <td>{row.rank}</td>
                        <td><span className={`ndee-mini-number ndee-mini-number--${row.selectedRole}`}>{row.number}</span></td>
                        <td>{roleLabel(row.selectedRole)}</td>
                        <td>{formatPercent(row.inclusionEstimate)}</td>
                        <td className="ndee-driver-cell">
                          {row.contributions.slice(0, 3).map((driver) => (
                            <span key={driver.key} className={driver.contribution >= 0 ? "ndee-driver--positive" : "ndee-driver--negative"}>
                              {driver.contribution >= 0 ? "+" : "-"}{driver.label}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="ndee-data-section" aria-labelledby="ndee-supp-pairs-title">
              <div id="ndee-supp-pairs-title" className="ndee-section-title">Supplementary Pair Ranking</div>
              <div className="ndee-section-note">
                Role evidence is conditional on the selected eight and heavily shrunk toward neutral. Pair score is support, not probability.
              </div>
              <div className="ndee-table-scroll ndee-table-scroll--pairs">
                <table className="ndee-table">
                  <thead>
                    <tr>
                      <th>Pair</th>
                      <th>Support</th>
                      <th>Exact supp / co-draw</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.supplementaryPairs.map((pair) => (
                      <tr key={pair.numbers.join("-")}>
                        <td>{pair.numbers.join(", ")}</td>
                        <td>{pair.score >= 0 ? "+" : ""}{formatNumber(pair.score, 3)}</td>
                        <td>{pair.pairSuppHits} / {pair.pairExposure}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="ndee-data-section" aria-labelledby="ndee-replay-title">
            <div id="ndee-replay-title" className="ndee-section-title">Latest Walk-Forward Audit Rows</div>
            <div className="ndee-section-note">Each row was ranked from an earlier frozen training block; its target draw was not available to that fit.</div>
            <div className="ndee-table-scroll ndee-table-scroll--audit">
              <table className="ndee-table">
                <thead>
                  <tr>
                    <th>Target draw</th>
                    <th>Model hits</th>
                    <th>All-frequency hits</th>
                    <th>Recent-13 hits</th>
                    <th>Oracle supp hits</th>
                    <th>Model eight</th>
                    <th>Actual eight</th>
                  </tr>
                </thead>
                <tbody>
                  {result.validation.latestRows.map((row) => (
                    <tr key={row.drawDate}>
                      <td>{row.drawDate}</td>
                      <td>{row.modelHits}</td>
                      <td>{row.fullFrequencyHits}</td>
                      <td>{row.recent13Hits}</td>
                      <td>{row.oracleSuppHits}{row.oracleSuppExact ? " exact" : ""}</td>
                      <td>{row.modelNumbers.join(", ")}</td>
                      <td>{row.actualNumbers.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <details className="ndee-methodology">
            <summary>Method, fixed assumptions, and limits</summary>
            <ul>
              {result.methodology.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </details>
        </div>
      )}
    </section>
  );
};

const Metric: React.FC<{ label: string; value: string; detail: string }> = ({ label, value, detail }) => (
  <div className="ndee-metric">
    <div className="ndee-metric-label">{label}</div>
    <div className="ndee-metric-value">{value}</div>
    <div className="ndee-metric-detail">{detail}</div>
  </div>
);

export default NextDrawEvidenceEnsemblePanel;

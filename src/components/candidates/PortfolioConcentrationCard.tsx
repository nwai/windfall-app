import React, { useState } from "react";

import type { PortfolioConcentrationResult } from "../../lib/portfolioConcentration";
import { HigButton, HigField, InfoHelp } from "../shared/HigControls";
import "./PortfolioConcentrationCard.css";

interface PortfolioConcentrationCardProps {
  result: PortfolioConcentrationResult;
  lineCount: number;
  onLineCountChange: (value: number) => void;
  coreRetention: 4 | 5;
  onCoreRetentionChange: (value: 4 | 5) => void;
  onSimulateLine?: (numbers: number[]) => void;
  activeSimulatedKey?: string | null;
  copyText?: (text: string) => void | Promise<void>;
}

const writeText = async (
  value: string,
  customCopy?: (text: string) => void | Promise<void>,
): Promise<void> => {
  if (customCopy) {
    await customCopy(value);
    return;
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  throw new Error("Clipboard is not available in this browser.");
};

const lineKey = (numbers: readonly number[]): string => numbers.join(",");

export const PortfolioConcentrationCard: React.FC<PortfolioConcentrationCardProps> = ({
  result,
  lineCount,
  onLineCountChange,
  coreRetention,
  onCoreRetentionChange,
  onSimulateLine,
  activeSimulatedKey = null,
  copyText,
}) => {
  const [copyMessage, setCopyMessage] = useState("");
  const portfolioText = result.lines.map((line) => line.numbers.join(",")).join("\n");

  const handleCopy = async (): Promise<void> => {
    if (!portfolioText) return;
    try {
      await writeText(portfolioText, copyText);
      setCopyMessage(`Copied ${result.lines.length} concentrated portfolio line${result.lines.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setCopyMessage(error instanceof Error ? error.message : "Could not copy the concentrated portfolio.");
    }
  };

  return (
    <section className="windfall-portfolio-concentration" aria-labelledby="portfolio-concentration-heading">
      <div className="windfall-portfolio-concentration__heading">
        <div>
          <div className="windfall-portfolio-concentration__eyebrow">Experimental | observed portfolio evidence only</div>
          <h3 id="portfolio-concentration-heading">Core-and-Hedge Portfolio</h3>
          <p>
            Concentrates repeated support into one primary six, then creates controlled alternatives without changing the original rows or the main generator.
          </p>
        </div>
        <InfoHelp label="How the Core-and-Hedge Portfolio is constructed">
          The primary line uses source-row frequency. Hedge lines retain the selected number of primary-core values, then add ranked alternates. Row support and pair support are direct integer counts from valid pasted rows, not probabilities.
        </InfoHelp>
      </div>

      <div className="windfall-portfolio-concentration__controls">
        <HigField
          label="Portfolio games"
          help="One primary game plus controlled hedge games."
        >
          <select
            value={lineCount}
            onChange={(event) => onLineCountChange(Number(event.target.value))}
          >
            {Array.from({ length: 11 }, (_, index) => index + 2).map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </HigField>
        <HigField
          label="Primary numbers retained per hedge"
          help="Four gives broader coverage; five keeps every hedge closer to the primary line."
        >
          <select
            value={coreRetention}
            onChange={(event) => onCoreRetentionChange(Number(event.target.value) === 5 ? 5 : 4)}
          >
            <option value={4}>4 of 6</option>
            <option value={5}>5 of 6</option>
          </select>
        </HigField>
      </div>

      <div className="windfall-portfolio-concentration__status">
        <div>
          <span>Valid source rows</span>
          <strong>{result.validSourceRows}</strong>
        </div>
        <div>
          <span>Lines built</span>
          <strong>{result.lines.length}/{result.requestedLines}</strong>
        </div>
        <div>
          <span>Output breadth</span>
          <strong>{result.outputUniqueNumbers.length} unique</strong>
        </div>
        <div>
          <span>Alternate pool</span>
          <strong>{result.alternatePool.length}</strong>
        </div>
      </div>

      {!result.available ? (
        <div className="windfall-portfolio-concentration__empty">
          {result.reason ?? "No concentrated portfolio is available."}
        </div>
      ) : (
        <div className="windfall-portfolio-concentration__table-wrap">
          <table>
            <thead>
              <tr>
                <th>Game</th>
                <th>Role</th>
                <th>Numbers</th>
                <th>Core kept</th>
                <th>Row support</th>
                <th>Pair support</th>
                <th>New coverage</th>
                <th><span className="windfall-visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {result.lines.map((line) => {
                const isSimulated = activeSimulatedKey === lineKey(line.numbers);
                return (
                  <tr key={lineKey(line.numbers)}>
                    <td className="windfall-portfolio-concentration__game">{line.index}</td>
                    <td>
                      <span className={`windfall-portfolio-concentration__role windfall-portfolio-concentration__role--${line.role}`}>
                        {line.role === "primary" ? "Primary" : "Hedge"}
                      </span>
                    </td>
                    <td>
                      <span className="windfall-portfolio-concentration__numbers">{line.numbers.join(", ")}</span>
                    </td>
                    <td>{line.coreNumbers.length}/6</td>
                    <td title="Sum of the six numbers' appearances across valid source rows.">
                      {line.rowCountSupport}
                    </td>
                    <td title="Sum of the 15 pair co-occurrence counts across valid source rows. Not a probability.">
                      {line.pairCooccurrenceSupport}
                    </td>
                    <td>{line.newlyCoveredAlternates.length > 0 ? line.newlyCoveredAlternates.join(", ") : "-"}</td>
                    <td>
                      <HigButton
                        size="compact"
                        variant={isSimulated ? "primary" : "quiet"}
                        disabled={!onSimulateLine}
                        onClick={() => onSimulateLine?.([...line.numbers])}
                        aria-label={`Simulate concentrated portfolio game ${line.index}: ${line.numbers.join(", ")}`}
                      >
                        {isSimulated ? "Simulated" : "Simulate"}
                      </HigButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {result.warnings.length > 0 ? (
        <div className="windfall-portfolio-concentration__warning" role="status">
          {result.warnings.join(" ")}
        </div>
      ) : null}

      <div className="windfall-portfolio-concentration__actions">
        <HigButton
          variant="secondary"
          size="compact"
          onClick={() => { void handleCopy(); }}
          disabled={result.lines.length === 0}
        >
          Copy concentrated portfolio
        </HigButton>
        <span>{copyMessage}</span>
      </div>

      {result.methodology.length > 0 ? (
        <details className="windfall-portfolio-concentration__method">
          <summary>Method and honesty notes</summary>
          <ul>
            {result.methodology.map((entry) => <li key={entry}>{entry}</li>)}
          </ul>
          <p>
            A truthful performance backtest requires portfolios saved before their target draws. This view does not replay today&apos;s rows into past draws or use a known result to choose its lines.
          </p>
        </details>
      ) : null}
    </section>
  );
};

export default PortfolioConcentrationCard;

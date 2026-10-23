import React, { useMemo } from "react";
import type { OGAForecast } from "../lib/ogaForecast";
import { ogaDecileIndex, ogaDecileRangeLabel } from "../lib/ogaDecileAcceptance";
import { InfoHelp } from "./shared/HigControls";
import "./HistoricalOgaDistribution.css";

// A display safeguard, not a calibration or generation threshold.
export const MIN_OGA_DISTRIBUTION_DRAWS = 30;

interface Props {
  distribution: OGAForecast;
  historyLabel: string;
  referenceLabel: string;
  referenceDrawCount: number;
  spokeCount: number;
}

export function HistoricalOgaDistribution({ distribution, historyLabel, referenceLabel, referenceDrawCount, spokeCount }: Props) {
  const { n, scores, deciles } = distribution;
  const counts = useMemo(() => {
    const bins = Array<number>(10).fill(0);
    if (deciles?.thresholds.length === 9) {
      scores.forEach(score => { bins[ogaDecileIndex(score, deciles.thresholds)]++; });
    }
    return bins;
  }, [scores, deciles]);
  const usable = n >= MIN_OGA_DISTRIBUTION_DRAWS && scores.length === n && scores.every(Number.isFinite)
    && [distribution.mean, distribution.p10, distribution.p50, distribution.p90].every(Number.isFinite)
    && deciles?.thresholds.length === 9 && deciles.thresholds.every((value, index, values) => Number.isFinite(value) && (!index || value >= values[index - 1]))
    && deciles.probs.length === 10 && deciles.probs.every(value => Number.isFinite(value) && value >= 0 && value <= 1)
    && distribution.p90 > distribution.p10;

  return <section className="windfall-historical-oga" aria-label="Historical OGA distribution">
    <p className="windfall-historical-oga__scope">Evidence: {historyLabel} ({n} real draws, mains + supps). Reference: {referenceLabel} ({referenceDrawCount} real draws). Number groups: {spokeCount}.</p>
    <p>Retrospective description only. Observed shares count past draws; smoothed KDE shares describe a fitted distribution, not next-draw accuracy or winning probabilities.</p>
    <InfoHelp label="What the historical OGA score measures">
      The current formula divides counts in consecutive number groups by historical group averages and sums the results.
      It does not measure angles, distances or symmetry. Different numbers with the same group counts receive the same score.
      With the evidence window as its own reference, the mean is largely determined by the formula, not predictive performance.
      Scores use the stated reference, including the evidence draws themselves; this is not a no-lookahead replay.
      This view reads the engine's existing score distribution and cannot change any generation setting.
    </InfoHelp>
    {!n ? <p role="status">No real draw history available.</p>
      : !usable ? <p role="status">Smoothed percentages are not displayed: at least {MIN_OGA_DISTRIBUTION_DRAWS} real draws and a usable score spread are required. This display safeguard does not change the existing OGA generation controls, and meeting it does not establish predictive value.</p>
        : <>
          <dl className="windfall-historical-oga__stats">
            {[["Mean score", distribution.mean], ["10th percentile", distribution.p10], ["Median", distribution.p50], ["90th percentile", distribution.p90]].map(([label, value]) =>
              <div key={label}><dt>{label}</dt><dd>{Number(value).toFixed(4)}</dd></div>)}
          </dl>
          <div className="windfall-historical-oga__table" role="region" aria-label="Historical OGA score bands" tabIndex={0}>
            <table>
              <caption>Historical score bands</caption>
              <thead><tr><th scope="col">Band</th><th scope="col">Score interval</th><th scope="col">Draws</th><th scope="col">Observed share</th><th scope="col">Smoothed KDE share</th></tr></thead>
              <tbody>{counts.map((count, index) => <tr key={index}>
                <th scope="row">D{index}</th><td>{ogaDecileRangeLabel(index, deciles!.thresholds)}</td><td>{count}</td>
                <td>{(count / n * 100).toFixed(1)}%</td><td>{(deciles!.probs[index] * 100).toFixed(1)}%</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p>D0-D9 are score intervals, not monthly draw ordinals or terminal digits. Ties go to the lower interval. Smoothed shares can differ from observed shares; the first and last intervals include the fitted tails.</p>
        </>}
  </section>;
}

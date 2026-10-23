import React, { useMemo, useState } from "react";
import type { Draw } from "../types";
import { buildSupplementaryPairComparison, orderSupplementaryPairRows, type SupplementaryPairChoice, type SupplementaryPairPolicy } from "../lib/supplementaryPairComparison";
import { normalizeSelectionInsightNumbers } from "../lib/selectionInsights";
import { HigField, InfoHelp } from "./shared/HigControls";
import "./SelectionInsightsSuppPairs.css";

interface Props {
  selected: readonly number[];
  activeHistory: readonly Draw[];
  fullHistory: readonly Draw[];
  historyWindowName: string;
}

const pairLabel = (pair: readonly number[]): string => pair.join(" + ");
const rankLabel = (rank: number, ties: number): string => `${rank}${ties > 1 ? ` (tie: ${ties})` : ""}`;

const ChoiceSummary: React.FC<{ title: string; choice: SupplementaryPairChoice }> = ({ title, choice }) => (
  <div>
    <strong>{title}</strong>
    <div className="supp-pairs-choice">
      {choice.pair ? <span className="supp-pairs-number">{pairLabel(choice.pair)}</span> : "No recommendation"}
      {choice.pair && choice.tiedPairs.length > 1 ? <span>Numerical fallback</span> : null}
    </div>
    <p>{choice.reason}</p>
  </div>
);

export const SelectionInsightsSuppPairs: React.FC<Props> = ({ selected, activeHistory, fullHistory, historyWindowName }) => {
  const [order, setOrder] = useState<SupplementaryPairPolicy>("auto");
  const comparison = useMemo(
    () => buildSupplementaryPairComparison(selected, activeHistory, fullHistory),
    [activeHistory, fullHistory, selected],
  );
  const rows = useMemo(() => orderSupplementaryPairRows(comparison?.rows ?? [], order), [comparison, order]);

  return (
    <section className="supp-pairs-comparison" aria-label="Supplementary Pair Comparison">
      <div className="supp-pairs-heading">
        <h4>Supplementary Pair Comparison</h4>
        <span className="supp-pairs-status">Observe-only</span>
        <InfoHelp label="How to read supplementary pair evidence">
          Co-draws count the pair appearing anywhere among mains and supps. Exact supps count only the two official
          supplementaries together. Individual supp sum adds the two numbers' separate supplementary counts;
          it is not a pair count. Rankings describe past support, not calibrated probabilities.
        </InfoHelp>
      </div>
      {!comparison ? (
        <p>Select exactly eight anchors to compare all 28 supplementary pairs. Currently {normalizeSelectionInsightNumbers([...selected]).length}/8 selected.</p>
      ) : (
        <>
          <p className="supp-pairs-scope">
            {historyWindowName} (WFMQYH): {comparison.windowDrawCount} qualifying real draws · All History: {comparison.fullDrawCount} qualifying real draws · All 28 pairs, including zeros.
          </p>
          <p>Compares role assignments for these eight anchors only. Does not change selections, DGA Auto supps, generated candidates or saved predictions.</p>
          {comparison.ignoredWindowRows || comparison.ignoredFullRows ? (
            <p className="supp-pairs-warning">
              Omitted rows: WFMQYH {comparison.ignoredWindowRows}, All History {comparison.ignoredFullRows}.
              Only valid real 6+2 Monday/Wednesday/Friday draws are used; duplicate/conflicting records are screened.
              The window must belong to qualifying All History.
            </p>
          ) : null}
          <div className="supp-pairs-choices">
            <ChoiceSummary title="Current Auto supps method" choice={comparison.current} />
            <ChoiceSummary title="Pair-blend alternative · All History" choice={comparison.alternative} />
          </div>
          <div className="supp-pairs-controls">
            <HigField label="Order pairs by">
              <select value={order} onChange={(event) => setOrder(event.target.value as SupplementaryPairPolicy)}>
                <option value="auto">Current Auto supps evidence</option>
                <option value="blend">Pair-blend evidence</option>
                <option value="co-draws">All History co-draws</option>
              </select>
            </HigField>
            <span>Tied evidence keeps the same rank; sorting never changes an assignment.</span>
          </div>
          <div className="supp-pairs-scroll" tabIndex={0} role="region" aria-label="All 28 supplementary pairs" >
            <table>
              <thead>
                <tr>
                  <th rowSpan={2} scope="col">Pair</th>
                  <th colSpan={3} scope="colgroup">Windowed (WFMQYH)</th>
                  <th colSpan={3} scope="colgroup">All History</th>
                  <th colSpan={2} scope="colgroup">Evidence rank</th>
                </tr>
                <tr>
                  <th scope="col">Co-draws</th><th scope="col">Exact supps</th><th scope="col">Individual supp sum</th>
                  <th scope="col">Co-draws</th><th scope="col">Exact supps</th><th scope="col">Individual supp sum</th>
                  <th scope="col">Auto supps</th><th scope="col">Pair blend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const currentExample = comparison.current.pair?.join("-") === row.pair.join("-");
                  const blendExample = comparison.alternative.pair?.join("-") === row.pair.join("-");
                  return (
                    <tr key={row.pair.join("-")}>
                      <th scope="row">
                        <span className="supp-pairs-number">{pairLabel(row.pair)}</span>
                        {currentExample ? <span className="supp-pairs-row-label">Auto{row.autoTies > 1 ? " fallback" : " choice"}</span> : null}
                        {blendExample ? <span className="supp-pairs-row-label">Blend{row.blendTies > 1 ? " fallback" : " choice"}</span> : null}
                      </th>
                      <td>{row.windowCoDraws}</td><td>{row.activePairSuppCount}</td><td>{row.individualActiveSuppCount}</td>
                      <td>{row.fullCoDraws}</td><td>{row.fullPairSuppCount}</td><td>{row.individualFullSuppCount}</td>
                      <td>{rankLabel(row.autoRank, row.autoTies)}</td><td>{rankLabel(row.blendRank, row.blendTies)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <details className="supp-pairs-method">
            <summary>Method and tie-break order</summary>
            <p><b>Current Auto supps:</b> individual supplementary counts in WFMQYH, then exact supp-pair count in WFMQYH,
              then individual supplementary counts in All History, then exact supp-pair count in All History,
              then the most recent exact pair in WFMQYH and All History.</p>
            <p><b>Pair blend:</b> reuses the existing audit alternative. Individual supplementary-role rates are
              stabilised with 16 appearances at the neutral 2-of-8 role rate. Exact supp-pair evidence is
              stabilised with 56 co-draws at the neutral 1-of-28 pair rate, contributing one quarter of the
              pair-support term. Exact supp-pair count breaks score ties. These constants are fixed, not learned here.</p>
            <p><b>Unresolved ties:</b> numerical order supplies an example without claiming superiority.
              The app does not shorten WFMQYH to find a winner. With no supplementary observations,
              no evidence-based recommendation is made.</p>
            <p>The separate Auto Supp Learning &amp; Self-Audit beneath the DGA grid tests these methods using only
              earlier draws for each historical target. This comparison adds no generation influence or independent consensus vote.</p>
          </details>
        </>
      )}
    </section>
  );
};

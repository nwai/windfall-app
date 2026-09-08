import React, { useMemo } from "react";

import type { DgaSuppSuggestion } from "../lib/dgaSuppSuggestion";
import type { MonthlyBucketSets } from "../lib/monthlyDrawSummary";
import {
  formatUserExclusionReminder,
  normalizeUserExclusionLocks,
  removeUserExcludedNumbers,
} from "../lib/userExclusionLocks";

export interface DGAScoringNumberDiagnostic {
  rank: number;
  score: number;
}

type Orientation = "horizontal" | "vertical";
type LabelPosition = "bottom" | "right";

const stripColorForTimes = (times: number): string => {
  const palette: Record<number, string> = {
    0: "rgba(117,117,117,0.70)",
    1: "rgba(66,165,245,0.70)",
    2: "rgba(102,187,106,0.70)",
    3: "rgba(38,198,218,0.70)",
    4: "rgba(251,192,45,0.70)",
    5: "rgba(251,140,0,0.72)",
    6: "rgba(244,81,30,0.72)",
    7: "rgba(229,57,53,0.74)",
  };
  return palette[times] ?? "rgba(142,36,170,0.74)";
};

const stripBucketColor = (n: number, buckets: MonthlyBucketSets | null | undefined): string | undefined => {
  if (!buckets) return undefined;
  if (buckets.undrawn.has(n)) return stripColorForTimes(0);
  if (buckets.times1.has(n)) return stripColorForTimes(1);
  if (buckets.times2.has(n)) return stripColorForTimes(2);
  if (buckets.times3.has(n)) return stripColorForTimes(3);
  if (buckets.times4.has(n)) return stripColorForTimes(4);
  if (buckets.times5.has(n)) return stripColorForTimes(5);
  if (buckets.times6.has(n)) return stripColorForTimes(6);
  if (buckets.times7.has(n)) return stripColorForTimes(7);
  if (buckets.times8.has(n)) return stripColorForTimes(8);
  return undefined;
};

const formatDgaScoringScore = (score: number): string => (
  Number.isFinite(score) ? score.toFixed(1).replace(/\.0$/, "") : "0"
);

const formatDgaSuppSuggestionTitle = (suggestion: DgaSuppSuggestion): string => {
  const suppSet = new Set(suggestion.supp);
  const rows = suggestion.evidence
    .filter((row) => suppSet.has(row.number))
    .map((row) => `${row.number}: WFMQYH supp ${row.activeSuppCount}/${row.activeDrawCount}, all-history supp ${row.fullSuppCount}/${row.fullDrawCount}`);
  const pair = suggestion.selectedPairEvidence;
  const activeGap = pair.activeLastPairSuppGap === null ? "never in WFMQYH" : `last exact pair gap ${pair.activeLastPairSuppGap}`;
  const fullGap = pair.fullLastPairSuppGap === null ? "never in all history" : `last exact pair gap ${pair.fullLastPairSuppGap}`;
  return [
    `Suggested supplementary numbers: ${suggestion.supp.join(", ")}`,
    ...rows,
    `Exact pair evidence: ${pair.pair.join("-")} · WFMQYH ${pair.activePairSuppCount}/${pair.activeDrawCount} (${activeGap}) · all-history ${pair.fullPairSuppCount}/${pair.fullDrawCount} (${fullGap})`,
    `Selected-8 pair coverage: WFMQYH ${suggestion.pairCoverage.activeObservedPairs}/${suggestion.pairCoverage.totalPairs}, all-history ${suggestion.pairCoverage.fullObservedPairs}/${suggestion.pairCoverage.totalPairs}.`,
    suggestion.reason,
  ].join("\n");
};

export interface DGASimulateStripProps {
  selectedNumbers: number[];
  onChange: (nums: number[]) => void;
  cellSize?: number;
  monthlyBuckets?: MonthlyBucketSets | null;
  scoringNumberDiagnostics?: Record<number, DGAScoringNumberDiagnostic>;
  suppSuggestion?: DgaSuppSuggestion | null;
  excludedNumbers?: number[];
  hoveredNumber?: number | null;
  onHoverNumber?: (value: number | null) => void;
  includeHeaderSpacer?: boolean;
  topOffsetPx?: number;
  testIdPrefix?: string;
}

export const DGASimulateStrip: React.FC<DGASimulateStripProps> = ({
  selectedNumbers,
  onChange,
  cellSize,
  monthlyBuckets,
  scoringNumberDiagnostics,
  suppSuggestion,
  excludedNumbers = [],
  hoveredNumber,
  onHoverNumber,
  includeHeaderSpacer = true,
  topOffsetPx = 0,
  testIdPrefix = "dga-simulate-strip",
}) => {
  const simulationNumberLimit = 8;
  const userExcludedNumbers = useMemo(() => normalizeUserExclusionLocks(excludedNumbers), [excludedNumbers]);
  const userExcludedSet = useMemo(() => new Set(userExcludedNumbers), [userExcludedNumbers]);
  const activeSelectedNumbers = useMemo(
    () => removeUserExcludedNumbers(selectedNumbers, userExcludedNumbers),
    [selectedNumbers, userExcludedNumbers],
  );
  const selectionCountLabel = activeSelectedNumbers.length > simulationNumberLimit
    ? `${activeSelectedNumbers.length} selected · first ${simulationNumberLimit} simulate`
    : `${activeSelectedNumbers.length}/${simulationNumberLimit}`;
  const suppSuggestionTitle = suppSuggestion ? formatDgaSuppSuggestionTitle(suppSuggestion) : "";
  const userExclusionReminder = useMemo(
    () => formatUserExclusionReminder(userExcludedNumbers),
    [userExcludedNumbers],
  );
  const tableCellSize = Math.max(18, Math.floor(cellSize ?? 20));
  const tableCellLineHeight = `${tableCellSize}px`;

  const handleToggle = (n: number) => {
    if (userExcludedSet.has(n)) return;
    if (activeSelectedNumbers.includes(n)) {
      onChange(activeSelectedNumbers.filter((x) => x !== n));
    } else {
      onChange([...activeSelectedNumbers, n]);
    }
  };

  return (
    <div style={{ marginTop: 0 }} data-testid={testIdPrefix}>
      <div style={{ display: "flex", flexDirection: "column", gap: 0, paddingTop: 0, paddingBottom: 0, alignItems: "flex-start" }}>
        <div style={{ border: 0, background: "transparent", paddingTop: topOffsetPx }}>
          <table className="windfall-table--custom-layout" style={{ borderCollapse: "collapse", borderSpacing: 0, fontSize: 11 }}>
            {includeHeaderSpacer && (
              <thead>
                <tr>
                  <th
                    style={{
                      height: tableCellSize,
                      minHeight: tableCellSize,
                      lineHeight: tableCellLineHeight,
                      padding: 0,
                      border: 0,
                      boxSizing: "border-box",
                      background: "transparent",
                    }}
                  ></th>
                </tr>
              </thead>
            )}
            <tbody>
              {Array.from({ length: 45 }, (_, i) => i + 1).map((n) => {
                const isUserExcluded = userExcludedSet.has(n);
                const checked = !isUserExcluded && activeSelectedNumbers.includes(n);
                const disabled = isUserExcluded;
                const isHovered = hoveredNumber === n;
                const bucketColor = stripBucketColor(n, monthlyBuckets);
                const bgColor = checked ? "#1565c0" : (bucketColor ?? "transparent");
                const textColor = checked || bucketColor ? "#fff" : "#333";
                const diagnostic = scoringNumberDiagnostics?.[n];
                const diagnosticTitle = diagnostic
                  ? `Numbers diagnostic rank #${diagnostic.rank}/45 · score ${formatDgaScoringScore(diagnostic.score)} (mains + supps; diagnostic support, not probability).`
                  : "Numbers diagnostic rank unavailable.";
                const actionTitle = isUserExcluded
                  ? `Number ${n} is unavailable because it is excluded. Clear the active exclusion or turn off the rule before selecting it here.`
                  : checked
                    ? `Remove ${n} from user-selected numbers`
                    : `Add ${n} to user-selected numbers`;

                return (
                  <tr key={n}>
                    <td
                      style={{
                        height: tableCellSize,
                        minHeight: tableCellSize,
                        lineHeight: tableCellLineHeight,
                        padding: 0,
                        border: 0,
                        boxSizing: "border-box",
                        background: "transparent",
                      }}
                    >
                      <label
                        onMouseEnter={() => onHoverNumber?.(n)}
                        onMouseLeave={() => onHoverNumber?.(null)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          minWidth: 28,
                          height: tableCellSize,
                          boxSizing: "border-box",
                          cursor: disabled ? "not-allowed" : "pointer",
                          opacity: disabled ? 0.4 : 1,
                          background: isHovered ? "rgba(21,101,192,0.10)" : "transparent",
                          borderRadius: 6,
                          boxShadow: isHovered ? "inset 0 0 0 1px rgba(21,101,192,0.30)" : "none",
                          padding: "0 4px 0 2px",
                        }}
                        title={`${actionTitle}\n${diagnosticTitle}`}
                      >
                        <input
                          data-testid={`${testIdPrefix}-number-${n}`}
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          aria-label={isUserExcluded
                            ? `Number ${n} is unavailable because it is excluded`
                            : diagnostic
                              ? `${checked ? "Remove" : "Add"} ${n} to user-selected numbers; Numbers diagnostic rank ${diagnostic.rank} of 45`
                              : undefined}
                          onChange={() => handleToggle(n)}
                          style={{ margin: 0 }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            minWidth: 20,
                            textAlign: "center",
                            display: "inline-block",
                            background: bgColor,
                            color: textColor,
                            borderRadius: 3,
                            padding: (checked || bucketColor) ? "0 3px" : undefined,
                            boxShadow: isHovered ? "0 0 0 2px rgba(13,71,161,0.35)" : undefined,
                            fontWeight: isHovered ? 800 : 600,
                          }}
                        >
                          {n}
                        </span>
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {selectedNumbers.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            style={{ marginTop: 4, fontSize: 10, lineHeight: 1.1, padding: "1px 5px", cursor: "pointer", alignSelf: "flex-start" }}
            title="Clear user-selected numbers"
          >
            Clear
          </button>
        )}
        {userExclusionReminder && (
          <span
            style={{ marginTop: 4, maxWidth: 92, color: "#64748b", fontSize: 10, lineHeight: 1.25 }}
            title={`${userExclusionReminder}. Clear the manual exclusion or turn off the rule that excludes them before selecting them here.`}
          >
            exclusions active
          </span>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginTop: 4,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: activeSelectedNumbers.length > simulationNumberLimit ? "#9a3412" : "#546e7a",
              background: activeSelectedNumbers.length > simulationNumberLimit ? "#fff7ed" : "#f3f7fb",
              border: `1px solid ${activeSelectedNumbers.length > simulationNumberLimit ? "#fed7aa" : "#d8e3ef"}`,
              borderRadius: 999,
              padding: "1px 6px",
              fontVariantNumeric: "tabular-nums",
            }}
            title={activeSelectedNumbers.length > simulationNumberLimit ? `Shared user selection has ${activeSelectedNumbers.length} numbers; DGA simulation uses the first ${simulationNumberLimit}.` : `${activeSelectedNumbers.length} of ${simulationNumberLimit} selected for DGA simulation`}
            aria-label={`${selectionCountLabel} selected`}
          >
            {selectionCountLabel}
          </span>
        </div>
        {activeSelectedNumbers.length === simulationNumberLimit && (
          <div
            data-testid={`${testIdPrefix}-supp-suggestion`}
            style={{
              marginTop: 4,
              maxWidth: 118,
              border: `1px solid ${suppSuggestion ? "#b7e4c7" : "#e2e8f0"}`,
              background: suppSuggestion ? "#f0fdf4" : "#f8fafc",
              color: suppSuggestion ? "#14532d" : "#64748b",
              borderRadius: 7,
              padding: "4px 5px",
              fontSize: 10,
              lineHeight: 1.2,
            }}
            title={suppSuggestion ? suppSuggestionTitle : "No supplementary-role count signal was found for these eight selected numbers. DGA uses the existing first-six main, next-two supplementary order."}
          >
            <b style={{ display: "block", fontSize: 10 }}>
              {suppSuggestion ? "Auto supps" : "Supps"}
            </b>
            {suppSuggestion
              ? `${suppSuggestion.supp.join(", ")}`
              : "no count signal"}
          </div>
        )}
      </div>
    </div>
  );
};

export interface UserExclusionsStripProps {
  excludedNumbers: number[];
  setExcludedNumbers: (updater: (prev: number[]) => number[]) => void;
  title?: string;
  orientation?: Orientation;
  labelPosition?: LabelPosition;
  showClearButton?: boolean;
  cellSize?: number;
  monthlyBuckets?: MonthlyBucketSets | null;
}

export const UserExclusionsStrip: React.FC<UserExclusionsStripProps> = ({
  excludedNumbers,
  setExcludedNumbers,
  title,
  orientation = "horizontal",
  labelPosition = "bottom",
  showClearButton = false,
  cellSize,
  monthlyBuckets,
}) => {
  const containerStyle: React.CSSProperties =
    orientation === "horizontal"
      ? { display: "flex", gap: 8, overflowX: "auto", whiteSpace: "nowrap", paddingTop: 6, paddingBottom: 4, borderTop: "1px dashed #ddd", marginTop: title ? 6 : 0 }
      : { display: "flex", flexDirection: "column", gap: 0, paddingTop: 7, paddingBottom: 0, marginTop: cellSize ? 2 : 0 };
  const labelStyleColumnBase: React.CSSProperties = { display: "inline-flex", flexDirection: "column", alignItems: "center", minWidth: 28 };
  const labelStyleRowBase: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, minWidth: 28 };
  const sizeStyles: React.CSSProperties = orientation === "vertical" && cellSize ? { height: cellSize, lineHeight: `${cellSize}px`, justifyContent: "center" } : {};

  return (
    <div style={{ marginTop: 8 }}>
      {title && <b>{title}</b>}
      <div style={containerStyle}>
        {Array.from({ length: 45 }, (_, i) => i + 1).map((n) => {
          const checked = excludedNumbers.includes(n);
          const bucketColor = stripBucketColor(n, monthlyBuckets);
          const handleToggle = () => {
            setExcludedNumbers((prev) =>
              prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
            );
          };
          const numSpan = (
            <span style={{
              fontSize: 11,
              lineHeight: "normal",
              background: bucketColor ?? "transparent",
              color: bucketColor ? "#fff" : "#333",
              borderRadius: 3,
              padding: bucketColor ? "0 3px" : undefined,
              minWidth: 20,
              textAlign: "center",
              display: "inline-block",
            }}>
              {n}
            </span>
          );
          if (labelPosition === "bottom") {
            return (
              <label key={n} style={{ ...labelStyleColumnBase, ...sizeStyles }} title={`Exclude ${n}`}>
                <input type="checkbox" checked={checked} onChange={handleToggle} style={{ margin: 0 }} />
                {numSpan}
              </label>
            );
          }
          return (
            <label key={n} style={{ ...labelStyleRowBase, ...sizeStyles }} title={`Exclude ${n}`}>
              <input type="checkbox" checked={checked} onChange={handleToggle} style={{ margin: 0 }} />
              {numSpan}
            </label>
          );
        })}
        {showClearButton && (
          <div style={{ display: "flex", alignItems: "center", marginLeft: orientation === "horizontal" ? 8 : 0 }}>
            <button type="button" onClick={() => setExcludedNumbers(() => [])} title="Clear user exclusions" style={{ padding: "4px 8px", fontSize: 12, marginLeft: 8 }}>Clear</button>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useMemo, useState } from "react";
import type { Draw } from "../types";
import { filterRealDrawHistory } from "../lib/realDrawHistory";
import { sortDrawsChronologically } from "../lib/recentDraws";

interface SurvivalFrailtyPanelProps {
  history: Draw[];
  excludedNumbers: number[];
  exclusionsSlot?: React.ReactNode;
}

interface GapDispersionRow {
  number: number;
  appearances: number;
  completedGaps: number;
  meanGap: number | null;
  medianGap: number | null;
  interquartileRange: number | null;
  coefficientOfVariation: number | null;
  currentDrought: number;
  droughtToMedian: number | null;
}

type GapSortKey = "number" | "currentDrought" | "droughtToMedian" | "coefficientOfVariation";

const quantile = (sorted: readonly number[], q: number): number | null => {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const fraction = position - lower;
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * fraction);
};

const buildGapDispersionRows = (history: readonly Draw[], excludedNumbers: readonly number[]): GapDispersionRow[] => {
  const excluded = new Set(excludedNumbers);
  const rows: GapDispersionRow[] = [];

  for (let number = 1; number <= 45; number += 1) {
    if (excluded.has(number)) continue;
    const eventIndices: number[] = [];
    history.forEach((draw, index) => {
      if (draw.main.includes(number) || draw.supp.includes(number)) eventIndices.push(index);
    });
    const gaps = eventIndices.slice(1).map((index, position) => index - eventIndices[position]);
    const sortedGaps = [...gaps].sort((left, right) => left - right);
    const meanGap = gaps.length > 0 ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : null;
    const medianGap = quantile(sortedGaps, 0.5);
    const q1 = quantile(sortedGaps, 0.25);
    const q3 = quantile(sortedGaps, 0.75);
    const sampleVariance = gaps.length > 1 && meanGap !== null
      ? gaps.reduce((sum, gap) => sum + ((gap - meanGap) ** 2), 0) / (gaps.length - 1)
      : null;
    const coefficientOfVariation = sampleVariance !== null && meanGap && meanGap > 0
      ? Math.sqrt(sampleVariance) / meanGap
      : null;
    const lastSeen = eventIndices[eventIndices.length - 1];
    const currentDrought = lastSeen === undefined ? history.length : history.length - lastSeen - 1;

    rows.push({
      number,
      appearances: eventIndices.length,
      completedGaps: gaps.length,
      meanGap,
      medianGap,
      interquartileRange: q1 !== null && q3 !== null ? q3 - q1 : null,
      coefficientOfVariation,
      currentDrought,
      droughtToMedian: medianGap && medianGap > 0 ? currentDrought / medianGap : null,
    });
  }

  return rows;
};

const formatDecimal = (value: number | null, digits = 2): string => (
  value === null || !Number.isFinite(value) ? "-" : value.toFixed(digits)
);

export const SurvivalFrailtyPanel: React.FC<SurvivalFrailtyPanelProps> = ({
  history,
  excludedNumbers,
  exclusionsSlot,
}) => {
  const [sortBy, setSortBy] = useState<GapSortKey>("currentDrought");
  const realHistory = useMemo(
    () => sortDrawsChronologically(filterRealDrawHistory(history, "gap-dispersion diagnostics").history),
    [history],
  );
  const rows = useMemo(
    () => buildGapDispersionRows(realHistory, excludedNumbers),
    [excludedNumbers, realHistory],
  );
  const sortedRows = useMemo(() => [...rows].sort((left, right) => {
    if (sortBy === "number") return left.number - right.number;
    const leftValue = left[sortBy] ?? Number.NEGATIVE_INFINITY;
    const rightValue = right[sortBy] ?? Number.NEGATIVE_INFINITY;
    return rightValue - leftValue || left.number - right.number;
  }), [rows, sortBy]);

  return (
    <section style={{ border: "1px solid #d2d2d7", borderRadius: 8, padding: 12, marginTop: 12, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h4 style={{ margin: 0 }}>Recurrent Gap Dispersion Diagnostic</h4>
          <div style={{ color: "#6e6e73", fontSize: 12, marginTop: 4 }}>
            Descriptive completed-gap variation across {realHistory.length} real draws, mains + supps.
          </div>
        </div>
        <label style={{ display: "grid", gap: 4, color: "#515154", fontSize: 12, fontWeight: 700 }}>
          Sort by
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as GapSortKey)}
            style={{ minHeight: 34, border: "1px solid #c7c7cc", borderRadius: 6, background: "#fff", padding: "4px 8px" }}
          >
            <option value="currentDrought">Current drought</option>
            <option value="droughtToMedian">Drought / median gap</option>
            <option value="coefficientOfVariation">Gap variability</option>
            <option value="number">Number</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: 10, borderLeft: "3px solid #73777f", background: "#f5f5f7", padding: "9px 11px", color: "#3a3a3c", fontSize: 12, lineHeight: 1.45 }}>
        This is not a fitted gamma-frailty model and it does not report next-draw probability. The former frailty percentage was removed because gap variance alone cannot identify a valid frailty distribution or calibrated event hazard.
      </div>

      {exclusionsSlot ? <div style={{ marginTop: 10 }}>{exclusionsSlot}</div> : null}

      <div style={{ overflow: "auto", maxHeight: 460, border: "1px solid #d2d2d7", borderRadius: 6, marginTop: 10 }}>
        <table style={{ width: "100%", minWidth: 760, borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
          <thead>
            <tr>
              {["Number", "Appearances", "Completed gaps", "Mean gap", "Median gap", "Gap IQR", "Gap CV", "Current drought", "Drought / median"].map((label) => (
                <th key={label} style={{ position: "sticky", top: 0, zIndex: 1, padding: "7px 8px", background: "#f5f5f7", borderBottom: "1px solid #d2d2d7", textAlign: label === "Number" ? "left" : "right" }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.number}>
                <td style={cellLeftStyle}><b>{row.number}</b></td>
                <td style={cellRightStyle}>{row.appearances}</td>
                <td style={cellRightStyle}>{row.completedGaps}</td>
                <td style={cellRightStyle}>{formatDecimal(row.meanGap, 1)}</td>
                <td style={cellRightStyle}>{formatDecimal(row.medianGap, 1)}</td>
                <td style={cellRightStyle}>{formatDecimal(row.interquartileRange, 1)}</td>
                <td style={cellRightStyle}>{formatDecimal(row.coefficientOfVariation)}</td>
                <td style={cellRightStyle}>{row.currentDrought}</td>
                <td style={cellRightStyle}>{formatDecimal(row.droughtToMedian)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 8, color: "#6e6e73", fontSize: 11, lineHeight: 1.45 }}>
        Gap = draw-index distance between consecutive appearances. IQR is the middle 50% gap width. CV is sample standard deviation divided by mean gap. Drought / median is descriptive maturity only; values above 1 mean the current drought exceeds that number&apos;s historical median completed gap.
      </div>
    </section>
  );
};

const cellLeftStyle: React.CSSProperties = {
  padding: "7px 8px",
  borderBottom: "1px solid #ececef",
  textAlign: "left",
};

const cellRightStyle: React.CSSProperties = {
  ...cellLeftStyle,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

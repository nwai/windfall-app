import React, { useState } from "react";
import type { Draw } from "../types";
import {
  backtestStrictDroughtShortlist,
  type StrictDroughtBacktestMetricSummary,
  type StrictDroughtBacktestRecord,
  type StrictDroughtBacktestResult,
} from "../lib/backtestDrought";
import { STRICT_DROUGHT_DEFAULT_THRESHOLD } from "../lib/droughtHazard";
import { HigButton, HigField } from "./shared/HigControls";

export type DroughtBacktestDisplayRecord = StrictDroughtBacktestRecord;

export function selectDroughtBacktestDisplayRecords<T>(
  records: readonly T[],
  limit: number,
): T[] {
  return [...records].reverse().slice(0, Math.max(0, limit));
}

type Props = {
  history: Draw[];
  historyScopeLabel?: string;
};

export function DroughtBacktestPanel({ history, historyScopeLabel }: Props) {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<StrictDroughtBacktestResult | null>(null);
  const [minHistory, setMinHistory] = useState(24);
  const [threshold, setThreshold] = useState(STRICT_DROUGHT_DEFAULT_THRESHOLD);
  const [topK, setTopK] = useState(8);
  const [randomTrials, setRandomTrials] = useState(5000);
  const [bootstrapIterations, setBootstrapIterations] = useState(1000);
  const [focusStart, setFocusStart] = useState("");

  const run = () => {
    if (!history || history.length <= minHistory) {
      window.alert("Not enough real draws to run a strict drought shortlist replay with this minimum training size.");
      return;
    }
    setRunning(true);
    window.setTimeout(() => {
      try {
        const result = backtestStrictDroughtShortlist(history, {
          minHistory,
          threshold,
          topK,
          randomTrials,
          bootstrapIterations,
          focusStartDrawNumber: focusStart.trim() ? Number(focusStart) : null,
        });
        setSummary(result);
      } finally {
        setRunning(false);
      }
    }, 10);
  };

  return (
    <section style={panelStyle} aria-label="Strict drought shortlist replay backtest">
      <div style={headingRowStyle}>
        <div>
          <div style={{ fontWeight: 800 }}>Strict Drought Shortlist Replay</div>
          <div style={subtleTextStyle}>
            No-lookahead replay of Strict drought mode. Random is used only as an equal-size shortlist benchmark.
          </div>
        </div>
        <HigButton variant="primary" onClick={run} disabled={running}>
          {running ? "Running..." : "Run Replay"}
        </HigButton>
      </div>

      <div style={scopeStyle}>
        Slice used: {historyScopeLabel ?? `${history.length} real draw${history.length === 1 ? "" : "s"}`}
      </div>

      <div style={controlGridStyle}>
        <HigField label="Minimum prior draws">
          <input
            type="number"
            min={1}
            max={Math.max(1, history.length - 1)}
            value={minHistory}
            onChange={(event) => setMinHistory(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
          />
        </HigField>
        <HigField label="Strict drought threshold">
          <input
            type="number"
            min={1}
            max={45}
            value={threshold}
            onChange={(event) => setThreshold(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
          />
        </HigField>
        <HigField label="Shortlist size">
          <input
            type="number"
            min={1}
            max={45}
            value={topK}
            onChange={(event) => setTopK(Math.max(1, Math.min(45, Math.floor(Number(event.target.value) || 1))))}
          />
        </HigField>
        <HigField label="Random benchmark rows">
          <input
            type="number"
            min={0}
            max={50000}
            step={500}
            value={randomTrials}
            onChange={(event) => setRandomTrials(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
          />
        </HigField>
        <HigField label="Bootstrap resamples">
          <input
            type="number"
            min={0}
            max={10000}
            step={100}
            value={bootstrapIterations}
            onChange={(event) => setBootstrapIterations(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
          />
        </HigField>
        <HigField
          label="Declared slice from D#"
          help="Optional. Use this only when you want to review an observed period such as an approximate D203 onward slice."
        >
          <input
            type="number"
            min={1}
            max={history.length}
            value={focusStart}
            placeholder="optional"
            onChange={(event) => setFocusStart(event.target.value)}
          />
        </HigField>
      </div>

      {summary ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={metricsGridStyle}>
            <MetricTile label="Eligible trials" value={String(summary.all.trials)} />
            <MetricTile label="Avg hits" value={formatDecimal(summary.all.averageHits, 2)} detail={`random ${formatDecimal(summary.all.expectedRandomAverageHits, 2)}`} />
            <MetricTile label="1-3 hit rate" value={formatPercent(summary.all.oneToThreeHitRate)} detail={`random ${formatPercent(summary.all.expectedRandomOneToThreeHitRate)}`} />
            <MetricTile label="Lift vs random" value={formatPp(summary.all.oneToThreeLift)} />
            <MetricTile label="Random p-value" value={formatPValue(summary.all.randomBenchmarkOneToThreePValue)} detail="1-3 rate >= observed" />
          </div>

          <SummaryTable
            rows={[
              summary.all,
              ...(summary.focus ? [summary.focus] : []),
            ]}
          />

          <BucketProfileTable rows={summary.bucketProfiles} />
          <OrdinalTable rows={summary.byOrdinal} />
          <MonthStageTable rows={summary.byMonthStage} excludedRows={summary.incompleteMonthStageRecordsExcluded} />
          <RecordAuditTable records={summary.records} />
        </div>
      ) : (
        <div style={emptyStateStyle}>
          Run the replay to test whether the strict drought shortlist contains 1-3 numbers from the next real draw more often than an equal-size random shortlist would.
        </div>
      )}
    </section>
  );
}

const MetricTile: React.FC<{ label: string; value: string; detail?: string }> = ({ label, value, detail }) => (
  <div style={metricTileStyle}>
    <div style={metricLabelStyle}>{label}</div>
    <div style={metricValueStyle}>{value}</div>
    {detail ? <div style={subtleTextStyle}>{detail}</div> : null}
  </div>
);

const SummaryTable: React.FC<{ rows: StrictDroughtBacktestMetricSummary[] }> = ({ rows }) => (
  <div style={tableWrapStyle}>
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thLeftStyle}>Segment</th>
          <th style={thStyle}>Trials</th>
          <th style={thStyle}>Avg size</th>
          <th style={thStyle}>Avg hits</th>
          <th style={thStyle}>Random avg</th>
          <th style={thStyle}>Hit lift</th>
          <th style={thStyle}>1-3 hit</th>
          <th style={thStyle}>Random 1-3</th>
          <th style={thStyle}>1-3 lift</th>
          <th style={thStyle}>95% CI</th>
          <th style={thStyle}>p-value</th>
          <th style={thStyle}>0 hit</th>
          <th style={thStyle}>4+ hit</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td style={tdLeftStyle}>{row.label}</td>
            <td style={tdStyle}>{row.trials}</td>
            <td style={tdStyle}>{formatDecimal(row.averageShortlistSize, 1)}</td>
            <td style={tdStyle}>{formatDecimal(row.averageHits, 2)}</td>
            <td style={tdStyle}>{formatDecimal(row.expectedRandomAverageHits, 2)}</td>
            <td style={toneTdStyle(row.averageHitLift)}>{formatDecimal(row.averageHitLift, 2)}</td>
            <td style={tdStyle}>{formatPercent(row.oneToThreeHitRate)}</td>
            <td style={tdStyle}>{formatPercent(row.expectedRandomOneToThreeHitRate)}</td>
            <td style={toneTdStyle(row.oneToThreeLift)}>{formatPp(row.oneToThreeLift)}</td>
            <td style={tdStyle}>{formatCiPercent(row.bootstrapOneToThreeCi)}</td>
            <td style={tdStyle}>{formatPValue(row.randomBenchmarkOneToThreePValue)}</td>
            <td style={tdStyle}>{formatPercent(row.zeroHitRate)}</td>
            <td style={tdStyle}>{formatPercent(row.overThreeHitRate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const BucketProfileTable: React.FC<{ rows: StrictDroughtBacktestResult["bucketProfiles"] }> = ({ rows }) => (
  <div style={tableWrapStyle}>
    <div style={sectionTitleStyle}>Monthly Bucket Contrast</div>
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thLeftStyle}>Replay rows</th>
          <th style={thStyle}>Trials</th>
          <th style={thStyle}>Avg hits</th>
          <th style={thStyle}>0 hit</th>
          <th style={thStyle}>Shortlist U</th>
          <th style={thStyle}>Shortlist 1x/2x</th>
          <th style={thStyle}>Actual U</th>
          <th style={thStyle}>Actual 1x/2x</th>
          <th style={thStyle}>Actual 3x+</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td style={tdLeftStyle}>{row.label}</td>
            <td style={tdStyle}>{row.trials}</td>
            <td style={tdStyle}>{formatDecimal(row.averageHits, 2)}</td>
            <td style={tdStyle}>{formatPercent(row.zeroHitRate)}</td>
            <td style={tdStyle}>{formatDecimal(row.averageShortlistUndrawn, 2)}</td>
            <td style={tdStyle}>{formatDecimal(row.averageShortlistActiveOneTwo, 2)}</td>
            <td style={tdStyle}>{formatDecimal(row.averageActualUndrawnOrigin, 2)}</td>
            <td style={tdStyle}>{formatDecimal(row.averageActualActiveOneTwoOrigin, 2)}</td>
            <td style={tdStyle}>{formatDecimal(row.averageActualUpperOrigin, 2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const OrdinalTable: React.FC<{ rows: StrictDroughtBacktestResult["byOrdinal"] }> = ({ rows }) => (
  <div style={tableWrapStyle}>
    <div style={sectionTitleStyle}>By Draw Ordinal</div>
    <div style={ordinalScrollRegionStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thLeftStyle}>Draw</th>
            <th style={thStyle}>Trials</th>
            <th style={thStyle}>Avg hits</th>
            <th style={thStyle}>1-3 hit</th>
            <th style={thStyle}>Random 1-3</th>
            <th style={thStyle}>Lift</th>
            <th style={thStyle}>0 hit</th>
            <th style={thStyle}>Shortlist U</th>
            <th style={thStyle}>Actual U</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.ordinal}>
              <td style={tdLeftStyle}>D{row.ordinal}</td>
              <td style={tdStyle}>{row.trials}</td>
              <td style={tdStyle}>{formatDecimal(row.averageHits, 2)}</td>
              <td style={tdStyle}>{formatPercent(row.oneToThreeHitRate)}</td>
              <td style={tdStyle}>{formatPercent(row.expectedRandomOneToThreeHitRate)}</td>
              <td style={toneTdStyle(row.oneToThreeHitRate - row.expectedRandomOneToThreeHitRate)}>
                {formatPp(row.oneToThreeHitRate - row.expectedRandomOneToThreeHitRate)}
              </td>
              <td style={tdStyle}>{formatPercent(row.zeroHitRate)}</td>
              <td style={tdStyle}>{formatDecimal(row.averageShortlistUndrawn, 2)}</td>
              <td style={tdStyle}>{formatDecimal(row.averageActualUndrawnOrigin, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const MonthStageTable: React.FC<{
  rows: StrictDroughtBacktestResult["byMonthStage"];
  excludedRows: number;
}> = ({ rows, excludedRows }) => (
  <div style={tableWrapStyle}>
    <div style={sectionTitleStyle}>
      Completed-Month Stage Split
      {excludedRows ? <span style={sectionNoteStyle}> {excludedRows} current/incomplete-month row{excludedRows === 1 ? "" : "s"} excluded from this split.</span> : null}
    </div>
    <div style={monthStageScrollRegionStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thLeftStyle}>Context</th>
            <th style={thStyle}>Trials</th>
            <th style={thStyle}>Avg hits</th>
            <th style={thStyle}>1-3 hit</th>
            <th style={thStyle}>Random 1-3</th>
            <th style={thStyle}>Lift</th>
            <th style={thStyle}>0 hit</th>
            <th style={thStyle}>Shortlist U</th>
            <th style={thStyle}>Actual U</th>
            <th style={thStyle}>Actual 1x/2x</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.monthDrawCount}-${row.ordinal}`}>
              <td style={tdLeftStyle}>
                {row.monthDrawCount}D month · D{row.ordinal}
                <span style={stageContextNoteStyle}>
                  {row.isFinalDraw ? "final" : `${row.remainingDrawsInMonth} left`}
                </span>
              </td>
              <td style={tdStyle}>{row.trials}</td>
              <td style={tdStyle}>{formatDecimal(row.averageHits, 2)}</td>
              <td style={tdStyle}>{formatPercent(row.oneToThreeHitRate)}</td>
              <td style={tdStyle}>{formatPercent(row.expectedRandomOneToThreeHitRate)}</td>
              <td style={toneTdStyle(row.oneToThreeLift)}>{formatPp(row.oneToThreeLift)}</td>
              <td style={tdStyle}>{formatPercent(row.zeroHitRate)}</td>
              <td style={tdStyle}>{formatDecimal(row.averageShortlistUndrawn, 2)}</td>
              <td style={tdStyle}>{formatDecimal(row.averageActualUndrawnOrigin, 2)}</td>
              <td style={tdStyle}>{formatDecimal(row.averageActualActiveOneTwoOrigin, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const RecordAuditTable: React.FC<{ records: StrictDroughtBacktestRecord[] }> = ({ records }) => (
  <div style={tableWrapStyle}>
    <div style={sectionTitleStyle}>Latest Audit Rows</div>
    <div style={auditScrollRegionStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thLeftStyle}>Target</th>
            <th style={thLeftStyle}>Date</th>
            <th style={thStyle}>Month draw</th>
            <th style={thStyle}>Month stage</th>
            <th style={thStyle}>Prior draws</th>
            <th style={thLeftStyle}>Strict shortlist before draw</th>
            <th style={thLeftStyle}>Shortlist buckets</th>
            <th style={thLeftStyle}>Actual draw</th>
            <th style={thLeftStyle}>Actual origin</th>
            <th style={thLeftStyle}>Hits</th>
          </tr>
        </thead>
        <tbody>
          {selectDroughtBacktestDisplayRecords(records, 80).map((record) => (
            <tr key={`${record.targetIndex}-${record.targetDate ?? ""}`}>
              <td style={tdLeftStyle}>D{record.targetDrawNumber}</td>
              <td style={tdLeftStyle}>{record.targetDate ?? "unknown"}</td>
              <td style={tdStyle}>{record.targetDrawOrdinal ? `D${record.targetDrawOrdinal}` : "n/a"}</td>
              <td style={tdStyle}>{formatRecordStage(record)}</td>
              <td style={tdStyle}>{record.trainingDraws}</td>
              <td style={tdLeftStyle}>{record.shortlist.join(", ") || "none"}</td>
              <td style={tdLeftStyle}>{formatBucketCounts(record.shortlistBucketCountsBefore)}</td>
              <td style={tdLeftStyle}>{record.actualNumbers.join(", ")}</td>
              <td style={tdLeftStyle}>{formatBucketCounts(record.actualOriginBucketCounts)}</td>
              <td style={{ ...tdLeftStyle, minWidth: 260 }}>
                {record.hits.length ? (
                  <span style={auditHitsStyle}>
                    {record.hits.map((hit) => (
                      <AuditHit key={`${hit.num}-${hit.rank}-${hit.where}`} hit={hit} />
                    ))}
                  </span>
                ) : "0"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const formatBucketCounts = (counts: StrictDroughtBacktestRecord["actualOriginBucketCounts"]): string => (
  Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} ${count}`)
    .join(" · ") || "none"
);

const formatRecordStage = (record: StrictDroughtBacktestRecord): string => {
  if (!record.targetMonthDrawCount || !record.targetDrawOrdinal) return "n/a";
  if (!record.targetMonthComplete) return `${record.targetMonthDrawCount}D known · incomplete`;
  if (record.remainingDrawsInMonth === 0) return `${record.targetMonthDrawCount}D · final`;
  if (typeof record.remainingDrawsInMonth === "number") return `${record.targetMonthDrawCount}D · ${record.remainingDrawsInMonth} left`;
  return `${record.targetMonthDrawCount}D`;
};

const AuditHit: React.FC<{ hit: StrictDroughtBacktestRecord["hits"][number] }> = ({ hit }) => (
  <span style={auditHitPillStyle}>
    <span style={auditHitNumberStyle}>{hit.num}</span>
    <span style={auditHitRankStyle}>rank {hit.rank}</span>
    <span style={auditHitWhereStyle(hit.where)}>{hit.where}</span>
  </span>
);

const formatDecimal = (value: number, digits: number): string => value.toFixed(digits);
const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const formatPp = (value: number): string => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}pp`;
const formatPValue = (value: number | null): string => value == null ? "n/a" : value.toFixed(4);
const formatCiPercent = (value: [number, number] | null): string => (
  value ? `${formatPercent(value[0])} to ${formatPercent(value[1])}` : "n/a"
);

const panelStyle: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: 10,
  padding: 12,
  background: "#ffffff",
  display: "grid",
  gap: 12,
};
const headingRowStyle: React.CSSProperties = { display: "flex", gap: 12, justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" };
const scopeStyle: React.CSSProperties = { border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: 8, padding: "8px 10px", color: "#475569", fontSize: 12, fontWeight: 700 };
const subtleTextStyle: React.CSSProperties = { color: "#64748b", fontSize: 12 };
const controlGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, alignItems: "end" };
const metricsGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 };
const metricTileStyle: React.CSSProperties = { border: "1px solid #e2e8f0", background: "#fbfdff", borderRadius: 8, padding: 10 };
const metricLabelStyle: React.CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0 };
const metricValueStyle: React.CSSProperties = { color: "#0f172a", fontSize: 22, fontWeight: 850, fontVariantNumeric: "tabular-nums", lineHeight: 1.1, marginTop: 3 };
const emptyStateStyle: React.CSSProperties = { border: "1px dashed #cbd5e1", borderRadius: 8, background: "#f8fafc", color: "#475569", padding: 12, fontSize: 13 };
const tableWrapStyle: React.CSSProperties = { overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 8 };
const ordinalScrollRegionStyle: React.CSSProperties = { maxHeight: 260, overflow: "auto" };
const monthStageScrollRegionStyle: React.CSSProperties = { maxHeight: 360, overflow: "auto" };
const auditScrollRegionStyle: React.CSSProperties = { maxHeight: 420, overflow: "auto" };
const sectionTitleStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 12, fontWeight: 850, color: "#334155", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" };
const sectionNoteStyle: React.CSSProperties = { color: "#64748b", fontWeight: 650, marginLeft: 6 };
const stageContextNoteStyle: React.CSSProperties = { color: "#64748b", fontWeight: 700, marginLeft: 6 };
const tableStyle: React.CSSProperties = { width: "100%", minWidth: 980, borderCollapse: "collapse", fontSize: 12 };
const thStyle: React.CSSProperties = { textAlign: "right", padding: "7px 8px", borderBottom: "1px solid #dbe4ee", background: "#f8fafc", whiteSpace: "nowrap", fontWeight: 850, position: "sticky", top: 0, zIndex: 1 };
const thLeftStyle: React.CSSProperties = { ...thStyle, textAlign: "left" };
const tdStyle: React.CSSProperties = { textAlign: "right", padding: "7px 8px", borderBottom: "1px solid #eef2f7", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
const tdLeftStyle: React.CSSProperties = { ...tdStyle, textAlign: "left" };
const auditHitsStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" };
const auditHitPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  border: "1px solid #dbe4ee",
  borderRadius: 999,
  background: "#ffffff",
  padding: "2px 7px",
  lineHeight: 1.4,
};
const auditHitNumberStyle: React.CSSProperties = { color: "#0f172a", fontWeight: 900 };
const auditHitRankStyle: React.CSSProperties = { color: "#7c3aed", fontWeight: 850 };
const auditHitWhereStyle = (where: "main" | "supp"): React.CSSProperties => ({
  color: where === "main" ? "#166534" : "#047857",
  fontWeight: 800,
});
const toneTdStyle = (value: number): React.CSSProperties => ({
  ...tdStyle,
  color: value >= 0 ? "#166534" : "#b91c1c",
  fontWeight: 800,
});

export default DroughtBacktestPanel;

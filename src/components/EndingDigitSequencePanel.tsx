import React, { useEffect, useMemo, useState } from "react";

import type { Draw } from "../types";
import {
  analyzeD1TerminalMomentum,
  analyzeEndingDigitSequences,
  analyzeEndingDigitMonthStage,
  buildEndingDigitMonthOptions,
  predictNextEndingDigitSequence,
  type D1TerminalMomentumAnalysis,
  type D1TerminalMomentumDigitRow,
  type D1TerminalMomentumStageMode,
  type D1TerminalMomentumStrength,
  type EndingDigitSequencePrediction,
  type EndingDigitPredictionSequence,
  type EndingDigitSequenceDrawStats,
  type EndingDigitMonthOption,
  type EndingDigitMonthStageAnalysis,
  type EndingDigitMonthStageDigitRow,
} from "../lib/endingDigitSequences";
import { monthlyBucketDisplayForTimes } from "../lib/monthlyDrawSummary";

interface EndingDigitSequencePanelProps {
  draws: Draw[];
  allDraws?: Draw[];
}

type SortMode = "dateDesc" | "coveredDesc" | "runDesc";
type HorizonChoice = "6" | "10" | "20" | "36" | "WFMQYH";

const StatChip: React.FC<{
  label: string;
  value: string;
  title?: string;
}> = ({ label, value, title }) => (
  <div
    title={title}
    style={{
      padding: "8px 10px",
      borderRadius: 8,
      border: "1px solid #e5e7eb",
      background: "#fafcff",
      minWidth: 120,
    }}
  >
    <div style={{ fontSize: 10, color: "#78909c", textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
    <div style={{ marginTop: 2, fontSize: 16, fontWeight: 700, color: "#263238", fontVariantNumeric: "tabular-nums" }}>{value}</div>
  </div>
);

const FrequencyBars: React.FC<{
  title: string;
  description: string;
  freq: Record<number, number>;
  tone: "indigo" | "teal";
}> = ({ title, description, freq, tone }) => {
  const entries = Object.entries(freq).map(([key, count]) => ({ key, count }));
  const maxCount = Math.max(...entries.map((entry) => entry.count), 1);
  const barColor = tone === "indigo" ? "linear-gradient(180deg, #c5cae9 0%, #3949ab 100%)" : "linear-gradient(180deg, #b2dfdb 0%, #00796b 100%)";

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#fff" }}>
      <div style={{ fontWeight: 700, color: "#223", fontSize: 14 }}>{title}</div>
      <div style={{ fontSize: 11, color: "#667", marginTop: 3, marginBottom: 10 }}>{description}</div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 12, color: "#999" }}>No draws available.</div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, minHeight: 160, borderBottom: "1px solid #e5e7eb", paddingBottom: 6 }}>
          {entries.map((entry) => (
            <div key={entry.key} style={{ flex: 1, minWidth: 0, textAlign: "center" }} title={`${entry.key}: ${entry.count} draw${entry.count === 1 ? "" : "s"}`}>
              <div style={{ fontSize: 11, color: "#546e7a", marginBottom: 4, fontVariantNumeric: "tabular-nums" }}>{entry.count}</div>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", height: 120 }}>
                <div
                  style={{
                    width: "100%",
                    maxWidth: 48,
                    height: `${Math.max((entry.count / maxCount) * 100, 2)}%`,
                    minHeight: entry.count > 0 ? 6 : 0,
                    borderRadius: "6px 6px 0 0",
                    background: barColor,
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: "#455a64", marginTop: 6, fontWeight: 700 }}>{entry.key}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const formatRuns = (draw: EndingDigitSequenceDrawStats): string => {
  if (!draw.maxRuns.length) return "—";
  return draw.maxRuns.map((run) => `${run.digits.join("-")} (${run.coveredNumbers})`).join(" | ");
};

const formatSequence = (digits: readonly number[]): string => digits.join("-");

const formatComponent = (value: number): string => `${Math.round(value * 100)}%`;

export const EndingDigitSequencePanel: React.FC<EndingDigitSequencePanelProps> = ({ draws, allDraws }) => {
  const [includeSupp, setIncludeSupp] = useState<boolean>(true);
  const [sortMode, setSortMode] = useState<SortMode>("dateDesc");
  const [recentWindowChoice, setRecentWindowChoice] = useState<HorizonChoice>("20");
  const [halfLifeChoice, setHalfLifeChoice] = useState<HorizonChoice>("10");
  const [prediction, setPrediction] = useState<EndingDigitSequencePrediction | null>(null);
  const [monthStageMonthKey, setMonthStageMonthKey] = useState<string>("");
  const [monthStageDrawCount, setMonthStageDrawCount] = useState<number>(1);
  const monthStageDraws = allDraws?.length ? allDraws : draws;
  const drawSignature = useMemo(
    () => draws
      .map((draw) => `${draw.date}:${draw.main.join(",")}:${draw.supp?.join(",") ?? ""}`)
      .join("|"),
    [draws],
  );

  const summary = useMemo(
    () => analyzeEndingDigitSequences(draws, { includeSupp }),
    [draws, includeSupp],
  );

  useEffect(() => {
    setPrediction(null);
  }, [drawSignature, halfLifeChoice, includeSupp, recentWindowChoice]);

  const monthOptions = useMemo(
    () => buildEndingDigitMonthOptions(monthStageDraws, { includeSupp }),
    [includeSupp, monthStageDraws],
  );

  useEffect(() => {
    if (monthOptions.length === 0) {
      if (monthStageMonthKey) setMonthStageMonthKey("");
      return;
    }
    if (!monthOptions.some((option) => option.monthKey === monthStageMonthKey)) {
      setMonthStageMonthKey(monthOptions[0].monthKey);
      setMonthStageDrawCount(1);
    }
  }, [monthOptions, monthStageMonthKey]);

  const selectedMonthOption = useMemo(
    () => monthOptions.find((option) => option.monthKey === monthStageMonthKey) ?? monthOptions[0] ?? null,
    [monthOptions, monthStageMonthKey],
  );

  const effectiveMonthStageDrawCount = selectedMonthOption
    ? Math.min(selectedMonthOption.drawCount, Math.max(1, monthStageDrawCount))
    : 1;

  useEffect(() => {
    if (!selectedMonthOption) return;
    if (monthStageDrawCount > selectedMonthOption.drawCount) {
      setMonthStageDrawCount(selectedMonthOption.drawCount);
    }
    if (monthStageDrawCount < 1) {
      setMonthStageDrawCount(1);
    }
  }, [monthStageDrawCount, selectedMonthOption]);

  const monthStageAnalysis = useMemo(
    () => analyzeEndingDigitMonthStage(monthStageDraws, {
      includeSupp,
      monthKey: selectedMonthOption?.monthKey,
      drawCount: effectiveMonthStageDrawCount,
    }),
    [effectiveMonthStageDrawCount, includeSupp, monthStageDraws, selectedMonthOption?.monthKey],
  );
  const terminalMomentumAnalysis = useMemo(
    () => analyzeD1TerminalMomentum(monthStageDraws, {
      includeSupp,
      monthKey: selectedMonthOption?.monthKey,
      drawCount: effectiveMonthStageDrawCount,
    }),
    [effectiveMonthStageDrawCount, includeSupp, monthStageDraws, selectedMonthOption?.monthKey],
  );

  const sortedDraws = useMemo(() => {
    const rows = [...summary.perDraw];
    switch (sortMode) {
      case "coveredDesc":
        return rows.sort((a, b) => b.coveredNumbers - a.coveredNumbers || b.maxRunLength - a.maxRunLength || b.date.localeCompare(a.date));
      case "runDesc":
        return rows.sort((a, b) => b.maxRunLength - a.maxRunLength || b.coveredNumbers - a.coveredNumbers || b.date.localeCompare(a.date));
      case "dateDesc":
      default:
        return rows.reverse();
    }
  }, [sortMode, summary.perDraw]);

  const pct = (value: number): string => {
    if (summary.totalDraws === 0) return "0.0%";
    return `${((value / summary.totalDraws) * 100).toFixed(1)}%`;
  };

  const handleSuggestNext = () => {
    setPrediction(predictNextEndingDigitSequence(draws, {
      includeSupp,
      sequenceLength: "auto",
      recentWindow: resolveHorizon(recentWindowChoice, draws.length, 20),
      halfLife: resolveHorizon(halfLifeChoice, draws.length, 10),
    }));
  };

  return (
    <section style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", padding: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#223" }}>Ending Digit Sequence Analyzer</div>
          <div style={{ fontSize: 12, color: "#667", marginTop: 2 }}>
            Checks whether draws cluster into consecutive ending-digit runs such as 2-3-4-5 or 8-9-0.
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "#444" }} title="Include supplementary numbers in the ending-digit sequence analysis">
            <input
              type="checkbox"
              checked={includeSupp}
              onChange={(e) => setIncludeSupp(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Include supp (main + supp)
          </label>
          <label style={{ fontSize: 12, color: "#444" }}>
            Sort recent draws:
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} style={{ marginLeft: 6, fontSize: 12 }}>
              <option value="dateDesc">Newest first</option>
              <option value="coveredDesc">Covered numbers</option>
              <option value="runDesc">Run length</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: "#444" }}>
            Recent:
            <select value={recentWindowChoice} onChange={(e) => setRecentWindowChoice(e.target.value as HorizonChoice)} style={{ marginLeft: 6, fontSize: 12 }}>
              <option value="6">6</option>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="36">36</option>
              <option value="WFMQYH">WFMQYH</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: "#444" }}>
            Half-life:
            <select value={halfLifeChoice} onChange={(e) => setHalfLifeChoice(e.target.value as HorizonChoice)} style={{ marginLeft: 6, fontSize: 12 }}>
              <option value="6">6</option>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="36">36</option>
              <option value="WFMQYH">WFMQYH</option>
            </select>
          </label>
          <button
            type="button"
            onClick={handleSuggestNext}
            disabled={draws.length === 0}
            style={buttonStyle(draws.length === 0)}
            title="Rank ending-digit runs from transitions, WFMQYH ending history, adjacent combos, observed shape, and hot/cold movement"
          >
            Rank ending candidates
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <StatChip label="Window" value={`${summary.totalDraws}`} title="Number of draws analyzed in the active window" />
        <StatChip label="Run ≥ 3" value={`${summary.drawsWithMaxRunAtLeast3} · ${pct(summary.drawsWithMaxRunAtLeast3)}`} title="Draws whose longest ending-digit run is at least 3 digits long" />
        <StatChip label="Run ≥ 4" value={`${summary.drawsWithMaxRunAtLeast4} · ${pct(summary.drawsWithMaxRunAtLeast4)}`} title="Draws whose longest ending-digit run is at least 4 digits long" />
        <StatChip label="Covered ≥ 4" value={`${summary.drawsWithCoveredNumbersAtLeast4} · ${pct(summary.drawsWithCoveredNumbersAtLeast4)}`} title="Draws where the strongest ending-digit run covers at least 4 numbers" />
        <StatChip label="Run ≥ 5" value={`${summary.drawsWithMaxRunAtLeast5} · ${pct(summary.drawsWithMaxRunAtLeast5)}`} title="Draws whose longest ending-digit run is at least 5 digits long" />
      </div>

      <div style={{ fontSize: 12, color: "#556", marginBottom: 12, lineHeight: 1.45 }}>
        Ending digits are treated <b>circularly</b>, so <b>8-9-0</b> and <b>9-0-1-2</b> count as consecutive runs. “Covered numbers” means how many numbers in the draw fall inside the strongest consecutive ending-digit run.
      </div>

      <TerminalDigitMonthStageCard
        analysis={monthStageAnalysis}
        monthOptions={monthOptions}
        selectedMonthKey={selectedMonthOption?.monthKey ?? ""}
        selectedDrawCount={effectiveMonthStageDrawCount}
        onMonthChange={(monthKey) => {
          setMonthStageMonthKey(monthKey);
          setMonthStageDrawCount(1);
        }}
        onDrawCountChange={setMonthStageDrawCount}
      />

      <D1TerminalMomentumCard analysis={terminalMomentumAnalysis} />

      {prediction && <PredictionResult prediction={prediction} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 14 }}>
        <FrequencyBars
          title="Longest ending-digit run per draw"
          description="How often a draw’s strongest distinct ending-digit run is length 1, 2, 3, 4, and so on."
          freq={summary.maxRunLengthFrequency}
          tone="indigo"
        />
        <FrequencyBars
          title="Numbers covered by strongest run"
          description="How many actual numbers in a draw are explained by the strongest ending-digit sequence."
          freq={summary.coveredNumbersFrequency}
          tone="teal"
        />
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e5e7eb", background: "#fafcff", fontWeight: 700, color: "#223" }}>
          Recent / strongest examples
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thLeft}>Date</th>
                <th style={thLeft}>Numbers</th>
                <th style={thLeft}>Endings</th>
                <th style={thLeft}>Strongest run(s)</th>
                <th style={thRight}>Run len</th>
                <th style={thRight}>Covered</th>
              </tr>
            </thead>
            <tbody>
              {sortedDraws.slice(0, 18).map((draw) => (
                <tr key={`${draw.date}-${draw.numbers.join("-")}`} style={{ borderTop: "1px solid #edf2f7" }}>
                  <td style={tdLeft}>{draw.date}</td>
                  <td style={tdLeft}>{draw.numbers.join(" ")}</td>
                  <td style={tdLeft}>{draw.endings.join(" ")}</td>
                  <td style={tdLeft}>{formatRuns(draw)}</td>
                  <td style={tdRight}>{draw.maxRunLength}</td>
                  <td style={tdRight}>{draw.coveredNumbers}</td>
                </tr>
              ))}
              {sortedDraws.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 12, color: "#999", textAlign: "center" }}>
                    No draws available for ending-digit sequence analysis.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

const TerminalDigitMonthStageCard: React.FC<{
  analysis: EndingDigitMonthStageAnalysis | null;
  monthOptions: EndingDigitMonthOption[];
  selectedMonthKey: string;
  selectedDrawCount: number;
  onMonthChange: (monthKey: string) => void;
  onDrawCountChange: (drawCount: number) => void;
}> = ({
  analysis,
  monthOptions,
  selectedMonthKey,
  selectedDrawCount,
  onMonthChange,
  onDrawCountChange,
}) => {
  const selectedMonth = monthOptions.find((option) => option.monthKey === selectedMonthKey) ?? monthOptions[0] ?? null;
  const drawCountOptions = selectedMonth
    ? Array.from({ length: selectedMonth.drawCount }, (_, index) => index + 1)
    : [];
  const rows = [...(analysis?.rows ?? [])].sort((left, right) => (
    Number(right.firstDrawMultiple) - Number(left.firstDrawMultiple)
    || right.firstDrawHits - left.firstDrawHits
    || right.postStageHits - left.postStageHits
    || left.digit - right.digit
  ));

  return (
    <section style={monthStageShell}>
      <div style={monthStageHeader}>
        <div>
          <div style={predictionTitle}>Terminal Digit Month-Stage Movement</div>
          <div style={mutedText}>
            Observe whether terminal digits that appear early in a month keep advancing through monthly buckets. This is descriptive evidence, not a forecast.
          </div>
        </div>
        <div style={monthStageControls}>
          <label style={controlLabel}>
            Month
            <select
              value={selectedMonthKey}
              onChange={(event) => onMonthChange(event.target.value)}
              disabled={monthOptions.length === 0}
              style={selectStyle}
            >
              {monthOptions.map((option) => (
                <option key={option.monthKey} value={option.monthKey}>
                  {option.monthLabel} · {option.drawCount} draw{option.drawCount === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
          <label style={controlLabel}>
            First draws
            <select
              value={selectedDrawCount}
              onChange={(event) => onDrawCountChange(Number(event.target.value))}
              disabled={!selectedMonth}
              style={selectStyle}
            >
              {drawCountOptions.map((count) => (
                <option key={count} value={count}>
                  {count} of {selectedMonth?.drawCount ?? count}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!analysis ? (
        <div style={{ ...mutedText, marginTop: 10 }}>No real dated draw history is available for month-stage terminal digit analysis.</div>
      ) : (
        <>
          <div style={monthStageMeta}>
            <span>{analysis.monthLabel}</span>
            <span>{analysis.includeSupp ? "Mains + supps" : "Mains only"}</span>
            <span>D1 {analysis.firstDrawDate}</span>
            <span>
              First {analysis.selectedDrawCount} draw{analysis.selectedDrawCount === 1 ? "" : "s"} of {analysis.totalDrawsInMonth}
            </span>
          </div>

          {analysis.warnings.length > 0 && (
            <div style={monthStageWarning}>
              {analysis.warnings.join(" ")}
            </div>
          )}

          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 960 }}>
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thLeft}>Digit</th>
                  <th style={thLeft}>Family</th>
                  <th style={thLeft}>D1 numbers</th>
                  <th style={thRight}>First-N hits</th>
                  <th style={thLeft}>Stage buckets</th>
                  <th style={thLeft}>Month-end buckets</th>
                  <th style={thRight}>After N</th>
                  <th style={thLeft}>Prior D1 multi context</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <TerminalDigitMonthStageRow key={row.digit} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};

const TerminalDigitMonthStageRow: React.FC<{ row: EndingDigitMonthStageDigitRow }> = ({ row }) => {
  const d1Title = row.firstDrawMultiple
    ? `Digit ${row.digit} had ${row.firstDrawHits} first-draw hits, so it is marked as a D1 multi-hit family.`
    : `Digit ${row.digit} had ${row.firstDrawHits} first-draw hit${row.firstDrawHits === 1 ? "" : "s"}.`;
  const contextTitle = [
    `Prior months with D1 multi-hit: ${row.context.priorMonthsWithFirstDrawMultiple}`,
    `Prior months without: ${row.context.priorMonthsWithoutFirstDrawMultiple}`,
    `Avg later hits when multi: ${formatNullableAverage(row.context.avgPostD1HitsWhenMultiple)}`,
    `Avg later hits when not: ${formatNullableAverage(row.context.avgPostD1HitsWhenNotMultiple)}`,
  ].join(" · ");

  return (
    <tr style={{ borderTop: "1px solid #edf2f7", background: row.firstDrawMultiple ? "#fff7ed" : "#fff" }}>
      <td style={tdLeft}>
        <span style={digitCell(row.firstDrawMultiple)} title={d1Title}>
          {row.digit}
        </span>
      </td>
      <td style={tdLeft}>{row.familyNumbers.join(" ")}</td>
      <td style={tdLeft}>
        {row.firstDrawNumbers.length ? row.firstDrawNumbers.join(" ") : "—"}
        {row.firstDrawMultiple && <span style={d1Badge}>D1 multi</span>}
      </td>
      <td style={tdRight}>
        {row.stageHits} · {row.stageUnique} unique
      </td>
      <td style={tdLeft}>
        <BucketMixPills mix={row.stageBucketMix} />
      </td>
      <td style={tdLeft}>
        <BucketMixPills mix={row.monthEndBucketMix} />
      </td>
      <td style={tdRight} title="Later hits and number families that advanced after the selected first-N stage.">
        {row.postStageHits} hit{row.postStageHits === 1 ? "" : "s"} · {row.numbersAdvancedAfterStage} advanced
      </td>
      <td style={tdLeft} title={contextTitle}>
        {formatPriorContext(row)}
      </td>
    </tr>
  );
};

const BucketMixPills: React.FC<{ mix: number[] }> = ({ mix }) => {
  const entries = mix
    .map((count, times) => ({ count, times }))
    .filter((entry) => entry.count > 0);

  return (
    <div style={bucketMixList}>
      {entries.map((entry) => {
        const display = monthlyBucketDisplayForTimes(entry.times);
        return (
          <span
            key={entry.times}
            style={{
              ...bucketMixPill,
              borderColor: display.color,
              background: display.softColor,
              color: display.color,
            }}
          >
            {display.label} {entry.count}
          </span>
        );
      })}
    </div>
  );
};

const formatNullableAverage = (value: number | null): string => (
  value === null ? "n/a" : value.toFixed(1)
);

const formatPriorContext = (row: EndingDigitMonthStageDigitRow): string => {
  const { context } = row;
  const when = formatNullableAverage(context.avgPostD1HitsWhenMultiple);
  const whenNot = formatNullableAverage(context.avgPostD1HitsWhenNotMultiple);
  const lift = context.lift === null ? "n/a" : `${context.lift.toFixed(2)}x`;
  return `multi ${when} vs not ${whenNot} · lift ${lift}`;
};

const D1TerminalMomentumCard: React.FC<{ analysis: D1TerminalMomentumAnalysis | null }> = ({ analysis }) => {
  const rows = analysis?.activeRows ?? [];

  return (
    <section style={momentumShell}>
      <div style={monthStageHeader}>
        <div>
          <div style={predictionTitle}>D1 Terminal Momentum Diagnostic</div>
          <div style={mutedText}>
            Observe which D1 multi-hit terminal families would receive a staged soft-generation influence if the future ON/OFF rule is enabled.
          </div>
        </div>
        {analysis && (
          <div style={momentumSummary}>
            <span style={strengthPill(analysis.overallSuggestedStrength)}>
              SGI preview {analysis.overallSuggestedStrength}
            </span>
            <span style={modePill}>{stageModeLabel(analysis.stageMode)}</span>
          </div>
        )}
      </div>

      {!analysis ? (
        <div style={{ ...mutedText, marginTop: 10 }}>No real dated draw history is available for D1 terminal momentum analysis.</div>
      ) : (
        <>
          <div style={monthStageMeta}>
            <span>{analysis.monthLabel}</span>
            <span>{analysis.includeSupp ? "Mains + supps" : "Mains only"}</span>
            <span>D{analysis.completedStageDrawCount} complete</span>
            <span>
              Target {analysis.stageMode === "closed-review" ? "closed" : `D${analysis.targetDrawNumber}`}
            </span>
          </div>

          {analysis.warnings.length > 0 && (
            <div style={monthStageWarning}>{analysis.warnings.join(" ")}</div>
          )}

          {rows.length === 0 ? (
            <div style={{ ...mutedText, marginTop: 10 }}>
              No D1 multi-hit terminal families were found for the selected month, so the future SGI would stay internally off.
            </div>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 1040 }}>
                <thead>
                  <tr style={{ background: "#f8fbff" }}>
                    <th style={thLeft}>Digit</th>
                    <th style={thLeft}>D1 family</th>
                    <th style={thRight}>Stage movement</th>
                    <th style={thLeft}>Internal strength</th>
                    <th style={thRight}>Prior next hit</th>
                    <th style={thRight}>Prior unique add</th>
                    <th style={thRight}>Post-stage momentum</th>
                    <th style={thLeft}>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <D1TerminalMomentumRow key={row.digit} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
};

const D1TerminalMomentumRow: React.FC<{ row: D1TerminalMomentumDigitRow }> = ({ row }) => {
  return (
    <tr style={{ borderTop: "1px solid #edf2f7" }}>
      <td style={tdLeft}>
        <span style={digitCell(row.suggestedStrength !== "off")} title={`Terminal digit ${row.digit} is ${row.parity}.`}>
          {row.digit}
        </span>
      </td>
      <td style={tdLeft}>
        {row.d1Numbers.join(" ")}
        <span style={d1Badge}>D1 multi</span>
      </td>
      <td style={tdRight} title="Stage hits and unique count after the selected first-N draws, plus new growth since D1.">
        {row.stageHits} · {row.stageUnique} unique
        <br />
        <span style={subtleCellText}>+{row.stageNewHits} hits · +{row.stageNewUnique} unique</span>
      </td>
      <td style={tdLeft}>
        <span style={strengthPill(row.suggestedStrength)}>{row.suggestedStrength}</span>
      </td>
      <td style={tdRight} title={`${row.prior.d1MultiTrials} prior D1-multi same-stage trial${row.prior.d1MultiTrials === 1 ? "" : "s"}.`}>
        {formatRate(row.prior.nextHitRate)}
        <br />
        <span style={subtleCellText}>{row.prior.d1MultiTrials} trials</span>
      </td>
      <td style={tdRight} title="Prior same-stage months where the next draw added at least one previously unseen member of this terminal family.">
        {formatRate(row.prior.nextUniqueRate)}
        <br />
        <span style={subtleCellText}>lift {formatLift(row.prior.uniqueLift)}</span>
      </td>
      <td style={tdRight} title="Average later hits and unique additions after the same stage in prior D1-multi months.">
        {formatNullableAverage(row.prior.avgPostStageHits)} hits
        <br />
        <span style={subtleCellText}>{formatNullableAverage(row.prior.avgPostStageUniqueAdds)} unique</span>
      </td>
      <td style={tdLeft}>{row.reason}</td>
    </tr>
  );
};

const stageModeLabel = (mode: D1TerminalMomentumStageMode): string => {
  if (mode === "early-unique") return "early unique expansion";
  if (mode === "terminal-momentum") return "terminal momentum";
  return "closed month review";
};

const formatRate = (value: number | null): string => (
  value === null ? "n/a" : `${Math.round(value * 100)}%`
);

const formatLift = (value: number | null): string => (
  value === null ? "n/a" : `${value.toFixed(2)}x`
);

function resolveHorizon(choice: HorizonChoice, drawCount: number, fallback: number): number {
  if (choice === "WFMQYH") return Math.max(1, drawCount);
  const numeric = Number(choice);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

const PredictionResult: React.FC<{ prediction: EndingDigitSequencePrediction }> = ({ prediction }) => {
  if (!prediction.topSequence) {
    return (
      <section style={predictionShell}>
        <div style={predictionTitle}>Best-Supported Ending Run Candidates</div>
        <div style={mutedText}>No valid WFMQYH draw history is available for a sequence recommendation.</div>
      </section>
    );
  }

  const top = prediction.topSequence;
  const target = prediction.windowShape.target;

  return (
    <section style={predictionShell}>
      <div style={predictionHeader}>
        <div>
          <div style={predictionTitle}>Best-Supported Ending Run Candidates</div>
          <div style={mutedText}>
            Best-supported candidates from {prediction.totalDraws} selected draw{prediction.totalDraws === 1 ? "" : "s"}.
          </div>
        </div>
        <div style={sequenceBadge} title="This is a transition-informed evidence score, not a probability guarantee">
          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Top candidate</span>
          <b style={{ fontSize: 20, color: "#0f172a", letterSpacing: 0 }}>{formatSequence(top.digits)}</b>
        </div>
      </div>

      <div style={predictionMetrics}>
        <Metric label="Evidence" value={`${top.score.toFixed(1)}/100`} />
        <Metric label="Calibrated" value={top.confidenceLabel} />
        <Metric label="Full-run hits" value={`${top.fullRunHits}/${prediction.totalDraws}`} />
        <Metric label="Recent/Half-life" value={`${prediction.recentWindow}/${prediction.halfLife}`} />
        <Metric label="Backtest partial" value={`${(prediction.backtest.partialHitRate * 100).toFixed(0)}%`} />
      </div>

      <div style={componentGrid}>
        <ComponentBar label="Transition" value={top.components.transition} />
        <ComponentBar label="Ending history" value={top.components.endingHistory} />
        <ComponentBar label="Adjacent combos" value={top.components.adjacentCombos} />
        <ComponentBar label="Hot/cold" value={top.components.hotCold} />
        <ComponentBar label="Observed shape" value={top.components.observedShape} />
        <ComponentBar label="Run-length prior" value={top.components.runLengthPrior} />
        <ComponentBar label="Recency" value={top.components.recency} />
      </div>

      <div style={predictionColumns}>
        <div>
          <div style={sectionLabel}>Drivers</div>
          <ul style={driverList}>
            {top.drivers.map((driver) => (
              <li key={driver}>{driver}</li>
            ))}
          </ul>
        </div>

        <div>
          <div style={sectionLabel}>Current Window Shape</div>
          <div style={shapeGrid}>
            <span>Low {target.lowMidHigh.low.toFixed(1)}</span>
            <span>Mid {target.lowMidHigh.mid.toFixed(1)}</span>
            <span>High {target.lowMidHigh.high.toFixed(1)}</span>
            <span>Odd {target.evenOdd.odd.toFixed(1)}</span>
            <span>Even {target.evenOdd.even.toFixed(1)}</span>
            <span>Mean {target.meanNumber.toFixed(1)}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={sectionLabel}>Walk-Forward Backtest</div>
        <div style={shapeGrid}>
          <span>{prediction.backtest.evaluatedTransitions} trials</span>
          <span>Exact {(prediction.backtest.exactHitRate * 100).toFixed(0)}%</span>
          <span>Partial {(prediction.backtest.partialHitRate * 100).toFixed(0)}%</span>
          <span>Overlap {(prediction.backtest.averageOverlap * 100).toFixed(0)}%</span>
        </div>
      </div>

      {top.comboContributors.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={sectionLabel}>Adjacent Combo Contributors</div>
          <div style={comboList}>
            {top.comboContributors.map((combo) => (
              <span key={combo.key} style={comboPill} title={`Count ${combo.count}; longest run ${combo.longestRun}; current streak ${combo.currentStreak}`}>
                {combo.key} → {formatSequence(combo.endings)}
              </span>
            ))}
          </div>
        </div>
      )}

      {prediction.alternatives.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={sectionLabel}>Alternatives</div>
          <div style={comboList}>
            {prediction.alternatives.slice(0, 4).map((sequence) => (
              <SequencePill key={formatSequence(sequence.digits)} sequence={sequence} />
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <div style={sectionLabel}>Top Ending Digits</div>
        <div style={comboList}>
          {prediction.digitScores.slice(0, 6).map((digit) => (
            <span key={digit.digit} style={digitPill} title={`History ${digit.endingHistory.toFixed(1)} · hot/cold ${digit.hotCold.toFixed(1)}`}>
              {digit.digit} · {digit.total.toFixed(0)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={metricBox}>
    <div style={metricLabel}>{label}</div>
    <div style={metricValue}>{value}</div>
  </div>
);

const ComponentBar: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div>
    <div style={componentLabel}>
      <span>{label}</span>
      <b>{formatComponent(value)}</b>
    </div>
    <div style={barTrack}>
      <div style={{ ...barFill, width: `${Math.round(clampPercent(value))}%` }} />
    </div>
  </div>
);

const SequencePill: React.FC<{ sequence: EndingDigitPredictionSequence }> = ({ sequence }) => (
  <span style={comboPill} title={`Evidence ${sequence.score.toFixed(1)}/100`}>
    {formatSequence(sequence.digits)} · {sequence.score.toFixed(0)}
  </span>
);

const clampPercent = (value: number): number => Math.min(100, Math.max(0, value * 100));

const thLeft: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid #e5e7eb",
  color: "#455a64",
};

const thRight: React.CSSProperties = {
  ...thLeft,
  textAlign: "right",
};

const tdLeft: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  color: "#223",
};

const tdRight: React.CSSProperties = {
  ...tdLeft,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const buttonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: disabled ? "#f1f5f9" : "#0f172a",
  color: disabled ? "#94a3b8" : "#fff",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 12,
  fontWeight: 700,
});

const predictionShell: React.CSSProperties = {
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  padding: 12,
  background: "#f8fafc",
  marginBottom: 14,
};

const predictionHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const predictionTitle: React.CSSProperties = {
  fontWeight: 800,
  color: "#0f172a",
  fontSize: 14,
};

const mutedText: React.CSSProperties = {
  marginTop: 3,
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.35,
};

const sequenceBadge: React.CSSProperties = {
  minWidth: 120,
  display: "flex",
  flexDirection: "column",
  gap: 2,
  alignItems: "flex-end",
};

const predictionMetrics: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 8,
  marginTop: 10,
};

const metricBox: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#fff",
  padding: "8px 10px",
};

const metricLabel: React.CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  fontWeight: 700,
};

const metricValue: React.CSSProperties = {
  color: "#0f172a",
  marginTop: 2,
  fontSize: 15,
  fontWeight: 800,
  textTransform: "capitalize",
};

const componentGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 8,
  marginTop: 10,
};

const componentLabel: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  color: "#334155",
  fontSize: 11,
  fontWeight: 700,
};

const barTrack: React.CSSProperties = {
  height: 6,
  borderRadius: 6,
  background: "#e2e8f0",
  overflow: "hidden",
  marginTop: 4,
};

const barFill: React.CSSProperties = {
  height: "100%",
  borderRadius: 6,
  background: "#2563eb",
};

const predictionColumns: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginTop: 10,
};

const sectionLabel: React.CSSProperties = {
  color: "#334155",
  fontSize: 12,
  fontWeight: 800,
  marginBottom: 6,
};

const driverList: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  color: "#334155",
  fontSize: 12,
  lineHeight: 1.45,
};

const shapeGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))",
  gap: 6,
  color: "#334155",
  fontSize: 12,
};

const comboList: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const comboPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 24,
  padding: "3px 8px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  fontSize: 11,
  fontWeight: 700,
};

const digitPill: React.CSSProperties = {
  ...comboPill,
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  color: "#1d4ed8",
};

const monthStageShell: React.CSSProperties = {
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  padding: 12,
  background: "#fcfdff",
  marginBottom: 14,
};

const momentumShell: React.CSSProperties = {
  ...monthStageShell,
  background: "#fbfffd",
  border: "1px solid #d6eadf",
};

const monthStageHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const monthStageControls: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "flex-end",
};

const controlLabel: React.CSSProperties = {
  display: "grid",
  gap: 4,
  color: "#475569",
  fontSize: 11,
  fontWeight: 800,
};

const selectStyle: React.CSSProperties = {
  minHeight: 32,
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  padding: "4px 8px",
  fontSize: 12,
  fontWeight: 700,
};

const monthStageMeta: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 10,
  color: "#334155",
  fontSize: 11,
  fontWeight: 800,
};

const monthStageWarning: React.CSSProperties = {
  marginTop: 8,
  border: "1px solid #fed7aa",
  borderRadius: 8,
  background: "#fff7ed",
  color: "#9a3412",
  padding: "8px 10px",
  fontSize: 12,
  lineHeight: 1.35,
};

const digitCell = (highlight: boolean): React.CSSProperties => ({
  display: "inline-grid",
  placeItems: "center",
  width: 28,
  height: 28,
  borderRadius: 14,
  border: highlight ? "2px solid #ea580c" : "1px solid #cbd5e1",
  background: highlight ? "#fed7aa" : "#fff",
  color: highlight ? "#9a3412" : "#0f172a",
  fontSize: 13,
  fontWeight: 900,
  fontVariantNumeric: "tabular-nums",
});

const d1Badge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 20,
  marginLeft: 6,
  padding: "1px 6px",
  borderRadius: 999,
  border: "1px solid #fdba74",
  background: "#ffedd5",
  color: "#9a3412",
  fontSize: 10,
  fontWeight: 900,
  textTransform: "uppercase",
};

const bucketMixList: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
};

const bucketMixPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 22,
  padding: "2px 6px",
  borderRadius: 999,
  border: "1px solid #cbd5e1",
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const momentumSummary: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  justifyContent: "flex-end",
  alignItems: "center",
};

const strengthPalette: Record<D1TerminalMomentumStrength, { border: string; bg: string; color: string }> = {
  off: { border: "#cbd5e1", bg: "#f8fafc", color: "#64748b" },
  light: { border: "#bfdbfe", bg: "#eff6ff", color: "#1d4ed8" },
  normal: { border: "#86efac", bg: "#f0fdf4", color: "#15803d" },
  strong: { border: "#f9a8d4", bg: "#fdf2f8", color: "#be185d" },
};

const strengthPill = (strength: D1TerminalMomentumStrength): React.CSSProperties => {
  const palette = strengthPalette[strength];
  return {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 24,
    borderRadius: 999,
    border: `1px solid ${palette.border}`,
    background: palette.bg,
    color: palette.color,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
};

const modePill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 24,
  borderRadius: 999,
  border: "1px solid #d6d3d1",
  background: "#fafaf9",
  color: "#44403c",
  padding: "2px 8px",
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const subtleCellText: React.CSSProperties = {
  color: "#64748b",
  fontSize: 11,
};

export default EndingDigitSequencePanel;

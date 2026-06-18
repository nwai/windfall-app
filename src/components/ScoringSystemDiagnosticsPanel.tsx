import React, { useMemo, useState } from "react";
import {
  analyzeScoringSystemDiagnostics,
  normalizeScoringMonthSearch,
  normalizeTerminalDigitSetSearch,
  type NumberDiagnosticRow,
  type RatioDiagnosticRow,
  type ScoringMonthSearch,
  type ScoringDiagnosticsScope,
  type ScoringSystemDiagnosticsResult,
  type TerminalDigitDiagnosticRow,
  type TerminalDigitSetExample,
  type TerminalDigitSetDiagnosticRow,
} from "../lib/scoringSystemDiagnostics";
import {
  analyzeScoringRankDrift,
  type RankDriftEntity,
  type RankDriftStep,
  type ScoringRankDriftSnapshot,
} from "../lib/scoringRankDrift";
import type { ScoringGenerationInfluence } from "../lib/scoringGenerationInfluence";
import type { Draw } from "../types";
import { HigField, InfoHelp } from "./shared/HigControls";

type TabKey = "ratios" | "numbers" | "terminal-digits" | "digit-sets" | "straight-runs" | "rank-drift";

interface ScoringSystemDiagnosticsPanelProps {
  realHistory: Draw[];
  realFilteredHistory: Draw[];
  generationInfluence?: ScoringGenerationInfluence;
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "ratios", label: "Ratios" },
  { key: "numbers", label: "Numbers" },
  { key: "terminal-digits", label: "Terminal Digits" },
  { key: "digit-sets", label: "Digit Sets" },
  { key: "straight-runs", label: "Straight Runs" },
  { key: "rank-drift", label: "Rank Drift" },
];

export const ScoringSystemDiagnosticsPanel: React.FC<ScoringSystemDiagnosticsPanelProps> = ({
  realHistory,
  realFilteredHistory,
  generationInfluence = "off",
}) => {
  const [scope, setScope] = useState<ScoringDiagnosticsScope>("mains-plus-supps");
  const [activeTab, setActiveTab] = useState<TabKey>("ratios");
  const [digitSetLength, setDigitSetLength] = useState<string>("all");
  const [observedOnly, setObservedOnly] = useState(true);
  const [topN, setTopN] = useState(50);

  const analysis = useMemo(
    () => analyzeScoringSystemDiagnostics(realHistory, realFilteredHistory, { scope }),
    [realHistory, realFilteredHistory, scope],
  );

  if (analysis.provenance.fullValidDraws === 0 && analysis.provenance.filteredValidDraws === 0) {
    return (
      <section style={panelStyle} aria-label="Scoring System Diagnostics">
        <Header generationInfluence={generationInfluence} />
        <div style={emptyStyle}>No valid real draw history available for scoring diagnostics.</div>
      </section>
    );
  }

  return (
    <section style={panelStyle} aria-label="Scoring System Diagnostics">
      <Header generationInfluence={generationInfluence} />
      <Controls scope={scope} onScopeChange={setScope} />
      <StatusStrip analysis={analysis} generationInfluence={generationInfluence} />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <ActiveTabContent
        analysis={analysis}
        realHistory={realHistory}
        scope={scope}
        activeTab={activeTab}
        digitSetLength={digitSetLength}
        setDigitSetLength={setDigitSetLength}
        observedOnly={observedOnly}
        setObservedOnly={setObservedOnly}
        topN={topN}
        setTopN={setTopN}
      />
    </section>
  );
};

const formatGenerationInfluenceLabel = (influence: ScoringGenerationInfluence): string => (
  influence === "off" ? "Off" : `${influence.slice(0, 1).toUpperCase()}${influence.slice(1)}`
);

const Header: React.FC<{ generationInfluence: ScoringGenerationInfluence }> = ({ generationInfluence }) => {
  const influenceLabel = formatGenerationInfluenceLabel(generationInfluence);
  const influenceActive = generationInfluence !== "off";

  return (
  <div style={headerStyle}>
    <div>
      <h3 style={titleStyle}>Scoring System Diagnostics</h3>
      <p style={subtitleStyle}>
        {influenceActive
          ? `Currently used as ${influenceLabel} diagnostic evidence weighting in generation; these are not calibrated next-draw probabilities.`
          : "Observe-only structural and history-derived scores. This panel does not change candidate generation."}
      </p>
    </div>
    <InfoHelp label="How Scoring System Diagnostics works">
      Scores are diagnostic support measures. Base scores come from structure or exact combinations; full-history and WFMQYH scores come from observed real draw counts. They are not calibrated next-draw probabilities. If Scoring diagnostics influence is enabled, this panel's scores can be used as transparent generation weighting evidence.
    </InfoHelp>
  </div>
  );
};

const Controls: React.FC<{
  scope: ScoringDiagnosticsScope;
  onScopeChange: (scope: ScoringDiagnosticsScope) => void;
}> = ({ scope, onScopeChange }) => (
  <div style={controlsStyle}>
    <HigField label="Scope" help="Mains + supps uses the eight-number blueprint. Mains only recomputes the six-number baseline.">
      <select
        name="scoringDiagnosticsScope"
        value={scope}
        onChange={(event) => onScopeChange(event.target.value as ScoringDiagnosticsScope)}
        style={selectStyle}
      >
        <option value="mains-plus-supps">Mains + supps (8)</option>
        <option value="mains">Mains only (6)</option>
      </select>
    </HigField>
  </div>
);

const StatusStrip: React.FC<{
  analysis: ScoringSystemDiagnosticsResult;
  generationInfluence: ScoringGenerationInfluence;
}> = ({ analysis, generationInfluence }) => {
  const provenance = analysis.provenance;
  const influenceLabel = formatGenerationInfluenceLabel(generationInfluence);
  return (
    <div style={statusStripStyle}>
      <Metric label="Scope" value={provenance.scope === "mains-plus-supps" ? "Mains + supps (8)" : "Mains only (6)"} />
      <Metric label="Full real draws" value={String(provenance.fullValidDraws)} />
      <Metric label="WFMQYH real draws" value={String(provenance.filteredValidDraws)} />
      <Metric label="Skipped rows" value={String(provenance.fullSkippedDraws + provenance.filteredSkippedDraws)} />
      <Metric label="State" value={generationInfluence === "off" ? "Observe-only" : `Influence: ${influenceLabel}`} />
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={metricStyle}>
    <div style={metricLabelStyle}>{label}</div>
    <div style={metricValueStyle}>{value}</div>
  </div>
);

const TabBar: React.FC<{ activeTab: TabKey; onTabChange: (tab: TabKey) => void }> = ({ activeTab, onTabChange }) => (
  <div style={tabBarStyle} role="group" aria-label="Scoring diagnostics sections">
    {tabs.map((tab) => (
      <button
        key={tab.key}
        type="button"
        aria-pressed={activeTab === tab.key}
        onClick={() => onTabChange(tab.key)}
        style={activeTab === tab.key ? activeTabButtonStyle : tabButtonStyle}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

const ActiveTabContent: React.FC<{
  analysis: ScoringSystemDiagnosticsResult;
  realHistory: Draw[];
  scope: ScoringDiagnosticsScope;
  activeTab: TabKey;
  digitSetLength: string;
  setDigitSetLength: (value: string) => void;
  observedOnly: boolean;
  setObservedOnly: (value: boolean) => void;
  topN: number;
  setTopN: (value: number) => void;
}> = ({
  analysis,
  realHistory,
  scope,
  activeTab,
  digitSetLength,
  setDigitSetLength,
  observedOnly,
  setObservedOnly,
  topN,
  setTopN,
}) => {
  if (activeTab === "ratios") return <RatioTable rows={analysis.ratioRows} />;
  if (activeTab === "numbers") return <NumberTable rows={analysis.numberRows} />;
  if (activeTab === "terminal-digits") return <TerminalDigitTable rows={analysis.terminalDigitRows} />;
  if (activeTab === "rank-drift") return <RankDriftTable realHistory={realHistory} scope={scope} />;
  if (activeTab === "straight-runs") {
    return (
      <DigitSetTable
        title="Straight terminal digit run diagnostics"
        rows={analysis.straightRunRows}
        digitSetLength={digitSetLength}
        setDigitSetLength={setDigitSetLength}
        observedOnly={observedOnly}
        setObservedOnly={setObservedOnly}
        topN={topN}
        setTopN={setTopN}
        showStraightReference
      />
    );
  }
  return (
    <DigitSetTable
      title="Terminal digit set diagnostics"
      rows={analysis.terminalDigitSetRows}
      digitSetLength={digitSetLength}
      setDigitSetLength={setDigitSetLength}
      observedOnly={observedOnly}
      setObservedOnly={setObservedOnly}
      topN={topN}
      setTopN={setTopN}
    />
  );
};

const RankMovement: React.FC<{ value: number | null }> = ({ value }) => {
  if (value == null) return <>-</>;
  if (value === 0) return <>0</>;
  return <>{value > 0 ? `+${value}` : value}</>;
};

const formatScore = (value: number): string => (
  Number.isInteger(value) ? String(value) : value.toFixed(2)
);

const formatPercent = (value: number): string => `${value.toFixed(2)}%`;

interface DigitSetSearchFilter {
  month: ScoringMonthSearch | null;
  digitKey: string | null;
}

const RatioTable: React.FC<{ rows: RatioDiagnosticRow[] }> = ({ rows }) => (
  <div style={tableWrapStyle}>
    <table style={tableStyle} aria-label="Odd/even ratio scoring diagnostics">
      <thead>
        <tr>
          <th style={thStyle}>Ratio</th>
          <th style={thStyle}>Base</th>
          <th style={thStyle}>Baseline</th>
          <th style={thStyle}>Possible</th>
          <th style={thStyle}>Full count</th>
          <th style={thStyle}>Full score</th>
          <th style={thStyle}>WFMQYH count</th>
          <th style={thStyle}>WFMQYH score</th>
          <th style={thStyle}>Combined</th>
          <th style={thStyle}>Rank</th>
          <th style={thStyle}>Move</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.ratio}>
            <td style={tdStrongStyle}>{row.ratio}</td>
            <td style={tdStyle}>{formatScore(row.baseScore)}</td>
            <td style={tdStyle}>{formatPercent(row.baselinePercent)}</td>
            <td style={tdStyle}>{row.totalCombinations.toLocaleString()}</td>
            <td style={tdStyle}>{row.fullHistoryCount} ({formatPercent(row.fullHistoryPercent)})</td>
            <td style={tdStyle}>{formatScore(row.fullHistoryScore)}</td>
            <td style={tdStyle}>{row.wfmqyhCount} ({formatPercent(row.wfmqyhPercent)})</td>
            <td style={tdStyle}>{formatScore(row.wfmqyhScore)}</td>
            <td style={tdStrongStyle}>{formatScore(row.combinedDiagnosticScore)}</td>
            <td style={tdStyle}>{row.rank}</td>
            <td style={tdStyle}><RankMovement value={row.rankMovement} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const NumberTable: React.FC<{ rows: NumberDiagnosticRow[] }> = ({ rows }) => (
  <div style={{ display: "grid", gap: 8 }}>
    <p style={noteStyle}>
      Number rows include a terminal digit base score. Every number still has equal raw lottery inclusion probability in a fair draw.
    </p>
    <div style={tableWrapStyle}>
      <table style={tableStyle} aria-label="Number scoring diagnostics">
        <thead>
          <tr>
            <th style={thStyle}>Number</th>
            <th style={thStyle}>Terminal digit</th>
            <th style={thStyle}>Base</th>
            <th style={thStyle}>Full count</th>
            <th style={thStyle}>Full score</th>
            <th style={thStyle}>WFMQYH count</th>
            <th style={thStyle}>WFMQYH score</th>
            <th style={thStyle}>Combined</th>
            <th style={thStyle}>Rank</th>
            <th style={thStyle}>Move</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 45).map((row) => (
            <tr key={row.number}>
              <td style={tdStrongStyle}>{row.number}</td>
              <td style={tdStyle}>{row.terminalDigit}</td>
              <td style={tdStyle}>{formatScore(row.terminalDigitBaseScore)}</td>
              <td style={tdStyle}>{row.fullHistoryCount} ({formatPercent(row.fullHistoryPercent)})</td>
              <td style={tdStyle}>{formatScore(row.fullHistoryScore)}</td>
              <td style={tdStyle}>{row.wfmqyhCount} ({formatPercent(row.wfmqyhPercent)})</td>
              <td style={tdStyle}>{formatScore(row.wfmqyhScore)}</td>
              <td style={tdStrongStyle}>{formatScore(row.combinedDiagnosticScore)}</td>
              <td style={tdStyle}>{row.rank}</td>
              <td style={tdStyle}><RankMovement value={row.rankMovement} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const TerminalDigitTable: React.FC<{ rows: TerminalDigitDiagnosticRow[] }> = ({ rows }) => (
  <div style={tableWrapStyle}>
    <table style={tableStyle} aria-label="Terminal digit scoring diagnostics">
      <thead>
        <tr>
          <th style={thStyle}>Terminal digit</th>
          <th style={thStyle}>Base</th>
          <th style={thStyle}>Full count</th>
          <th style={thStyle}>Full score</th>
          <th style={thStyle}>WFMQYH count</th>
          <th style={thStyle}>WFMQYH score</th>
          <th style={thStyle}>Combined</th>
          <th style={thStyle}>Rank</th>
          <th style={thStyle}>Move</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.terminalDigit}>
            <td style={tdStrongStyle}>{row.terminalDigit}</td>
            <td style={tdStyle}>{formatScore(row.baseScore)}</td>
            <td style={tdStyle}>{row.fullHistoryCount} ({formatPercent(row.fullHistoryPercent)})</td>
            <td style={tdStyle}>{formatScore(row.fullHistoryScore)}</td>
            <td style={tdStyle}>{row.wfmqyhCount} ({formatPercent(row.wfmqyhPercent)})</td>
            <td style={tdStyle}>{formatScore(row.wfmqyhScore)}</td>
            <td style={tdStrongStyle}>{formatScore(row.combinedDiagnosticScore)}</td>
            <td style={tdStyle}>{row.rank}</td>
            <td style={tdStyle}><RankMovement value={row.rankMovement} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const filterDigitSetRows = (
  rows: TerminalDigitSetDiagnosticRow[],
  digitSetLength: string,
  observedOnly: boolean,
  searchFilter: DigitSetSearchFilter,
  topN: number,
): TerminalDigitSetDiagnosticRow[] => {
  const lengthFiltered = digitSetLength === "all"
    ? rows
    : rows.filter((row) => row.length === Number(digitSetLength));
  const observationFiltered = observedOnly
    ? lengthFiltered.filter((row) => (
      row.fullHistoryCount > 0
      || row.wfmqyhCount > 0
      || row.fullContainedCount > 0
      || row.wfmqyhContainedCount > 0
    ))
    : lengthFiltered;
  const searchFiltered = observationFiltered.filter((row) => {
    const monthMatches = searchFilter.month == null
      || row.fullContainedMonths.includes(searchFilter.month.key)
      || row.wfmqyhContainedMonths.includes(searchFilter.month.key);
    const digitMatches = searchFilter.digitKey == null || row.key === searchFilter.digitKey;
    return monthMatches && digitMatches;
  });
  return searchFiltered.slice(0, topN);
};

const DigitSetTable: React.FC<{
  title: string;
  rows: TerminalDigitSetDiagnosticRow[];
  digitSetLength: string;
  setDigitSetLength: (value: string) => void;
  observedOnly: boolean;
  setObservedOnly: (value: boolean) => void;
  topN: number;
  setTopN: (value: number) => void;
  showStraightReference?: boolean;
}> = ({
  title,
  rows,
  digitSetLength,
  setDigitSetLength,
  observedOnly,
  setObservedOnly,
  topN,
  setTopN,
  showStraightReference = false,
}) => {
  const [monthSearchInput, setMonthSearchInput] = useState("");
  const [digitSearchInput, setDigitSearchInput] = useState("");
  const [searchFilter, setSearchFilter] = useState<DigitSetSearchFilter>({ month: null, digitKey: null });
  const [searchMessage, setSearchMessage] = useState("");
  const visibleRows = filterDigitSetRows(rows, digitSetLength, observedOnly, searchFilter, topN);

  const handleSearch = () => {
    const monthText = monthSearchInput.trim();
    const digitText = digitSearchInput.trim();
    const month = monthText ? normalizeScoringMonthSearch(monthText) : null;
    const digitKey = digitText ? normalizeTerminalDigitSetSearch(digitText) : null;

    if ((monthText && !month) || (digitText && !digitKey)) {
      setSearchMessage("Enter a month like 6/26 or unique terminal digits like 3,4.");
      return;
    }

    setSearchFilter({ month, digitKey });
    const activeLabels = [month?.label, digitKey].filter(Boolean);
    setSearchMessage(activeLabels.length > 0 ? `Search active: ${activeLabels.join("; ")}` : "No search filters active.");
  };

  const clearSearch = () => {
    setMonthSearchInput("");
    setDigitSearchInput("");
    setSearchFilter({ month: null, digitKey: null });
    setSearchMessage("");
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={digitSetControlsStyle}>
        <HigField label="Set length" help="Filter terminal digit sets by number of unique terminal digits.">
          <select
            name="scoringDigitSetLength"
            value={digitSetLength}
            onChange={(event) => setDigitSetLength(event.target.value)}
            style={selectStyle}
          >
            <option value="all">All</option>
            {[2, 3, 4, 5, 6, 7, 8].map((length) => (
              <option key={length} value={length}>{length}</option>
            ))}
          </select>
        </HigField>
        <HigField label="Top rows" help="Limit visible rows after filters are applied.">
          <select
            name="scoringTopN"
            value={topN}
            onChange={(event) => setTopN(Number(event.target.value))}
            style={selectStyle}
          >
            {[25, 50, 100, 250, 1002].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </HigField>
        <label style={checkboxLabelStyle}>
          <input
            name="scoringObservedOnly"
            type="checkbox"
            checked={observedOnly}
            onChange={(event) => setObservedOnly(event.target.checked)}
          />
          Observed only
        </label>
      </div>

      <div style={searchControlsStyle}>
        <HigField label="Month" help="Optional. Accepts formats like 6/26, 2026-06, or June 2026.">
          <input
            name="scoringSearchMonth"
            value={monthSearchInput}
            onChange={(event) => setMonthSearchInput(event.target.value)}
            placeholder="6/26"
            style={inputStyle}
          />
        </HigField>
        <HigField label="Unique terminal digits" help="Optional. Accepts 3,4, 4 3, or 34 and normalizes to an unordered set.">
          <input
            name="scoringSearchDigits"
            value={digitSearchInput}
            onChange={(event) => setDigitSearchInput(event.target.value)}
            placeholder="3,4"
            style={inputStyle}
          />
        </HigField>
        <button type="button" onClick={handleSearch} style={searchButtonStyle}>Search</button>
        <button type="button" onClick={clearSearch} style={clearButtonStyle}>Clear</button>
      </div>

      {searchMessage ? <div style={searchMessageStyle}>{searchMessage}</div> : null}

      {showStraightReference ? (
        <p style={noteStyle}>
          Ordered reference: 84 ascending/descending labels. Observe-only scoring uses 42 unordered straight-run sets to avoid double counting.
        </p>
      ) : null}

      <div style={noteStyle}>
        Showing {visibleRows.length} of {rows.length} rows after filters.
      </div>

      <div style={scrollableTableWrapStyle} role="region" aria-label={`${title} scroll area`}>
        <table style={tableStyle} aria-label={title}>
          <thead>
            <tr>
              <th style={thStyle}>Unique terminal digits</th>
              <th style={thStyle}>Length</th>
              <th style={thStyle}>Straight</th>
              <th style={thStyle}>Full exact hits</th>
              <th style={thStyle}>Full set score</th>
              <th style={thStyle}>Full contained hits</th>
              <th style={thStyle}>Full contained score</th>
              <th style={thStyle}>WFMQYH exact hits</th>
              <th style={thStyle}>WFMQYH set score</th>
              <th style={thStyle}>WFMQYH contained hits</th>
              <th style={thStyle}>WFMQYH contained score</th>
              <th style={thStyle}>Full length score</th>
              <th style={thStyle}>WFMQYH length score</th>
              <th style={thStyle}>Combined</th>
              <th style={thStyle}>Rank</th>
              <th style={thStyle}>Move</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.key}>
                <td style={tdStrongStyle}><UniqueDigitsCell row={row} /></td>
                <td style={tdStyle}>{row.length}</td>
                <td style={tdStyle}>{row.isStraightRun ? "Yes" : "No"}</td>
                <td style={tdStyle}>{row.fullHistoryCount} ({formatPercent(row.fullHistoryPercent)})</td>
                <td style={tdStyle}>{formatScore(row.fullHistoryScore)}</td>
                <td style={tdStyle}>{row.fullContainedCount} ({formatPercent(row.fullContainedPercent)})</td>
                <td style={tdStyle}>{formatScore(row.fullContainedScore)}</td>
                <td style={tdStyle}>{row.wfmqyhCount} ({formatPercent(row.wfmqyhPercent)})</td>
                <td style={tdStyle}>{formatScore(row.wfmqyhScore)}</td>
                <td style={tdStyle}>{row.wfmqyhContainedCount} ({formatPercent(row.wfmqyhContainedPercent)})</td>
                <td style={tdStyle}>{formatScore(row.wfmqyhContainedScore)}</td>
                <td style={tdStyle}>{formatScore(row.fullHistoryLengthScore)}</td>
                <td style={tdStyle}>{formatScore(row.wfmqyhLengthScore)}</td>
                <td style={tdStrongStyle}>{formatScore(row.combinedDiagnosticScore)}</td>
                <td style={tdStyle}>{row.rank}</td>
                <td style={tdStyle}><RankMovement value={row.rankMovement} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const formatExample = (example: TerminalDigitSetExample): string => (
  `Draw: ${example.date}\nMains: ${example.main.join(",")}\nSupps: ${example.supp.join(",")}`
);

const UniqueDigitsCell: React.FC<{ row: TerminalDigitSetDiagnosticRow }> = ({ row }) => {
  const exactExamples = row.wfmqyhExamples.length > 0 ? row.wfmqyhExamples : row.fullHistoryExamples;
  const containedExamples = row.wfmqyhContainedExamples.length > 0 ? row.wfmqyhContainedExamples : row.fullContainedExamples;
  const examples = exactExamples.length > 0 ? exactExamples : containedExamples;
  const exampleKind = exactExamples.length > 0 ? "Exact example" : "Contained example";
  if (examples.length === 0) return <span>{row.key}</span>;

  const title = examples.map(formatExample).join("\n\n");
  const primary = examples[0];

  return (
    <details style={digitsDetailsStyle}>
      <summary style={digitsSummaryStyle} title={title} aria-label={`Examples for unique terminal digits ${row.key}`}>
        {row.key}
      </summary>
      <div style={examplePopoverStyle}>
        <div>{exampleKind}</div>
        <div>Draw: {primary.date}</div>
        <div>Mains: {primary.main.join(",")}</div>
        <div>Supps: {primary.supp.join(",")}</div>
        {examples.length > 1 ? <div>+{examples.length - 1} more examples available on mouse over</div> : null}
      </div>
    </details>
  );
};

const rankDriftEntityOptions: Array<{ value: RankDriftEntity; label: string }> = [
  { value: "numbers", label: "Numbers" },
  { value: "terminal-digits", label: "Terminal digits" },
  { value: "digit-sets", label: "Digit sets" },
  { value: "straight-runs", label: "Straight runs" },
];

const rankDriftStepOptions: Array<{ value: RankDriftStep; label: string }> = [
  { value: "draw", label: "Every draw" },
  { value: "weekly", label: "Every 3 draws" },
  { value: "month", label: "Every month" },
];

const formatNullable = (value: number | null): string => (
  value == null ? "-" : formatScore(value)
);

const RankDriftTable: React.FC<{ realHistory: Draw[]; scope: ScoringDiagnosticsScope }> = ({ realHistory, scope }) => {
  const [entity, setEntity] = useState<RankDriftEntity>("terminal-digits");
  const [itemKey, setItemKey] = useState("1");
  const [startAfter, setStartAfter] = useState(50);
  const [step, setStep] = useState<RankDriftStep>("draw");
  const [filteredWindow, setFilteredWindow] = useState(50);

  const result = useMemo(
    () => analyzeScoringRankDrift(realHistory, {
      entity,
      key: itemKey,
      scope,
      startAfter,
      step,
      filteredWindow,
    }),
    [entity, filteredWindow, itemKey, realHistory, scope, startAfter, step],
  );

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={noteStyle}>
        Observed movement only. Walk-forward snapshots recompute diagnostics using only draws available at each cutoff and do not change generation.
      </p>

      <div style={searchControlsStyle}>
        <HigField label="Entity" help="Choose which scoring row family to observe over time.">
          <select
            name="rankDriftEntity"
            value={entity}
            onChange={(event) => setEntity(event.target.value as RankDriftEntity)}
            style={selectStyle}
          >
            {rankDriftEntityOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </HigField>
        <HigField label="Item" help="Use a number, terminal digit, or unique terminal digit set such as 1,2.">
          <input
            name="rankDriftItem"
            value={itemKey}
            onChange={(event) => setItemKey(event.target.value)}
            placeholder="1"
            style={inputStyle}
          />
        </HigField>
        <HigField label="Start after" help="Minimum prior real draws before snapshots begin.">
          <select
            name="rankDriftStartAfter"
            value={startAfter}
            onChange={(event) => setStartAfter(Number(event.target.value))}
            style={selectStyle}
          >
            {[2, 10, 20, 50, 100].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </HigField>
        <HigField label="Step" help="How densely to sample walk-forward snapshots.">
          <select
            name="rankDriftStep"
            value={step}
            onChange={(event) => setStep(event.target.value as RankDriftStep)}
            style={selectStyle}
          >
            {rankDriftStepOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </HigField>
        <HigField label="Window" help="Recent filtered-history window used inside each snapshot.">
          <select
            name="rankDriftWindow"
            value={filteredWindow}
            onChange={(event) => setFilteredWindow(Number(event.target.value))}
            style={selectStyle}
          >
            {[2, 10, 20, 50, 100].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </HigField>
      </div>

      <div style={rankDriftHeaderStyle}>
        <div>
          <h4 style={sectionTitleStyle}>{result.selectedLabel}</h4>
          <p style={noteStyle}>Walk-forward snapshots: {result.provenance.usedSnapshots} of {result.provenance.validDraws} valid real draws.</p>
        </div>
        <RankSparkline snapshots={result.snapshots} />
      </div>

      <div style={statusStripStyle}>
        <Metric label="Direction" value={result.summary.direction} />
        <Metric label="Current rank" value={formatNullable(result.summary.currentRank)} />
        <Metric label="Best rank" value={formatNullable(result.summary.bestRank)} />
        <Metric label="Worst rank" value={formatNullable(result.summary.worstRank)} />
        <Metric label="Rank change" value={formatNullable(result.summary.rankChange)} />
        <Metric label="Score change" value={formatNullable(result.summary.scoreChange)} />
        <Metric label="Volatility" value={formatScore(result.summary.volatility)} />
      </div>

      {result.warnings.length > 0 ? (
        <div style={warningStyle}>{result.warnings.join(" ")}</div>
      ) : null}

      <div style={rankDriftScrollWrapStyle} role="region" aria-label="Rank drift snapshots scroll area">
        <table style={rankDriftTableStyle} aria-label="Rank drift walk-forward snapshots">
          <thead>
            <tr>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Draws</th>
              <th style={thStyle}>Rank</th>
              <th style={thStyle}>Combined</th>
              <th style={thStyle}>Full score</th>
              <th style={thStyle}>WFMQYH score</th>
              <th style={thStyle}>Move</th>
            </tr>
          </thead>
          <tbody>
            {result.snapshots.map((snapshot) => (
              <tr key={`${snapshot.date}-${snapshot.drawCount}`}>
                <td style={tdStrongStyle}>{snapshot.date}</td>
                <td style={tdStyle}>{snapshot.drawCount}</td>
                <td style={tdStyle}>{snapshot.rank}</td>
                <td style={tdStrongStyle}>{formatScore(snapshot.combinedDiagnosticScore)}</td>
                <td style={tdStyle}>{formatScore(snapshot.fullHistoryScore)}</td>
                <td style={tdStyle}>{formatScore(snapshot.wfmqyhScore)}</td>
                <td style={tdStyle}><RankMovement value={snapshot.rankMovement} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const RankSparkline: React.FC<{ snapshots: ScoringRankDriftSnapshot[] }> = ({ snapshots }) => {
  if (snapshots.length < 2) {
    return <div style={sparklineEmptyStyle}>Need more snapshots</div>;
  }
  const width = 150;
  const height = 42;
  const ranks = snapshots.map((snapshot) => snapshot.rank);
  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);
  const spread = Math.max(1, maxRank - minRank);
  const points = snapshots.map((snapshot, index) => {
    const x = snapshots.length === 1 ? 0 : (index / (snapshots.length - 1)) * width;
    const y = ((snapshot.rank - minRank) / spread) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Rank sparkline, upward visual movement means rank improvement"
      style={sparklineStyle}
    >
      <polyline points={points} fill="none" stroke="#111827" strokeWidth="2.5" />
    </svg>
  );
};

const panelStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  color: "#111827",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const titleStyle: React.CSSProperties = { margin: 0, fontSize: 16, fontWeight: 800 };

const sectionTitleStyle: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 800 };

const subtitleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#4b5563",
  fontSize: 13,
  lineHeight: 1.4,
};

const controlsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "end",
};

const selectStyle: React.CSSProperties = {
  minHeight: 34,
  borderRadius: 8,
  border: "1px solid #cfd8dc",
  padding: "4px 8px",
  background: "#fff",
};

const inputStyle: React.CSSProperties = {
  minHeight: 34,
  minWidth: 120,
  borderRadius: 8,
  border: "1px solid #cfd8dc",
  padding: "4px 9px",
  background: "#fff",
  font: "inherit",
};

const emptyStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 12,
  background: "#f9fafb",
  color: "#4b5563",
};

const statusStripStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 8,
};

const metricStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "8px 10px",
  background: "#fff",
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
  fontWeight: 700,
  textTransform: "uppercase",
};

const metricValueStyle: React.CSSProperties = { fontSize: 14, fontWeight: 800 };

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const tabButtonStyle: React.CSSProperties = {
  minHeight: 34,
  border: "1px solid #d1d5db",
  borderRadius: 999,
  padding: "5px 10px",
  background: "#fff",
  color: "#111827",
  cursor: "pointer",
};

const activeTabButtonStyle: React.CSSProperties = {
  ...tabButtonStyle,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#fff",
};

const scrollableTableWrapStyle: React.CSSProperties = {
  ...tableWrapStyle,
  maxHeight: "58vh",
  overflowY: "auto",
};

const rankDriftScrollWrapStyle: React.CSSProperties = {
  ...tableWrapStyle,
  maxHeight: "46vh",
  overflowY: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 860,
  borderCollapse: "collapse",
  fontSize: 12,
};

const rankDriftTableStyle: React.CSSProperties = {
  ...tableStyle,
  minWidth: 760,
};

const thStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  background: "#f9fafb",
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderBottom: "1px solid #f3f4f6",
  whiteSpace: "nowrap",
};

const tdStrongStyle: React.CSSProperties = {
  ...tdStyle,
  fontWeight: 800,
};

const noteStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "#4b5563",
  lineHeight: 1.4,
};

const digitSetControlsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "end",
};

const searchControlsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "end",
  padding: 10,
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#f9fafb",
};

const searchButtonStyle: React.CSSProperties = {
  minHeight: 34,
  border: "1px solid #111827",
  borderRadius: 8,
  padding: "5px 12px",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const clearButtonStyle: React.CSSProperties = {
  minHeight: 34,
  border: "1px solid #cfd8dc",
  borderRadius: 8,
  padding: "5px 12px",
  background: "#fff",
  color: "#111827",
  fontWeight: 800,
  cursor: "pointer",
};

const searchMessageStyle: React.CSSProperties = {
  ...noteStyle,
  fontWeight: 800,
};

const warningStyle: React.CSSProperties = {
  ...noteStyle,
  border: "1px solid #fde68a",
  borderRadius: 8,
  padding: 10,
  background: "#fffbeb",
  color: "#92400e",
  fontWeight: 800,
};

const rankDriftHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const sparklineStyle: React.CSSProperties = {
  display: "block",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#fff",
  padding: 6,
};

const sparklineEmptyStyle: React.CSSProperties = {
  ...noteStyle,
  minHeight: 42,
  display: "flex",
  alignItems: "center",
  padding: "0 10px",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#fff",
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  minHeight: 34,
  fontSize: 13,
  fontWeight: 700,
};

const digitsDetailsStyle: React.CSSProperties = {
  position: "relative",
};

const digitsSummaryStyle: React.CSSProperties = {
  cursor: "pointer",
  listStyle: "none",
  textDecoration: "underline",
  textDecorationStyle: "dotted",
  textUnderlineOffset: 3,
};

const examplePopoverStyle: React.CSSProperties = {
  display: "grid",
  gap: 3,
  marginTop: 6,
  padding: 8,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  background: "#f9fafb",
  color: "#111827",
  fontWeight: 600,
  lineHeight: 1.35,
};

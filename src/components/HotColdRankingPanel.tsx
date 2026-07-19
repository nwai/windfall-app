import React, { useCallback, useMemo, useState } from "react";

import type { Draw } from "../types";
import {
  analyzeHotColdRanking,
  formatHotColdWindowChoiceLabel,
  HOT_COLD_HALF_LIFE_OPTIONS,
  HOT_COLD_RECENT_WINDOW_OPTIONS,
  HOT_COLD_WFMQYH_OPTIONS,
  parseHotColdWindowChoice,
  type HotColdDigitFilter,
  type HotColdRankingRow,
  type HotColdStatus,
  resolveHotColdWindowChoice,
} from "../lib/hotColdRanking";
import { normalizeHotColdGenerationNumbers } from "../lib/hotColdGenerationSelection";
import {
  formatUserExclusionReminder,
  normalizeUserExclusionLocks,
  removeUserExcludedNumbers,
} from "../lib/userExclusionLocks";

interface HotColdRankingPanelProps {
  history: Draw[];
  wfmqyhWindowSize?: number;
  forcedNumbers?: number[];
  excludedNumbers?: number[];
  lockedExcludedNumbers?: number[];
  onToggleForcedNumber?: (number: number) => void;
  onToggleExcludedNumber?: (number: number) => void;
}

type BreakdownSortKey =
  | "hotRank"
  | "number"
  | "digitWidth"
  | "status"
  | "historicalCount"
  | "historicalRank"
  | "recentCount"
  | "recentRank"
  | "priorRate"
  | "recentDelta"
  | "weightedRate"
  | "weightedRank"
  | "hotScore"
  | "generation";
type BreakdownSortDir = "asc" | "desc";
type BreakdownSelectionMode = "off" | "include" | "exclude";

const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const formatSignedPoints = (value: number): string => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} pts`;
const formatHalfLifeOptionLabel = (option: number): string => (
  option === 0 ? "0 · latest draw only" : `${option} draws`
);

const statusStyles: Record<HotColdStatus, { label: string; background: string; color: string; border: string }> = {
  hot: { label: "Hot", background: "#ffebee", color: "#b71c1c", border: "1px solid #ef9a9a" },
  warm: { label: "Warm", background: "#fff8e1", color: "#b26a00", border: "1px solid #fdd835" },
  neutral: { label: "Neutral", background: "#f8fafc", color: "#475569", border: "1px solid #cbd5e1" },
  cool: { label: "Cool", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" },
  cold: { label: "Cold", background: "#e0f2fe", color: "#0369a1", border: "1px solid #7dd3fc" },
};

const statusSortValue: Record<HotColdStatus, number> = {
  cold: 1,
  cool: 2,
  neutral: 3,
  warm: 4,
  hot: 5,
};

const defaultBreakdownSortDir: Record<BreakdownSortKey, BreakdownSortDir> = {
  hotRank: "asc",
  number: "asc",
  digitWidth: "asc",
  status: "desc",
  historicalCount: "desc",
  historicalRank: "asc",
  recentCount: "desc",
  recentRank: "asc",
  priorRate: "desc",
  recentDelta: "desc",
  weightedRate: "desc",
  weightedRank: "asc",
  hotScore: "desc",
  generation: "desc",
};

const breakdownThStyle: React.CSSProperties = {
  padding: "0",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "center",
  color: "#475569",
  whiteSpace: "nowrap",
};

const breakdownSortButtonStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 34,
  padding: "8px 10px",
  border: "none",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 800,
  userSelect: "none",
  whiteSpace: "nowrap",
};

const getSortArrow = (isActive: boolean, sortDir: BreakdownSortDir): string => (
  isActive ? (sortDir === "asc" ? " ▲" : " ▼") : " ⇅"
);

interface SortableBreakdownHeaderProps {
  sortKey: BreakdownSortKey;
  label: string;
  activeSortKey: BreakdownSortKey;
  sortDir: BreakdownSortDir;
  title: string;
  onSort: (key: BreakdownSortKey) => void;
}

const SortableBreakdownHeader: React.FC<SortableBreakdownHeaderProps> = ({
  sortKey,
  label,
  activeSortKey,
  sortDir,
  title,
  onSort,
}) => {
  const active = activeSortKey === sortKey;
  return (
    <th
      scope="col"
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      style={breakdownThStyle}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={title}
        aria-label={`Sort by ${label}`}
        style={{
          ...breakdownSortButtonStyle,
          background: active ? "#eef5ff" : "transparent",
          color: active ? "#174ea6" : "#475569",
        }}
      >
        {label}
        <span aria-hidden="true">{getSortArrow(active, sortDir)}</span>
      </button>
    </th>
  );
};

const TopListCard: React.FC<{ title: string; hint: string; rows: HotColdRankingRow[]; accent: string }> = ({ title, hint, rows, accent }) => (
  <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: accent }}>{title}</div>
      <div style={{ marginTop: 2, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>{hint}</div>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {rows.map((row) => (
        <span
          key={`${title}-${row.number}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 999,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            fontSize: 11,
            color: "#334155",
            fontVariantNumeric: "tabular-nums",
          }}
          title={`#${row.hotRank} hot rank • historical ${row.totalCount} • recent ${row.recentCount} • weighted ${formatPercent(row.weightedRate)}`}
        >
          <strong>{row.number}</strong>
          <span style={{ color: "#64748b" }}>#{row.hotRank}</span>
        </span>
      ))}
    </div>
  </div>
);

export const HotColdRankingPanel: React.FC<HotColdRankingPanelProps> = ({
  history,
  wfmqyhWindowSize,
  forcedNumbers = [],
  excludedNumbers = [],
  lockedExcludedNumbers = [],
  onToggleForcedNumber,
  onToggleExcludedNumber,
}) => {
  const [includeSupp, setIncludeSupp] = useState<boolean>(true);
  const [recentWindowChoice, setRecentWindowChoice] = useState<string>("20");
  const [halfLifeChoice, setHalfLifeChoice] = useState<string>("10");
  const [digitFilter, setDigitFilter] = useState<HotColdDigitFilter>("all");
  const [breakdownOpen, setBreakdownOpen] = useState<boolean>(true);
  const [breakdownSortKey, setBreakdownSortKey] = useState<BreakdownSortKey>("hotRank");
  const [breakdownSortDir, setBreakdownSortDir] = useState<BreakdownSortDir>("asc");
  const [breakdownSelectionMode, setBreakdownSelectionMode] = useState<BreakdownSelectionMode>("off");

  const resolvedRecentWindow = useMemo(() => {
    const choice = parseHotColdWindowChoice(recentWindowChoice, 20);
    return resolveHotColdWindowChoice(choice, history.length, 20, wfmqyhWindowSize);
  }, [history.length, recentWindowChoice, wfmqyhWindowSize]);

  const resolvedHalfLife = useMemo(() => {
    const choice = parseHotColdWindowChoice(halfLifeChoice, 10);
    return resolveHotColdWindowChoice(choice, history.length, 10, wfmqyhWindowSize);
  }, [halfLifeChoice, history.length, wfmqyhWindowSize]);

  const halfLifeLabel = useMemo(
    () => formatHotColdWindowChoiceLabel(parseHotColdWindowChoice(halfLifeChoice, 10), history.length, 10, "halfLife", wfmqyhWindowSize),
    [halfLifeChoice, history.length, wfmqyhWindowSize],
  );
  const weightedLeadersHint = resolvedHalfLife === 0
    ? "Latest-draw-only weighted rank; older draws receive zero weight."
    : `Whole-history rank with a ${halfLifeLabel} half-life.`;

  const summary = useMemo(
    () => analyzeHotColdRanking(history, { includeSupp, recentWindow: resolvedRecentWindow, halfLife: resolvedHalfLife }),
    [history, includeSupp, resolvedRecentWindow, resolvedHalfLife],
  );

  const filteredRows = useMemo(() => {
    if (digitFilter === "all") return summary.rows;
    return summary.rows.filter((row) => row.digitWidth === digitFilter);
  }, [digitFilter, summary.rows]);

  const hotCount = filteredRows.filter((row) => row.status === "hot").length;
  const coldCount = filteredRows.filter((row) => row.status === "cold").length;
  const forcedNumberSet = useMemo(
    () => new Set(removeUserExcludedNumbers(normalizeHotColdGenerationNumbers(forcedNumbers), lockedExcludedNumbers)),
    [forcedNumbers, lockedExcludedNumbers],
  );
  const excludedNumberSet = useMemo(
    () => new Set(normalizeHotColdGenerationNumbers(excludedNumbers)),
    [excludedNumbers],
  );
  const userExcludedNumbers = useMemo(
    () => normalizeUserExclusionLocks(lockedExcludedNumbers),
    [lockedExcludedNumbers],
  );
  const userExcludedNumberSet = useMemo(() => new Set(userExcludedNumbers), [userExcludedNumbers]);
  const userExclusionReminder = useMemo(
    () => formatUserExclusionReminder(userExcludedNumbers),
    [userExcludedNumbers],
  );

  const sortedBreakdownRows = useMemo(() => {
    const selector: Record<BreakdownSortKey, (row: HotColdRankingRow) => number> = {
      hotRank: (row) => row.hotRank,
      number: (row) => row.number,
      digitWidth: (row) => (row.digitWidth === "oneDigit" ? 1 : 2),
      status: (row) => statusSortValue[row.status],
      historicalCount: (row) => row.totalCount,
      historicalRank: (row) => row.historicalRank,
      recentCount: (row) => row.recentCount,
      recentRank: (row) => row.recentRank,
      priorRate: (row) => row.priorRate,
      recentDelta: (row) => row.recentDelta,
      weightedRate: (row) => row.weightedRate,
      weightedRank: (row) => row.weightedRank,
      hotScore: (row) => row.hotScore,
      generation: (row) => {
        if (userExcludedNumberSet.has(row.number)) return 3;
        if (forcedNumberSet.has(row.number)) return 2;
        if (excludedNumberSet.has(row.number)) return 1;
        return 0;
      },
    };

    return [...filteredRows].sort((left, right) => {
      const leftValue = selector[breakdownSortKey](left);
      const rightValue = selector[breakdownSortKey](right);
      if (leftValue !== rightValue) {
        return breakdownSortDir === "asc" ? leftValue - rightValue : rightValue - leftValue;
      }
      return left.number - right.number;
    });
  }, [breakdownSortDir, breakdownSortKey, excludedNumberSet, filteredRows, forcedNumberSet, userExcludedNumberSet]);

  const toggleBreakdownSort = (key: BreakdownSortKey): void => {
    if (breakdownSortKey === key) {
      setBreakdownSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setBreakdownSortKey(key);
    setBreakdownSortDir(defaultBreakdownSortDir[key]);
  };

  const includeRowsMode = breakdownSelectionMode === "include";
  const excludeRowsMode = breakdownSelectionMode === "exclude";
  const breakdownRowsInteractive = (
    (includeRowsMode && !!onToggleForcedNumber) ||
    (excludeRowsMode && !!onToggleExcludedNumber)
  );

  const handleBreakdownRowActivation = useCallback((number: number): void => {
    if (userExcludedNumberSet.has(number)) return;
    if (breakdownSelectionMode === "include") {
      onToggleForcedNumber?.(number);
      return;
    }
    if (breakdownSelectionMode === "exclude") {
      onToggleExcludedNumber?.(number);
    }
  }, [breakdownSelectionMode, onToggleExcludedNumber, onToggleForcedNumber, userExcludedNumberSet]);

  const handleBreakdownRowKeyDown = useCallback((event: React.KeyboardEvent<HTMLTableRowElement>, number: number): void => {
    if (!breakdownRowsInteractive) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleBreakdownRowActivation(number);
  }, [breakdownRowsInteractive, handleBreakdownRowActivation]);

  return (
    <section style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, color: "#667", marginTop: 2 }}>
            Compares <b>historical frequency</b>, <b>recent-window hotness</b>, and <b>recency-weighted hotness</b> so you can see when those rankings agree or diverge.
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#334155" }}>
            <input type="checkbox" checked={includeSupp} onChange={(event) => setIncludeSupp(event.target.checked)} />
            Include supplementary numbers
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#334155" }}>
            Recent window
            <select value={recentWindowChoice} onChange={(event) => setRecentWindowChoice(event.target.value)} style={{ fontSize: 12 }}>
              <optgroup label="Draw-count choices">
                {HOT_COLD_RECENT_WINDOW_OPTIONS.map((option) => (
                  <option key={option} value={String(option)}>{option} draws</option>
                ))}
              </optgroup>
              <optgroup label="WFMQYH shortcuts">
                {HOT_COLD_WFMQYH_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {formatHotColdWindowChoiceLabel(option.key, history.length, 20, "recentWindow", wfmqyhWindowSize)}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#334155" }}>
            Weighted half-life
            <select value={halfLifeChoice} onChange={(event) => setHalfLifeChoice(event.target.value)} style={{ fontSize: 12 }}>
              <optgroup label="Draw-count choices">
                {HOT_COLD_HALF_LIFE_OPTIONS.map((option) => (
                  <option key={option} value={String(option)}>{formatHalfLifeOptionLabel(option)}</option>
                ))}
              </optgroup>
              <optgroup label="WFMQYH shortcuts">
                {HOT_COLD_WFMQYH_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {formatHotColdWindowChoiceLabel(option.key, history.length, 10, "halfLife", wfmqyhWindowSize)}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#334155" }}>
            Digits
            <select value={digitFilter} onChange={(event) => setDigitFilter(event.target.value as HotColdDigitFilter)} style={{ fontSize: 12 }}>
              <option value="all">All</option>
              <option value="oneDigit">1-digit only</option>
              <option value="twoDigit">2-digit only</option>
            </select>
          </label>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.45, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px" }}>
        <b>How to read this:</b> <b>Historical</b> ranks use full loaded history. <b>Recent</b> ranks use only the last <b>{summary.recentWindow}</b> draws. <b>Weighted</b> ranks use the selected half-life; <b>0</b> means only the latest draw receives weight. This makes it easier to compare the app’s long-run counts against the kind of <em>current hotness</em> that lottery websites often emphasize.
      </div>
      {userExclusionReminder && (
        <div role="status" style={{ fontSize: 12, color: "#475569", lineHeight: 1.45, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px" }}>
          {userExclusionReminder}. Clear it in WFMQYH User Exclusions before selecting locked numbers here.
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <div style={{ minWidth: 170, borderRadius: 8, border: "1px solid #e2e8f0", padding: "8px 12px", background: "#f8fafc" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.3 }}>Draws analysed</div>
          <div style={{ marginTop: 2, fontSize: 22, fontWeight: 800, color: "#1e293b", fontVariantNumeric: "tabular-nums" }}>{summary.totalDraws}</div>
          <div style={{ marginTop: 4, fontSize: 11, color: "#64748b" }}>{summary.priorWindow} prior + {summary.recentWindow} recent</div>
        </div>
        <div style={{ minWidth: 170, borderRadius: 8, border: "1px solid #fdd835", padding: "8px 12px", background: "#fff8e1" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#b26a00", textTransform: "uppercase", letterSpacing: 0.3 }}>Hot numbers</div>
          <div style={{ marginTop: 2, fontSize: 22, fontWeight: 800, color: "#92400e", fontVariantNumeric: "tabular-nums" }}>{hotCount}</div>
          <div style={{ marginTop: 4, fontSize: 11, color: "#92400e" }}>Status = Hot in the current filter view</div>
        </div>
        <div style={{ minWidth: 170, borderRadius: 8, border: "1px solid #7dd3fc", padding: "8px 12px", background: "#e0f2fe" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#0369a1", textTransform: "uppercase", letterSpacing: 0.3 }}>Cold numbers</div>
          <div style={{ marginTop: 2, fontSize: 22, fontWeight: 800, color: "#075985", fontVariantNumeric: "tabular-nums" }}>{coldCount}</div>
          <div style={{ marginTop: 4, fontSize: 11, color: "#075985" }}>Status = Cold in the current filter view</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
        <TopListCard title="Historical leaders" hint="Most appearances across the full loaded history." rows={summary.topHistorical.slice(0, 6)} accent="#1565c0" />
        <TopListCard title="Recent leaders" hint={`Most appearances in the last ${summary.recentWindow} draws.`} rows={summary.topRecent.slice(0, 6)} accent="#b26a00" />
        <TopListCard title="Recency-weighted leaders" hint={weightedLeadersHint} rows={summary.topWeighted.slice(0, 6)} accent="#7c3aed" />
        <TopListCard title="Hottest movers" hint="Best combined recent-vs-prior and weighted trend." rows={summary.topHot.slice(0, 6)} accent="#b71c1c" />
      </div>

      <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => setBreakdownOpen((open) => !open)}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 12px",
            border: "none",
            background: "#f8fafc",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 700,
            color: "#334155",
          }}
        >
          <span>Hot vs Cold breakdown table</span>
          <span>{breakdownOpen ? "Hide ▲" : `Show (${filteredRows.length}) ▼`}</span>
        </button>
        {breakdownOpen ? (
          <div style={{ overflowX: "auto", background: "#fff" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
              <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.45 }}>
                Row selection is off by default. Turn on one mode, then click a number row to add or remove it from candidate generation.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", fontSize: 12 }}>
                <label style={{ minHeight: 32, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 8, border: includeRowsMode ? "1px solid #f97316" : "1px solid #e2e8f0", background: includeRowsMode ? "#fff7ed" : "#f8fafc", color: includeRowsMode ? "#9a3412" : "#334155", fontWeight: includeRowsMode ? 800 : 600 }}>
                  <input
                    type="checkbox"
                    checked={includeRowsMode}
                    onChange={(event) => setBreakdownSelectionMode(event.target.checked ? "include" : "off")}
                    aria-label="Include selected rows in candidate generation"
                  />
                  Include selected rows
                </label>
                <label style={{ minHeight: 32, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 8, border: excludeRowsMode ? "1px solid #64748b" : "1px solid #e2e8f0", background: excludeRowsMode ? "#f1f5f9" : "#f8fafc", color: excludeRowsMode ? "#0f172a" : "#334155", fontWeight: excludeRowsMode ? 800 : 600 }}>
                  <input
                    type="checkbox"
                    checked={excludeRowsMode}
                    onChange={(event) => setBreakdownSelectionMode(event.target.checked ? "exclude" : "off")}
                    aria-label="Exclude selected rows from candidate generation"
                  />
                  Exclude selected rows
                </label>
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <SortableBreakdownHeader sortKey="hotRank" label="#" activeSortKey={breakdownSortKey} sortDir={breakdownSortDir} onSort={toggleBreakdownSort} title="Sort by overall hot rank" />
                  <SortableBreakdownHeader sortKey="number" label="Num" activeSortKey={breakdownSortKey} sortDir={breakdownSortDir} onSort={toggleBreakdownSort} title="Sort by number" />
                  <SortableBreakdownHeader sortKey="digitWidth" label="Type" activeSortKey={breakdownSortKey} sortDir={breakdownSortDir} onSort={toggleBreakdownSort} title="Sort by 1-digit or 2-digit type" />
                  <SortableBreakdownHeader sortKey="status" label="Status" activeSortKey={breakdownSortKey} sortDir={breakdownSortDir} onSort={toggleBreakdownSort} title="Sort by hot/warm/neutral/cool/cold status" />
                  <SortableBreakdownHeader sortKey="historicalCount" label="Hist count" activeSortKey={breakdownSortKey} sortDir={breakdownSortDir} onSort={toggleBreakdownSort} title="Sort by historical count" />
                  <SortableBreakdownHeader sortKey="historicalRank" label="Hist rank" activeSortKey={breakdownSortKey} sortDir={breakdownSortDir} onSort={toggleBreakdownSort} title="Sort by historical rank" />
                  <SortableBreakdownHeader sortKey="recentCount" label={`Recent ${summary.recentWindow}`} activeSortKey={breakdownSortKey} sortDir={breakdownSortDir} onSort={toggleBreakdownSort} title={`Sort by appearances in the last ${summary.recentWindow} draws`} />
                  <SortableBreakdownHeader sortKey="recentRank" label="Recent rank" activeSortKey={breakdownSortKey} sortDir={breakdownSortDir} onSort={toggleBreakdownSort} title="Sort by recent rank" />
                  <SortableBreakdownHeader sortKey="priorRate" label="Prior rate" activeSortKey={breakdownSortKey} sortDir={breakdownSortDir} onSort={toggleBreakdownSort} title="Sort by prior-window hit rate" />
                  <SortableBreakdownHeader sortKey="recentDelta" label="Recent Δ" activeSortKey={breakdownSortKey} sortDir={breakdownSortDir} onSort={toggleBreakdownSort} title="Sort by recent-vs-prior delta" />
                  <SortableBreakdownHeader sortKey="weightedRate" label="Weighted rate" activeSortKey={breakdownSortKey} sortDir={breakdownSortDir} onSort={toggleBreakdownSort} title="Sort by recency-weighted hit rate" />
                  <SortableBreakdownHeader sortKey="weightedRank" label="Weighted rank" activeSortKey={breakdownSortKey} sortDir={breakdownSortDir} onSort={toggleBreakdownSort} title="Sort by recency-weighted rank" />
                  <SortableBreakdownHeader sortKey="hotScore" label="Hot score" activeSortKey={breakdownSortKey} sortDir={breakdownSortDir} onSort={toggleBreakdownSort} title="Sort by combined hot/cold score" />
                  <SortableBreakdownHeader sortKey="generation" label="Generation" activeSortKey={breakdownSortKey} sortDir={breakdownSortDir} onSort={toggleBreakdownSort} title="Sort by candidate-generation selection state" />
                </tr>
              </thead>
              <tbody>
                {sortedBreakdownRows.map((row) => {
                    const statusStyle = statusStyles[row.status];
                    const isUserExcluded = userExcludedNumberSet.has(row.number);
                    const isForced = !isUserExcluded && forcedNumberSet.has(row.number);
                    const isExcluded = excludedNumberSet.has(row.number);
                    const generationLabel = isUserExcluded ? "User Excluded" : isForced ? "Forced in" : isExcluded ? "Excluded" : "—";
                    const generationStyle = isForced
                      ? { background: "#fff7ed", color: "#9a3412", border: "1px solid #fdba74" }
                      : isUserExcluded
                        ? { background: "#f1f5f9", color: "#334155", border: "1px solid #94a3b8" }
                      : isExcluded
                        ? { background: "#f1f5f9", color: "#0f172a", border: "1px solid #94a3b8" }
                        : { background: "#ffffff", color: "#64748b", border: "1px solid #e2e8f0" };
                    const rowBackground = isForced ? "#fffaf5" : isUserExcluded || isExcluded ? "#f8fafc" : "#ffffff";
                    const rowCanActivate = breakdownRowsInteractive && !isUserExcluded;
                    const rowTitle = isUserExcluded
                      ? `Number ${row.number} is excluded by User Exclusions. Clear it in WFMQYH User Exclusions before selecting it here.`
                      : rowCanActivate
                      ? `${includeRowsMode ? "Toggle forced inclusion" : "Toggle forced exclusion"} for ${row.number}`
                      : undefined;
                    return (
                      <tr
                        key={row.number}
                        onClick={rowCanActivate ? () => handleBreakdownRowActivation(row.number) : undefined}
                        onKeyDown={rowCanActivate ? (event) => handleBreakdownRowKeyDown(event, row.number) : undefined}
                        role={rowCanActivate ? "button" : undefined}
                        tabIndex={rowCanActivate ? 0 : undefined}
                        aria-disabled={isUserExcluded ? true : undefined}
                        aria-pressed={rowCanActivate ? (includeRowsMode ? isForced : isExcluded) : undefined}
                        title={rowTitle}
                        style={{ borderBottom: "1px solid #f1f5f9", background: rowBackground, cursor: rowCanActivate ? "pointer" : "default", outlineOffset: -2 }}
                        data-user-excluded={isUserExcluded ? "true" : undefined}
                      >
                        <td style={{ padding: "7px 10px", textAlign: "center", fontVariantNumeric: "tabular-nums", color: "#64748b" }}>{row.hotRank}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 800, color: "#1e293b", fontVariantNumeric: "tabular-nums" }}>{row.number}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center", color: "#64748b" }}>{row.digitWidth === "oneDigit" ? "1-digit" : "2-digit"}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "2px 8px", borderRadius: 999, ...statusStyle, fontSize: 11, fontWeight: 700 }}>
                            {statusStyle.label}
                          </span>
                        </td>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{row.totalCount}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{row.historicalRank}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{row.recentCount}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{row.recentRank}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{formatPercent(row.priorRate)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontVariantNumeric: "tabular-nums", color: row.recentDelta > 0 ? "#b71c1c" : row.recentDelta < 0 ? "#0369a1" : "#475569" }}>{formatSignedPoints(row.recentDelta)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{formatPercent(row.weightedRate)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{row.weightedRank}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: row.hotScore > 0 ? "#b71c1c" : row.hotScore < 0 ? "#0369a1" : "#475569" }} title={`Δ z-score ${row.deltaZScore.toFixed(2)} • weighted delta ${formatSignedPoints(row.weightedDelta)}`}>
                          {row.hotScore.toFixed(2)}
                        </td>
                        <td style={{ padding: "7px 10px", textAlign: "center", whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-flex", minWidth: 72, alignItems: "center", justifyContent: "center", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 800, ...generationStyle }}>
                            {generationLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "10px 12px", fontSize: 12, color: "#64748b", background: "#fff" }}>
            Open the table to compare how historical leaders, recent leaders, and weighted leaders differ number by number.
          </div>
        )}
      </div>
    </section>
  );
};

export default HotColdRankingPanel;

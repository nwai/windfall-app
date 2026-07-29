import React, { useMemo, useState } from "react";
import type { Draw } from "../types";
import { extractFeaturesForNumber } from "../lib/churnFeatures";
import { filterRealDrawHistory } from "../lib/realDrawHistory";
import { parseDrawDateToEpoch, sortDrawsChronologically } from "../lib/recentDraws";

interface MultiStateChurnPanelProps {
  history: Draw[];
  excludedNumbers?: number[];
  churnThreshold?: number;
}

type NumberState = "active" | "churned" | "returned";

interface NumberStateInfo {
  number: number;
  currentState: NumberState;
  timeSinceLast: number;
  totalAppearances: number;
  timesChurned: number;
  timesReturned: number;
  currentStreak: number; // consecutive draws in current state
}

interface MonthOption {
  key: string;
  label: string;
  endIndex: number;
  drawCount: number;
  endDate: string;
}

const stateTone: Record<NumberState, { color: string; background: string; border: string }> = {
  active: { color: "#166534", background: "#f0fdf4", border: "#bbf7d0" },
  churned: { color: "#991b1b", background: "#fef2f2", border: "#fecaca" },
  returned: { color: "#075985", background: "#f0f9ff", border: "#bae6fd" },
};

const labelForState = (state: NumberState): string => (
  state === "active" ? "Active" : state === "churned" ? "Churned" : "Returned"
);

const monthKeyForDraw = (draw: Draw): string | null => {
  const epoch = parseDrawDateToEpoch(draw.date);
  if (!epoch) return null;
  const date = new Date(epoch);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const buildMonthOptions = (history: Draw[]): MonthOption[] => {
  const byMonth = new Map<string, MonthOption>();

  history.forEach((draw, index) => {
    const key = monthKeyForDraw(draw);
    if (!key) return;
    const current = byMonth.get(key);
    if (current) {
      current.endIndex = index;
      current.drawCount += 1;
      current.endDate = draw.date;
      return;
    }
    byMonth.set(key, {
      key,
      label: key,
      endIndex: index,
      drawCount: 1,
      endDate: draw.date,
    });
  });

  return Array.from(byMonth.values()).sort((left, right) => right.key.localeCompare(left.key));
};

const describeHistorySlice = (history: Draw[], excludedCount: number): string => {
  if (!history.length) return "No real draws in the active slice.";
  const first = history[0];
  const last = history[history.length - 1];
  return `${history.length} real draw${history.length === 1 ? "" : "s"} · ${first.date} to ${last.date} · mains + supps · ${excludedCount} excluded`;
};

const summarizeStates = (rows: NumberStateInfo[]): Record<NumberState, number> => (
  rows.reduce<Record<NumberState, number>>((acc, row) => {
    acc[row.currentState] += 1;
    return acc;
  }, { active: 0, churned: 0, returned: 0 })
);

const buildStateRows = (
  history: Draw[],
  numbers: number[],
  churnThreshold: number,
  filterState: NumberState | "all",
  sortBy: "state" | "number" | "churns",
): NumberStateInfo[] => {
  const currentIdx = history.length - 1;
  if (currentIdx < 0) return [];

  const results: NumberStateInfo[] = [];

  for (const num of numbers) {
    const features = extractFeaturesForNumber(history, num, { churnThreshold });

    let currentState: NumberState;
    if (features.isActive) {
      currentState = features.hasReturned ? "returned" : "active";
    } else {
      currentState = "churned";
    }

    let timesChurned = 0;
    let timesReturned = 0;
    let consecutiveInactive = 0;
    let wasChurned = false;

    for (let i = 0; i <= currentIdx; i++) {
      const draw = history[i];
      const appeared = draw.main.includes(num) || draw.supp.includes(num);

      if (appeared) {
        if (wasChurned) {
          timesReturned++;
          wasChurned = false;
        }
        consecutiveInactive = 0;
      } else {
        consecutiveInactive++;
        if (consecutiveInactive === churnThreshold && !wasChurned) {
          timesChurned++;
          wasChurned = true;
        }
      }
    }

    let currentStreak = 0;
    const targetStateIsActive = currentState === "active" || currentState === "returned";

    for (let i = currentIdx; i >= 0; i--) {
      const draw = history[i];
      const appeared = draw.main.includes(num) || draw.supp.includes(num);

      if ((targetStateIsActive && !appeared) || (!targetStateIsActive && appeared)) {
        break;
      }
      currentStreak++;
    }

    results.push({
      number: num,
      currentState,
      timeSinceLast: features.timeSinceLast,
      totalAppearances: features.freqTotal,
      timesChurned,
      timesReturned,
      currentStreak,
    });
  }

  const filtered = filterState === "all"
    ? results
    : results.filter((row) => row.currentState === filterState);

  if (sortBy === "number") {
    filtered.sort((a, b) => a.number - b.number);
  } else if (sortBy === "churns") {
    filtered.sort((a, b) => b.timesChurned - a.timesChurned || a.number - b.number);
  } else {
    filtered.sort((a, b) => a.currentState.localeCompare(b.currentState) || a.number - b.number);
  }

  return filtered;
};

const StateBadge: React.FC<{ state: NumberState }> = ({ state }) => {
  const tone = stateTone[state];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 22,
        padding: "2px 7px",
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.background,
        color: tone.color,
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {labelForState(state)}
    </span>
  );
};

const StateSummary: React.FC<{ rows: NumberStateInfo[] }> = ({ rows }) => {
  const counts = summarizeStates(rows);
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
      {(Object.keys(counts) as NumberState[]).map((state) => {
        const tone = stateTone[state];
        return (
          <span
            key={state}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              minHeight: 24,
              padding: "2px 8px",
              borderRadius: 999,
              border: `1px solid ${tone.border}`,
              background: tone.background,
              color: tone.color,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {labelForState(state)} {counts[state]}
          </span>
        );
      })}
    </div>
  );
};

const StateTable: React.FC<{
  title: string;
  detail: string;
  rows: NumberStateInfo[];
}> = ({ title, detail, rows }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ marginBottom: 8 }}>
      <strong style={{ color: "#0f172a" }}>{title}</strong>
      <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>{detail}</div>
      <StateSummary rows={rows} />
    </div>
    <div style={{ overflowX: "auto", maxHeight: 420, border: "1px solid #e2e8f0", borderRadius: 8 }}>
      <table style={{ borderCollapse: "collapse", minWidth: 640, width: "100%", background: "#fff" }}>
        <thead style={{ position: "sticky", top: 0, background: "#f8fafc", zIndex: 1 }}>
          <tr>
            <th style={{ textAlign: "left", padding: "7px 8px", borderBottom: "1px solid #dbe3ef", color: "#334155", fontSize: 12 }}>#</th>
            <th style={{ textAlign: "left", padding: "7px 8px", borderBottom: "1px solid #dbe3ef", color: "#334155", fontSize: 12 }}>State</th>
            <th style={{ textAlign: "right", padding: "7px 8px", borderBottom: "1px solid #dbe3ef", color: "#334155", fontSize: 12 }}>Since Last</th>
            <th style={{ textAlign: "right", padding: "7px 8px", borderBottom: "1px solid #dbe3ef", color: "#334155", fontSize: 12 }}>Total Apps</th>
            <th style={{ textAlign: "right", padding: "7px 8px", borderBottom: "1px solid #dbe3ef", color: "#334155", fontSize: 12 }}>Churns</th>
            <th style={{ textAlign: "right", padding: "7px 8px", borderBottom: "1px solid #dbe3ef", color: "#334155", fontSize: 12 }}>Returns</th>
            <th style={{ textAlign: "right", padding: "7px 8px", borderBottom: "1px solid #dbe3ef", color: "#334155", fontSize: 12 }}>Current Streak</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ padding: 12, color: "#64748b", fontSize: 12, textAlign: "center" }}>
                No rows available for this slice and filter.
              </td>
            </tr>
          ) : rows.map((row) => (
            <tr key={row.number}>
              <td style={{ padding: "6px 8px", borderBottom: "1px solid #edf2f7" }}><b>{row.number}</b></td>
              <td style={{ padding: "6px 8px", borderBottom: "1px solid #edf2f7" }}><StateBadge state={row.currentState} /></td>
              <td style={{ padding: "6px 8px", borderBottom: "1px solid #edf2f7", textAlign: "right" }}>{row.timeSinceLast}</td>
              <td style={{ padding: "6px 8px", borderBottom: "1px solid #edf2f7", textAlign: "right" }}>{row.totalAppearances}</td>
              <td style={{ padding: "6px 8px", borderBottom: "1px solid #edf2f7", textAlign: "right" }}>{row.timesChurned}</td>
              <td style={{ padding: "6px 8px", borderBottom: "1px solid #edf2f7", textAlign: "right" }}>{row.timesReturned}</td>
              <td style={{ padding: "6px 8px", borderBottom: "1px solid #edf2f7", textAlign: "right" }}>{row.currentStreak}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export const MultiStateChurnPanel: React.FC<MultiStateChurnPanelProps> = ({
  history,
  excludedNumbers = [],
  churnThreshold = 15,
}) => {
  const [sortBy, setSortBy] = useState<"state" | "number" | "churns">("state");
  const [filterState, setFilterState] = useState<NumberState | "all">("all");
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>("");

  const numbers = useMemo(
    () => Array.from({ length: 45 }, (_, i) => i + 1).filter((n) => !excludedNumbers.includes(n)),
    [excludedNumbers]
  );

  const analysisHistory = useMemo(
    () => sortDrawsChronologically(filterRealDrawHistory(history, "multi-state churn diagnostics").history),
    [history],
  );

  const monthOptions = useMemo(() => buildMonthOptions(analysisHistory), [analysisHistory]);

  const effectiveSelectedMonthKey = useMemo(() => {
    if (selectedMonthKey && monthOptions.some((option) => option.key === selectedMonthKey)) {
      return selectedMonthKey;
    }
    return monthOptions[1]?.key ?? monthOptions[0]?.key ?? "";
  }, [monthOptions, selectedMonthKey]);

  const selectedMonth = useMemo(
    () => monthOptions.find((option) => option.key === effectiveSelectedMonthKey) ?? null,
    [effectiveSelectedMonthKey, monthOptions],
  );

  const selectedMonthHistory = useMemo(
    () => selectedMonth ? analysisHistory.slice(0, selectedMonth.endIndex + 1) : [],
    [analysisHistory, selectedMonth],
  );

  const stateAnalysis = useMemo(() => (
    buildStateRows(analysisHistory, numbers, churnThreshold, filterState, sortBy)
  ), [analysisHistory, numbers, churnThreshold, filterState, sortBy]);

  const selectedMonthAnalysis = useMemo(() => (
    buildStateRows(selectedMonthHistory, numbers, churnThreshold, filterState, sortBy)
  ), [selectedMonthHistory, numbers, churnThreshold, filterState, sortBy]);

  const sliceLabel = describeHistorySlice(analysisHistory, excludedNumbers.length);
  const currentEndLabel = analysisHistory.length ? analysisHistory[analysisHistory.length - 1].date : "none";
  const selectedMonthDetail = selectedMonth
    ? `As of ${selectedMonth.endDate}; ${selectedMonth.drawCount} draw${selectedMonth.drawCount === 1 ? "" : "s"} in ${selectedMonth.label}, using slice start through that month-end.`
    : "No comparable month in the active slice.";

  return (
    <section style={{ border: "1px solid #dbe3ef", borderRadius: 8, padding: 12, marginTop: 10, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <h4 style={{ margin: 0 }}>Multi-State (Active → Churned → Returned)</h4>
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>
            Active slice shared by both tables: {sliceLabel}
          </div>
        </div>
        <span style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>
          Threshold: {churnThreshold} draws of inactivity ⇒ churn
        </span>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "end", marginBottom: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, color: "#475569", fontSize: 12, fontWeight: 700 }}>
          Filter:
          <select
            value={filterState}
            onChange={(event) => setFilterState(event.target.value as NumberState | "all")}
            style={{ minHeight: 34, border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 8px", background: "#fff" }}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="churned">Churned</option>
            <option value="returned">Returned</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, color: "#475569", fontSize: 12, fontWeight: 700 }}>
          Sort by:
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as "state" | "number" | "churns")}
            style={{ minHeight: 34, border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 8px", background: "#fff" }}
          >
            <option value="state">State</option>
            <option value="number">Number</option>
            <option value="churns">Churn count</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, color: "#475569", fontSize: 12, fontWeight: 700 }}>
          Select month to compare:
          <select
            aria-label="Select month to compare"
            value={effectiveSelectedMonthKey}
            onChange={(event) => setSelectedMonthKey(event.target.value)}
            style={{ minHeight: 34, border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 8px", background: "#fff", minWidth: 170 }}
          >
            {monthOptions.length === 0 ? (
              <option value="">No real months</option>
            ) : monthOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label} ({option.drawCount})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(390px, 1fr))", gap: 12, alignItems: "start" }}>
        <StateTable
          title="Current Slice End"
          detail={`As of ${currentEndLabel}; uses the full active slice above.`}
          rows={stateAnalysis}
        />
        <StateTable
          title={selectedMonth ? `Compare: ${selectedMonth.label}` : "Compare Month"}
          detail={selectedMonthDetail}
          rows={selectedMonthAnalysis}
        />
      </div>

      <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
        “Active” = seen within threshold; “Churned” = not seen for threshold; “Returned” = previously churned then seen again. The comparison month is calculated only from the active slice shown above, cut at that month’s latest draw.
      </div>
    </section>
  );
};

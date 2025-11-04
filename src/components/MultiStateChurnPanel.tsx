import React, { useMemo, useState } from "react";
import type { Draw } from "../types";
import { extractFeaturesForNumber } from "../lib/churnFeatures";

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

export const MultiStateChurnPanel: React.FC<MultiStateChurnPanelProps> = ({
  history,
  excludedNumbers = [],
  churnThreshold = 15,
}) => {
  const [sortBy, setSortBy] = useState<"state" | "number" | "churns">("state");
  const [filterState, setFilterState] = useState<NumberState | "all">("all");

  const numbers = useMemo(
    () => Array.from({ length: 45 }, (_, i) => i + 1).filter((n) => !excludedNumbers.includes(n)),
    [excludedNumbers]
  );

  const stateAnalysis = useMemo(() => {
    const currentIdx = history.length - 1;
    const results: NumberStateInfo[] = [];

    for (const num of numbers) {
      // FIX: pass options object with threshold; no currentIdx param needed
      const features = extractFeaturesForNumber(history, num, { churnThreshold });

      // Determine current state
      let currentState: NumberState;
      if (features.isActive) {
        currentState = features.hasReturned ? "returned" : "active";
      } else {
        currentState = "churned";
      }

      // Count churns and returns in history
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

      // Calculate current streak
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

    // Optional filtering by state
    const filtered =
      filterState === "all" ? results : results.filter((r) => r.currentState === filterState);

    // Sorting
    if (sortBy === "number") filtered.sort((a, b) => a.number - b.number);
    else if (sortBy === "churns") filtered.sort((a, b) => b.timesChurned - a.timesChurned || a.number - b.number);
    else filtered.sort((a, b) => a.currentState.localeCompare(b.currentState) || a.number - b.number);

    return filtered;
  }, [history, numbers, churnThreshold, filterState, sortBy]);

  return (
    <section style={{ border: "1px solid #ccc", borderRadius: 8, padding: 12, marginTop: 10 }}>
      <h4>Multi-State (Active → Churned → Returned)</h4>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
        <label>
          Filter:
          <select
            value={filterState}
            onChange={(e) => setFilterState(e.target.value as any)}
            style={{ marginLeft: 6 }}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="churned">Churned</option>
            <option value="returned">Returned</option>
          </select>
        </label>
        <label style={{ marginLeft: 12 }}>
          Sort by:
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{ marginLeft: 6 }}
          >
            <option value="state">State</option>
            <option value="number">Number</option>
            <option value="churns">Churn count</option>
          </select>
        </label>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#555" }}>
          Threshold: {churnThreshold} draws of inactivity ⇒ churn
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", minWidth: 640, background: "#fff", border: "1px solid #eee" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>#</th>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>State</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Since Last</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Total Apps</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Churns</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Returns</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Current Streak</th>
            </tr>
          </thead>
          <tbody>
            {stateAnalysis.map((r) => (
              <tr key={r.number}>
                <td style={{ padding: "4px 8px" }}><b>{r.number}</b></td>
                <td style={{ padding: "4px 8px" }}>
                  {r.currentState === "active" && <span style={{ color: "#2e7d32" }}>Active</span>}
                  {r.currentState === "churned" && <span style={{ color: "#c62828" }}>Churned</span>}
                  {r.currentState === "returned" && <span style={{ color: "#1565c0" }}>Returned</span>}
                </td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{r.timeSinceLast}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{r.totalAppearances}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{r.timesChurned}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{r.timesReturned}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{r.currentStreak}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
        “Active” = seen within threshold; “Churned” = not seen for threshold; “Returned” = previously churned then seen again.
      </div>
    </section>
  );
};
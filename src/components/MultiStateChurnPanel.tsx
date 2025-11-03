/**
 * MultiStateChurnPanel Component
 * 
 * Provides discrete-time multi-state analysis: Active -> Churned -> Returned
 */

import React, { useState, useMemo } from "react";
import { Draw } from "../types";
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
    () => Array.from({ length: 45 }, (_, i) => i + 1).filter(n => !excludedNumbers.includes(n)),
    [excludedNumbers]
  );

  const stateAnalysis = useMemo(() => {
    const currentIdx = history.length - 1;
    const results: NumberStateInfo[] = [];

    for (const num of numbers) {
      const features = extractFeaturesForNumber(history, num, currentIdx, churnThreshold);
      
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
      const targetState = currentState === "active" || currentState === "returned";
      
      for (let i = currentIdx; i >= 0; i--) {
        const draw = history[i];
        const appeared = draw.main.includes(num) || draw.supp.includes(num);
        
        if ((targetState && !appeared) || (!targetState && appeared)) {
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

    return results;
  }, [history, numbers, churnThreshold]);

  // State sorting order constants
  const STATE_ORDER_ACTIVE = 0;
  const STATE_ORDER_RETURNED = 1;
  const STATE_ORDER_CHURNED = 2;

  const filteredAndSorted = useMemo(() => {
    let filtered = stateAnalysis;
    
    // Apply filter
    if (filterState !== "all") {
      filtered = filtered.filter(s => s.currentState === filterState);
    }

    // Apply sort
    const sorted = [...filtered];
    if (sortBy === "state") {
      const stateOrder = { 
        active: STATE_ORDER_ACTIVE, 
        returned: STATE_ORDER_RETURNED, 
        churned: STATE_ORDER_CHURNED 
      };
      sorted.sort((a, b) => stateOrder[a.currentState] - stateOrder[b.currentState] || a.number - b.number);
    } else if (sortBy === "churns") {
      sorted.sort((a, b) => b.timesChurned - a.timesChurned || a.number - b.number);
    } else {
      sorted.sort((a, b) => a.number - b.number);
    }

    return sorted;
  }, [stateAnalysis, filterState, sortBy]);

  // Summary statistics
  const summary = useMemo(() => {
    const active = stateAnalysis.filter(s => s.currentState === "active").length;
    const churned = stateAnalysis.filter(s => s.currentState === "churned").length;
    const returned = stateAnalysis.filter(s => s.currentState === "returned").length;
    const avgChurns = stateAnalysis.reduce((sum, s) => sum + s.timesChurned, 0) / stateAnalysis.length;
    const avgReturns = stateAnalysis.reduce((sum, s) => sum + s.timesReturned, 0) / stateAnalysis.length;

    return { active, churned, returned, avgChurns, avgReturns };
  }, [stateAnalysis]);

  const getStateColor = (state: NumberState) => {
    switch (state) {
      case "active": return "#28a745";
      case "churned": return "#dc3545";
      case "returned": return "#17a2b8";
    }
  };

  const getStateBadge = (state: NumberState) => {
    const color = getStateColor(state);
    const label = state.charAt(0).toUpperCase() + state.slice(1);
    return (
      <span style={{
        padding: "0.25rem 0.5rem",
        background: color,
        color: "white",
        borderRadius: "4px",
        fontSize: "0.75rem",
        fontWeight: "bold",
      }}>
        {label}
      </span>
    );
  };

  return (
    <section style={{ padding: "1rem", background: "#fff", borderRadius: "8px", marginBottom: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>🔀 Multi-State Churn Analysis</h2>
      
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        Tracks numbers through states: <strong>Active</strong> → <strong>Churned</strong> → <strong>Returned</strong>.
        Churn threshold: {churnThreshold} draws.
      </p>

      {/* Summary Cards */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", 
        gap: "1rem", 
        marginBottom: "1rem" 
      }}>
        <div style={{ padding: "1rem", background: "#e8f5e9", borderRadius: "4px", borderLeft: "4px solid #28a745" }}>
          <div style={{ fontSize: "0.8rem", color: "#666" }}>Active</div>
          <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{summary.active}</div>
        </div>
        <div style={{ padding: "1rem", background: "#ffebee", borderRadius: "4px", borderLeft: "4px solid #dc3545" }}>
          <div style={{ fontSize: "0.8rem", color: "#666" }}>Churned</div>
          <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{summary.churned}</div>
        </div>
        <div style={{ padding: "1rem", background: "#e0f7fa", borderRadius: "4px", borderLeft: "4px solid #17a2b8" }}>
          <div style={{ fontSize: "0.8rem", color: "#666" }}>Returned</div>
          <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{summary.returned}</div>
        </div>
        <div style={{ padding: "1rem", background: "#f5f5f5", borderRadius: "4px" }}>
          <div style={{ fontSize: "0.8rem", color: "#666" }}>Avg Churns</div>
          <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{summary.avgChurns.toFixed(1)}</div>
        </div>
        <div style={{ padding: "1rem", background: "#f5f5f5", borderRadius: "4px" }}>
          <div style={{ fontSize: "0.8rem", color: "#666" }}>Avg Returns</div>
          <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{summary.avgReturns.toFixed(1)}</div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ marginBottom: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <label>
          Filter:
          <select
            value={filterState}
            onChange={(e) => setFilterState(e.target.value as NumberState | "all")}
            style={{ marginLeft: "0.5rem", padding: "0.25rem" }}
          >
            <option value="all">All States</option>
            <option value="active">Active Only</option>
            <option value="churned">Churned Only</option>
            <option value="returned">Returned Only</option>
          </select>
        </label>

        <label>
          Sort by:
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "state" | "number" | "churns")}
            style={{ marginLeft: "0.5rem", padding: "0.25rem" }}
          >
            <option value="state">State</option>
            <option value="number">Number</option>
            <option value="churns">Times Churned</option>
          </select>
        </label>
      </div>

      {/* State Table */}
      <div style={{ maxHeight: "500px", overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead style={{ position: "sticky", top: 0, background: "#f8f9fa" }}>
            <tr>
              <th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>Number</th>
              <th style={{ padding: "0.5rem", textAlign: "center", borderBottom: "2px solid #dee2e6" }}>State</th>
              <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Since Last</th>
              <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Streak</th>
              <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Total Apps</th>
              <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Churned</th>
              <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Returned</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((info) => (
              <tr key={info.number} style={{ borderBottom: "1px solid #dee2e6" }}>
                <td style={{ padding: "0.5rem", fontWeight: "bold" }}>
                  {info.number}
                </td>
                <td style={{ padding: "0.5rem", textAlign: "center" }}>
                  {getStateBadge(info.currentState)}
                </td>
                <td style={{ padding: "0.5rem", textAlign: "right" }}>
                  {info.timeSinceLast}
                </td>
                <td style={{ padding: "0.5rem", textAlign: "right" }}>
                  {info.currentStreak}
                </td>
                <td style={{ padding: "0.5rem", textAlign: "right" }}>
                  {info.totalAppearances}
                </td>
                <td style={{ padding: "0.5rem", textAlign: "right" }}>
                  {info.timesChurned}
                </td>
                <td style={{ padding: "0.5rem", textAlign: "right" }}>
                  {info.timesReturned}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* State Transition Diagram */}
      <div style={{ marginTop: "1rem", padding: "1rem", background: "#f8f9fa", borderRadius: "4px" }}>
        <strong>State Transition Model:</strong>
        <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", fontSize: "0.9rem" }}>
          <span style={{ padding: "0.5rem", background: "#28a745", color: "white", borderRadius: "4px" }}>Active</span>
          <span>→</span>
          <span style={{ padding: "0.5rem", background: "#dc3545", color: "white", borderRadius: "4px" }}>Churned ({churnThreshold}+ draws)</span>
          <span>→</span>
          <span style={{ padding: "0.5rem", background: "#17a2b8", color: "white", borderRadius: "4px" }}>Returned</span>
        </div>
      </div>
    </section>
  );
};

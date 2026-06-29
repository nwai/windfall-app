import React from "react";

import {
  MAX_USER_SELECTED_NUMBER,
  areUserSelectedNumberListsEqual,
  buildUserSelectionSimulation,
  normalizeUserSelectedNumbers,
  toggleUserSelectedNumber,
} from "../lib/userSelectedNumbers";

const NUMBER_OPTIONS = Array.from({ length: MAX_USER_SELECTED_NUMBER }, (_, index) => index + 1);

interface UserSelectedNumbersPanelProps {
  userSelectedNumbers: number[];
  setUserSelectedNumbers: React.Dispatch<React.SetStateAction<number[]>>;
  title?: string;
  persistKey?: string;
  onSimulate?: (nums: number[]) => void;
  onClear?: () => void;
  isSimulatingUser?: boolean;
  autoExcludeUnselected?: boolean;
  onToggleAutoExclude?: (enabled: boolean) => void;
  externalSelectedNumbers?: number[];
  externalSelectedLabel?: string;
}

export const UserSelectedNumbersPanel: React.FC<UserSelectedNumbersPanelProps> = ({
  userSelectedNumbers,
  setUserSelectedNumbers,
  title = "User Selected Numbers",
  persistKey = "userSelectedNumbers",
  onSimulate,
  onClear,
  isSimulatingUser = false,
  autoExcludeUnselected = false,
  onToggleAutoExclude,
  externalSelectedNumbers = [],
  externalSelectedLabel = "external forced selections",
}) => {
  const hasLoadedPersistedSelection = React.useRef(false);
  const pendingPersistedSelection = React.useRef<number[] | null>(null);

  const selectedNumbers = React.useMemo(
    () => normalizeUserSelectedNumbers(userSelectedNumbers),
    [userSelectedNumbers],
  );
  const selectedSet = React.useMemo(() => new Set(selectedNumbers), [selectedNumbers]);
  const lockedExternalNumbers = React.useMemo(
    () => normalizeUserSelectedNumbers(externalSelectedNumbers).filter((number) => !selectedSet.has(number)),
    [externalSelectedNumbers, selectedSet],
  );
  const lockedExternalSet = React.useMemo(() => new Set(lockedExternalNumbers), [lockedExternalNumbers]);
  const simulation = React.useMemo(
    () => buildUserSelectionSimulation(selectedNumbers),
    [selectedNumbers],
  );

  const selectedCount = selectedNumbers.length;
  const autoExcludeAvailable = selectedCount > 0 && !!onToggleAutoExclude;
  const autoExcludeActive = autoExcludeAvailable && autoExcludeUnselected;
  const autoExcludedCount = autoExcludeActive ? MAX_USER_SELECTED_NUMBER - selectedCount : 0;
  const simulateDisabled = !onSimulate || (!isSimulatingUser && !simulation.ready);

  React.useEffect(() => {
    if (hasLoadedPersistedSelection.current) return;
    hasLoadedPersistedSelection.current = true;

    try {
      const raw = localStorage.getItem(persistKey);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      const persisted = normalizeUserSelectedNumbers(Array.isArray(parsed) ? parsed : []);
      if (persisted.length > 0 && !isSameNumberList(userSelectedNumbers, persisted)) {
        pendingPersistedSelection.current = persisted;
        setUserSelectedNumbers(persisted);
      }
    } catch {
      pendingPersistedSelection.current = null;
    }
  }, [persistKey, setUserSelectedNumbers, userSelectedNumbers]);

  React.useEffect(() => {
    const pending = pendingPersistedSelection.current;
    if (pending && !isSameNumberList(selectedNumbers, pending)) return;
    pendingPersistedSelection.current = null;

    try {
      localStorage.setItem(persistKey, JSON.stringify(selectedNumbers));
    } catch {
      // Browser storage can be unavailable in privacy modes; app state remains authoritative.
    }
  }, [persistKey, selectedNumbers]);

  React.useEffect(() => {
    if (!isSameNumberList(userSelectedNumbers, selectedNumbers)) {
      setUserSelectedNumbers(selectedNumbers);
    }
  }, [selectedNumbers, setUserSelectedNumbers, userSelectedNumbers]);

  React.useEffect(() => {
    if (autoExcludeUnselected && selectedCount === 0) {
      onToggleAutoExclude?.(false);
    }
  }, [autoExcludeUnselected, onToggleAutoExclude, selectedCount]);

  const handleToggle = React.useCallback((number: number) => {
    setUserSelectedNumbers((current) => toggleUserSelectedNumber(current, number));
  }, [setUserSelectedNumbers]);

  const handleClearAll = React.useCallback(() => {
    onClear?.();
    onToggleAutoExclude?.(false);
    setUserSelectedNumbers([]);
  }, [onClear, onToggleAutoExclude, setUserSelectedNumbers]);

  const handleSimulate = React.useCallback(() => {
    if (!onSimulate) return;
    if (isSimulatingUser) {
      onClear?.();
      return;
    }
    if (!simulation.ready) {
      onSimulate([]);
      return;
    }
    onSimulate(simulation.numbers);
  }, [isSimulatingUser, onClear, onSimulate, simulation]);

  return (
    <section style={panel}>
      <div style={header}>
        <div>
          <div style={subtleText}>
            {selectedCount > 0 ? `Selected set: ${selectedNumbers.join(", ")}` : "Selected set: none"}
          </div>
          {lockedExternalNumbers.length > 0 && (
            <div style={{ ...subtleText, color: "#166534", marginTop: 3 }}>
              Locked by {externalSelectedLabel}: {lockedExternalNumbers.join(", ")}
            </div>
          )}
        </div>
        <div style={toolbar}>
          <button
            type="button"
            onClick={handleSimulate}
            disabled={simulateDisabled}
            style={simulateButton(isSimulatingUser, simulateDisabled)}
            title={isSimulatingUser ? "Clear the user-number simulation" : simulation.reason}
          >
            {isSimulatingUser ? "Clear Sim" : "Simulate"}
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={selectedCount === 0 && !isSimulatingUser && !autoExcludeUnselected}
            style={secondaryButton(selectedCount === 0 && !isSimulatingUser && !autoExcludeUnselected)}
            title="Clear selected numbers and linked simulation state"
          >
            Clear
          </button>
        </div>
      </div>

      <div style={metricsGrid}>
        <Metric label="Selected" value={String(selectedCount)} />
        <Metric
          label="Simulation"
          value={simulation.ready ? `${simulation.main.length}+${simulation.supp.length}` : `${selectedCount}/6`}
        />
        <Metric label="Auto-Exclude" value={autoExcludeActive ? `${autoExcludedCount} held` : "Off"} />
      </div>

      <div style={numberGrid} aria-label="User selected number buttons">
        {NUMBER_OPTIONS.map((number) => {
          const active = selectedSet.has(number);
          const locked = lockedExternalSet.has(number);
          const pressed = active || locked;
          const ariaLabel = locked
            ? `Number ${number} is forced by ${externalSelectedLabel}`
            : active
              ? `Remove user selected number ${number}`
              : `Add user selected number ${number}`;
          return (
            <button
              key={number}
              type="button"
              aria-label={ariaLabel}
              onClick={() => handleToggle(number)}
              disabled={locked}
              style={numberButton(pressed, locked)}
              aria-pressed={pressed}
              title={locked ? `Selected in ${externalSelectedLabel}; deselect it there to release it.` : active ? `Remove ${number}` : `Add ${number}`}
            >
              {number}
            </button>
          );
        })}
      </div>

      <div style={footerRow}>
        <label style={toggleLabel(autoExcludeAvailable)} title="Use only the selected set as the eligible number space">
          <input
            type="checkbox"
            checked={autoExcludeActive}
            disabled={!autoExcludeAvailable}
            onChange={(event) => onToggleAutoExclude?.(event.currentTarget.checked)}
          />
          Exclude unselected
        </label>
        <span style={subtleText}>
          {autoExcludeActive
            ? `${selectedCount} numbers remain eligible for user-controlled generation filters.`
            : "Selections are available to highlights, weighted targets, selected boosts, and simulation."}
        </span>
      </div>
    </section>
  );
};

interface MetricProps {
  label: string;
  value: string;
}

const Metric: React.FC<MetricProps> = ({ label, value }) => (
  <div style={metric}>
    <span style={metricLabel}>{label}</span>
    <b style={metricValue}>{value}</b>
  </div>
);

function isSameNumberList(left: readonly number[], right: readonly number[]): boolean {
  return areUserSelectedNumberListsEqual(left, right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

const panel: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 14,
  background: "#fff",
  marginTop: 16,
};

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
};

const subtleText: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  lineHeight: 1.35,
};

const toolbar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const metricsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))",
  gap: 8,
  marginTop: 12,
};

const metric: React.CSSProperties = {
  minHeight: 48,
  padding: "8px 10px",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#f8fafc",
};

const metricLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "#64748b",
};

const metricValue: React.CSSProperties = {
  display: "block",
  marginTop: 2,
  fontSize: 15,
  color: "#0f172a",
};

const numberGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(38px, 42px))",
  gap: 6,
  justifyContent: "start",
  marginTop: 12,
};

const footerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 12,
};

const simulateButton = (active: boolean, disabled: boolean): React.CSSProperties => ({
  minHeight: 32,
  padding: "6px 11px",
  border: `1px solid ${active ? "#2563eb" : "#cbd5e1"}`,
  borderRadius: 6,
  background: disabled ? "#f1f5f9" : active ? "#2563eb" : "#fff",
  color: disabled ? "#94a3b8" : active ? "#fff" : "#0f172a",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.2,
});

const secondaryButton = (disabled: boolean): React.CSSProperties => ({
  minHeight: 32,
  padding: "6px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  background: disabled ? "#f1f5f9" : "#fff",
  color: disabled ? "#94a3b8" : "#0f172a",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 12,
  lineHeight: 1.2,
});

const numberButton = (active: boolean, locked = false): React.CSSProperties => ({
  width: 38,
  height: 32,
  border: `1px solid ${locked ? "#15803d" : active ? "#2563eb" : "#cbd5e1"}`,
  borderRadius: 6,
  background: locked ? "#dcfce7" : active ? "#2563eb" : "#fff",
  boxShadow: active && !locked ? "inset 0 0 0 1px #2563eb" : "none",
  color: locked ? "#14532d" : active ? "#fff" : "#0f172a",
  cursor: locked ? "not-allowed" : "pointer",
  fontSize: 12,
  fontWeight: active ? 700 : 500,
  lineHeight: 1,
});

const toggleLabel = (enabled: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 28,
  color: enabled ? "#0f172a" : "#94a3b8",
  cursor: enabled ? "pointer" : "not-allowed",
  fontSize: 12,
  fontWeight: 600,
});

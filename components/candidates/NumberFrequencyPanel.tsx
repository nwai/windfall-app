import React, { useMemo, useState, useEffect } from "react";
import type { Draw } from "../../types";

type SortMode = "lastAgoAsc" | "countDesc" | "numberAsc";

type NumberFrequencyPanelProps = {
  draws: Draw[];
  // Optional: if provided, the panel will update the app-level exclusions immediately.
  excludedNumbers?: number[];
  setExcludedNumbers?: React.Dispatch<React.SetStateAction<number[]>>;

  // Optional UI toggles
  showClearButton?: boolean;
  showHeader?: boolean;
};

export function NumberFrequencyPanel({
  draws,
  excludedNumbers,
  setExcludedNumbers,
  showClearButton = true,
  showHeader = true,
}: NumberFrequencyPanelProps) {
  // Local selection state used when parent doesn't provide setExcludedNumbers.
  const [localSelected, setLocalSelected] = useState<number[]>([]);

  // Sort mode (preserved from original behavior)
  const [sortMode, setSortMode] = useState<SortMode>("lastAgoAsc");

  // Keep localSelected in sync if parent controls selection
  useEffect(() => {
    if (excludedNumbers && setExcludedNumbers) {
      setLocalSelected(excludedNumbers.slice());
    }
  }, [excludedNumbers, setExcludedNumbers]);

  // Compute counts & last-seen info
  const stats = useMemo(() => {
    const counts = Array(46).fill(0); // index by number
    const lastSeen = Array<number | null>(46).fill(null);
    // Count occurrences
    for (let i = 0; i < draws.length; i++) {
      const d = draws[i];
      [...d.main, ...d.supp].forEach((n) => {
        if (n >= 1 && n <= 45) counts[n] += 1;
      });
    }
    // lastSeen: 0 = most recent draw, 1 = one draw ago, etc.
    for (let i = draws.length - 1; i >= 0; i--) {
      const ago = (draws.length - 1) - i;
      const d = draws[i];
      [...d.main, ...d.supp].forEach((n) => {
        if (n >= 1 && n <= 45 && lastSeen[n] == null) lastSeen[n] = ago;
      });
    }
    return { counts, lastSeen };
  }, [draws]);

  // Helper to get whether number is selected
  const isSelected = (n: number) => {
    if (setExcludedNumbers) {
      return (excludedNumbers ?? []).includes(n);
    }
    return localSelected.includes(n);
  };

  function toggleNumber(n: number) {
    if (setExcludedNumbers) {
      setExcludedNumbers((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
    } else {
      setLocalSelected((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
    }
  }

  function clearAll() {
    if (setExcludedNumbers) {
      setExcludedNumbers([]);
    }
    setLocalSelected([]);
  }

  // Sorting: produce an ordered array of numbers 1..45 according to sortMode
  const orderedNumbers = useMemo(() => {
    const asNum = (x: number | null) => (x === null ? Number.POSITIVE_INFINITY : x);

    const byLastAgoAsc = (a: number, b: number) => {
      const la = asNum(stats.lastSeen[a]);
      const lb = asNum(stats.lastSeen[b]);
      if (la !== lb) return la - lb;
      if (stats.counts[b] !== stats.counts[a]) return stats.counts[b] - stats.counts[a];
      return a - b;
    };

    const byCountDesc = (a: number, b: number) => {
      if (stats.counts[b] !== stats.counts[a]) return stats.counts[b] - stats.counts[a];
      const la = asNum(stats.lastSeen[a]);
      const lb = asNum(stats.lastSeen[b]);
      if (la !== lb) return la - lb;
      return a - b;
    };

    const byNumberAsc = (a: number, b: number) => a - b;

    const arr = Array.from({ length: 45 }, (_, i) => i + 1);
    switch (sortMode) {
      case "lastAgoAsc":
        return arr.sort(byLastAgoAsc);
      case "countDesc":
        return arr.sort(byCountDesc);
      case "numberAsc":
        return arr.sort(byNumberAsc);
      default:
        return arr;
    }
  }, [stats, sortMode]);

  const fmtAgo = (ago: number | null) => (ago === null ? "—" : String(ago));

  // Render tile for a number
  const renderNumberCell = (n: number) => {
    const count = stats.counts[n] ?? 0;
    const last = stats.lastSeen[n];
    const sel = isSelected(n);
    const bg = sel ? "#ffcdd2" : "#fff";
    const border = sel ? "2px solid #c62828" : "1px solid #eee";
    return (
      <div
        key={n}
        onClick={() => toggleNumber(n)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleNumber(n);
          }
        }}
        title={sel ? `Click to unselect ${n}` : `Click to select ${n} for exclusion`}
        style={{
          cursor: "pointer",
          background: bg,
          border,
          borderRadius: 6,
          padding: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          userSelect: "none",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 14, color: sel ? "#b71c1c" : "#222" }}>{n}</div>
        <div style={{ fontSize: 11, color: "#444", marginTop: 6 }}>{count} hits</div>
        <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
          {last == null ? "Never" : `${last} draws ago`}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 8 }}>
      {showHeader && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Number Frequency</div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 12, color: "#666" }}>
              Sort by:{" "}
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                style={{ marginLeft: 6, fontSize: 12 }}
                title="Change sorting"
              >
                <option value="lastAgoAsc">Last drawn (recent first)</option>
                <option value="countDesc">Count (high → low)</option>
                <option value="numberAsc">Number (1 → 45)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(9, 1fr)",
          gap: 8,
          alignItems: "stretch",
        }}
      >
        {orderedNumbers.map((n) => renderNumberCell(n))}
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
        {showClearButton && (
          <button
            onClick={clearAll}
            style={{
              background: "#f5f5f5",
              border: "1px solid #ddd",
              padding: "6px 10px",
              borderRadius: 6,
              cursor: "pointer",
            }}
            title="Clear all selected numbers"
          >
            Clear selections
          </button>
        )}

        {!setExcludedNumbers && localSelected.length > 0 && (
          <div style={{ fontSize: 13, color: "#444" }}>
            Selected for exclusion: <b>{localSelected.join(", ")}</b>
          </div>
        )}

        {setExcludedNumbers && (
          <div style={{ fontSize: 13, color: "#444" }}>
            Currently excluded: <b>{(excludedNumbers ?? []).join(", ") || "none"}</b>
          </div>
        )}
      </div>
    </div>
  );
}

export default NumberFrequencyPanel;
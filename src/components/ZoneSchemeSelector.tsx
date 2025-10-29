import React, { useMemo, useState } from "react";
import { getSavedGroups, setSavedGroups, getSavedSelectedZones, setSavedSelectedZones, resetZPA, DEFAULT_GROUPS } from "../lib/zpaStorage";

// Helper to build contiguous groups that cover 1..45 exactly
function buildContiguousGroups(zones: number, size: number): number[][] {
  const total = zones * size;
  if (total !== 45) throw new Error(`zones*size must be 45; got ${zones}*${size}=${total}`);
  const groups: number[][] = [];
  let start = 1;
  for (let i = 0; i < zones; i++) {
    const g: number[] = [];
    for (let j = 0; j < size; j++) g.push(start + j);
    groups.push(g);
    start += size;
  }
  return groups;
}

function inferSchemeLabel(groups: number[][] | null | undefined): string {
  if (!groups || groups.length === 0) return "9×5";
  const zones = groups.length;
  const size = groups[0]?.length ?? 0;
  if (zones * size !== 45) return `${zones}×?`;
  return `${zones}×${size}`;
}

type SchemeKey = "3x15" | "5x9" | "9x5" | "15x3";

const SCHEMES: Record<SchemeKey, { zones: number; size: number; label: string }> = {
  "3x15": { zones: 3, size: 15, label: "3 × 15" },
  "5x9" : { zones: 5, size: 9,  label: "5 × 9"  },
  "9x5" : { zones: 9, size: 5,  label: "9 × 5 (default)" },
  "15x3": { zones: 15, size: 3, label: "15 × 3" },
};

function schemeKeyFromGroups(groups: number[][] | null | undefined): SchemeKey {
  if (!groups?.length) return "9x5";
  const zones = groups.length;
  const size = groups[0]?.length ?? 0;
  const key = `${zones}x${size}` as SchemeKey;
  return (key in SCHEMES ? key : "9x5");
}

export function ZoneSchemeSelector({ onApplied }: { onApplied?: () => void }) {
  const saved = useMemo(() => {
    try { return getSavedGroups(); } catch { return null; }
  }, []);
  const [selected, setSelected] = useState<SchemeKey>(schemeKeyFromGroups(saved));

  const apply = () => {
    const conf = SCHEMES[selected];
    const groups = buildContiguousGroups(conf.zones, conf.size);
    setSavedGroups(groups); // auto-resizes selectedZones internally
    // Optional: force all zones ON after scheme change
    setSavedSelectedZones(Array(groups.length).fill(true));
    if (onApplied) onApplied();
  };

  const reset = () => {
    resetZPA();
    setSelected("9x5");
    if (onApplied) onApplied();
  };

  const currentText = inferSchemeLabel(saved);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", border: "1px solid #e3f2fd", background: "#f7fafe", borderRadius: 6 }}>
      <b>ZPA zone scheme</b>
      <span style={{ color: "#666", fontSize: 12 }}>Current: {currentText}</span>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value as SchemeKey)}
        style={{ minWidth: 160 }}
        title="Choose how to partition numbers 1..45 into zones"
      >
        {Object.entries(SCHEMES).map(([k, v]) => (
          <option key={k} value={k}>{v.label}</option>
        ))}
      </select>
      <button onClick={apply} title="Apply and reload ZPA panels">Apply</button>
      <button onClick={reset} title="Reset to default 9×5" style={{ marginLeft: 6 }}>Reset</button>
    </div>
  );
}

export default ZoneSchemeSelector;
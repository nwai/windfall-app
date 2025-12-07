import React from "react";
import { CandidateSet, Draw } from "../../types";

export interface GeneratedCandidatesPanelProps {
  onGenerate: () => void;
  candidates: CandidateSet[];
  quotaWarning?: string;
  isGenerating?: boolean;
  numCandidates: number;
  setNumCandidates: (n: number) => void;
  forcedNumbers?: number[]; // NEW: forced (trend) numbers to count in SelHits
  userSelectedNumbers: number[];
  setUserSelectedNumbers: (nums: number[]) => void;

  onSelectCandidate: (idx: number) => void;
  onSimulateCandidate?: (idx: number) => void;
  selectedCandidateIdx: number;

  mostRecentDraw: Draw | null;

  manualSimSelected: number[];
  setManualSimSelected: React.Dispatch<React.SetStateAction<number[]>>;
  onManualSimulationChanged?: (next: number[]) => void;

  activeOGABand?: { lower: number; upper: number } | null;

  ogaScoresRef?: number[];
}

export const GeneratedCandidatesPanel: React.FC<GeneratedCandidatesPanelProps> = ({
  onGenerate,
  candidates,
  quotaWarning,
  isGenerating = false,
  numCandidates,
  setNumCandidates,
  userSelectedNumbers,
  setUserSelectedNumbers,
  onSelectCandidate,
  onSimulateCandidate,
  selectedCandidateIdx,
  mostRecentDraw,
  manualSimSelected,
  setManualSimSelected,
  onManualSimulationChanged,
  activeOGABand,
  ogaScoresRef,
  forcedNumbers = [],
}) => {
  const recentSet = new Set([...(mostRecentDraw?.main || []), ...(mostRecentDraw?.supp || [])]);
  const selSet = new Set(userSelectedNumbers);
  const forcedSet = new Set(forcedNumbers);
  const hitSet = new Set<number>([...selSet, ...forcedSet]); // union for SelHits

  const selHeader = forcedNumbers.length ? "Sel/Forced Hits" : "SelHits";

  function formatOGATooltip(ogaScore?: number, ogaPct?: number): string | undefined {
    if (ogaScore === undefined || ogaPct === undefined) return undefined;
    const ref = Array.isArray(ogaScoresRef) ? ogaScoresRef : undefined;
    if (!ref || ref.length === 0) return `OGA raw ${ogaScore.toFixed(2)} • ${ogaPct.toFixed(1)}%`;
    const sorted = ref.slice().sort((a, b) => a - b);
    let rank = 0;
    for (let i = 0; i < sorted.length; i++) if (sorted[i] <= ogaScore) rank++;
    let nearestIdx = 0;
    let best = Infinity;
    for (let i = 0; i < sorted.length; i++) {
      const d = Math.abs(sorted[i] - ogaScore);
      if (d < best) {
        best = d;
        nearestIdx = i;
      }
    }
    const nearestRaw = sorted[nearestIdx];
    return `OGA raw ${ogaScore.toFixed(2)} • ${ogaPct.toFixed(1)}%\nRef: rank ${rank}/${sorted.length}, nearest ${nearestRaw.toFixed(2)}`;
  }

  function renderNumber(n: number) {
    const isHit = hitSet.has(n); // selected or forced
    const isRecent = recentSet.has(n);
    const base: React.CSSProperties = {
      padding: "0 4px",
      margin: "0 2px",
      borderRadius: 14,
      display: "inline-block",
      fontVariantNumeric: "tabular-nums",
      fontSize: 12,
    };
    if (isHit && isRecent) {
      return (
        <span
          key={n}
          style={{
            ...base,
            background: "linear-gradient(90deg,#ffe58a,#fff3c4)",
            fontWeight: 700,
            color: "#c62828",
            textDecoration: "underline",
          }}
          title="Selected/Forced & Recently drawn"
        >
          {n}
        </span>
      );
    }
    if (isHit) {
      return (
        <span
          key={n}
          style={{
            ...base,
            color: "#d32f2f",
            fontWeight: 700,
            textDecoration: "underline",
          }}
          title="Selected/Forced"
        >
          {n}
        </span>
      );
    }
    if (isRecent) {
      return (
        <span
          key={n}
          style={{
            ...base,
            background: "#fff59d",
            fontWeight: 600,
          }}
          title="Recently drawn"
        >
          {n}
        </span>
      );
    }
    return (
      <span key={n} style={base}>
        {n}
      </span>
    );
  }

  function toggleManualPick(n: number) {
    setManualSimSelected((prev) => {
      const next = prev.includes(n)
        ? prev.filter((x) => x !== n)
        : prev.length >= 8
        ? prev
        : [...prev, n];

      onManualSimulationChanged?.(next);
      return next;
    });
  }

  return (
    <section style={panel}>
      <header style={hdr}>
        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          Generated Candidates
        </div>
        <label style={{ fontSize: 12 }}>
          Count:
          <input
            type="number"
            min={1}
            max={500}
            value={numCandidates}
            onChange={(e) => setNumCandidates(Math.max(1, Number(e.target.value) || 1))}
            style={{ width: 80, marginLeft: 6 }}
          />
        </label>
        <button type="button" disabled={isGenerating} onClick={onGenerate} style={genBtn(isGenerating)}>
          {isGenerating ? "Generating…" : "Generate"}
        </button>
        {quotaWarning && <span style={{ color: "#d32f2f", fontSize: 12 }}>{quotaWarning}</span>}
        {activeOGABand && (
          <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>
            OGA raw filter: {activeOGABand.lower.toFixed(2)} – {activeOGABand.upper.toFixed(2)}
          </div>
        )}
      </header>

      {candidates.length === 0 ? (
        <div style={{ color: "#777", fontSize: 13 }}>No candidates yet. Click Generate.</div>
      ) : (
        <table style={tbl}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={th}>#</th>
              <th style={th}>Main (6)</th>
              <th style={th}>Supp (2)</th>
              <th style={th}>Comp%</th>
              <th style={th}>OGA Raw</th>
              <th style={th}>OGA%</th>
              <th style={th}>{selHeader}</th>
              <th style={th}>RecentHits</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c: any, i) => {
              const isSelRow = i === selectedCandidateIdx;
              const nums = [...c.main, ...c.supp];
              const selHits = c.selHits ?? nums.filter((n) => hitSet.has(n)).length;
              const recentHits = c.recentHits ?? nums.filter((n) => recentSet.has(n)).length;
              const shade = selHits
                ? `rgba(25,118,210,${0.08 + 0.3 * (selHits / 8)})`
                : isSelRow
                ? "#FFF9C4"
                : undefined;
              const ogaRaw = c.ogaScore as number | undefined;
              const ogaPct = c.ogaPercentile as number | undefined;
              const ogaTip = formatOGATooltip(ogaRaw, ogaPct);

              return (
                <tr
                  key={i}
                  style={{ background: shade, cursor: "pointer", transition: "background 0.12s" }}
                  onClick={() => onSelectCandidate(i)}
                  title={`${selHeader}=${selHits} RecentHits=${recentHits}`}
                >
                  <td style={tdCenter}>{i + 1}</td>
                  <td style={td}>{c.main.map(renderNumber)}</td>
                  <td style={td}>{c.supp.map(renderNumber)}</td>
                  <td style={tdCenter}>
                    {c.finalCompositeAdj !== undefined ? (c.finalCompositeAdj * 100).toFixed(2) : ""}
                  </td>
                  <td style={tdCenter} title={ogaTip}>
                    {ogaRaw !== undefined ? ogaRaw.toFixed(2) : ""}
                  </td>
                  <td style={tdCenter} title={ogaTip}>
                    {ogaPct !== undefined ? ogaPct.toFixed(1) : ""}
                  </td>
                  <td style={tdCenter}>{selHits}</td>
                  <td style={tdCenter}>{recentHits}</td>
                  <td style={tdCenter}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSimulateCandidate?.(i);
                      }}
                      style={simBtn}
                    >
                      Simulate
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <ManualSim
        manualSimSelected={manualSimSelected}
        setManualSimSelected={setManualSimSelected}
        onManualSimulationChanged={onManualSimulationChanged}
        toggleManualPick={toggleManualPick}
      />
    </section>
  );
};

const ManualSim: React.FC<{
  manualSimSelected: number[];
  setManualSimSelected: React.Dispatch<React.SetStateAction<number[]>>;
  onManualSimulationChanged?: (next: number[]) => void;
  toggleManualPick: (n: number) => void;
}> = ({ manualSimSelected, setManualSimSelected, onManualSimulationChanged, toggleManualPick }) => {
  return (
    <div style={manual}>
      <div style={{ marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
        Manual Simulation (select up to 8; first 6 main, next 2 supp)
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {Array.from({ length: 45 }, (_, i) => i + 1).map((n) => {
          const idx = manualSimSelected.indexOf(n);
          const picked = idx !== -1;
          const atCapacity = manualSimSelected.length >= 8 && !picked;
          const slotColor = picked ? (idx < 6 ? "#4a6fe3" : "#8e44ad") : "#fff";
          return (
            <label
              key={n}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: 34,
                padding: 4,
                border: "1px solid #bbb",
                borderRadius: 6,
                background: slotColor,
                color: picked ? "#fff" : "#333",
                opacity: atCapacity ? 0.35 : 1,
                cursor: atCapacity ? "not-allowed" : "pointer",
                fontSize: 11,
              }}
              title={
                picked
                  ? `Slot ${idx + 1}`
                  : atCapacity
                  ? "Capacity full"
                  : "Add to manual simulation"
              }
            >
              <input
                type="checkbox"
                checked={picked}
                disabled={atCapacity}
                onChange={() => {
                  setManualSimSelected((prev) => {
                    const next = prev.includes(n)
                      ? prev.filter((x) => x !== n)
                      : prev.length >= 8
                      ? prev
                      : [...prev, n];
                    onManualSimulationChanged?.(next);
                    return next;
                  });
                }}
                style={{ marginBottom: 2 }}
              />
              {n}
            </label>
          );
        })}
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: "#555" }}>
        Manual simulation highlights the Temperature Heatmap only.
        Use “Simulate” in the table to add a column to the DGA grid.
      </div>
    </div>
  );
};

/* Styles */
const panel: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 8,
  padding: 16,
  background: "#fff",
  marginTop: 18,
};
const hdr: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 6,
};
const genBtn = (disabled: boolean): React.CSSProperties => ({
  padding: "6px 14px",
  background: disabled ? "#bbb" : "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  fontWeight: 600,
  cursor: disabled ? "default" : "pointer",
});
const tbl: React.CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
  fontSize: 12,
};
const th: React.CSSProperties = {
  textAlign: "center",
  padding: "4px 6px",
  borderBottom: "1px solid #ddd",
  fontWeight: 600,
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "4px 6px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
  textAlign: "left",
};
const tdCenter: React.CSSProperties = { ...td, textAlign: "center" };
const simBtn: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 4,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
  fontSize: 11,
};
const manual: React.CSSProperties = {
  marginTop: 16,
  borderTop: "1px solid #ddd",
  paddingTop: 10,
  background: "#f7f3ff",
  borderRadius: 6,
};
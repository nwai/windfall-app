import React from "react";
import { CandidateSet, Draw } from "../../types";

export interface GeneratedCandidatesPanelProps {
  onGenerate: () => void;
  candidates: CandidateSet[];
  quotaWarning?: string;
  isGenerating?: boolean;
  numCandidates: number;
  setNumCandidates: (n: number) => void;

  userSelectedNumbers: number[];
  setUserSelectedNumbers: (nums: number[]) => void;

  onSelectCandidate: (idx: number) => void;
  onSimulateCandidate?: (idx: number) => void;
  selectedCandidateIdx: number;

  mostRecentDraw: Draw | null;

  manualSimSelected: number[];
  setManualSimSelected: React.Dispatch<React.SetStateAction<number[]>>;
  onManualSimulationChanged: () => void;
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
  onManualSimulationChanged
}) => {

  const selSet = new Set(userSelectedNumbers);
  const recentSet = new Set<number>(
    mostRecentDraw ? [...mostRecentDraw.main, ...mostRecentDraw.supp] : []
  );

  function toggleManualPick(n: number) {
    setManualSimSelected(prev => {
      let next: number[];
      if (prev.includes(n)) next = prev.filter(x => x !== n);
      else {
        if (prev.length >= 8) return prev;
        next = [...prev, n];
      }
      return next;
    });
    onManualSimulationChanged();
  }

  function renderNumber(n: number) {
    const isSel = selSet.has(n);
    const isRecent = recentSet.has(n);
    const base: React.CSSProperties = {
      padding: "0 4px",
      margin: "0 2px",
      borderRadius: 14,
      display: "inline-block",
      fontVariantNumeric: "tabular-nums",
      fontSize: 12
    };
    if (isSel && isRecent) {
      return (
        <span
          key={n}
          style={{
            ...base,
            background: "linear-gradient(90deg,#ffe58a,#fff3c4)",
            fontWeight: 700,
            color: "#c62828",
            textDecoration: "underline"
          }}
          title="User-selected & Recently drawn"
        >
          {n}
        </span>
      );
    }
    if (isSel) {
      return (
        <span
          key={n}
          style={{
            ...base,
            color: "#d32f2f",
            fontWeight: 700,
            textDecoration: "underline"
          }}
          title="User-selected"
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
            fontWeight: 600
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

  return (
    <section style={panel}>
      <header style={hdr}>
        <div style={{ fontWeight: 600 }}>Generated Candidates</div>
        <label style={{ fontSize: 12 }}>
          Count:
          <input
            type="number"
            min={1}
            max={500}
            value={numCandidates}
            onChange={e => setNumCandidates(Math.max(1, Number(e.target.value) || 1))}
            style={{ width: 80, marginLeft: 6 }}
          />
        </label>
        <button
          type="button"
          disabled={isGenerating}
          onClick={onGenerate}
          style={genBtn(isGenerating)}
        >
          {isGenerating ? "Generating…" : "Generate"}
        </button>
        {quotaWarning && <span style={{ color: "#d32f2f", fontSize: 12 }}>{quotaWarning}</span>}
      </header>

      <LegendBar />

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
              <th style={th}>OGA%</th>
              <th style={th}>SelHits</th>
              <th style={th}>RecentHits</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c: any, i) => {
              const isSelRow = i === selectedCandidateIdx;
              const nums = [...c.main, ...c.supp];
              const selHits = c.selHits ?? nums.filter(n => selSet.has(n)).length;
              const recentHits = c.recentHits ?? nums.filter(n => recentSet.has(n)).length;
              const shade = selHits
                ? `rgba(25,118,210,${0.08 + 0.3 * (selHits / 8)})`
                : isSelRow
                  ? "#FFF9C4"
                  : undefined;
              return (
                <tr
                  key={i}
                  style={{
                    background: shade,
                    cursor: "pointer",
                    transition: "background 0.12s"
                  }}
                  onClick={() => onSelectCandidate(i)}
                  title={`SelHits=${selHits} RecentHits=${recentHits}`}
                >
                  <td style={tdCenter}>{i + 1}</td>
                  <td style={td}>{c.main.map(renderNumber)}</td>
                  <td style={td}>{c.supp.map(renderNumber)}</td>
                  <td style={tdCenter}>
                    {c.finalComposite !== undefined
                      ? (c.finalComposite * 100).toFixed(2)
                      : ""}
                  </td>
                  <td style={tdCenter}>
                    {c.ogaPercentile !== undefined
                      ? c.ogaPercentile.toFixed(1)
                      : ""}
                  </td>
                  <td style={tdCenter}>{selHits}</td>
                  <td style={tdCenter}>{recentHits}</td>
                  <td style={tdCenter}>
                    <button
                      type="button"
                      onClick={e => {
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
      />
    </section>
  );
};

/* Legend */
const LegendBar: React.FC = () => (
  <div style={{
    display: "flex",
    gap: 22,
    alignItems: "center",
    flexWrap: "wrap",
    fontSize: 11,
    margin: "4px 0 10px",
    color: "#444"
  }}>
    <span><span style={legBadge("#fff59d", "#444")}>12</span> Recent</span>
    <span><span style={legSel}>12</span> Selected</span>
    <span><span style={legBoth}>12</span> Both</span>
  </div>
);

const legBadge = (bg: string, color: string): React.CSSProperties => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 14,
  background: bg,
  fontWeight: 600,
  color,
  fontSize: 12
});
const legSel: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 6px",
  borderRadius: 14,
  fontWeight: 700,
  color: "#d32f2f",
  textDecoration: "underline",
  fontSize: 12
};
const legBoth: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 6px",
  borderRadius: 14,
  fontWeight: 700,
  background: "linear-gradient(90deg,#ffe58a,#fff3c4)",
  color: "#c62828",
  textDecoration: "underline",
  fontSize: 12
};

/* Manual Simulation */
const ManualSim: React.FC<{
  manualSimSelected: number[];
  setManualSimSelected: React.Dispatch<React.SetStateAction<number[]>>;
  onManualSimulationChanged: () => void;
}> = ({ manualSimSelected, setManualSimSelected, onManualSimulationChanged }) => {
  function toggle(n: number) {
    setManualSimSelected(prev => {
      let next: number[];
      if (prev.includes(n)) next = prev.filter(x => x !== n);
      else {
        if (prev.length >= 8) return prev;
        next = [...prev, n];
      }
      return next;
    });
    onManualSimulationChanged();
  }
  return (
    <div style={manual}>
      <div style={{ marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
        Manual Simulation (select up to 8; first 6 main, next 2 supp)
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {Array.from({ length: 45 }, (_, i) => i + 1).map(n => {
          const idx = manualSimSelected.indexOf(n);
          const picked = idx !== -1;
          const atCapacity = manualSimSelected.length >= 8 && !picked;
          const slotColor = picked
            ? idx < 6
              ? "#4a6fe3"
              : "#8e44ad"
            : "#fff";
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
                fontSize: 11
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
                onChange={() => toggle(n)}
                style={{ marginBottom: 2 }}
              />
              {n}
            </label>
          );
        })}
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: "#555" }}>
        Selecting manual sim numbers clears row simulation; simulating a row clears manual list.
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
  marginTop: 18
};
const hdr: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 6
};
const genBtn = (disabled: boolean): React.CSSProperties => ({
  padding: "6px 14px",
  background: disabled ? "#bbb" : "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  fontWeight: 600,
  cursor: disabled ? "default" : "pointer"
});
const tbl: React.CSSProperties = { borderCollapse: "collapse", width: "100%", fontSize: 12 };
const th: React.CSSProperties = {
  textAlign: "center",
  padding: "4px 6px",
  borderBottom: "1px solid #ddd",
  fontWeight: 600,
  whiteSpace: "nowrap"
};
const td: React.CSSProperties = {
  padding: "4px 6px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
  textAlign: "left"
};
const tdCenter: React.CSSProperties = { ...td, textAlign: "center" };
const simBtn: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 4,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
  fontSize: 11
};
const manual: React.CSSProperties = {
  marginTop: 16,
  borderTop: "1px solid #ddd",
  paddingTop: 10,
  background: "#f7f3ff",
  borderRadius: 6
};
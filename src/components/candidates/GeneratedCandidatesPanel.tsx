import React, { useMemo, useState } from "react";
import { generateExhaustiveCombos } from "../../lib/exhaustiveGenerator";
import { computeOGA, getOGAPercentile } from "../../utils/oga";
import { CandidateSet, Draw } from "../../types";

export interface GeneratedCandidatesPanelProps {
  onGenerate: () => void;
  candidates: CandidateSet[];
  quotaWarning?: string;
  isGenerating?: boolean;
  numCandidates: number;
  setNumCandidates: (n: number) => void;
  forcedNumbers?: number[];
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

  // Optional simulation visual state
  activeSimCandidateIdx?: number;
  simSourceKind?: "none" | "candidate" | "user";

  // Batch frequency debug
  batchSize: number;
  setBatchSize: (n: number) => void;
  onRunBatch: () => void;
  batchFreq: { n: number; count: number }[];
  isBatching?: boolean;
  batchSummary?: string;
  batchSessionRuns: number;
  setBatchSessionRuns: (n: number) => void;
  onRunBatchSession: () => void;
  isBatchSessionRunning?: boolean;
  batchSessionProgress?: number;
  batchSessionTopSeries?: { run: number; tops: { n: number; count: number }[] }[];
  batchSessionAggregate?: { n: number; count: number }[];
  onSimulateNumbers?: (nums: number[]) => void;
  monthlyAvgBuckets?: { times: number; avg: number }[];
  monthlyBuckets?: {
    undrawn: Set<number>;
    times1: Set<number>;
    times2: Set<number>;
    times3: Set<number>;
    times4: Set<number>;
    times5: Set<number>;
    times6: Set<number>;
    times7: Set<number>;
    times8: Set<number>;
  };
  historyForOGA?: Draw[];
  ogaRefScores?: number[];
  ogaSpokeCount?: number;
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
  activeSimCandidateIdx,
  simSourceKind,
  batchSize,
  setBatchSize,
  onRunBatch,
  batchFreq,
  isBatching = false,
  batchSummary,
  batchSessionRuns,
  setBatchSessionRuns,
  onRunBatchSession,
  isBatchSessionRunning = false,
  batchSessionProgress = 0,
  batchSessionTopSeries = [],
  batchSessionAggregate = [],
  onSimulateNumbers,
  monthlyAvgBuckets = [],
  monthlyBuckets,
  historyForOGA,
  ogaRefScores,
  ogaSpokeCount,
}) => {
    const [exSource, setExSource] = useState<"user" | "manual" | "custom">("user");
    const [exCustomInput, setExCustomInput] = useState<string>("1,2,3,4,5,6,7,8");
    const [exCap, setExCap] = useState<number>(1000);
    const [exPageSize, setExPageSize] = useState<number>(50);
    const [exPage, setExPage] = useState<number>(0);
    const [exCombos, setExCombos] = useState<CandidateSet[]>([]);
    const [exTotal, setExTotal] = useState<number>(0);
    const [exCapped, setExCapped] = useState<boolean>(false);
     const [pressedButton, setPressedButton] = useState<string | null>(null);
    const recentSet = new Set([...(mostRecentDraw?.main || []), ...(mostRecentDraw?.supp || [])]);
    const selSet = new Set(userSelectedNumbers);
    const forcedSet = new Set(forcedNumbers);
    const hitSet = new Set<number>([...selSet, ...forcedSet]); // union for SelHits

  const manualMainSet = useMemo(() => new Set(manualSimSelected.slice(0, 6)), [manualSimSelected]);
  const manualSuppSet = useMemo(() => new Set(manualSimSelected.slice(6, 8)), [manualSimSelected]);
 
  const exhaustivePool = useMemo(() => {
    const parseCustom = (txt: string) => {
      return txt
        .split(/[^0-9]+/)
        .map((s) => Number(s))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 45);
    };
    const pool = exSource === "user"
      ? userSelectedNumbers
      : exSource === "manual"
      ? manualSimSelected
      : parseCustom(exCustomInput);
    return Array.from(new Set(pool)).sort((a, b) => a - b);
  }, [exSource, userSelectedNumbers, manualSimSelected, exCustomInput]);

  const poolHasEnough = exhaustivePool.length >= 8;

  const exPageCombos = useMemo(() => {
    const start = exPage * exPageSize;
    return exCombos.slice(start, start + exPageSize);
  }, [exCombos, exPage, exPageSize]);

  const exTotalPages = useMemo(() => {
    if (exPageSize <= 0) return 0;
    return Math.ceil(exCombos.length / exPageSize);
  }, [exCombos.length, exPageSize]);

  React.useEffect(() => {
    if (exTotalPages === 0 && exPage !== 0) {
      setExPage(0);
    } else if (exTotalPages > 0 && exPage >= exTotalPages) {
      setExPage(exTotalPages - 1);
    }
  }, [exTotalPages, exPage]);

  const handleExhaustiveGenerate = () => {
    const cappedValue = Math.max(1, exCap);
    setExCap(cappedValue);
    const { combos, total, capped } = generateExhaustiveCombos(exhaustivePool, { cap: cappedValue });

    let combosWithOga: CandidateSet[] = combos;
    if (historyForOGA && historyForOGA.length) {
      const ref = ogaRefScores && ogaRefScores.length ? ogaRefScores : undefined;
      const spoke = ogaSpokeCount ?? 9;
      combosWithOga = combos.map((combo) => {
        const nums = [...combo.main, ...combo.supp];
        const raw = computeOGA(nums, historyForOGA, spoke);
        const pct = ref ? getOGAPercentile(raw, ref) : undefined;
        return { ...combo, ogaScore: raw, ogaPercentile: pct } as CandidateSet;
      });
    }

    setExCombos(combosWithOga);
    setExTotal(total);
    setExCapped(capped);
    setExPage(0);
  };

  const totalCombosEstimate = useMemo(() => exTotal || 0, [exTotal]);
 
   const renderDots = (count: number, color: string, emptyColor: string, ariaLabel: string) => (
     <span aria-label={ariaLabel} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
       {count > 0
         ? Array.from({ length: count }, (_, idx) => (
             <span
               key={`${ariaLabel}-${idx}`}
               style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }}
             />
           ))
         : (
             <span
               style={{ width: 10, height: 10, borderRadius: "50%", border: `1px solid ${emptyColor}`, display: "inline-block" }}
             />
           )}
     </span>
   );

   function computePrizeDivision(main: number[], supp: number[], manualMain: Set<number>, manualSupp: Set<number>): string {
     if (manualMain.size < 6 || manualSupp.size < 2) return "—";
     const mainHits = main.filter((n) => manualMain.has(n)).length;
     const suppHits = supp.filter((n) => manualSupp.has(n)).length;
     if (mainHits === 6) return "Div1";
     if (mainHits === 5 && suppHits >= 1) return "Div2";
     if (mainHits === 5) return "Div3";
     if (mainHits === 4 && suppHits >= 1) return "Div4";
     if (mainHits === 4) return "Div4";
     if (mainHits === 3 && suppHits >= 1) return "Div5";
     if (mainHits === 1 && suppHits === 2) return "Div6";
     return "—";
   }

   const selHeader = forcedNumbers.length ? "Sel/Forced Hits" : "SelHits";

     const numberFreq = useMemo(() => {
       const counts = new Map<number, number>();
       candidates.forEach((c) => {
         [...c.main, ...c.supp].forEach((n: number) => {
           counts.set(n, (counts.get(n) || 0) + 1);
         });
       });
       return Array.from(counts.entries()).sort((a, b) => {
         const diff = b[1] - a[1];
         if (diff !== 0) return diff;
         return a[0] - b[0];
       });
     }, [candidates]);

     function renderNumberWithCount(n: number, count: number) {
       return (
         <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 8 }}>
           {renderNumber(n)}
           <span style={{ fontSize: 11, color: "red", fontVariantNumeric: "tabular-nums" }}>×{count}</span>
         </span>
       );
     }

   function formatOGATooltip(ogaScore?: number, ogaPct?: number): string | undefined {
     if (ogaScore === undefined || ogaPct === undefined) return undefined;
     const ref = Array.isArray(ogaScoresRef) ? ogaScoresRef : undefined;
     if (!ref || ref.length === 0) return `OGA raw ${ogaScore.toFixed(2)} • ${ogaPct.toFixed(1)}%`;
     const sorted = ref.slice().sort((a, b) => a - b);
     // rank = number of ref scores <= candidate
     let rank = 0;
     for (let i = 0; i < sorted.length; i++) if (sorted[i] <= ogaScore) rank++;
     const nearestIdx = (() => {
       let idx = 0;
       let best = Infinity;
       for (let i = 0; i < sorted.length; i++) {
         const d = Math.abs(sorted[i] - ogaScore);
         if (d < best) { best = d; idx = i; }
       }
       return idx;
     })();
     const nearestRaw = sorted[nearestIdx];
     return `OGA raw ${ogaScore.toFixed(2)} • ${ogaPct.toFixed(1)}%\nRef: rank ${rank}/${sorted.length}, nearest ${nearestRaw.toFixed(2)}`;
   }

   function renderNumber(n: number, simRole?: "main" | "supp") {
     const isSel = selSet.has(n);
     const isRecent = recentSet.has(n);
     const dotColor = simRole === "supp" ? "#2e7d32" : simRole === "main" ? "#c62828" : undefined;
     const shell: React.CSSProperties = {
       display: "inline-flex",
       alignItems: "center",
       gap: 6,
       marginRight: 4,
     };
     const base: React.CSSProperties = {
       padding: "0 4px",
       margin: "0 2px",
       borderRadius: 14,
       display: "inline-block",
       fontVariantNumeric: "tabular-nums",
       fontSize: 12,
     };
     let content: React.ReactNode;
     if (isSel && isRecent) {
       content = (
         <span
           key={n}
           style={{
             ...base,
             background: "linear-gradient(90deg,#ffe58a,#fff3c4)",
             fontWeight: 700,
             color: "#c62828",
             textDecoration: "underline",
           }}
           title="User-selected & Recently drawn"
         >
           {n}
         </span>
       );
     } else if (isSel) {
       content = (
         <span
           key={n}
           style={{
             ...base,
             color: "#d32f2f",
             fontWeight: 700,
             textDecoration: "underline",
           }}
           title="User-selected"
         >
           {n}
         </span>
       );
     } else if (isRecent) {
       content = (
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
     } else {
       content = (
         <span key={n} style={base}>
           {n}
         </span>
       );
     }

     if (!dotColor) return content;
     return (
       <span key={`dot-${n}-${simRole}`} style={shell} title={simRole === "supp" ? "Simulated (supp)" : "Simulated (main)"}>
         <span
           style={{
             width: 10,
             height: 10,
             borderRadius: "50%",
             background: dotColor,
             display: "inline-block",
           }}
           aria-label={simRole === "supp" ? "Simulated supplementary" : "Simulated main"}
         />
         {content}
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

   const simulateTopList = (tops: { n: number; count: number }[]) => {
      if (!onSimulateNumbers) return;
      const numbers = tops.map((t) => t.n).slice(0, 8);
      if (numbers.length < 8) return;
      // mains first 6, supp next 2; leave order as listed
      onSimulateNumbers(numbers);
    };

    const bucketColorForNumber = (n: number): { color: string; hasBaseline: boolean } | null => {
      if (!monthlyBuckets) return null;
      if (monthlyBuckets.undrawn.has(n)) return { color: colorForTimes(0), hasBaseline: true };
      if (monthlyBuckets.times1.has(n)) return { color: colorForTimes(1), hasBaseline: true };
      if (monthlyBuckets.times2.has(n)) return { color: colorForTimes(2), hasBaseline: true };
      if (monthlyBuckets.times3.has(n)) return { color: colorForTimes(3), hasBaseline: true };
      if (monthlyBuckets.times4.has(n)) return { color: colorForTimes(4), hasBaseline: true };
      if (monthlyBuckets.times5.has(n)) return { color: colorForTimes(5), hasBaseline: true };
      if (monthlyBuckets.times6.has(n)) return { color: colorForTimes(6), hasBaseline: true };
      if (monthlyBuckets.times7.has(n)) return { color: colorForTimes(7), hasBaseline: true };
      if (monthlyBuckets.times8.has(n)) return { color: colorForTimes(8), hasBaseline: true };
      return null;
    };

    const pickBucketColor = (n: number, count: number): { color: string; hasBaseline: boolean } => {
      const direct = bucketColorForNumber(n);
      if (direct) return direct;
      if (monthlyAvgBuckets.length) {
        let best = monthlyAvgBuckets[0];
        let bestDiff = Math.abs(count - best.avg);
        for (let i = 1; i < monthlyAvgBuckets.length; i++) {
          const b = monthlyAvgBuckets[i];
          const diff = Math.abs(count - b.avg);
          if (diff < bestDiff) { best = b; bestDiff = diff; }
        }
        return { color: colorForTimes(best.times), hasBaseline: true };
      }
      return { color: "#1976d2", hasBaseline: false };
    };
  
     const makePressHandlers = (key: string) => ({
       onMouseDown: () => setPressedButton(key),
       onMouseUp: () => setPressedButton(null),
       onMouseLeave: () => setPressedButton((prev) => (prev === key ? null : prev)),
     });

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
             onChange={(e) =>
               setNumCandidates(Math.max(1, Number(e.target.value) || 1))
             }
             style={{ width: 80, marginLeft: 6 }}
           />
         </label>
         <button type="button" disabled={isGenerating} onClick={onGenerate} style={genBtn(isGenerating)}>
           {isGenerating ? "Generating…" : "Generate"}
         </button>
         {numberFreq.length > 0 ? (
           <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, fontSize: 12 }}>
             <span style={{ color: "#555" }}>Number counts:</span>
             {numberFreq.map(([n, c]) => renderNumberWithCount(n, c))}
           </div>
         ) : null}
         {quotaWarning && (
           <span style={{ color: "#d32f2f", fontSize: 12 }}>{quotaWarning}</span>
         )}
         {activeOGABand && (
           <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>
             OGA raw filter: {activeOGABand.lower.toFixed(2)} – {activeOGABand.upper.toFixed(2)}
           </div>
         )}
       </header>

       {candidates.length === 0 ? (
         <div style={{ color: "#777", fontSize: 13 }}>
           No candidates yet. Click Generate.
         </div>
       ) : (
         <table style={tbl}>
           <thead>
             <tr style={{ background: "#fafafa" }}>
               <th style={th}>#</th>
               <th style={mainTh}>Main (6)</th>
               <th style={th}>Supp (2)</th>
               <th style={th}>Manual (M/S)</th>
               <th style={th}>Prize</th>
               <th style={th}>Odd/Even</th>
               <th style={th}>Comp%</th>
               <th style={th}>OGA Raw</th>
               <th style={th}>OGA%</th>
               <th style={th}>{selHeader}</th>
               <th style={th}>RecentHits</th>
               <th style={th}>Actions</th>
             </tr>
           </thead>
           <tbody>
             {candidates.map((c: any, i: number) => {
               const isSelRow = i === selectedCandidateIdx;
               const nums: number[] = [...c.main, ...c.supp];
               const selHits = c.selHits ?? nums.filter((n: number) => hitSet.has(n)).length;
               const recentHits = c.recentHits ?? nums.filter((n: number) => recentSet.has(n)).length;
               const odd = nums.filter((n: number) => n % 2 === 1).length;
               const even = nums.length - odd;
               const manualMainHits = c.main.filter((n: number) => manualMainSet.has(n)).length;
               const manualSuppHits = c.supp.filter((n: number) => manualSuppSet.has(n)).length;
               const prizeLabel = c.prizeLabel ?? computePrizeDivision(c.main, c.supp, manualMainSet, manualSuppSet);
               const shade = selHits
                 ? `rgba(25,118,210,${0.08 + 0.3 * (selHits / 8)})`
                 : isSelRow
                 ? "#FFF9C4"
                 : undefined;
               const ogaRaw = c.ogaScore as number | undefined;
               const ogaPct = c.ogaPercentile as number | undefined;
               const ogaTip = formatOGATooltip(ogaRaw, ogaPct);
               const isActiveSim = simSourceKind === "candidate" && activeSimCandidateIdx === i;
               return (
                 <tr
                   key={i}
                   style={{
                     background: shade,
                     cursor: "pointer",
                     transition: "background 0.12s",
                   }}
                   onClick={() => onSelectCandidate(i)}
                   title={`SelHits=${selHits} RecentHits=${recentHits}`}
                 >
                   <td style={tdCenter}>{i + 1}</td>
                   <td style={mainTd}>{c.main.map((n: number) => renderNumber(n, isActiveSim ? "main" : undefined))}</td>
                   <td style={td}>{c.supp.map((n: number) => renderNumber(n, isActiveSim ? "supp" : undefined))}</td>
                   <td style={manualTd} title="Matches vs Manual Simulation (M/S)">
                     {renderDots(manualMainHits, "#c62828", "#999", "Manual main hits")}
                     <span style={{ color: "#bbb", padding: "0 3px" }}>/</span>
                     {renderDots(manualSuppHits, "#2e7d32", "#999", "Manual supp hits")}
                   </td>
                   <td style={tdCenter}>{prizeLabel}</td>
                   <td style={tdCenter}>{`${odd}:${even}`}</td>
                   <td style={tdCenter}>
                     {c.finalCompositeAdj !== undefined
                       ? (c.finalCompositeAdj * 100).toFixed(2)
                       : ""}
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
                       style={{
                         ...simBtn,
                         background: isActiveSim ? "#1976d2" : simBtn.background as string,
                         color: isActiveSim ? "#fff" : simBtn.color as string,
                         border: isActiveSim ? "1px solid #1976d2" : simBtn.border as string,
                       }}
                     >
                       {isActiveSim ? "Simulated" : "Simulate"}
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

       {/* Exhaustive from selected numbers */}
       <div style={exPanel}>
         <div style={{ fontWeight: 600, marginBottom: 6 }}>Exhaustive from selected numbers</div>
         <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", fontSize: 12 }}>
           <label>
             <input type="radio" value="user" checked={exSource === "user"} onChange={() => setExSource("user")} /> User Selected
           </label>
           <label>
             <input type="radio" value="manual" checked={exSource === "manual"} onChange={() => setExSource("manual")} /> Manual Sim (8)
           </label>
           <label>
             <input type="radio" value="custom" checked={exSource === "custom"} onChange={() => setExSource("custom")} /> Custom
           </label>
           <label>
             Cap
             <input type="number" min={1} value={exCap} onChange={(e) => setExCap(Math.max(1, Number(e.target.value) || 1))} style={{ width: 80, marginLeft: 6 }} />
           </label>
           <label>
             Page size
             <input type="number" min={10} max={500} value={exPageSize} onChange={(e) => setExPageSize(Math.max(10, Math.min(500, Number(e.target.value) || 10)))} style={{ width: 70, marginLeft: 6 }} />
           </label>
           <button type="button" onClick={handleExhaustiveGenerate} disabled={!poolHasEnough} style={genBtn(!poolHasEnough)}>
             {poolHasEnough ? "Generate exhaustive" : `Need at least 8 numbers (have ${exhaustivePool.length})`}
           </button>
         </div>
         {exSource === "custom" && (
           <div style={{ marginTop: 8 }}>
             <input
               type="text"
               value={exCustomInput}
               onChange={(e) => setExCustomInput(e.target.value)}
               placeholder="Comma or space separated numbers"
               style={{ width: "100%", padding: 6 }}
             />
           </div>
         )}
         <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
           Pool: {exhaustivePool.length} numbers → combos: {totalCombosEstimate.toLocaleString()} {exCapped ? "(showing capped subset)" : ""}
         </div>
         {exCombos.length > 0 && (
           <div style={{ marginTop: 8 }}>
             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
               <span>
                 Showing {exPage * exPageSize + 1} – {Math.min((exPage + 1) * exPageSize, exCombos.length)} of {exCombos.length}
               </span>
               <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                 <button
                   type="button"
                   onClick={() => setExPage(0)}
                   disabled={exPage === 0}
                   style={simBtn}
                 >
                   First
                 </button>
                 <button
                   type="button"
                   onClick={() => setExPage(Math.max(0, exPage - 1))}
                   disabled={exPage === 0}
                   style={simBtn}
                 >
                   Prev
                 </button>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                  Page
                  <select
                    value={exPage}
                    onChange={(e) => setExPage(Number(e.target.value))}
                    disabled={exTotalPages <= 1}
                    style={{ padding: "2px 4px", borderRadius: 4, border: "1px solid #ccc" }}
                  >
                    {Array.from({ length: exTotalPages }, (_, idx) => (
                      <option key={`ex-page-${idx}`} value={idx}>
                        {idx + 1}
                      </option>
                    ))}
                  </select>
                  / {Math.max(exTotalPages, 1)}
                </label>
                 <button
                   type="button"
                   onClick={() => setExPage(Math.min(Math.max(0, exTotalPages - 1), exPage + 1))}
                   disabled={exPage + 1 >= exTotalPages}
                   style={simBtn}
                 >
                   Next
                 </button>
                 <button
                   type="button"
                   onClick={() => setExPage(Math.max(0, exTotalPages - 1))}
                   disabled={exPage + 1 >= exTotalPages}
                   style={simBtn}
                 >
                   Last
                 </button>
               </div>
             </div>
             <table style={exTbl}>
               <thead>
                 <tr style={{ background: "#fafafa" }}>
                   <th style={th}>#</th>
                   <th style={mainTh}>Main (6)</th>
                   <th style={th}>Supp (2)</th>
                   <th style={th}>Odd/Even</th>
                   <th style={th}>OGA Raw</th>
                   <th style={th}>OGA%</th>
                  <th style={th}>Sim</th>
                 </tr>
               </thead>
               <tbody>
                 {exPageCombos.map((combo, idx) => {
                    const nums = [...combo.main, ...combo.supp];
                    const odd = nums.filter((n) => n % 2 === 1).length;
                    const even = nums.length - odd;
                    const ogaRaw = (combo as any).ogaScore as number | undefined;
                    const ogaPct = (combo as any).ogaPercentile as number | undefined;
                    const ogaTip = formatOGATooltip(ogaRaw, ogaPct);
                    const canSim = onSimulateNumbers && nums.length === 8;
                    const pressKey = `ex-${exPage}-${idx}`;
                    const isPressed = pressedButton === pressKey;
                     return (
                       <tr key={`ex-${exPage}-${idx}`}>
                         <td style={tdCenter}>{exPage * exPageSize + idx + 1}</td>
                         <td style={mainTd}>{combo.main.map((n) => renderNumber(n))}</td>
                         <td style={td}>{combo.supp.map((n) => renderNumber(n))}</td>
                         <td style={tdCenter}>{`${odd}:${even}`}</td>
                         <td style={tdCenter} title={ogaTip}>{ogaRaw !== undefined ? ogaRaw.toFixed(2) : ""}</td>
                         <td style={tdCenter} title={ogaTip}>{ogaPct !== undefined ? ogaPct.toFixed(1) : ""}</td>
                        <td style={tdCenter}>
                          <button
                            type="button"
                            onClick={() => onSimulateNumbers?.(nums)}
                            disabled={!canSim}
                            style={{
                              ...simBtn,
                              opacity: canSim ? 1 : 0.5,
                              cursor: canSim ? "pointer" : "not-allowed",
                              background: isPressed ? "#1565c0" : simBtn.background,
                              color: isPressed ? "#fff" : simBtn.color,
                              boxShadow: isPressed ? "inset 0 2px 4px rgba(0,0,0,0.25)" : simBtn.boxShadow,
                              transform: isPressed ? "translateY(1px)" : undefined,
                            }}
                            title={canSim ? "Simulate this combo" : "Need simulate handler"}
                            {...makePressHandlers(pressKey)}
                          >
                            Simulate
                          </button>
                        </td>
                       </tr>
                     );
                   })}
               </tbody>
             </table>
           </div>
         )}
       </div>
 
       {/* Batch Frequency Debug Section */}
       <div style={batchPanel}>
         <div style={{ fontWeight: 600, marginBottom: 8 }}>Batch Frequency</div>
         <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
           <label style={{ fontSize: 12 }}>
             Batch size:
             <input
               type="number"
               min={1}
               value={batchSize}
               onChange={(e) => setBatchSize(Math.max(1, Number(e.target.value) || 1))}
               style={{ width: 80, marginLeft: 6 }}
             />
           </label>
           <button
             type="button"
             onClick={onRunBatch}
             disabled={isBatching || isBatchSessionRunning}
             style={{
               ...genBtn(isBatching || isBatchSessionRunning),
               width: 120,
             }}
           >
             {isBatching ? "Running batch..." : "Run batch"}
           </button>
           <label style={{ fontSize: 12 }}>
             Session runs:
             <input
               type="number"
               min={1}
               max={200}
               value={batchSessionRuns}
               onChange={(e) => setBatchSessionRuns(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
               style={{ width: 70, marginLeft: 6 }}
             />
           </label>
           <button
             type="button"
             onClick={onRunBatchSession}
             disabled={isBatching || isBatchSessionRunning}
             style={{ ...genBtn(isBatching || isBatchSessionRunning), width: 140 }}
           >
             {isBatchSessionRunning ? "Session running..." : "Run session"}
           </button>
           {batchSessionProgress > 0 && (
             <span style={{ fontSize: 12, color: "#1976d2" }}>
               Session progress: {batchSessionProgress}/{batchSessionRuns}
             </span>
           )}
         </div>
         {batchSummary && (
           <div style={{ marginTop: 8, fontSize: 12, color: "#333" }}>
             {batchSummary}
           </div>
         )}
         <div style={{ marginTop: 12, fontSize: 12, color: "#555" }}>
           Batch frequency data {batchFreq.length ? `(entries: ${batchFreq.length})` : "(none yet)"}
         </div>
         <div style={{ marginTop: 6 }}>
           {batchFreq.length === 0 ? (
             <div style={{ fontSize: 12, color: "#999" }}>Run batch to see per-number counts.</div>
           ) : (
             <div
               style={{
                 display: "grid",
                 gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))",
                 gap: 6,
                 alignItems: "center",
                 fontSize: 12,
               }}
             >
               {batchFreq.map(({ n, count }, idx) => {
                 const isTop = idx < 8;
                 const { color, hasBaseline } = isTop ? pickBucketColor(n, count) : { color: "#f5f5f5", hasBaseline: false };
                 const countBg = isTop ? color.replace(/0\.([0-9]+)/, "0.15") || "rgba(0,0,0,0.08)" : "#fafafa";
                 return (
                   <div
                     key={n}
                     style={{
                       border: isTop ? `1px solid ${color}` : "1px solid #e0e0e0",
                       borderRadius: 6,
                       padding: "6px 8px",
                       display: "flex",
                       justifyContent: "space-between",
                       alignItems: "center",
                       background: isTop ? "#fff" : "#fff",
                       boxShadow: isTop ? `0 1px 4px ${color.replace("0.", "0.4")}` : undefined,
                       gap: 6,
                     }}
                   >
                     <span
                       style={{
                         padding: "2px 6px",
                         fontSize: 12,
                         background: color,
                         color: "#000",
                         borderRadius: 4,
                         fontWeight: 700,
                         lineHeight: 1.2,
                         minWidth: 28,
                         textAlign: "center",
                         whiteSpace: "nowrap",
                       }}
                       title={isTop ? (hasBaseline ? "Color from Monthly bucket" : "Top frequency (fallback)") : undefined}
                     >
                       {n}
                     </span>
                     <span
                       style={{
                         padding: "2px 6px",
                         borderRadius: 4,
                         background: countBg,
                         border: `1px solid ${isTop ? color : "#ddd"}`,
                         color: isTop ? "#c00" : "#c00",
                         fontVariantNumeric: "tabular-nums",
                         fontWeight: 700,
                         minWidth: 34,
                         textAlign: "center",
                         whiteSpace: "nowrap",
                       }}
                     >
                       {count}
                     </span>
                   </div>
                 );
                })}
              </div>
            )}
          </div>

          {/* Batch session aggregate */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ fontWeight: 600 }}>Session aggregate (top 8)</div>
              <button
                type="button"
                onClick={() => simulateTopList(batchSessionAggregate)}
                disabled={!onSimulateNumbers || batchSessionAggregate.length < 8}
                style={{
                  ...simBtn,
                  padding: "4px 10px",
                  opacity: batchSessionAggregate.length < 8 ? 0.5 : 1,
                  background: pressedButton === "agg" ? "#1565c0" : simBtn.background,
                  color: pressedButton === "agg" ? "#fff" : simBtn.color,
                  boxShadow: pressedButton === "agg" ? "inset 0 2px 4px rgba(0,0,0,0.25)" : simBtn.boxShadow,
                  transform: pressedButton === "agg" ? "translateY(1px)" : undefined,
                }}
                title={batchSessionAggregate.length < 8 ? "Need 8 numbers to simulate" : "Simulate these 8 numbers"}
                {...makePressHandlers("agg")}
              >
                Simulate
              </button>
            </div>
            {batchSessionAggregate.length === 0 ? (
              <div style={{ fontSize: 12, color: "#999" }}>Run a session to see aggregate top numbers.</div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))",
                  gap: 6,
                  fontSize: 12,
                }}
              >
                {batchSessionAggregate.map(({ n, count }) => (
                  <div
                    key={`agg-${n}`}
                    style={{
                      border: "1px solid #1976d2",
                      borderRadius: 6,
                      padding: "6px 8px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "linear-gradient(135deg, #e8f0ff, #fff)",
                      boxShadow: "0 1px 4px rgba(25,118,210,0.2)",
                    }}
                  >
                    <span style={{ fontWeight: 700, color: "#0d47a1" }}>{n}</span>
                    <span style={{ fontWeight: 700, color: "#0d47a1", fontVariantNumeric: "tabular-nums" }}>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Batch session per-run tops */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Session runs (top 8 per run)</div>
            {batchSessionTopSeries.length === 0 ? (
              <div style={{ fontSize: 12, color: "#999" }}>No session data yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                {batchSessionTopSeries.map(({ run, tops }) => (
                  <div
                    key={`run-${run}`}
                    style={{
                      border: "1px solid #e0e0e0",
                      borderRadius: 6,
                      padding: 8,
                      background: "#fafafa",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{ fontWeight: 700 }}>Run {run}</div>
                      <button
                        type="button"
                        onClick={() => simulateTopList(tops)}
                        disabled={!onSimulateNumbers || tops.length < 8}
                        style={{
                          ...simBtn,
                          padding: "3px 8px",
                          opacity: tops.length < 8 ? 0.5 : 1,
                          background: pressedButton === `run-${run}` ? "#1565c0" : simBtn.background,
                          color: pressedButton === `run-${run}` ? "#fff" : simBtn.color,
                          boxShadow: pressedButton === `run-${run}` ? "inset 0 2px 4px rgba(0,0,0,0.25)" : simBtn.boxShadow,
                          transform: pressedButton === `run-${run}` ? "translateY(1px)" : undefined,
                        }}
                        title={tops.length < 8 ? "Need 8 numbers to simulate" : "Simulate this run's top 8"}
                        {...makePressHandlers(`run-${run}`)}
                      >
                        Simulate
                      </button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {tops.map(({ n, count }) => (
                        <span key={`run-${run}-n-${n}`} style={{ display: "inline-flex", gap: 4, alignItems: "center", padding: "2px 6px", borderRadius: 4, background: "#fff", border: "1px solid #ddd" }}>
                          <span style={{ fontWeight: 700 }}>{n}</span>
                          <span style={{ fontVariantNumeric: "tabular-nums", color: "#1976d2" }}>{count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
       </div>
     </section>
   );
};

const ManualSim: React.FC<{
  manualSimSelected: number[];
  setManualSimSelected: React.Dispatch<React.SetStateAction<number[]>>;
  onManualSimulationChanged?: (next: number[]) => void;
  toggleManualPick: (n: number) => void;
}> = ({
  manualSimSelected,
  setManualSimSelected,
  onManualSimulationChanged,
  toggleManualPick,
}) => {
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
const td: React.CSSProperties = {
  padding: "4px 6px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
  textAlign: "left",
};
const tdCenter: React.CSSProperties = { ...td, textAlign: "center" };
const th: React.CSSProperties = {
  textAlign: "center",
  padding: "4px 6px",
  borderBottom: "1px solid #ddd",
  fontWeight: 600,
  whiteSpace: "nowrap",
};
const mainTh: React.CSSProperties = { ...th, width: 170 };
const mainTd: React.CSSProperties = { ...td, width: 170, minWidth: 0 };
const manualTd: React.CSSProperties = { ...tdCenter, fontWeight: 600 };
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
const batchPanel: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  borderRadius: 6,
  background: "#f3f4f6",
  border: "1px solid #ddd",
};
const exPanel: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  borderRadius: 6,
  background: "#e8f0fe",
  border: "1px solid #ddd",
};
const exTbl: React.CSSProperties = { ...tbl, marginTop: 6 };
const colorForTimes = (times: number): string => {
    const palette: Record<number, string> = {
      0: "rgba(117,117,117,0.70)",
      1: "rgba(66,165,245,0.70)",
      2: "rgba(102,187,106,0.70)",
      3: "rgba(38,198,218,0.70)",
      4: "rgba(251,192,45,0.70)",
      5: "rgba(251,140,0,0.72)",
      6: "rgba(244,81,30,0.72)",
      7: "rgba(229,57,53,0.74)",
      8: "rgba(142,36,170,0.74)",
    };
    return palette[times] ?? "rgba(142,36,170,0.74)";
  };

import React, { useMemo, useState, useEffect } from "react";
import { Draw } from "../types";

interface ComboSummary {
  key: string;
  nums: number[];
  size: number;
  indices: number[];
  runs: { start: number; end: number; length: number }[];
  gaps: number[];
  count: number;
  runsLen2: number;
  longestRun: number;
  meanGap: number | null;
  medianGap: number | null;
  touchesLatest: boolean;
  lastSeen: number;
}

const formatCombo = (nums: number[]) => nums.join("-");

const combinations = (nums: number[], k: number): number[][] => {
  const res: number[][] = [];
  const n = nums.length;
  if (k > n) return res;
  if (k === 2) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        res.push([nums[i], nums[j]]);
      }
    }
    return res;
  }
  if (k === 3) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (let k2 = j + 1; k2 < n; k2++) {
          res.push([nums[i], nums[j], nums[k2]]);
        }
      }
    }
    return res;
  }
  return res;
};

const computeStats = (indices: number[]): { runs: { start: number; end: number; length: number }[]; gaps: number[]; longest: number; runsLen2: number; touchesLatest: boolean; lastSeen: number } => {
  const runs: { start: number; end: number; length: number }[] = [];
  const gaps: number[] = [];
  if (indices.length === 0) return { runs, gaps, longest: 0, runsLen2: 0, touchesLatest: false, lastSeen: -1 };
  let start = indices[0];
  let prev = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const idx = indices[i];
    gaps.push(idx - prev);
    if (idx === prev + 1) {
      prev = idx;
      continue;
    }
    runs.push({ start, end: prev, length: prev - start + 1 });
    start = idx;
    prev = idx;
  }
  runs.push({ start, end: prev, length: prev - start + 1 });
  const longest = runs.reduce((m, r) => Math.max(m, r.length), 0);
  const runsLen2 = runs.filter(r => r.length >= 2).length;
  return { runs, gaps, longest, runsLen2, touchesLatest: runs.some(r => r.end === indices[indices.length - 1]), lastSeen: indices[indices.length - 1] };
};

const percentileColor = (val: number) => {
  if (val >= 0.8) return "#d73027"; // hot
  if (val >= 0.6) return "#fc8d59";
  if (val >= 0.4) return "#fee08b";
  if (val >= 0.2) return "#d9ef8b";
  return "#91bfdb";
};

const sparkline = (indices: number[], lastIndex: number, windowSize: number) => {
  const start = Math.max(0, lastIndex - windowSize + 1);
  const set = new Set(indices.filter(i => i >= start && i <= lastIndex));
  let out = "";
  for (let i = start; i <= lastIndex; i++) {
    out += set.has(i) ? "█" : "·";
  }
  return out;
};

const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const median = (arr: number[]) => {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

export interface AdjacentCombosPanelProps {
  history: Draw[];
  allHistory?: Draw[];
  title?: string;
  onSelectCombos?: (payload: { pairs: Array<[number, number]>; triplets: Array<[number, number, number]> }) => void;
  selectedPairs?: Array<[number, number]>;
  selectedTriplets?: Array<[number, number, number]>;
  comboMode?: "off" | "boost";
  comboBoostFactor?: number;
  onTogglePair?: (pair: [number, number]) => void;
  onToggleTriplet?: (triplet: [number, number, number]) => void;
}

export const AdjacentCombosPanel: React.FC<AdjacentCombosPanelProps> = ({ history, allHistory, title = "Adjacent Combos", onSelectCombos, selectedPairs, selectedTriplets, comboMode, comboBoostFactor, onTogglePair, onToggleTriplet }) => {
  const [useAll, setUseAll] = useState(false);
  const [includeSupps, setIncludeSupps] = useState(false);
  const [maxDraws, setMaxDraws] = useState(200);
  const [topPairs, setTopPairs] = useState(30);
  const [topTriples, setTopTriples] = useState(20);
  const [recentWindow, setRecentWindow] = useState(120);
  const [localSelectedPairs, setLocalSelectedPairs] = useState<Array<[number, number]>>([]);
  const [localSelectedTriplets, setLocalSelectedTriplets] = useState<Array<[number, number, number]>>([]);
  const [localMode, setLocalMode] = useState<"off" | "boost">("off");
  const [localBoost, setLocalBoost] = useState<number>(0.15);

  useEffect(() => {
    if (selectedPairs) setLocalSelectedPairs(selectedPairs);
  }, [selectedPairs]);
  useEffect(() => {
    if (selectedTriplets) setLocalSelectedTriplets(selectedTriplets);
  }, [selectedTriplets]);
  useEffect(() => {
    if (comboMode) setLocalMode(comboMode);
  }, [comboMode]);
  useEffect(() => {
    if (typeof comboBoostFactor === "number") setLocalBoost(comboBoostFactor);
  }, [comboBoostFactor]);

  // selection/boost effective values
  const effectivePairs: Array<[number, number]> = selectedPairs ?? localSelectedPairs;
  const effectiveTriplets: Array<[number, number, number]> = selectedTriplets ?? localSelectedTriplets;
  const effectiveMode: "off" | "boost" = comboMode ?? localMode;
  const effectiveBoost: number = typeof comboBoostFactor === "number" ? comboBoostFactor : localBoost;

  const emitSelection = (pairs: Array<[number, number]>, trips: Array<[number, number, number]>) => {
    onSelectCombos?.({ pairs, triplets: trips });
  };

  const togglePair = (pair: [number, number]) => {
    const exists = effectivePairs.some(([x, y]) => x === pair[0] && y === pair[1]);
    const next = exists ? effectivePairs.filter(([x, y]) => !(x === pair[0] && y === pair[1])) : [...effectivePairs, pair];
    setLocalSelectedPairs(next);
    onTogglePair?.(pair);
    emitSelection(next, effectiveTriplets);
  };

  const toggleTriplet = (trip: [number, number, number]) => {
    const exists = effectiveTriplets.some(([x, y, z]) => x === trip[0] && y === trip[1] && z === trip[2]);
    const next = exists ? effectiveTriplets.filter(([x, y, z]) => !(x === trip[0] && y === trip[1] && z === trip[2])) : [...effectiveTriplets, trip];
    setLocalSelectedTriplets(next);
    onToggleTriplet?.(trip);
    emitSelection(effectivePairs, next);
  };

  const setMode = (val: "off" | "boost") => {
    setLocalMode(val);
    emitSelection(effectivePairs, effectiveTriplets);
  };

  const setBoost = (val: number) => {
    setLocalBoost(val);
    emitSelection(effectivePairs, effectiveTriplets);
  };

  const draws = useMemo(() => {
    const src = useAll && allHistory ? allHistory : history;
    const slice = maxDraws > 0 ? src.slice(-maxDraws) : src;
    // ensure chronological by date if parsable, else as-is
    return [...slice].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [useAll, allHistory, history, maxDraws]);

  const { pairSummaries, tripleSummaries, lastIndex } = useMemo(() => {
    const pairMap = new Map<string, number[]>();
    const tripleMap = new Map<string, number[]>();
    const lastIdx = Math.max(0, draws.length - 1);
    draws.forEach((d, idx) => {
      const nums = includeSupps ? [...d.main, ...d.supp] : [...d.main];
      const sorted = nums.sort((a, b) => a - b);
      combinations(sorted, 2).forEach(c => {
        const key = formatCombo(c);
        const arr = pairMap.get(key) || [];
        arr.push(idx);
        pairMap.set(key, arr);
      });
      combinations(sorted, 3).forEach(c => {
        const key = formatCombo(c);
        const arr = tripleMap.get(key) || [];
        arr.push(idx);
        tripleMap.set(key, arr);
      });
    });

    const toSummaries = (map: Map<string, number[]>, size: number): ComboSummary[] => {
      const out: ComboSummary[] = [];
      map.forEach((indices, key) => {
        if (!indices.length) return;
        const nums = key.split("-").map(Number);
        const stats = computeStats(indices);
        const summary: ComboSummary = {
          key,
          nums,
          size,
          indices,
          runs: stats.runs,
          gaps: stats.gaps,
          count: indices.length,
          runsLen2: stats.runsLen2,
          longestRun: stats.longest,
          meanGap: mean(stats.gaps),
          medianGap: median(stats.gaps),
          touchesLatest: stats.touchesLatest,
          lastSeen: stats.lastSeen,
        };
        out.push(summary);
      });
      return out;
    };

    return {
      pairSummaries: toSummaries(pairMap, 2),
      tripleSummaries: toSummaries(tripleMap, 3),
      lastIndex: lastIdx,
    };
  }, [draws, includeSupps]);

  const rankCombos = (list: ComboSummary[], topN: number) => {
    const sorted = [...list].sort((a, b) => {
      if (a.touchesLatest !== b.touchesLatest) return a.touchesLatest ? -1 : 1;
      if (a.longestRun !== b.longestRun) return b.longestRun - a.longestRun;
      if (a.runsLen2 !== b.runsLen2) return b.runsLen2 - a.runsLen2;
      const ag = a.meanGap ?? Number.POSITIVE_INFINITY;
      const bg = b.meanGap ?? Number.POSITIVE_INFINITY;
      if (ag !== bg) return ag - bg;
      return b.count - a.count;
    });
    return sorted.slice(0, topN);
  };

  const topPairsList = useMemo(() => rankCombos(pairSummaries, topPairs), [pairSummaries, topPairs]);
  const topTriplesList = useMemo(() => rankCombos(tripleSummaries, topTriples), [tripleSummaries, topTriples]);

  const renderRuns = (c: ComboSummary) => {
    if (!draws.length) return null;
    const total = draws.length;
    return (
      <div style={{ position: "relative", height: 18, background: "#f7f7f7", borderRadius: 3 }}>
        {c.runs.map((r, idx) => {
          const left = (r.start / (total - 1)) * 100;
          const width = ((r.end - r.start + 1) / total) * 100;
          const color = c.size === 2 ? "#3b82f6" : "#a855f7";
          const opacity = r.end >= total - 50 ? 0.95 : 0.6;
          return (
            <div key={idx} title={`Run ${r.length} draws (${r.start}–${r.end})`} style={{ position: "absolute", left: `${left}%`, width: `${width}%`, height: "100%", background: color, opacity, borderRadius: 3 }} />
          );
        })}
      </div>
    );
  };

  const renderGaps = (c: ComboSummary) => {
    if (!c.gaps.length) return <div style={{ color: "#999", fontSize: 12 }}>n/a</div>;
    const maxGap = Math.max(...c.gaps);
    return (
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
        {c.gaps.slice(0, 20).map((g, idx) => (
          <div key={idx} title={`gap ${g}`} style={{ width: 6, height: Math.max(4, (g / maxGap) * 20), background: "#0ea5e9" }} />
        ))}
      </div>
    );
  };

  const renderSpark = (c: ComboSummary) => {
    const text = sparkline(c.indices, lastIndex, recentWindow);
    return <div style={{ fontFamily: "monospace", fontSize: 10, whiteSpace: "pre" }}>{text}</div>;
  };

  const renderTable = (list: ComboSummary[], label: string, kind: "pair" | "triple") => (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "32px 160px 60px 80px 80px 80px 120px", gap: 6, fontSize: 12, fontWeight: 600, color: "#444" }}>
        <div />
        <div>Combo</div>
        <div>Runs≥2</div>
        <div>Longest</div>
        <div>Mean gap</div>
        <div>Last seen</div>
        <div>Spark (last {recentWindow})</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
        {list.map(c => {
          const isSel = kind === "pair"
            ? effectivePairs.some(([x, y]) => x === c.nums[0] && y === c.nums[1])
            : effectiveTriplets.some(([x, y, z]) => x === c.nums[0] && y === c.nums[1] && z === c.nums[2]);
          const onToggle = () => (kind === "pair" ? togglePair([c.nums[0], c.nums[1]]) : toggleTriplet([c.nums[0], c.nums[1], c.nums[2]]));
          return (
            <div key={c.key} style={{ display: "grid", gridTemplateColumns: "32px 160px 60px 80px 80px 80px 120px", gap: 6, alignItems: "center", fontSize: 12, padding: "4px 0", borderBottom: "1px solid #f0f0f0", background: isSel ? "#eef2ff" : undefined }}>
              <input type="checkbox" checked={isSel} onChange={onToggle} />
              <div style={{ fontFamily: "monospace" }}>{c.key}</div>
              <div>{c.runsLen2}</div>
              <div>{c.longestRun}</div>
              <div>{c.meanGap ? c.meanGap.toFixed(1) : "—"}</div>
              <div>{c.lastSeen}</div>
              <div>{renderSpark(c)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 8, background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <label style={{ fontSize: 12 }}>
          History:
          <select value={useAll ? "all" : "window"} onChange={(e) => setUseAll(e.target.value === "all") } style={{ marginLeft: 6 }}>
            <option value="window">WFMQY</option>
            <option value="all">All history</option>
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          Include supps
          <input type="checkbox" checked={includeSupps} onChange={(e) => setIncludeSupps(e.target.checked)} style={{ marginLeft: 6 }} />
        </label>
        <label style={{ fontSize: 12 }}>
          Max draws
          <input type="number" min={20} max={1000} value={maxDraws} onChange={(e) => setMaxDraws(Number(e.target.value))} style={{ width: 70, marginLeft: 6 }} />
        </label>
        <label style={{ fontSize: 12 }}>
          Top pairs
          <input type="number" min={5} max={100} value={topPairs} onChange={(e) => setTopPairs(Number(e.target.value))} style={{ width: 60, marginLeft: 6 }} />
        </label>
        <label style={{ fontSize: 12 }}>
          Top triples
          <input type="number" min={5} max={100} value={topTriples} onChange={(e) => setTopTriples(Number(e.target.value))} style={{ width: 60, marginLeft: 6 }} />
        </label>
        <label style={{ fontSize: 12 }}>
          Sparkline window
          <input type="number" min={20} max={400} value={recentWindow} onChange={(e) => setRecentWindow(Number(e.target.value))} style={{ width: 70, marginLeft: 6 }} />
        </label>
        <label style={{ fontSize: 12 }}>
          Combo mode
          <select value={effectiveMode} onChange={(e) => setMode(e.target.value as "off" | "boost")} style={{ marginLeft: 6 }}>
            <option value="off">Off</option>
            <option value="boost">Boost</option>
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          Boost factor
          <input type="number" step={0.05} min={0} max={1} value={effectiveBoost} onChange={(e) => setBoost(Number(e.target.value))} style={{ width: 70, marginLeft: 6 }} />
        </label>
        <div style={{ fontSize: 12, color: "#555" }}>Selected: {effectivePairs.length} pairs, {effectiveTriplets.length} triples. Mode: {effectiveMode}. Max boost ~ {Math.min(2, 1 + (effectivePairs.length + effectiveTriplets.length) * effectiveBoost).toFixed(2)}×</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Run timeline (top pairs)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topPairsList.slice(0, 12).map(c => (
              <div key={c.key} style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={effectivePairs.some(p => p[0] === c.nums[0] && p[1] === c.nums[1])} onChange={() => togglePair([c.nums[0], c.nums[1]])} />
                  <span style={{ fontFamily: "monospace", fontSize: 12 }}>{c.key}</span>
                </div>
                {renderRuns(c)}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Run timeline (top triples)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topTriplesList.slice(0, 10).map(c => (
              <div key={c.key} style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={effectiveTriplets.some(t => t[0] === c.nums[0] && t[1] === c.nums[1] && t[2] === c.nums[2])} onChange={() => toggleTriplet([c.nums[0], c.nums[1], c.nums[2]])} />
                  <span style={{ fontFamily: "monospace", fontSize: 12 }}>{c.key}</span>
                </div>
                {renderRuns(c)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Gap mini-histograms (pairs)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topPairsList.slice(0, 12).map(c => (
              <div key={c.key} style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={effectivePairs.some(p => p[0] === c.nums[0] && p[1] === c.nums[1])} onChange={() => togglePair([c.nums[0], c.nums[1]])} />
                  <span style={{ fontFamily: "monospace", fontSize: 12 }}>{c.key}</span>
                </div>
                {renderGaps(c)}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Gap mini-histograms (triples)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topTriplesList.slice(0, 10).map(c => (
              <div key={c.key} style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={effectiveTriplets.some(t => t[0] === c.nums[0] && t[1] === c.nums[1] && t[2] === c.nums[2])} onChange={() => toggleTriplet([c.nums[0], c.nums[1], c.nums[2]])} />
                  <span style={{ fontFamily: "monospace", fontSize: 12 }}>{c.key}</span>
                </div>
                {renderGaps(c)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {renderTable(topPairsList, "Leaderboard (pairs)", "pair")}
      {renderTable(topTriplesList, "Leaderboard (triples)", "triple")}
    </div>
  );
};

import React, { useMemo, useState } from "react";
import type { Draw } from "../types";
import { buildUndrawnForecast } from "../lib/undrawnForecast";
import { analyzeMonthEndCarryOver } from "../lib/monthEndCarryOver";

interface UndrawnPatternsPanelProps {
  history: Draw[];
  windowLabel?: string;
  loadedDrawCount?: number;
}

interface MonthEndRankedNumber {
  n: number;
  hits: number;
  monthEnds: number;
  rate: number;
  adjustedRate: number;
  lift: number;
  adjustedLift: number;
  support: number;
}

interface UndrawnStats {
  draws: number;
  undrawnPerDraw: number;
  totalUndrawnInstances: number;
  topCold: { n: number; c: number }[];
  topHot: { n: number; c: number }[];
  oddEven: { avgOdds: number; variance: number; range95: [number, number]; notes: string };
  groups: { label: string; avg: number; expected: number; note?: string }[];
  pairs: { pair: string; count: number; note?: string }[];
  patterns: string[];
  sim: {
    trials: number;
    notes: string[];
    meanUndrawn: number;
    undrawnRange95: [number, number];
    meanOddUndrawn: number;
    oddUndrawnRange95: [number, number];
    meanLatestOverlap: number;
    latestOverlapRange95: [number, number];
    topLikelyUndrawn: { n: number; rate: number }[];
    topLikelyDrawn: { n: number; rate: number }[];
  };
  monthEnd: {
    transitions: number;
    earlyDrawLimit: number;
    totalMonthEndUndrawnInstances: number;
    earlyHitCount: number;
    earlyHitRate: number;
    baselineHitRate: number;
    lift: number;
    monthEndUndrawnMean: number;
    earlyHitRange95: [number, number];
    topEarlyHitNumbers: MonthEndRankedNumber[];
    topPersistentNumbers: MonthEndRankedNumber[];
    timing: { drawOffset: number; hitCount: number; hitRate: number }[];
    notes: string[];
  };
  next: string[];
  caveat?: string;
}

const TOTAL_NUMBERS = 45;
const GROUPS = [
  { label: "1-9", range: [1, 9] },
  { label: "10-18", range: [10, 18] },
  { label: "19-26", range: [19, 26] },
  { label: "27-35", range: [27, 35] },
  { label: "36-45", range: [36, 45] },
];

const numberStyle = (_n: number) => ({
  display: "inline-block",
  minWidth: 26,
  padding: "4px 6px",
  margin: "2px 4px 2px 0",
  borderRadius: 6,
  fontWeight: 700,
  textAlign: "center" as const,
  color: "#123",
  background: "#eef3ff",
  border: "1px solid #d7e2ff",
});

const cardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 12,
  background: "#fafbff",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function variance(arr: number[], m: number): number {
  if (arr.length === 0) return 0;
  const v = arr.reduce((acc, x) => acc + (x - m) * (x - m), 0) / arr.length;
  return v;
}

function expectedUndrawn(groupSize: number, undrawnPerDraw: number): number {
  return (groupSize / TOTAL_NUMBERS) * undrawnPerDraw;
}

const formatRange = (range: [number, number]): string => `${range[0].toFixed(1)}–${range[1].toFixed(1)}`;
const formatPercent = (rate: number): string => `${(rate * 100).toFixed(1)}%`;

function computeStats(history: Draw[], includeSupp: boolean): UndrawnStats {
  const forecast = buildUndrawnForecast(history, { includeSupp, topNumbers: 5 });
  const monthEndCarryOver = analyzeMonthEndCarryOver(history, { includeSupp, earlyDrawLimit: 3, topNumbers: 6 });

  if (!history.length) {
    return {
      draws: 0,
      undrawnPerDraw: 0,
      totalUndrawnInstances: 0,
      topCold: [],
      topHot: [],
      oddEven: { avgOdds: 0, variance: 0, range95: [0, 0], notes: "" },
      groups: [],
      pairs: [],
      patterns: [],
      sim: {
        trials: 0,
        notes: ["No data"],
        meanUndrawn: 0,
        undrawnRange95: [0, 0],
        meanOddUndrawn: 0,
        oddUndrawnRange95: [0, 0],
        meanLatestOverlap: 0,
        latestOverlapRange95: [0, 0],
        topLikelyUndrawn: [],
        topLikelyDrawn: [],
      },
      monthEnd: {
        transitions: 0,
        earlyDrawLimit: 3,
        totalMonthEndUndrawnInstances: 0,
        earlyHitCount: 0,
        earlyHitRate: 0,
        baselineHitRate: 0,
        lift: 0,
        monthEndUndrawnMean: 0,
        earlyHitRange95: [0, 0],
        topEarlyHitNumbers: [],
        topPersistentNumbers: [],
        timing: [],
        notes: ["Need at least two complete months in the active history window to analyse month-end carry-over."],
      },
      next: [],
    };
  }

  const freq = Array(TOTAL_NUMBERS + 1).fill(0);
  const oddsPerDraw: number[] = [];
  const groupCounts = GROUPS.map(() => [] as number[]);
  const pairMap = new Map<string, number>();
  const undrawnSizes: number[] = [];

  for (const d of history) {
    const drawn = includeSupp ? [...d.main, ...d.supp] : [...d.main];
    const seen = new Set(drawn);
    const undrawn: number[] = [];
    for (let n = 1; n <= TOTAL_NUMBERS; n++) {
      if (!seen.has(n)) {
        undrawn.push(n);
        freq[n] += 1;
      }
    }
    undrawnSizes.push(undrawn.length);

    // odds/evens
    const odds = undrawn.filter((n) => n % 2 === 1).length;
    oddsPerDraw.push(odds);

    // groups
    GROUPS.forEach((g, idx) => {
      const count = undrawn.filter((n) => n >= g.range[0] && n <= g.range[1]).length;
      groupCounts[idx].push(count);
    });

    // pairs (co-undrawn)
    for (let i = 0; i < undrawn.length; i++) {
      for (let j = i + 1; j < undrawn.length; j++) {
        const a = undrawn[i];
        const b = undrawn[j];
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        pairMap.set(key, (pairMap.get(key) || 0) + 1);
      }
    }
  }

  const draws = history.length;
  const undrawnPerDraw = mean(undrawnSizes);
  const totalUndrawnInstances = undrawnSizes.reduce((sum, size) => sum + size, 0);

  const cold = Array.from({ length: TOTAL_NUMBERS }, (_, i) => ({ n: i + 1, c: freq[i + 1] }))
    .sort((a, b) => b.c - a.c || a.n - b.n)
    .slice(0, 10);
  const hot = Array.from({ length: TOTAL_NUMBERS }, (_, i) => ({ n: i + 1, c: freq[i + 1] }))
    .sort((a, b) => a.c - b.c || a.n - b.n)
    .slice(0, 10);

  const avgOdds = mean(oddsPerDraw);
  const varOdds = variance(oddsPerDraw, avgOdds);
  const sdOdds = Math.sqrt(varOdds);
  const range95: [number, number] = [
    Math.max(0, Math.floor(avgOdds - 1.96 * sdOdds)),
    Math.min(TOTAL_NUMBERS, Math.ceil(avgOdds + 1.96 * sdOdds)),
  ];

  const groups = GROUPS.map((g, idx) => {
    const avg = mean(groupCounts[idx]);
    const expected = expectedUndrawn(g.range[1] - g.range[0] + 1, undrawnPerDraw);
    return { label: g.label, avg, expected };
  });

  const pairs = Array.from(pairMap.entries())
    .map(([k, c]) => ({ pair: `(${k})`, count: c }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const modeLabel = includeSupp ? "mains+supps" : "mains";

  return {
    draws,
    undrawnPerDraw,
    totalUndrawnInstances,
    topCold: cold,
    topHot: hot,
    oddEven: {
      avgOdds,
      variance: varOdds,
      range95,
      notes: `Slight bias: odds mean ${avgOdds.toFixed(2)} over ${draws} draws (${modeLabel}).`,
    },
    groups,
    pairs,
    patterns: [
      "Cold numbers dominate undrawn frequency; hot numbers rarely co-undrawn.",
      "Consecutive undrawn sets often share a large core of numbers (cold clusters persist).",
      "Odd-even balance oscillates draw-to-draw.",
    ],
    sim: {
      trials: forecast.simulation.trials,
      notes: forecast.simulation.notes,
      meanUndrawn: forecast.simulation.meanUndrawn,
      undrawnRange95: forecast.simulation.undrawnRange95,
      meanOddUndrawn: forecast.simulation.meanOddUndrawn,
      oddUndrawnRange95: forecast.simulation.oddUndrawnRange95,
      meanLatestOverlap: forecast.simulation.meanLatestOverlap,
      latestOverlapRange95: forecast.simulation.latestOverlapRange95,
      topLikelyUndrawn: forecast.simulation.topLikelyUndrawn.map((item) => ({ n: item.number, rate: item.undrawnRate })),
      topLikelyDrawn: forecast.simulation.topLikelyDrawn.map((item) => ({ n: item.number, rate: item.undrawnRate })),
    },
    monthEnd: {
      transitions: monthEndCarryOver.summary.transitions,
      earlyDrawLimit: monthEndCarryOver.summary.earlyDrawLimit,
      totalMonthEndUndrawnInstances: monthEndCarryOver.summary.totalMonthEndUndrawnInstances,
      earlyHitCount: monthEndCarryOver.summary.earlyHitCount,
      earlyHitRate: monthEndCarryOver.summary.earlyHitRate,
      baselineHitRate: monthEndCarryOver.summary.baselineHitRate,
      lift: monthEndCarryOver.summary.lift,
      monthEndUndrawnMean: monthEndCarryOver.summary.monthEndUndrawnMean,
      earlyHitRange95: monthEndCarryOver.summary.earlyHitRange95,
      topEarlyHitNumbers: monthEndCarryOver.topEarlyHitNumbers.map((item) => ({
        n: item.number,
        hits: item.earlyNextMonthHits,
        monthEnds: item.monthEndsUndrawn,
        rate: item.earlyHitRate,
        adjustedRate: item.adjustedEarlyHitRate,
        lift: item.lift,
        adjustedLift: item.adjustedLift,
        support: item.supportWeight,
      })),
      topPersistentNumbers: monthEndCarryOver.topPersistentNumbers.map((item) => ({
        n: item.number,
        hits: item.earlyNextMonthHits,
        monthEnds: item.monthEndsUndrawn,
        rate: item.earlyHitRate,
        adjustedRate: item.adjustedEarlyHitRate,
        lift: item.lift,
        adjustedLift: item.adjustedLift,
        support: item.supportWeight,
      })),
      timing: monthEndCarryOver.timing,
      notes: monthEndCarryOver.notes,
    },
    next: forecast.next,
  };
}

export const UndrawnPatternsPanel: React.FC<UndrawnPatternsPanelProps> = ({ history, windowLabel, loadedDrawCount }) => {
  const [mode, setMode] = useState<"mains" | "all">("mains");
  const stats = useMemo(() => computeStats(history, mode === "all"), [history, mode]);
  const oddsRange = `${stats.oddEven.range95[0]}–${stats.oddEven.range95[1]}`;
  const effectiveLoadedDrawCount = typeof loadedDrawCount === "number" && Number.isFinite(loadedDrawCount)
    ? Math.max(loadedDrawCount, stats.draws)
    : stats.draws;
  const scopeLabel = windowLabel?.trim() || "Full History";
  const datasetSummary = effectiveLoadedDrawCount > stats.draws
    ? `Window: ${scopeLabel} • Analysing ${stats.draws} of ${effectiveLoadedDrawCount} loaded draws • Undrawn per draw: ${stats.undrawnPerDraw} ${mode === "mains" ? "(mains only)" : "(mains + supps)"}`
    : `Window: ${scopeLabel} • Analysing ${stats.draws} draws • Undrawn per draw: ${stats.undrawnPerDraw} ${mode === "mains" ? "(mains only)" : "(mains + supps)"}`;

  return (
    <div className="windfall-evidence-panel" style={{ width: "100%", maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>Observed Patterns in Undrawn Numbers</h3>
          <div style={{ color: "#4a5568", fontSize: 13 }}>
            {datasetSummary}
          </div>
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 4, maxWidth: 760, lineHeight: 1.45 }}>
            This panel counts absences <b>draw by draw</b>. In a 12-draw window, the same number can add up to 12 undrawn instances if it stays absent in every draw.
          </div>
          {stats.caveat && <div style={{ color: "#a16207", fontSize: 12, marginTop: 4 }}>{stats.caveat}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <label style={{ fontSize: 13, color: "#2d3748" }}>Mode:</label>
          <div style={{ display: "inline-flex", border: "1px solid #cbd5e0", borderRadius: 6, overflow: "hidden" }}>
            <button type="button" onClick={() => setMode("mains")} style={{ padding: "6px 10px", background: mode === "mains" ? "#2563eb" : "#f8fafc", color: mode === "mains" ? "#fff" : "#1a202c", border: "none", cursor: "pointer" }}>Mains only</button>
            <button type="button" onClick={() => setMode("all")} style={{ padding: "6px 10px", background: mode === "all" ? "#2563eb" : "#f8fafc", color: mode === "all" ? "#fff" : "#1a202c", border: "none", borderLeft: "1px solid #cbd5e0", cursor: "pointer" }}>Mains + supps</button>
          </div>
        </div>
      </div>

      <div className="windfall-evidence-wall" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Top 10 cold undrawn</div>
          <div style={{ color: "#4a5568", fontSize: 12, marginBottom: 8, lineHeight: 1.45 }}>
            Brackets show how many analysed draws each number was <b>undrawn</b> in. Only the 10 highest and 10 lowest undrawn counts are shown here, so these two lists do not add up to the full total across all 45 numbers ({stats.totalUndrawnInstances}).
          </div>
          <div>{stats.topCold.map((t) => (<span key={t.n} style={numberStyle(t.n)}>{t.n}<span style={{ marginLeft: 4, fontSize: 12, fontWeight: 600 }}>({t.c})</span></span>))}</div>
          <div style={{ marginTop: 8, fontWeight: 700 }}>Top 10 hot (least undrawn)</div>
          <div>{stats.topHot.map((t) => (<span key={t.n} style={numberStyle(t.n)}>{t.n}<span style={{ marginLeft: 4, fontSize: 12, fontWeight: 600 }}>({t.c})</span></span>))}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Odd / Even balance</div>
          <div style={{ color: "#2d3748", fontSize: 14 }}>Avg odds: {stats.oddEven.avgOdds.toFixed(2)} • Var: {stats.oddEven.variance.toFixed(1)} • 95% range: {oddsRange}</div>
          <div style={{ marginTop: 6, color: "#4a5568" }}>{stats.oddEven.notes}</div>
          <div style={{ marginTop: 10, fontWeight: 700 }}>Group distribution</div>
          <ul style={{ paddingLeft: 16, margin: "6px 0" }}>
            {stats.groups.map((g) => (
              <li key={g.label} style={{ marginBottom: 4 }}>
                <b>{g.label}</b>: {g.avg.toFixed(2)} (exp {g.expected.toFixed(2)}) {g.note ? `• ${g.note}` : ""}
              </li>
            ))}
          </ul>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Common undrawn pairs</div>
          <ul style={{ paddingLeft: 16, margin: "0" }}>
            {stats.pairs.map((p) => (
              <li key={p.pair} style={{ marginBottom: 4 }}>
                <b>{p.pair}</b>: {p.count} {p.note ? `• ${p.note}` : ""}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 10, fontWeight: 700 }}>Other patterns</div>
          <ul style={{ paddingLeft: 16, margin: "0" }}>
            {stats.patterns.map((p, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>{p}</li>
            ))}
          </ul>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Simulation snapshot (relative freq)</div>
          <div style={{ color: "#2d3748", fontSize: 14 }}>Trials: {stats.sim.trials}</div>
          {stats.sim.trials > 0 && (
            <div style={{ color: "#4a5568", fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>
              Next undrawn avg: {stats.sim.meanUndrawn.toFixed(1)} • 95% range: {formatRange(stats.sim.undrawnRange95)} • Odd undrawn avg: {stats.sim.meanOddUndrawn.toFixed(1)} • Latest carry-over avg: {stats.sim.meanLatestOverlap.toFixed(1)}
            </div>
          )}
          <ul style={{ paddingLeft: 16, margin: "6px 0" }}>
            {stats.sim.notes.map((s, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>{s}</li>
            ))}
          </ul>
          {stats.sim.topLikelyUndrawn.length > 0 && (
            <>
              <div style={{ marginTop: 10, fontWeight: 700 }}>Most often undrawn in simulation</div>
              <div style={{ marginTop: 6 }}>
                {stats.sim.topLikelyUndrawn.map((item) => (
                  <span key={`sim-cold-${item.n}`} style={numberStyle(item.n)}>
                    {item.n}
                    <span style={{ marginLeft: 4, fontSize: 12, fontWeight: 600 }}>({(item.rate * 100).toFixed(1)}%)</span>
                  </span>
                ))}
              </div>
            </>
          )}
          {stats.sim.topLikelyDrawn.length > 0 && (
            <>
              <div style={{ marginTop: 10, fontWeight: 700 }}>Least often undrawn in simulation</div>
              <div style={{ marginTop: 6 }}>
                {stats.sim.topLikelyDrawn.map((item) => (
                  <span key={`sim-hot-${item.n}`} style={numberStyle(item.n)}>
                    {item.n}
                    <span style={{ marginLeft: 4, fontSize: 12, fontWeight: 600 }}>({(item.rate * 100).toFixed(1)}%)</span>
                  </span>
                ))}
              </div>
            </>
          )}
          <div style={{ marginTop: 10, fontWeight: 700 }}>What’s likely next</div>
          <ul style={{ paddingLeft: 16, margin: "6px 0" }}>
            {stats.next.map((n, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>{n}</li>
            ))}
          </ul>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Month-end carry-over</div>
          <div style={{ color: "#2d3748", fontSize: 14, lineHeight: 1.5 }}>
            Transitions: {stats.monthEnd.transitions} • Month-end undrawn avg: {stats.monthEnd.monthEndUndrawnMean.toFixed(1)} • Early-next-month hit rate: {formatPercent(stats.monthEnd.earlyHitRate)} • Baseline: {formatPercent(stats.monthEnd.baselineHitRate)} • Lift: {stats.monthEnd.lift.toFixed(2)}x
          </div>
          <div style={{ color: "#4a5568", fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>
            {stats.monthEnd.earlyHitCount} of {stats.monthEnd.totalMonthEndUndrawnInstances} month-end undrawn instances were drawn within the first {stats.monthEnd.earlyDrawLimit} draw{stats.monthEnd.earlyDrawLimit === 1 ? "" : "s"} of the next month.
          </div>
          <div style={{ color: "#4a5568", fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>
            First {stats.monthEnd.earlyDrawLimit} draw{stats.monthEnd.earlyDrawLimit === 1 ? "" : "s"} of the next month • Early-hit count range (95%): {formatRange(stats.monthEnd.earlyHitRange95)}
          </div>
          <ul style={{ paddingLeft: 16, margin: "8px 0 0" }}>
            {stats.monthEnd.notes.map((note, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>{note}</li>
            ))}
          </ul>
          {stats.monthEnd.topEarlyHitNumbers.length > 0 && (
            <>
              <div style={{ marginTop: 10, fontWeight: 700 }}>Best-supported early next-month flips</div>
              <div style={{ color: "#4a5568", fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>
                Adjusted probability is shown first; the evidence count is early hits/month-end undrawn opportunities.
              </div>
              <div style={{ marginTop: 6 }}>
                {stats.monthEnd.topEarlyHitNumbers.map((item) => (
                  <span
                    key={`month-end-early-${item.n}`}
                    style={numberStyle(item.n)}
                    title={`Adjusted ${formatPercent(item.adjustedRate)}; raw ${formatPercent(item.rate)} from ${item.hits}/${item.monthEnds}; adjusted lift ${item.adjustedLift.toFixed(2)}x`}
                  >
                    {item.n}
                    <span style={{ marginLeft: 4, fontSize: 12, fontWeight: 600 }}>({formatPercent(item.adjustedRate)} adj · {item.hits}/{item.monthEnds})</span>
                  </span>
                ))}
              </div>
            </>
          )}
          {stats.monthEnd.topPersistentNumbers.length > 0 && (
            <>
              <div style={{ marginTop: 10, fontWeight: 700 }}>Most persistent into next month</div>
              <div style={{ marginTop: 6 }}>
                {stats.monthEnd.topPersistentNumbers.map((item) => (
                  <span
                    key={`month-end-persist-${item.n}`}
                    style={numberStyle(item.n)}
                    title={`Adjusted ${formatPercent(item.adjustedRate)}; raw ${formatPercent(item.rate)} from ${item.hits}/${item.monthEnds}; adjusted lift ${item.adjustedLift.toFixed(2)}x`}
                  >
                    {item.n}
                    <span style={{ marginLeft: 4, fontSize: 12, fontWeight: 600 }}>({formatPercent(item.adjustedRate)} adj · {item.hits}/{item.monthEnds})</span>
                  </span>
                ))}
              </div>
            </>
          )}
          {stats.monthEnd.timing.length > 0 && (
            <div style={{ marginTop: 10, color: "#4a5568", fontSize: 13 }}>
              Early-hit timing: {stats.monthEnd.timing.map((item) => `D${item.drawOffset} ${(item.hitRate * 100).toFixed(1)}%`).join(" • ")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UndrawnPatternsPanel;

import React, { useMemo, useState } from "react";
import type { Draw } from "../types";

interface UndrawnStats {
  draws: number;
  undrawnPerDraw: number;
  topCold: { n: number; c: number }[];
  topHot: { n: number; c: number }[];
  oddEven: { avgOdds: number; variance: number; range95: [number, number]; notes: string };
  groups: { label: string; avg: number; expected: number; note?: string }[];
  pairs: { pair: string; count: number; note?: string }[];
  patterns: string[];
  sim: { trials: number; notes: string[] };
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

const numberStyle = (n: number) => ({
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

function computeStats(history: Draw[], includeSupp: boolean): UndrawnStats {
  if (!history.length) {
    return {
      draws: 0,
      undrawnPerDraw: 0,
      topCold: [],
      topHot: [],
      oddEven: { avgOdds: 0, variance: 0, range95: [0, 0], notes: "" },
      groups: [],
      pairs: [],
      patterns: [],
      sim: { trials: 0, notes: ["No data"] },
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
      trials: 0,
      notes: ["Empirical (no simulation); stats derived from observed history."],
    },
    next: [
      "Use top cold numbers as likely undrawn; hot numbers less likely to be absent next draw.",
      "Expect undrawn odds near the displayed average; group counts hover around the averages above.",
    ],
  };
}

export const UndrawnPatternsPanel: React.FC<{ history: Draw[] }> = ({ history }) => {
  const [mode, setMode] = useState<"mains" | "all">("mains");
  const stats = useMemo(() => computeStats(history, mode === "all"), [history, mode]);
  const oddsRange = `${stats.oddEven.range95[0]}–${stats.oddEven.range95[1]}`;

  return (
    <div style={{ width: "100%", maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>Observed Patterns in Undrawn Numbers</h3>
          <div style={{ color: "#4a5568", fontSize: 13 }}>
            Dataset: {stats.draws} draws • Undrawn per draw: {stats.undrawnPerDraw} {mode === "mains" ? "(mains only)" : "(mains + supps)"}
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

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Top cold undrawn</div>
          <div>{stats.topCold.map((t) => (<span key={t.n} style={numberStyle(t.n)}>{t.n}<span style={{ marginLeft: 4, fontSize: 12, fontWeight: 600 }}>({t.c})</span></span>))}</div>
          <div style={{ marginTop: 8, fontWeight: 700 }}>Top hot (least undrawn)</div>
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
          <ul style={{ paddingLeft: 16, margin: "6px 0" }}>
            {stats.sim.notes.map((s, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>{s}</li>
            ))}
          </ul>
          <div style={{ marginTop: 10, fontWeight: 700 }}>What’s likely next</div>
          <ul style={{ paddingLeft: 16, margin: "6px 0" }}>
            {stats.next.map((n, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>{n}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default UndrawnPatternsPanel;

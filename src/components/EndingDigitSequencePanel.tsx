import React, { useMemo, useState } from "react";

import type { Draw } from "../types";
import {
  analyzeEndingDigitSequences,
  type EndingDigitSequenceDrawStats,
} from "../lib/endingDigitSequences";

interface EndingDigitSequencePanelProps {
  draws: Draw[];
}

type SortMode = "dateDesc" | "coveredDesc" | "runDesc";

const StatChip: React.FC<{
  label: string;
  value: string;
  title?: string;
}> = ({ label, value, title }) => (
  <div
    title={title}
    style={{
      padding: "8px 10px",
      borderRadius: 8,
      border: "1px solid #e5e7eb",
      background: "#fafcff",
      minWidth: 120,
    }}
  >
    <div style={{ fontSize: 10, color: "#78909c", textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
    <div style={{ marginTop: 2, fontSize: 16, fontWeight: 700, color: "#263238", fontVariantNumeric: "tabular-nums" }}>{value}</div>
  </div>
);

const FrequencyBars: React.FC<{
  title: string;
  description: string;
  freq: Record<number, number>;
  tone: "indigo" | "teal";
}> = ({ title, description, freq, tone }) => {
  const entries = Object.entries(freq).map(([key, count]) => ({ key, count }));
  const maxCount = Math.max(...entries.map((entry) => entry.count), 1);
  const barColor = tone === "indigo" ? "linear-gradient(180deg, #c5cae9 0%, #3949ab 100%)" : "linear-gradient(180deg, #b2dfdb 0%, #00796b 100%)";

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#fff" }}>
      <div style={{ fontWeight: 700, color: "#223", fontSize: 14 }}>{title}</div>
      <div style={{ fontSize: 11, color: "#667", marginTop: 3, marginBottom: 10 }}>{description}</div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 12, color: "#999" }}>No draws available.</div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, minHeight: 160, borderBottom: "1px solid #e5e7eb", paddingBottom: 6 }}>
          {entries.map((entry) => (
            <div key={entry.key} style={{ flex: 1, minWidth: 0, textAlign: "center" }} title={`${entry.key}: ${entry.count} draw${entry.count === 1 ? "" : "s"}`}>
              <div style={{ fontSize: 11, color: "#546e7a", marginBottom: 4, fontVariantNumeric: "tabular-nums" }}>{entry.count}</div>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", height: 120 }}>
                <div
                  style={{
                    width: "100%",
                    maxWidth: 48,
                    height: `${Math.max((entry.count / maxCount) * 100, 2)}%`,
                    minHeight: entry.count > 0 ? 6 : 0,
                    borderRadius: "6px 6px 0 0",
                    background: barColor,
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: "#455a64", marginTop: 6, fontWeight: 700 }}>{entry.key}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const formatRuns = (draw: EndingDigitSequenceDrawStats): string => {
  if (!draw.maxRuns.length) return "—";
  return draw.maxRuns.map((run) => `${run.digits.join("-")} (${run.coveredNumbers})`).join(" | ");
};

export const EndingDigitSequencePanel: React.FC<EndingDigitSequencePanelProps> = ({ draws }) => {
  const [includeSupp, setIncludeSupp] = useState<boolean>(true);
  const [sortMode, setSortMode] = useState<SortMode>("dateDesc");

  const summary = useMemo(
    () => analyzeEndingDigitSequences(draws, { includeSupp }),
    [draws, includeSupp],
  );

  const sortedDraws = useMemo(() => {
    const rows = [...summary.perDraw];
    switch (sortMode) {
      case "coveredDesc":
        return rows.sort((a, b) => b.coveredNumbers - a.coveredNumbers || b.maxRunLength - a.maxRunLength || b.date.localeCompare(a.date));
      case "runDesc":
        return rows.sort((a, b) => b.maxRunLength - a.maxRunLength || b.coveredNumbers - a.coveredNumbers || b.date.localeCompare(a.date));
      case "dateDesc":
      default:
        return rows.reverse();
    }
  }, [sortMode, summary.perDraw]);

  const pct = (value: number): string => {
    if (summary.totalDraws === 0) return "0.0%";
    return `${((value / summary.totalDraws) * 100).toFixed(1)}%`;
  };

  return (
    <section style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", padding: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#223" }}>Ending Digit Sequence Analyzer</div>
          <div style={{ fontSize: 12, color: "#667", marginTop: 2 }}>
            Checks whether draws cluster into consecutive ending-digit runs such as 2-3-4-5 or 8-9-0.
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "#444" }} title="Include supplementary numbers in the ending-digit sequence analysis">
            <input
              type="checkbox"
              checked={includeSupp}
              onChange={(e) => setIncludeSupp(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Include supp (main + supp)
          </label>
          <label style={{ fontSize: 12, color: "#444" }}>
            Sort recent draws:
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} style={{ marginLeft: 6, fontSize: 12 }}>
              <option value="dateDesc">Newest first</option>
              <option value="coveredDesc">Covered numbers</option>
              <option value="runDesc">Run length</option>
            </select>
          </label>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <StatChip label="Window" value={`${summary.totalDraws}`} title="Number of draws analyzed in the active window" />
        <StatChip label="Run ≥ 3" value={`${summary.drawsWithMaxRunAtLeast3} · ${pct(summary.drawsWithMaxRunAtLeast3)}`} title="Draws whose longest ending-digit run is at least 3 digits long" />
        <StatChip label="Run ≥ 4" value={`${summary.drawsWithMaxRunAtLeast4} · ${pct(summary.drawsWithMaxRunAtLeast4)}`} title="Draws whose longest ending-digit run is at least 4 digits long" />
        <StatChip label="Covered ≥ 4" value={`${summary.drawsWithCoveredNumbersAtLeast4} · ${pct(summary.drawsWithCoveredNumbersAtLeast4)}`} title="Draws where the strongest ending-digit run covers at least 4 numbers" />
        <StatChip label="Run ≥ 5" value={`${summary.drawsWithMaxRunAtLeast5} · ${pct(summary.drawsWithMaxRunAtLeast5)}`} title="Draws whose longest ending-digit run is at least 5 digits long" />
      </div>

      <div style={{ fontSize: 12, color: "#556", marginBottom: 12, lineHeight: 1.45 }}>
        Ending digits are treated <b>circularly</b>, so <b>8-9-0</b> and <b>9-0-1-2</b> count as consecutive runs. “Covered numbers” means how many numbers in the draw fall inside the strongest consecutive ending-digit run.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 14 }}>
        <FrequencyBars
          title="Longest ending-digit run per draw"
          description="How often a draw’s strongest distinct ending-digit run is length 1, 2, 3, 4, and so on."
          freq={summary.maxRunLengthFrequency}
          tone="indigo"
        />
        <FrequencyBars
          title="Numbers covered by strongest run"
          description="How many actual numbers in a draw are explained by the strongest ending-digit sequence."
          freq={summary.coveredNumbersFrequency}
          tone="teal"
        />
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e5e7eb", background: "#fafcff", fontWeight: 700, color: "#223" }}>
          Recent / strongest examples
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thLeft}>Date</th>
                <th style={thLeft}>Numbers</th>
                <th style={thLeft}>Endings</th>
                <th style={thLeft}>Strongest run(s)</th>
                <th style={thRight}>Run len</th>
                <th style={thRight}>Covered</th>
              </tr>
            </thead>
            <tbody>
              {sortedDraws.slice(0, 18).map((draw) => (
                <tr key={`${draw.date}-${draw.numbers.join("-")}`} style={{ borderTop: "1px solid #edf2f7" }}>
                  <td style={tdLeft}>{draw.date}</td>
                  <td style={tdLeft}>{draw.numbers.join(" ")}</td>
                  <td style={tdLeft}>{draw.endings.join(" ")}</td>
                  <td style={tdLeft}>{formatRuns(draw)}</td>
                  <td style={tdRight}>{draw.maxRunLength}</td>
                  <td style={tdRight}>{draw.coveredNumbers}</td>
                </tr>
              ))}
              {sortedDraws.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 12, color: "#999", textAlign: "center" }}>
                    No draws available for ending-digit sequence analysis.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

const thLeft: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid #e5e7eb",
  color: "#455a64",
};

const thRight: React.CSSProperties = {
  ...thLeft,
  textAlign: "right",
};

const tdLeft: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  color: "#223",
};

const tdRight: React.CSSProperties = {
  ...tdLeft,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

export default EndingDigitSequencePanel;

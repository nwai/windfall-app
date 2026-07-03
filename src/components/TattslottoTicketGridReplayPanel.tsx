import React, { useEffect, useMemo, useState } from "react";
import type { Draw } from "../types";
import {
  buildTicketGridCells,
  buildTicketGridReplayFrames,
  computeAdjacentTraceMarkers,
  computeCarryOverMarkers,
  computeRunningHotColdCounts,
  computeTicketGridDensity,
  stepTicketReplayFrame,
  type TicketGridDrawScope,
} from "../lib/tattslottoTicketGrid";
import { HigButton, InfoHelp } from "./shared/HigControls";

interface TattslottoTicketGridReplayPanelProps {
  history: Draw[];
}

type PlaybackDirection = -1 | 0 | 1;
type CellRole = "main" | "supp" | "none";

const SPEED_OPTIONS = [
  { label: "0.25x", value: 2400 },
  { label: "0.5x", value: 1600 },
  { label: "1x", value: 900 },
  { label: "2x", value: 450 },
  { label: "4x", value: 220 },
];

const styles: Record<string, React.CSSProperties> = {
  shell: {
    border: "1px solid #d9e1ed",
    borderRadius: 14,
    background: "#fff",
    padding: 14,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  title: {
    margin: 0,
    color: "#1e3a8a",
    fontSize: 16,
    fontWeight: 800,
  },
  subtitle: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 1.45,
    marginTop: 4,
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
    gap: 14,
    alignItems: "start",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(9, minmax(26px, 1fr))",
    gap: 6,
    maxWidth: 560,
  },
  cell: {
    aspectRatio: "1 / 1",
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#cbd5e1",
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    fontWeight: 800,
    color: "#263241",
    background: "#fff",
    position: "relative",
    minWidth: 0,
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
    marginTop: 12,
  },
  side: {
    display: "grid",
    gap: 10,
    color: "#475569",
    fontSize: 12,
    lineHeight: 1.45,
  },
  label: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
  },
  select: {
    minHeight: 32,
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: "#fff",
    color: "#263241",
    padding: "4px 8px",
  },
  note: {
    borderLeft: "4px solid #0f766e",
    background: "#f0fdfa",
    borderRadius: 10,
    padding: "8px 10px",
    color: "#115e59",
  },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    color: "#475569",
    fontSize: 12,
  },
  pill: {
    border: "1px solid #dbe3ee",
    borderRadius: 999,
    padding: "4px 8px",
    background: "#f8fafc",
    fontWeight: 700,
  },
  marker: {
    position: "absolute",
    top: -7,
    right: -3,
    minWidth: 14,
    height: 14,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "#111827",
    color: "#fff",
    fontSize: 9,
    fontWeight: 900,
    lineHeight: 1,
  },
};

const cellStyleForRole = (role: CellRole): React.CSSProperties => {
  if (role === "main") return { background: "#0f62fe", borderColor: "#0f62fe", color: "#fff" };
  if (role === "supp") return { background: "#7c3aed", borderColor: "#7c3aed", color: "#fff" };
  return {};
};

const formatPreviewNumbers = (numbers: readonly number[], limit = 8): string => {
  if (numbers.length === 0) return "none";
  const preview = numbers.slice(0, limit).join(", ");
  return numbers.length > limit ? `${preview} +${numbers.length - limit} more` : preview;
};

export const TattslottoTicketGridReplayPanel: React.FC<TattslottoTicketGridReplayPanelProps> = ({ history }) => {
  const frames = useMemo(() => buildTicketGridReplayFrames(history), [history]);
  const cells = useMemo(() => buildTicketGridCells(), []);
  const [frameIndex, setFrameIndex] = useState(0);
  const [scope, setScope] = useState<TicketGridDrawScope>("mainsSupps");
  const [playbackDirection, setPlaybackDirection] = useState<PlaybackDirection>(0);
  const [speedMs, setSpeedMs] = useState(900);
  const [spatialDensityEnabled, setSpatialDensityEnabled] = useState(true);
  const [carryOverEnabled, setCarryOverEnabled] = useState(true);
  const [adjacentTraceEnabled, setAdjacentTraceEnabled] = useState(false);
  const [hotColdEnabled, setHotColdEnabled] = useState(true);

  const activeIndex = Math.max(0, Math.min(frames.length - 1, frameIndex));
  const activeFrame = frames[activeIndex] ?? null;
  const previousFrame = activeIndex > 0 ? frames[activeIndex - 1] : null;
  const mainSet = new Set(activeFrame?.main ?? []);
  const suppSet = new Set(activeFrame?.supp ?? []);
  const carryOver = new Set(carryOverEnabled ? computeCarryOverMarkers(activeFrame, previousFrame, scope) : []);
  const adjacentTrace = new Set(adjacentTraceEnabled ? computeAdjacentTraceMarkers(activeFrame, previousFrame, scope) : []);
  const density = useMemo(() => computeTicketGridDensity(frames, scope), [frames, scope]);
  const hotCold = useMemo(
    () => computeRunningHotColdCounts(frames, activeIndex, scope),
    [activeIndex, frames, scope],
  );
  const hotSet = new Set(hotColdEnabled ? hotCold.hotNumbers : []);
  const coldSet = new Set(hotColdEnabled ? hotCold.coldNumbers : []);

  useEffect(() => {
    setFrameIndex(0);
    setPlaybackDirection(0);
  }, [frames.length]);

  useEffect(() => {
    if (playbackDirection === 0 || frames.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => stepTicketReplayFrame({
        currentIndex: current,
        frameCount: frames.length,
        direction: playbackDirection,
      }));
    }, speedMs);
    return () => window.clearInterval(timer);
  }, [frames.length, playbackDirection, speedMs]);

  if (frames.length === 0) {
    return (
      <section style={styles.shell} aria-label="Tattslotto Ticket Grid Replay">
        <h3 style={styles.title}>Tattslotto Ticket Grid Replay</h3>
        <p style={styles.subtitle}>
          This panel replays observed historical draws on the Tattslotto ticket grid.
        </p>
        <div style={styles.note}>
          No real draws available in the active window. Adjust WFMQYH or reload draw history.
        </div>
      </section>
    );
  }

  const step = (direction: -1 | 1) => {
    setPlaybackDirection(0);
    setFrameIndex((current) => stepTicketReplayFrame({ currentIndex: current, frameCount: frames.length, direction }));
  };

  return (
    <section style={styles.shell} aria-label="Tattslotto Ticket Grid Replay">
      <div style={styles.header}>
        <div>
          <h3 style={styles.title}>Tattslotto Ticket Grid Replay</h3>
          <div style={styles.subtitle}>
            Frame {activeFrame?.frameNumber ?? 0} / {frames.length} | {activeFrame?.date ?? "No draw"} | {scope === "mainsSupps" ? "mains + supps" : "mains only"}
          </div>
        </div>
        <InfoHelp label="Tattslotto replay explanation" className="tattslotto-ticket-grid-replay-help">
          This panel replays observed historical draws on the 9x5 Tattslotto ticket grid. Overlays are diagnostics from the active WFMQYH window, not calibrated predictions.
        </InfoHelp>
      </div>

      <div style={styles.layout}>
        <div>
          <div data-testid="tattslotto-ticket-grid" style={styles.grid}>
            {cells.map((cell) => {
              const role: CellRole = mainSet.has(cell.number) ? "main" : suppSet.has(cell.number) ? "supp" : "none";
              const densityStrength = spatialDensityEnabled
                ? Math.max(density.normalizedRowIntensity[cell.row], density.normalizedColumnIntensity[cell.column])
                : 0;
              const hotColdLabel = hotSet.has(cell.number) ? "H" : coldSet.has(cell.number) ? "C" : "";
              const outline = carryOver.has(cell.number)
                ? "2px solid #f59e0b"
                : adjacentTrace.has(cell.number)
                  ? "2px solid #0f766e"
                  : undefined;

              return (
                <span
                  key={cell.number}
                  data-ticket-number={cell.number}
                  data-draw-role={role}
                  data-carry-over={carryOver.has(cell.number) ? "true" : "false"}
                  data-adjacent-trace={adjacentTrace.has(cell.number) ? "true" : "false"}
                  data-hot-cold={hotColdLabel || "none"}
                  style={{
                    ...styles.cell,
                    ...cellStyleForRole(role),
                    boxShadow: densityStrength > 0.75 ? "inset 0 -4px 0 rgba(217,70,239,0.35)" : undefined,
                    outline,
                  }}
                  aria-label={`Ticket number ${cell.number}; ${role}; ${hotColdLabel === "H" ? "running hot" : hotColdLabel === "C" ? "running cold" : "neutral"}`}
                >
                  {cell.number}
                  {hotColdLabel ? (
                    <span aria-hidden="true" style={styles.marker}>
                      {hotColdLabel}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>

          <div style={styles.controls}>
            <HigButton size="compact" variant="secondary" aria-label="Step backward one draw" onClick={() => step(-1)}>Back</HigButton>
            <HigButton size="compact" variant="secondary" aria-label="Play backward" onClick={() => setPlaybackDirection(-1)}>Reverse</HigButton>
            <HigButton size="compact" variant="primary" aria-label="Pause replay" onClick={() => setPlaybackDirection(0)}>Pause</HigButton>
            <HigButton size="compact" variant="secondary" aria-label="Play forward" onClick={() => setPlaybackDirection(1)}>Play</HigButton>
            <HigButton size="compact" variant="secondary" aria-label="Step forward one draw" onClick={() => step(1)}>Next</HigButton>
            <HigButton size="compact" variant="quiet" aria-label="Reset replay" onClick={() => { setPlaybackDirection(0); setFrameIndex(0); }}>Reset</HigButton>
            <label style={styles.label}>
              Speed
              <select aria-label="Replay speed" style={styles.select} value={speedMs} onChange={(event) => setSpeedMs(Number(event.target.value))}>
                {SPEED_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        <aside style={styles.side}>
          <label style={styles.label}><input type="checkbox" checked={spatialDensityEnabled} onChange={(event) => setSpatialDensityEnabled(event.target.checked)} /> Spatial density</label>
          <label style={styles.label}><input type="checkbox" checked={carryOverEnabled} onChange={(event) => setCarryOverEnabled(event.target.checked)} /> Carry-over markers</label>
          <label style={styles.label}><input type="checkbox" checked={adjacentTraceEnabled} onChange={(event) => setAdjacentTraceEnabled(event.target.checked)} /> Adjacent +/-1/+/-2 trace</label>
          <label style={styles.label}><input type="checkbox" checked={hotColdEnabled} onChange={(event) => setHotColdEnabled(event.target.checked)} /> Running hot/cold</label>
          <label style={styles.label}>
            Count scope
            <select aria-label="Ticket grid count scope" style={styles.select} value={scope} onChange={(event) => setScope(event.target.value as TicketGridDrawScope)}>
              <option value="mainsSupps">Mains + supps</option>
              <option value="mains">Mains only</option>
            </select>
          </label>
          <div style={styles.note}>
            Running hot count {hotCold.hotCount}: {formatPreviewNumbers(hotCold.hotNumbers)}
            <br />
            Running cold count {hotCold.coldCount}: {hotCold.coldNumbers.length} number{hotCold.coldNumbers.length === 1 ? "" : "s"}
          </div>
        </aside>
      </div>

      <div style={styles.legend} aria-label="Ticket grid replay legend">
        <span style={styles.pill}>Main: blue</span>
        <span style={styles.pill}>Supp: violet</span>
        <span style={styles.pill}>Carry-over: amber outline</span>
        <span style={styles.pill}>Adjacent trace: teal outline</span>
        <span style={styles.pill}>H/C: running hot/cold</span>
      </div>
    </section>
  );
};

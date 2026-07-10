import React, { useEffect, useMemo, useState } from "react";
import type { Draw } from "../types";
import {
  buildTicketGridCandidateFrames,
  buildTicketGridCells,
  buildTicketGridReplayFrames,
  computeAdjacentTraceMarkers,
  computeCarryOverMarkers,
  computeRunningHotColdCounts,
  computeTicketGridDensity,
  stepTicketCarouselFrame,
  stepTicketReplayFrame,
  toggleTicketHeldNumber,
  type TicketGridCandidateSourceInput,
  type TicketGridDrawScope,
} from "../lib/tattslottoTicketGrid";
import { HigButton, InfoHelp } from "./shared/HigControls";

interface TattslottoTicketGridReplayPanelProps {
  history: Draw[];
  candidateSources?: readonly TicketGridCandidateSourceInput[];
}

type PlaybackDirection = -1 | 0 | 1;
type CellRole = "main" | "supp" | "none";
type TicketGridMode = "history" | "candidates";

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
  modeSwitch: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  modeHelp: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 1.45,
    marginBottom: 12,
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
    appearance: "none",
  },
  candidateCell: {
    cursor: "pointer",
  },
  disabledCell: {
    cursor: "default",
    opacity: 0.72,
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
  candidateNote: {
    borderLeft: "4px solid #0f62fe",
    background: "#eff6ff",
    borderRadius: 10,
    padding: "8px 10px",
    color: "#1e3a8a",
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
  heldMarker: {
    position: "absolute",
    bottom: -6,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "#0f766e",
    color: "#fff",
    fontSize: 9,
    fontWeight: 900,
    lineHeight: 1,
    border: "1px solid #fff",
  },
  heldList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
};

const cellStyleForRole = (role: CellRole): React.CSSProperties => {
  if (role === "main") return { background: "#0f62fe", borderColor: "#0f62fe", color: "#fff" };
  if (role === "supp") return { background: "#7c3aed", borderColor: "#7c3aed", color: "#fff" };
  return {};
};

const heldCellStyle: React.CSSProperties = {
  background: "#0f766e",
  borderColor: "#0f766e",
  color: "#fff",
};

const hotColdMarkerStyle = (label: string): React.CSSProperties => {
  if (label === "H") return { ...styles.marker, background: "#dc2626" };
  if (label === "C") return { ...styles.marker, background: "#2563eb" };
  return styles.marker;
};

const formatPreviewNumbers = (numbers: readonly number[], limit = 8): string => {
  if (numbers.length === 0) return "none";
  const preview = numbers.slice(0, limit).join(", ");
  return numbers.length > limit ? `${preview} +${numbers.length - limit} more` : preview;
};

export const TattslottoTicketGridReplayPanel: React.FC<TattslottoTicketGridReplayPanelProps> = ({
  history,
  candidateSources = [],
}) => {
  const frames = useMemo(() => buildTicketGridReplayFrames(history), [history]);
  const candidateFrames = useMemo(() => buildTicketGridCandidateFrames(candidateSources), [candidateSources]);
  const candidateFramesKey = useMemo(() => (
    candidateFrames
      .map((frame) => `${frame.sourceId}:${frame.sourceRowNumber}:${frame.numbers.join(",")}`)
      .join("|")
  ), [candidateFrames]);
  const cells = useMemo(() => buildTicketGridCells(), []);
  const [mode, setMode] = useState<TicketGridMode>("history");
  const [frameIndex, setFrameIndex] = useState(0);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [scope, setScope] = useState<TicketGridDrawScope>("mainsSupps");
  const [playbackDirection, setPlaybackDirection] = useState<PlaybackDirection>(0);
  const [candidatePlaying, setCandidatePlaying] = useState(false);
  const [heldNumbers, setHeldNumbers] = useState<number[]>([]);
  const [speedMs, setSpeedMs] = useState(900);
  const [spatialDensityEnabled, setSpatialDensityEnabled] = useState(true);
  const [carryOverEnabled, setCarryOverEnabled] = useState(true);
  const [adjacentTraceEnabled, setAdjacentTraceEnabled] = useState(false);
  const [hotColdEnabled, setHotColdEnabled] = useState(true);

  const hasHistory = frames.length > 0;
  const hasCandidates = candidateFrames.length > 0;
  const activeIndex = Math.max(0, Math.min(frames.length - 1, frameIndex));
  const activeFrame = frames[activeIndex] ?? null;
  const activeCandidateIndex = Math.max(0, Math.min(candidateFrames.length - 1, candidateIndex));
  const activeCandidate = candidateFrames[activeCandidateIndex] ?? null;
  const isCandidateMode = mode === "candidates";
  const previousFrame = activeIndex > 0 ? frames[activeIndex - 1] : null;
  const mainSet = new Set(isCandidateMode ? activeCandidate?.main ?? [] : activeFrame?.main ?? []);
  const suppSet = new Set(isCandidateMode ? activeCandidate?.supp ?? [] : activeFrame?.supp ?? []);
  const heldSet = new Set(heldNumbers);
  const carryOver = new Set(!isCandidateMode && carryOverEnabled ? computeCarryOverMarkers(activeFrame, previousFrame, scope) : []);
  const adjacentTrace = new Set(!isCandidateMode && adjacentTraceEnabled ? computeAdjacentTraceMarkers(activeFrame, previousFrame, scope) : []);
  const density = useMemo(() => computeTicketGridDensity(frames, scope), [frames, scope]);
  const hotColdFrameIndex = isCandidateMode ? frames.length - 1 : activeIndex;
  const hotCold = useMemo(
    () => computeRunningHotColdCounts(frames, hotColdFrameIndex, scope),
    [frames, hotColdFrameIndex, scope],
  );
  const hotSet = new Set(hotColdEnabled ? hotCold.hotNumbers : []);
  const coldSet = new Set(hotColdEnabled ? hotCold.coldNumbers : []);
  const heldComplete = heldNumbers.length >= 8;

  useEffect(() => {
    setFrameIndex(0);
    setPlaybackDirection(0);
  }, [frames.length]);

  useEffect(() => {
    setCandidateIndex(0);
    setCandidatePlaying(false);
    setHeldNumbers([]);
  }, [candidateFramesKey]);

  useEffect(() => {
    if (!hasHistory && hasCandidates) setMode("candidates");
    if (!hasCandidates && mode === "candidates") setMode("history");
  }, [hasCandidates, hasHistory, mode]);

  useEffect(() => {
    if (mode !== "history" || playbackDirection === 0 || frames.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => stepTicketReplayFrame({
        currentIndex: current,
        frameCount: frames.length,
        direction: playbackDirection,
      }));
    }, speedMs);
    return () => window.clearInterval(timer);
  }, [frames.length, mode, playbackDirection, speedMs]);

  useEffect(() => {
    if (mode !== "candidates" || !candidatePlaying || candidateFrames.length <= 1 || heldComplete) return undefined;
    const timer = window.setInterval(() => {
      setCandidateIndex((current) => stepTicketCarouselFrame({
        currentIndex: current,
        frameCount: candidateFrames.length,
        direction: 1,
      }));
    }, speedMs);
    return () => window.clearInterval(timer);
  }, [candidateFrames.length, candidatePlaying, heldComplete, mode, speedMs]);

  useEffect(() => {
    if (heldComplete) setCandidatePlaying(false);
  }, [heldComplete]);

  if (!hasHistory && !hasCandidates) {
    return (
      <section style={styles.shell} aria-label="Tattslotto Ticket Grid Replay">
        <h3 style={styles.title}>Tattslotto Ticket Grid Replay</h3>
        <p style={styles.subtitle}>
          This panel replays observed historical draws and generated candidate rows on the Tattslotto ticket grid.
        </p>
        <div style={styles.note}>
          No real draws available in the active window, and no candidate rows are available. Adjust WFMQYH, reload draw history, or generate candidates.
        </div>
      </section>
    );
  }

  const step = (direction: -1 | 1) => {
    setPlaybackDirection(0);
    setFrameIndex((current) => stepTicketReplayFrame({ currentIndex: current, frameCount: frames.length, direction }));
  };

  const stepCandidate = (direction: -1 | 1) => {
    setCandidatePlaying(false);
    setCandidateIndex((current) => stepTicketCarouselFrame({ currentIndex: current, frameCount: candidateFrames.length, direction }));
  };

  const showHistoryMode = () => {
    setCandidatePlaying(false);
    setMode("history");
  };

  const showCandidateMode = () => {
    setPlaybackDirection(0);
    setMode("candidates");
  };

  const toggleHeldNumber = (number: number) => {
    if (!isCandidateMode || heldComplete) return;
    setHeldNumbers((current) => toggleTicketHeldNumber(current, number));
  };

  const holdCurrentCandidate = () => {
    if (!activeCandidate || heldComplete) return;
    setHeldNumbers((current) => {
      let next = current;
      activeCandidate.numbers.forEach((number) => {
        if (next.includes(number)) return;
        next = toggleTicketHeldNumber(next, number);
      });
      return next;
    });
  };

  const startCandidateOver = () => {
    setCandidatePlaying(false);
    setCandidateIndex(0);
    setHeldNumbers([]);
  };

  const modeSummary = isCandidateMode
    ? `Candidate ${activeCandidate ? activeCandidateIndex + 1 : 0} / ${candidateFrames.length} | ${activeCandidate ? `${activeCandidate.sourceLabel} #${activeCandidate.sourceRowNumber}` : "No candidate"} | Held ${heldNumbers.length} / 8`
    : `Frame ${activeFrame?.frameNumber ?? 0} / ${frames.length} | ${activeFrame?.date ?? "No draw"} | ${scope === "mainsSupps" ? "mains + supps" : "mains only"}`;

  return (
    <section style={styles.shell} aria-label="Tattslotto Ticket Grid Replay">
      <div style={styles.header}>
        <div>
          <h3 style={styles.title}>Tattslotto Ticket Grid Replay</h3>
          <div style={styles.subtitle}>
            {modeSummary}
          </div>
        </div>
        <InfoHelp label="Tattslotto replay explanation" className="tattslotto-ticket-grid-replay-help">
          This panel replays observed historical draws on the 9x5 Tattslotto ticket grid. Candidate carousel mode cycles through generated candidate rows and lets you hold up to eight numbers locally. Overlays are diagnostics from the active WFMQYH window, not calibrated predictions.
        </InfoHelp>
      </div>

      <div style={styles.modeSwitch} aria-label="Ticket grid mode">
        <HigButton
          size="compact"
          variant={mode === "history" ? "primary" : "secondary"}
          aria-label="Show history replay mode"
          aria-pressed={mode === "history"}
          disabled={!hasHistory}
          onClick={showHistoryMode}
        >
          History replay
        </HigButton>
        <HigButton
          size="compact"
          variant={mode === "candidates" ? "primary" : "secondary"}
          aria-label="Show candidate carousel mode"
          aria-pressed={mode === "candidates"}
          disabled={!hasCandidates}
          onClick={showCandidateMode}
        >
          Candidate carousel
        </HigButton>
      </div>
      <div style={styles.modeHelp}>
        Candidate rows available: {candidateFrames.length}
        {!hasCandidates ? " | Generate rows in Generated Candidates or Paste-Weighted Candidates to enable carousel mode." : ""}
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
              const isHeld = heldSet.has(cell.number);
              const isCurrentCandidateNumber = isCandidateMode && role !== "none";
              const canToggleCandidateCell = isCandidateMode && !heldComplete && (isCurrentCandidateNumber || isHeld);
              const Element = isCandidateMode ? "button" : "span";

              return (
                <Element
                  key={cell.number}
                  type={isCandidateMode ? "button" : undefined}
                  data-ticket-number={cell.number}
                  data-draw-role={role}
                  data-held={isHeld ? "true" : "false"}
                  data-carry-over={carryOver.has(cell.number) ? "true" : "false"}
                  data-adjacent-trace={adjacentTrace.has(cell.number) ? "true" : "false"}
                  data-hot-cold={hotColdLabel || "none"}
                  disabled={isCandidateMode ? !canToggleCandidateCell : undefined}
                  onClick={isCandidateMode ? () => toggleHeldNumber(cell.number) : undefined}
                  style={{
                    ...styles.cell,
                    ...cellStyleForRole(role),
                    ...(isHeld ? heldCellStyle : {}),
                    ...(isCandidateMode ? styles.candidateCell : {}),
                    ...(isCandidateMode && !canToggleCandidateCell ? styles.disabledCell : {}),
                    boxShadow: densityStrength > 0.75 ? "inset 0 -4px 0 rgba(217,70,239,0.35)" : undefined,
                    outline,
                  }}
                  aria-label={`Ticket number ${cell.number}; ${isCandidateMode ? "candidate carousel" : "history replay"}; ${role}; ${isHeld ? "held" : "not held"}; ${hotColdLabel === "H" ? "running hot" : hotColdLabel === "C" ? "running cold" : "neutral"}`}
                >
                  {cell.number}
                  {hotColdLabel ? (
                    <span aria-hidden="true" style={hotColdMarkerStyle(hotColdLabel)}>
                      {hotColdLabel}
                    </span>
                  ) : null}
                  {isHeld ? (
                    <span aria-hidden="true" style={styles.heldMarker}>H</span>
                  ) : null}
                </Element>
              );
            })}
          </div>

          <div style={styles.controls} aria-label={isCandidateMode ? "Candidate carousel controls" : "History replay controls"}>
            {isCandidateMode ? (
              <>
                <HigButton size="compact" variant="secondary" aria-label="Previous candidate row" disabled={!hasCandidates || heldComplete} onClick={() => stepCandidate(-1)}>Back</HigButton>
                <HigButton size="compact" variant="secondary" aria-label="Spin candidate carousel" disabled={!hasCandidates || heldComplete} onClick={() => setCandidatePlaying(true)}>Spin</HigButton>
                <HigButton size="compact" variant="primary" aria-label="Pause candidate carousel" onClick={() => setCandidatePlaying(false)}>Pause</HigButton>
                <HigButton size="compact" variant="secondary" aria-label="Next candidate row" disabled={!hasCandidates || heldComplete} onClick={() => stepCandidate(1)}>Next</HigButton>
                <HigButton size="compact" variant="secondary" aria-label="Hold current candidate numbers" disabled={!activeCandidate || heldComplete} onClick={holdCurrentCandidate}>Hold visible</HigButton>
                <HigButton size="compact" variant="quiet" aria-label="Start over candidate holds" onClick={startCandidateOver}>Start over</HigButton>
              </>
            ) : (
              <>
                <HigButton size="compact" variant="secondary" aria-label="Step backward one draw" onClick={() => step(-1)}>Back</HigButton>
                <HigButton size="compact" variant="secondary" aria-label="Play backward" onClick={() => setPlaybackDirection(-1)}>Reverse</HigButton>
                <HigButton size="compact" variant="primary" aria-label="Pause replay" onClick={() => setPlaybackDirection(0)}>Pause</HigButton>
                <HigButton size="compact" variant="secondary" aria-label="Play forward" onClick={() => setPlaybackDirection(1)}>Play</HigButton>
                <HigButton size="compact" variant="secondary" aria-label="Step forward one draw" onClick={() => step(1)}>Next</HigButton>
                <HigButton size="compact" variant="quiet" aria-label="Reset replay" onClick={() => { setPlaybackDirection(0); setFrameIndex(0); }}>Reset</HigButton>
              </>
            )}
            <label style={styles.label}>
              {isCandidateMode ? "Spin speed" : "Replay speed"}
              <select aria-label="Replay speed" style={styles.select} value={speedMs} onChange={(event) => setSpeedMs(Number(event.target.value))}>
                {SPEED_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        <aside style={styles.side}>
          <label style={styles.label}><input type="checkbox" checked={spatialDensityEnabled} onChange={(event) => setSpatialDensityEnabled(event.target.checked)} /> Spatial density</label>
          <label style={styles.label}><input type="checkbox" checked={carryOverEnabled} disabled={isCandidateMode} onChange={(event) => setCarryOverEnabled(event.target.checked)} /> Carry-over markers</label>
          <label style={styles.label}><input type="checkbox" checked={adjacentTraceEnabled} disabled={isCandidateMode} onChange={(event) => setAdjacentTraceEnabled(event.target.checked)} /> Adjacent +/-1/+/-2 trace</label>
          <label style={styles.label}><input type="checkbox" checked={hotColdEnabled} onChange={(event) => setHotColdEnabled(event.target.checked)} /> Running hot/cold</label>
          <label style={styles.label}>
            Count scope
            <select aria-label="Ticket grid count scope" style={styles.select} value={scope} onChange={(event) => setScope(event.target.value as TicketGridDrawScope)}>
              <option value="mainsSupps">Mains + supps</option>
              <option value="mains">Mains only</option>
            </select>
          </label>
          {isCandidateMode ? (
            <>
              <div style={styles.candidateNote}>
                Candidate carousel uses generated rows already present in the app. Holding numbers here is local to this visual tool and does not change generation, exclusions, or draw history.
              </div>
              <div style={styles.note}>
                Active source: {activeCandidate ? `${activeCandidate.sourceLabel} #${activeCandidate.sourceRowNumber}` : "none"}
                <br />
                Candidate numbers: {formatPreviewNumbers(activeCandidate?.numbers ?? [], 10)}
              </div>
              <div>
                <div style={{ fontWeight: 800, color: "#263241", marginBottom: 6 }}>Held {heldNumbers.length} / 8</div>
                <div style={styles.heldList}>
                  {heldNumbers.length > 0
                    ? heldNumbers.map((number) => <span key={number} style={styles.pill}>{number}</span>)
                    : <span style={{ color: "#64748b" }}>No held numbers yet</span>}
                </div>
                {heldComplete ? (
                  <div style={{ color: "#b45309", fontWeight: 700, marginTop: 6 }}>
                    Eight numbers held. Spin is locked until Start over.
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div style={styles.note}>
              Running hot count {hotCold.hotCount}: {formatPreviewNumbers(hotCold.hotNumbers)}
              <br />
              Running cold count {hotCold.coldCount}: {hotCold.coldNumbers.length} number{hotCold.coldNumbers.length === 1 ? "" : "s"}
            </div>
          )}
        </aside>
      </div>

      <div style={styles.legend} aria-label="Ticket grid replay legend">
        <span style={styles.pill}>Main: blue</span>
        <span style={styles.pill}>Supp: violet</span>
        <span style={styles.pill}>Held: green</span>
        <span style={styles.pill}>Carry-over: amber outline</span>
        <span style={styles.pill}>Adjacent trace: teal outline</span>
        <span style={styles.pill}>H/C: running hot/cold</span>
      </div>
    </section>
  );
};

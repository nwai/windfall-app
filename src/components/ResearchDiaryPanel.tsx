import React, { useEffect, useMemo, useState } from "react";

import { HigButton, HigField, InfoHelp } from "./shared/HigControls";
import type { Draw } from "../types";
import type { AppPresetSnapshot } from "../lib/presets";
import {
  buildResearchDiaryEntry,
  computeResearchDiaryNextDrawContext,
  deriveResearchDiaryRuleTagsFromSetup,
  findResearchDiaryReminders,
  loadResearchDiaryEntries,
  saveResearchDiaryEntries,
  type ResearchDiaryEntry,
  type ResearchDiaryEvidenceStatus,
  type ResearchDiaryMonthPhase,
  type ResearchDiaryOutcome,
  type ResearchDiaryPriority,
  type ResearchDiaryRuleTag,
  type ResearchDiaryWeekday,
} from "../lib/researchDiary";
import type { Sde1Hc3ContextBacktest, Sde1Hc3ContextAdvice } from "../lib/sde1Hc3ContextAdvice";

export interface ResearchDiaryPanelProps {
  history: Draw[];
  initialEntries?: ResearchDiaryEntry[];
  now?: () => string;
  getSetupSnapshot?: () => AppPresetSnapshot | undefined;
  sde1Hc3Backtest?: Sde1Hc3ContextBacktest | null;
  showTitle?: boolean;
}

const DRAW_ORDINALS = Array.from({ length: 14 }, (_, index) => index + 1);
const WEEKDAYS: ResearchDiaryWeekday[] = ["Monday", "Wednesday", "Friday"];
const MONTH_PHASES: Array<{ value: ResearchDiaryMonthPhase; label: string }> = [
  { value: "early", label: "Early" },
  { value: "mid", label: "Mid" },
  { value: "late", label: "Late" },
  { value: "monthEnd", label: "Month-end" },
];
const RULE_TAGS: ResearchDiaryRuleTag[] = [
  "SDE1",
  "HC3",
  "Stage IDM",
  "Carry-over",
  "Odd/even",
  "Drought",
  "Hot/cold",
  "Window shape",
  "Other",
];
const EVIDENCE_OPTIONS: Array<{ value: ResearchDiaryEvidenceStatus; label: string }> = [
  { value: "observation", label: "Observation" },
  { value: "needsTesting", label: "Needs testing" },
  { value: "worthRepeating", label: "Worth repeating" },
  { value: "refuted", label: "Refuted" },
  { value: "retired", label: "Retired" },
];
const PRIORITY_OPTIONS: Array<{ value: ResearchDiaryPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];
const OUTCOME_OPTIONS: Array<{ value: ResearchDiaryOutcome; label: string }> = [
  { value: "untested", label: "Untested" },
  { value: "helped", label: "Helped" },
  { value: "neutral", label: "Neutral" },
  { value: "hurt", label: "Hurt" },
  { value: "unclear", label: "Unclear" },
];

const chipStyle = (kind: "neutral" | "blue" | "green" | "amber" | "pink" = "neutral"): React.CSSProperties => {
  const palette = {
    neutral: { background: "#f3f5f8", color: "#394452", border: "#dde5ee" },
    blue: { background: "#eef6ff", color: "#155a8a", border: "#cfe3f7" },
    green: { background: "#e8f5e9", color: "#1b5e20", border: "#bbdfc0" },
    amber: { background: "#fff7ed", color: "#9a3412", border: "#fed7aa" },
    pink: { background: "#fff1f6", color: "#9d174d", border: "#fbcfe8" },
  }[kind];

  return {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 24,
    width: "fit-content",
    border: `1px solid ${palette.border}`,
    borderRadius: 999,
    padding: "2px 8px",
    background: palette.background,
    color: palette.color,
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1.25,
  };
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #dbe3ec",
  borderRadius: 8,
  background: "#ffffff",
  padding: 12,
};

const compactGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
  alignItems: "start",
};

const optionGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))",
  gap: 8,
};

const targetGroupStyle: React.CSSProperties = {
  minWidth: 0,
  padding: 10,
  border: "1px solid #dbe3ec",
  borderRadius: 8,
  background: "rgba(248, 250, 252, 0.72)",
};

const adviceToneStyles: Record<Sde1Hc3ContextAdvice["tone"], React.CSSProperties> = {
  strong: { background: "#f0fdf4", borderColor: "#86efac" },
  moderate: { background: "#eff6ff", borderColor: "#bfdbfe" },
  neutral: { background: "#f8fafc", borderColor: "#dbe3ec" },
  caution: { background: "#fff7ed", borderColor: "#fed7aa" },
  insufficient: { background: "#f8fafc", borderColor: "#dbe3ec" },
};

const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const formatSignedPercentPoint = (value: number): string => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}pp`;
const formatSignedDecimal = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;

const tableHeadStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "1px solid #dbe3ec",
  color: "#51606f",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const tableCellStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #eef2f7",
  color: "#334155",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

const toggleInList = <T,>(values: T[], value: T): T[] => (
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
);

const statusLabel = (status: ResearchDiaryEvidenceStatus): string => (
  EVIDENCE_OPTIONS.find((option) => option.value === status)?.label ?? status
);

const priorityChipKind = (priority: ResearchDiaryPriority): "neutral" | "blue" | "green" | "amber" | "pink" => (
  priority === "high" ? "pink" : priority === "low" ? "neutral" : "blue"
);

const previewSetupLines = (entry: ResearchDiaryEntry): string[] => {
  if (!entry.setupSummary) return [];
  return [
    entry.setupSummary.window,
    ...entry.setupSummary.generation,
    ...entry.setupSummary.filters,
    ...entry.setupSummary.selections,
  ].slice(0, 8);
};

export const ResearchDiaryPanel: React.FC<ResearchDiaryPanelProps> = ({
  history,
  initialEntries,
  now = () => new Date().toISOString(),
  getSetupSnapshot,
  sde1Hc3Backtest,
  showTitle = true,
}) => {
  const [entries, setEntries] = useState<ResearchDiaryEntry[]>(() => (
    initialEntries ?? (typeof window === "undefined" ? [] : loadResearchDiaryEntries())
  ));
  const [title, setTitle] = useState("");
  const [observation, setObservation] = useState("");
  const [selectedOrdinals, setSelectedOrdinals] = useState<number[]>([]);
  const [selectedWeekdays, setSelectedWeekdays] = useState<ResearchDiaryWeekday[]>([]);
  const [selectedPhases, setSelectedPhases] = useState<ResearchDiaryMonthPhase[]>([]);
  const [selectedMonthDrawCounts, setSelectedMonthDrawCounts] = useState<number[]>([]);
  const [selectedTags, setSelectedTags] = useState<ResearchDiaryRuleTag[]>([]);
  const [evidenceStatus, setEvidenceStatus] = useState<ResearchDiaryEvidenceStatus>("observation");
  const [priority, setPriority] = useState<ResearchDiaryPriority>("normal");
  const [outcome, setOutcome] = useState<ResearchDiaryOutcome>("untested");
  const [reviewAfterMatches, setReviewAfterMatches] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [message, setMessage] = useState("");
  const setupRuleTagsPrefilledRef = React.useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const hasControlledInitialEntries = initialEntries !== undefined;
  const nextDrawContext = useMemo(
    () => computeResearchDiaryNextDrawContext(history, { now: now() }),
    [history, now],
  );
  const reminders = useMemo(
    () => findResearchDiaryReminders(entries, nextDrawContext),
    [entries, nextDrawContext],
  );
  const editingEntry = useMemo(
    () => entries.find((entry) => entry.id === editingId) ?? null,
    [editingId, entries],
  );

  useEffect(() => {
    if (hasControlledInitialEntries || typeof window === "undefined") return;
    setEntries(loadResearchDiaryEntries());
  }, [hasControlledInitialEntries]);

  const persistEntries = (nextEntries: ResearchDiaryEntry[]) => {
    setEntries(nextEntries);
    if (!hasControlledInitialEntries && typeof window !== "undefined") {
      saveResearchDiaryEntries(nextEntries);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setObservation("");
    setSelectedOrdinals([]);
    setSelectedWeekdays([]);
    setSelectedPhases([]);
    setSelectedMonthDrawCounts([]);
    setSelectedTags([]);
    setEvidenceStatus("observation");
    setPriority("normal");
    setOutcome("untested");
    setReviewAfterMatches("");
    setOutcomeNotes("");
    setupRuleTagsPrefilledRef.current = false;
  };

  const fillFormFromEntry = (entry: ResearchDiaryEntry) => {
    setEditingId(entry.id);
    setTitle(entry.title);
    setObservation(entry.observation);
    setSelectedOrdinals(entry.appliesTo.drawOrdinals ?? []);
    setSelectedWeekdays(entry.appliesTo.weekdays ?? []);
    setSelectedPhases(entry.appliesTo.monthPhases ?? []);
    setSelectedMonthDrawCounts(entry.appliesTo.monthDrawCounts ?? []);
    setSelectedTags(entry.ruleTags);
    setEvidenceStatus(entry.evidenceStatus);
    setPriority(entry.priority);
    setOutcome(entry.outcome);
    setReviewAfterMatches(entry.reviewAfterMatches === undefined ? "" : String(entry.reviewAfterMatches));
    setOutcomeNotes(entry.outcomeNotes ?? "");
    setupRuleTagsPrefilledRef.current = true;
    setMessage(`Editing diary note: ${entry.title}`);
  };

  useEffect(() => {
    if (editingEntry || setupRuleTagsPrefilledRef.current || selectedTags.length > 0) return;
    const inferredTags = deriveResearchDiaryRuleTagsFromSetup(getSetupSnapshot?.());
    if (!inferredTags.length) return;
    setupRuleTagsPrefilledRef.current = true;
    setSelectedTags(inferredTags);
  }, [editingEntry, getSetupSnapshot, selectedTags.length]);

  const handleSave = () => {
    if (!title.trim() && !observation.trim()) {
      setMessage("Add a title or observation before saving a diary note.");
      return;
    }

    const review = reviewAfterMatches.trim() ? Number(reviewAfterMatches) : undefined;
    const entry = buildResearchDiaryEntry({
      id: editingEntry?.id,
      title,
      observation,
      appliesTo: {
        drawOrdinals: selectedOrdinals,
        weekdays: selectedWeekdays,
        monthPhases: selectedPhases,
        monthDrawCounts: selectedMonthDrawCounts,
      },
      ruleTags: selectedTags,
      evidenceStatus,
      priority,
      outcome,
      outcomeNotes,
      reviewAfterMatches: Number.isFinite(review) ? review : undefined,
      matchedCount: editingEntry?.matchedCount,
      archived: editingEntry?.archived,
      setupSnapshot: getSetupSnapshot?.() ?? editingEntry?.setupSnapshot,
      now: now(),
    });
    const nextEntry = editingEntry
      ? {
        ...entry,
        createdAt: editingEntry.createdAt,
        matchedCount: editingEntry.matchedCount,
      }
      : entry;

    persistEntries(editingEntry
      ? entries.map((item) => (item.id === editingEntry.id ? nextEntry : item))
      : [nextEntry, ...entries]);
    resetForm();
    setMessage(editingEntry ? "Diary note updated." : "Diary note saved.");
  };

  const handleArchive = (entry: ResearchDiaryEntry) => {
    const nextEntries = entries.map((item) => (
      item.id === entry.id
        ? { ...item, archived: true, updatedAt: now() }
        : item
    ));
    persistEntries(nextEntries);
    setMessage("Diary note archived.");
  };

  return (
    <section className="windfall-ledger-panel" aria-label="Research Diary & Draw Reminders">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {showTitle ? <strong style={{ fontSize: 18, color: "#17202a" }}>Research Diary &amp; Draw Reminders</strong> : null}
            <span style={chipStyle("green")}>Observe-only</span>
          </div>
          <p style={{ margin: "6px 0 0", color: "#51606f", maxWidth: 820 }}>
            Save recurring observations for draw context, weekdays, month phase, and rule tags. Reminders do not change generation.
          </p>
        </div>
        <InfoHelp label="Research Diary help">
          This diary is for reusable research notes, not one-off predictions. It checks whether notes match the next draw context and surfaces reminders, but it does not change generation, ranking, forced numbers, or filters.
        </InfoHelp>
      </div>

      <div style={{ ...compactGridStyle, marginTop: 14 }}>
        <div style={{ ...cardStyle, background: "#f8fafc" }}>
          <div style={{ fontSize: 12, color: "#657385", fontWeight: 800 }}>Next draw context</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#1f2937", marginTop: 2 }}>
            Next draw: {nextDrawContext.weekday} {nextDrawContext.nextDrawDate} · D{nextDrawContext.drawOrdinal}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <span style={chipStyle("blue")}>{nextDrawContext.monthKey}</span>
            <span style={chipStyle("neutral")}>{nextDrawContext.monthDrawCount} scheduled draws</span>
            <span style={chipStyle("neutral")}>{nextDrawContext.recordedDrawsInTargetMonth} recorded before target</span>
          </div>
        </div>
        <div style={{ ...cardStyle, background: reminders.length ? "#fff8fb" : "#ffffff" }}>
          <div style={{ fontSize: 12, color: "#657385", fontWeight: 800 }}>Diary reminders for next draw</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: reminders.length ? "#9d174d" : "#1f2937", marginTop: 2 }}>
            {reminders.length}
          </div>
          <p style={{ margin: "4px 0 0", color: "#657385", fontSize: 13 }}>
            {reminders.length
              ? "Review matching notes before choosing settings."
              : "No diary reminders match the next draw context."}
          </p>
        </div>
      </div>

      {reminders.length ? (
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {reminders.map((reminder) => (
            <div key={reminder.entry.id} style={{ ...cardStyle, borderColor: reminder.reviewDue ? "#fbcfe8" : "#dbe3ec" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ color: "#17202a" }}>{reminder.entry.title}</strong>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={chipStyle(priorityChipKind(reminder.entry.priority))}>{reminder.entry.priority}</span>
                  <span style={chipStyle("blue")}>{statusLabel(reminder.entry.evidenceStatus)}</span>
                  {reminder.reviewDue ? <span style={chipStyle("pink")}>Review due</span> : null}
                </div>
              </div>
              <p style={{ margin: "6px 0", color: "#51606f" }}>{reminder.entry.observation}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {reminder.reasonLabels.map((reason) => <span key={reason} style={chipStyle("green")}>{reason}</span>)}
                {reminder.tagLabels.map((tag) => <span key={tag} style={chipStyle("amber")}>{tag}</span>)}
                {reminder.entry.setupSummary ? <span style={chipStyle("neutral")}>Saved setup</span> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {sde1Hc3Backtest ? (
        <div style={{ ...cardStyle, ...adviceToneStyles[sde1Hc3Backtest.advice.tone], marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, color: "#657385", fontWeight: 800 }}>Current draw-context advice</div>
              <strong style={{ color: "#17202a" }}>{sde1Hc3Backtest.advice.title}</strong>
              <p style={{ margin: "5px 0 0", color: "#51606f", maxWidth: 860, lineHeight: 1.45 }}>
                {sde1Hc3Backtest.advice.message}
              </p>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignContent: "flex-start" }}>
              {sde1Hc3Backtest.advice.chips.map((chip) => (
                <span key={chip} style={chipStyle(sde1Hc3Backtest.advice.tone === "strong" ? "green" : sde1Hc3Backtest.advice.tone === "caution" ? "amber" : "neutral")}>{chip}</span>
              ))}
            </div>
          </div>
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", color: "#334155", fontWeight: 800, fontSize: 13 }}>
              SDE1 + HC3 ordinal backtest ({sde1Hc3Backtest.totalTrials} no-lookahead trials)
            </summary>
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={tableHeadStyle}>Draw</th>
                    <th style={tableHeadStyle}>Trials</th>
                    <th style={tableHeadStyle}>Avoided</th>
                    <th style={tableHeadStyle}>Baseline</th>
                    <th style={tableHeadStyle}>Lift</th>
                    <th style={tableHeadStyle}>Blocked/draw</th>
                    <th style={tableHeadStyle}>Vs baseline</th>
                  </tr>
                </thead>
                <tbody>
                  {sde1Hc3Backtest.rows.length ? sde1Hc3Backtest.rows.map((row) => (
                    <tr key={row.drawOrdinal}>
                      <td style={tableCellStyle}>D{row.drawOrdinal}</td>
                      <td style={tableCellStyle}>{row.trials}</td>
                      <td style={tableCellStyle}>{formatPercent(row.observedAvoidRate)}</td>
                      <td style={tableCellStyle}>{formatPercent(row.expectedAvoidRate)}</td>
                      <td style={{ ...tableCellStyle, color: row.avoidLift >= 0 ? "#166534" : "#b91c1c", fontWeight: 800 }}>{formatSignedPercentPoint(row.avoidLift)}</td>
                      <td style={tableCellStyle}>{row.observedBlockedPerDraw.toFixed(2)}</td>
                      <td style={{ ...tableCellStyle, color: row.blockedDelta >= 0 ? "#166534" : "#b91c1c", fontWeight: 800 }}>{formatSignedDecimal(row.blockedDelta)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td style={tableCellStyle} colSpan={7}>Not enough historical SDE1+HC3 action trials yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      ) : null}

      <div style={{ ...cardStyle, marginTop: 14 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <strong style={{ color: "#17202a" }}>{editingEntry ? "Edit diary note" : "New diary note"}</strong>
          <span style={chipStyle("neutral")}>Does not alter generators</span>
        </div>
        <div style={compactGridStyle}>
          <HigField label="Diary title">
            <input
              aria-label="Diary title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="D3 SDE1 + HC3"
            />
          </HigField>
          <HigField label="Evidence status">
            <select
              aria-label="Evidence status"
              value={evidenceStatus}
              onChange={(event) => setEvidenceStatus(event.target.value as ResearchDiaryEvidenceStatus)}
            >
              {EVIDENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </HigField>
          <HigField label="Priority">
            <select
              aria-label="Diary priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value as ResearchDiaryPriority)}
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </HigField>
          <HigField label="Outcome">
            <select
              aria-label="Diary outcome"
              value={outcome}
              onChange={(event) => setOutcome(event.target.value as ResearchDiaryOutcome)}
            >
              {OUTCOME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </HigField>
        </div>

        <div style={{ marginTop: 10 }}>
          <HigField label="Diary observation">
            <textarea
              aria-label="Diary observation"
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
              placeholder="Write the observation, why it may matter, and what would refute it."
              rows={3}
            />
          </HigField>
        </div>

        <div style={{ ...compactGridStyle, marginTop: 10 }}>
          <div className="research-diary-target-group" style={targetGroupStyle}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#51606f", marginBottom: 6 }}>Applies to draw</div>
            <div style={optionGridStyle}>
              {DRAW_ORDINALS.map((ordinal) => (
                <label key={ordinal} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32 }}>
                  <input
                    type="checkbox"
                    aria-label={`Applies to D${ordinal}`}
                    checked={selectedOrdinals.includes(ordinal)}
                    onChange={() => setSelectedOrdinals((prev) => toggleInList(prev, ordinal))}
                  />
                  D{ordinal}
                </label>
              ))}
            </div>
          </div>
          <div className="research-diary-target-group" style={targetGroupStyle}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#51606f", marginBottom: 6 }}>Applies to weekday</div>
            <div style={optionGridStyle}>
              {WEEKDAYS.map((weekday) => (
                <label key={weekday} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32 }}>
                  <input
                    type="checkbox"
                    aria-label={`Applies to ${weekday}`}
                    checked={selectedWeekdays.includes(weekday)}
                    onChange={() => setSelectedWeekdays((prev) => toggleInList(prev, weekday))}
                  />
                  {weekday}
                </label>
              ))}
            </div>
          </div>
          <div className="research-diary-target-group" style={targetGroupStyle}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#51606f", marginBottom: 6 }}>Month context</div>
            <div style={optionGridStyle}>
              {MONTH_PHASES.map((phase) => (
                <label key={phase.value} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32 }}>
                  <input
                    type="checkbox"
                    aria-label={`Applies to ${phase.label}`}
                    checked={selectedPhases.includes(phase.value)}
                    onChange={() => setSelectedPhases((prev) => toggleInList(prev, phase.value))}
                  />
                  {phase.label}
                </label>
              ))}
              {[12, 13, 14].map((count) => (
                <label key={count} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32 }}>
                  <input
                    type="checkbox"
                    aria-label={`Applies to ${count} draw month`}
                    checked={selectedMonthDrawCounts.includes(count)}
                    onChange={() => setSelectedMonthDrawCounts((prev) => toggleInList(prev, count))}
                  />
                  {count}-draw
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#51606f", marginBottom: 6 }}>Rule tags</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {RULE_TAGS.map((tag) => (
              <label key={tag} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32 }}>
                <input
                  type="checkbox"
                  aria-label={`Tag ${tag}`}
                  checked={selectedTags.includes(tag)}
                  onChange={() => setSelectedTags((prev) => toggleInList(prev, tag))}
                />
                {tag}
              </label>
            ))}
          </div>
        </div>

        <div style={{ ...compactGridStyle, marginTop: 10 }}>
          <HigField label="Review after matches" help="Optional. Show a review-due marker after this note has matched the same number of future draw contexts.">
            <input
              aria-label="Review after matches"
              value={reviewAfterMatches}
              onChange={(event) => setReviewAfterMatches(event.target.value)}
              inputMode="numeric"
              placeholder="3"
            />
          </HigField>
          <HigField label="Outcome notes">
            <input
              aria-label="Outcome notes"
              value={outcomeNotes}
              onChange={(event) => setOutcomeNotes(event.target.value)}
              placeholder="Optional short follow-up"
            />
          </HigField>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
          <HigButton variant="primary" onClick={handleSave}>{editingEntry ? "Update diary note" : "Save diary note"}</HigButton>
          <HigButton variant="quiet" onClick={resetForm}>{editingEntry ? "Cancel edit" : "Clear"}</HigButton>
          {message ? <span role="status" style={{ color: "#51606f", fontWeight: 700 }}>{message}</span> : null}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <strong style={{ color: "#17202a" }}>Journal entries</strong>
          <span style={chipStyle("neutral")}>{entries.filter((entry) => !entry.archived).length} active</span>
        </div>
        {entries.filter((entry) => !entry.archived).length === 0 ? (
          <p style={{ color: "#657385" }}>No diary entries yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {entries.filter((entry) => !entry.archived).map((entry) => (
              <details key={entry.id} style={cardStyle}>
                <summary style={{ cursor: "pointer", fontWeight: 800, color: "#17202a" }}>
                  {entry.title}
                  <span style={{ marginLeft: 8, color: "#657385", fontSize: 12 }}>
                    {statusLabel(entry.evidenceStatus)}
                  </span>
                </summary>
                <p style={{ color: "#51606f", margin: "8px 0" }}>{entry.observation || "No observation text saved."}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {entry.appliesTo.drawOrdinals?.map((ordinal) => <span key={`d-${ordinal}`} style={chipStyle("green")}>D{ordinal}</span>)}
                  {entry.appliesTo.weekdays?.map((weekday) => <span key={weekday} style={chipStyle("green")}>{weekday}</span>)}
                  {entry.appliesTo.monthPhases?.map((phase) => <span key={phase} style={chipStyle("green")}>{phase}</span>)}
                  {entry.appliesTo.monthDrawCounts?.map((count) => <span key={count} style={chipStyle("green")}>{count}-draw month</span>)}
                  {entry.ruleTags.map((tag) => <span key={tag} style={chipStyle("amber")}>{tag}</span>)}
                  {entry.setupSummary ? <span style={chipStyle("neutral")}>Saved setup</span> : null}
                </div>
                {entry.setupSummary ? (
                  <div style={{ borderTop: "1px solid #edf1f5", paddingTop: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: "#657385", fontWeight: 800, marginBottom: 4 }}>Saved setup</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {previewSetupLines(entry).map((line) => <span key={line} style={chipStyle("neutral")}>{line}</span>)}
                    </div>
                  </div>
                ) : null}
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ color: "#657385", fontSize: 12 }}>
                    Created {entry.createdAt} · Outcome {entry.outcome}
                  </span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <HigButton variant="secondary" size="compact" onClick={() => fillFormFromEntry(entry)}>Edit</HigButton>
                    <HigButton variant="quiet" size="compact" onClick={() => handleArchive(entry)}>Archive</HigButton>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

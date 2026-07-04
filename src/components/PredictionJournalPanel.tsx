import React, { useEffect, useMemo, useState } from "react";

import { HigButton, HigField, InfoHelp } from "./shared/HigControls";
import type { Draw } from "../types";
import type { AppPresetSnapshot } from "../lib/presets";
import {
  buildPredictionJournalEntry,
  canEditPredictionJournalEntry,
  loadPredictionJournalEntries,
  normalizePredictionJournalInputs,
  parsePredictionJournalDate,
  savePredictionJournalEntries,
  scorePredictionJournalEntry,
  type PredictionBucketKey,
  type PredictionJournalEntry,
  type PredictionJournalInputs,
  type PredictionJournalStatus,
  type PredictionScoreResult,
  type PredictionTargetKind,
} from "../lib/predictionJournal";

export interface PredictionJournalPanelProps {
  history: Draw[];
  initialEntries?: PredictionJournalEntry[];
  now?: () => string;
  getSetupSnapshot?: () => AppPresetSnapshot | undefined;
}

type BucketTextState = Record<PredictionBucketKey, string>;

const BUCKET_FIELDS: Array<{ key: PredictionBucketKey; label: string }> = [
  { key: "undrawn", label: "Undrawn" },
  { key: "times1", label: "1x" },
  { key: "times2", label: "2x" },
  { key: "times3", label: "3x" },
  { key: "times4", label: "4x" },
  { key: "times5", label: "5x" },
  { key: "times6", label: "6x" },
  { key: "times7", label: "7x" },
  { key: "times8", label: "8x+" },
];

const emptyBuckets = (): BucketTextState => ({
  undrawn: "",
  times1: "",
  times2: "",
  times3: "",
  times4: "",
  times5: "",
  times6: "",
  times7: "",
  times8: "",
});

const targetLabels: Record<PredictionTargetKind, string> = {
  nextDraw: "Next draw",
  next3Draws: "Next 3 draws",
  restOfMonth: "Rest of current month",
};

const statusLabels = {
  scored: "Scored",
  pending: "Pending",
  locked: "Locked",
  void: "Void",
} as const;

const statusPillStyle = (status: PredictionJournalStatus): React.CSSProperties => ({
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 12,
  fontWeight: 800,
  background: status === "scored" ? "#e8f5e9" : status === "pending" ? "#eef6ff" : "#fff4e5",
  color: status === "scored" ? "#1b5e20" : status === "pending" ? "#155a8a" : "#8a4b00",
});

const scoreResultPillStyle = (result: PredictionScoreResult): React.CSSProperties => {
  const palette: Record<PredictionScoreResult, { background: string; color: string; border: string }> = {
    hit: { background: "#e8f5e9", color: "#1b5e20", border: "#bbdfc0" },
    partial: { background: "#fff7ed", color: "#9a3412", border: "#fed7aa" },
    miss: { background: "#fff1f2", color: "#991b1b", border: "#fecaca" },
    recorded: { background: "#eef6ff", color: "#155a8a", border: "#cfe3f7" },
  };
  const colors = palette[result];
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "fit-content",
    border: `1px solid ${colors.border}`,
    borderRadius: 999,
    padding: "2px 8px",
    background: colors.background,
    color: colors.color,
    fontSize: 12,
    fontWeight: 800,
    textTransform: "capitalize",
  };
};

const scoreResultLabel = (result: PredictionScoreResult): string => (
  result.charAt(0).toUpperCase() + result.slice(1)
);

type ImmediateNextDrawScore = {
  actual: string;
  date: string;
  detail: string;
  hitCount: number;
  hits: number[];
  predicted: string;
  predictedCount: number;
  result: Exclude<PredictionScoreResult, "recorded">;
};

const domSafeId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, "-");

const summarizePredictionInputs = (entry: PredictionJournalEntry): string[] => {
  const inputs = entry.inputs;
  const parts: string[] = [];
  if (inputs.oddEvenRatio) parts.push(`O/E ${inputs.oddEvenRatio}`);
  if (inputs.numbers?.length) parts.push(`${inputs.numbers.length} numbers`);
  if (inputs.terminalDigits?.length) parts.push(`${inputs.terminalDigits.length} terminal digits`);
  if (inputs.monthlyBuckets && Object.keys(inputs.monthlyBuckets).length > 0) parts.push("bucket mix");
  if (inputs.singleDouble) parts.push("single/double");
  if (inputs.sumRange) parts.push("sum range");
  if (inputs.trendRatio) parts.push(`U/D/F ${inputs.trendRatio}`);
  if (inputs.previousRepeatCount !== undefined) parts.push(`repeats ${inputs.previousRepeatCount}`);
  if (inputs.previousNeighbourHitCount !== undefined) parts.push(`± hits ${inputs.previousNeighbourHitCount}`);
  if (inputs.droughtBreakCount !== undefined) parts.push(`drought ${inputs.droughtBreakCount}`);
  if (inputs.carryOverCount !== undefined) parts.push(`carry-over ${inputs.carryOverCount}`);
  if (inputs.confidence !== undefined) parts.push(`confidence ${inputs.confidence}`);
  if (entry.setupSummary) parts.push("Saved setup");
  if (inputs.notes) parts.push("notes");
  return parts;
};

const summarizeScoreResults = (entry: { scores: Array<{ result: string }> }): string => {
  if (entry.scores.length === 0) return "Awaiting score";
  const counts = entry.scores.reduce<Record<string, number>>((next, score) => {
    next[score.result] = (next[score.result] ?? 0) + 1;
    return next;
  }, {});
  const resultParts = [
    counts.hit ? `${counts.hit} hit` : "",
    counts.partial ? `${counts.partial} partial` : "",
    counts.miss ? `${counts.miss} miss` : "",
    counts.recorded ? `${counts.recorded} recorded` : "",
  ].filter(Boolean);
  return `${entry.scores.length} checks${resultParts.length ? `: ${resultParts.join(" / ")}` : ""}`;
};

const summarizeTargetDrawDate = (entry: { targetDraws?: Draw[] }): string | null => {
  const targetDraws = entry.targetDraws ?? [];
  if (targetDraws.length === 0) return null;
  const firstDate = targetDraws[0]?.date;
  const lastDate = targetDraws[targetDraws.length - 1]?.date;
  if (!firstDate) return null;
  if (!lastDate || firstDate === lastDate) return firstDate;
  return `${firstDate} to ${lastDate}`;
};

const scoreImmediateNextDraw = (entry: { inputs: PredictionJournalInputs; targetDraws?: Draw[] }): ImmediateNextDrawScore | null => {
  const predicted = entry.inputs.numbers ?? [];
  const nextDraw = entry.targetDraws?.[0];
  if (!nextDraw || predicted.length === 0) return null;

  const actualNumbers = [...nextDraw.main, ...nextDraw.supp].filter((number) => Number.isFinite(number));
  const actualSet = new Set(actualNumbers);
  const hits = predicted.filter((number) => actualSet.has(number));
  const result: ImmediateNextDrawScore["result"] = hits.length === predicted.length
    ? "hit"
    : hits.length > 0
      ? "partial"
      : "miss";

  return {
    actual: actualNumbers.join(", "),
    date: nextDraw.date,
    detail: hits.length ? `Hits: ${hits.join(", ")}` : "No saved numbers appeared in the immediate next draw.",
    hitCount: hits.length,
    hits,
    predicted: predicted.join(", "),
    predictedCount: predicted.length,
    result,
  };
};

const splitNumbers = (value: string): number[] => (
  (value.match(/\d+/g) ?? []).map((part) => Number(part)).filter((number) => Number.isFinite(number))
);

const splitSignedNumbers = (value: string): number[] => (
  (value.match(/-?\d+(?:\.\d+)?/g) ?? []).map((part) => Number(part)).filter((number) => Number.isFinite(number))
);

const numberText = (numbers: number[] | undefined): string => numbers?.join(", ") ?? "";

const latestRealDraw = (history: Draw[]): Draw | null => {
  const ordered = history
    .map((draw, index) => ({ draw, index, time: parsePredictionJournalDate(draw.date) }))
    .filter((row): row is { draw: Draw; index: number; time: number } => !row.draw.isSimulated && row.time !== null)
    .sort((a, b) => (b.time - a.time) || (b.index - a.index));
  return ordered[0]?.draw ?? null;
};

const integerOrUndefined = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
};

const targetKindFromValue = (value: string): PredictionTargetKind => {
  if (value === "next3Draws" || value === "restOfMonth") return value;
  return "nextDraw";
};

const targetNumberLimit = (targetKind: PredictionTargetKind): number | null => {
  if (targetKind === "nextDraw") return 8;
  if (targetKind === "next3Draws") return 24;
  return null;
};

const targetDrawCount = (targetKind: PredictionTargetKind): number | null => {
  if (targetKind === "nextDraw") return 1;
  if (targetKind === "next3Draws") return 3;
  return null;
};

const hasDecimalText = (value: string): boolean => /-?\d+\.\d+/.test(value);

const validateNonNegativeIntegerText = (label: string, value: string): string | null => {
  if (!value.trim()) return null;
  if (hasDecimalText(value) || !/^\s*\d+\s*$/.test(value)) return `${label} must be a whole number.`;
  return null;
};

const normalizeTerminalDigit = (number: number): number => (number <= 9 ? number : number % 10);
const maxUniqueDrawSum = (drawCount: number): number => 332 * drawCount;
const minUniqueDrawSum = (drawCount: number): number => 36 * drawCount;

export const PredictionJournalPanel: React.FC<PredictionJournalPanelProps> = ({
  history,
  initialEntries,
  now = () => new Date().toISOString(),
  getSetupSnapshot,
}) => {
  const [entries, setEntries] = useState<PredictionJournalEntry[]>(() => (
    initialEntries ?? (typeof window === "undefined" ? [] : loadPredictionJournalEntries())
  ));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [targetKind, setTargetKind] = useState<PredictionTargetKind>("nextDraw");
  const [oddEvenRatio, setOddEvenRatio] = useState("");
  const [numbersText, setNumbersText] = useState("");
  const [terminalDigitsText, setTerminalDigitsText] = useState("");
  const [bucketText, setBucketText] = useState<BucketTextState>(() => emptyBuckets());
  const [singleText, setSingleText] = useState("");
  const [doubleText, setDoubleText] = useState("");
  const [sumMinText, setSumMinText] = useState("");
  const [sumMaxText, setSumMaxText] = useState("");
  const [trendRatio, setTrendRatio] = useState("");
  const [previousRepeatCount, setPreviousRepeatCount] = useState("");
  const [previousNeighbourHitCount, setPreviousNeighbourHitCount] = useState("");
  const [droughtBreakCount, setDroughtBreakCount] = useState("");
  const [carryOverCount, setCarryOverCount] = useState("");
  const [confidence, setConfidence] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  const hasControlledInitialEntries = initialEntries !== undefined;
  const latestDraw = useMemo(() => latestRealDraw(history), [history]);
  const scoredEntries = useMemo(
    () => entries.map((entry) => scorePredictionJournalEntry(entry, history)),
    [entries, history],
  );
  const editingEntry = useMemo(
    () => entries.find((entry) => entry.id === editingId) ?? null,
    [editingId, entries],
  );

  useEffect(() => {
    if (hasControlledInitialEntries) return;
    setEntries(loadPredictionJournalEntries());
  }, [hasControlledInitialEntries]);

  useEffect(() => {
    if (hasControlledInitialEntries || typeof window === "undefined") return;
    savePredictionJournalEntries(entries);
  }, [entries, hasControlledInitialEntries]);

  const formInputs = useMemo<PredictionJournalInputs>(() => {
    const monthlyBuckets: PredictionJournalInputs["monthlyBuckets"] = {};
    for (const field of BUCKET_FIELDS) {
      const value = integerOrUndefined(bucketText[field.key]);
      if (value !== undefined) monthlyBuckets[field.key] = value;
    }

    return normalizePredictionJournalInputs({
      oddEvenRatio,
      numbers: splitNumbers(numbersText),
      terminalDigits: splitNumbers(terminalDigitsText),
      monthlyBuckets,
      singleDouble: {
        single: integerOrUndefined(singleText),
        double: integerOrUndefined(doubleText),
      },
      sumRange: {
        min: integerOrUndefined(sumMinText),
        max: integerOrUndefined(sumMaxText),
      },
      trendRatio,
      previousRepeatCount: integerOrUndefined(previousRepeatCount),
      previousNeighbourHitCount: integerOrUndefined(previousNeighbourHitCount),
      droughtBreakCount: integerOrUndefined(droughtBreakCount),
      carryOverCount: integerOrUndefined(carryOverCount),
      confidence: integerOrUndefined(confidence),
      notes,
    });
  }, [
    bucketText,
    carryOverCount,
    confidence,
    doubleText,
    droughtBreakCount,
    notes,
    numbersText,
    oddEvenRatio,
    previousNeighbourHitCount,
    previousRepeatCount,
    singleText,
    sumMaxText,
    sumMinText,
    terminalDigitsText,
    trendRatio,
  ]);

  const hasPredictionContent = Object.keys(formInputs).length > 0;

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    const numberLimit = targetNumberLimit(targetKind);
    const drawCount = targetDrawCount(targetKind);

    if (oddEvenRatio.trim()) {
      const match = oddEvenRatio.trim().match(/^(\d+)\s*:\s*(\d+)$/);
      if (!match) {
        errors.push("Odd/even ratio must use the format odd:even, for example 2:6.");
      } else {
        const odd = Number(match[1]);
        const even = Number(match[2]);
        const total = odd + even;
        if (numberLimit !== null && total !== numberLimit) {
          errors.push(`Odd/even ratio must total ${numberLimit}.`);
        } else if (numberLimit === null && total <= 0) {
          errors.push("Odd/even ratio must include at least one draw number.");
        }
      }
    }

    const rawNumbers = splitSignedNumbers(numbersText);
    const uniqueNumbers = new Set(rawNumbers);
    if (rawNumbers.some((number) => !Number.isInteger(number) || number < 1 || number > 45)) {
      errors.push("Numbers must be whole values from 1 to 45.");
    }
    const numberFieldLimit = numberLimit ?? 45;
    if (uniqueNumbers.size > numberFieldLimit) {
      errors.push(`Numbers can include at most ${numberFieldLimit} unique numbers for this target window.`);
    }

    const rawTerminalDigits = splitSignedNumbers(terminalDigitsText);
    if (rawTerminalDigits.some((number) => !Number.isInteger(number) || number < 0 || number > 45)) {
      errors.push("Terminal digit entries must be whole values from 0 to 45.");
    }
    const uniqueTerminalDigits = new Set(rawTerminalDigits.filter((number) => Number.isInteger(number) && number >= 0 && number <= 45).map(normalizeTerminalDigit));
    const terminalDigitLimit = numberLimit === null ? 10 : Math.min(10, numberLimit);
    if (uniqueTerminalDigits.size > terminalDigitLimit) {
      errors.push(`Terminal digits can include at most ${terminalDigitLimit} unique digits for this target window.`);
    }

    let bucketTotal = 0;
    for (const field of BUCKET_FIELDS) {
      const error = validateNonNegativeIntegerText(field.label, bucketText[field.key]);
      if (error) errors.push(error);
      bucketTotal += integerOrUndefined(bucketText[field.key]) ?? 0;
    }
    if (numberLimit !== null && bucketTotal > numberLimit) {
      errors.push(`Monthly bucket mix cannot total more than ${numberLimit} for this target window.`);
    }

    const singleError = validateNonNegativeIntegerText("Single-digit count", singleText);
    const doubleError = validateNonNegativeIntegerText("Double-digit count", doubleText);
    if (singleError) errors.push(singleError);
    if (doubleError) errors.push(doubleError);
    const singleDoubleTotal = (integerOrUndefined(singleText) ?? 0) + (integerOrUndefined(doubleText) ?? 0);
    if (numberLimit !== null && singleDoubleTotal > numberLimit) {
      errors.push(`Single/double digit counts cannot total more than ${numberLimit}.`);
    }

    const sumMinError = validateNonNegativeIntegerText("Sum min", sumMinText);
    const sumMaxError = validateNonNegativeIntegerText("Sum max", sumMaxText);
    if (sumMinError) errors.push(sumMinError);
    if (sumMaxError) errors.push(sumMaxError);
    const sumMin = integerOrUndefined(sumMinText);
    const sumMax = integerOrUndefined(sumMaxText);
    if (sumMin !== undefined && sumMax !== undefined && sumMin > sumMax) {
      errors.push("Sum min cannot be greater than sum max.");
    }
    if (drawCount !== null) {
      const minPossible = minUniqueDrawSum(drawCount);
      const maxPossible = maxUniqueDrawSum(drawCount);
      if (sumMin !== undefined && sumMin > maxPossible) errors.push(`Sum min cannot exceed ${maxPossible} for this target window.`);
      if (sumMax !== undefined && sumMax < minPossible) errors.push(`Sum max cannot be below ${minPossible} for this target window.`);
    }

    const boundedCountFields: Array<[string, string]> = [
      ["Repeat count", previousRepeatCount],
      ["+/- count", previousNeighbourHitCount],
      ["Drought count", droughtBreakCount],
      ["Carry-over count", carryOverCount],
    ];
    for (const [label, value] of boundedCountFields) {
      const error = validateNonNegativeIntegerText(label, value);
      if (error) errors.push(error);
      const count = integerOrUndefined(value);
      if (numberLimit !== null && count !== undefined && count > numberLimit) {
        errors.push(`${label} cannot exceed ${numberLimit} for this target window.`);
      }
    }

    const confidenceError = validateNonNegativeIntegerText("Confidence", confidence);
    if (confidenceError) errors.push(confidenceError);
    const confidenceValue = integerOrUndefined(confidence);
    if (confidenceValue !== undefined && confidenceValue > 100) {
      errors.push("Confidence cannot exceed 100.");
    }

    return Array.from(new Set(errors));
  }, [
    bucketText,
    carryOverCount,
    confidence,
    doubleText,
    droughtBreakCount,
    numbersText,
    oddEvenRatio,
    previousNeighbourHitCount,
    previousRepeatCount,
    singleText,
    sumMaxText,
    sumMinText,
    targetKind,
    terminalDigitsText,
  ]);

  const resetForm = () => {
    setEditingId(null);
    setTargetKind("nextDraw");
    setOddEvenRatio("");
    setNumbersText("");
    setTerminalDigitsText("");
    setBucketText(emptyBuckets());
    setSingleText("");
    setDoubleText("");
    setSumMinText("");
    setSumMaxText("");
    setTrendRatio("");
    setPreviousRepeatCount("");
    setPreviousNeighbourHitCount("");
    setDroughtBreakCount("");
    setCarryOverCount("");
    setConfidence("");
    setNotes("");
    setShowValidationErrors(false);
  };

  const fillFormFromEntry = (entry: PredictionJournalEntry) => {
    const inputs = entry.inputs;
    setEditingId(entry.id);
    setTargetKind(entry.targetKind);
    setOddEvenRatio(inputs.oddEvenRatio ?? "");
    setNumbersText(numberText(inputs.numbers));
    setTerminalDigitsText(numberText(inputs.terminalDigits));
    const nextBuckets = emptyBuckets();
    for (const field of BUCKET_FIELDS) {
      nextBuckets[field.key] = inputs.monthlyBuckets?.[field.key] === undefined
        ? ""
        : String(inputs.monthlyBuckets[field.key]);
    }
    setBucketText(nextBuckets);
    setSingleText(inputs.singleDouble?.single === undefined ? "" : String(inputs.singleDouble.single));
    setDoubleText(inputs.singleDouble?.double === undefined ? "" : String(inputs.singleDouble.double));
    setSumMinText(inputs.sumRange?.min === undefined ? "" : String(inputs.sumRange.min));
    setSumMaxText(inputs.sumRange?.max === undefined ? "" : String(inputs.sumRange.max));
    setTrendRatio(inputs.trendRatio ?? "");
    setPreviousRepeatCount(inputs.previousRepeatCount === undefined ? "" : String(inputs.previousRepeatCount));
    setPreviousNeighbourHitCount(inputs.previousNeighbourHitCount === undefined ? "" : String(inputs.previousNeighbourHitCount));
    setDroughtBreakCount(inputs.droughtBreakCount === undefined ? "" : String(inputs.droughtBreakCount));
    setCarryOverCount(inputs.carryOverCount === undefined ? "" : String(inputs.carryOverCount));
    setConfidence(inputs.confidence === undefined ? "" : String(inputs.confidence));
    setNotes(inputs.notes ?? "");
    setMessage(`Editing prediction anchored to ${entry.anchorLatestDrawDate}.`);
  };

  const handleSave = () => {
    if (!latestDraw && !editingEntry) {
      setMessage("A real latest draw is needed before a prediction can be anchored.");
      return;
    }
    if (validationErrors.length > 0) {
      setShowValidationErrors(true);
      setMessage("Fix the highlighted journal values before saving.");
      return;
    }
    if (!hasPredictionContent) {
      setMessage("Add a note or one optional prediction value before saving.");
      return;
    }
    if (editingEntry && !canEditPredictionJournalEntry(editingEntry, history)) {
      setMessage("This entry is locked because its target draw has arrived.");
      return;
    }

    const nextEntry = buildPredictionJournalEntry({
      previousEntry: editingEntry ?? undefined,
      latestDraw: latestDraw ?? history[history.length - 1],
      targetKind,
      inputs: formInputs,
      setupSnapshot: getSetupSnapshot?.() ?? editingEntry?.setupSnapshot,
      now: now(),
    });

    setEntries((prev) => {
      const withoutExisting = prev.filter((entry) => entry.id !== nextEntry.id);
      return [nextEntry, ...withoutExisting];
    });
    resetForm();
    setMessage(editingEntry ? "Prediction updated." : "Prediction saved.");
  };

  const handleDelete = (entry: PredictionJournalEntry) => {
    if (!canEditPredictionJournalEntry(entry, history)) {
      setMessage("Locked entries stay in the journal once their target draw has arrived.");
      return;
    }
    setEntries((prev) => prev.filter((item) => item.id !== entry.id));
    if (editingId === entry.id) resetForm();
    if (expandedEntryId === entry.id) setExpandedEntryId(null);
    setMessage("Pending prediction removed.");
  };

  const handleExport = () => {
    if (typeof document === "undefined" || typeof URL === "undefined") return;
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "windfall-prediction-journal.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Prediction journal exported.");
  };

  return (
    <section className="windfall-ledger-panel" aria-label="Prediction Journal & Scorecard">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, color: "#51606f", maxWidth: 780 }}>
            Record your own draw hypotheses, then let Windfall score them only after real target draws arrive.
            No prediction fields are required; notes-only entries are allowed.
          </p>
        </div>
        <InfoHelp label="Prediction Journal help">
          The journal is observe-only. Entries are anchored to the latest real draw when saved, can be edited before the first target draw arrives, and lock once scoring has begun.
        </InfoHelp>
      </div>

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
          alignItems: "start",
        }}
      >
        <div style={{ padding: 10, border: "1px solid #dbe3ec", borderRadius: 8, background: "#f8fafc" }}>
          <div style={{ fontSize: 12, color: "#657385" }}>Anchor latest draw</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1f2937" }}>{latestDraw?.date ?? "No real draw loaded"}</div>
          <div style={{ fontSize: 12, color: "#657385" }}>
            {latestDraw ? [...latestDraw.main, ...latestDraw.supp].join(", ") : "Load real draw history before saving."}
          </div>
        </div>
        <HigField label="Target window">
          <select value={targetKind} onChange={(event) => setTargetKind(targetKindFromValue(event.target.value))}>
            <option value="nextDraw">Next draw</option>
            <option value="next3Draws">Next 3 draws</option>
            <option value="restOfMonth">Rest of current month</option>
          </select>
        </HigField>
        <HigField label="Odd/even ratio" help="Optional. Use mains + supps format, for example 2:6.">
          <input value={oddEvenRatio} onChange={(event) => setOddEvenRatio(event.target.value)} placeholder="2:6" />
        </HigField>
        <HigField label="Confidence" help="Optional 0-100 self-rating, stored for future calibration.">
          <input value={confidence} onChange={(event) => setConfidence(event.target.value)} inputMode="numeric" placeholder="65" />
        </HigField>
      </div>

      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
        }}
      >
        <HigField label="Numbers" help="Optional. Paste exact numbers or a shortlist; punctuation is fine.">
          <textarea
            value={numbersText}
            onChange={(event) => setNumbersText(event.target.value)}
            rows={3}
            placeholder="12, 14, 22, 27"
          />
        </HigField>
        <HigField label="Terminal digits" help="Optional. 12 is accepted as terminal digit 2.">
          <textarea
            value={terminalDigitsText}
            onChange={(event) => setTerminalDigitsText(event.target.value)}
            rows={3}
            placeholder="1, 4, 9"
          />
        </HigField>
        <HigField label="Notes" help="Optional. Record your reasoning while it is fresh.">
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="Why this looked plausible before the draw..."
          />
        </HigField>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        <div style={{ border: "1px solid #e1e7ef", borderRadius: 8, padding: 10 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Monthly bucket mix</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(58px, 1fr))", gap: 8 }}>
            {BUCKET_FIELDS.map((field) => (
              <label key={field.key} style={{ display: "grid", gap: 3, fontSize: 12, fontWeight: 700, color: "#51606f" }}>
                {field.label}
                <input
                  value={bucketText[field.key]}
                  onChange={(event) => setBucketText((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  inputMode="numeric"
                  style={{ minWidth: 0 }}
                />
              </label>
            ))}
          </div>
        </div>
        <div style={{ border: "1px solid #e1e7ef", borderRadius: 8, padding: 10 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Shape checks</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(90px, 1fr))", gap: 8 }}>
            <HigField label="Single-digit">
              <input value={singleText} onChange={(event) => setSingleText(event.target.value)} inputMode="numeric" />
            </HigField>
            <HigField label="Double-digit">
              <input value={doubleText} onChange={(event) => setDoubleText(event.target.value)} inputMode="numeric" />
            </HigField>
            <HigField label="Sum min">
              <input value={sumMinText} onChange={(event) => setSumMinText(event.target.value)} inputMode="numeric" />
            </HigField>
            <HigField label="Sum max">
              <input value={sumMaxText} onChange={(event) => setSumMaxText(event.target.value)} inputMode="numeric" />
            </HigField>
          </div>
        </div>
        <div style={{ border: "1px solid #e1e7ef", borderRadius: 8, padding: 10 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Recorded diagnostics</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(100px, 1fr))", gap: 8 }}>
            <HigField label="U/D/F ratio">
              <input value={trendRatio} onChange={(event) => setTrendRatio(event.target.value)} placeholder="3/2/3" />
            </HigField>
            <HigField label="Repeat count">
              <input value={previousRepeatCount} onChange={(event) => setPreviousRepeatCount(event.target.value)} inputMode="numeric" />
            </HigField>
            <HigField label="±1/±2 count">
              <input value={previousNeighbourHitCount} onChange={(event) => setPreviousNeighbourHitCount(event.target.value)} inputMode="numeric" />
            </HigField>
            <HigField label="Drought count">
              <input value={droughtBreakCount} onChange={(event) => setDroughtBreakCount(event.target.value)} inputMode="numeric" />
            </HigField>
            <HigField label="Carry-over count">
              <input value={carryOverCount} onChange={(event) => setCarryOverCount(event.target.value)} inputMode="numeric" />
            </HigField>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <HigButton variant="primary" onClick={handleSave} disabled={!latestDraw && !editingEntry}>
          {editingId ? "Update prediction" : "Save prediction"}
        </HigButton>
        <HigButton variant="quiet" onClick={resetForm}>Clear form</HigButton>
        <HigButton variant="secondary" onClick={handleExport} disabled={entries.length === 0}>Export JSON</HigButton>
        {message ? <span role="status" style={{ fontSize: 12, color: "#51606f" }}>{message}</span> : null}
      </div>

      {showValidationErrors && validationErrors.length > 0 ? (
        <div
          role="alert"
          style={{
            marginTop: 10,
            border: "1px solid #fecaca",
            borderRadius: 8,
            background: "#fff1f2",
            color: "#991b1b",
            padding: 10,
            fontSize: 12,
          }}
        >
          <strong>Journal entry check</strong>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {validationErrors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </div>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <h4 style={{ margin: "0 0 8px", fontSize: 15 }}>Journal entries</h4>
        {scoredEntries.length === 0 ? (
          <div style={{ padding: 14, border: "1px dashed #cbd5e1", borderRadius: 8, color: "#657385" }}>
            No journal entries yet.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, maxHeight: "min(560px, 62vh)", overflowY: "auto", paddingRight: 2 }}>
            {scoredEntries.map((entry) => {
                const isExpanded = expandedEntryId === entry.id;
                const detailId = `prediction-journal-entry-${domSafeId(entry.id)}`;
                const inputSummary = summarizePredictionInputs(entry);
                const scoreSummary = summarizeScoreResults(entry);
                const targetDrawDate = summarizeTargetDrawDate(entry);
                const immediateNextDrawScore = scoreImmediateNextDraw(entry);
                return (
                  <article key={entry.id} style={{ border: "1px solid #dbe3ec", borderRadius: 8, background: "#fff", overflow: "hidden" }}>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={detailId}
                      onClick={() => setExpandedEntryId((current) => current === entry.id ? null : entry.id)}
                      style={{
                        width: "100%",
                        minHeight: 44,
                        border: 0,
                        background: isExpanded ? "#f8fafc" : "#fff",
                        padding: "9px 12px",
                        display: "grid",
                        gridTemplateColumns: "auto minmax(0, 1fr) auto",
                        gap: 10,
                        alignItems: "center",
                        textAlign: "left",
                        cursor: "pointer",
                        color: "#26313d",
                        font: "inherit",
                      }}
                    >
                      <span aria-hidden="true" style={{ color: "#526477", fontSize: 14, width: 14 }}>{isExpanded ? "▾" : "▸"}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <span style={{ fontWeight: 800 }}>{targetLabels[entry.targetKind]}</span>
                          {targetDrawDate ? <span style={{ color: "#475569", fontSize: 12, fontWeight: 800 }}>{targetDrawDate}</span> : null}
                          <span style={statusPillStyle(entry.status)}>{statusLabels[entry.status]}</span>
                          <span style={{ color: "#657385", fontSize: 12 }}>
                            Anchored after {entry.anchorLatestDrawDate} · revision {entry.revision}
                          </span>
                        </span>
                        <span style={{ display: "block", marginTop: 2, color: "#51606f", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {scoreSummary}
                          {inputSummary.length ? ` · ${inputSummary.join(" · ")}` : ""}
                          {entry.canEdit ? " · Editable until first target draw appears" : " · Locked after target draw arrived"}
                        </span>
                      </span>
                      <span style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>{isExpanded ? "Hide" : "Open"}</span>
                    </button>
                    {isExpanded ? (
                      <div id={detailId} style={{ borderTop: "1px solid #e2e8f0", padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                          <div style={{ fontSize: 12, color: "#657385" }}>
                            Anchored after {entry.anchorLatestDrawDate} · revision {entry.revision} · {entry.canEdit ? "Editable until first target draw appears" : "Locked after target draw arrived"}
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            {entry.canEdit ? (
                              <>
                                <HigButton size="compact" variant="secondary" onClick={() => fillFormFromEntry(entry)}>Edit prediction</HigButton>
                                <HigButton size="compact" variant="danger" onClick={() => handleDelete(entry)}>Delete</HigButton>
                              </>
                            ) : null}
                          </div>
                        </div>
                        {entry.inputs.notes ? (
                          <p style={{ margin: "8px 0 0", color: "#334155", fontSize: 13 }}>{entry.inputs.notes}</p>
                        ) : null}
                        {entry.setupSummary ? (
                          <div style={{ marginTop: 10, border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, background: "#f8fafc" }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: "#334155", marginBottom: 6 }}>Saved setup</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {[
                                entry.setupSummary.window,
                                `Odd/even ratios: ${entry.setupSummary.oddEvenRatios}`,
                                ...entry.setupSummary.generation,
                                ...entry.setupSummary.filters,
                                ...entry.setupSummary.selections,
                              ].map((line) => (
                                <span
                                  key={line}
                                  style={{
                                    border: "1px solid #dbe3ec",
                                    borderRadius: 999,
                                    padding: "2px 8px",
                                    background: "#fff",
                                    color: "#475569",
                                    fontSize: 12,
                                    fontWeight: 700,
                                  }}
                                >
                                  {line}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {entry.reason ? <div style={{ marginTop: 8, color: "#8a4b00", fontSize: 12 }}>{entry.reason}</div> : null}
                        {immediateNextDrawScore ? (
                          <section
                            data-testid="prediction-immediate-next-draw"
                            aria-label="Immediate next draw score"
                            style={{
                              marginTop: 10,
                              border: "1px solid #dbe3ec",
                              borderRadius: 8,
                              padding: 10,
                              background: "#fff",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                              <div>
                                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>Immediate next draw</div>
                                <div style={{ fontSize: 17, fontWeight: 850, color: "#26313d", marginTop: 2 }}>
                                  {immediateNextDrawScore.hitCount} of {immediateNextDrawScore.predictedCount} matched
                                </div>
                                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                                  {immediateNextDrawScore.date} · matched against next draw mains + supps
                                </div>
                              </div>
                              <span style={scoreResultPillStyle(immediateNextDrawScore.result)}>
                                {scoreResultLabel(immediateNextDrawScore.result)}
                              </span>
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                                gap: 8,
                                marginTop: 10,
                                fontSize: 12,
                              }}
                            >
                              <div>
                                <div style={{ color: "#64748b", fontWeight: 800, marginBottom: 2 }}>Saved numbers</div>
                                <div style={{ color: "#26313d", overflowWrap: "anywhere" }}>{immediateNextDrawScore.predicted}</div>
                              </div>
                              <div>
                                <div style={{ color: "#64748b", fontWeight: 800, marginBottom: 2 }}>Actual next draw</div>
                                <div style={{ color: "#26313d", overflowWrap: "anywhere" }}>{immediateNextDrawScore.actual}</div>
                              </div>
                              <div>
                                <div style={{ color: "#64748b", fontWeight: 800, marginBottom: 2 }}>Outcome</div>
                                <div style={{ color: "#26313d", overflowWrap: "anywhere" }}>{immediateNextDrawScore.detail}</div>
                              </div>
                            </div>
                          </section>
                        ) : null}
                        {entry.scores.length ? (
                          <div
                            data-testid="prediction-scorecard-grid"
                            role="list"
                            aria-label="Prediction scorecard checks"
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                              gap: 8,
                              marginTop: 10,
                            }}
                          >
                            {entry.scores.map((score) => (
                              <section
                                key={score.key}
                                data-testid="prediction-scorecard-tile"
                                role="listitem"
                                aria-label={`${score.label} scorecard`}
                                style={{
                                  border: "1px solid #e2e8f0",
                                  borderRadius: 8,
                                  padding: 10,
                                  background: "#f8fafc",
                                  minWidth: 0,
                                }}
                              >
                                <div style={{ fontWeight: 850, color: "#26313d", marginBottom: 8, fontSize: 13 }}>
                                  {score.label}
                                </div>
                                <div style={{ display: "grid", gap: 7, fontSize: 12 }}>
                                  <div>
                                    <div style={{ color: "#64748b", fontWeight: 800, marginBottom: 2 }}>Predicted</div>
                                    <div style={{ color: "#26313d", overflowWrap: "anywhere" }}>{score.predicted}</div>
                                  </div>
                                  <div>
                                    <div style={{ color: "#64748b", fontWeight: 800, marginBottom: 2 }}>Actual</div>
                                    <div style={{ color: "#26313d", overflowWrap: "anywhere" }}>{score.actual}</div>
                                    {score.detail ? <div style={{ color: "#64748b", marginTop: 3, overflowWrap: "anywhere" }}>{score.detail}</div> : null}
                                  </div>
                                  <div>
                                    <div style={{ color: "#64748b", fontWeight: 800, marginBottom: 3 }}>Result</div>
                                    <span style={scoreResultPillStyle(score.result)}>{scoreResultLabel(score.result)}</span>
                                  </div>
                                </div>
                              </section>
                            ))}
                          </div>
                        ) : (
                          <div style={{ marginTop: 8, color: "#64748b", fontSize: 12 }}>Awaiting target draw before score rows are available.</div>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
          </div>
        )}
      </div>
    </section>
  );
};

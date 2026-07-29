import type { Draw } from "../types";
import type { AppPresetSnapshot } from "./presets";

export const RESEARCH_DIARY_STORAGE_KEY = "windfall:research-diary:v1";

export type ResearchDiaryWeekday = "Monday" | "Wednesday" | "Friday";
export type ResearchDiaryMonthPhase = "early" | "mid" | "late" | "monthEnd";
export type ResearchDiaryEvidenceStatus = "observation" | "needsTesting" | "worthRepeating" | "refuted" | "retired";
export type ResearchDiaryPriority = "low" | "normal" | "high";
export type ResearchDiaryOutcome = "untested" | "helped" | "neutral" | "hurt" | "unclear";
export type ResearchDiaryRuleTag =
  | "SDE1"
  | "HC3"
  | "Stage IDM"
  | "Carry-over"
  | "Odd/even"
  | "Drought"
  | "Hot/cold"
  | "Window shape"
  | "Other";

export interface ResearchDiaryAppliesTo {
  drawOrdinals?: number[];
  weekdays?: ResearchDiaryWeekday[];
  monthPhases?: ResearchDiaryMonthPhase[];
  monthDrawCounts?: number[];
}

export interface ResearchDiarySetupSummary {
  window: string;
  generation: string[];
  filters: string[];
  selections: string[];
}

export interface ResearchDiaryEntry {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  observation: string;
  appliesTo: ResearchDiaryAppliesTo;
  ruleTags: ResearchDiaryRuleTag[];
  evidenceStatus: ResearchDiaryEvidenceStatus;
  priority: ResearchDiaryPriority;
  outcome: ResearchDiaryOutcome;
  outcomeNotes?: string;
  reviewAfterMatches?: number;
  matchedCount: number;
  archived?: boolean;
  setupSnapshot?: AppPresetSnapshot;
  setupSummary?: ResearchDiarySetupSummary;
}

export interface BuildResearchDiaryEntryOptions {
  id?: string;
  now?: string;
  title: string;
  observation: string;
  appliesTo?: ResearchDiaryAppliesTo;
  ruleTags?: ResearchDiaryRuleTag[];
  evidenceStatus?: ResearchDiaryEvidenceStatus;
  priority?: ResearchDiaryPriority;
  outcome?: ResearchDiaryOutcome;
  outcomeNotes?: string;
  reviewAfterMatches?: number;
  matchedCount?: number;
  archived?: boolean;
  setupSnapshot?: AppPresetSnapshot | null;
}

export interface ResearchDiaryNextDrawContext {
  nextDrawDate: string;
  weekday: ResearchDiaryWeekday;
  drawOrdinal: number;
  monthKey: string;
  monthPhase: ResearchDiaryMonthPhase;
  monthDrawCount: number;
  recordedDrawsInTargetMonth: number;
  latestRecordedDrawDate?: string;
}

export interface ResearchDiaryReminder {
  entry: ResearchDiaryEntry;
  reasonLabels: string[];
  tagLabels: string[];
  reviewDue: boolean;
}

const WEEKDAY_LABELS: Record<number, ResearchDiaryWeekday> = {
  1: "Monday",
  3: "Wednesday",
  5: "Friday",
};

const WEEKDAY_DAY_INDEX: Record<ResearchDiaryWeekday, number> = {
  Monday: 1,
  Wednesday: 3,
  Friday: 5,
};

const MONTH_PHASE_LABELS: Record<ResearchDiaryMonthPhase, string> = {
  early: "Early month",
  mid: "Mid month",
  late: "Late month",
  monthEnd: "Month-end",
};

const EVIDENCE_STATUSES: ResearchDiaryEvidenceStatus[] = [
  "observation",
  "needsTesting",
  "worthRepeating",
  "refuted",
  "retired",
];

const PRIORITIES: ResearchDiaryPriority[] = ["low", "normal", "high"];
const OUTCOMES: ResearchDiaryOutcome[] = ["untested", "helped", "neutral", "hurt", "unclear"];
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

interface DateParts {
  year: number;
  month: number;
  day: number;
}

const pad2 = (value: number): string => String(value).padStart(2, "0");

const datePartsToIso = (parts: DateParts): string => `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;

const monthKeyFromParts = (parts: DateParts): string => `${parts.year}-${pad2(parts.month)}`;

const datePartsToUtcTime = (parts: DateParts): number => Date.UTC(parts.year, parts.month - 1, parts.day);

const datePartsFromUtcTime = (time: number): DateParts => {
  const date = new Date(time);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const parseDateParts = (value: string | Date | undefined | null): DateParts | null => {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
    };
  }

  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (isValidDateParts(year, month, day)) return { year, month, day };
  }

  const mdyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (mdyy) {
    const month = Number(mdyy[1]);
    const day = Number(mdyy[2]);
    const rawYear = Number(mdyy[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (isValidDateParts(year, month, day)) return { year, month, day };
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return datePartsFromUtcTime(parsed);
};

const isValidDateParts = (year: number, month: number, day: number): boolean => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const addDays = (parts: DateParts, days: number): DateParts => (
  datePartsFromUtcTime(datePartsToUtcTime(parts) + (days * 86_400_000))
);

const utcWeekday = (parts: DateParts): number => new Date(datePartsToUtcTime(parts)).getUTCDay();

const isScheduledDrawDay = (parts: DateParts): boolean => utcWeekday(parts) in WEEKDAY_LABELS;

const compareDateParts = (left: DateParts, right: DateParts): number => datePartsToUtcTime(left) - datePartsToUtcTime(right);

const uniqueSortedNumbers = (values: unknown, min: number, max: number): number[] => {
  if (!Array.isArray(values)) return [];
  const seen = new Set<number>();
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isInteger(parsed) && parsed >= min && parsed <= max) seen.add(parsed);
  }
  return [...seen].sort((a, b) => a - b);
};

const uniqueSortedStrings = <T extends string>(values: unknown, allowed: readonly T[]): T[] => {
  if (!Array.isArray(values)) return [];
  const allowedSet = new Set<string>(allowed);
  const seen = new Set<T>();
  for (const value of values) {
    if (typeof value !== "string" || !allowedSet.has(value)) continue;
    seen.add(value as T);
  }
  return [...seen];
};

const boundedInteger = (value: unknown, min: number, max: number): number | undefined => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const rounded = Math.round(parsed);
  if (rounded < min || rounded > max) return undefined;
  return rounded;
};

const normalizeAppliesTo = (input: unknown): ResearchDiaryAppliesTo => {
  const applies = input && typeof input === "object" ? input as ResearchDiaryAppliesTo : {};
  return {
    drawOrdinals: uniqueSortedNumbers(applies.drawOrdinals, 1, 31),
    weekdays: uniqueSortedStrings(applies.weekdays, Object.keys(WEEKDAY_DAY_INDEX) as ResearchDiaryWeekday[]),
    monthPhases: uniqueSortedStrings(applies.monthPhases, Object.keys(MONTH_PHASE_LABELS) as ResearchDiaryMonthPhase[]),
    monthDrawCounts: uniqueSortedNumbers(applies.monthDrawCounts, 1, 20),
  };
};

const cloneSetupSnapshot = (snapshot: AppPresetSnapshot | null | undefined): AppPresetSnapshot | undefined => {
  if (!snapshot) return undefined;
  try {
    return JSON.parse(JSON.stringify(snapshot)) as AppPresetSnapshot;
  } catch {
    return snapshot;
  }
};

const countArray = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

const formatWindowSummary = (snapshot: Partial<AppPresetSnapshot> & Record<string, any>): string => {
  if (snapshot.windowEnabled === false) return "WFMQYH off";
  if (snapshot.drawWindowMode === "range") return `Range ${snapshot.rangeFrom ?? "-"}-${snapshot.rangeTo ?? "-"}`;
  if (snapshot.windowMode === "Custom") return `WFMQYH Custom ${snapshot.customDrawCount ?? "-"}`;
  if (snapshot.windowMode === "H") return "WFMQYH History";
  if (typeof snapshot.windowMode === "string" && snapshot.windowMode) return `WFMQYH ${snapshot.windowMode}`;
  return "WFMQYH unknown";
};

const setupBucketLabels = [
  ["undrawn", "0x"],
  ["times1", "1x"],
  ["times2", "2x"],
  ["times3", "3x"],
  ["times4", "4x"],
  ["times5", "5x"],
  ["times6", "6x"],
  ["times7", "7x"],
  ["times8", "8x+"],
] as const;

const formatAcceptanceNeedsCounts = (counts: unknown): string => {
  if (!counts || typeof counts !== "object") return "none";
  const source = counts as Record<string, unknown>;
  const parts = setupBucketLabels
    .map(([key, label]) => {
      const value = Number(source[key] ?? 0);
      return Number.isFinite(value) && value > 0 ? `${label}≥${Math.floor(value)}` : null;
    })
    .filter((value): value is string => value !== null);
  return parts.length ? parts.join(" · ") : "none";
};

export function summarizeResearchDiarySetup(snapshot: AppPresetSnapshot | null | undefined): ResearchDiarySetupSummary | undefined {
  if (!snapshot) return undefined;
  const setup = snapshot as Partial<AppPresetSnapshot> & Record<string, any>;
  const knobs = (setup.knobs && typeof setup.knobs === "object" ? setup.knobs : {}) as Record<string, unknown>;
  const generation = [
    `Scoring influence: ${setup.scoringGenerationInfluence ?? "off"}`,
    `Latest +/-1 support: ${setup.latestNeighbourSupportEnabled ? "on" : "off"}`,
    `Month-end carry-over: ${setup.monthEndCarryOverBiasEnabled ? (setup.monthEndCarryOverStrength ?? "normal") : "off"}`,
    `Use counts when constructing candidates: ${setup.monthlyConstructiveEnabled ? "on" : "off"}`,
    `Acceptance needs counts: ${formatAcceptanceNeedsCounts(setup.acceptanceNeedsCounts)}`,
    `Extra MiAN post-filter: ${setup.acceptanceNeedsEnabled ? (setup.acceptanceNeedsHardExclude ? "hard exclude" : "on") : "off"}`,
  ];
  const filters = [
    `SDE1 ${knobs.enableSDE1 ? "on" : "off"}`,
    `HC3 ${knobs.enableHC3 ? "on" : "off"}`,
    `Odd/even ratios: ${Array.isArray(setup.selectedRatios) && setup.selectedRatios.length ? setup.selectedRatios.join(", ") : "off"}`,
  ];
  const selections: string[] = [];
  const selectionCounts: Array<[unknown, string]> = [
    [setup.userSelectedNumbers, "User selected"],
    [setup.excludedNumbers, "User excluded"],
    [setup.hotColdForcedNumbers, "Hot/cold forced"],
    [setup.hotColdExcludedNumbers, "Hot/cold excluded"],
    [setup.droughtBreakSelectedNumbers, "Drought-break forced"],
    [setup.pasteWeightedForcedNumbers, "Paste-weighted forced"],
    [setup.selectedCarryOverBoostNumbers, "Carry-over boosted"],
  ];
  for (const [value, label] of selectionCounts) {
    const count = countArray(value);
    if (count > 0) selections.push(`${label}: ${count}`);
  }

  return {
    window: formatWindowSummary(setup),
    generation,
    filters,
    selections,
  };
}

const normalizeTitle = (title: string, observation: string): string => {
  const trimmed = title.trim();
  if (trimmed) return trimmed.slice(0, 120);
  const fallback = observation.trim().replace(/\s+/g, " ");
  return fallback ? fallback.slice(0, 64) : "Diary note";
};

export function buildResearchDiaryEntry(options: BuildResearchDiaryEntryOptions): ResearchDiaryEntry {
  const now = options.now ?? new Date().toISOString();
  const setupSnapshot = cloneSetupSnapshot(options.setupSnapshot);
  const reviewAfterMatches = boundedInteger(options.reviewAfterMatches, 1, 50);
  const matchedCount = boundedInteger(options.matchedCount, 0, 10_000) ?? 0;
  const evidenceStatus = options.evidenceStatus && EVIDENCE_STATUSES.includes(options.evidenceStatus)
    ? options.evidenceStatus
    : "observation";
  const priority = options.priority && PRIORITIES.includes(options.priority) ? options.priority : "normal";
  const outcome = options.outcome && OUTCOMES.includes(options.outcome) ? options.outcome : "untested";

  return {
    id: options.id ?? `research-diary-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
    title: normalizeTitle(options.title, options.observation),
    observation: options.observation.trim(),
    appliesTo: normalizeAppliesTo(options.appliesTo),
    ruleTags: uniqueSortedStrings(options.ruleTags, RULE_TAGS),
    evidenceStatus,
    priority,
    outcome,
    outcomeNotes: options.outcomeNotes?.trim() || undefined,
    reviewAfterMatches,
    matchedCount,
    archived: options.archived || undefined,
    setupSnapshot,
    setupSummary: setupSnapshot ? summarizeResearchDiarySetup(setupSnapshot) : undefined,
  };
}

const realDrawDates = (history: Draw[]): DateParts[] => history
  .filter((draw) => !draw.isSimulated)
  .map((draw) => parseDateParts(draw.date))
  .filter((parts): parts is DateParts => parts !== null)
  .sort(compareDateParts);

const findNextScheduledDrawDate = (today: DateParts, recordedIsoDates: Set<string>): DateParts => {
  let candidate = today;
  for (let guard = 0; guard < 10; guard += 1) {
    if (isScheduledDrawDay(candidate) && !recordedIsoDates.has(datePartsToIso(candidate))) return candidate;
    candidate = addDays(candidate, 1);
  }
  return candidate;
};

const countScheduledDrawsInMonth = (year: number, month: number, throughDay?: number): number => {
  let count = 0;
  for (let day = 1; day <= 31; day += 1) {
    if (!isValidDateParts(year, month, day)) break;
    if (throughDay !== undefined && day > throughDay) break;
    if (isScheduledDrawDay({ year, month, day })) count += 1;
  }
  return count;
};

const monthPhaseForOrdinal = (ordinal: number, monthDrawCount: number): ResearchDiaryMonthPhase => {
  if (ordinal <= 3) return "early";
  if (ordinal >= Math.max(1, monthDrawCount - 1)) return "monthEnd";
  if (ordinal >= Math.max(1, monthDrawCount - 3)) return "late";
  return "mid";
};

export function computeResearchDiaryNextDrawContext(
  history: Draw[],
  options: { now?: string | Date } = {},
): ResearchDiaryNextDrawContext {
  const today = parseDateParts(options.now ?? new Date()) ?? datePartsFromUtcTime(Date.now());
  const recordedDates = realDrawDates(history);
  const recordedIsoDates = new Set(recordedDates.map(datePartsToIso));
  const nextDraw = findNextScheduledDrawDate(today, recordedIsoDates);
  const nextDrawIso = datePartsToIso(nextDraw);
  const monthKey = monthKeyFromParts(nextDraw);
  const monthDrawCount = countScheduledDrawsInMonth(nextDraw.year, nextDraw.month);
  const drawOrdinal = countScheduledDrawsInMonth(nextDraw.year, nextDraw.month, nextDraw.day);
  const latestRecorded = recordedDates[recordedDates.length - 1];
  const nextDrawTime = datePartsToUtcTime(nextDraw);
  const recordedDrawsInTargetMonth = recordedDates.filter((parts) => (
    monthKeyFromParts(parts) === monthKey && datePartsToUtcTime(parts) < nextDrawTime
  )).length;
  const weekday = WEEKDAY_LABELS[utcWeekday(nextDraw)] ?? "Monday";

  return {
    nextDrawDate: nextDrawIso,
    weekday,
    drawOrdinal,
    monthKey,
    monthPhase: monthPhaseForOrdinal(drawOrdinal, monthDrawCount),
    monthDrawCount,
    recordedDrawsInTargetMonth,
    latestRecordedDrawDate: latestRecorded ? datePartsToIso(latestRecorded) : undefined,
  };
}

const hasTargeting = (appliesTo: ResearchDiaryAppliesTo): boolean => (
  Boolean(appliesTo.drawOrdinals?.length)
  || Boolean(appliesTo.weekdays?.length)
  || Boolean(appliesTo.monthPhases?.length)
  || Boolean(appliesTo.monthDrawCounts?.length)
);

const reminderReasonsForEntry = (
  entry: ResearchDiaryEntry,
  context: ResearchDiaryNextDrawContext,
): string[] | null => {
  const appliesTo = entry.appliesTo;
  const reasons: string[] = [];

  if (!hasTargeting(appliesTo)) return null;
  if (appliesTo.drawOrdinals?.length) {
    if (!appliesTo.drawOrdinals.includes(context.drawOrdinal)) return null;
    reasons.push(`D${context.drawOrdinal}`);
  }
  if (appliesTo.weekdays?.length) {
    if (!appliesTo.weekdays.includes(context.weekday)) return null;
    reasons.push(context.weekday);
  }
  if (appliesTo.monthPhases?.length) {
    if (!appliesTo.monthPhases.includes(context.monthPhase)) return null;
    reasons.push(MONTH_PHASE_LABELS[context.monthPhase]);
  }
  if (appliesTo.monthDrawCounts?.length) {
    if (!appliesTo.monthDrawCounts.includes(context.monthDrawCount)) return null;
    reasons.push(`${context.monthDrawCount}-draw month`);
  }

  return reasons;
};

export function findResearchDiaryReminders(
  entries: ResearchDiaryEntry[],
  context: ResearchDiaryNextDrawContext,
): ResearchDiaryReminder[] {
  return entries.flatMap((entry) => {
    if (entry.archived || entry.evidenceStatus === "retired") return [];
    const reasonLabels = reminderReasonsForEntry(entry, context);
    if (!reasonLabels) return [];
    return [{
      entry,
      reasonLabels,
      tagLabels: entry.ruleTags,
      reviewDue: entry.reviewAfterMatches !== undefined
        && entry.matchedCount + 1 >= entry.reviewAfterMatches,
    }];
  });
}

const isResearchDiaryEntry = (value: unknown): value is ResearchDiaryEntry => {
  if (!value || typeof value !== "object") return false;
  const entry = value as ResearchDiaryEntry;
  return typeof entry.id === "string"
    && typeof entry.createdAt === "string"
    && typeof entry.updatedAt === "string"
    && typeof entry.title === "string"
    && typeof entry.observation === "string"
    && !!entry.appliesTo
    && typeof entry.appliesTo === "object"
    && Array.isArray(entry.ruleTags)
    && EVIDENCE_STATUSES.includes(entry.evidenceStatus)
    && PRIORITIES.includes(entry.priority)
    && OUTCOMES.includes(entry.outcome)
    && typeof entry.matchedCount === "number";
};

export function normalizeResearchDiaryEntry(entry: ResearchDiaryEntry): ResearchDiaryEntry {
  const rebuilt = buildResearchDiaryEntry({
    id: entry.id,
    now: entry.updatedAt || entry.createdAt,
    title: entry.title,
    observation: entry.observation,
    appliesTo: entry.appliesTo,
    ruleTags: entry.ruleTags,
    evidenceStatus: entry.evidenceStatus,
    priority: entry.priority,
    outcome: entry.outcome,
    outcomeNotes: entry.outcomeNotes,
    reviewAfterMatches: entry.reviewAfterMatches,
    matchedCount: entry.matchedCount,
    archived: entry.archived,
    setupSnapshot: entry.setupSnapshot,
  });

  return {
    ...rebuilt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export function loadResearchDiaryEntries(storage: Storage = window.localStorage): ResearchDiaryEntry[] {
  try {
    const raw = storage.getItem(RESEARCH_DIARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isResearchDiaryEntry).map(normalizeResearchDiaryEntry);
  } catch {
    return [];
  }
}

export function saveResearchDiaryEntries(entries: ResearchDiaryEntry[], storage: Storage = window.localStorage): void {
  storage.setItem(RESEARCH_DIARY_STORAGE_KEY, JSON.stringify(entries.filter(isResearchDiaryEntry)));
}

export function clearResearchDiaryEntries(storage: Storage = window.localStorage): void {
  storage.removeItem(RESEARCH_DIARY_STORAGE_KEY);
}

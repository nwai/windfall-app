import type {
  PredictionJournalReviewStatus,
  PredictionScoreResult,
  ScoredPredictionJournalEntry,
} from "./predictionJournal";

export const PREDICTION_JOURNAL_FINDINGS_VERSION = 1 as const;

export type PredictionJournalFindingSeverity = "info" | "caution" | "useful";

export interface PredictionJournalFindingsOptions {
  reviewedOnly?: boolean;
  includeArchived?: boolean;
  minGroupEntries?: number;
  maxFindings?: number;
}

export interface PredictionJournalScoreCounts {
  entries: number;
  checks: number;
  hits: number;
  partials: number;
  misses: number;
  recorded: number;
}

export interface PredictionJournalFindingGroup {
  key: string;
  label: string;
  category: string;
  entryCount: number;
  scoreCounts: PredictionJournalScoreCounts;
  weightedSupportRate: number;
  positiveRate: number;
  vsOverall: number;
  entryIds: string[];
}

export interface PredictionJournalFinding {
  id: string;
  severity: PredictionJournalFindingSeverity;
  title: string;
  detail: string;
  evidence: string;
  recommendation: string;
  groupKey?: string;
}

export interface PredictionJournalFindingsReport {
  version: typeof PREDICTION_JOURNAL_FINDINGS_VERSION;
  scopeLabel: string;
  reviewedOnly: boolean;
  includeArchived: boolean;
  minGroupEntries: number;
  totalEntries: number;
  eligibleEntries: number;
  excludedArchivedEntries: number;
  excludedUnreviewedEntries: number;
  excludedUnscoredEntries: number;
  scoreCounts: PredictionJournalScoreCounts;
  weightedSupportRate: number;
  positiveRate: number;
  groups: PredictionJournalFindingGroup[];
  findings: PredictionJournalFinding[];
  caveats: string[];
}

interface FindingSignal {
  key: string;
  label: string;
  category: string;
}

const SCORABLE_RESULTS = new Set<PredictionScoreResult>(["hit", "partial", "miss"]);

const normalizeReviewStatus = (value: PredictionJournalReviewStatus | undefined): PredictionJournalReviewStatus => (
  value === "reviewedByUser" ? "reviewedByUser" : "notReviewed"
);

const normalizeKeyPart = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, " ");

const emptyScoreCounts = (): PredictionJournalScoreCounts => ({
  entries: 0,
  checks: 0,
  hits: 0,
  partials: 0,
  misses: 0,
  recorded: 0,
});

const addScoreCounts = (target: PredictionJournalScoreCounts, source: PredictionJournalScoreCounts): void => {
  target.entries += source.entries;
  target.checks += source.checks;
  target.hits += source.hits;
  target.partials += source.partials;
  target.misses += source.misses;
  target.recorded += source.recorded;
};

const scoreCountsForEntry = (entry: ScoredPredictionJournalEntry): PredictionJournalScoreCounts => {
  const counts = emptyScoreCounts();
  counts.entries = 1;

  for (const score of entry.scores) {
    if (score.result === "recorded") {
      counts.recorded += 1;
      continue;
    }
    if (!SCORABLE_RESULTS.has(score.result)) continue;
    counts.checks += 1;
    if (score.result === "hit") counts.hits += 1;
    else if (score.result === "partial") counts.partials += 1;
    else counts.misses += 1;
  }

  return counts;
};

const weightedSupportRate = (counts: PredictionJournalScoreCounts): number => (
  counts.checks > 0 ? (counts.hits + counts.partials * 0.5) / counts.checks : 0
);

const positiveRate = (counts: PredictionJournalScoreCounts): number => (
  counts.checks > 0 ? (counts.hits + counts.partials) / counts.checks : 0
);

const formatBucketMix = (entry: ScoredPredictionJournalEntry): string | null => {
  const buckets = entry.inputs.monthlyBuckets;
  if (!buckets) return null;
  const pieces = [
    ["undrawn", "U"],
    ["times1", "1x"],
    ["times2", "2x"],
    ["times3", "3x"],
    ["times4", "4x"],
    ["times5", "5x"],
    ["times6", "6x"],
    ["times7", "7x"],
    ["times8", "8x+"],
  ] as const;

  const active = pieces
    .map(([key, label]) => {
      const value = buckets[key];
      return typeof value === "number" ? `${label}${value}` : "";
    })
    .filter(Boolean);

  return active.length ? active.join(" ") : null;
};

const oddEvenFromNumbers = (numbers: number[]): string | null => {
  if (!numbers.length) return null;
  const odd = numbers.filter((number) => number % 2 !== 0).length;
  return `${odd}:${numbers.length - odd}`;
};

const addSignal = (signals: FindingSignal[], category: string, label: string): void => {
  const cleaned = label.trim();
  if (!cleaned || cleaned === "Off") return;
  signals.push({
    key: `${category}:${normalizeKeyPart(cleaned)}`,
    label: cleaned,
    category,
  });
};

const collectSignals = (entry: ScoredPredictionJournalEntry): FindingSignal[] => {
  const signals: FindingSignal[] = [];
  const setup = entry.setupSummary;

  if (setup?.window) addSignal(signals, "WFMQYH", `History window: ${setup.window}`);
  if (setup?.oddEvenRatios && setup.oddEvenRatios !== "Off") {
    addSignal(signals, "Setup", `Selected odd/even ratios: ${setup.oddEvenRatios}`);
  }

  for (const line of setup?.generation ?? []) {
    if (line.endsWith(": off")) continue;
    if (line.endsWith(": none")) continue;
    addSignal(signals, "Generation setup", line);
  }

  for (const line of setup?.filters ?? []) {
    if (line.endsWith(" off")) continue;
    addSignal(signals, "Filter setup", line);
  }

  for (const line of setup?.selections ?? []) {
    addSignal(signals, "Selection setup", line);
  }

  if (entry.inputs.oddEvenRatio) addSignal(signals, "Prediction field", `Predicted odd/even ${entry.inputs.oddEvenRatio}`);
  if (entry.inputs.selectionReason) {
    addSignal(
      signals,
      "Selection reason",
      entry.inputs.selectionReason.detail
        ? `${entry.inputs.selectionReason.label} - ${entry.inputs.selectionReason.detail}`
        : entry.inputs.selectionReason.label,
    );
  }
  const bucketMix = formatBucketMix(entry);
  if (bucketMix) addSignal(signals, "Prediction field", `Predicted bucket mix ${bucketMix}`);
  if (entry.inputs.terminalDigits?.length) {
    addSignal(signals, "Prediction field", `Predicted terminal digits ${entry.inputs.terminalDigits.slice().sort((a, b) => a - b).join(",")}`);
  }
  if (entry.inputs.numbers?.length) {
    addSignal(signals, "Number shape", `${entry.inputs.numbers.length} picked numbers`);
    const numberOddEven = oddEvenFromNumbers(entry.inputs.numbers);
    if (numberOddEven) addSignal(signals, "Number shape", `Picked-number odd/even ${numberOddEven}`);
  }

  const drought = entry.provenance?.droughtBreakShortlist;
  if (drought?.anySelectedFromShortlist) addSignal(signals, "Drought provenance", "Any picked number from drought shortlist");
  if (drought?.allSelectedFromShortlist) addSignal(signals, "Drought provenance", "All picked numbers from drought shortlist");
  if (drought?.selectedStrictDroughtNumbers.length) addSignal(signals, "Drought provenance", "Picked strict drought 6+ number");
  if (drought?.selectedEmpiricalHazardNumbers.length) addSignal(signals, "Drought provenance", "Picked empirical hazard number");

  const selectionInsights = entry.provenance?.selectionInsights;
  if (selectionInsights?.enabled && selectionInsights.predictedCompanionNumbers.length) {
    addSignal(signals, "Selection insights", `Captured predicted companions ${selectionInsights.predictedCompanionNumbers.join(",")}`);
  }

  const uniqueSignals = new Map<string, FindingSignal>();
  for (const signal of signals) uniqueSignals.set(signal.key, signal);
  return [...uniqueSignals.values()];
};

const buildFindingGroup = (
  signal: FindingSignal,
  entryIds: Set<string>,
  counts: PredictionJournalScoreCounts,
  overallRate: number,
): PredictionJournalFindingGroup => {
  const groupCounts = { ...counts, entries: entryIds.size };
  const groupRate = weightedSupportRate(groupCounts);
  return {
    key: signal.key,
    label: signal.label,
    category: signal.category,
    entryCount: entryIds.size,
    scoreCounts: groupCounts,
    weightedSupportRate: groupRate,
    positiveRate: positiveRate(groupCounts),
    vsOverall: groupRate - overallRate,
    entryIds: [...entryIds],
  };
};

const formatPct = (rate: number): string => `${Math.round(rate * 100)}%`;

const findingEvidence = (group: PredictionJournalFindingGroup): string => (
  `${group.entryCount} reviewed scored entries; ${group.scoreCounts.hits} hits, ${group.scoreCounts.partials} partials, ${group.scoreCounts.misses} misses across ${group.scoreCounts.checks} scored checks. Weighted support ${formatPct(group.weightedSupportRate)} (${group.vsOverall >= 0 ? "+" : ""}${formatPct(group.vsOverall)} vs overall).`
);

const buildGroupFindings = (
  groups: PredictionJournalFindingGroup[],
  maxFindings: number,
): PredictionJournalFinding[] => {
  const findings: PredictionJournalFinding[] = [];

  const cautionGroups = groups
    .filter((group) => group.scoreCounts.checks > 0)
    .filter((group) => group.weightedSupportRate <= 0.25 && group.scoreCounts.misses >= group.scoreCounts.hits + group.scoreCounts.partials)
    .sort((a, b) => a.weightedSupportRate - b.weightedSupportRate || b.entryCount - a.entryCount)
    .slice(0, 3);

  for (const group of cautionGroups) {
    findings.push({
      id: `caution:${group.key}`,
      severity: "caution",
      title: `Repeated weak setup: ${group.label}`,
      detail: "This setup or prediction trait is appearing repeatedly in scored reviewed entries with mostly miss outcomes.",
      evidence: findingEvidence(group),
      recommendation: "Treat this as a caution flag before repeating the same setup. Change one variable at a time if you want to retest it.",
      groupKey: group.key,
    });
  }

  const usefulGroups = groups
    .filter((group) => group.scoreCounts.checks > 0)
    .filter((group) => group.weightedSupportRate >= 0.6 && group.vsOverall >= 0.15)
    .sort((a, b) => b.weightedSupportRate - a.weightedSupportRate || b.entryCount - a.entryCount)
    .slice(0, 3);

  for (const group of usefulGroups) {
    findings.push({
      id: `useful:${group.key}`,
      severity: "useful",
      title: `Worth watching: ${group.label}`,
      detail: "This repeated setup or prediction trait is scoring better than the journal's current overall record.",
      evidence: findingEvidence(group),
      recommendation: "Keep recording this signal, but do not promote it into generation until the sample is larger and the edge survives future draws.",
      groupKey: group.key,
    });
  }

  return findings.slice(0, maxFindings);
};

export function buildPredictionJournalFindingsReport(
  entries: ScoredPredictionJournalEntry[],
  options: PredictionJournalFindingsOptions = {},
): PredictionJournalFindingsReport {
  const reviewedOnly = options.reviewedOnly ?? true;
  const includeArchived = options.includeArchived ?? false;
  const minGroupEntries = Math.max(2, Math.floor(options.minGroupEntries ?? 3));
  const maxFindings = Math.max(1, Math.floor(options.maxFindings ?? 6));

  let excludedArchivedEntries = 0;
  let excludedUnreviewedEntries = 0;
  let excludedUnscoredEntries = 0;
  const eligible: ScoredPredictionJournalEntry[] = [];

  for (const entry of entries) {
    if (!includeArchived && entry.archivedAt) {
      excludedArchivedEntries += 1;
      continue;
    }
    if (reviewedOnly && normalizeReviewStatus(entry.reviewStatus) !== "reviewedByUser") {
      excludedUnreviewedEntries += 1;
      continue;
    }
    const entryCounts = scoreCountsForEntry(entry);
    if (entry.status !== "scored" || entryCounts.checks === 0) {
      excludedUnscoredEntries += 1;
      continue;
    }
    eligible.push(entry);
  }

  const scoreCounts = emptyScoreCounts();
  for (const entry of eligible) {
    addScoreCounts(scoreCounts, scoreCountsForEntry(entry));
  }
  scoreCounts.entries = eligible.length;
  const overallWeightedSupport = weightedSupportRate(scoreCounts);

  const groupAccumulator = new Map<string, {
    signal: FindingSignal;
    entryIds: Set<string>;
    counts: PredictionJournalScoreCounts;
  }>();

  for (const entry of eligible) {
    const entryCounts = scoreCountsForEntry(entry);
    for (const signal of collectSignals(entry)) {
      const existing = groupAccumulator.get(signal.key) ?? {
        signal,
        entryIds: new Set<string>(),
        counts: emptyScoreCounts(),
      };
      existing.entryIds.add(entry.id);
      addScoreCounts(existing.counts, entryCounts);
      groupAccumulator.set(signal.key, existing);
    }
  }

  const groups = [...groupAccumulator.values()]
    .map((value) => buildFindingGroup(value.signal, value.entryIds, value.counts, overallWeightedSupport))
    .filter((group) => group.entryCount >= minGroupEntries && group.scoreCounts.checks > 0)
    .sort((a, b) => (
      b.entryCount - a.entryCount
      || b.scoreCounts.checks - a.scoreCounts.checks
      || b.weightedSupportRate - a.weightedSupportRate
      || a.label.localeCompare(b.label)
    ));

  const findings: PredictionJournalFinding[] = [];

  if (eligible.length < minGroupEntries) {
    findings.push({
      id: "info:not-enough-reviewed-scored-entries",
      severity: "info",
      title: "Not enough reviewed scored entries yet",
      detail: `PJFR needs at least ${minGroupEntries} reviewed scored entries before it can call out repeated habits with any discipline.`,
      evidence: `${eligible.length} eligible entries are available from ${entries.length} total saved entries.`,
      recommendation: "Keep saving reviewed predictions before the target draw arrives. Notes-only entries are valid, but scored fields make later analysis stronger.",
    });
  }

  if (excludedUnreviewedEntries > 0) {
    findings.push({
      id: "info:unreviewed-excluded",
      severity: "info",
      title: "Unreviewed entries are excluded by default",
      detail: "Drafts marked Not reviewed are kept out of PJFR so auto-filled or unchecked entries do not contaminate the learning record.",
      evidence: `${excludedUnreviewedEntries} unreviewed entries were excluded from this report.`,
      recommendation: "Mark entries Reviewed by user only after checking that the saved numbers, setup, and notes match your actual intent.",
    });
  }

  findings.push(...buildGroupFindings(groups, maxFindings - findings.length));

  if (findings.length === 0) {
    findings.push({
      id: "info:no-repeatable-findings",
      severity: "info",
      title: "No repeatable habits flagged yet",
      detail: "The journal has enough reviewed scored entries to read, but V1 did not find a repeated setup that is clearly weak or clearly worth watching.",
      evidence: `${eligible.length} eligible entries; overall weighted support ${formatPct(overallWeightedSupport)} across ${scoreCounts.checks} scored checks.`,
      recommendation: "Keep recording varied hypotheses. The report becomes more useful when the same idea is tested several times across real draws.",
    });
  }

  return {
    version: PREDICTION_JOURNAL_FINDINGS_VERSION,
    scopeLabel: reviewedOnly
      ? "Reviewed scored entries only"
      : "All scored entries",
    reviewedOnly,
    includeArchived,
    minGroupEntries,
    totalEntries: entries.length,
    eligibleEntries: eligible.length,
    excludedArchivedEntries,
    excludedUnreviewedEntries,
    excludedUnscoredEntries,
    scoreCounts,
    weightedSupportRate: overallWeightedSupport,
    positiveRate: positiveRate(scoreCounts),
    groups,
    findings: findings.slice(0, maxFindings),
    caveats: [
      "Observe-only V1: this report does not influence candidate generation, ranking, filters, or forced numbers.",
      "Weighted support is a journal diagnostic: hit = 1, partial = 0.5, miss = 0 across scored fields. It is not a lottery probability.",
      "Small samples can flatter or punish a setup by chance. Treat findings as review prompts until they survive more scored entries.",
      "The report schema is versioned so future PJFR detectors can add new signal families without rewriting existing entries.",
    ],
  };
}

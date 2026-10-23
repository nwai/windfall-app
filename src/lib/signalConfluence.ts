import {
  EVIDENCE_PORTFOLIO_RULES,
  getEvidenceFamily,
  getEvidenceIndependenceGroupLabel,
  getPanelOwnership,
  panelCanProvideIndependentPortfolioEvidence,
  type EvidenceFamilyId,
} from "./evidenceFamilyRegistry";

const LOTTERY_MIN = 1;
const LOTTERY_MAX = 45;
const DEFAULT_FAMILY_CAP = EVIDENCE_PORTFOLIO_RULES.scoreCapPerIndependenceGroup;

export type SignalConfluenceFamilyKey =
  | "latest-neighbour"
  | "drought"
  | "shared-selection"
  | "active-frequency"
  | "terminal-bucket"
  | "temperature"
  | "scoring-numbers"
  | "selection-insights"
  | "next-draw-evidence"
  | "weekday-neighbour"
  | "user-state";

export type SignalConfluenceMentionTone = "support" | "context" | "caution" | "state";

export type SignalConfluenceSourceDisposition = "eligible-support" | "context-only" | "state-only";

export interface SignalConfluenceSourceDefinition {
  family: SignalConfluenceFamilyKey;
  sourcePanelId: string;
  evidenceFamily: EvidenceFamilyId;
  disposition: SignalConfluenceSourceDisposition;
}

export const SIGNAL_CONFLUENCE_SOURCE_REGISTRY: Record<SignalConfluenceFamilyKey, SignalConfluenceSourceDefinition> = {
  "latest-neighbour": { family: "latest-neighbour", sourcePanelId: "previous-neighbour-backtest", evidenceFamily: "previous-neighbour", disposition: "eligible-support" },
  drought: { family: "drought", sourcePanelId: "drought-break-shortlist", evidenceFamily: "drought", disposition: "eligible-support" },
  "shared-selection": { family: "shared-selection", sourcePanelId: "survival-analyzer", evidenceFamily: "survival", disposition: "context-only" },
  "active-frequency": { family: "active-frequency", sourcePanelId: "number-frequency", evidenceFamily: "frequency-recency", disposition: "eligible-support" },
  "terminal-bucket": { family: "terminal-bucket", sourcePanelId: "draw-bucket-patterns", evidenceFamily: "terminal-digit", disposition: "eligible-support" },
  temperature: { family: "temperature", sourcePanelId: "hot-cold-ranking", evidenceFamily: "frequency-recency", disposition: "eligible-support" },
  "scoring-numbers": { family: "scoring-numbers", sourcePanelId: "scoring-system-diagnostics", evidenceFamily: "scoring", disposition: "eligible-support" },
  "selection-insights": { family: "selection-insights", sourcePanelId: "selection-insights", evidenceFamily: "evidence-aggregation", disposition: "context-only" },
  "next-draw-evidence": { family: "next-draw-evidence", sourcePanelId: "next-draw-evidence-ensemble", evidenceFamily: "evidence-aggregation", disposition: "context-only" },
  "weekday-neighbour": { family: "weekday-neighbour", sourcePanelId: "previous-neighbour-backtest", evidenceFamily: "previous-neighbour", disposition: "eligible-support" },
  "user-state": { family: "user-state", sourcePanelId: "user-selected-numbers", evidenceFamily: "user-intent", disposition: "state-only" },
};

export interface SignalConfluenceMention {
  number: number;
  family: SignalConfluenceFamilyKey;
  source: string;
  label: string;
  strength?: number;
  detail?: string;
  tone?: SignalConfluenceMentionTone;
  evidenceFamily?: EvidenceFamilyId;
  sourcePanelId?: string;
  independenceGroup?: string;
  contextReason?: string;
}

export interface SignalConfluenceGroupSupport {
  independenceGroup: string;
  label: string;
  strength: number;
  evidenceFamilies: EvidenceFamilyId[];
  mentions: SignalConfluenceMention[];
}

export interface SignalConfluenceRow {
  number: number;
  rank: number;
  familyScore: number;
  familyCount: number;
  evidenceFamilyCount: number;
  rawMentionCount: number;
  groupSupport: SignalConfluenceGroupSupport[];
  supportMentions: SignalConfluenceMention[];
  contextMentions: SignalConfluenceMention[];
  cautionMentions: SignalConfluenceMention[];
  stateMentions: SignalConfluenceMention[];
  isExcluded: boolean;
  isForced: boolean;
  isUserSelected: boolean;
}

export interface BuildSignalConfluenceRowsOptions {
  familyCap?: number;
  excludedNumbers?: readonly unknown[];
  forcedNumbers?: readonly unknown[];
  userSelectedNumbers?: readonly unknown[];
}

export type SignalConfluenceSortKey = "rank" | "support";
export type SignalConfluenceSortDirection = "ascending" | "descending";
export type SignalConfluenceVisibilityMode = "supported-only" | "all-45";

export function isValidSignalConfluenceNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= LOTTERY_MIN &&
    value <= LOTTERY_MAX
  );
}

export function normalizeSignalConfluenceNumbers(values: readonly unknown[] | null | undefined): number[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.filter(isValidSignalConfluenceNumber))).sort((left, right) => left - right);
}

export function buildRankedSignalConfluenceMentions(
  numbers: readonly unknown[] | null | undefined,
  family: SignalConfluenceFamilyKey,
  source: string,
  labelPrefix: string,
  limit = 8,
): SignalConfluenceMention[] {
  if (!Array.isArray(numbers)) return [];

  const safeLimit = Math.max(0, Math.floor(Number.isFinite(limit) ? limit : 0));
  if (safeLimit === 0) return [];
  const seen = new Set<number>();
  const rankedNumbers: number[] = [];

  for (const value of numbers) {
    if (!isValidSignalConfluenceNumber(value) || seen.has(value)) continue;
    seen.add(value);
    rankedNumbers.push(value);
    if (rankedNumbers.length >= safeLimit) break;
  }

  return rankedNumbers.map((number, index) => ({
    number,
    family,
    source,
    label: `${labelPrefix} #${index + 1}`,
    strength: rankedStrength(index, rankedNumbers.length),
  }));
}

export function filterSignalConfluenceRows(
  rows: readonly SignalConfluenceRow[],
  visibilityMode: SignalConfluenceVisibilityMode,
): SignalConfluenceRow[] {
  if (visibilityMode === "all-45") return rows.slice();
  return rows.filter((row) => (
    row.rawMentionCount > 0
    || row.contextMentions.length > 0
    || row.isForced
    || row.isUserSelected
    || row.isExcluded
  ));
}

export function rankedStrength(rankIndex: number, total: number, floor = 0.35): number {
  if (!Number.isFinite(rankIndex) || rankIndex < 0 || total <= 1) return 1;
  const safeFloor = Math.max(0, Math.min(1, floor));
  const span = 1 - safeFloor;
  return safeFloor + span * ((total - 1 - Math.min(rankIndex, total - 1)) / (total - 1));
}

const clampStrength = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
};

const contextReasonForSource = (definition: SignalConfluenceSourceDefinition): string => {
  const ownership = getPanelOwnership(definition.sourcePanelId);
  if (definition.disposition === "state-only" || ownership?.role === "control") {
    return "User or control state is visible for provenance but cannot create evidence support.";
  }
  if (ownership?.role === "aggregator") {
    return "Aggregator output is visible for comparison but cannot be counted again as independent evidence.";
  }
  if (ownership?.role === "consumer") {
    return "Consumer output depends on upstream evidence and is visible as context rather than another vote.";
  }
  return "This source is registered as context-only and does not add to the bounded evidence score.";
};

export const resolveSignalConfluenceMention = (mention: SignalConfluenceMention): SignalConfluenceMention => {
  const sourceDefinition = SIGNAL_CONFLUENCE_SOURCE_REGISTRY[mention.family];
  const evidenceFamily = getEvidenceFamily(sourceDefinition.evidenceFamily);
  const requestedTone = mention.tone ?? "support";
  const sourceIsEligible = sourceDefinition.disposition === "eligible-support"
    && panelCanProvideIndependentPortfolioEvidence(sourceDefinition.sourcePanelId)
    && getPanelOwnership(sourceDefinition.sourcePanelId)?.primaryFamily === sourceDefinition.evidenceFamily;
  const tone: SignalConfluenceMentionTone = requestedTone === "support" && !sourceIsEligible
    ? "context"
    : requestedTone;

  return {
    ...mention,
    strength: clampStrength(mention.strength),
    tone,
    evidenceFamily: sourceDefinition.evidenceFamily,
    sourcePanelId: sourceDefinition.sourcePanelId,
    independenceGroup: evidenceFamily?.independenceGroup,
    contextReason: tone === "context" ? contextReasonForSource(sourceDefinition) : mention.contextReason,
  };
};

const compareRows = (left: SignalConfluenceRow, right: SignalConfluenceRow): number => {
  if (left.isExcluded !== right.isExcluded) return left.isExcluded ? 1 : -1;
  return (
    right.familyScore - left.familyScore ||
    right.familyCount - left.familyCount ||
    right.rawMentionCount - left.rawMentionCount ||
    Number(right.isForced) - Number(left.isForced) ||
    Number(right.isUserSelected) - Number(left.isUserSelected) ||
    left.number - right.number
  );
};

export function sortSignalConfluenceRows(
  rows: readonly SignalConfluenceRow[],
  sortKey: SignalConfluenceSortKey,
  direction: SignalConfluenceSortDirection = "ascending",
): SignalConfluenceRow[] {
  const directionMultiplier = direction === "ascending" ? 1 : -1;
  return rows.slice().sort((left, right) => {
    if (left.isExcluded !== right.isExcluded) return left.isExcluded ? 1 : -1;

    if (sortKey === "support") {
      return (
        directionMultiplier * (left.rawMentionCount - right.rawMentionCount) ||
        directionMultiplier * (left.familyCount - right.familyCount) ||
        directionMultiplier * (left.familyScore - right.familyScore) ||
        left.rank - right.rank ||
        left.number - right.number
      );
    }

    return left.rank - right.rank || left.number - right.number;
  });
}

export function buildSignalConfluenceRows(
  mentions: readonly SignalConfluenceMention[],
  options: BuildSignalConfluenceRowsOptions = {},
): SignalConfluenceRow[] {
  const familyCap = Math.max(0, Math.min(1, options.familyCap ?? DEFAULT_FAMILY_CAP));
  const excludedSet = new Set(normalizeSignalConfluenceNumbers(options.excludedNumbers));
  const forcedSet = new Set(normalizeSignalConfluenceNumbers(options.forcedNumbers));
  const userSelectedSet = new Set(normalizeSignalConfluenceNumbers(options.userSelectedNumbers));
  const mentionsByNumber = new Map<number, SignalConfluenceMention[]>();

  for (const mention of mentions) {
    if (!isValidSignalConfluenceNumber(mention.number)) continue;
    const safeMention = resolveSignalConfluenceMention(mention);
    const current = mentionsByNumber.get(safeMention.number) ?? [];
    current.push(safeMention);
    mentionsByNumber.set(safeMention.number, current);
  }

  const rows = Array.from({ length: LOTTERY_MAX }, (_, index): SignalConfluenceRow => {
    const number = index + 1;
    const numberMentions = mentionsByNumber.get(number) ?? [];
    const supportMentions = numberMentions.filter((mention) => (mention.tone ?? "support") === "support");
    const contextMentions = numberMentions.filter((mention) => mention.tone === "context");
    const cautionMentions = numberMentions.filter((mention) => mention.tone === "caution");
    const stateMentions = numberMentions.filter((mention) => mention.tone === "state");
    const supportByGroup = new Map<string, {
      strength: number;
      evidenceFamilies: Set<EvidenceFamilyId>;
      mentions: SignalConfluenceMention[];
    }>();

    for (const mention of supportMentions) {
      if (!mention.independenceGroup || !mention.evidenceFamily) continue;
      const current = supportByGroup.get(mention.independenceGroup) ?? {
        strength: 0,
        evidenceFamilies: new Set<EvidenceFamilyId>(),
        mentions: [],
      };
      current.strength = Math.max(current.strength, Math.min(familyCap, clampStrength(mention.strength)));
      current.evidenceFamilies.add(mention.evidenceFamily);
      current.mentions.push(mention);
      supportByGroup.set(mention.independenceGroup, current);
    }

    const groupSupport = Array.from(supportByGroup.entries())
      .map(([independenceGroup, group]): SignalConfluenceGroupSupport => ({
        independenceGroup,
        label: getEvidenceIndependenceGroupLabel(independenceGroup),
        strength: group.strength,
        evidenceFamilies: Array.from(group.evidenceFamilies).sort(),
        mentions: group.mentions,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
    const evidenceFamilyCount = new Set(
      supportMentions.flatMap((mention) => mention.evidenceFamily ? [mention.evidenceFamily] : []),
    ).size;

    return {
      number,
      rank: 0,
      familyScore: groupSupport.reduce((sum, group) => sum + group.strength, 0),
      familyCount: groupSupport.length,
      evidenceFamilyCount,
      rawMentionCount: supportMentions.length,
      groupSupport,
      supportMentions,
      contextMentions,
      cautionMentions,
      stateMentions,
      isExcluded: excludedSet.has(number),
      isForced: forcedSet.has(number),
      isUserSelected: userSelectedSet.has(number),
    };
  }).sort(compareRows);

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

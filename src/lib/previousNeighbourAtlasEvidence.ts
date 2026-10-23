import type {
  PreviousNeighbourAtlasCompositionRow,
  PreviousNeighbourAtlasOrdinalRow,
  PreviousNeighbourCountShapeAtlasAnalysis,
} from "./previousNeighbourCountShapeAtlas";
import type {
  PreviousNeighbourShapeOffsetLabel,
  PreviousNeighbourShapeScope,
} from "./previousNeighbourShapeGuard";

const OFFSET_LABELS: readonly PreviousNeighbourShapeOffsetLabel[] = ["-2", "-1", "+1", "+2"];

export type PreviousNeighbourAtlasHistorySource = "baseline" | "wfmqyh";

export interface PreviousNeighbourAtlasNumberEvidence {
  number: number;
  directions: PreviousNeighbourShapeOffsetLabel[];
  ambiguous: boolean;
}

export interface PreviousNeighbourAtlasOrdinalEvidence {
  drawOrdinal: number;
  label: string;
  trials: number;
  sampleQuality: PreviousNeighbourAtlasOrdinalRow["sampleQuality"];
  averageTargetCount: number;
  averageFieldCoverage: number;
  averageUniqueHits: number;
  averageExpectedUniqueHits: number;
  lift: number | null;
  atLeastOneRate: number;
  atLeastThreeRate: number;
  atLeastFourRate: number;
  topPattern: string;
  topPatternCount: number;
}

export interface PreviousNeighbourAtlasPlanningEvidence {
  sourceDateLabel: string;
  sourceNumbers: number[];
  targetNumbers: number[];
  ambiguousTargetNumbers: number[];
  targetCount: number;
  oddTargetCount: number;
  evenTargetCount: number;
  oneDigitTargetCount: number;
  twoDigitTargetCount: number;
  numbers: PreviousNeighbourAtlasNumberEvidence[];
}

export interface PreviousNeighbourAtlasEvidenceSnapshot {
  version: 1;
  observeOnly: true;
  historySource: PreviousNeighbourAtlasHistorySource;
  historySourceLabel: string;
  scope: PreviousNeighbourShapeScope;
  lookbackDraws: 1 | 2;
  transitionCount: number;
  validDraws: number;
  excludedTargetDraws: number;
  excludedTargetMonthLabels: string[];
  targetDate?: string;
  targetDrawOrdinal?: number;
  targetMonthExpectedDrawCount?: number;
  overall: {
    averageUniqueHits: number;
    averageExpectedUniqueHits: number;
    averageDirectionalHits: number;
    lift: number | null;
  };
  composition: {
    oddLift: number | null;
    evenLift: number | null;
    oneDigitLift: number | null;
    twoDigitLift: number | null;
  };
  ordinalEvidence: PreviousNeighbourAtlasOrdinalEvidence | null;
  currentCloud: PreviousNeighbourAtlasPlanningEvidence | null;
  warnings: string[];
}

export interface PreviousNeighbourAtlasCandidateMatch {
  matchedNumbers: number[];
  ambiguousNumbers: number[];
  directionalCounts: Record<PreviousNeighbourShapeOffsetLabel, number>;
  directionalPattern: string;
}

const finiteNumber = (value: unknown, fallback = 0): number => (
  typeof value === "number" && Number.isFinite(value) ? value : fallback
);

const nullableFiniteNumber = (value: unknown): number | null => (
  typeof value === "number" && Number.isFinite(value) ? value : null
);

const positiveInteger = (value: unknown): number | undefined => {
  const parsed = finiteNumber(value, 0);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const normalizedLotteryNumbers = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((number): number is number => (
    typeof number === "number"
    && Number.isInteger(number)
    && number >= 1
    && number <= 45
  )))).sort((left, right) => left - right);
};

const compositionLift = (
  rows: readonly PreviousNeighbourAtlasCompositionRow[],
  key: PreviousNeighbourAtlasCompositionRow["key"],
): number | null => rows.find((row) => row.key === key)?.lift ?? null;

const ordinalEvidenceFromRow = (
  row: PreviousNeighbourAtlasOrdinalRow | undefined,
): PreviousNeighbourAtlasOrdinalEvidence | null => row ? ({
  drawOrdinal: row.drawOrdinal,
  label: row.label,
  trials: row.trials,
  sampleQuality: row.sampleQuality,
  averageTargetCount: row.averageTargetCount,
  averageFieldCoverage: row.averageFieldCoverage,
  averageUniqueHits: row.averageUniqueHits,
  averageExpectedUniqueHits: row.averageExpectedUniqueHits,
  lift: row.lift,
  atLeastOneRate: row.atLeastOneRate,
  atLeastThreeRate: row.atLeastThreeRate,
  atLeastFourRate: row.atLeastFourRate,
  topPattern: row.topPattern,
  topPatternCount: row.topPatternCount,
}) : null;

export function buildPreviousNeighbourAtlasEvidence(
  analysis: PreviousNeighbourCountShapeAtlasAnalysis,
  options: {
    historySource: PreviousNeighbourAtlasHistorySource;
    historySourceLabel: string;
    targetDate?: string;
    targetDrawOrdinal?: number;
    targetMonthExpectedDrawCount?: number;
  },
): PreviousNeighbourAtlasEvidenceSnapshot {
  const targetOrdinal = positiveInteger(options.targetDrawOrdinal);
  const ordinalEvidence = ordinalEvidenceFromRow(
    targetOrdinal === undefined
      ? undefined
      : analysis.byDrawOrdinal.find((row) => row.drawOrdinal === targetOrdinal),
  );
  const cloud = analysis.planningCloud;
  const currentCloud: PreviousNeighbourAtlasPlanningEvidence | null = cloud ? {
    sourceDateLabel: cloud.sourceDateLabel,
    sourceNumbers: [...cloud.sourceNumbers],
    targetNumbers: [...cloud.targetNumbers],
    ambiguousTargetNumbers: cloud.targetNumbers.filter((number) => (
      OFFSET_LABELS.filter((label) => cloud.targetsByOffset[label].includes(number)).length > 1
    )),
    targetCount: cloud.targetCount,
    oddTargetCount: cloud.oddTargetCount,
    evenTargetCount: cloud.evenTargetCount,
    oneDigitTargetCount: cloud.oneDigitTargetCount,
    twoDigitTargetCount: cloud.twoDigitTargetCount,
    numbers: cloud.targetNumbers.map((number) => {
      const directions = OFFSET_LABELS.filter((label) => cloud.targetsByOffset[label].includes(number));
      return {
        number,
        directions,
        ambiguous: directions.length > 1,
      };
    }),
  } : null;

  return {
    version: 1,
    observeOnly: true,
    historySource: options.historySource,
    historySourceLabel: options.historySourceLabel.trim() || "Neighbour Atlas history",
    scope: analysis.scope,
    lookbackDraws: analysis.lookbackDraws,
    transitionCount: analysis.transitionCount,
    validDraws: analysis.validDraws,
    excludedTargetDraws: analysis.excludedTargetDraws,
    excludedTargetMonthLabels: [...analysis.excludedTargetMonthLabels],
    ...(options.targetDate?.trim() ? { targetDate: options.targetDate.trim() } : {}),
    ...(targetOrdinal !== undefined ? { targetDrawOrdinal: targetOrdinal } : {}),
    ...(positiveInteger(options.targetMonthExpectedDrawCount) !== undefined
      ? { targetMonthExpectedDrawCount: positiveInteger(options.targetMonthExpectedDrawCount) }
      : {}),
    overall: {
      averageUniqueHits: analysis.averageUniqueHits,
      averageExpectedUniqueHits: analysis.averageExpectedUniqueHits,
      averageDirectionalHits: analysis.averageDirectionalHits,
      lift: analysis.lift,
    },
    composition: {
      oddLift: compositionLift(analysis.parity, "odd"),
      evenLift: compositionLift(analysis.parity, "even"),
      oneDigitLift: compositionLift(analysis.digitWidth, "one-digit"),
      twoDigitLift: compositionLift(analysis.digitWidth, "two-digit"),
    },
    ordinalEvidence,
    currentCloud,
    warnings: [...analysis.warnings],
  };
}

const normalizeDirectionLabels = (value: unknown): PreviousNeighbourShapeOffsetLabel[] => {
  if (!Array.isArray(value)) return [];
  const labels = new Set(value.filter((label): label is PreviousNeighbourShapeOffsetLabel => (
    typeof label === "string" && OFFSET_LABELS.includes(label as PreviousNeighbourShapeOffsetLabel)
  )));
  return OFFSET_LABELS.filter((label) => labels.has(label));
};

export function normalizePreviousNeighbourAtlasEvidence(
  value: unknown,
): PreviousNeighbourAtlasEvidenceSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<PreviousNeighbourAtlasEvidenceSnapshot>;
  if (snapshot.version !== 1 || snapshot.observeOnly !== true) return null;
  if (snapshot.historySource !== "baseline" && snapshot.historySource !== "wfmqyh") return null;
  if (snapshot.scope !== "mains" && snapshot.scope !== "mains-plus-supps") return null;
  if (snapshot.lookbackDraws !== 1 && snapshot.lookbackDraws !== 2) return null;

  const ordinalRaw = snapshot.ordinalEvidence as Partial<PreviousNeighbourAtlasOrdinalEvidence> | null | undefined;
  const ordinalValue = positiveInteger(ordinalRaw?.drawOrdinal);
  const quality = ordinalRaw?.sampleQuality;
  const ordinalEvidence = ordinalRaw && ordinalValue !== undefined && ["Broad", "Limited", "Thin"].includes(String(quality))
    ? {
      drawOrdinal: ordinalValue,
      label: typeof ordinalRaw.label === "string" ? ordinalRaw.label : `D${ordinalValue}`,
      trials: Math.max(0, Math.floor(finiteNumber(ordinalRaw.trials))),
      sampleQuality: quality as PreviousNeighbourAtlasOrdinalRow["sampleQuality"],
      averageTargetCount: finiteNumber(
        ordinalRaw.averageTargetCount,
        finiteNumber(ordinalRaw.averageExpectedUniqueHits) * (snapshot.scope === "mains" ? 45 / 6 : 45 / 8),
      ),
      averageFieldCoverage: finiteNumber(
        ordinalRaw.averageFieldCoverage,
        finiteNumber(ordinalRaw.averageExpectedUniqueHits) / (snapshot.scope === "mains" ? 6 : 8),
      ),
      averageUniqueHits: finiteNumber(ordinalRaw.averageUniqueHits),
      averageExpectedUniqueHits: finiteNumber(ordinalRaw.averageExpectedUniqueHits),
      lift: nullableFiniteNumber(ordinalRaw.lift),
      atLeastOneRate: finiteNumber(ordinalRaw.atLeastOneRate),
      atLeastThreeRate: finiteNumber(ordinalRaw.atLeastThreeRate),
      atLeastFourRate: finiteNumber(ordinalRaw.atLeastFourRate),
      topPattern: typeof ordinalRaw.topPattern === "string" ? ordinalRaw.topPattern : "none",
      topPatternCount: Math.max(0, Math.floor(finiteNumber(ordinalRaw.topPatternCount))),
    }
    : null;

  const cloudRaw = snapshot.currentCloud as Partial<PreviousNeighbourAtlasPlanningEvidence> | null | undefined;
  const targetNumbers = normalizedLotteryNumbers(cloudRaw?.targetNumbers);
  const numberRowsByNumber = new Map<number, PreviousNeighbourAtlasNumberEvidence>();
  if (Array.isArray(cloudRaw?.numbers)) {
    for (const rawRow of cloudRaw.numbers) {
      if (!rawRow || typeof rawRow !== "object") continue;
      const row = rawRow as Partial<PreviousNeighbourAtlasNumberEvidence>;
      if (!Number.isInteger(row.number) || (row.number ?? 0) < 1 || (row.number ?? 0) > 45) continue;
      const directions = normalizeDirectionLabels(row.directions);
      numberRowsByNumber.set(row.number as number, {
        number: row.number as number,
        directions,
        ambiguous: directions.length > 1,
      });
    }
  }
  const numbers = targetNumbers.map((number) => numberRowsByNumber.get(number) ?? ({
    number,
    directions: [],
    ambiguous: false,
  }));
  const currentCloud = cloudRaw && targetNumbers.length ? {
    sourceDateLabel: typeof cloudRaw.sourceDateLabel === "string" ? cloudRaw.sourceDateLabel : "Unknown",
    sourceNumbers: normalizedLotteryNumbers(cloudRaw.sourceNumbers),
    targetNumbers,
    ambiguousTargetNumbers: numbers.filter((row) => row.ambiguous).map((row) => row.number),
    targetCount: targetNumbers.length,
    oddTargetCount: targetNumbers.filter((number) => number % 2 !== 0).length,
    evenTargetCount: targetNumbers.filter((number) => number % 2 === 0).length,
    oneDigitTargetCount: targetNumbers.filter((number) => number < 10).length,
    twoDigitTargetCount: targetNumbers.filter((number) => number >= 10).length,
    numbers,
  } : null;

  const overall = snapshot.overall ?? {
    averageUniqueHits: 0,
    averageExpectedUniqueHits: 0,
    averageDirectionalHits: 0,
    lift: null,
  };
  const composition = snapshot.composition ?? {
    oddLift: null,
    evenLift: null,
    oneDigitLift: null,
    twoDigitLift: null,
  };

  return {
    version: 1,
    observeOnly: true,
    historySource: snapshot.historySource,
    historySourceLabel: typeof snapshot.historySourceLabel === "string" && snapshot.historySourceLabel.trim()
      ? snapshot.historySourceLabel.trim()
      : "Neighbour Atlas history",
    scope: snapshot.scope,
    lookbackDraws: snapshot.lookbackDraws,
    transitionCount: Math.max(0, Math.floor(finiteNumber(snapshot.transitionCount))),
    validDraws: Math.max(0, Math.floor(finiteNumber(snapshot.validDraws))),
    excludedTargetDraws: Math.max(0, Math.floor(finiteNumber(snapshot.excludedTargetDraws))),
    excludedTargetMonthLabels: Array.isArray(snapshot.excludedTargetMonthLabels)
      ? snapshot.excludedTargetMonthLabels.filter((label): label is string => typeof label === "string")
      : [],
    ...(typeof snapshot.targetDate === "string" && snapshot.targetDate.trim() ? { targetDate: snapshot.targetDate.trim() } : {}),
    ...(positiveInteger(snapshot.targetDrawOrdinal) !== undefined ? { targetDrawOrdinal: positiveInteger(snapshot.targetDrawOrdinal) } : {}),
    ...(positiveInteger(snapshot.targetMonthExpectedDrawCount) !== undefined
      ? { targetMonthExpectedDrawCount: positiveInteger(snapshot.targetMonthExpectedDrawCount) }
      : {}),
    overall: {
      averageUniqueHits: finiteNumber(overall.averageUniqueHits),
      averageExpectedUniqueHits: finiteNumber(overall.averageExpectedUniqueHits),
      averageDirectionalHits: finiteNumber(overall.averageDirectionalHits),
      lift: nullableFiniteNumber(overall.lift),
    },
    composition: {
      oddLift: nullableFiniteNumber(composition.oddLift),
      evenLift: nullableFiniteNumber(composition.evenLift),
      oneDigitLift: nullableFiniteNumber(composition.oneDigitLift),
      twoDigitLift: nullableFiniteNumber(composition.twoDigitLift),
    },
    ordinalEvidence,
    currentCloud,
    warnings: Array.isArray(snapshot.warnings)
      ? snapshot.warnings.filter((warning): warning is string => typeof warning === "string")
      : [],
  };
}

export function matchNumbersToPreviousNeighbourAtlas(
  numbers: readonly number[],
  evidence: PreviousNeighbourAtlasEvidenceSnapshot | null | undefined,
): PreviousNeighbourAtlasCandidateMatch {
  const normalizedNumbers = normalizedLotteryNumbers(numbers);
  const evidenceByNumber = new Map(
    (evidence?.currentCloud?.numbers ?? []).map((row) => [row.number, row] as const),
  );
  const matchedNumbers = normalizedNumbers.filter((number) => evidenceByNumber.has(number));
  const ambiguousNumbers = matchedNumbers.filter((number) => evidenceByNumber.get(number)?.ambiguous === true);
  const directionalCounts: Record<PreviousNeighbourShapeOffsetLabel, number> = {
    "-2": 0,
    "-1": 0,
    "+1": 0,
    "+2": 0,
  };

  for (const number of matchedNumbers) {
    for (const direction of evidenceByNumber.get(number)?.directions ?? []) {
      directionalCounts[direction] += 1;
    }
  }

  return {
    matchedNumbers,
    ambiguousNumbers,
    directionalCounts,
    directionalPattern: OFFSET_LABELS.map((label) => `${label}:${directionalCounts[label]}`).join(" "),
  };
}

import type {
  D1TerminalMomentumAnalysis,
  D1TerminalMomentumStageMode,
  D1TerminalMomentumStrength,
} from "./endingDigitSequences";

export interface D1TerminalMomentumDigitInfluence {
  digit: number;
  strength: D1TerminalMomentumStrength;
  baseFactor: number;
  numbers: number[];
  priorityNumbers: number[];
  repeatNumbers: number[];
  reason: string;
  nextHitRate: number | null;
  nextUniqueRate: number | null;
}

export interface D1TerminalMomentumGenerationProfile {
  enabled: boolean;
  userEnabled: boolean;
  internalStrength: D1TerminalMomentumStrength;
  stageMode: D1TerminalMomentumStageMode | "unavailable";
  monthLabel: string;
  completedStageDrawCount: number;
  targetDrawNumber: number | null;
  traceLabel: string;
  digits: D1TerminalMomentumDigitInfluence[];
  numberMultipliers: Record<number, number>;
}

export interface D1TerminalMomentumCandidateEvidence {
  hits: number;
  normalizedScore: number;
  trace: string[];
}

const MAX_NUMBER = 45;

const STRENGTH_FACTORS: Record<D1TerminalMomentumStrength, number> = {
  off: 1,
  light: 1.12,
  normal: 1.25,
  strong: 1.45,
};

const strengthRank: Record<D1TerminalMomentumStrength, number> = {
  off: 0,
  light: 1,
  normal: 2,
  strong: 3,
};

const formatStrength = (strength: D1TerminalMomentumStrength): string => (
  strength === "off" ? "off" : strength
);

const formatStageMode = (mode: D1TerminalMomentumGenerationProfile["stageMode"]): string => {
  if (mode === "early-unique") return "early unique expansion";
  if (mode === "terminal-momentum") return "terminal momentum";
  if (mode === "closed-review") return "closed-month review";
  return "unavailable";
};

const maxStrength = (strengths: D1TerminalMomentumStrength[]): D1TerminalMomentumStrength => (
  strengths.reduce<D1TerminalMomentumStrength>((best, strength) => (
    strengthRank[strength] > strengthRank[best] ? strength : best
  ), "off")
);

const safeNumbers = (numbers: readonly number[] | undefined): number[] => (
  Array.from(new Set((numbers ?? []).filter((number) => Number.isInteger(number) && number >= 1 && number <= MAX_NUMBER)))
    .sort((left, right) => left - right)
);

const traceForProfile = (
  profile: Omit<D1TerminalMomentumGenerationProfile, "traceLabel">,
  detail: string,
): string => (
  `D1 Terminal Momentum SGI: ${profile.userEnabled ? "ON" : "OFF"} · internal ${formatStrength(profile.internalStrength)} · ${detail}`
);

export function buildD1TerminalMomentumGenerationProfile(
  analysis: D1TerminalMomentumAnalysis | null | undefined,
  userEnabled: boolean,
): D1TerminalMomentumGenerationProfile {
  if (!userEnabled) {
    const profile = {
      enabled: false,
      userEnabled,
      internalStrength: "off" as D1TerminalMomentumStrength,
      stageMode: "unavailable" as const,
      monthLabel: "",
      completedStageDrawCount: 0,
      targetDrawNumber: null,
      digits: [],
      numberMultipliers: {},
    };
    return {
      ...profile,
      traceLabel: traceForProfile(profile, "soft weighting disabled by user"),
    };
  }

  if (!analysis) {
    const profile = {
      enabled: false,
      userEnabled,
      internalStrength: "off" as D1TerminalMomentumStrength,
      stageMode: "unavailable" as const,
      monthLabel: "",
      completedStageDrawCount: 0,
      targetDrawNumber: null,
      digits: [],
      numberMultipliers: {},
    };
    return {
      ...profile,
      traceLabel: traceForProfile(profile, "no current-month D1 evidence available"),
    };
  }

  const numberMultipliers: Record<number, number> = {};
  const digits = analysis.activeRows
    .filter((row) => row.suggestedStrength !== "off")
    .map<D1TerminalMomentumDigitInfluence>((row) => {
      const baseFactor = STRENGTH_FACTORS[row.suggestedStrength];
      const familyNumbers = safeNumbers(row.familyNumbers);
      const stageNumbers = new Set(safeNumbers(row.stageNumbers));
      const priorityNumbers = analysis.stageMode === "early-unique"
        ? familyNumbers.filter((number) => !stageNumbers.has(number))
        : familyNumbers;
      const repeatNumbers = analysis.stageMode === "early-unique"
        ? familyNumbers.filter((number) => stageNumbers.has(number))
        : [];

      for (const number of priorityNumbers) {
        numberMultipliers[number] = Math.max(numberMultipliers[number] ?? 1, baseFactor);
      }
      for (const number of repeatNumbers) {
        const repeatFactor = 1 + ((baseFactor - 1) * 0.35);
        numberMultipliers[number] = Math.max(numberMultipliers[number] ?? 1, repeatFactor);
      }

      return {
        digit: row.digit,
        strength: row.suggestedStrength,
        baseFactor,
        numbers: familyNumbers,
        priorityNumbers,
        repeatNumbers,
        reason: row.reason,
        nextHitRate: row.prior.nextHitRate,
        nextUniqueRate: row.prior.nextUniqueRate,
      };
    })
    .sort((left, right) => (
      strengthRank[right.strength] - strengthRank[left.strength]
      || right.baseFactor - left.baseFactor
      || left.digit - right.digit
    ));

  const internalStrength = maxStrength(digits.map((digit) => digit.strength));
  const enabled = internalStrength !== "off" && digits.length > 0;
  const profile = {
    enabled,
    userEnabled,
    internalStrength,
    stageMode: analysis.stageMode,
    monthLabel: analysis.monthLabel,
    completedStageDrawCount: analysis.completedStageDrawCount,
    targetDrawNumber: analysis.targetDrawNumber,
    digits,
    numberMultipliers,
  };

  const digitSummary = digits.length
    ? digits
        .slice(0, 6)
        .map((digit) => `${digit.digit}x${digit.baseFactor.toFixed(2)} (${digit.strength})`)
        .join(", ")
    : "no active D1-multi terminal digits";
  const targetLabel = analysis.stageMode === "closed-review"
    ? `${analysis.monthLabel} closed`
    : `${analysis.monthLabel} target D${analysis.targetDrawNumber}`;

  return {
    ...profile,
    traceLabel: traceForProfile(
      profile,
      `${targetLabel} ${formatStageMode(analysis.stageMode)} · ${digitSummary} · soft weighting only`,
    ),
  };
}

export function d1TerminalMomentumMultiplier(
  number: number,
  profile: D1TerminalMomentumGenerationProfile | null | undefined,
): number {
  if (!profile?.enabled) return 1;
  if (!Number.isInteger(number) || number < 1 || number > MAX_NUMBER) return 1;
  return Math.max(0.1, profile.numberMultipliers[number] ?? 1);
}

export function scoreD1TerminalMomentumCandidate(
  numbers: readonly number[],
  profile: D1TerminalMomentumGenerationProfile | null | undefined,
): D1TerminalMomentumCandidateEvidence {
  if (!profile?.enabled) {
    return { hits: 0, normalizedScore: 0, trace: [] };
  }

  let rawLift = 0;
  const hitsByDigit = new Map<number, number>();
  for (const number of numbers) {
    const multiplier = d1TerminalMomentumMultiplier(number, profile);
    if (multiplier <= 1) continue;
    rawLift += multiplier - 1;
    const digit = number % 10;
    hitsByDigit.set(digit, (hitsByDigit.get(digit) ?? 0) + 1);
  }

  const maxLift = numbers.length * (STRENGTH_FACTORS.strong - 1);
  const normalizedScore = maxLift > 0 ? Math.max(0, Math.min(1, rawLift / maxLift)) : 0;
  const trace = hitsByDigit.size
    ? [
        `D1 terminal momentum hits ${Array.from(hitsByDigit.entries())
          .sort(([leftDigit], [rightDigit]) => leftDigit - rightDigit)
          .map(([digit, count]) => `${digit}:${count}`)
          .join(" ")}`,
      ]
    : [];

  return {
    hits: Array.from(hitsByDigit.values()).reduce((sum, count) => sum + count, 0),
    normalizedScore,
    trace,
  };
}

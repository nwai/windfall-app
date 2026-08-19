import type { CandidateSet, Draw } from "../types";
import {
  computeWeekdayWindfallPrizeDivision,
  computeWeekdayWindfallPrizeHits,
  computeWeekdayWindfallPrizeScore,
  rankWeekdayWindfallPrizeDivision,
  type WeekdayWindfallPrizeDivision,
} from "./prizeDivisions";
import { sortDrawsChronologically } from "./recentDraws";

const MIN_NUMBER = 1;
const MAX_NUMBER = 45;
const REQUIRED_TARGET_COUNT = 8;
const MAIN_COUNT = 6;
const SUPP_COUNT = 2;

export interface SettingsSensitivityTarget {
  numbers: number[];
  main: number[];
  supp: number[];
  valid: boolean;
  warnings: string[];
}

export interface SettingsReplayProfile {
  id: string;
  label: string;
  selection: number[];
  main: number[];
  supp: number[];
  rationale: string;
}

export interface SettingsReplayScore {
  source: "profile" | "generated" | "paste-weighted";
  label: string;
  selection: number[];
  main: number[];
  supp: number[];
  totalHits: number;
  mainHits: number;
  suppHits: number;
  division: WeekdayWindfallPrizeDivision;
  prizeScore: number;
  oddEvenDelta: number;
  lowHighDelta: number;
  sumDelta: number;
  terminalDigitOverlap: number;
  replayScore: number;
  rationale?: string;
}

export interface SettingsSensitivityReplayResult {
  target: SettingsSensitivityTarget;
  historyLabel: string;
  profileRows: SettingsReplayScore[];
  candidateRows: SettingsReplayScore[];
  bestProfile: SettingsReplayScore | null;
  bestCandidate: SettingsReplayScore | null;
  warnings: string[];
  methodology: string[];
}

interface NumberEvidence {
  number: number;
  allCount: number;
  activeCount: number;
  recent50Count: number;
  recent20Weighted: number;
  droughtLength: number;
  activeTerminalCount: number;
}

export function parseSettingsReplayTarget(input: string): SettingsSensitivityTarget {
  const rawNumbers = (input.match(/-?\d+/g) ?? []).map(Number);
  const warnings: string[] = [];
  const seen = new Set<number>();
  const numbers: number[] = [];

  for (const value of rawNumbers) {
    if (!Number.isInteger(value) || value < MIN_NUMBER || value > MAX_NUMBER) {
      warnings.push(`Ignored out-of-range value ${value}; target numbers must be 1-45.`);
      continue;
    }
    if (seen.has(value)) {
      warnings.push(`Ignored duplicate target number ${value}.`);
      continue;
    }
    seen.add(value);
    numbers.push(value);
  }

  if (numbers.length !== REQUIRED_TARGET_COUNT) {
    warnings.push(`Enter exactly ${REQUIRED_TARGET_COUNT} unique target numbers. The first ${MAIN_COUNT} are treated as mains and the final ${SUPP_COUNT} as supps for prize-division scoring.`);
  }

  const valid = numbers.length === REQUIRED_TARGET_COUNT;
  const trimmed = valid ? numbers : numbers.slice(0, REQUIRED_TARGET_COUNT);
  return {
    numbers: trimmed,
    main: trimmed.slice(0, MAIN_COUNT),
    supp: trimmed.slice(MAIN_COUNT, REQUIRED_TARGET_COUNT),
    valid,
    warnings,
  };
}

const normalizeCandidateNumbers = (values: readonly number[]): number[] => (
  [...new Set(values)]
    .filter((value) => Number.isInteger(value) && value >= MIN_NUMBER && value <= MAX_NUMBER)
    .slice(0, REQUIRED_TARGET_COUNT)
);

const drawNumbers = (draw: Draw): number[] => (
  normalizeCandidateNumbers([...(draw.main ?? []), ...(draw.supp ?? [])])
);

const minMaxNormalize = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value) || max <= min) return 0;
  return (value - min) / (max - min);
};

const buildEvidence = (
  allHistory: readonly Draw[],
  activeHistory: readonly Draw[],
): NumberEvidence[] => {
  const all = sortDrawsChronologically(allHistory.filter((draw) => !draw.isSimulated));
  const active = sortDrawsChronologically(activeHistory.filter((draw) => !draw.isSimulated));
  const recent50 = all.slice(-50);
  const recent20 = all.slice(-20);
  const latestFirst = [...all].reverse();

  return Array.from({ length: MAX_NUMBER }, (_, index) => {
    const number = index + 1;
    const terminal = number % 10;
    const allCount = all.reduce((count, draw) => count + (drawNumbers(draw).includes(number) ? 1 : 0), 0);
    const activeCount = active.reduce((count, draw) => count + (drawNumbers(draw).includes(number) ? 1 : 0), 0);
    const recent50Count = recent50.reduce((count, draw) => count + (drawNumbers(draw).includes(number) ? 1 : 0), 0);
    const recent20Weighted = recent20.reduce((score, draw, drawIndex) => {
      const age = recent20.length - 1 - drawIndex;
      const weight = Math.exp(-age / 8);
      return score + (drawNumbers(draw).includes(number) ? weight : 0);
    }, 0);
    const droughtIndex = latestFirst.findIndex((draw) => drawNumbers(draw).includes(number));
    const droughtLength = droughtIndex >= 0 ? droughtIndex : all.length;
    const activeTerminalCount = active.reduce((count, draw) => (
      count + drawNumbers(draw).filter((drawNumber) => drawNumber % 10 === terminal).length
    ), 0);

    return {
      number,
      allCount,
      activeCount,
      recent50Count,
      recent20Weighted,
      droughtLength,
      activeTerminalCount,
    };
  });
};

const selectTopNumbers = (
  evidence: readonly NumberEvidence[],
  scoreFor: (row: NumberEvidence, normalized: Record<keyof Omit<NumberEvidence, "number">, number>) => number,
): number[] => {
  const metrics: Array<keyof Omit<NumberEvidence, "number">> = [
    "allCount",
    "activeCount",
    "recent50Count",
    "recent20Weighted",
    "droughtLength",
    "activeTerminalCount",
  ];
  const bounds = Object.fromEntries(metrics.map((metric) => {
    const values = evidence.map((row) => row[metric]);
    return [metric, { min: Math.min(...values), max: Math.max(...values) }];
  })) as Record<keyof Omit<NumberEvidence, "number">, { min: number; max: number }>;

  return [...evidence]
    .map((row) => {
      const normalized = Object.fromEntries(metrics.map((metric) => [
        metric,
        minMaxNormalize(row[metric], bounds[metric].min, bounds[metric].max),
      ])) as Record<keyof Omit<NumberEvidence, "number">, number>;
      return {
        number: row.number,
        score: scoreFor(row, normalized),
      };
    })
    .sort((left, right) => right.score - left.score || left.number - right.number)
    .slice(0, REQUIRED_TARGET_COUNT)
    .map((row) => row.number);
};

export function buildSettingsReplayProfiles(
  allHistory: readonly Draw[],
  activeHistory: readonly Draw[] = allHistory,
): SettingsReplayProfile[] {
  const evidence = buildEvidence(allHistory, activeHistory.length ? activeHistory : allHistory);
  if (!evidence.length) return [];

  const profileSpecs: Array<{
    id: string;
    label: string;
    rationale: string;
    scoreFor: (row: NumberEvidence, normalized: Record<keyof Omit<NumberEvidence, "number">, number>) => number;
  }> = [
    {
      id: "all-history-frequency",
      label: "All-history frequency",
      rationale: "Top numbers by real all-history main+supp occurrence count.",
      scoreFor: (_row, norm) => norm.allCount,
    },
    {
      id: "active-window-frequency",
      label: "Active WFMQYH frequency",
      rationale: "Top numbers by occurrence count inside the active WFMQYH draw window.",
      scoreFor: (_row, norm) => norm.activeCount,
    },
    {
      id: "recent-50-frequency",
      label: "Latest 50 frequency",
      rationale: "Top numbers by occurrence count in the latest 50 real draws.",
      scoreFor: (_row, norm) => norm.recent50Count,
    },
    {
      id: "recent-20-weighted",
      label: "Latest 20 weighted",
      rationale: "Top numbers by exponential recency weight in the latest 20 real draws.",
      scoreFor: (_row, norm) => norm.recent20Weighted,
    },
    {
      id: "drought-length",
      label: "Current drought length",
      rationale: "Top numbers by current draws-since-seen length. This is diagnostic, not proof of due-ness.",
      scoreFor: (_row, norm) => norm.droughtLength,
    },
    {
      id: "terminal-family-support",
      label: "Terminal-family support",
      rationale: "Numbers whose terminal digit family is active in the WFMQYH window receive support.",
      scoreFor: (_row, norm) => (norm.activeTerminalCount * 0.7) + (norm.activeCount * 0.3),
    },
    {
      id: "balanced-history-recent",
      label: "Balanced history/recent",
      rationale: "Equal-pressure blend of all-history count, WFMQYH count, recent weight, and mild drought evidence.",
      scoreFor: (_row, norm) => (
        (norm.allCount * 0.25)
        + (norm.activeCount * 0.30)
        + (norm.recent20Weighted * 0.30)
        + (norm.droughtLength * 0.15)
      ),
    },
  ];

  return profileSpecs.map((spec) => {
    const selection = selectTopNumbers(evidence, spec.scoreFor);
    return {
      id: spec.id,
      label: spec.label,
      selection,
      main: selection.slice(0, MAIN_COUNT),
      supp: selection.slice(MAIN_COUNT, REQUIRED_TARGET_COUNT),
      rationale: spec.rationale,
    };
  });
}

const oddCount = (numbers: readonly number[]): number => numbers.filter((number) => number % 2 === 1).length;
const lowCount = (numbers: readonly number[]): number => numbers.filter((number) => number <= 22).length;
const numberSum = (numbers: readonly number[]): number => numbers.reduce((sum, number) => sum + number, 0);
const terminalDigits = (numbers: readonly number[]): Set<number> => new Set(numbers.map((number) => number % 10));

export function scoreSettingsReplaySelection(
  input: {
    source: SettingsReplayScore["source"];
    label: string;
    selection: readonly number[];
    target: SettingsSensitivityTarget;
    rationale?: string;
  },
): SettingsReplayScore {
  const selection = normalizeCandidateNumbers(input.selection);
  const main = selection.slice(0, MAIN_COUNT);
  const supp = selection.slice(MAIN_COUNT, REQUIRED_TARGET_COUNT);
  const targetMain = new Set(input.target.main);
  const targetSupp = new Set(input.target.supp);
  const targetAll = new Set(input.target.numbers);
  const totalHits = selection.filter((number) => targetAll.has(number)).length;
  const { mainHits, suppHits } = computeWeekdayWindfallPrizeHits(main, targetMain, targetSupp, supp);
  const division = computeWeekdayWindfallPrizeDivision(main, supp, targetMain, targetSupp);
  const prizeScore = computeWeekdayWindfallPrizeScore(main, supp, targetMain, targetSupp);
  const oddEvenDelta = Math.abs(oddCount(selection) - oddCount(input.target.numbers));
  const lowHighDelta = Math.abs(lowCount(selection) - lowCount(input.target.numbers));
  const sumDelta = Math.abs(numberSum(selection) - numberSum(input.target.numbers));
  const targetTerminals = terminalDigits(input.target.numbers);
  const terminalDigitOverlap = Array.from(terminalDigits(selection)).filter((digit) => targetTerminals.has(digit)).length;
  const replayScore = (
    prizeScore * 10
    + totalHits * 100
    + terminalDigitOverlap * 12
    - oddEvenDelta * 8
    - lowHighDelta * 6
    - Math.min(80, sumDelta)
    - rankWeekdayWindfallPrizeDivision(division)
  );

  return {
    source: input.source,
    label: input.label,
    selection,
    main,
    supp,
    totalHits,
    mainHits,
    suppHits,
    division,
    prizeScore,
    oddEvenDelta,
    lowHighDelta,
    sumDelta,
    terminalDigitOverlap,
    replayScore,
    rationale: input.rationale,
  };
}

const sortScores = (rows: SettingsReplayScore[]): SettingsReplayScore[] => (
  [...rows].sort((left, right) => (
    rankWeekdayWindfallPrizeDivision(left.division) - rankWeekdayWindfallPrizeDivision(right.division)
    || right.totalHits - left.totalHits
    || right.prizeScore - left.prizeScore
    || right.terminalDigitOverlap - left.terminalDigitOverlap
    || left.sumDelta - right.sumDelta
    || right.replayScore - left.replayScore
    || left.label.localeCompare(right.label)
  ))
);

export function runSettingsSensitivityReplay(input: {
  targetInput: string;
  history: readonly Draw[];
  activeHistory?: readonly Draw[];
  generatedCandidates?: readonly CandidateSet[];
  pasteWeightedCandidates?: readonly CandidateSet[];
  historyScopeLabel?: string;
}): SettingsSensitivityReplayResult {
  const target = parseSettingsReplayTarget(input.targetInput);
  const warnings = [...target.warnings];
  const realHistory = input.history.filter((draw) => !draw.isSimulated);
  const activeRealHistory = (input.activeHistory?.length ? input.activeHistory : input.history)
    .filter((draw) => !draw.isSimulated);

  if (input.history.length !== realHistory.length) {
    warnings.push(`Ignored ${input.history.length - realHistory.length} simulated fallback draw row${input.history.length - realHistory.length === 1 ? "" : "s"}; replay profiles use real draws only.`);
  }

  if (!target.valid) {
    return {
      target,
      historyLabel: input.historyScopeLabel ?? `${activeRealHistory.length} active real draws`,
      profileRows: [],
      candidateRows: [],
      bestProfile: null,
      bestCandidate: null,
      warnings,
      methodology: buildSettingsReplayMethodology(),
    };
  }

  const profiles = buildSettingsReplayProfiles(realHistory, activeRealHistory);
  const profileRows = sortScores(profiles.map((profile) => scoreSettingsReplaySelection({
    source: "profile",
    label: profile.label,
    selection: profile.selection,
    target,
    rationale: profile.rationale,
  })));

  const candidateRows = sortScores([
    ...(input.generatedCandidates ?? []).map((candidate, index) => scoreSettingsReplaySelection({
      source: "generated" as const,
      label: `Generated #${index + 1}`,
      selection: [...candidate.main, ...candidate.supp],
      target,
    })),
    ...(input.pasteWeightedCandidates ?? []).map((candidate, index) => scoreSettingsReplaySelection({
      source: "paste-weighted" as const,
      label: `Paste-weighted #${index + 1}`,
      selection: [...candidate.main, ...candidate.supp],
      target,
    })),
  ]);

  if (!candidateRows.length) {
    warnings.push("No current generated or paste-weighted candidates were available to score.");
  }

  return {
    target,
    historyLabel: input.historyScopeLabel ?? `${activeRealHistory.length} active real draws`,
    profileRows,
    candidateRows,
    bestProfile: profileRows[0] ?? null,
    bestCandidate: candidateRows[0] ?? null,
    warnings,
    methodology: buildSettingsReplayMethodology(),
  };
}

export function buildSettingsReplayMethodology(): string[] {
  return [
    "Retrospective replay only: the target draw is used for scoring after the fact, not for training profile rows.",
    "Profile rows are pre-registered simple evidence profiles from real history: all-history frequency, active WFMQYH frequency, recent frequency, weighted recency, drought length, terminal-family support, and a balanced blend.",
    "Prize divisions reuse the same Weekday Windfall prize ladder used by Generated Candidates. The first six target numbers are treated as mains and the final two as supplementaries.",
    "Replay score is a sorting aid, not a probability. Prize division and hit counts should be read before the score.",
  ];
}

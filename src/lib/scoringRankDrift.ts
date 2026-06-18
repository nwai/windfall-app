import type { Draw } from "../types";
import {
  analyzeScoringSystemDiagnostics,
  normalizeScoringMonthSearch,
  normalizeTerminalDigitSetSearch,
  type ScoringDiagnosticsScope,
} from "./scoringSystemDiagnostics";

export type RankDriftEntity = "numbers" | "terminal-digits" | "digit-sets" | "straight-runs";
export type RankDriftStep = "draw" | "weekly" | "month";
export type RankDriftDirection = "Progressing" | "Regressing" | "Flat" | "Insufficient history";

export interface ScoringRankDriftOptions {
  entity: RankDriftEntity;
  key: string;
  scope?: ScoringDiagnosticsScope;
  startAfter?: number;
  step?: RankDriftStep;
  filteredWindow?: number;
}

export interface ScoringRankDriftSnapshot {
  date: string;
  drawCount: number;
  rowKey: string;
  label: string;
  rank: number;
  combinedDiagnosticScore: number;
  fullHistoryScore: number;
  wfmqyhScore: number;
  rankMovement: number | null;
}

export interface ScoringRankDriftSummary {
  direction: RankDriftDirection;
  currentRank: number | null;
  firstRank: number | null;
  bestRank: number | null;
  worstRank: number | null;
  rankChange: number | null;
  recentRankChange: number | null;
  currentScore: number | null;
  firstScore: number | null;
  scoreChange: number | null;
  recentScoreSlope: number;
  volatility: number;
}

export interface ScoringRankDriftResult {
  provenance: {
    scope: ScoringDiagnosticsScope;
    validDraws: number;
    skippedDraws: number;
    usedSnapshots: number;
    startAfter: number;
    step: RankDriftStep;
    filteredWindow: number;
  };
  entity: RankDriftEntity;
  selectedKey: string;
  selectedLabel: string;
  summary: ScoringRankDriftSummary;
  snapshots: ScoringRankDriftSnapshot[];
  warnings: string[];
}

const MAX_NUMBER = 45;

const isValidNumber = (value: unknown): value is number => (
  typeof value === "number"
  && Number.isInteger(value)
  && Number.isFinite(value)
  && value >= 1
  && value <= MAX_NUMBER
);

const numbersForScope = (draw: Draw, scope: ScoringDiagnosticsScope): number[] => (
  scope === "mains" ? draw.main : [...draw.main, ...(draw.supp ?? [])]
);

const isValidDrawForScope = (draw: Draw, scope: ScoringDiagnosticsScope): boolean => {
  const expectedCount = scope === "mains" ? 6 : 8;
  const numbers = numbersForScope(draw, scope);
  if (numbers.length !== expectedCount) return false;
  const seen = new Set<number>();
  for (const number of numbers) {
    if (!isValidNumber(number) || seen.has(number)) return false;
    seen.add(number);
  }
  return true;
};

const normalizeSelectedKey = (entity: RankDriftEntity, key: string): string | null => {
  const trimmed = key.trim();
  if (!trimmed) return null;
  if (entity === "numbers") {
    const number = Number(trimmed);
    return Number.isInteger(number) && number >= 1 && number <= MAX_NUMBER ? String(number) : null;
  }
  if (entity === "terminal-digits") {
    const digit = Number(trimmed);
    return Number.isInteger(digit) && digit >= 0 && digit <= 9 ? String(digit) : null;
  }
  return normalizeTerminalDigitSetSearch(trimmed);
};

const fallbackLabel = (entity: RankDriftEntity, key: string): string => {
  if (entity === "numbers") return `Number ${key}`;
  if (entity === "terminal-digits") return `Terminal digit ${key}`;
  if (entity === "straight-runs") return `Straight run ${key}`;
  return `Unique terminal digits ${key}`;
};

type ExtractedRow = {
  key: string;
  label: string;
  rank: number;
  combinedDiagnosticScore: number;
  fullHistoryScore: number;
  wfmqyhScore: number;
  rankMovement: number | null;
};

const extractRow = (
  draws: Draw[],
  filteredDraws: Draw[],
  entity: RankDriftEntity,
  key: string,
  scope: ScoringDiagnosticsScope,
): ExtractedRow | null => {
  const diagnostics = analyzeScoringSystemDiagnostics(draws, filteredDraws, { scope });

  if (entity === "numbers") {
    const row = diagnostics.numberRows.find((candidate) => String(candidate.number) === key);
    return row ? {
      key,
      label: `Number ${key}`,
      rank: row.rank,
      combinedDiagnosticScore: row.combinedDiagnosticScore,
      fullHistoryScore: row.fullHistoryScore,
      wfmqyhScore: row.wfmqyhScore,
      rankMovement: row.rankMovement,
    } : null;
  }

  if (entity === "terminal-digits") {
    const row = diagnostics.terminalDigitRows.find((candidate) => String(candidate.terminalDigit) === key);
    return row ? {
      key,
      label: `Terminal digit ${key}`,
      rank: row.rank,
      combinedDiagnosticScore: row.combinedDiagnosticScore,
      fullHistoryScore: row.fullHistoryScore,
      wfmqyhScore: row.wfmqyhScore,
      rankMovement: row.rankMovement,
    } : null;
  }

  const rows = entity === "straight-runs" ? diagnostics.straightRunRows : diagnostics.terminalDigitSetRows;
  const row = rows.find((candidate) => candidate.key === key);
  return row ? {
    key,
    label: entity === "straight-runs" ? `Straight run ${key}` : `Unique terminal digits ${key}`,
    rank: row.rank,
    combinedDiagnosticScore: row.combinedDiagnosticScore,
    fullHistoryScore: row.fullHistoryScore,
    wfmqyhScore: row.wfmqyhScore,
    rankMovement: row.rankMovement,
  } : null;
};

const monthKeyForDraw = (draw: Draw): string => normalizeScoringMonthSearch(draw.date)?.key ?? draw.date;

const shouldUseSnapshot = (
  index: number,
  startIndex: number,
  lastIndex: number,
  step: RankDriftStep,
  draws: Draw[],
): boolean => {
  if (index === lastIndex) return true;
  if (step === "draw") return true;
  if (step === "weekly") return (index - startIndex) % 3 === 0;
  return monthKeyForDraw(draws[index]) !== monthKeyForDraw(draws[index + 1]);
};

const standardDeviation = (values: number[]): number => {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Number(Math.sqrt(variance).toFixed(2));
};

const buildSummary = (snapshots: ScoringRankDriftSnapshot[], filteredWindow: number): ScoringRankDriftSummary => {
  if (snapshots.length === 0) {
    return {
      direction: "Insufficient history",
      currentRank: null,
      firstRank: null,
      bestRank: null,
      worstRank: null,
      rankChange: null,
      recentRankChange: null,
      currentScore: null,
      firstScore: null,
      scoreChange: null,
      recentScoreSlope: 0,
      volatility: 0,
    };
  }

  const first = snapshots[0];
  const current = snapshots[snapshots.length - 1];
  const recentSpan = Math.min(Math.max(2, filteredWindow), snapshots.length);
  const recentStart = snapshots[snapshots.length - recentSpan];
  const rankChanges = snapshots.slice(1).map((snapshot, index) => snapshots[index].rank - snapshot.rank);
  const recentRankChange = recentStart.rank - current.rank;
  const recentScoreSlope = recentSpan > 1
    ? Number(((current.combinedDiagnosticScore - recentStart.combinedDiagnosticScore) / (recentSpan - 1)).toFixed(2))
    : 0;

  let direction: RankDriftDirection = "Insufficient history";
  if (snapshots.length >= 3) {
    if (recentRankChange >= 2 || (recentRankChange === 0 && recentScoreSlope > 0)) {
      direction = "Progressing";
    } else if (recentRankChange <= -2 || (recentRankChange === 0 && recentScoreSlope < 0)) {
      direction = "Regressing";
    } else {
      direction = "Flat";
    }
  }

  return {
    direction,
    currentRank: current.rank,
    firstRank: first.rank,
    bestRank: Math.min(...snapshots.map((snapshot) => snapshot.rank)),
    worstRank: Math.max(...snapshots.map((snapshot) => snapshot.rank)),
    rankChange: first.rank - current.rank,
    recentRankChange,
    currentScore: current.combinedDiagnosticScore,
    firstScore: first.combinedDiagnosticScore,
    scoreChange: Number((current.combinedDiagnosticScore - first.combinedDiagnosticScore).toFixed(2)),
    recentScoreSlope,
    volatility: standardDeviation(rankChanges),
  };
};

export const analyzeScoringRankDrift = (
  draws: Draw[],
  options: ScoringRankDriftOptions,
): ScoringRankDriftResult => {
  const scope = options.scope ?? "mains-plus-supps";
  const step = options.step ?? "draw";
  const startAfter = Math.max(1, Math.floor(options.startAfter ?? 50));
  const filteredWindow = Math.max(1, Math.floor(options.filteredWindow ?? 50));
  const selectedKey = normalizeSelectedKey(options.entity, options.key);
  const validDraws = draws.filter((draw) => isValidDrawForScope(draw, scope));
  const warnings: string[] = [];

  if (!selectedKey) warnings.push("Selected item was not found in the available walk-forward snapshots.");

  const snapshots: ScoringRankDriftSnapshot[] = [];
  const startIndex = Math.min(startAfter, validDraws.length);
  const lastIndex = validDraws.length - 1;

  if (selectedKey && validDraws.length > startAfter) {
    for (let index = startIndex; index < validDraws.length; index += 1) {
      if (!shouldUseSnapshot(index, startIndex, lastIndex, step, validDraws)) continue;
      const historyToDate = validDraws.slice(0, index + 1);
      const filteredToDate = historyToDate.slice(-filteredWindow);
      const row = extractRow(historyToDate, filteredToDate, options.entity, selectedKey, scope);
      if (!row) continue;
      snapshots.push({
        date: validDraws[index].date,
        drawCount: index + 1,
        rowKey: row.key,
        label: row.label,
        rank: row.rank,
        combinedDiagnosticScore: row.combinedDiagnosticScore,
        fullHistoryScore: row.fullHistoryScore,
        wfmqyhScore: row.wfmqyhScore,
        rankMovement: row.rankMovement,
      });
    }
  }

  if (snapshots.length === 0 && selectedKey) {
    warnings.push("Selected item was not found in the available walk-forward snapshots.");
  }
  if (snapshots.length < 3) {
    warnings.push("Fewer than three walk-forward snapshots are available.");
  }

  const summary = buildSummary(snapshots, filteredWindow);
  const selectedLabel = fallbackLabel(options.entity, selectedKey ?? options.key.trim());

  return {
    provenance: {
      scope,
      validDraws: validDraws.length,
      skippedDraws: draws.length - validDraws.length,
      usedSnapshots: snapshots.length,
      startAfter,
      step,
      filteredWindow,
    },
    entity: options.entity,
    selectedKey: selectedKey ?? options.key.trim(),
    selectedLabel,
    summary,
    snapshots,
    warnings: [...new Set(warnings)],
  };
};

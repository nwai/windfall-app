import type { AppPresetSnapshot } from "./presets";
import {
  computeWeekdayWindfallPrizeDivision,
  computeWeekdayWindfallPrizeHits,
  rankWeekdayWindfallPrizeDivision,
  type WeekdayWindfallPrizeDivision,
} from "./prizeDivisions";
import type { CandidateSet, Draw } from "../types";

export const PREDICTION_CAPTURE_FORMAT = "windfall-prediction-capture";
export const PREDICTION_CAPTURE_VERSION = 1;
export const PREDICTION_CAPTURE_PLAY_COST_CENTS = 67;

export type PredictionCaptureStatus = "active" | "ended";
export type PredictionCaptureAction = "generated" | "kept" | "copied" | "exported";
export type PredictionCaptureInputSource = "captured" | "pasted" | "manual";

export interface PredictionCaptureRunSnapshot {
  id: string;
  capturedAt: string;
  action: PredictionCaptureAction;
  setupSnapshot: AppPresetSnapshot;
  latestDrawDate?: string;
  latestDrawFingerprint?: string;
  windowLabel: string;
  windowDrawCount: number;
  displayedCandidateCount: number;
  rowIds: string[];
}

export interface PredictionCaptureCandidateRow {
  id: string;
  runId: string;
  capturedAt: string;
  sourceIndex: number;
  main: number[];
  supp: number[];
  mainKey: string;
  forecastKey?: string;
}

export interface PredictionCaptureSession {
  format: typeof PREDICTION_CAPTURE_FORMAT;
  version: typeof PREDICTION_CAPTURE_VERSION;
  id: string;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  status: PredictionCaptureStatus;
  runs: PredictionCaptureRunSnapshot[];
  rows: PredictionCaptureCandidateRow[];
}

export interface PredictionCaptureGameSummary {
  mainKey: string;
  numbers: number[];
  capturedOccurrenceCount: number;
  rowIds: string[];
  runIds: string[];
  analyticalForecasts: Array<{ main: number[]; supp: number[]; forecastKey: string }>;
}

export interface ParsedPredictionCaptureRow {
  lineNumber: number;
  raw: string;
  numbers: number[];
  game: number[] | null;
  forecast: { main: number[]; supp: number[] } | null;
  error?: string;
}

export interface PredictionCapturePlayedGame {
  id: string;
  numbers: number[];
  mainKey: string;
  quantity: number;
  inputSources: PredictionCaptureInputSource[];
  provenance: {
    status: "matched" | "external";
    rowIds: string[];
    runIds: string[];
  };
}

export interface PredictionCaptureAnalyticalForecast {
  id: string;
  main: number[];
  supp: number[];
  forecastKey: string;
  provenance: {
    status: "matched" | "external";
    rowIds: string[];
    runIds: string[];
  };
}

export interface PredictionCaptureBatch {
  version: 1;
  id: string;
  sessionId?: string;
  savedAt: string;
  unitCostCents: number;
  games: PredictionCapturePlayedGame[];
  analyticalForecasts: PredictionCaptureAnalyticalForecast[];
  runSnapshots: PredictionCaptureRunSnapshot[];
  sourceSummary: {
    capturedGames: number;
    externalGames: number;
    distinctGames: number;
    purchasedLines: number;
  };
}

export interface PredictionCaptureGameScore {
  gameId: string;
  numbers: number[];
  quantity: number;
  mainHits: number;
  suppHits: number;
  division: WeekdayWindfallPrizeDivision;
}

export interface PredictionCaptureForecastScore {
  forecastId: string;
  main: number[];
  supp: number[];
  selectedMainHits: number;
  selectedSuppHits: number;
  drawMainHits: number;
  drawSuppHits: number;
  division: WeekdayWindfallPrizeDivision;
}

export interface PredictionCaptureBatchScore {
  targetDate: string;
  gameScores: PredictionCaptureGameScore[];
  forecastScores: PredictionCaptureForecastScore[];
  distinctGameCount: number;
  purchasedLineCount: number;
  totalCostCents: number;
  uniquePlayedNumbers: number[];
  coveredMainNumbers: number[];
  coveredSuppNumbers: number[];
  coveredDrawNumbers: number[];
  allEightSpreadCovered: boolean;
  bestDivision: WeekdayWindfallPrizeDivision;
  bestGameIds: string[];
}

const validLotteryNumber = (value: unknown): value is number => (
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 45
);

const uniqueNumbers = (values: readonly number[]): number[] => Array.from(new Set(values));

const cloneSnapshot = (snapshot: AppPresetSnapshot): AppPresetSnapshot => (
  JSON.parse(JSON.stringify(snapshot)) as AppPresetSnapshot
);

const createId = (prefix: string, now: string, suffix = ""): string => {
  const time = Date.parse(now);
  const timePart = Number.isFinite(time) ? Math.trunc(time).toString(36) : Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${timePart}-${randomPart}${suffix}`;
};

export const predictionCaptureMainKey = (numbers: readonly number[]): string | null => {
  if (numbers.length !== 6 || numbers.some((number) => !validLotteryNumber(number))) return null;
  const unique = uniqueNumbers(numbers);
  if (unique.length !== 6) return null;
  return unique.slice().sort((left, right) => left - right).join("-");
};

export const normalizePredictionCaptureGame = (numbers: readonly number[]): number[] | null => {
  const key = predictionCaptureMainKey(numbers);
  return key ? key.split("-").map(Number) : null;
};

export const normalizePredictionCaptureForecast = (
  main: readonly number[],
  supp: readonly number[],
): { main: number[]; supp: number[]; forecastKey: string } | null => {
  const normalizedMain = normalizePredictionCaptureGame(main);
  if (!normalizedMain || supp.length !== 2 || supp.some((number) => !validLotteryNumber(number))) return null;
  const normalizedSupp = uniqueNumbers(supp).sort((left, right) => left - right);
  if (normalizedSupp.length !== 2 || normalizedSupp.some((number) => normalizedMain.includes(number))) return null;
  return {
    main: normalizedMain,
    supp: normalizedSupp,
    forecastKey: `${normalizedMain.join("-")}|${normalizedSupp.join("-")}`,
  };
};

export const createPredictionCaptureSession = (now = new Date().toISOString()): PredictionCaptureSession => ({
  format: PREDICTION_CAPTURE_FORMAT,
  version: PREDICTION_CAPTURE_VERSION,
  id: createId("prediction-capture", now),
  startedAt: now,
  updatedAt: now,
  status: "active",
  runs: [],
  rows: [],
});

export const setPredictionCaptureSessionStatus = (
  session: PredictionCaptureSession,
  status: PredictionCaptureStatus,
  now = new Date().toISOString(),
): PredictionCaptureSession => ({
  ...session,
  status,
  updatedAt: now,
  endedAt: status === "ended" ? now : undefined,
});

export interface AppendPredictionCaptureRunOptions {
  action: PredictionCaptureAction;
  candidates: readonly CandidateSet[];
  setupSnapshot: AppPresetSnapshot;
  now?: string;
  latestDrawDate?: string;
  latestDrawFingerprint?: string;
  windowLabel: string;
  windowDrawCount: number;
}

export interface AppendPredictionCaptureRunResult {
  session: PredictionCaptureSession;
  capturedRows: number;
  rejectedRows: number;
  runId?: string;
}

export const appendPredictionCaptureRun = (
  session: PredictionCaptureSession,
  options: AppendPredictionCaptureRunOptions,
): AppendPredictionCaptureRunResult => {
  if (session.status !== "active") return { session, capturedRows: 0, rejectedRows: 0 };

  const now = options.now ?? new Date().toISOString();
  const runId = createId("capture-run", now, `-${session.runs.length + 1}`);
  const rows: PredictionCaptureCandidateRow[] = [];
  let rejectedRows = 0;

  options.candidates.forEach((candidate, sourceIndex) => {
    const main = normalizePredictionCaptureGame(candidate.main);
    if (!main) {
      rejectedRows += 1;
      return;
    }
    const forecast = normalizePredictionCaptureForecast(candidate.main, candidate.supp);
    const rowId = `${runId}-row-${sourceIndex + 1}`;
    rows.push({
      id: rowId,
      runId,
      capturedAt: now,
      sourceIndex,
      main,
      supp: forecast?.supp ?? [],
      mainKey: main.join("-"),
      forecastKey: forecast?.forecastKey,
    });
  });

  if (rows.length === 0) return { session, capturedRows: 0, rejectedRows };

  const run: PredictionCaptureRunSnapshot = {
    id: runId,
    capturedAt: now,
    action: options.action,
    setupSnapshot: cloneSnapshot(options.setupSnapshot),
    latestDrawDate: options.latestDrawDate,
    latestDrawFingerprint: options.latestDrawFingerprint,
    windowLabel: options.windowLabel,
    windowDrawCount: Math.max(0, Math.trunc(options.windowDrawCount)),
    displayedCandidateCount: rows.length,
    rowIds: rows.map((row) => row.id),
  };

  return {
    session: {
      ...session,
      updatedAt: now,
      runs: [...session.runs, run],
      rows: [...session.rows, ...rows],
    },
    capturedRows: rows.length,
    rejectedRows,
    runId,
  };
};

export const summarizePredictionCaptureGames = (
  session: PredictionCaptureSession | null | undefined,
): PredictionCaptureGameSummary[] => {
  if (!session) return [];
  const summaries = new Map<string, PredictionCaptureGameSummary>();
  session.rows.forEach((row) => {
    const current = summaries.get(row.mainKey) ?? {
      mainKey: row.mainKey,
      numbers: row.main.slice(),
      capturedOccurrenceCount: 0,
      rowIds: [],
      runIds: [],
      analyticalForecasts: [],
    };
    current.capturedOccurrenceCount += 1;
    current.rowIds.push(row.id);
    if (!current.runIds.includes(row.runId)) current.runIds.push(row.runId);
    if (row.forecastKey && row.supp.length === 2 && !current.analyticalForecasts.some((item) => item.forecastKey === row.forecastKey)) {
      current.analyticalForecasts.push({ main: row.main.slice(), supp: row.supp.slice(), forecastKey: row.forecastKey });
    }
    summaries.set(row.mainKey, current);
  });
  return [...summaries.values()].sort((left, right) => (
    left.numbers[0] - right.numbers[0] || left.mainKey.localeCompare(right.mainKey)
  ));
};

export const parsePredictionCaptureRows = (text: string): ParsedPredictionCaptureRow[] => (
  text
    .split(/\r?\n/)
    .map((raw, index): ParsedPredictionCaptureRow | null => {
      if (!raw.trim()) return null;
      const numbers = (raw.match(/-?\d+/g) ?? []).map(Number);
      const lineNumber = index + 1;
      if (numbers.some((number) => !validLotteryNumber(number))) {
        return { lineNumber, raw, numbers, game: null, forecast: null, error: "Numbers must be unique values from 1 to 45." };
      }
      if (uniqueNumbers(numbers).length !== numbers.length) {
        return { lineNumber, raw, numbers, game: null, forecast: null, error: "Duplicate values are not valid within a played line." };
      }
      if (numbers.length !== 6 && numbers.length !== 8) {
        return { lineNumber, raw, numbers, game: null, forecast: null, error: "Enter exactly 6 played numbers, or 8 values when preserving a 6+2 analytical forecast." };
      }
      const game = normalizePredictionCaptureGame(numbers.slice(0, 6));
      const forecast = numbers.length === 8
        ? normalizePredictionCaptureForecast(numbers.slice(0, 6), numbers.slice(6, 8))
        : null;
      if (!game || (numbers.length === 8 && !forecast)) {
        return { lineNumber, raw, numbers, game: null, forecast: null, error: "The row does not contain a valid six-number game with distinct supplementary values." };
      }
      return {
        lineNumber,
        raw,
        numbers,
        game,
        forecast: forecast ? { main: forecast.main, supp: forecast.supp } : null,
      };
    })
    .filter((row): row is ParsedPredictionCaptureRow => row !== null)
);

interface BuildPredictionCaptureBatchOptions {
  session?: PredictionCaptureSession | null;
  selectedCapturedGameKeys?: readonly string[];
  externalRows?: readonly ParsedPredictionCaptureRow[];
  quantityByGameKey?: Readonly<Record<string, number>>;
  includeAnalyticalForecasts?: boolean;
  externalInputSource?: "pasted" | "manual";
  now?: string;
  unitCostCents?: number;
}

export const buildPredictionCaptureBatch = (
  options: BuildPredictionCaptureBatchOptions,
): PredictionCaptureBatch => {
  const now = options.now ?? new Date().toISOString();
  const session = options.session ?? null;
  const selectedKeys = new Set(options.selectedCapturedGameKeys ?? []);
  const sessionSummaries = summarizePredictionCaptureGames(session);
  const sessionSummaryByKey = new Map(sessionSummaries.map((summary) => [summary.mainKey, summary]));
  const gameAccumulator = new Map<string, {
    numbers: number[];
    quantity: number;
    inputSources: Set<PredictionCaptureInputSource>;
  }>();
  const requestedForecastKeys = new Set<string>();
  const externalForecasts = new Map<string, { main: number[]; supp: number[] }>();

  const addGame = (numbers: number[], source: PredictionCaptureInputSource, quantity: number) => {
    const key = predictionCaptureMainKey(numbers);
    if (!key) return;
    const current = gameAccumulator.get(key) ?? {
      numbers: normalizePredictionCaptureGame(numbers) as number[],
      quantity: 0,
      inputSources: new Set<PredictionCaptureInputSource>(),
    };
    current.quantity += Math.max(1, Math.trunc(quantity));
    current.inputSources.add(source);
    gameAccumulator.set(key, current);
  };

  selectedKeys.forEach((key) => {
    const summary = sessionSummaryByKey.get(key);
    if (!summary) return;
    addGame(summary.numbers, "captured", options.quantityByGameKey?.[key] ?? 1);
    summary.analyticalForecasts.forEach((forecast) => requestedForecastKeys.add(forecast.forecastKey));
  });

  (options.externalRows ?? []).forEach((row) => {
    if (!row.game || row.error) return;
    const key = predictionCaptureMainKey(row.game);
    if (!key) return;
    addGame(row.game, options.externalInputSource ?? "pasted", 1);
    if (row.forecast) {
      const forecast = normalizePredictionCaptureForecast(row.forecast.main, row.forecast.supp);
      if (forecast) {
        requestedForecastKeys.add(forecast.forecastKey);
        externalForecasts.set(forecast.forecastKey, { main: forecast.main, supp: forecast.supp });
      }
    }
  });

  const games: PredictionCapturePlayedGame[] = [...gameAccumulator.entries()].map(([mainKey, value], index): PredictionCapturePlayedGame => {
    const matched = sessionSummaryByKey.get(mainKey);
    return {
      id: `capture-game-${index + 1}-${mainKey}`,
      numbers: value.numbers,
      mainKey,
      quantity: value.quantity,
      inputSources: [...value.inputSources],
      provenance: matched
        ? { status: "matched", rowIds: matched.rowIds.slice(), runIds: matched.runIds.slice() }
        : { status: "external", rowIds: [], runIds: [] },
    };
  }).sort((left, right) => left.mainKey.localeCompare(right.mainKey));

  const analyticalForecasts: PredictionCaptureAnalyticalForecast[] = [];
  if (options.includeAnalyticalForecasts !== false) {
    requestedForecastKeys.forEach((forecastKey) => {
      const matchingRows = session?.rows.filter((row) => row.forecastKey === forecastKey) ?? [];
      const source = matchingRows[0]
        ? { main: matchingRows[0].main, supp: matchingRows[0].supp }
        : externalForecasts.get(forecastKey);
      if (!source) return;
      analyticalForecasts.push({
        id: `capture-forecast-${analyticalForecasts.length + 1}`,
        main: source.main.slice(),
        supp: source.supp.slice(),
        forecastKey,
        provenance: matchingRows.length
          ? {
            status: "matched",
            rowIds: matchingRows.map((row) => row.id),
            runIds: Array.from(new Set(matchingRows.map((row) => row.runId))),
          }
          : { status: "external", rowIds: [], runIds: [] },
      });
    });
  }

  const selectedRunIds = new Set(games.flatMap((game) => game.provenance.runIds));
  analyticalForecasts.forEach((forecast) => forecast.provenance.runIds.forEach((runId) => selectedRunIds.add(runId)));
  const runSnapshots = (session?.runs ?? [])
    .filter((run) => selectedRunIds.has(run.id))
    .map((run) => ({ ...run, setupSnapshot: cloneSnapshot(run.setupSnapshot), rowIds: run.rowIds.slice() }));
  const purchasedLines = games.reduce((sum, game) => sum + game.quantity, 0);

  return {
    version: 1,
    id: createId("prediction-batch", now),
    sessionId: session?.id,
    savedAt: now,
    unitCostCents: Math.max(0, Math.trunc(options.unitCostCents ?? PREDICTION_CAPTURE_PLAY_COST_CENTS)),
    games,
    analyticalForecasts,
    runSnapshots,
    sourceSummary: {
      capturedGames: games.filter((game) => game.provenance.status === "matched").length,
      externalGames: games.filter((game) => game.provenance.status === "external").length,
      distinctGames: games.length,
      purchasedLines,
    },
  };
};

export const scorePredictionCaptureBatch = (
  batch: PredictionCaptureBatch,
  targetDraw: Draw,
): PredictionCaptureBatchScore | null => {
  const drawnMainValues = normalizePredictionCaptureGame(targetDraw.main);
  const drawnSuppValues = targetDraw.supp.filter(validLotteryNumber);
  if (!drawnMainValues || uniqueNumbers(drawnSuppValues).length !== 2) return null;

  const drawnMain = new Set(drawnMainValues);
  const drawnSupp = new Set(uniqueNumbers(drawnSuppValues));
  const gameScores = batch.games.map((game): PredictionCaptureGameScore => {
    const hits = computeWeekdayWindfallPrizeHits(game.numbers, drawnMain, drawnSupp);
    return {
      gameId: game.id,
      numbers: game.numbers.slice(),
      quantity: game.quantity,
      mainHits: hits.mainHits,
      suppHits: hits.suppHits,
      division: computeWeekdayWindfallPrizeDivision(game.numbers, [], drawnMain, drawnSupp),
    };
  });
  const forecastScores = batch.analyticalForecasts.map((forecast): PredictionCaptureForecastScore => {
    const hits = computeWeekdayWindfallPrizeHits(forecast.main, drawnMain, drawnSupp, forecast.supp);
    return {
      forecastId: forecast.id,
      main: forecast.main.slice(),
      supp: forecast.supp.slice(),
      selectedMainHits: forecast.main.filter((number) => drawnMain.has(number)).length,
      selectedSuppHits: forecast.supp.filter((number) => drawnSupp.has(number)).length,
      drawMainHits: hits.mainHits,
      drawSuppHits: hits.suppHits,
      division: computeWeekdayWindfallPrizeDivision(forecast.main, forecast.supp, drawnMain, drawnSupp),
    };
  });
  const uniquePlayedNumbers = uniqueNumbers(batch.games.flatMap((game) => game.numbers)).sort((left, right) => left - right);
  const coveredMainNumbers = drawnMainValues.filter((number) => uniquePlayedNumbers.includes(number));
  const coveredSuppNumbers = [...drawnSupp].filter((number) => uniquePlayedNumbers.includes(number));
  const coveredDrawNumbers = [...coveredMainNumbers, ...coveredSuppNumbers].sort((left, right) => left - right);
  const bestRank = gameScores.reduce(
    (rank, game) => Math.min(rank, rankWeekdayWindfallPrizeDivision(game.division)),
    rankWeekdayWindfallPrizeDivision("—"),
  );
  const bestDivision = gameScores.find((game) => rankWeekdayWindfallPrizeDivision(game.division) === bestRank)?.division ?? "—";

  return {
    targetDate: targetDraw.date,
    gameScores,
    forecastScores,
    distinctGameCount: batch.games.length,
    purchasedLineCount: batch.games.reduce((sum, game) => sum + game.quantity, 0),
    totalCostCents: batch.games.reduce((sum, game) => sum + game.quantity, 0) * batch.unitCostCents,
    uniquePlayedNumbers,
    coveredMainNumbers,
    coveredSuppNumbers,
    coveredDrawNumbers,
    allEightSpreadCovered: coveredDrawNumbers.length === 8,
    bestDivision,
    bestGameIds: gameScores.filter((game) => game.division === bestDivision && bestDivision !== "—").map((game) => game.gameId),
  };
};

export const isPredictionCaptureSession = (value: unknown): value is PredictionCaptureSession => {
  if (!value || typeof value !== "object") return false;
  const session = value as PredictionCaptureSession;
  return session.format === PREDICTION_CAPTURE_FORMAT
    && session.version === PREDICTION_CAPTURE_VERSION
    && typeof session.id === "string"
    && typeof session.startedAt === "string"
    && typeof session.updatedAt === "string"
    && (session.status === "active" || session.status === "ended")
    && Array.isArray(session.runs)
    && Array.isArray(session.rows);
};

export const isPredictionCaptureBatch = (value: unknown): value is PredictionCaptureBatch => {
  if (!value || typeof value !== "object") return false;
  const batch = value as PredictionCaptureBatch;
  return batch.version === 1
    && typeof batch.id === "string"
    && typeof batch.savedAt === "string"
    && Number.isInteger(batch.unitCostCents)
    && batch.unitCostCents >= 0
    && Array.isArray(batch.games)
    && batch.games.every((game) => (
      !!game
      && typeof game === "object"
      && typeof game.id === "string"
      && predictionCaptureMainKey(game.numbers) === game.mainKey
      && Number.isInteger(game.quantity)
      && game.quantity >= 1
    ))
    && Array.isArray(batch.analyticalForecasts)
    && Array.isArray(batch.runSnapshots)
    && !!batch.sourceSummary
    && typeof batch.sourceSummary === "object";
};

export const clonePredictionCaptureBatch = (
  batch: PredictionCaptureBatch | null | undefined,
): PredictionCaptureBatch | undefined => {
  if (!batch || !isPredictionCaptureBatch(batch)) return undefined;
  return JSON.parse(JSON.stringify(batch)) as PredictionCaptureBatch;
};

export const serializePredictionCaptureSession = (session: PredictionCaptureSession): string => (
  JSON.stringify(session, null, 2)
);

export const parsePredictionCaptureSession = (raw: string): PredictionCaptureSession => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  if (!isPredictionCaptureSession(parsed)) {
    throw new Error("This JSON file is not a Windfall Prediction Capture session.");
  }
  return parsed;
};
